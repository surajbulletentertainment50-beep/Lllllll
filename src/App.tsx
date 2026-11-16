/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RouterProvider } from '@/shims/expo-router';
import RootLayout from '@/app/_layout';
import AlertModalHost from '@/components/AlertModalHost';

export default function App() {
  return (
    <RouterProvider>
      <RootLayout />
      <AlertModalHost />
    </RouterProvider>
  );
}
