import React from 'react';
import { View } from './react-native';

export const BlurView: React.FC<any> = ({ style, children, ...props }) => (
  <View
    style={[
      { backgroundColor: 'rgba(18, 18, 24, 0.72)', backdropFilter: 'blur(12px)' } as any,
      style,
    ]}
    {...props}
  >
    {children}
  </View>
);

export default BlurView;
