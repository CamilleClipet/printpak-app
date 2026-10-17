import { create } from 'zustand';
import { ChooserCancelled, keepAwake, lastPrinterName, PRINTER_SCAN_MS, type PrinterDevice, type PrinterDeviceSelector, type PrinterScan } from '../platform';
import { supported as bluetoothSupported, connect, disconnect, reconnect as reconnectPrinter, sendJob } from '../printer/printJob';
import { PRINT_WIDTH, rgbaToBitmap, type Bitmap, type Darkness } from '../printer/protocol';

export type PrinterStatus = 'unsupported' | 'disconnected' | 'connecting' | 'scanning' | 'connected' | 'printing';

interface PrinterStore {
  status: PrinterStatus;
  name: string | null;
  lastDeviceName: string | null;
  /** 0..1 across the whole job (all frames). */
  progress: number;
  /** Last user-facing message: an error, or "Printed." */
  message: string | null;
  error: boolean;
  foundPrinters: PrinterDevice[];
  scanActive: boolean;
  connect: () => Promise<void>;
  reconnect: () => Promise<void>;
  choosePrinter: (device: PrinterDevice) => void;
  cancelScan: () => void;
  disconnect: () => void;
  print: (canvases: HTMLCanvasElement[], darkness: Darkness) => Promise<void>;
}

function toBitmap(c: HTMLCanvasElement): Bitmap {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas unreadable');
  return rgbaToBitmap(ctx.getImageData(0, 0, PRINT_WIDTH, c.height).data, c.height);
}

export const usePrinterStore = create<PrinterStore>((set, get) => ({
  status: bluetoothSupported ? 'disconnected' : 'unsupported',
  name: null,
  lastDeviceName: lastPrinterName(),
  progress: 0,
  message: null,
  error: false,
  foundPrinters: [],
  scanActive: false,

  connect: async () => {
    await connectToPrinter(false, get, set, chooseDevice);
  },

  reconnect: async () => {
    await connectToPrinter(true, get, set, chooseDevice);
  },

  choosePrinter: (device) => activeChooser?.choose(device),

  cancelScan: () => activeChooser?.cancel(),

  disconnect: () => disconnect(),

  print: async (canvases, darkness) => {
    if (get().status !== 'connected' || !canvases.length) return;
    if (canvases.some((c) => c.width !== PRINT_WIDTH)) return;
    set({ status: 'printing', progress: 0, message: null, error: false });
    await keepAwake(true);
    try {
      for (let i = 0; i < canvases.length; i++) {
        await sendJob(toBitmap(canvases[i]), darkness, (p) =>
          set({ progress: (i + p) / canvases.length }));
      }
      set({ message: 'Printed.' });
    } catch (e) {
      set({ message: `Printing stopped: ${e instanceof Error ? e.message : String(e)}`, error: true });
    } finally {
      await keepAwake(false);
    }
    // A disconnect mid-job already moved status to 'disconnected'.
    if (get().status === 'printing') set({ status: 'connected' });
  },
}));

async function connectToPrinter(
  shouldReconnect: boolean,
  get: () => PrinterStore,
  set: (state: Partial<PrinterStore>) => void,
  selectDevice: PrinterDeviceSelector,
): Promise<void> {
  if (get().status !== 'disconnected') return;
  set({ status: 'connecting', message: null, error: false, foundPrinters: [], scanActive: false });
  try {
    const onDisconnect = () => set({ status: 'disconnected', name: null });
    const name = shouldReconnect
      ? await reconnectPrinter(onDisconnect, selectDevice)
      : await connect(onDisconnect, false, selectDevice);
    set({ status: 'connected', name, lastDeviceName: lastPrinterName() ?? name });
  } catch (e) {
    const cancelled = e instanceof ChooserCancelled;
    set({
      status: 'disconnected',
      foundPrinters: [],
      scanActive: false,
      message: cancelled ? null : e instanceof Error ? e.message : String(e),
      error: !cancelled,
    });
  }
}

const NO_PRINTERS = 'No printer found. Make sure it\'s switched on, has paper, and isn\'t connected to another app or phone.';

interface ActiveChooser {
  choose(device: PrinterDevice): void;
  cancel(): void;
}

let activeChooser: ActiveChooser | null = null;

function chooseDevice(
  connected: PrinterDevice[],
  beginScan: (onDevice: (device: PrinterDevice) => void) => Promise<PrinterScan>,
): Promise<PrinterDevice> {
  return new Promise((resolve, reject) => {
    let scan: PrinterScan | null = null;
    let settled = false;
    const devices = new Map(connected.map((device) => [device.deviceId, device]));
    let timeout: ReturnType<typeof setTimeout>;
    const cleanup = async () => {
      clearTimeout(timeout);
      activeChooser = null;
      try {
        await scan?.stop();
      } catch (error) {
        console.warn('Unable to stop printer scan', error);
      }
    };
    const settle = async (device?: PrinterDevice, error?: Error) => {
      if (settled) return;
      settled = true;
      await cleanup();
      usePrinterStore.setState({ status: device ? 'connecting' : 'disconnected', foundPrinters: [] });
      if (device) resolve(device);
      else reject(error ?? new ChooserCancelled());
    };
    const onDevice = (device: PrinterDevice) => {
      devices.set(device.deviceId, device);
      usePrinterStore.setState({ foundPrinters: [...devices.values()] });
    };
    activeChooser = {
      choose: (device) => { void settle(device); },
      cancel: () => { void settle(undefined, new ChooserCancelled()); },
    };
    usePrinterStore.setState({ status: 'scanning', foundPrinters: [...devices.values()], scanActive: true, message: null, error: false });
    void beginScan(onDevice).then((handle) => {
      scan = handle;
      if (settled) void handle.stop();
    }).catch((error: unknown) => {
      void settle(undefined, error instanceof Error ? error : new Error(String(error)));
    });
    timeout = setTimeout(() => {
      if (!devices.size) void settle(undefined, new Error(NO_PRINTERS));
      else {
        usePrinterStore.setState({ scanActive: false });
        void scan?.stop().catch((error: unknown) => console.warn('Unable to stop printer scan', error));
      }
    }, PRINTER_SCAN_MS);
  });
}
