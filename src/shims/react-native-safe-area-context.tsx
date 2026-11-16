import React, { createContext, useContext, useEffect, useState } from 'react';
import { View } from './react-native';

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const defaultInsets: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const parseCssPx = (value?: string | null): number => {
  if (!value) return 0;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const readDomSafeAreaInsets = (): EdgeInsets => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return defaultInsets;
  try {
    const computed = window.getComputedStyle(document.documentElement);
    return {
      top: Math.max(parseCssPx(computed.getPropertyValue('--safe-area-inset-top')), parseCssPx(computed.getPropertyValue('--sat'))),
      right: Math.max(parseCssPx(computed.getPropertyValue('--safe-area-inset-right')), parseCssPx(computed.getPropertyValue('--sar'))),
      bottom: Math.max(parseCssPx(computed.getPropertyValue('--safe-area-inset-bottom')), parseCssPx(computed.getPropertyValue('--sab'))),
      left: Math.max(parseCssPx(computed.getPropertyValue('--safe-area-inset-left')), parseCssPx(computed.getPropertyValue('--sal'))),
    };
  } catch {
    return defaultInsets;
  }
};

const SafeAreaContext = createContext<EdgeInsets>(defaultInsets);

export const SafeAreaProvider: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => {
  const [insets, setInsets] = useState<EdgeInsets>(readDomSafeAreaInsets);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const syncInsets = () => {
      const next = readDomSafeAreaInsets();
      setInsets((prev) =>
        prev.top === next.top &&
        prev.right === next.right &&
        prev.bottom === next.bottom &&
        prev.left === next.left
          ? prev
          : next,
      );
    };
    syncInsets();
    window.addEventListener('resize', syncInsets);
    window.addEventListener('orientationchange', syncInsets);
    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(syncInsets) : null;
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => {
      window.removeEventListener('resize', syncInsets);
      window.removeEventListener('orientationchange', syncInsets);
      observer?.disconnect();
    };
  }, []);

  return (
    <SafeAreaContext.Provider value={insets}>
      <View style={[{ flex: 1, width: '100%', height: '100%' }, style]}>{children}</View>
    </SafeAreaContext.Provider>
  );
};

export const useSafeAreaInsets = () => useContext(SafeAreaContext) || defaultInsets;

export default { SafeAreaProvider, useSafeAreaInsets };
