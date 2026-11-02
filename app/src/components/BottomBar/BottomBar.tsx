import { useExport } from '../../hooks/useExport';
import { useImportFiles } from '../../hooks/useImportFiles';
import { pickFiles } from '../../services/pickFiles';
import { useBatchStore } from '../../state/batchStore';
import { useUiStore } from '../../state/uiStore';
import styles from './BottomBar.module.scss';

export function BottomBar() {
  const { addFiles, status } = useImportFiles();
  const setCropOpen = useUiStore((s) => s.setCropOpen);
  const hasCurrent = useBatchStore((s) => s.items.length > 0);
  const { doExport, canExport } = useExport();

  const openPicker = async () => {
    const files = await pickFiles();
    if (files && files.length) addFiles(files);
  };

  return (
    <div className={`${styles.wrap} bottom-bar`}>
      {status && <div className={styles.status}>{status}</div>}
      <div className={styles.bar}>
        <button type="button" className={styles.btn} onClick={openPicker}>Import</button>
        <button type="button" className={styles.btn} disabled={!hasCurrent} onClick={() => setCropOpen(true)}>
          Crop
        </button>
        <button type="button" className={`${styles.btn} ${styles.key}`} disabled={!canExport} onClick={doExport}>
          Export
        </button>
      </div>
    </div>
  );
}
