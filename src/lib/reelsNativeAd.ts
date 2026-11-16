import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { MastiBaseAdsConfig } from './mastiBase';

export const GOOGLE_TEST_NATIVE_VIDEO_UNIT_ID = 'ca-app-pub-3940256099942544/1044960115';
export const GOOGLE_TEST_NATIVE_ADVANCED_UNIT_ID = 'ca-app-pub-3940256099942544/2247696110';

export interface ReelsNativeAdSocialState {
  liked: boolean;
  likesCount: number;
  commentsCount: number;
  saved: boolean;
  savesCount: number;
  sharesCount: number;
}

export interface ReelsNativeAdSlotData {
  loaded: boolean;
  slotKey: string;
  adUnitId: string;
  testMode: boolean;
  hasVideo: boolean;
  hasMainImage?: boolean;
  imagesCount?: number;
  advertiser: string;
  headline: string;
  body: string;
  callToAction: string;
  hasIcon: boolean;
  error?: string;
  errorCode?: number;
}

export interface ReelsNativeAdPluginInterface {
  preloadSlot(options: {
    slotKey: string;
    adUnitId: string;
    testMode: boolean;
  }): Promise<ReelsNativeAdSlotData>;
  showSlot(options: {
    slotKey: string;
    topInsetDp: number;
    bottomInsetDp: number;
    statusBarInsetDp?: number;
    translationYDp: number;
    socialState: ReelsNativeAdSocialState;
    requiresSkip?: boolean;
    skipDelaySeconds?: number;
  }): Promise<{ shown: boolean }>;
  updateSlotPosition(options: {
    slotKey: string;
    translationYDp: number;
    visible: boolean;
  }): Promise<void>;
  updateSocialState(options: {
    slotKey: string;
    socialState: ReelsNativeAdSocialState;
  }): Promise<void>;
  hideAll(): Promise<void>;
  destroySlot(options: { slotKey: string }): Promise<void>;
  destroyAll(): Promise<void>;
  addListener(
    eventName: 'adSocialAction',
    listenerFunc: (event: { slotKey: string; action: 'like' | 'comment' | 'save' | 'share' }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'adSkipRequested',
    listenerFunc: (event: { slotKey: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'adSkipUnlocked',
    listenerFunc: (event: { slotKey: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'nativeAdLoaded' | 'nativeAdFailed' | 'nativeAdImpression' | 'nativeAdClicked' | 'nativeAdOpened',
    listenerFunc: (event: any) => void,
  ): Promise<PluginListenerHandle>;
}

const isAndroidNative = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const ReelsNativeAd = registerPlugin<ReelsNativeAdPluginInterface>('ReelsNativeAd', {
  web: () => ({
    async preloadSlot(options) {
      return {
        loaded: true,
        slotKey: options.slotKey,
        adUnitId: options.adUnitId,
        testMode: options.testMode,
        hasVideo: false,
        hasMainImage: false,
        imagesCount: 0,
        advertiser: options.testMode ? 'Google Test Ad' : 'Sponsored',
        headline: options.testMode ? 'Google AdMob Test Native Ad' : 'Sponsored Ad',
        body: '',
        callToAction: options.testMode ? 'Install Now' : 'Learn More',
        hasIcon: false,
      };
    },
    async showSlot() {
      return { shown: false };
    },
    async updateSlotPosition() {},
    async updateSocialState() {},
    async hideAll() {},
    async destroySlot() {},
    async destroyAll() {},
    async addListener() {
      return { remove: async () => {} };
    },
  }),
});

export const resolveReelsNativeAdUnitId = (config?: MastiBaseAdsConfig | null): string => {
  if (!config) return '';
  if (config.testAdsEnabled) return GOOGLE_TEST_NATIVE_VIDEO_UNIT_ID;
  return String(config.nativeAdUnitId || '').trim();
};

export const resolveReelsAdFrequency = (config?: MastiBaseAdsConfig | null): number => {
  const parsed = Number(config?.adFrequency ?? config?.interstitialFrequency ?? 4);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 4;
};

export const isReelsNativeAdsEnabled = (config?: MastiBaseAdsConfig | null): boolean => {
  if (!config?.globalAdsEnabled) return false;
  return Boolean(config.testAdsEnabled || resolveReelsNativeAdUnitId(config));
};

export interface SponsoredAdFeedItem {
  id: string;
  isSponsoredAd: true;
  adSlotKey: string;
  adIndex: number;
  adUnitId: string;
  testMode: boolean;
  requiresSkip: boolean;
  skipDelaySeconds: number;
  nativeAd: ReelsNativeAdSlotData | null;
  user: string;
  name: string;
  title: string;
  desc: string;
  callToAction: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  isLiked: boolean;
  isSaved: boolean;
}

export const injectSponsoredAdsIntoFeed = (
  baseVideos: any[],
  options: {
    tabKey: 'foryou' | 'following';
    enabled: boolean;
    frequency: number;
    adUnitId: string;
    testMode: boolean;
    loadedSlots: Record<string, ReelsNativeAdSlotData>;
    failedSlots: Record<string, boolean>;
    isNative: boolean;
    skipAdEveryVideos?: number;
    skipDelaySeconds?: number;
  },
): any[] => {
  if (!Array.isArray(baseVideos) || baseVideos.length === 0) return [];
  if (!options.enabled || !options.adUnitId) return baseVideos;

  const frequency = Math.max(1, Math.floor(options.frequency || 4));
  const skipEvery = Math.max(0, Math.floor(options.skipAdEveryVideos ?? 8));
  const skipDelay = Math.max(1, Math.floor(options.skipDelaySeconds ?? 5));
  if (baseVideos.length < frequency) return baseVideos;

  const result: any[] = [];
  let normalCount = 0;
  let adSequence = 0;

  for (let i = 0; i < baseVideos.length; i++) {
    const video = baseVideos[i];
    if (!video || video.isSponsoredAd) continue;
    result.push(video);
    normalCount += 1;

    if (normalCount % frequency === 0) {
      const slotKey = `${options.tabKey}_native_ad_${adSequence}`;
      const loadedData = options.loadedSlots[slotKey];
      const hasFailed = Boolean(options.failedSlots[slotKey]);
      const requiresSkip = skipEvery > 0 && normalCount % skipEvery === 0;

      // On Android Native: insert only when a real Google Mobile Ads NativeAd loaded.
      // On Web: keep the sponsored slot at every adFrequency interval.
      const shouldInsert = !hasFailed && (!options.isNative || Boolean(loadedData?.loaded));
      if (shouldInsert) {
        const adItem: SponsoredAdFeedItem = {
          id: slotKey,
          isSponsoredAd: true,
          adSlotKey: slotKey,
          adIndex: adSequence,
          adUnitId: options.adUnitId,
          testMode: options.testMode,
          requiresSkip,
          skipDelaySeconds: requiresSkip ? skipDelay : 0,
          nativeAd: loadedData || null,
          user: loadedData?.advertiser || 'Sponsored',
          name: loadedData?.advertiser || 'Sponsored',
          title: loadedData?.headline || '',
          desc: loadedData?.body || '',
          callToAction: loadedData?.callToAction || 'Learn More',
          likes: 0,
          comments: 0,
          saves: 0,
          shares: 0,
          isLiked: false,
          isSaved: false,
        };
        result.push(adItem);
      }
      adSequence += 1;
    }
  }

  return result;
};

export const useReelsNativeAdManager = (
  adsConfig: MastiBaseAdsConfig | null,
  forYouCount: number,
  followingCount: number,
  activeTab: boolean,
  currentVideoIndex: number,
) => {
  const [loadedSlots, setLoadedSlots] = useState<Record<string, ReelsNativeAdSlotData>>({});
  const [failedSlots, setFailedSlots] = useState<Record<string, boolean>>({});
  const inflightRef = useRef<Set<string>>(new Set());
  const generationRef = useRef(0);

  const enabled = isReelsNativeAdsEnabled(adsConfig);
  const frequency = resolveReelsAdFrequency(adsConfig);
  const adUnitId = resolveReelsNativeAdUnitId(adsConfig);
  const testMode = Boolean(adsConfig?.testAdsEnabled);
  const isNative = isAndroidNative();

  const configSignature = useMemo(
    () => `${enabled}|${adUnitId}|${testMode}|${frequency}`,
    [enabled, adUnitId, testMode, frequency],
  );

  // Reset and re-apply whenever backend Ad Unit ID, Test Mode, or Frequency changes
  useEffect(() => {
    generationRef.current += 1;
    inflightRef.current.clear();
    setLoadedSlots({});
    setFailedSlots({});
    if (isNative) {
      void ReelsNativeAd.destroyAll().catch(() => {});
    }
  }, [configSignature, isNative]);

  const preloadSlotKey = useCallback(
    async (slotKey: string, gen: number) => {
      if (!enabled || !adUnitId) return;
      if (inflightRef.current.has(slotKey)) return;
      inflightRef.current.add(slotKey);
      try {
        const result = await ReelsNativeAd.preloadSlot({
          slotKey,
          adUnitId,
          testMode,
        });
        if (generationRef.current !== gen) return;
        if (result?.loaded) {
          setLoadedSlots((prev) => ({ ...prev, [slotKey]: result }));
          setFailedSlots((prev) => {
            if (!prev[slotKey]) return prev;
            const next = { ...prev };
            delete next[slotKey];
            return next;
          });
        } else {
          setFailedSlots((prev) => ({ ...prev, [slotKey]: true }));
        }
      } catch (err) {
        if (generationRef.current !== gen) return;
        console.warn('[ReelsNativeAd] preloadSlot failed:', slotKey, err);
        setFailedSlots((prev) => ({ ...prev, [slotKey]: true }));
      } finally {
        inflightRef.current.delete(slotKey);
      }
    },
    [enabled, adUnitId, testMode],
  );

  // Proactively preload the next 2 upcoming Ad slots for the active feed
  useEffect(() => {
    if (!enabled || !adUnitId) return;
    const gen = generationRef.current;
    const tabKey = activeTab ? 'following' : 'foryou';
    const count = activeTab ? followingCount : forYouCount;
    const totalPossibleAds = Math.floor(count / frequency);
    if (totalPossibleAds <= 0) return;

    const currentApproxAdIdx = Math.max(0, Math.floor(currentVideoIndex / (frequency + 1)));
    const startIdx = Math.max(0, currentApproxAdIdx);
    const endIdx = Math.min(totalPossibleAds - 1, currentApproxAdIdx + 2);

    for (let idx = startIdx; idx <= endIdx; idx++) {
      const slotKey = `${tabKey}_native_ad_${idx}`;
      if (!loadedSlots[slotKey] && !failedSlots[slotKey] && !inflightRef.current.has(slotKey)) {
        void preloadSlotKey(slotKey, gen);
      }
    }
  }, [
    enabled,
    adUnitId,
    activeTab,
    forYouCount,
    followingCount,
    frequency,
    currentVideoIndex,
    loadedSlots,
    failedSlots,
    preloadSlotKey,
  ]);

  return {
    enabled,
    frequency,
    adUnitId,
    testMode,
    isNative,
    loadedSlots,
    failedSlots,
  };
};
