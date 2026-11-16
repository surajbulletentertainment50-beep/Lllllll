import React from 'react';
import { View } from './react-native';

export const LinearGradient: React.FC<any> = ({ colors, style, children, ...props }) => {
  const bg = Array.isArray(colors) && colors.length > 0 ? colors[0] : '#FF2D55';
  const gradientBg =
    Array.isArray(colors) && colors.length > 1
      ? `linear-gradient(135deg, ${colors.join(', ')})`
      : bg;
  return (
    <View style={[{ backgroundColor: bg, backgroundImage: gradientBg } as any, style]} {...props}>
      {children}
    </View>
  );
};

export default LinearGradient;
