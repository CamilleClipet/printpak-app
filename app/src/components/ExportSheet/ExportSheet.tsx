import { useMemo } from 'react';
import { PRINT_WIDTH, type Darkness } from '../../printer/protocol';
import type { PrinterDevice } from '../../platform';
import { useDeviceStore } from '../../state/deviceStore';
import { useExportSheetStore } from '../../state/exportSheetStore';
import { usePrinterStore } from '../../state/printerStore';
import { useToneStore } from '../../state/toneStore';
import styles from './ExportSheet.module.scss';

const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const SAVE_MSG = coarse
  ? 'Press and hold the image → Save to Photos'
  : 'Right-click the image → Save image as…';

const DARKNESS: Darkness[] = [1, 2, 3, 4];

function PrintControls({ outputs, index }: { outputs: HTMLCanvasElement[]; index: number }) {
  const status = usePrinterStore((s) => s.status);
  const name = usePrinterStore((s) => s.name);
  const lastDeviceName = usePrinterStore((s) => s.lastDeviceName);
  const progress = usePrinterStore((s) => s.progress);
  const message = usePrinterStore((s) => s.message);
  const error = usePrinterStore((s) => s.error);
  const foundPrinters = usePrinterStore((s) => s.foundPrinters);
  const scanActive = usePrinterStore((s) => s.scanActive);
  const connect = usePrinterStore((s) => s.connect);
  const reconnect = usePrinterStore((s) => s.reconnect);
  const choosePrinter = usePrinterStore((s) => s.choosePrinter);
  const cancelScan = usePrinterStore((s) => s.cancelScan);
  const print = usePrinterStore((s) => s.print);
  const darkness = useDeviceStore((s) => s.device.darkness);
  const setDevice = useDeviceStore((s) => s.setDevice);
  const setTone = useToneStore((s) => s.setTone);
  const rebuild = useExportSheetStore((s) => s.rebuild);
  const show = useExportSheetStore((s) => s.show);

  if (status === 'unsupported') {
    return (
      <p className={styles.note}>
        Printing needs Bluetooth, which this browser doesn't have. On iPhone, open this page in the <b>Bluefy</b> app.
      </p>
    );
  }

  const tooWide = outputs.some((c) => c.width !== PRINT_WIDTH);
  const switchTo384 = () => {
    setTone({ w: PRINT_WIDTH });
    if (rebuild) show(rebuild(), rebuild);
  };
  const printing = status === 'printing';
  const scanning = status === 'scanning';
  const canPrint = status === 'connected' && !tooWide;
  const noPrinterError = error && message?.startsWith('No printer found.');
  const connectToDevice = (device: PrinterDevice) => choosePrinter(device);

  return (
    <div className={styles.printer}>
      {tooWide && (
        <div className={styles.note}>
          <p>{outputs[0]?.width}px not supported by the printer.</p>
          <button type="button" className={styles.ghost} onClick={switchTo384}>Switch to {PRINT_WIDTH}px</button>
        </div>
      )}

      {canPrint && (
        <div className={styles.dark}>
          <span className={styles.darkLabel}>Darkness</span>
          <div className={styles.darkSeg}>
            {DARKNESS.map((d) => (
              <button key={d} type="button" aria-pressed={darkness === d} onClick={() => setDevice({ darkness: d })}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {scanning ? (
        <>
          <p className={styles.note}>{scanActive ? 'Searching for printers…' : 'Printers found'}</p>
          {foundPrinters.map((device) => (
            <button key={device.deviceId} type="button" className={styles.key} onClick={() => connectToDevice(device)}>
              {device.name}{device.rssi === undefined ? '' : ` · ${device.rssi} dBm`}
            </button>
          ))}
          <button type="button" className={styles.ghost} onClick={cancelScan}>Cancel</button>
        </>
      ) : noPrinterError ? (
        <div className={styles.note}>
          <p>{message}</p>
          <button type="button" className={styles.ghost} onClick={connect}>Search again</button>
        </div>
      ) : status === 'connected' || printing ? (
        <div className={styles.row}>
          <button type="button" className={styles.key} disabled={!canPrint} onClick={() => print([outputs[index]], darkness)}>
            {printing ? `Printing… ${Math.round(progress * 100)}%` : outputs.length > 1 ? 'Print this' : 'Print'}
          </button>
          {outputs.length > 1 && !printing && (
            <button type="button" className={styles.key} disabled={!canPrint} onClick={() => print(outputs, darkness)}>
              Print all
            </button>
          )}
        </div>
      ) : (
        lastDeviceName && status !== 'connecting' ? (
          <div className={styles.row}>
            <button type="button" className={styles.key} onClick={reconnect}>Reconnect {lastDeviceName}</button>
            <button type="button" className={styles.ghost} onClick={connect}>Other printer</button>
          </div>
        ) : (
          <button type="button" className={styles.key} disabled={status === 'connecting'} onClick={connect}>
            {status === 'connecting' ? 'Connecting…' : 'Connect printer'}
          </button>
        )
      )}

      <p className={`${styles.status} ${error ? styles.err : ''}`}>
      {scanning || noPrinterError ? '' : message ?? (status === 'connected' || printing ? `Connected to ${name}` : '')}
      </p>
    </div>
  );
}

export function ExportSheet() {
  const outputs = useExportSheetStore((s) => s.outputs);
  const index = useExportSheetStore((s) => s.index);
  const rendering = useExportSheetStore((s) => s.rendering);
  const close = useExportSheetStore((s) => s.close);
  const next = useExportSheetStore((s) => s.next);
  const prev = useExportSheetStore((s) => s.prev);
  const printing = usePrinterStore((s) => s.status === 'printing');

  const current = outputs[index] ?? null;
  const src = useMemo(() => current?.toDataURL('image/png'), [current]);

  if (!rendering && !outputs.length) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Export">
      <header className={styles.head}>
        <span className={styles.title}>Export</span>
        <button type="button" className={styles.x} aria-label="Close" disabled={printing} onClick={close}>×</button>
      </header>

      {rendering || !current ? (
        <p className={styles.msg}>Rendering…</p>
      ) : (
        <>
          <div className={styles.body}>
            <img src={src} alt="Result" className={styles.img} />
            <p className={styles.msg}>{SAVE_MSG}</p>
            <p className={styles.info}>{current.width} × {current.height} px</p>
          </div>

          <footer className={styles.foot}>
            {outputs.length > 1 && (
              <div className={styles.nav}>
                <button type="button" className={styles.navBtn} disabled={printing} onClick={prev}>‹</button>
                <span className={styles.navIdx}>{index + 1} / {outputs.length}</span>
                <button type="button" className={styles.navBtn} disabled={printing} onClick={next}>›</button>
              </div>
            )}
            <PrintControls outputs={outputs} index={index} />
          </footer>
        </>
      )}
    </div>
  );
}
