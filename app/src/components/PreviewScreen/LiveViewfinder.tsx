import { useEffect, useRef, useState } from 'react';
import { useCamera } from '../../hooks/useCamera';
import { useLiveDither } from '../../hooks/useLiveDither';
import type { ProcessResult } from '../../engine/types';
import { captureFrame } from '../../services/captureFrame';
import { useBatchStore } from '../../state/batchStore';
import { useUiStore } from '../../state/uiStore';
import styles from './PreviewScreen.module.scss';

/** Shuts the viewfinder's camera stream off after 90s of no interaction —
 *  it's the app's single heaviest thing to leave running unattended
 *  (index.html:1776-1787). */
const IDLE_MS = 90000;

/**
 * Default screen when nothing has been imported yet: an auto-starting,
 * inline dithered live preview (mirroring the original app's default
 * behavior), falling back to a "tap to start" prompt if the camera is
 * unavailable or permission hasn't been granted. Tapping it opens the
 * full-screen camera overlay, which is where the actual shutter lives.
 */
export function LiveViewfinder({ onOpenCamera, onCoverage }: {
  onOpenCamera: () => void;
  /** Fired with each live frame's coverage, throttled to the preview's own
   *  frame rate — lets the coverage meter above track the live feed, not
   *  just a captured photo (index.html:1858-1861). */
  onCoverage?: (r: ProcessResult) => void;
}) {
  const [wantsCamera, setWantsCamera] = useState(true);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(0);
  const { videoRef, facing, flip, ready, error } = useCamera(wantsCamera && !idle);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const addItems = useBatchStore((s) => s.addItems);
  const setCur = useBatchStore((s) => s.setCur);
  const itemCount = useBatchStore((s) => s.items.length);
  const setLiveView = useUiStore((s) => s.setLiveView);

  useLiveDither(videoRef, canvasRef, facing, wantsCamera && !idle, onCoverage);

  useEffect(() => {
    if (idle) return;
    const arm = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    arm();
    document.addEventListener('pointerdown', arm, { passive: true });
    return () => {
      clearTimeout(idleTimer.current);
      document.removeEventListener('pointerdown', arm);
    };
  }, [idle]);

  if (idle) {
    return (
      <button type="button" className={styles.empty} onClick={() => setIdle(false)}>
        Tap to start viewfinder
      </button>
    );
  }

  if (error) {
    return (
      <button type="button" className={styles.empty} onClick={() => setWantsCamera(true)}>
        Tap to start viewfinder
      </button>
    );
  }

  return (
    <>
      <div className={styles.liveButton}>
        <video ref={videoRef} playsInline muted style={{ display: 'none' }} />
        <canvas ref={canvasRef} className={styles.canvas} />
        {!ready && <div className={styles.empty}>Starting…</div>}
      </div>
      <button type="button" className={styles.liveExpand} onClick={onOpenCamera} aria-label="Open full-screen camera">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /></svg>
      </button>
      {ready && (
        <button
          type="button" className={styles.liveFlip}
          onClick={(e) => { e.stopPropagation(); flip(); }}
        >
          Flip
        </button>
      )}
      <button
        type="button" className={styles.liveShutter} aria-label="Take photo" disabled={!ready}
        onClick={() => {
          const video = videoRef.current;
          if (!video || !video.videoWidth) return;
          addItems([{ id: '', ...captureFrame(video, facing) }]);
          setCur(itemCount);
          setLiveView(false);
        }}
      />
    </>
  );
}
