import { useRef } from 'react';
import { Image, ScrollView, Text, View } from './react-native';

export const useSharedValue = <T,>(initialValue: T) => {
  return useRef<{ value: T }>({ value: initialValue }).current;
};

export const useAnimatedStyle = (styleFn: () => any) => {
  try {
    return styleFn();
  } catch {
    return {};
  }
};

export const withTiming = (val: any) => val;
export const withSpring = (val: any) => val;
export const runOnJS = <T extends (...args: any[]) => any>(fn: T) => fn;

const Reanimated = {
  createAnimatedComponent: <T,>(Comp: T): T => Comp,
  View,
  ScrollView,
  Image,
  Text,
};

export default Reanimated;
