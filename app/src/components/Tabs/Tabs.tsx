import { useState, type ReactNode } from 'react';
import styles from './Tabs.module.scss';

export interface TabDef {
  id: string;
  label: string;
  content?: ReactNode;
  onSelect?: () => void;
}

export function Tabs({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div className={styles.tabs}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${t.id === active ? styles.active : ''}`}
            onClick={() => {
              if (t.onSelect) t.onSelect();
              else setActive(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.panel}>{activeTab.content}</div>
    </div>
  );
}
