export interface PrinterTransport {
  readonly supported: boolean;
  connect(hooks: { onDisconnect(): void; onNotify(bytes: Uint8Array): void }, selectDevice?: PrinterDeviceSelector): Promise<string>;
  reconnect?(hooks: { onDisconnect(): void; onNotify(bytes: Uint8Array): void }, selectDevice?: PrinterDeviceSelector): Promise<string>;
  lastDeviceName?(): string | null;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): void;
}

export interface PrinterDevice {
  deviceId: string;
  name: string;
  rssi?: number;
}

export interface PrinterScan {
  stop(): Promise<void>;
}

export const PRINTER_SCAN_MS = 6000;

export type PrinterDeviceSelector = (
  connected: PrinterDevice[],
  scan: (onDevice: (device: PrinterDevice) => void) => Promise<PrinterScan>,
) => Promise<PrinterDevice>;

export class ChooserCancelled extends Error {
  constructor() {
    super('Printer chooser cancelled');
    this.name = 'ChooserCancelled';
  }
}

export interface KeyValueStorage {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';
export type SaveFile = (blob: Blob, name: string) => Promise<void>;
export type ShareFile = (blob: Blob, name: string) => Promise<ShareResult>;
