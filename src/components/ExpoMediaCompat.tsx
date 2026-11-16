import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

const BLACK_POSTER_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

let videoStyleInjected = false;
const ensureWebVideoStyle = () => {
  if (videoStyleInjected || typeof document === 'undefined') return;
  if (document.getElementById('masti-expo-video-style')) {
    videoStyleInjected = true;
    return;
  }
  const styleEl = document.createElement('style');
  styleEl.id = 'masti-expo-video-style';
  styleEl.textContent = `
    video.masti-expo-video::-webkit-media-controls-overlay-play-button,
    video.masti-expo-video::-webkit-media-controls-start-playback-button {
      display: none !important;
      opacity: 0 !important;
      pointer-events: none !important;
      -webkit-appearance: none !important;
    }
    video.masti-expo-video:not([controls])::-webkit-media-controls {
      display: none !important;
    }
  `;
  document.head?.appendChild(styleEl);
  videoStyleInjected = true;
};

export const Video = forwardRef<any, any>((props, ref) => {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const uri = typeof props.source === 'string' ? props.source : props.source?.uri;
  const fixingInfinityDurRef = useRef(false);
  const statusCallbackRef = useRef(props.onPlaybackStatusUpdate);
  statusCallbackRef.current = props.onPlaybackStatusUpdate;

  ensureWebVideoStyle();

  useEffect(() => {
    fixingInfinityDurRef.current = false;
  }, [uri]);

  useImperativeHandle(ref, () => ({
    playAsync: async () => {
      const el = videoElRef.current;
      if (!el) return;
      try {
        await el.play();
      } catch {
        const el2 = videoElRef.current;
        if (el2 && !el2.muted) {
          el2.muted = true;
          try {
            await el2.play();
          } catch {}
        }
      }
    },
    pauseAsync: async () => {
      if (videoElRef.current) videoElRef.current.pause();
    },
    stopAsync: async () => {
      if (videoElRef.current) {
        videoElRef.current.pause();
        videoElRef.current.currentTime = 0;
      }
    },
    setPositionAsync: async (millis: number) => {
      const el = videoElRef.current;
      if (!el) return;
      const targetSec = Math.max(0, (Number(millis) || 0) / 1000);
      const maxSec = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : targetSec;
      try {
        el.currentTime = Math.min(targetSec, maxSec);
      } catch {}
    },
    setIsMutedAsync: async (muted: boolean) => {
      if (videoElRef.current) videoElRef.current.muted = muted;
    },
    setRateAsync: async (rate: number) => {
      if (videoElRef.current && Number.isFinite(rate) && rate > 0) {
        videoElRef.current.playbackRate = Math.max(0.25, Math.min(4, rate));
      }
    },
    unloadAsync: async () => {
      if (videoElRef.current) {
        videoElRef.current.pause();
        videoElRef.current.src = '';
      }
    },
    getStatusAsync: async () => {
      if (!videoElRef.current) return { isLoaded: false, isPlaying: false };
      const el = videoElRef.current;
      const durMs = Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 0;
      const posMs = Number.isFinite(el.currentTime) ? el.currentTime * 1000 : 0;
      return {
        isLoaded: true,
        isPlaying: !el.paused,
        durationMillis: durMs,
        positionMillis: posMs,
        isLooping: el.loop,
        isMuted: el.muted,
      };
    },
  }));

  useEffect(() => {
    const el = videoElRef.current;
    if (!el) return;
    if (props.shouldPlay) {
      const p = el.play();
      if (p !== undefined) {
        p.catch(() => {
          if (!el.muted) {
            el.muted = true;
            el.play().catch(() => {});
          }
        });
      }
    } else {
      el.pause();
    }
  }, [props.shouldPlay]);

  useEffect(() => {
    return () => {
      const el = videoElRef.current;
      if (el) {
        try {
          el.pause();
          el.removeAttribute('src');
          el.load();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    if (videoElRef.current) videoElRef.current.muted = !!props.isMuted;
  }, [props.isMuted]);

  useEffect(() => {
    if (videoElRef.current && typeof props.volume === 'number') {
      videoElRef.current.volume = Math.max(0, Math.min(1, props.volume));
    }
  }, [props.volume]);

  useEffect(() => {
    const el = videoElRef.current;
    if (!el) return;
    if (typeof props.playbackRate === 'number' && Number.isFinite(props.playbackRate) && props.playbackRate > 0) {
      const rate = Math.max(0.25, Math.min(4, props.playbackRate));
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
    }
  }, [props.playbackRate, uri]);

  useEffect(() => {
    if (videoElRef.current) videoElRef.current.loop = !!props.isLooping;
  }, [props.isLooping]);

  useEffect(() => {
    const el = videoElRef.current;
    if (!el || typeof props.positionMillis !== 'number' || !Number.isFinite(props.positionMillis)) return;
    if (el.readyState >= 1 && !props.shouldPlay) {
      try {
        el.currentTime = Math.max(0, props.positionMillis / 1000);
      } catch {}
    }
  }, [props.positionMillis, props.shouldPlay]);

  useEffect(() => {
    if (!props.shouldPlay) return;
    const interval = setInterval(() => {
      const el = videoElRef.current;
      const cb = statusCallbackRef.current;
      if (!el || !cb || el.paused || fixingInfinityDurRef.current) return;
      const durMs = Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 0;
      const posMs = Number.isFinite(el.currentTime) ? el.currentTime * 1000 : 0;
      cb({
        isLoaded: true,
        isPlaying: !el.paused,
        durationMillis: durMs,
        positionMillis: posMs,
        isLooping: el.loop,
        isMuted: el.muted,
      });
    }, 33);
    return () => clearInterval(interval);
  }, [props.shouldPlay, uri]);

  const emitStatusUpdate = (isBuffering = false) => {
    if (!videoElRef.current || !props.onPlaybackStatusUpdate || fixingInfinityDurRef.current) return;
    const el = videoElRef.current;
    const durMs = Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 0;
    const posMs = Number.isFinite(el.currentTime) ? el.currentTime * 1000 : 0;
    props.onPlaybackStatusUpdate({
      isLoaded: true,
      isPlaying: !el.paused,
      durationMillis: durMs,
      positionMillis: posMs,
      isLooping: el.loop,
      isMuted: el.muted,
      ...(isBuffering ? { isBuffering: true } : {}),
    });
  };

  const resolveInfinityDurationIfNeeded = () => {
    const el = videoElRef.current;
    if (!el || fixingInfinityDurRef.current) return;
    if (el.duration === Infinity) {
      fixingInfinityDurRef.current = true;
      const wasPlaying = !el.paused;
      const onSeekToEnd = () => {
        el.removeEventListener('timeupdate', onSeekToEnd);
        try {
          el.currentTime = 0;
        } catch {}
        fixingInfinityDurRef.current = false;
        if (wasPlaying) el.play().catch(() => {});
        emitStatusUpdate(false);
      };
      el.addEventListener('timeupdate', onSeekToEnd, { once: true });
      try {
        el.currentTime = 1e101;
      } catch {
        fixingInfinityDurRef.current = false;
      }
    }
  };

  const applyPlaybackRate = () => {
    const el = videoElRef.current;
    if (!el) return;
    if (typeof props.playbackRate === 'number' && Number.isFinite(props.playbackRate) && props.playbackRate > 0) {
      const rate = Math.max(0.25, Math.min(4, props.playbackRate));
      el.defaultPlaybackRate = rate;
      if (Math.abs(el.playbackRate - rate) > 0.01) el.playbackRate = rate;
    }
  };

  const handleTimeUpdate = () => {
    applyPlaybackRate();
    emitStatusUpdate(false);
  };

  const handleLoadedMetadata = () => {
    applyPlaybackRate();
    resolveInfinityDurationIfNeeded();
    if (!fixingInfinityDurRef.current) emitStatusUpdate(false);
  };

  const handleCanPlay = () => {
    applyPlaybackRate();
    resolveInfinityDurationIfNeeded();
    if (fixingInfinityDurRef.current) return;
    props.onReadyForDisplay?.();
    if (videoElRef.current && props.onLoad) {
      const el = videoElRef.current;
      const durMs = Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 0;
      const posMs = Number.isFinite(el.currentTime) ? el.currentTime * 1000 : 0;
      props.onLoad({
        isLoaded: true,
        isPlaying: !el.paused,
        durationMillis: durMs,
        positionMillis: posMs,
        isLooping: el.loop,
        isMuted: el.muted,
      });
    }
    emitStatusUpdate(false);
  };

  const handleEnded = () => {
    if (!videoElRef.current || !props.onPlaybackStatusUpdate) return;
    const el = videoElRef.current;
    const durMs = Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 0;
    props.onPlaybackStatusUpdate({
      isLoaded: true,
      isPlaying: false,
      didJustFinish: true,
      durationMillis: durMs,
      positionMillis: durMs,
      isLooping: el.loop,
      isMuted: el.muted,
    });
  };

  const objectFit = props.resizeMode === 'contain' ? 'contain' : 'cover';
  const posterUri = props.posterSource?.uri || BLACK_POSTER_DATA_URI;

  return (
    <View style={[styles.container, props.style]}>
      {uri ? (
        <video
          ref={videoElRef}
          className="masti-expo-video"
          src={uri}
          poster={posterUri}
          preload="auto"
          playsInline
          autoPlay={props.shouldPlay}
          loop={props.isLooping}
          muted={props.isMuted}
          controls={props.useNativeControls}
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={() => emitStatusUpdate(false)}
          onSeeked={() => emitStatusUpdate(false)}
          onLoadedData={handleCanPlay}
          onCanPlay={handleCanPlay}
          onPlay={() => {
            applyPlaybackRate();
            emitStatusUpdate(false);
          }}
          onPause={() => emitStatusUpdate(false)}
          onWaiting={() => emitStatusUpdate(true)}
          onError={(e) => props.onError?.(e)}
          onLoadStart={() => props.onLoadStart?.()}
          onEnded={handleEnded}
          style={{
            width: '100%',
            height: '100%',
            objectFit,
            display: 'block',
            backgroundColor: '#000',
          }}
        />
      ) : null}
      {props.children}
    </View>
  );
});

export class LegacyAudioSound {
  audio: HTMLAudioElement | null = null;
  onUpdate: ((status: any) => void) | null = null;
  pendingSeekSec: number | null = null;

  constructor(uri?: string) {
    if (uri && typeof window !== 'undefined') {
      const el = new window.Audio(uri);
      el.preload = 'auto';
      this.audio = el;

      const emitStatus = (didJustFinish = false) => {
        if (!this.onUpdate || !this.audio) return;
        const dur = Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : 0;
        const pos = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime * 1000 : 0;
        this.onUpdate({
          isLoaded: true,
          isPlaying: !this.audio.paused,
          durationMillis: dur,
          positionMillis: pos,
          isLooping: this.audio.loop,
          isMuted: this.audio.muted,
          ...(didJustFinish ? { didJustFinish: true } : {}),
        });
      };

      const applyPendingSeek = (clearAfter = false) => {
        if (!this.audio || this.pendingSeekSec === null) return;
        const target = this.pendingSeekSec;
        try {
          const maxSec = Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : target;
          const clamped = Math.max(0, Math.min(target, maxSec));
          if (Math.abs(this.audio.currentTime - clamped) > 0.35) this.audio.currentTime = clamped;
          if (clearAfter && Math.abs(this.audio.currentTime - clamped) <= 0.6) this.pendingSeekSec = null;
        } catch {}
      };

      el.addEventListener('loadedmetadata', () => {
        applyPendingSeek(false);
        emitStatus(false);
      });
      el.addEventListener('canplay', () => applyPendingSeek(false));
      el.addEventListener('seeked', () => {
        if (this.pendingSeekSec !== null && Math.abs(el.currentTime - this.pendingSeekSec) <= 0.6) {
          this.pendingSeekSec = null;
        }
        emitStatus(false);
      });
      el.addEventListener('playing', () => {
        applyPendingSeek(true);
        emitStatus(false);
      });
      el.addEventListener('timeupdate', () => emitStatus(false));
      el.addEventListener('ended', () => emitStatus(true));
    }
  }

  async playAsync() {
    if (!this.audio) return;
    if (this.pendingSeekSec !== null && this.audio.readyState >= 1) {
      const target = this.pendingSeekSec;
      try {
        const maxSec = Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : target;
        this.audio.currentTime = Math.max(0, Math.min(target, maxSec));
      } catch {}
    }
    try {
      await this.audio.play();
    } catch {}
  }

  async pauseAsync() {
    this.audio?.pause();
  }

  async stopAsync() {
    if (this.audio) {
      this.audio.pause();
      this.pendingSeekSec = null;
      try {
        this.audio.currentTime = 0;
      } catch {}
    }
  }

  async unloadAsync() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
      this.pendingSeekSec = null;
      this.onUpdate = null;
    }
  }

  async setPositionAsync(millis: number) {
    if (!this.audio) return;
    const sec = Math.max(0, (Number(millis) || 0) / 1000);
    this.pendingSeekSec = sec;
    if (this.audio.readyState < 1) return;
    try {
      const maxSec = Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : sec;
      const clamped = Math.min(sec, maxSec);
      this.audio.currentTime = clamped;
      if (this.audio.readyState >= 2 && Math.abs(this.audio.currentTime - clamped) <= 0.6) {
        this.pendingSeekSec = null;
      }
    } catch {}
  }

  async setIsMutedAsync(muted: boolean) {
    if (this.audio) this.audio.muted = !!muted;
  }

  async setVolumeAsync(vol: number) {
    if (this.audio) this.audio.volume = Math.max(0, Math.min(1, Number(vol) || 0));
  }

  async setIsLoopingAsync(loop: boolean) {
    if (this.audio) this.audio.loop = !!loop;
  }

  async setRateAsync(rate: number, _shouldCorrectPitch?: boolean) {
    if (this.audio && Number.isFinite(rate) && rate > 0) {
      const clamped = Math.max(0.25, Math.min(4, rate));
      this.audio.defaultPlaybackRate = clamped;
      this.audio.playbackRate = clamped;
    }
  }

  async getStatusAsync() {
    if (!this.audio) return { isLoaded: false, isPlaying: false };
    const dur = Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : 0;
    const pos = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime * 1000 : 0;
    return {
      isLoaded: true,
      isPlaying: !this.audio.paused,
      durationMillis: dur,
      positionMillis: pos,
      isLooping: this.audio.loop,
      isMuted: this.audio.muted,
    };
  }

  setOnPlaybackStatusUpdate(callback: (status: any) => void) {
    this.onUpdate = callback;
  }
}

export const Audio = {
  Sound: {
    createAsync: async (source: { uri: string }, initialStatus?: any, onPlaybackStatusUpdate?: any) => {
      const sound = new LegacyAudioSound(source.uri);
      if (onPlaybackStatusUpdate) sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
      if (typeof initialStatus?.volume === 'number') await sound.setVolumeAsync(initialStatus.volume);
      if (typeof initialStatus?.isLooping === 'boolean') await sound.setIsLoopingAsync(initialStatus.isLooping);
      if (typeof initialStatus?.isMuted === 'boolean') await sound.setIsMutedAsync(initialStatus.isMuted);
      if (typeof initialStatus?.positionMillis === 'number') await sound.setPositionAsync(initialStatus.positionMillis);
      if (initialStatus?.shouldPlay !== false) {
        try {
          await sound.playAsync();
        } catch {}
      }
      return { sound, status: await sound.getStatusAsync() };
    },
  },
  setAudioModeAsync: async () => {},
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});
