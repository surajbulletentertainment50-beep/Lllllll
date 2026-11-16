import React, {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from './react-native';
import App from '../app/index';
import SettingsScreen from '../app/settings';

interface RouterContextType {
  pathname: string;
  params: Record<string, string>;
  push: (href: string, options?: { params?: Record<string, string> }) => void;
  replace: (href: string, options?: { params?: Record<string, string> }) => void;
  back: () => void;
  canGoBack: () => boolean;
  history: string[];
}

const RouterContext = createContext<RouterContextType>({
  pathname: '/',
  params: {},
  push: () => {},
  replace: () => {},
  back: () => {},
  canGoBack: () => false,
  history: ['/'],
});

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [history, setHistory] = useState<string[]>(['/']);
  const [params, setParams] = useState<Record<string, string>>({});

  const pathname = history[history.length - 1] || '/';

  const push = useCallback((href: string, options?: { params?: Record<string, string> }) => {
    const [pathPart, queryPart] = (href.startsWith('/') ? href : `/${href}`).split('?');
    if (queryPart) {
      const parsed: Record<string, string> = {};
      new URLSearchParams(queryPart).forEach((v, k) => {
        parsed[k] = v;
      });
      setParams(parsed);
    } else if (options?.params) {
      setParams(options.params);
    }
    setHistory((prev) => [...prev, pathPart]);
  }, []);

  const replace = useCallback((href: string, options?: { params?: Record<string, string> }) => {
    const [pathPart, queryPart] = (href.startsWith('/') ? href : `/${href}`).split('?');
    if (queryPart) {
      const parsed: Record<string, string> = {};
      new URLSearchParams(queryPart).forEach((v, k) => {
        parsed[k] = v;
      });
      setParams(parsed);
    } else if (options?.params) {
      setParams(options.params);
    }
    if (pathPart === '/') {
      setHistory(['/']);
    } else {
      setHistory((prev) => [...prev.slice(0, -1), pathPart]);
    }
  }, []);

  const back = useCallback(() => {
    setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const canGoBack = useCallback(() => history.length > 1, [history.length]);

  return (
    <RouterContext.Provider value={{ pathname, params, push, replace, back, canGoBack, history }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = () => {
  const ctx = useContext(RouterContext);
  return {
    push: ctx.push,
    replace: ctx.replace,
    back: ctx.back,
    canGoBack: ctx.canGoBack,
    pathname: ctx.pathname,
  };
};

export const useLocalSearchParams = () => {
  return useContext(RouterContext).params;
};

export const useFocusEffect = (callback: () => void | (() => void)) => {
  const { pathname } = useContext(RouterContext);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useEffect(() => {
    if (pathname !== '/') return;
    return callbackRef.current();
  }, [pathname]);
};

export const Stack: React.FC<{ screenOptions?: any; children?: React.ReactNode }> & {
  Screen: React.FC<{ name: string; options?: any }>;
} = ({ children }) => {
  const { pathname } = useContext(RouterContext);
  const screens: Record<string, React.ReactElement> = {};
  Children.forEach(children, (child: any) => {
    if (isValidElement(child) && (child.props as any)?.name) {
      screens[(child.props as any).name] = child;
    }
  });

  let activeName = 'index';
  if (pathname === '/settings' || pathname === 'settings') activeName = 'settings';
  else if (pathname === '/+not-found' || pathname === '+not-found') activeName = '+not-found';

  return (
    <View style={styles.stackContainer}>
      <ScreenRenderer activeName={activeName} />
    </View>
  );
};

Stack.Screen = (_props: { name: string; options?: any }) => null;

const NotFoundScreen = () => (
  <View
    style={{
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000',
      padding: 24,
    }}
  >
    <Text style={{ color: '#fff', fontSize: 18, marginBottom: 12 }}>Page Not Found</Text>
    <TouchableOpacity
      onPress={() => {
        window.location.hash = '/';
      }}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#6366f1',
        borderRadius: 8,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go Home</Text>
    </TouchableOpacity>
  </View>
);

const ScreenRenderer: React.FC<{ activeName: string }> = ({ activeName }) => {
  return (
    <View style={styles.stackContainer}>
      <View
        style={[
          styles.stackLayer,
          activeName !== 'index' && styles.hiddenLayer,
        ]}
        pointerEvents={activeName === 'index' ? 'auto' : 'none'}
      >
        <App />
      </View>
      {activeName === 'settings' && (
        <View style={styles.stackOverlay}>
          <SettingsScreen />
        </View>
      )}
      {activeName === '+not-found' && (
        <View style={styles.stackOverlay}>
          <NotFoundScreen />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  stackContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    position: 'relative',
  },
  stackLayer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  hiddenLayer: {
    display: 'none',
  },
  stackOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 10,
  },
});

export default {
  RouterProvider,
  useRouter,
  useLocalSearchParams,
  useFocusEffect,
  Stack,
};
