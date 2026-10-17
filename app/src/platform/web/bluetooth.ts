import { ChooserCancelled, type PrinterTransport } from '../types';

const uuid = (s: string) => `0000${s}-0000-1000-8000-00805f9b34fb`;
const SERVICE_ADV = uuid('af30');
const SERVICE = uuid('ae30');
const TX = uuid('ae01');
const RX = uuid('ae02');

let device: BluetoothDevice | null = null;
let tx: BluetoothRemoteGATTCharacteristic | null = null;

export const printerTransport: PrinterTransport = {
  supported: typeof navigator !== 'undefined' && !!navigator.bluetooth,

  async connect({ onDisconnect, onNotify }) {
    let step = 'choosing the printer';
    try {
      const d = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'X6' }, { services: [SERVICE_ADV] }],
        optionalServices: [SERVICE, SERVICE_ADV],
      });
      d.addEventListener('gattserverdisconnected', () => {
        device = null;
        tx = null;
        onDisconnect();
      });
      step = 'connecting';
      if (!d.gatt) throw new Error('no GATT server');
      const server = await d.gatt.connect();
      step = 'finding the print service';
      const svc = await server.getPrimaryService(SERVICE);
      step = 'finding the write channel';
      const write = await svc.getCharacteristic(TX);
      step = 'finding the status channel';
      const rx = await svc.getCharacteristic(RX);
      try {
        await rx.startNotifications();
        rx.addEventListener('characteristicvaluechanged', (ev) => {
          const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
          if (!value) return;
          const bytes = new Uint8Array(value.byteLength);
          bytes.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
          onNotify(bytes);
        });
      } catch (e) {
        console.warn('Printer notifications unavailable', e);
      }
      device = d;
      tx = write;
      return d.name || 'Printer';
    } catch (e) {
      tx = null;
      device = null;
      if (e instanceof DOMException && e.name === 'NotFoundError' && step === 'choosing the printer') {
        throw new ChooserCancelled();
      }
      const detail = e instanceof Error ? e.message || e.name : String(e);
      throw new Error(`Connection failed while ${step}: ${detail}`, { cause: e });
    }
  },

  async write(bytes) {
    const w = tx;
    if (!w) throw new Error('printer disconnected');
    const buf = new Uint8Array(bytes);
    if (w.writeValueWithoutResponse) await w.writeValueWithoutResponse(buf);
    else await w.writeValue(buf);
  },

  disconnect() {
    device?.gatt?.disconnect();
  },

};
