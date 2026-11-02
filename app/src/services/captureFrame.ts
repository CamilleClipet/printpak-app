import type { BatchItem } from '../state/batchStore';

/** Capture a camera frame as a batch photo, preserving the front-camera mirror. */
export function captureFrame(video: HTMLVideoElement, facing: 'user' | 'environment'): Omit<BatchItem, 'crop' | 'id'> {
  const shot = document.createElement('canvas');
  shot.width = video.videoWidth;
  shot.height = video.videoHeight;
  const ctx = shot.getContext('2d');
  if (!ctx) throw new Error('Could not capture camera frame');
  if (facing === 'user') {
    ctx.translate(shot.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  return {
    name: `capture-${Date.now()}.png`, source: shot,
    width: shot.width, height: shot.height, rot: 0, own: null, skip: false,
  };
}
