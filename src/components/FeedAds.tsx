import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import type { MastiBaseAdsConfig } from '../lib/mastiBase';
import VerifiedBadge from './VerifiedBadge';
import {
  ReelsNativeAd,
  type ReelsNativeAdSocialState,
  type SponsoredAdFeedItem,
} from '../lib/reelsNativeAd';

const GOOGLE_TEST_BANNER_UNIT_ID = 'ca-app-pub-3940256099942544/6300978111';
const GOOGLE_TEST_INTERSTITIAL_UNIT_ID = 'ca-app-pub-3940256099942544/1033173712';
const GOOGLE_TEST_REWARDED_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';

let adMobInitPromise: Promise<boolean> | null = null;
let initializedTestingFlag: boolean | null = null;

const isNativeAdMobPlatform = () =>
  Capacitor.isNativePlatform();

const resolveUnitId = (
  configuredId: string | undefined,
  testFallback: string,
  testAdsEnabled?: boolean,
): string => {
  const trimmed = String(configuredId || '').trim();
  if (trimmed) return trimmed;
  return testAdsEnabled ? testFallback : '';
};

const ensureAdMobInitialized = async (
  config?: MastiBaseAdsConfig | null,
): Promise<boolean> => {
  if (!isNativeAdMobPlatform()) return false;
  if (!config?.globalAdsEnabled) return false;
  const isTesting = Boolean(config.testAdsEnabled);

  if (adMobInitPromise && initializedTestingFlag === isTesting) {
    return await adMobInitPromise;
  }

  initializedTestingFlag = isTesting;
  adMobInitPromise = AdMob.initialize({
    initializeForTesting: isTesting,
  })
    .then(() => true)
    .catch((err) => {
      console.warn('[AdMob] initialize failed:', err);
      adMobInitPromise = null;
      return false;
    });

  return await adMobInitPromise;
};

let activeNativeBannerKey = '';
let isNativeBannerShown = false;
let isNativeBannerHidden = false;

export interface FeedBannerAdProps {
  config?: MastiBaseAdsConfig | null;
  visible?: boolean;
  topOffset?: number;
  bottomOffset?: number;
}

