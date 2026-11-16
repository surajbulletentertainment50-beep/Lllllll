import React, { useEffect, useState } from 'react';
import {
  Platform,
  Text,
  TouchableOpacity,
  View,
  BackHandler,
} from 'react-native';
import { StyleSheet } from 'react-native-web';

export interface AlertButton {
  text?: string;
  onPress?: (value?: string) => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type AlertListener = (req: AlertRequest) => void;

const listeners = new Set<AlertListener>();
const pendingQueue: AlertRequest[] = [];
let nextAlertId = 1;

export const dispatchWebAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
) => {
  const normalizedButtons: AlertButton[] =
    Array.isArray(buttons) && buttons.length > 0
      ? buttons
      : [{ text: 'OK', style: 'default' }];

  const req: AlertRequest = {
    id: nextAlertId++,
    title: String(title || ''),
    message: message ? String(message) : undefined,
    buttons: normalizedButtons,
  };

  if (listeners.size === 0) {
    pendingQueue.push(req);
    return;
  }
  listeners.forEach((fn) => fn(req));
};

export const AlertModalHost: React.FC = () => {
  const [queue, setQueue] = useState<AlertRequest[]>(() => {
    if (pendingQueue.length > 0) {
      return pendingQueue.splice(0, pendingQueue.length);
    }
    return [];
  });

  useEffect(() => {
    const onRequest: AlertListener = (req) => {
      setQueue((prev) => [...prev, req]);
    };
    listeners.add(onRequest);
    if (pendingQueue.length > 0) {
      const drained = pendingQueue.splice(0, pendingQueue.length);
      setQueue((prev) => [...prev, ...drained]);
    }
    return () => {
      listeners.delete(onRequest);
    };
  }, []);

  const handlePressButton = (btn: AlertButton) => {
    setQueue((prev) => prev.slice(1));
    if (typeof btn.onPress === 'function') {
      setTimeout(() => {
        try {
          btn.onPress?.();
        } catch (err) {
          console.warn('[AlertModalHost] button handler error:', err);
        }
      }, 0);
    }
  };

  useEffect(() => {
    if (queue.length === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const top = queue[0];
      if (top) {
        const cancelBtn = top.buttons.find((b) => b.style === 'cancel') || top.buttons[0];
        handlePressButton(cancelBtn || { text: 'OK' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [queue]);

  const current = queue[0];
  if (!current) return null;

  const backdropPositionStyle =
    Platform.OS === 'web'
      ? ({
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999999,
        } as any)
      : {
          position: 'absolute' as const,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999999,
        };

  return (
    <View style={[styles.backdrop, backdropPositionStyle]}>
      <View style={styles.card}>
        {!!current.title && <Text style={styles.title}>{current.title}</Text>}
        {!!current.message && <Text style={styles.message}>{current.message}</Text>}
        <View
          style={[
            styles.actionsRow,
            current.buttons.length > 2 && styles.actionsColumn,
          ]}
        >
          {current.buttons.map((btn, idx) => {
            const isDestructive = btn.style === 'destructive';
            const isCancel = btn.style === 'cancel';
            return (
              <TouchableOpacity
                key={`${current.id}-${idx}`}
                activeOpacity={0.8}
                onPress={() => handlePressButton(btn)}
                style={[
                  styles.button,
                  current.buttons.length <= 2 && styles.buttonFlex,
                  isDestructive
                    ? styles.buttonDestructive
                    : isCancel
                      ? styles.buttonCancel
                      : styles.buttonPrimary,
                ]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    isDestructive
                      ? styles.buttonTextDestructive
                      : isCancel
                        ? styles.buttonTextCancel
                        : styles.buttonTextPrimary,
                  ]}
                >
                  {btn.text || 'OK'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1c1c1e',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    color: '#a1a1aa',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionsColumn: {
    flexDirection: 'column',
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonFlex: {
    flex: 1,
  },
  buttonCancel: {
    backgroundColor: '#2c2c2e',
  },
  buttonPrimary: {
    backgroundColor: '#FE2C55',
  },
  buttonDestructive: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  buttonTextCancel: {
    color: '#e4e4e7',
  },
  buttonTextPrimary: {
    color: '#ffffff',
  },
  buttonTextDestructive: {
    color: '#ffffff',
  },
});

export default AlertModalHost;
