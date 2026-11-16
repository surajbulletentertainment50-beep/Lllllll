import React, { useRef } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SwipeableInboxRowProps {
  rowKey: string;
  entranceAnimation?: any;
  unreadBackground?: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}

const SWIPE_REMOVE_THRESHOLD = 85;
const SWIPE_EXIT_DISTANCE = 420;

export const SwipeableInboxRow: React.FC<SwipeableInboxRowProps> = ({
  entranceAnimation,
  unreadBackground = false,
  onRemove,
  children,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowOpacity = useRef(new Animated.Value(1)).current;
  const removingRef = useRef(false);
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  const triggerRemove = (direction: 1 | -1) => {
    if (removingRef.current) return;
    removingRef.current = true;
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: direction * SWIPE_EXIT_DISTANCE,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(rowOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onRemoveRef.current();
    });
  };

  const resetPosition = () => {
    Animated.spring(translateX, {
      toValue: 0,
      friction: 7,
      tension: 65,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt: any, gestureState: any) => {
        if (removingRef.current) return false;
        const absDx = Math.abs(gestureState.dx);
        const absDy = Math.abs(gestureState.dy);
        return absDx > 18 && absDx > absDy * 1.6;
      },
      onMoveShouldSetPanResponderCapture: (_evt: any, gestureState: any) => {
        if (removingRef.current) return false;
        const absDx = Math.abs(gestureState.dx);
        const absDy = Math.abs(gestureState.dy);
        return absDx > 22 && absDx > absDy * 1.75;
      },
      onPanResponderTerminationRequest: () => {
        const currentX = Math.abs((translateX as any).__getValue?.() ?? 0);
        return currentX < 12;
      },
      onPanResponderMove: (_evt: any, gestureState: any) => {
        if (removingRef.current) return;
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_evt: any, gestureState: any) => {
        if (removingRef.current) return;
        const shouldRemove =
          Math.abs(gestureState.dx) >= SWIPE_REMOVE_THRESHOLD ||
          (Math.abs(gestureState.vx) >= 0.45 && Math.abs(gestureState.dx) >= 40);
        if (shouldRemove) {
          triggerRemove(gestureState.dx >= 0 ? 1 : -1);
        } else {
          resetPosition();
        }
      },
      onPanResponderTerminate: () => {
        if (!removingRef.current) {
          resetPosition();
        }
      },
    }),
  ).current;

  const leftActionOpacity = translateX.interpolate({
    inputRange: [0, 30, 90],
    outputRange: [0, 0.7, 1],
    extrapolate: 'clamp',
  });

  const rightActionOpacity = translateX.interpolate({
    inputRange: [-90, -30, 0],
    outputRange: [1, 0.7, 0],
    extrapolate: 'clamp',
  });

  const entranceStyles = entranceAnimation
    ? {
        opacity: Animated.multiply(rowOpacity, entranceAnimation),
        transform: [
          { translateX },
          {
            translateY: entranceAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          },
        ],
      }
    : {
        opacity: rowOpacity,
        transform: [{ translateX }],
      };

  return (
    <View
      style={[
        {
          position: 'relative',
          overflow: 'hidden',
          borderBottomWidth: 0.5,
          borderBottomColor: '#1e1e1e',
          backgroundColor: '#000',
        },
        Platform.OS === 'web' ? ({ touchAction: 'pan-y', userSelect: 'none' } as any) : null,
      ]}
    >
      {/* Left-swipe & right-swipe delete reveal backdrop */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#dc2626',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 22,
        }}
      >
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: leftActionOpacity,
          }}
        >
          <Ionicons name="trash-outline" size={20} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>Remove</Text>
        </Animated.View>
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: rightActionOpacity,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>Remove</Text>
          <Ionicons name="trash-outline" size={20} color="#ffffff" />
        </Animated.View>
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 18,
            paddingVertical: 14,
            backgroundColor: unreadBackground ? '#18090e' : '#000000',
          },
          entranceStyles,
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
};

export default SwipeableInboxRow;
