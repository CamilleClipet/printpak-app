import { Capacitor } from '@capacitor/core';
import { printerTransport as webPrinterTransport } from './web/bluetooth';
import { printerTransport as nativePrinterTransport } from './native/bluetooth';

export const isNativePlatform = Capacitor.isNativePlatform();
export const printerTransport = isNativePlatform ? nativePrinterTransport : webPrinterTransport;
export const lastPrinterName = () => printerTransport.lastDeviceName?.() ?? null;

export async function keepAwake(on: boolean): Promise<void> {
  if (!isNativePlatform) return;
  try {
    const { KeepAwake } = await import('@capacitor-community/keep-awake');
    if (on) await KeepAwake.keepAwake();
    else await KeepAwake.allowSleep();
  } catch (e) {
    console.warn('Unable to update keep-awake state', e);
  }
}

export { storage } from './web/storage';
export { saveFile, shareFile } from './web/files';
export { ChooserCancelled } from './types';
export { PRINTER_SCAN_MS } from './types';
export type { KeyValueStorage, PrinterDevice, PrinterDeviceSelector, PrinterScan, PrinterTransport, SaveFile, ShareFile, ShareResult } from './types';