export const FeedBannerAd: React.FC<FeedBannerAdProps> = ({
  config,
  visible = true,
  topOffset,
}) => {
  const [dismissedForSession, setDismissedForSession] = useState(false);

  const bannerAdId = useMemo(
    () =>
      resolveUnitId(
        config?.bannerAdUnitId,
        GOOGLE_TEST_BANNER_UNIT_ID,
        config?.testAdsEnabled,
      ),
    [config?.bannerAdUnitId, config?.testAdsEnabled],
  );

  const isEnabled = Boolean(
    config?.globalAdsEnabled && (config.testAdsEnabled || bannerAdId),
  );
  const shouldShow = Boolean(visible && isEnabled && !dismissedForSession && bannerAdId);

  useEffect(() => {
    if (!config?.globalAdsEnabled) {
      setDismissedForSession(false);
    }
  }, [config?.globalAdsEnabled]);

  useEffect(() => {
    if (!isNativeAdMobPlatform()) return;
    let cancelled = false;

    const syncNativeBanner = async () => {
      if (!isEnabled) {
        if (isNativeBannerShown) {
          isNativeBannerShown = false;
          isNativeBannerHidden = false;
          activeNativeBannerKey = '';
          await AdMob.removeBanner().catch(() => {});
        }
        return;
      }

      if (!shouldShow) {
        if (isNativeBannerShown && !isNativeBannerHidden) {
          isNativeBannerHidden = true;
          await AdMob.hideBanner().catch(() => {});
        }
        return;
      }

      const ready = await ensureAdMobInitialized(config);
      if (!ready || cancelled) return;

      const margin = Math.max(48, Math.round(topOffset ?? 56));
      const desiredKey = `${bannerAdId}|${Boolean(config?.testAdsEnabled)}|${margin}`;

      if (isNativeBannerShown && activeNativeBannerKey === desiredKey) {
        if (isNativeBannerHidden) {
          isNativeBannerHidden = false;
          await AdMob.resumeBanner().catch(() => {});
        }
        return;
      }

      if (isNativeBannerShown) {
        await AdMob.removeBanner().catch(() => {});
      }

      activeNativeBannerKey = desiredKey;
      isNativeBannerShown = true;
      isNativeBannerHidden = false;

      await AdMob.showBanner({
        adId: bannerAdId,
        adSize: BannerAdSize.BANNER,
        position: BannerAdPosition.TOP_CENTER,
        margin,
        isTesting: Boolean(config?.testAdsEnabled),
      }).catch((err) => {
        console.warn('[AdMob] showBanner failed:', err);
        isNativeBannerShown = false;
        isNativeBannerHidden = false;
        activeNativeBannerKey = '';
      });
    };

    void syncNativeBanner();

    return () => {
      cancelled = true;
    };
  }, [bannerAdId, config, isEnabled, shouldShow, topOffset]);

  useEffect(() => {
    return () => {
      if (isNativeAdMobPlatform() && isNativeBannerShown) {
        isNativeBannerShown = false;
        isNativeBannerHidden = false;
        activeNativeBannerKey = '';
        void AdMob.removeBanner().catch(() => {});
      }
    };
  }, []);

  if (isNativeAdMobPlatform() || !shouldShow) {
    return null;
  }

  const unitSuffix = bannerAdId.split('/').pop() || bannerAdId;
  const resolvedTop = Math.max(54, Math.round(topOffset ?? 58));

  return (
    <View
      pointerEvents="box-none"
      style={[bannerStyles.wrapper, { top: resolvedTop }]}
    >
      <View style={bannerStyles.card}>
        <View style={bannerStyles.leftRow}>
          <View style={bannerStyles.adBadge}>
            <Text style={bannerStyles.adBadgeText}>Ad</Text>
          </View>
          {config?.testAdsEnabled && (
            <View style={bannerStyles.testBadge}>
              <Text style={bannerStyles.testBadgeText}>Test</Text>
            </View>
          )}
          <View style={bannerStyles.textWrap}>
            <Text style={bannerStyles.titleText} numberOfLines={1}>
              {config?.announcementText || 'MastiBase Sponsored Ad'}
            </Text>
            <Text style={bannerStyles.metaText} numberOfLines={1}>
              AdMob Banner · {unitSuffix}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setDismissedForSession(true)}
          style={bannerStyles.closeBtn}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={14} color="rgba(255,255,255,0.72)" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const resolveInterstitialUnitId = (config?: MastiBaseAdsConfig | null): string => {
  if (!config) return '';
  if (config.testAdsEnabled) return GOOGLE_TEST_INTERSTITIAL_UNIT_ID;
  return String(config.interstitialAdUnitId || '').trim();
};

export const useFeedInterstitial = (config?: MastiBaseAdsConfig | null) => {
  const [isInterstitialVisible, setIsInterstitialVisible] = useState(false);
  const [isInterstitialReady, setIsInterstitialReady] = useState(false);
  const isNativePreparedRef = useRef(false);
  const preparePromiseRef = useRef<Promise<boolean> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const interstitialAdId = useMemo(
    () => resolveInterstitialUnitId(config),
    [config],
  );

  const isEnabled = Boolean(
    config?.globalAdsEnabled && (config.testAdsEnabled || interstitialAdId),
  );

  const preloadNativeInterstitial = useCallback(async (): Promise<boolean> => {
    if (!isNativeAdMobPlatform()) {
      const currentCfg = configRef.current;
      const adId = resolveInterstitialUnitId(currentCfg);
      const webReady = Boolean(currentCfg?.globalAdsEnabled && adId);
      setIsInterstitialReady(webReady);
      return webReady;
    }

    if (isNativePreparedRef.current) {
      return true;
    }

    if (preparePromiseRef.current) {
      return await preparePromiseRef.current;
    }

    const currentCfg = configRef.current;
    const adId = resolveInterstitialUnitId(currentCfg);
    if (!currentCfg?.globalAdsEnabled || !adId) {
      return false;
    }

    const promise = (async () => {
      try {
        const ready = await ensureAdMobInitialized(currentCfg);
        if (!ready) return false;
        await AdMob.prepareInterstitial({
          adId,
          isTesting: Boolean(currentCfg.testAdsEnabled),
        });
        isNativePreparedRef.current = true;
        setIsInterstitialReady(true);
        return true;
      } catch (err) {
        console.warn('[AdMob] prepareInterstitial failed:', err);
        isNativePreparedRef.current = false;
        setIsInterstitialReady(false);
        return false;
      } finally {
        preparePromiseRef.current = null;
      }
    })();

    preparePromiseRef.current = promise;
    return await promise;
  }, []);

  useEffect(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!isEnabled) {
      isNativePreparedRef.current = false;
      setIsInterstitialReady(false);
      setIsInterstitialVisible(false);
      return;
    }

    if (!isNativeAdMobPlatform()) {
      setIsInterstitialReady(true);
      return;
    }

    let cancelled = false;
    const listenerHandles: Array<{ remove: () => Promise<void> }> = [];

    const scheduleRetry = () => {
      if (cancelled || retryTimerRef.current) return;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (!cancelled && !isNativePreparedRef.current) {
          void preloadNativeInterstitial();
        }
      }, 10000);
    };

    const setupNativeInterstitial = async () => {
      try {
        const h1 = await AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
          if (!cancelled) {
            isNativePreparedRef.current = true;
            setIsInterstitialReady(true);
          }
        });
        const h2 = await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (err) => {
          console.warn('[AdMob] Interstitial FailedToLoad:', err);
          if (!cancelled) {
            isNativePreparedRef.current = false;
            setIsInterstitialReady(false);
            scheduleRetry();
          }
        });
        const h3 = await AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
          if (!cancelled) {
            isNativePreparedRef.current = false;
            setIsInterstitialReady(false);
            setIsInterstitialVisible(true);
          }
        });
        const h4 = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
          if (!cancelled) {
            setIsInterstitialVisible(false);
            void preloadNativeInterstitial();
          }
        });
        const h5 = await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (err) => {
          console.warn('[AdMob] Interstitial FailedToShow:', err);
          if (!cancelled) {
            isNativePreparedRef.current = false;
            setIsInterstitialReady(false);
            setIsInterstitialVisible(false);
            scheduleRetry();
          }
        });
        listenerHandles.push(h1, h2, h3, h4, h5);
      } catch (err) {
        console.warn('[AdMob] listener registration failed:', err);
      }

      if (!cancelled) {
        const ok = await preloadNativeInterstitial();
        if (!ok && !cancelled) {
          scheduleRetry();
        }
      }
    };

    void setupNativeInterstitial();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      listenerHandles.forEach((h) => {
        void h.remove().catch(() => {});
      });
    };
  }, [interstitialAdId, isEnabled, preloadNativeInterstitial]);

  const showInterstitial = useCallback(async (): Promise<boolean> => {
    const currentCfg = configRef.current;
    const adId = resolveInterstitialUnitId(currentCfg);
    if (!currentCfg?.globalAdsEnabled || !adId || !isNativeAdMobPlatform()) {
      return false;
    }

    try {
      if (!isNativePreparedRef.current) {
        const prepared = await preloadNativeInterstitial();
        if (!prepared || !isNativePreparedRef.current) return false;
      }
      setIsInterstitialVisible(true);
      await AdMob.showInterstitial();
      return true;
    } catch (err) {
      console.warn('[AdMob] showInterstitial failed:', err);
      setIsInterstitialVisible(false);
      isNativePreparedRef.current = false;
      setIsInterstitialReady(false);
      return false;
    }
  }, [preloadNativeInterstitial]);

  return {
    showInterstitial,
    preloadInterstitial: preloadNativeInterstitial,
    isInterstitialVisible,
    isInterstitialReady,
    interstitialAdUnitId: interstitialAdId,
    InterstitialAdModal: null,
  };
};

