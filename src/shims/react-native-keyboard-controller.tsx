import React from 'react';
import { View } from './react-native';

export const KeyboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

export const KeyboardAvoidingView: React.FC<any> = ({ style, children, ...props }) => (
  <View style={style} {...props}>
    {children}
  </View>
);

export default { KeyboardProvider, KeyboardAvoidingView };
