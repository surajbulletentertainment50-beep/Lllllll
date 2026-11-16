import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from './react-native';

export const Camera = forwardRef<any, any>(
  (
    {
      style,
      device,
      cameraDevice = 'back',
      torch = 'off',
      flash = 'off',
      isActive = true,
      zoom = 0,
      filterCss,
      tintColor,
      isMirrored = false,
      isZoomEffect = false,
      activeEffect = 'None',
      audio = true,
      children,
      ...props
    },
    ref,
  ) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const activeDeviceIdRef = useRef<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const maxDurationTimerRef = useRef<any>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const resolveRecordingRef = useRef<((res: { uri: string }) => void) | null>(null);

    const [cameraError, setCameraError] = useState(false);
    const [isStreamReady, setIsStreamReady] = useState(false);
    const [hardwareTorchSupported, setHardwareTorchSupported] = useState<boolean | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const facing = (typeof device === 'string' ? device : device?.position ?? cameraDevice ?? 'back') === 'front' ? 'user' : 'environment';
    const isTorchOn = Boolean(isActive) && (torch === 'on' || torch === true || flash === 'on' || flash === 'torch');
    const captureAudio = audio !== false;

    const stopStream = (stream: MediaStream | null) => {
      if (!stream) return;
      try {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
      } catch {}
    };

    const acquireCameraStream = async (targetFacing: 'user' | 'environment', wantAudio = true): Promise<MediaStream> => {
      const prevDeviceId = activeDeviceIdRef.current;

      const tryConstraints = async (videoConstraint: any, withAudio: boolean) => {
        if (!withAudio) {
          return navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: false });
        }
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: videoConstraint,
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          });
        } catch (err: any) {
          if (err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError') {
            return navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: true });
          }
          throw err;
        }
      };

      const getStreamWithOptionalAudio = async (videoConstraint: any) => {
        if (!wantAudio) return tryConstraints(videoConstraint, false);
        try {
          return await tryConstraints(videoConstraint, true);
        } catch (err: any) {
          if (err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError') throw err;
          return tryConstraints(videoConstraint, false);
        }
      };

      try {
        const exactStream = await getStreamWithOptionalAudio({ facingMode: { exact: targetFacing } });
        const track = exactStream.getVideoTracks()[0];
        activeDeviceIdRef.current = track?.getSettings?.()?.deviceId || null;
        return exactStream;
      } catch {
        try {
          if (typeof navigator.mediaDevices?.enumerateDevices === 'function') {
            const videoInputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
            if (videoInputs.length > 1) {
              const wantFront = targetFacing === 'user';
              let matched = videoInputs.find((d) => {
                const label = (d.label || '').toLowerCase();
                if (!label) return false;
                return wantFront
                  ? /front|user|selfie|facetime|integrated/.test(label)
                  : /back|rear|environment|wide|main/.test(label);
              });
              if (!matched && prevDeviceId) {
                matched = videoInputs.find((d) => d.deviceId && d.deviceId !== prevDeviceId);
              }
              if (matched?.deviceId) {
                const byIdStream = await getStreamWithOptionalAudio({ deviceId: { exact: matched.deviceId } });
                activeDeviceIdRef.current = matched.deviceId;
                return byIdStream;
              }
            }
          }
        } catch {}

        try {
          const softStream = await getStreamWithOptionalAudio({ facingMode: targetFacing });
          const track = softStream.getVideoTracks()[0];
          activeDeviceIdRef.current = track?.getSettings?.()?.deviceId || null;
          return softStream;
        } catch {
          const genericStream = await getStreamWithOptionalAudio(true);
          const track = genericStream.getVideoTracks()[0];
          activeDeviceIdRef.current = track?.getSettings?.()?.deviceId || null;
          return genericStream;
        }
      }
    };

    const applyTorchToStream = async (stream: MediaStream | null, turnOn: boolean) => {
      if (!stream) return false;
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return false;
      try {
        const caps: any = typeof videoTrack.getCapabilities === 'function' ? videoTrack.getCapabilities() : null;
        if (caps && 'torch' in caps && !caps.torch) {
          setHardwareTorchSupported(false);
          return false;
        }
        await (videoTrack as any).applyConstraints({ advanced: [{ torch: turnOn }] });
        setHardwareTorchSupported(true);
        return true;
      } catch {
        setHardwareTorchSupported(false);
        return false;
      }
    };

    const startRecorder = (stream: MediaStream, maxDuration: number) => {
      try {
        if (maxDurationTimerRef.current) {
          clearTimeout(maxDurationTimerRef.current);
          maxDurationTimerRef.current = null;
        }
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4';

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        recordedChunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
          if (maxDurationTimerRef.current) {
            clearTimeout(maxDurationTimerRef.current);
            maxDurationTimerRef.current = null;
          }
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const uri = URL.createObjectURL(blob);
          if (resolveRecordingRef.current) {
            resolveRecordingRef.current({ uri });
            resolveRecordingRef.current = null;
          }
        };

        try {
          recorder.start(250);
        } catch {
          recorder.start();
        }

        if (maxDuration) {
          maxDurationTimerRef.current = setTimeout(() => {
            maxDurationTimerRef.current = null;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
            }
          }, maxDuration * 1000);
        }
      } catch (e) {
        console.warn('startRecorder error:', e);
        if (resolveRecordingRef.current) {
          resolveRecordingRef.current({ uri: '' });
          resolveRecordingRef.current = null;
        }
      }
    };

    useImperativeHandle(ref, () => ({
      recordAsync: async ({ maxDuration = 60 } = {}) => {
        recordedChunksRef.current = [];
        return new Promise((resolve) => {
          resolveRecordingRef.current = resolve;
          try {
            if (!streamRef.current) {
              acquireCameraStream(facing, captureAudio)
                .then(async (s) => {
                  streamRef.current = s;
                  if (videoRef.current) {
                    videoRef.current.srcObject = s;
                    videoRef.current.play().then(() => setIsStreamReady(true)).catch(() => {});
                  }
                  if (isTorchOn && facing === 'environment') await applyTorchToStream(s, true);
                  startRecorder(s, maxDuration);
                })
                .catch((err) => {
                  console.warn('getUserMedia record error:', err);
                  setCameraError(true);
                  if (fileInputRef.current) fileInputRef.current.click();
                  else resolve({ uri: '' });
                });
            } else {
              startRecorder(streamRef.current, maxDuration);
            }
          } catch (err) {
            console.warn('recordAsync error:', err);
            resolve({ uri: '' });
          }
        });
      },
      stopRecording: () => {
        if (maxDurationTimerRef.current) {
          clearTimeout(maxDurationTimerRef.current);
          maxDurationTimerRef.current = null;
        }
        try {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          } else if (resolveRecordingRef.current) {
            resolveRecordingRef.current({ uri: '' });
            resolveRecordingRef.current = null;
          }
        } catch (e) {
          console.warn('stopRecording error:', e);
        }
      },
      takePhoto: async () => ({ path: '' }),
    }));

    useEffect(() => {
      if (!isActive) {
        if (streamRef.current) {
          applyTorchToStream(streamRef.current, false);
          stopStream(streamRef.current);
          streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setIsStreamReady(false);
        return;
      }

      let isMounted = true;
      setIsStreamReady(false);
      setHardwareTorchSupported(null);

      const startCamera = async () => {
        try {
          setCameraError(false);
          if (streamRef.current) {
            applyTorchToStream(streamRef.current, false);
            stopStream(streamRef.current);
            streamRef.current = null;
            if (videoRef.current) videoRef.current.srcObject = null;
            await new Promise((r) => setTimeout(r, 70));
          }
          if (!isMounted) return;
          if (typeof navigator.mediaDevices?.getUserMedia === 'function') {
            const s = await acquireCameraStream(facing, captureAudio);
            if (isMounted) {
              streamRef.current = s;
              if (videoRef.current) {
                videoRef.current.srcObject = s;
                await videoRef.current.play().catch(() => {});
                setIsStreamReady(true);
              }
              if (isTorchOn && facing === 'environment') await applyTorchToStream(s, true);
            } else {
              stopStream(s);
            }
          }
        } catch (err) {
          console.warn('VisionCamera mediaDevices error:', err);
          if (isMounted) {
            setCameraError(true);
            setIsStreamReady(true);
          }
        }
      };

      startCamera();

      return () => {
        isMounted = false;
        if (streamRef.current) {
          applyTorchToStream(streamRef.current, false);
          stopStream(streamRef.current);
          streamRef.current = null;
        }
      };
    }, [facing, isActive, captureAudio]);

    useEffect(() => {
      if (!streamRef.current) return;
      if (facing === 'user') {
        applyTorchToStream(streamRef.current, false);
        setHardwareTorchSupported(false);
        return;
      }
      applyTorchToStream(streamRef.current, isTorchOn);
    }, [isTorchOn, isStreamReady, facing]);

    useEffect(() => {
      const stream = streamRef.current;
      if (!stream || !isStreamReady) return;
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || typeof videoTrack.getCapabilities !== 'function') return;
      try {
        const caps: any = videoTrack.getCapabilities();
        if (caps && caps.zoom && typeof caps.zoom.min === 'number' && typeof caps.zoom.max === 'number') {
          const clampedZoom = Math.max(0, Math.min(1, Number(zoom) || 0));
          const baseMin = caps.zoom.min < 1 ? 1 : caps.zoom.min;
          const hwZoom = Math.max(
            caps.zoom.min,
            Math.min(caps.zoom.max, baseMin + clampedZoom * (caps.zoom.max - baseMin)),
          );
          (videoTrack as any).applyConstraints({ advanced: [{ zoom: hwZoom }] }).catch(() => {});
        }
      } catch {}
    }, [zoom, isStreamReady]);

    useEffect(() => {
      if (typeof document === 'undefined') return;
      if (document.getElementById('masti-camera-fx-style')) return;
      const styleEl = document.createElement('style');
      styleEl.id = 'masti-camera-fx-style';
      styleEl.textContent = `
        @keyframes mastiCamShake {
          0%, 100% { transform: translate3d(0, 0, 0); }
          20% { transform: translate3d(-4px, 3px, 0) scale(1.03); }
          40% { transform: translate3d(4px, -3px, 0) scale(1.03); }
          60% { transform: translate3d(-3px, -2px, 0) scale(1.03); }
          80% { transform: translate3d(3px, 4px, 0) scale(1.03); }
        }
        @keyframes mastiCamSparklePulse {
          0%, 100% { opacity: 0.35; transform: scale(0.9); }
          50% { opacity: 0.95; transform: scale(1.2); }
        }
      `;
      document.head?.appendChild(styleEl);
    }, []);

    const showScreenFlashGlow = isTorchOn && (facing === 'user' || hardwareTorchSupported === false);
    const visualScale = (1 + Math.max(0, Math.min(1, Number(zoom) || 0)) * 1.8) * (isZoomEffect ? 1.16 : 1);
    const flipSign = (facing === 'user') !== Boolean(isMirrored) ? -1 : 1;
    const videoTransformParts: string[] = [];
    if (flipSign === -1) videoTransformParts.push('scaleX(-1)');
    if (visualScale > 1.001) videoTransformParts.push(`scale(${visualScale.toFixed(3)})`);
    const videoTransform = videoTransformParts.length > 0 ? videoTransformParts.join(' ') : undefined;

    return (
      <View
        ref={ref}
        style={[
          styles.camera,
          style,
          activeEffect === 'Shake' ? ({ animation: 'mastiCamShake 0.42s infinite' } as any) : null,
        ]}
        onTouchStart={() => {
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().then(() => setIsStreamReady(true)).catch(() => {});
          }
        }}
        {...props}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          controls={false}
          onLoadedMetadata={(e) => {
            e.currentTarget.play().then(() => setIsStreamReady(true)).catch(() => {});
          }}
          onPlaying={() => setIsStreamReady(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            backgroundColor: '#000',
            transform: videoTransform,
            filter: filterCss || undefined,
            transition: 'transform 120ms ease-out, filter 160ms ease-out',
          }}
        />
        {tintColor && tintColor !== 'transparent' && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: tintColor,
              zIndex: 4,
            }}
          />
        )}
        {activeEffect === 'Sparkle' && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 }}
          >
            {[
              { top: '16%', left: '18%', delay: '0s' },
              { top: '26%', right: '22%', delay: '0.25s' },
              { top: '44%', left: '14%', delay: '0.5s' },
              { top: '52%', right: '18%', delay: '0.15s' },
              { top: '68%', left: '28%', delay: '0.4s' },
              { top: '34%', left: '54%', delay: '0.3s' },
            ].map((pos, idx) => (
              <Text
                key={idx}
                style={{
                  position: 'absolute',
                  ...(pos.top ? { top: pos.top } : {}),
                  ...(pos.left ? { left: pos.left } : {}),
                  ...(pos.right ? { right: pos.right } : {}),
                  fontSize: 22,
                  color: '#FFF7AE',
                  textShadowColor: '#FFD700',
                  textShadowRadius: 10,
                  animation: `mastiCamSparklePulse 1.1s ease-in-out ${pos.delay} infinite`,
                } as any}
              >
                ✦
              </Text>
            ))}
          </View>
        )}
        {showScreenFlashGlow && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderWidth: facing === 'user' ? 14 : 6,
              borderColor: 'rgba(255, 255, 255, 0.92)',
              backgroundColor: facing === 'user' ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.08)',
              borderRadius: 18,
              zIndex: 8,
            }}
          />
        )}
        {!isStreamReady && !cameraError && (
          <View style={styles.loadingOverlay}>
            <View style={styles.spinner} />
          </View>
        )}
        {cameraError && (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorText}>Camera stream restricted in WebView.</Text>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => {
                if (fileInputRef.current) fileInputRef.current.click();
              }}
            >
              <Text style={styles.uploadBtnText}>Upload or Record Video</Text>
            </TouchableOpacity>
          </View>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && resolveRecordingRef.current) {
              const uri = URL.createObjectURL(file);
              resolveRecordingRef.current({ uri });
              resolveRecordingRef.current = null;
            }
          }}
        />
        {children}
      </View>
    );
  },
);

export const useCameraDevice = (position: string) => position;
export const useCameraPermission = () => ({ hasPermission: true, requestPermission: async () => true });
export const useMicrophonePermission = () => ({ hasPermission: true, requestPermission: async () => true });

const styles = StyleSheet.create({
  camera: {
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  spinner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
    borderTopColor: '#FF2D55',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 99,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  uploadBtn: {
    backgroundColor: '#FF2D55',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  uploadBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission };
