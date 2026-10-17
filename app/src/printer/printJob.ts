import { printerTransport } from '../platform';
import type { PrinterDeviceSelector, PrinterTransport } from '../platform';
import { encodeJob, type Bitmap, type Darkness } from './protocol';

/** Delay between writes; faster floods the printer. */
export const PACE_MS = 6;

export interface Printer {
  readonly supported: boolean;
  connect(onDisconnect: () => void, reconnect?: boolean, selectDevice?: PrinterDeviceSelector): Promise<string>;
  disconnect(): void;
  sendJob(bitmap: Bitmap, darkness: Darkness, onProgress: (progress: number) => void): Promise<void>;
}

export function createPrinter(
  transport: PrinterTransport,
  options: { sleep?: (ms: number) => Promise<void> } = {},
): Printer {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let connected = false;
  let paused = false;
  let disconnectHandler: (() => void) | null = null;

  const handleDisconnect = () => {
    connected = false;
    paused = false;
    disconnectHandler?.();
  };

  return {
    supported: transport.supported,
    async connect(onDisconnect, reconnect = false, selectDevice) {
      connected = false;
      paused = false;
      disconnectHandler = onDisconnect;
      const hooks = {
        onDisconnect: handleDisconnect,
        onNotify(bytes: Uint8Array) {
          console.debug('[printer] notification', [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' '));
          if (bytes[0] === 0x51 && bytes[1] === 0x78 && bytes[2] === 0xae) paused = bytes[6] === 0x10;
        },
      };
      const name = reconnect && transport.reconnect
        ? await transport.reconnect(hooks, selectDevice)
        : await transport.connect(hooks, selectDevice);
      connected = true;
      return name;
    },
    disconnect() {
      connected = false;
      transport.disconnect();
    },
    async sendJob(bitmap, darkness, onProgress) {
      if (!connected) throw new Error('printer disconnected');
      let last = -1;
      for (const { bytes, progress } of encodeJob(bitmap, darkness)) {
        while (paused) {
          if (!connected) throw new Error('printer disconnected');
          await sleep(20);
        }
        if (!connected) throw new Error('printer disconnected');
        await transport.write(new Uint8Array(bytes));
        if (!connected) throw new Error('printer disconnected');
        await sleep(PACE_MS);
        if (!connected) throw new Error('printer disconnected');
        const pct = Math.floor(progress * 100);
        if (pct !== last) {
          last = pct;
          onProgress(progress);
        }
      }
    },
  };
}

const defaultPrinter = createPrinter(printerTransport);
export const supported = defaultPrinter.supported;
export const connect = defaultPrinter.connect;
export const reconnect = (onDisconnect: () => void, selectDevice?: PrinterDeviceSelector) => defaultPrinter.connect(onDisconnect, true, selectDevice);
export const disconnect = defaultPrinter.disconnect;
export const sendJob = defaultPrinter.sendJob;
