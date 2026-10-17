import { describe, expect, it, vi } from 'vitest';
import { createPrinter } from './printJob';
import { encodeJob, rgbaToBitmap, type Darkness } from './protocol';
import type { PrinterTransport } from '../platform';

function fakeTransport() {
  const writes: Uint8Array[] = [];
  let hooks: Parameters<PrinterTransport['connect']>[0] | null = null;
  const transport: PrinterTransport = {
    supported: true,
    async connect(h) {
      hooks = h;
      return 'Fake Printer';
    },
    async write(bytes) {
      writes.push(new Uint8Array(bytes));
    },
    disconnect() {},
  };
  return {
    transport,
    writes,
    notify: (bytes: Uint8Array) => hooks?.onNotify(bytes),
    disconnect: () => hooks?.onDisconnect(),
  };
}

const bitmap = () => {
  const rgba = new Uint8ClampedArray(384 * 2 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 0;
    rgba[i + 1] = 0;
    rgba[i + 2] = 0;
    rgba[i + 3] = 255;
  }
  return rgbaToBitmap(rgba, 2);
};

const flatten = (packets: Uint8Array[]) => packets.flatMap((packet) => [...packet]);

describe('printJob', () => {
  it('writes encoded bytes and reports monotonic progress through 1', async () => {
    const fake = fakeTransport();
    const printer = createPrinter(fake.transport, { sleep: async () => {} });
    await printer.connect(() => {});
    const progress: number[] = [];
    const image = bitmap();

    await printer.sendJob(image, 2 as Darkness, (p) => progress.push(p));

    expect(flatten(fake.writes)).toEqual(flatten([...encodeJob(image, 2)] .map(({ bytes }) => bytes)));
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((p, i) => i === 0 || p >= progress[i - 1])).toBe(true);
    expect(progress.at(-1)).toBe(1);
  });

  it('waits for a resume notification before writing again', async () => {
    const fake = fakeTransport();
    let firstWrite = true;
    const transport: PrinterTransport = {
      ...fake.transport,
      async write(bytes) {
        fake.writes.push(new Uint8Array(bytes));
        if (firstWrite) {
          firstWrite = false;
          fake.notify(Uint8Array.of(0x51, 0x78, 0xae, 0, 0, 0, 0x10));
        }
      },
    };
    const printer = createPrinter(transport, { sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 1))) });
    await printer.connect(() => {});
    const job = printer.sendJob(bitmap(), 2, () => {});

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fake.writes).toHaveLength(1);
    fake.notify(Uint8Array.of(0x51, 0x78, 0xae, 0, 0, 0, 0x00));
    await job;
    expect(fake.writes.length).toBeGreaterThan(1);
  });

  it('rejects if disconnected mid-job', async () => {
    const fake = fakeTransport();
    const transport: PrinterTransport = {
      ...fake.transport,
      async write(bytes) {
        fake.writes.push(new Uint8Array(bytes));
        fake.disconnect();
      },
    };
    const printer = createPrinter(transport, { sleep: async () => {} });
    await printer.connect(() => {});

    await expect(printer.sendJob(bitmap(), 2, () => {})).rejects.toThrow('printer disconnected');
  });

  it('rejects when sendJob is called before connect', async () => {
    const printer = createPrinter(fakeTransport().transport, { sleep: vi.fn(async () => {}) });
    await expect(printer.sendJob(bitmap(), 2, () => {})).rejects.toThrow('printer disconnected');
  });
});
