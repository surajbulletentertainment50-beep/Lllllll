import React from 'react';
import { Camera } from './react-native-vision-camera';

export const CameraView = Camera;
export const useCameraPermissions = () => [{ granted: true }, async () => ({ granted: true })];
export const useMicrophonePermissions = () => [{ granted: true }, async () => ({ granted: true })];

export default { CameraView, useCameraPermissions, useMicrophonePermissions };
