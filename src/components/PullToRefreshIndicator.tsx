import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { RotateCw } from 'lucide-react';
import type { PullPhase } from '../hooks/usePullToRefresh';

const CIRCLE_SIZE = 42;
const USE_NATIVE = Platform.OS !== 'web';

interface PullToRefreshIndicatorProps {
  phase: PullPhase;
  progress?: number;
  top?: number;
}

export default function PullToRefreshIndicator({ phase, progress = 0, top = 8 }: PullToRefreshIndicatorProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const spinLoopRef = useRef<any>(null);
  const visible = phase !== 'idle';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 180 : 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE,
      }),
      Animated.spring(scale, {
        toValue: visible ? 1 : 0.6,
        useNativeDriver: USE_NATIVE,
        tension: 160,
        friction: 9,
      }),
    ]).start();
  }, [visible, opacity, scale]);

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: phase === 'refreshing' ? -18 : 0,
      useNativeDriver: USE_NATIVE,
      tension: 180,
      friction: 10,
    }).start();
  }, [phase, translateY]);

  useEffect(() => {
    if (phase === 'refreshing') {
      spin.setValue(0);
      spinLoopRef.current = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 750,
          easing: Easing.linear,
          useNativeDriver: USE_NATIVE,
        }),
      );
      spinLoopRef.current.start();
    } else {
      spinLoopRef.current?.stop?.();
      spinLoopRef.current = null;
    }
    return () => {
      spinLoopRef.current?.stop?.();
    };
  }, [phase, spin]);

  const rotate =
    phase === 'refreshing'
      ? spin.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        })
      : `${Math.min(progress, 1) * 300}deg`;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          top,
          opacity,
          transform: [{ scale }, { translateY }],
        },
      ]}
    >
      <View style={styles.circle}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <RotateCw size={22} strokeWidth={2.2} color="#1C1C1E" />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.18)' },
    }) as any),
  },
});
