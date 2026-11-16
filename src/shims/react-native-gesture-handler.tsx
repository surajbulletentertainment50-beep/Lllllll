import React from 'react';
import { View } from './react-native';

export const GestureHandlerRootView: React.FC<any> = ({ style, children }) => (
  <View style={[{ flex: 1 }, style]}>{children}</View>
);

const createGestureChain = (): any => {
  const chain: any = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'then') return undefined;
        return (..._args: any[]) => chain;
      },
    },
  );
  return chain;
};

export const Gesture = new Proxy(
  {
    Pan: () => createGestureChain(),
    Pinch: () => createGestureChain(),
    Tap: () => createGestureChain(),
    Rotation: () => createGestureChain(),
    Fling: () => createGestureChain(),
    LongPress: () => createGestureChain(),
    Native: () => createGestureChain(),
    Manual: () => createGestureChain(),
    Race: (..._gestures: any[]) => createGestureChain(),
    Simultaneous: (..._gestures: any[]) => createGestureChain(),
    Exclusive: (..._gestures: any[]) => createGestureChain(),
  },
  {
    get: (target: any, prop: string) => {
      if (prop in target) return target[prop];
      return (..._args: any[]) => createGestureChain();
    },
  },
);

export const GestureDetector: React.FC<any> = ({ children }) => <>{children}</>;

export default { GestureHandlerRootView, Gesture, GestureDetector };
