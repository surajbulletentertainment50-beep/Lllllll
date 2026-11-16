import { useCallback, useRef, useState } from 'react';

const PULL_ACTIVATE_OFFSET = 10;
const PULL_TRIGGER_THRESHOLD = 72;

export type PullPhase = 'idle' | 'pulling' | 'release' | 'refreshing';

const getTouchCoords = (event: any): { x: number; y: number } | null => {
  const touches = event?.nativeEvent?.touches ?? event?.touches;
  if (touches && touches.length === 1) {
    const t = touches[0];
    const x = Number(t?.pageX ?? t?.clientX ?? 0);
    const y = Number(t?.pageY ?? t?.clientY ?? 0);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  return null;
};

export const usePullToRefresh = (onRefreshFn?: () => Promise<void> | void) => {
  const [refreshing, setRefreshing] = useState(false);
  const [phase, setPhase] = useState<PullPhase>('idle');
  const [progress, setProgress] = useState(0);

  const refreshingRef = useRef(false);
  const refreshRunIdRef = useRef(0);
  const phaseRef = useRef<PullPhase>('idle');
  const scrollOffsetYRef = useRef(0);
  const gestureRef = useRef({ active: false, aborted: false, startX: 0, startY: 0 });

  const updatePhase = useCallback((nextPhase: PullPhase, nextProgress?: number) => {
    if (phaseRef.current !== nextPhase) {
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
    }
    if (typeof nextProgress === 'number') setProgress(nextProgress);
  }, []);

  const onRefresh = useCallback(
    async (forceOrEvent?: boolean | any) => {
      const force = forceOrEvent === true;
      if (refreshingRef.current && !force) return;
      const runId = ++refreshRunIdRef.current;
      refreshingRef.current = true;
      setRefreshing(true);
      updatePhase('refreshing', 1);
      try {
        if (onRefreshFn) await onRefreshFn();
      } catch (err) {
        console.warn('PullToRefresh error:', err);
      } finally {
        if (refreshRunIdRef.current === runId) {
          refreshingRef.current = false;
          setRefreshing(false);
          updatePhase('idle', 0);
        }
      }
    },
    [onRefreshFn, updatePhase],
  );

  const onScroll = useCallback(
    (event: any) => {
      const offsetY = Number(event?.nativeEvent?.contentOffset?.y ?? 0);
      if (!Number.isFinite(offsetY)) return;
      scrollOffsetYRef.current = offsetY;
      if (refreshingRef.current) return;
      if (offsetY < -4) {
        const nextProgress = Math.min(1, (-offsetY - 4) / PULL_TRIGGER_THRESHOLD);
        updatePhase(nextProgress >= 1 ? 'release' : 'pulling', nextProgress);
      } else if (!gestureRef.current.active && phaseRef.current !== 'idle') {
        updatePhase('idle', 0);
      }
    },
    [updatePhase],
  );

  const onTouchStart = useCallback((event: any) => {
    if (refreshingRef.current || scrollOffsetYRef.current > 2) {
      gestureRef.current.active = false;
      gestureRef.current.aborted = true;
      return;
    }
    const coords = getTouchCoords(event);
    if (!coords) {
      gestureRef.current.active = false;
      gestureRef.current.aborted = true;
      return;
    }
    gestureRef.current = { active: true, aborted: false, startX: coords.x, startY: coords.y };
  }, []);

  const onTouchMove = useCallback(
    (event: any) => {
      if (refreshingRef.current || gestureRef.current.aborted || !gestureRef.current.active) return;
      if (scrollOffsetYRef.current > 2) {
        gestureRef.current.aborted = true;
        gestureRef.current.active = false;
        updatePhase('idle', 0);
        return;
      }
      const coords = getTouchCoords(event);
      if (!coords) {
        gestureRef.current.aborted = true;
        gestureRef.current.active = false;
        updatePhase('idle', 0);
        return;
      }
      const dx = coords.x - gestureRef.current.startX;
      const dy = coords.y - gestureRef.current.startY;
      if (phaseRef.current === 'idle' && (Math.abs(dx) > Math.abs(dy) * 1.15 || dy < -8)) {
        gestureRef.current.aborted = true;
        gestureRef.current.active = false;
        return;
      }
      if (dy > PULL_ACTIVATE_OFFSET && dy > Math.abs(dx) * 1.2) {
        const nextProgress = Math.min(1, (dy - PULL_ACTIVATE_OFFSET) / PULL_TRIGGER_THRESHOLD);
        updatePhase(nextProgress >= 1 ? 'release' : 'pulling', nextProgress);
      } else if (phaseRef.current !== 'idle') {
        updatePhase('idle', 0);
      }
    },
    [updatePhase],
  );

  const finishTouchPull = useCallback(() => {
    const wasReadyToRelease = phaseRef.current === 'release';
    gestureRef.current.active = false;
    gestureRef.current.aborted = false;
    if (refreshingRef.current) return;
    if (wasReadyToRelease) onRefresh();
    else if (phaseRef.current !== 'idle') updatePhase('idle', 0);
  }, [onRefresh, updatePhase]);

  return {
    refreshing,
    phase,
    progress,
    onRefresh,
    onScroll,
    pullHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd: finishTouchPull,
      onTouchCancel: finishTouchPull,
    },
  };
};
