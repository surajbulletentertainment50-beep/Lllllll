import * as RNWeb from 'react-native-web';
import { dispatchWebAlert, type AlertButton } from '../components/AlertModalHost';

export * from 'react-native-web';

export const View: any = RNWeb.View;
export const Text: any = RNWeb.Text;
export const Image: any = RNWeb.Image;
export const ScrollView: any = RNWeb.ScrollView;
export const TextInput: any = RNWeb.TextInput;
export const TouchableOpacity: any = RNWeb.TouchableOpacity;
export const TouchableHighlight: any = RNWeb.TouchableHighlight;
export const TouchableWithoutFeedback: any = RNWeb.TouchableWithoutFeedback;
export const Pressable: any = RNWeb.Pressable;
export const StyleSheet: any = RNWeb.StyleSheet;
export const Platform: any = RNWeb.Platform;
export const Dimensions: any = RNWeb.Dimensions;
export const Animated: any = RNWeb.Animated;
export const PanResponder: any = RNWeb.PanResponder;
export const Modal: any = RNWeb.Modal;
export const ActivityIndicator: any = RNWeb.ActivityIndicator;
export const FlatList: any = RNWeb.FlatList;
export const SectionList: any = RNWeb.SectionList;
export const RefreshControl: any = RNWeb.RefreshControl;
export const StatusBar: any = RNWeb.StatusBar;
export const Keyboard: any = RNWeb.Keyboard;
export const SafeAreaView: any = RNWeb.SafeAreaView;
export const Easing: any = RNWeb.Easing;
export const AppState: any = RNWeb.AppState;
export const Linking: any = RNWeb.Linking;
export const Switch: any = (RNWeb as any).Switch || RNWeb.View;
export const KeyboardAvoidingView: any = (RNWeb as any).KeyboardAvoidingView || RNWeb.View;

export const Alert = {
  ...RNWeb.Alert,
  alert: (title: string, message?: string, buttons?: AlertButton[]) => {
    dispatchWebAlert(title, message, buttons);
  },
};

function showInAppToast(message: string, durationMs = 2000) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('masti-toast-root');
  if (existing) {
    existing.remove();
  }
  const toast = document.createElement('div');
  toast.id = 'masti-toast-root';
  toast.innerText = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '76px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(24, 24, 27, 0.95)',
    color: '#ffffff',
    padding: '10px 22px',
    borderRadius: '24px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    zIndex: '9999999',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.2s ease, transform 0.2s ease',
    textAlign: 'center',
    maxWidth: '90vw',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(-6px)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(4px)';
    setTimeout(() => {
      toast.remove();
    }, 250);
  }, durationMs);
}

export const ToastAndroid = {
  SHORT: 0,
  LONG: 1,
  show: (message: string, duration?: number) => {
    console.log('[ToastAndroid]', message);
    if (typeof window !== 'undefined') {
      try {
        if ((window as any).AndroidBridge?.showToast) {
          (window as any).AndroidBridge.showToast(message);
        }
      } catch (e) {}
      showInAppToast(message, duration === 1 ? 3500 : 2000);
    }
  },
  showWithGravity: (message: string, duration?: number, _gravity?: number) => {
    ToastAndroid.show(message, duration);
  },
};

export const PermissionsAndroid = {
  PERMISSIONS: {
    CAMERA: 'android.permission.CAMERA',
    RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
    WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
    READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  check: async () => true,
  request: async () => 'granted',
  requestMultiple: async () => ({}),
};

type BackPressHandler = () => boolean | null | undefined;
const backPressListeners: BackPressHandler[] = [];

export const triggerBackPress = (): boolean => {
  for (let i = backPressListeners.length - 1; i >= 0; i--) {
    try {
      const handler = backPressListeners[i];
      if (typeof handler === 'function') {
        const handled = handler();
        if (handled) {
          return true;
        }
      }
    } catch (err) {
      console.error('[BackHandler] Error executing back handler:', err);
    }
  }
  return false;
};

export const BackHandler = {
  addEventListener: (eventName: string, handler: BackPressHandler) => {
    if (eventName === 'hardwareBackPress') {
      backPressListeners.push(handler);
    }
    return {
      remove: () => {
        const idx = backPressListeners.indexOf(handler);
        if (idx !== -1) {
          backPressListeners.splice(idx, 1);
        }
      },
    };
  },
  removeEventListener: (eventName: string, handler: BackPressHandler) => {
    if (eventName === 'hardwareBackPress') {
      const idx = backPressListeners.indexOf(handler);
      if (idx !== -1) {
        backPressListeners.splice(idx, 1);
      }
    }
  },
  exitApp: () => {
    if (typeof window !== 'undefined') {
      try {
        if ((window as any).AndroidBridge?.exitApp) {
          (window as any).AndroidBridge.exitApp();
          return;
        }
      } catch (e) {}

      try {
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.App?.exitApp) {
          cap.Plugins.App.exitApp();
          return;
        }
      } catch (e) {}

      try {
        window.close();
      } catch (e) {}
    }
  },
};

// Global wireup for Android Bridge, custom DOM event, and popstate
if (typeof window !== 'undefined') {
  (window as any).__handleAndroidBackPress = triggerBackPress;

  window.addEventListener('hardwareBackPress', (e) => {
    const handled = triggerBackPress();
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // History state trapping for phone browsers / PWA back navigation
  try {
    if (!window.history.state || !window.history.state.__masti) {
      window.history.replaceState({ __masti: true, root: true }, '');
      window.history.pushState({ __masti: true, depth: 1 }, '');
    }
  } catch (e) {}

  window.addEventListener('popstate', () => {
    try {
      window.history.pushState({ __masti: true, depth: 1 }, '');
    } catch (e) {}
    triggerBackPress();
  });

  // Listen to Capacitor native backButton event if Capacitor bridge is present
  const cap = (window as any).Capacitor;
  if (cap?.Plugins?.App?.addListener) {
    try {
      cap.Plugins.App.addListener('backButton', () => {
        triggerBackPress();
      });
    } catch (e) {}
  }
}

export const Clipboard = {
  setString: (text: string) => {
    void Clipboard.setStringAsync(text);
  },
  setStringAsync: async (text: string): Promise<boolean> => {
    const value = String(text ?? '');
    try {
      if (typeof window !== 'undefined' && (window as any).AndroidBridge?.copyText) {
        const nativeCopied = (window as any).AndroidBridge.copyText(value);
        if (nativeCopied) return true;
      }
    } catch {}
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {}
    try {
      if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        return Boolean(copied);
      }
    } catch {}
    return false;
  },
  getStringAsync: async (): Promise<string> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        return await navigator.clipboard.readText();
      }
    } catch {}
    return '';
  },
};

export default {
  ...RNWeb,
  Alert,
  ToastAndroid,
  PermissionsAndroid,
  BackHandler,
  Clipboard,
};
