import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChooserCancelled, type PrinterDevice, type PrinterDeviceSelector } from '../types';

const ble = vi.hoisted(() => ({
  initialize: vi.fn(async () => {}),
  isEnabled: vi.fn(async () => true),
  requestEnable: vi.fn(async () => {}),
  getConnectedDevices: vi.fn(async () => [] as { deviceId: string; name?: string }[]),
  requestLEScan: vi.fn(async (_options: unknown, callback: (result: { device: { deviceId: string; name?: string }; localName?: string; rssi?: number }) => void) => {
    ble.scanCallback = callback;
  }),
  stopLEScan: vi.fn(async () => {}),
  scanCallback: null as ((result: { device: { deviceId: string; name?: string }; localName?: string; rssi?: number }) => void) | null,
  connect: vi.fn(async (_deviceId: string, _onDisconnect?: (deviceId: string) => void, _options?: { timeout?: number }) => {}),
  requestConnectionPriority: vi.fn(async () => {}),
  getMtu: vi.fn(async () => 185),
  startNotifications: vi.fn(async (_deviceId: string, _service: string, _characteristic: string, _callback: (value: DataView) => void) => {}),
  writeWithoutResponse: vi.fn(async (_deviceId: string, _service: string, _characteristic: string, _value: DataView) => {}),
  disconnect: vi.fn(async () => {}),
}));

vi.mock('@capacitor-community/bluetooth-le', () => ({
  BleClient: ble,
  ConnectionPriority: { CONNECTION_PRIORITY_HIGH: 1 },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
}));

import { printerTransport } from './bluetooth';

const SERVICE_ADV = '0000af30-0000-1000-8000-00805f9b34fb';
const SERVICE = '0000ae30-0000-1000-8000-00805f9b34fb';
const TX = '0000ae01-0000-1000-8000-00805f9b34fb';
const RX = '0000ae02-0000-1000-8000-00805f9b34fb';

describe('native Bluetooth printer transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    ble.isEnabled.mockResolvedValue(true);
    ble.getConnectedDevices.mockResolvedValue([]);
    ble.requestLEScan.mockImplementation(async (_options: unknown, callback) => { ble.scanCallback = callback; });
  });

  it('initializes, scans, connects, and starts notifications in order', async () => {
    const order: string[] = [];
    ble.initialize.mockImplementation(async () => { order.push('initialize'); });
    ble.requestLEScan.mockImplementation(async (_options: unknown, callback) => {
      order.push('scan');
      ble.scanCallback = callback;
      callback({ device: { deviceId: 'printer-id' }, localName: 'Cat Printer', rssi: -48 });
    });
    ble.connect.mockImplementation(async () => { order.push('connect'); });
    ble.startNotifications.mockImplementation(async () => { order.push('startNotifications'); });
    const onNotify = vi.fn();
    const select = vi.fn(async (_connected, scan) => {
      const handle = await scan(() => {});
      await handle.stop();
      return { deviceId: 'printer-id', name: 'Cat Printer' };
    });

    await expect(printerTransport.connect({ onDisconnect: vi.fn(), onNotify }, select)).resolves.toBe('Cat Printer');

    expect(order).toEqual(['initialize', 'scan', 'connect', 'startNotifications']);
    expect(ble.requestLEScan).toHaveBeenCalledWith({ services: [SERVICE_ADV] }, expect.any(Function));
    expect(ble.connect).toHaveBeenCalledWith('printer-id', expect.any(Function), { timeout: 8000 });
    expect(ble.startNotifications).toHaveBeenCalledWith('printer-id', SERVICE, RX, expect.any(Function));

    const callback = ble.startNotifications.mock.calls[0][3];
    const source = Uint8Array.of(0x51, 0x78, 0xae);
    callback(new DataView(source.buffer));
    expect(onNotify).toHaveBeenCalledWith(Uint8Array.of(0x51, 0x78, 0xae));
  });

  it('writes copied bytes without response to the printer TX characteristic', async () => {
    const select = vi.fn(async (_connected, scan) => {
      const handle = await scan(() => {});
      await handle.stop();
      return { deviceId: 'printer-id', name: 'Cat Printer' };
    });
    await printerTransport.connect({ onDisconnect: vi.fn(), onNotify: vi.fn() }, select);
    const bytes = Uint8Array.of(0x51, 0x78, 0xaa);
    await printerTransport.write(bytes);

    expect(ble.writeWithoutResponse).toHaveBeenCalledWith('printer-id', SERVICE, TX, expect.any(DataView));
    const view = ble.writeWithoutResponse.mock.calls[0][3] as DataView;
    expect([...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)]).toEqual([...bytes]);
  });

  it('translates chooser cancellation and forwards disconnects', async () => {
    const cancel = vi.fn(async (_connected, beginScan) => {
      const scan = await beginScan(() => {});
      await scan.stop();
      throw new ChooserCancelled();
    });
    await expect(printerTransport.connect({ onDisconnect: vi.fn(), onNotify: vi.fn() }, cancel)).rejects.toBeInstanceOf(ChooserCancelled);

    const onDisconnect = vi.fn();
    const select = vi.fn(async (_connected, scan) => {
      const handle = await scan(() => {});
      await handle.stop();
      return { deviceId: 'printer-id', name: 'Cat Printer' };
    });
    await printerTransport.connect({ onDisconnect, onNotify: vi.fn() }, select);
    const callback = ble.connect.mock.calls[0][1];
    callback?.('printer-id');
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('connects directly to the sole already-connected printer without scanning', async () => {
    ble.getConnectedDevices.mockResolvedValueOnce([{ deviceId: 'connected-id', name: 'Already On' }]);
    await expect(printerTransport.connect({ onDisconnect: vi.fn(), onNotify: vi.fn() })).resolves.toBe('Already On');
    expect(ble.connect).toHaveBeenCalledWith('connected-id', expect.any(Function), { timeout: 8000 });
    expect(ble.requestLEScan).not.toHaveBeenCalled();
    expect(ble.getConnectedDevices).toHaveBeenCalledWith([SERVICE, SERVICE_ADV]);
  });

  it('passes advertised printer data to the chooser and connects the selected result', async () => {
    vi.useFakeTimers();
    try {
      const select = vi.fn<PrinterDeviceSelector>(async (connected, beginScan) => {
        expect(connected).toEqual([]);
        const devices = new Map<string, PrinterDevice>();
        const scan = await beginScan((device) => devices.set(device.deviceId, device));
        ble.scanCallback?.({ device: { deviceId: 'scan-id', name: 'Printer' }, localName: 'Cat Printer', rssi: -42 });
        ble.scanCallback?.({ device: { deviceId: 'scan-id', name: 'Printer' }, localName: 'Cat Printer', rssi: -40 });
        expect([...devices.values()]).toEqual([{ deviceId: 'scan-id', name: 'Cat Printer', rssi: -40 }]);
        await scan.stop();
        return devices.get('scan-id')!;
      });
      await expect(printerTransport.connect({ onDisconnect: vi.fn(), onNotify: vi.fn() }, select)).resolves.toBe('Cat Printer');
      expect(ble.requestLEScan).toHaveBeenCalledOnce();
      expect(ble.stopLEScan).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('errors after six seconds when a native scan finds nothing', async () => {
    vi.useFakeTimers();
    try {
      const result = printerTransport.connect({ onDisconnect: vi.fn(), onNotify: vi.fn() });
      const rejection = expect(result).rejects.toThrow('No printer found.');
      await vi.waitFor(() => expect(ble.requestLEScan).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(6000);
      await rejection;
      expect(ble.stopLEScan).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
