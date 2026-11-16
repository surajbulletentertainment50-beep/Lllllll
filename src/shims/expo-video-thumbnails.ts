const frameCache = new Map<string, string>();

const extractWebFrame = (
  sourceUri: string,
  timeMs: number,
): Promise<{ uri: string; width: number; height: number }> => {
  if (typeof document === 'undefined' || !sourceUri) {
    return Promise.resolve({ uri: sourceUri, width: 720, height: 1280 });
  }
  const cacheKey = `${sourceUri}::${Math.round(timeMs)}`;
  const cached = frameCache.get(cacheKey);
  if (cached) {
    return Promise.resolve({ uri: cached, width: 720, height: 1280 });
  }

  return new Promise((resolve) => {
    let settled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    if (!(sourceUri.startsWith('blob:') || sourceUri.startsWith('data:') || sourceUri.startsWith('/'))) {
      video.crossOrigin = 'anonymous';
    }

    const cleanup = () => {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {}
    };

    const finish = (uri: string, w = 720, h = 1280) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve({ uri, width: w, height: h });
    };

    const drawCurrentFrame = () => {
      try {
        const vw = video.videoWidth || 720;
        const vh = video.videoHeight || 1280;
        const scale = Math.min(1, 180 / Math.max(vw, vh));
        const cw = Math.max(48, Math.round(vw * scale));
        const ch = Math.max(48, Math.round(vh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, cw, ch);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
          if (dataUrl && dataUrl.startsWith('data:image/')) {
            if (frameCache.size > 80) {
              const firstKey = frameCache.keys().next().value;
              if (firstKey) frameCache.delete(firstKey);
            }
            frameCache.set(cacheKey, dataUrl);
            finish(dataUrl, vw, vh);
            return;
          }
        }
      } catch {}
      finish(sourceUri, 720, 1280);
    };

    const timer = setTimeout(() => {
      if (video.readyState >= 2) drawCurrentFrame();
      else finish(sourceUri, 720, 1280);
    }, 3500);

    const handleLoadedData = () => {
      const targetSec = Math.max(0.02, (Number(timeMs) || 0) / 1000);
      const dur = video.duration;
      const clampedSec =
        Number.isFinite(dur) && dur > 0
          ? Math.min(Math.max(0.02, targetSec), Math.max(0.02, dur - 0.04))
          : targetSec;
      if (Math.abs(video.currentTime - clampedSec) < 0.05) {
        drawCurrentFrame();
        return;
      }
      try {
        video.currentTime = clampedSec;
      } catch {
        drawCurrentFrame();
      }
    };

    video.addEventListener('loadeddata', handleLoadedData, { once: true });
    video.addEventListener('seeked', drawCurrentFrame, { once: true });
    video.addEventListener('error', () => finish(sourceUri, 720, 1280), { once: true });
    video.src = sourceUri;
    try {
      video.load();
    } catch {}
  });
};

export const getThumbnailAsync = async (sourceUri: string, options?: { time?: number }) => {
  return extractWebFrame(sourceUri, Number(options?.time || 0));
};

export default { getThumbnailAsync };
