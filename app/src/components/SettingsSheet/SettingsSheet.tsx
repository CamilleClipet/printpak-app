import { useEffect } from 'react';
import { registerNativeBackDismiss } from '../../platform/native/backDismissRegistry';
import { useUiStore } from '../../state/uiStore';
import { ExportPanel } from '../ExportPanel/ExportPanel';
import { SettingsPanel } from '../SettingsPanel/SettingsPanel';
import styles from './SettingsSheet.module.scss';

export function SettingsSheet() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  useEffect(() => {
    if (!open) return;
    return registerNativeBackDismiss(100, () => {
      setOpen(false);
      return true;
    });
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Settings">
      <header className={styles.head}>
        <span className={styles.title}>Settings</span>
        <button type="button" className={styles.x} aria-label="Close" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className={styles.body}>
        <section className={styles.group}>
          <h2 className={styles.section}>Image settings</h2>
          <SettingsPanel />
        </section>
        <section className={styles.group}>
          <h2 className={styles.section}>Export settings</h2>
          <ExportPanel />
        </section>
      </div>
    </div>
  );
}
