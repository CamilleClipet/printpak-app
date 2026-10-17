export interface PrinterTransport {
  readonly supported: boolean;
  connect(hooks: { onDisconnect(): void; onNotify(bytes: Uint8Array): void }): Promise<string>;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): void;
}

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
