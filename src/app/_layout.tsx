import React, { useEffect, useState } from 'react';
import { Platform, StatusBar as NativeStatusBar } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { Feather, FontAwesome, Ionicons } from '@expo/vector-icons';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SuccessToastProvider } from '../components/SuccessToastProvider';
import { LanguageProvider } from '../lib/i18n';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const iconFontAssets = {
  ...Feather.font,
  ...FontAwesome.font,
  ...Ionicons.font,
};

const nativeFontAssets = {
  ...iconFontAssets,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

function RootLayoutNav() {
  const NavBarComponent: any = (NavigationBar as any).NavigationBar || (() => null);
  return (
    <>
      {Platform.OS === 'android' ? (
        <NativeStatusBar
          hidden={false}
          barStyle="light-content"
          backgroundColor="transparent"
          translucent={true}
        />
      ) : (
        <StatusBar hidden={false} style="light" />
      )}
      {Platform.OS === 'android' && <NavBarComponent hidden={false} style="dark" />}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(Platform.OS === 'web');
  const [fontError, setFontError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    Font.loadAsync(Platform.OS === 'web' ? iconFontAssets : nativeFontAssets)
      .then(() => {
        if (mounted) setFontsLoaded(true);
      })
      .catch((error) => {
        if (mounted) {
          setFontError(error instanceof Error ? error : new Error(String(error)));
          setFontsLoaded(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError && Platform.OS !== 'web') return null;

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
              <KeyboardProvider>
                <SuccessToastProvider>
                  <RootLayoutNav />
                </SuccessToastProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
