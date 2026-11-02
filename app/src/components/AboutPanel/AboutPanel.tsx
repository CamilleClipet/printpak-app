import { useEffect, useState } from 'react';
import { externalLinkTarget, LICENSES_URL, PRIVACY_URL, SUPPORT_EMAIL, SUPPORT_URL } from '../../platform/links';
import styles from './AboutPanel.module.scss';

/** Clipboard API first; the hidden-textarea fallback covers WebViews where it is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function AboutPanel() {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyEmail = async () => setCopied((await copyText(SUPPORT_EMAIL)) ? 'ok' : 'failed');

  return (
    <div>
      <div className={styles.legend}>Print Pak</div>
      <div className={styles.hint}>Version {__APP_VERSION__}</div>
      <ul className={styles.links}>
        <li><a href={PRIVACY_URL} target={externalLinkTarget} rel="noopener">Privacy policy</a></li>
        <li><a href={SUPPORT_URL} target={externalLinkTarget} rel="noopener">Help &amp; support</a></li>
        <li>
          <button type="button" className={styles.copy} onClick={copyEmail}>
            Contact: {SUPPORT_EMAIL}
          </button>
          <span className={styles.copied} role="status">
            {copied === 'ok' ? 'Email copied' : copied === 'failed' ? 'Could not copy' : ''}
          </span>
        </li>
        <li><a href={LICENSES_URL} target={externalLinkTarget} rel="noopener">Open-source licences</a></li>
      </ul>
    </div>
  );
}