export const showFeedRewardedAd = async (
  config?: MastiBaseAdsConfig | null,
): Promise<{ rewarded: boolean; type?: string; amount?: number }> => {
  const adId = resolveUnitId(
    config?.rewardedAdUnitId,
    GOOGLE_TEST_REWARDED_UNIT_ID,
    config?.testAdsEnabled,
  );
  if (!config?.globalAdsEnabled || !adId) {
    return { rewarded: false };
  }

  if (!isNativeAdMobPlatform()) {
    return { rewarded: true, type: 'coins', amount: 10 };
  }

  let rewardedResult: { rewarded: boolean; type?: string; amount?: number } = {
    rewarded: false,
  };
  let rewardHandle: { remove: () => Promise<void> } | null = null;

  try {
    const ready = await ensureAdMobInitialized(config);
    if (!ready) return rewardedResult;

    rewardHandle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward) => {
      rewardedResult = {
        rewarded: true,
        type: reward?.type,
        amount: reward?.amount,
      };
    });

    await AdMob.prepareRewardVideoAd({
      adId,
      isTesting: Boolean(config.testAdsEnabled),
    });
    const reward = await AdMob.showRewardVideoAd();
    if (reward) {
      rewardedResult = {
        rewarded: true,
        type: reward.type,
        amount: reward.amount,
      };
    }
    return rewardedResult;
  } catch (err) {
    console.warn('[AdMob] Rewarded ad failed:', err);
    return rewardedResult;
  } finally {
    if (rewardHandle) {
      void rewardHandle.remove().catch(() => {});
    }
  }
};

const bannerStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
    zIndex: 45,
  },
  card: {
    width: '100%',
    maxWidth: 344,
    minHeight: 46,
    backgroundColor: 'rgba(18, 18, 22, 0.88)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  leftRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adBadge: {
    backgroundColor: '#FACC15',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  adBadgeText: {
    color: '#111827',
    fontSize: 10,
    fontWeight: '800',
  },
  testBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
    borderColor: 'rgba(129, 140, 248, 0.6)',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  testBadgeText: {
    color: '#C7D2FE',
    fontSize: 10,
    fontWeight: '700',
  },
  textWrap: {
    flex: 1,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  metaText: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 10,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const interstitialStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 12, 0.96)',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adPill: {
    backgroundColor: '#FACC15',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  adPillText: {
    color: '#111827',
    fontSize: 11,
    fontWeight: '800',
  },
  testPill: {
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
    borderWidth: 1,
    borderColor: '#818CF8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  testPillText: {
    color: '#E0E7FF',
    fontSize: 11,
    fontWeight: '700',
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  closeButtonDisabled: {
    opacity: 0.65,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#16161D',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 24,
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 380,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(254, 44, 85, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  metaBox: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  metaLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  metaValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 4,
  },
  metaFreq: {
    color: '#A5B4FC',
    fontSize: 11,
    fontWeight: '600',
  },
  ctaButton: {
    width: '100%',
    backgroundColor: '#FE2C55',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaButtonDisabled: {
    backgroundColor: 'rgba(254, 44, 85, 0.45)',
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export interface ReelsSponsoredAdItemProps {
  item: SponsoredAdFeedItem;
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
  isActive: boolean;
  overlayBlocked: boolean;
  socialState: ReelsNativeAdSocialState;
  onLike: () => void;
  onComment: () => void;
  onSave: () => void;
  onShare: () => void;
  onSkipAd?: () => void;
  onSkipLockChange?: (locked: boolean) => void;
}

export const ReelsSponsoredAdItem: React.FC<ReelsSponsoredAdItemProps> = ({
  item,
  width,
  height,
  topInset,
  bottomInset,
  isActive,
  overlayBlocked,
  socialState,
  onLike,
  onComment,
  onSave,
  onShare,
  onSkipAd,
  onSkipLockChange,
}) => {
  const isAndroidNative =
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android';

  const requiresSkip = Boolean(item.requiresSkip);
  const initialSkipSeconds = requiresSkip
    ? Math.max(1, Math.floor(item.skipDelaySeconds || 5))
    : 0;
  const [skipSecondsLeft, setSkipSecondsLeft] = useState(initialSkipSeconds);
  const onSkipLockChangeRef = useRef(onSkipLockChange);
  onSkipLockChangeRef.current = onSkipLockChange;

  const skipUnlocked = !requiresSkip || skipSecondsLeft <= 0;

  useEffect(() => {
    setSkipSecondsLeft(initialSkipSeconds);
  }, [item.adSlotKey, initialSkipSeconds]);

  // Countdown tick (pure state updater, zero nested setState calls)
  useEffect(() => {
    if (!requiresSkip || !isActive || overlayBlocked || skipSecondsLeft <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setSkipSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [requiresSkip, isActive, overlayBlocked, skipSecondsLeft <= 0]);

  // Lock parent feed scrolling ONLY while this active 8-video Skip Ad is counting down
  useEffect(() => {
    if (!isActive || overlayBlocked || !requiresSkip || skipUnlocked) {
      return;
    }
    onSkipLockChangeRef.current?.(true);
    return () => {
      onSkipLockChangeRef.current?.(false);
    };
  }, [isActive, overlayBlocked, requiresSkip, skipUnlocked]);

  const topHeaderDp = Math.max(44, Math.round(topInset + 42));
  const statusBarInsetDp = Math.max(12, Math.round(topInset + 8));
  const bottomNavDp = Math.round(90 + bottomInset);

  // Sync Native Android Google Mobile Ads NativeAdView when this ad item is active
  useEffect(() => {
    if (!isAndroidNative) return;
    if (isActive && !overlayBlocked) {
      void ReelsNativeAd.showSlot({
        slotKey: item.adSlotKey,
        topInsetDp: topHeaderDp,
        bottomInsetDp: bottomNavDp,
        statusBarInsetDp,
        translationYDp: 0,
        socialState,
        requiresSkip,
        skipDelaySeconds: initialSkipSeconds,
      }).catch(() => {});
    } else if (isActive && overlayBlocked) {
      void ReelsNativeAd.hideAll().catch(() => {});
    }
  }, [
    isAndroidNative,
    isActive,
    overlayBlocked,
    item.adSlotKey,
    topHeaderDp,
    statusBarInsetDp,
    bottomNavDp,
    requiresSkip,
    initialSkipSeconds,
  ]);

  // Keep right-side Like/Comment/Save/Share state synced to native rail
  useEffect(() => {
    if (!isAndroidNative || !isActive) return;
    void ReelsNativeAd.updateSocialState({
      slotKey: item.adSlotKey,
      socialState,
    }).catch(() => {});
  }, [isAndroidNative, isActive, item.adSlotKey, socialState]);

  if (isAndroidNative) {
    // Native Android renders the real Google Mobile Ads NativeAdView + MediaView + AdChoicesView
    // directly inside the Feed viewport slot while keeping Top Header and BottomNav untouched.
    return (
      <View
        style={[
          reelsAdStyles.fullScreen,
          { width, height, justifyContent: 'center', alignItems: 'center' },
        ]}
        pointerEvents="box-none"
      >
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  const advertiserName =
    item.nativeAd?.advertiser || (item.testMode ? 'Google Test Ad' : 'Sponsored');
  const headline =
    item.nativeAd?.headline || (item.testMode ? 'Google AdMob Test Native Ad' : 'Sponsored Ad');
  const body = item.nativeAd?.body || '';
  const ctaLabel =
    item.nativeAd?.callToAction ||
    item.callToAction ||
    (item.testMode ? 'Install Now' : 'Learn More');
  const brandIconUrl =
    (item.nativeAd as any)?.iconUrl ||
    (item as any).iconUrl ||
    (item as any).brandAvatar ||
    null;
  const adImage =
    (item.nativeAd as any)?.images?.[0]?.url ||
    (item as any).image ||
    (item as any).thumbnail ||
    (item.testMode
      ? 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800'
      : null);

  const ctaBottomOffset = 90 + bottomInset + 12;
  const aboveCtaBottomOffset = ctaBottomOffset + 40 + 14;
  const skipTopOffset = Math.max(54, topInset + 52);

  return (
    <View style={[reelsAdStyles.fullScreen, { width, height }]}>
      <View style={reelsAdStyles.mediaStageBackdrop} pointerEvents="none">
        {adImage ? (
          <Image
            source={{ uri: adImage }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : null}
        <View style={[reelsAdStyles.topGradient, { height: statusBarInsetDp + 76 }]} />
        <View style={reelsAdStyles.bottomGradient} />
      </View>

      {/* Skip Ad Button placed cleanly on the right side just below Search icon */}
      {requiresSkip && (
        <View style={[reelsAdStyles.skipTopRightWrap, { top: skipTopOffset }]}>
          <TouchableOpacity
            onPress={() => {
              if (skipUnlocked) {
                onSkipAd?.();
              }
            }}
            disabled={!skipUnlocked}
            style={[
              reelsAdStyles.skipAdBtn,
              !skipUnlocked && reelsAdStyles.skipAdBtnLocked,
            ]}
            activeOpacity={skipUnlocked ? 0.82 : 1}
            accessibilityLabel={skipUnlocked ? 'Skip Ad' : `Skip Ad in ${skipSecondsLeft}s`}
          >
            <Text
              style={[
                reelsAdStyles.skipAdBtnText,
                !skipUnlocked && reelsAdStyles.skipAdBtnTextLocked,
              ]}
            >
              {skipUnlocked ? 'Skip Ad ›|' : `Skip Ad (${skipSecondsLeft})`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Right-Side Masti Video Like, Comment, Save, Share Icons matching Reel Feed sizes */}
      <View style={[reelsAdStyles.rightActions, { bottom: aboveCtaBottomOffset }]}>
        <TouchableOpacity style={reelsAdStyles.actionItem} onPress={onLike} activeOpacity={0.8}>
          <Ionicons
            name={socialState.liked ? 'heart' : 'heart-outline'}
            size={33}
            color={socialState.liked ? '#FE2C55' : '#FFFFFF'}
          />
          <Text style={reelsAdStyles.actionText}>{socialState.likesCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={reelsAdStyles.actionItem} onPress={onComment} activeOpacity={0.8}>
          <Ionicons name="chatbubble-ellipses" size={31} color="#FFFFFF" />
          <Text style={reelsAdStyles.actionText}>{socialState.commentsCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={reelsAdStyles.actionItem} onPress={onSave} activeOpacity={0.8}>
          <Ionicons
            name={socialState.saved ? 'bookmark' : 'bookmark-outline'}
            size={31}
            color="#FFFFFF"
          />
          <Text style={reelsAdStyles.actionText}>{socialState.savesCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[reelsAdStyles.actionItem, reelsAdStyles.actionItemLast]}
          onPress={onShare}
          activeOpacity={0.8}
        >
          <Ionicons name="paper-plane" size={30} color="#FFFFFF" />
          <Text style={reelsAdStyles.shareActionText}>{socialState.sharesCount}</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom-Left Brand DP + Name + Verified Badge + Headline & Description above CTA */}
      <View style={[reelsAdStyles.bottomInfo, { bottom: aboveCtaBottomOffset }]}>
        <View style={reelsAdStyles.bottomBrandRow}>
          <View style={reelsAdStyles.bottomBrandAvatar}>
            {brandIconUrl ? (
              <Image
                source={{ uri: brandIconUrl }}
                style={reelsAdStyles.brandAvatarImg}
                resizeMode="cover"
              />
            ) : (
              <Text style={reelsAdStyles.bottomBrandAvatarText}>
                {advertiserName.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={reelsAdStyles.bottomBrandMeta}>
            <View style={reelsAdStyles.brandNameRow}>
              <Text style={reelsAdStyles.bottomBrandName} numberOfLines={1}>
                {advertiserName}
              </Text>
              <VerifiedBadge size={15} />
            </View>
            <Text style={reelsAdStyles.bottomSponsoredText}>Sponsored</Text>
          </View>
        </View>
        <Text style={reelsAdStyles.headlineText} numberOfLines={2}>
          {headline}
        </Text>
        {!!body && (
          <Text style={reelsAdStyles.bodyText} numberOfLines={2}>
            {body}
          </Text>
        )}
      </View>

      {/* Full-Width Prominent Blue CTA Button matching Shop Now reference size */}
      <View style={[reelsAdStyles.ctaContainer, { bottom: ctaBottomOffset }]}>
        <TouchableOpacity
          style={reelsAdStyles.ctaBar}
          activeOpacity={0.88}
          onPress={() => {}}
        >
          <Text style={reelsAdStyles.ctaBarText} numberOfLines={1}>{ctaLabel}</Text>
          <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const reelsAdStyles = StyleSheet.create({
  fullScreen: {
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  mediaStageBackdrop: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'linear-gradient(180deg, #10131C 0%, #090B10 50%, #10131C 100%)' } as any)
      : { backgroundColor: '#090B10' }),
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 104,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 100%)' } as any)
      : { backgroundColor: 'rgba(0,0,0,0.3)' }),
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 290,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.42) 60%, rgba(0,0,0,0) 100%)' } as any)
      : { backgroundColor: 'rgba(0,0,0,0.45)' }),
  },
  skipTopRightWrap: {
    position: 'absolute',
    right: 14,
    zIndex: 24,
    alignItems: 'flex-end',
  },
  skipAdBtn: {
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skipAdBtnLocked: {
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderColor: 'rgba(255,255,255,0.42)',
  },
  skipAdBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  skipAdBtnTextLocked: {
    color: 'rgba(255,255,255,0.9)',
  },
  brandAvatarImg: {
    width: '100%',
    height: '100%',
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomBrandMeta: {
    flex: 1,
  },
  bottomSponsoredText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  rightActions: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    zIndex: 20,
  },
  actionItem: {
    alignItems: 'center',
    marginBottom: 15,
  },
  actionItemLast: {
    marginBottom: 0,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 13,
    marginTop: 3,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  shareActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomInfo: {
    position: 'absolute',
    left: 14,
    right: 76,
    zIndex: 20,
  },
  bottomBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  bottomBrandAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 8,
  },
  bottomBrandAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  bottomBrandName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headlineText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bodyText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ctaContainer: {
    position: 'absolute',
    left: 36,
    right: 36,
    zIndex: 15,
  },
  ctaBar: {
    width: '100%',
    height: 40,
    backgroundColor: '#1684FA',
    borderRadius: 20,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  ctaBarText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
});
