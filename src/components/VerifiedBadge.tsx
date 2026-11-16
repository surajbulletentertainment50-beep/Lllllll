import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

export interface VerifiedBadgeProps {
  size?: number;
  style?: any;
  color?: string;
}

const INSTAGRAM_SEAL_PATH =
  'M 20.82 8.35 Q 25.10 12.00 20.82 15.65 Q 21.26 21.26 15.65 20.82 Q 12.00 25.10 8.35 20.82 Q 2.74 21.26 3.18 15.65 Q -1.10 12.00 3.18 8.35 Q 2.74 2.74 8.35 3.18 Q 12.00 -1.10 15.65 3.18 Q 21.26 2.74 20.82 8.35 Z';

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = 16,
  style,
  color = '#0095F6',
}) => {
  if (Platform.OS === 'web') {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel="Verified account"
        style={[
          styles.wrapper,
          { width: size, height: size },
          style,
        ]}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-label="Verified"
          style={{ display: 'block', flexShrink: 0 }}
        >
          <path d={INSTAGRAM_SEAL_PATH} fill={color} />
          <path
            d="M 8.15 12.25 L 10.75 14.85 L 16.10 9.35"
            stroke="#FFFFFF"
            strokeWidth={2.35}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Verified account"
      style={[
        styles.nativeFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginLeft: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nativeFallback: {
    marginLeft: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

export default VerifiedBadge;
