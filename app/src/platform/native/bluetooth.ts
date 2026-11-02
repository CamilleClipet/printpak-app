import { Capacitor } from '@capacitor/core';
import { BleClient, ConnectionPriority } from '@capacitor-community/bluetooth-le';
import { ChooserCancelled, PRINTER_SCAN_MS, type PrinterDevice, type PrinterDeviceSelector, type PrinterScan, type PrinterTransport } from '../types';
import { storage } from '../web/storage';

const uuid = (s: string) => `0000${s}-0000-1000-8000-00805f9b34fb`;
const SERVICE_ADV = uuid('af30');
const SERVICE = uuid('ae30');
const TX = uuid('ae01');
const RX = uuid('ae02');
const LAST_DEVICE_KEY = 'printer.lastDevice';
export const SCAN_MS = PRINTER_SCAN_MS;
const CONNECT_TIMEOUT_MS = 8000;

interface SavedDevice {
  deviceId: string;
  name: string;
}

let initialization: Promise<void> | null = null;
let activeDeviceId: string | null = null;
let activeDisconnect: (() => void) | null = null;

function initialize(): Promise<void> {
  if (!initialization) {
    initialization = BleClient.initialize({ androidNeverForLocation: true }).catch((error: unknown) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; code?: unknown };
    return [candidate.message, candidate.code].filter(Boolean).join(' ');
  }
  return String(error);
}

function isPermissionError(error: unknown): boolean {
  return /permission|not authorized|unauthori[sz]ed|denied|security exception/i.test(errorText(error));
}

function connectionError(step: string, error: unknown): Error {
  if (isPermissionError(error)) {
    return new Error('Bluetooth permission was denied. Allow Bluetooth access in Settings and try again.', { cause: error });
  }
  const detail = errorText(error) || 'Unknown Bluetooth error';
  return new Error(`Connection failed while ${step}: ${detail}`, { cause: error });
}

async function connectDevice(
  device: PrinterDevice,
  hooks: Parameters<PrinterTransport['connect']>[0],
): Promise<string> {
  let step = 'connecting';
  activeDeviceId = device.deviceId;
  activeDisconnect = hooks.onDisconnect;
  try {
    await BleClient.connect(device.deviceId, (disconnectedId) => {
      if (activeDeviceId !== disconnectedId) return;
      activeDeviceId = null;
      activeDisconnect = null;
      hooks.onDisconnect();
    }, { timeout: CONNECT_TIMEOUT_MS });

    if (Capacitor.getPlatform() === 'android') {
      // A nonblank row is 48 data bytes + 8 packet bytes (56 total), above the
      // default 20-byte ATT payload. The plugin requests MTU 512 after discovery;
      // getMtu logs the negotiated MTU (maximum ATT write payload is MTU - 3).
      try {
        await BleClient.requestConnectionPriority(device.deviceId, ConnectionPriority.CONNECTION_PRIORITY_HIGH);
      } catch (error) {
        console.warn('Unable to request high BLE connection priority', error);
      }
      try {
        const mtu = await BleClient.getMtu(device.deviceId);
        console.info(`Printer BLE MTU ${mtu} (max write ${mtu - 3} bytes)`);
      } catch (error) {
        console.info('Printer BLE MTU unavailable', error);
      }
    }

    step = 'starting status notifications';
    try {
      await BleClient.startNotifications(device.deviceId, SERVICE, RX, (value) => {
        const bytes = new Uint8Array(value.byteLength);
        bytes.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        hooks.onNotify(bytes);
      });
    } catch (error) {
      console.warn('Printer notifications unavailable', error);
    }

    const name = device.name || 'Printer';
    storage.set<SavedDevice>(LAST_DEVICE_KEY, { deviceId: device.deviceId, name });
    return name;
  } catch (error) {
    if (activeDeviceId === device.deviceId) {
      activeDeviceId = null;
      activeDisconnect = null;
    }
    throw connectionError(step, error);
  }
}

