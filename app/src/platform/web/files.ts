import type { ShareResult } from '../types';

export async function saveFile(blob: Blob, name: string): Promise<void> {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function shareFile(blob: Blob, name: string): Promise<ShareResult> {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return 'unsupported';
  try {
    const file = new File([blob], name, { type: blob.type });
    if (!navigator.canShare({ files: [file] })) return 'unsupported';
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}