async function connectPrinter(
  hooks: Parameters<PrinterTransport['connect']>[0],
  savedDevice?: SavedDevice,
  selectDevice?: PrinterDeviceSelector,
): Promise<string> {
  let step = 'initializing Bluetooth';
  let reconnectFailed = false;
  try {
    await initialize();
    step = 'checking Bluetooth';
    if (!(await BleClient.isEnabled())) {
      if (Capacitor.getPlatform() === 'android') {
        try {
          await BleClient.requestEnable();
        } catch (error) {
          if (isPermissionError(error)) throw error;
        }
      }
      if (!(await BleClient.isEnabled())) {
        throw new Error('Bluetooth is off. Turn it on and try again.');
      }
    }

    if (savedDevice) {
      step = 'reconnecting to the last printer';
      try {
        return await connectDevice(savedDevice, hooks);
      } catch (error) {
        reconnectFailed = true;
        console.warn('Reconnect failed; showing printer chooser instead', error);
      }
    }
    step = 'checking for connected printers';
    const connected = await BleClient.getConnectedDevices([SERVICE, SERVICE_ADV]);
    if (connected.length === 1 && !reconnectFailed) return await connectDevice({ ...connected[0], name: connected[0].name || 'Printer' }, hooks);
    step = 'scanning for printers';
    const connectedPrinters = connected.map((device) => ({ deviceId: device.deviceId, name: device.name || 'Printer' }));
    const device = selectDevice
      ? await selectDevice(connectedPrinters, beginScan)
      : await scanForPrinter(connectedPrinters);
    return await connectDevice(device, hooks);
  } catch (error) {
    const detail = errorText(error);
    if (/cancel(l)?ed|cancel(l)?ation/i.test(detail)) {
      throw new ChooserCancelled();
    }
    if (/No printer found\./i.test(detail)) throw error;
    if (error instanceof Error && error.message === 'Bluetooth is off. Turn it on and try again.') throw error;
    if (error instanceof Error && error.message.startsWith('Connection failed while ')) throw error;
    throw connectionError(step, error);
  }
}

async function scanForPrinter(connected: PrinterDevice[]): Promise<PrinterDevice> {
  return new Promise<PrinterDevice>((resolve, reject) => {
    const devices = new Map(connected.map((device) => [device.deviceId, device]));
    let scan: PrinterScan | null = null;
    let settled = false;
    const timer = setTimeout(() => { void finish(); }, SCAN_MS);
    const finish = async (device?: PrinterDevice) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        await scan?.stop();
      } finally {
        if (device) resolve(device);
        else if (devices.size) resolve(devices.values().next().value!);
        else reject(new Error('No printer found. Make sure it\'s switched on, has paper, and isn\'t connected to another app or phone.'));
      }
    };
    void beginScan((device) => devices.set(device.deviceId, device))
      .then((started) => {
        scan = started;
        if (settled) void started.stop().catch((error: unknown) => console.warn('Unable to stop printer scan', error));
      })
      .catch((error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function beginScan(onDevice: (device: PrinterDevice) => void): Promise<PrinterScan> {
  let stopped = false;
  await BleClient.requestLEScan({ services: [SERVICE_ADV] }, ({ device, localName, rssi }) => {
    onDevice({ deviceId: device.deviceId, name: localName || device.name || 'Printer', rssi });
  });
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await BleClient.stopLEScan();
  };
  return { stop };
}

export const printerTransport: PrinterTransport = {
  supported: true,

  connect(hooks, selectDevice) {
    return connectPrinter(hooks, undefined, selectDevice);
  },

  async reconnect(hooks, selectDevice) {
    const savedDevice = storage.get<SavedDevice>(LAST_DEVICE_KEY);
    if (savedDevice?.deviceId) {
      return connectPrinter(hooks, savedDevice, selectDevice);
    }
    throw new Error('No saved printer to reconnect to.');
  },

  lastDeviceName() {
    return storage.get<SavedDevice>(LAST_DEVICE_KEY)?.name ?? null;
  },

  async write(bytes) {
    const deviceId = activeDeviceId;
    if (!deviceId) throw new Error('printer disconnected');
    const copy = new Uint8Array(bytes);
    await BleClient.writeWithoutResponse(deviceId, SERVICE, TX, new DataView(copy.buffer));
  },

  disconnect() {
    const deviceId = activeDeviceId;
    const notifyDisconnect = activeDisconnect;
    activeDeviceId = null;
    activeDisconnect = null;
    if (deviceId) {
      notifyDisconnect?.();
      void BleClient.disconnect(deviceId).catch((error: unknown) => {
        console.warn('Unable to disconnect printer', error);
      });
    }
  },
};
