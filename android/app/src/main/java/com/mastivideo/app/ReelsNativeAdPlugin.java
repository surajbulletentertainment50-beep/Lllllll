package com.mastivideo.app;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MediaContent;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.gms.ads.VideoController;
import com.google.android.gms.ads.VideoOptions;
import com.google.android.gms.ads.nativead.MediaView;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdOptions;
import com.google.android.gms.ads.nativead.NativeAdView;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "ReelsNativeAd")
public class ReelsNativeAdPlugin extends Plugin {
    private static final String TAG = "ReelsNativeAd";
    private static final String TEST_NATIVE_VIDEO_UNIT_ID = "ca-app-pub-3940256099942544/1044960115";
    private static final String TEST_NATIVE_ADVANCED_UNIT_ID = "ca-app-pub-3940256099942544/2247696110";

    private static class AdSlotEntry {
        final String slotKey;
        final String adUnitId;
        final boolean testMode;
        NativeAd nativeAd;
        SwipePassthroughContainer container;
        NativeAdView nativeAdView;
        MediaView mediaView;
        ImageView fallbackImageView;
        LinearLayout loadingOverlay;
        LinearLayout noMediaFallbackCard;
        TextView muteToggleButton;
        TextView skipAdButton;
        boolean isMuted = true;
        boolean requiresSkip = false;
        boolean skipUnlocked = true;
        int skipRemainingSeconds = 0;
        Runnable skipCountdownRunnable;
        boolean nativeAdBound = false;
        boolean layoutListenerAttached = false;
        SocialRailHolder socialRail;
        boolean isDestroyed = false;

        AdSlotEntry(String slotKey, String adUnitId, boolean testMode) {
            this.slotKey = slotKey;
            this.adUnitId = adUnitId;
            this.testMode = testMode;
        }
    }

    private static class SocialRailHolder {
        LinearLayout root;
        SocialIconView likeIcon;
        TextView likeCount;
        TextView commentCount;
        SocialIconView saveIcon;
        TextView saveCount;
        TextView shareCount;
    }

    private final Map<String, AdSlotEntry> loadedSlots = new HashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<Runnable> pendingInitCallbacks = new ArrayList<>();
    private FrameLayout viewportClipContainer;
    private String activeSlotKey = null;
    private boolean sdkInitialized = false;
    private boolean sdkInitInProgress = false;
    private Boolean initializedTestMode = null;
    private int currentTopInsetDp = 0;
    private int currentBottomInsetDp = 90;
    private int currentStatusBarInsetDp = 24;

    private boolean isActivityUsable() {
        Activity activity = getActivity();
        return activity != null && !activity.isFinishing() && !activity.isDestroyed();
    }

    private void runOnMainThread(Runnable task) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            task.run();
        } else {
            mainHandler.post(task);
        }
    }

    private float getDensity() {
        Context ctx = getActivity() != null ? getActivity() : getContext();
        if (ctx == null) return 1f;
        return ctx.getResources().getDisplayMetrics().density;
    }

    private int dp(float dpValue) {
        return Math.round(dpValue * getDensity());
    }

    private void ensureSdkInitialized(boolean testMode, Runnable onReady, Runnable onError) {
        runOnMainThread(() -> {
            try {
                if (!isActivityUsable()) {
                    onError.run();
                    return;
                }
                if (sdkInitialized && initializedTestMode != null && initializedTestMode == testMode) {
                    onReady.run();
                    return;
                }

                if (initializedTestMode == null || initializedTestMode != testMode) {
                    initializedTestMode = testMode;
                    RequestConfiguration.Builder configBuilder = new RequestConfiguration.Builder();
                    if (testMode) {
                        configBuilder.setTestDeviceIds(Collections.singletonList(AdRequest.DEVICE_ID_EMULATOR));
                    }
                    MobileAds.setRequestConfiguration(configBuilder.build());
                    if (sdkInitialized) {
                        onReady.run();
                        return;
                    }
                }

                pendingInitCallbacks.add(onReady);
                if (sdkInitInProgress) {
                    return;
                }
                sdkInitInProgress = true;

                Context appContext = getActivity().getApplicationContext();
                MobileAds.initialize(appContext, initializationStatus -> runOnMainThread(() -> {
                    sdkInitInProgress = false;
                    sdkInitialized = true;
                    List<Runnable> callbacks = new ArrayList<>(pendingInitCallbacks);
                    pendingInitCallbacks.clear();
                    for (Runnable cb : callbacks) {
                        try {
                            cb.run();
                        } catch (Throwable cbErr) {
                            Log.w(TAG, "Error running MobileAds init callback", cbErr);
                        }
                    }
                }));
            } catch (Throwable err) {
                sdkInitInProgress = false;
                pendingInitCallbacks.clear();
                Log.w(TAG, "MobileAds initialization failed", err);
                onError.run();
            }
        });
    }

    private FrameLayout ensureViewportContainer(int topInsetDp, int bottomInsetDp) {
        if (!isActivityUsable()) return null;
        View webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null || !(webView.getParent() instanceof ViewGroup)) {
            return null;
        }
        ViewGroup parent = (ViewGroup) webView.getParent();
        currentTopInsetDp = Math.max(0, topInsetDp);
        currentBottomInsetDp = Math.max(0, bottomInsetDp);

        if (viewportClipContainer == null) {
            viewportClipContainer = new FrameLayout(getActivity());
            viewportClipContainer.setClipChildren(true);
            viewportClipContainer.setClipToPadding(true);
            viewportClipContainer.setVisibility(View.GONE);
            viewportClipContainer.setBackgroundColor(Color.TRANSPARENT);
            // Let the parent ViewGroup (CoordinatorLayout in Capacitor) generate its own LayoutParams type
            // to avoid ClassCastException during CoordinatorLayout.onMeasure().
            parent.addView(
                viewportClipContainer,
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            );
        }

        ViewGroup.LayoutParams rawLp = viewportClipContainer.getLayoutParams();
        if (rawLp instanceof ViewGroup.MarginLayoutParams) {
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) rawLp;
            mlp.width = ViewGroup.LayoutParams.MATCH_PARENT;
            mlp.height = ViewGroup.LayoutParams.MATCH_PARENT;
            mlp.topMargin = dp(currentTopInsetDp);
            mlp.bottomMargin = dp(currentBottomInsetDp);
            viewportClipContainer.setLayoutParams(mlp);
        }
        viewportClipContainer.bringToFront();
        return viewportClipContainer;
    }

    private static String safeTrim(String value) {
        return value != null ? value.trim() : "";
    }

    private void resolveLoadFailure(PluginCall call, String slotKey, String errorMessage) {
        JSObject res = new JSObject();
        res.put("loaded", false);
        res.put("slotKey", slotKey);
        res.put("error", errorMessage != null ? errorMessage : "NativeAd failed");
        call.resolve(res);
    }

    @PluginMethod
    public void preloadSlot(final PluginCall call) {
        final String slotKey = safeTrim(call.getString("slotKey", ""));
        final String rawAdUnitId = safeTrim(call.getString("adUnitId", ""));
        final boolean testMode = Boolean.TRUE.equals(call.getBoolean("testMode", false));

        if (slotKey.isEmpty()) {
            call.reject("slotKey is required");
            return;
        }

        final String primaryAdUnitId = testMode
            ? TEST_NATIVE_VIDEO_UNIT_ID
            : rawAdUnitId;

        if (primaryAdUnitId.isEmpty()) {
            resolveLoadFailure(call, slotKey, "Missing nativeAdUnitId");
            return;
        }

        if (!isActivityUsable()) {
            resolveLoadFailure(call, slotKey, "Activity unavailable");
            return;
        }

        ensureSdkInitialized(
            testMode,
            () -> loadNativeAdInternal(slotKey, primaryAdUnitId, testMode, true, call),
            () -> resolveLoadFailure(call, slotKey, "MobileAds initialization failed")
        );
    }

    private void loadNativeAdInternal(
        final String slotKey,
        final String adUnitId,
        final boolean testMode,
        final boolean allowTestFallback,
        final PluginCall call
    ) {
        final Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            resolveLoadFailure(call, slotKey, "Activity unavailable");
            return;
        }
        final boolean[] settled = new boolean[]{false};

        try {
            VideoOptions videoOptions = new VideoOptions.Builder()
                .setStartMuted(true)
                .setCustomControlsRequested(false)
                .build();

            NativeAdOptions adOptions = new NativeAdOptions.Builder()
                .setAdChoicesPlacement(NativeAdOptions.ADCHOICES_TOP_RIGHT)
                .setMediaAspectRatio(NativeAdOptions.NATIVE_MEDIA_ASPECT_RATIO_PORTRAIT)
                .setVideoOptions(videoOptions)
                .build();

            AdLoader adLoader = new AdLoader.Builder(activity, adUnitId)
                .forNativeAd(nativeAd -> runOnMainThread(() -> {
                    if (settled[0] || !isActivityUsable()) {
                        try {
                            nativeAd.destroy();
                        } catch (Throwable ignored) {
                        }
                        if (!settled[0]) {
                            settled[0] = true;
                            resolveLoadFailure(call, slotKey, "Activity unavailable");
                        }
                        return;
                    }
                    settled[0] = true;

                    try {
                        destroySlotInternal(slotKey);
                        AdSlotEntry entry = new AdSlotEntry(slotKey, adUnitId, testMode);
                        entry.nativeAd = nativeAd;
                        loadedSlots.put(slotKey, entry);

                        MediaContent mediaContent = nativeAd.getMediaContent();
                        boolean hasVideo = mediaContent != null && mediaContent.hasVideoContent();
                        boolean hasMainImage = mediaContent != null && mediaContent.getMainImage() != null;
                        List<NativeAd.Image> images = nativeAd.getImages();
                        int imagesCount = images != null ? images.size() : 0;

                        JSObject payload = new JSObject();
                        payload.put("loaded", true);
                        payload.put("slotKey", slotKey);
                        payload.put("adUnitId", adUnitId);
                        payload.put("testMode", testMode);
                        payload.put("hasVideo", hasVideo);
                        payload.put("hasMainImage", hasMainImage);
                        payload.put("imagesCount", imagesCount);
                        payload.put("advertiser", nativeAd.getAdvertiser() != null ? nativeAd.getAdvertiser() : "");
                        payload.put("headline", nativeAd.getHeadline() != null ? nativeAd.getHeadline() : "");
                        payload.put("body", nativeAd.getBody() != null ? nativeAd.getBody() : "");
                        payload.put("callToAction", nativeAd.getCallToAction() != null ? nativeAd.getCallToAction() : "");
                        payload.put("hasIcon", nativeAd.getIcon() != null);

                        notifyListeners("nativeAdLoaded", payload);
                        call.resolve(payload);
                    } catch (Throwable err) {
                        Log.w(TAG, "Error handling loaded NativeAd for " + slotKey, err);
                        try {
                            nativeAd.destroy();
                        } catch (Throwable ignored) {
                        }
                        resolveLoadFailure(call, slotKey, err.getMessage());
                    }
                }))
                .withNativeAdOptions(adOptions)
                .withAdListener(new AdListener() {
                    @Override
                    public void onAdFailedToLoad(LoadAdError loadAdError) {
                        runOnMainThread(() -> {
                            if (settled[0]) return;
                            if (testMode && allowTestFallback && !TEST_NATIVE_ADVANCED_UNIT_ID.equals(adUnitId)) {
                                Log.w(TAG, "Test video native ad failed (" + loadAdError.getMessage() + "), retrying with standard native test unit");
                                loadNativeAdInternal(slotKey, TEST_NATIVE_ADVANCED_UNIT_ID, true, false, call);
                                return;
                            }
                            settled[0] = true;
                            Log.w(TAG, "NativeAd failed to load for " + slotKey + ": " + loadAdError.getMessage());
                            JSObject errPayload = new JSObject();
                            errPayload.put("loaded", false);
                            errPayload.put("slotKey", slotKey);
                            errPayload.put("errorCode", loadAdError.getCode());
                            errPayload.put("error", loadAdError.getMessage());
                            notifyListeners("nativeAdFailed", errPayload);
                            call.resolve(errPayload);
                        });
                    }

                    @Override
                    public void onAdImpression() {
                        JSObject ev = new JSObject();
                        ev.put("slotKey", slotKey);
                        notifyListeners("nativeAdImpression", ev);
                    }

                    @Override
                    public void onAdClicked() {
                        JSObject ev = new JSObject();
                        ev.put("slotKey", slotKey);
                        notifyListeners("nativeAdClicked", ev);
                    }

                    @Override
                    public void onAdOpened() {
                        JSObject ev = new JSObject();
                        ev.put("slotKey", slotKey);
                        notifyListeners("nativeAdOpened", ev);
                    }
                })
                .build();

            adLoader.loadAd(new AdRequest.Builder().build());
        } catch (Throwable err) {
            if (!settled[0]) {
                settled[0] = true;
                Log.w(TAG, "AdLoader crashed while loading " + slotKey, err);
                resolveLoadFailure(call, slotKey, err.getMessage());
            }
        }
    }

    @PluginMethod
    public void showSlot(final PluginCall call) {
        final String slotKey = safeTrim(call.getString("slotKey", ""));
        final int topInsetDp = call.getInt("topInsetDp", 0);
        final int bottomInsetDp = call.getInt("bottomInsetDp", 90);
        final int statusBarInsetDp = Math.max(8, call.getInt("statusBarInsetDp", 24));
        final float translationYDp = call.getFloat("translationYDp", 0f);
        final JSObject socialState = call.getObject("socialState", new JSObject());
        final boolean requiresSkip = Boolean.TRUE.equals(call.getBoolean("requiresSkip", false));
        final int skipDelaySeconds = Math.max(1, call.getInt("skipDelaySeconds", 5));

        if (!isActivityUsable()) {
            JSObject res = new JSObject();
            res.put("shown", false);
            call.resolve(res);
            return;
        }

        runOnMainThread(() -> {
            try {
                if (!isActivityUsable()) {
                    JSObject res = new JSObject();
                    res.put("shown", false);
                    call.resolve(res);
                    return;
                }

                AdSlotEntry entry = loadedSlots.get(slotKey);
                if (entry == null || entry.nativeAd == null || entry.isDestroyed) {
                    hideAllInternal();
                    JSObject res = new JSObject();
                    res.put("shown", false);
                    call.resolve(res);
                    return;
                }

                currentStatusBarInsetDp = statusBarInsetDp;
                FrameLayout clip = ensureViewportContainer(topInsetDp, bottomInsetDp);
                if (clip == null) {
                    JSObject res = new JSObject();
                    res.put("shown", false);
                    call.resolve(res);
                    return;
                }

                if (entry.container == null) {
                    buildNativeAdView(entry);
                }
                if (entry.container == null) {
                    JSObject res = new JSObject();
                    res.put("shown", false);
                    call.resolve(res);
                    return;
                }

                for (AdSlotEntry other : loadedSlots.values()) {
                    if (other != entry) {
                        cancelSkipCountdown(other);
                        if (other.container != null) {
                            other.container.setVisibility(View.GONE);
                        }
                    }
                }

                if (entry.container.getParent() != clip) {
                    if (entry.container.getParent() instanceof ViewGroup) {
                        ((ViewGroup) entry.container.getParent()).removeView(entry.container);
                    }
                    clip.addView(entry.container, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    ));
                }

                applySocialStateToHolder(entry.socialRail, socialState);
                entry.container.setTranslationY(translationYDp * getDensity());
                entry.container.setVisibility(View.VISIBLE);
                clip.setVisibility(View.VISIBLE);
                activeSlotKey = slotKey;
                configureSkipStateForSlot(entry, requiresSkip, skipDelaySeconds);

                // Bind NativeAd AFTER container is attached, visible, and measured with non-zero size
                Runnable bindTask = () -> {
                    if (!entry.isDestroyed && slotKey.equals(activeSlotKey) && isActivityUsable()) {
                        bindOrRefreshNativeMedia(entry);
                    }
                };
                if (entry.container.getWidth() > 0 && entry.container.getHeight() > 0) {
                    entry.container.post(bindTask);
                } else if (!entry.layoutListenerAttached) {
                    entry.layoutListenerAttached = true;
                    entry.container.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
                        @Override
                        public void onLayoutChange(
                            View v,
                            int left,
                            int top,
                            int right,
                            int bottom,
                            int oldLeft,
                            int oldTop,
                            int oldRight,
                            int oldBottom
                        ) {
                            if ((right - left) > 0 && (bottom - top) > 0) {
                                v.removeOnLayoutChangeListener(this);
                                entry.layoutListenerAttached = false;
                                v.post(bindTask);
                            }
                        }
                    });
                }

                JSObject res = new JSObject();
                res.put("shown", true);
                call.resolve(res);
            } catch (Throwable err) {
                Log.w(TAG, "showSlot failed for " + slotKey, err);
                JSObject res = new JSObject();
                res.put("shown", false);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void updateSlotPosition(final PluginCall call) {
        final String slotKey = safeTrim(call.getString("slotKey", ""));
        final float translationYDp = call.getFloat("translationYDp", 0f);
        final boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", true));

        if (!isActivityUsable()) {
            call.resolve();
            return;
        }

        runOnMainThread(() -> {
            try {
                AdSlotEntry entry = loadedSlots.get(slotKey);
                if (entry == null || entry.container == null || viewportClipContainer == null) {
                    call.resolve();
                    return;
                }
                if (!visible) {
                    entry.container.setVisibility(View.GONE);
                    if (slotKey.equals(activeSlotKey)) {
                        viewportClipContainer.setVisibility(View.GONE);
                    }
                } else {
                    entry.container.setTranslationY(translationYDp * getDensity());
                    entry.container.setVisibility(View.VISIBLE);
                    viewportClipContainer.setVisibility(View.VISIBLE);
                }
            } catch (Throwable err) {
                Log.w(TAG, "updateSlotPosition failed", err);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void updateSocialState(final PluginCall call) {
        final String slotKey = safeTrim(call.getString("slotKey", ""));
        final JSObject socialState = call.getObject("socialState", new JSObject());
        if (!isActivityUsable()) {
            call.resolve();
            return;
        }
        runOnMainThread(() -> {
            try {
                AdSlotEntry entry = loadedSlots.get(slotKey);
                if (entry != null && entry.socialRail != null) {
                    applySocialStateToHolder(entry.socialRail, socialState);
                }
            } catch (Throwable err) {
                Log.w(TAG, "updateSocialState failed", err);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void hideAll(final PluginCall call) {
        if (!isActivityUsable()) {
            call.resolve();
            return;
        }
        runOnMainThread(() -> {
            try {
                hideAllInternal();
            } catch (Throwable err) {
                Log.w(TAG, "hideAll failed", err);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void destroySlot(final PluginCall call) {
        final String slotKey = safeTrim(call.getString("slotKey", ""));
        if (!isActivityUsable()) {
            call.resolve();
            return;
        }
        runOnMainThread(() -> {
            try {
                destroySlotInternal(slotKey);
            } catch (Throwable err) {
                Log.w(TAG, "destroySlot failed", err);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void destroyAll(final PluginCall call) {
        if (!isActivityUsable()) {
            call.resolve();
            return;
        }
        runOnMainThread(() -> {
            try {
                destroyAllInternal();
            } catch (Throwable err) {
                Log.w(TAG, "destroyAll failed", err);
            }
            call.resolve();
        });
    }

    private void cancelSkipCountdown(AdSlotEntry entry) {
        if (entry == null) return;
        if (entry.skipCountdownRunnable != null) {
            mainHandler.removeCallbacks(entry.skipCountdownRunnable);
            entry.skipCountdownRunnable = null;
        }
        if (entry.container != null) {
            entry.container.setSwipeLocked(false);
        }
    }

    private void updateSkipButtonAppearance(AdSlotEntry entry) {
        if (entry == null || entry.skipAdButton == null) return;
        if (!entry.requiresSkip) {
            entry.skipAdButton.setVisibility(View.GONE);
            return;
        }
        entry.skipAdButton.setVisibility(View.VISIBLE);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(18));
        if (entry.skipUnlocked) {
            entry.skipAdButton.setText("Skip Ad ›|");
            entry.skipAdButton.setTextColor(Color.WHITE);
            bg.setColor(Color.argb(165, 0, 0, 0));
            bg.setStroke(dp(1), Color.argb(185, 255, 255, 255));
        } else {
            entry.skipAdButton.setText("Skip Ad (" + Math.max(1, entry.skipRemainingSeconds) + ")");
            entry.skipAdButton.setTextColor(Color.argb(235, 255, 255, 255));
            bg.setColor(Color.argb(135, 0, 0, 0));
            bg.setStroke(dp(1), Color.argb(110, 255, 255, 255));
        }
        entry.skipAdButton.setBackground(bg);
    }

    private void configureSkipStateForSlot(final AdSlotEntry entry, boolean requiresSkip, int skipDelaySeconds) {
        if (entry == null) return;
        cancelSkipCountdown(entry);

        if (!requiresSkip) {
            entry.requiresSkip = false;
            entry.skipUnlocked = true;
            entry.skipRemainingSeconds = 0;
            if (entry.container != null) {
                entry.container.setSwipeLocked(false);
            }
            updateSkipButtonAppearance(entry);
            return;
        }

        if (!entry.requiresSkip) {
            entry.requiresSkip = true;
            entry.skipUnlocked = false;
            entry.skipRemainingSeconds = Math.max(1, skipDelaySeconds);
        }

        if (entry.skipUnlocked) {
            if (entry.container != null) {
                entry.container.setSwipeLocked(false);
            }
            updateSkipButtonAppearance(entry);
            return;
        }

        if (entry.skipRemainingSeconds <= 0) {
            entry.skipRemainingSeconds = Math.max(1, skipDelaySeconds);
        }
        if (entry.container != null) {
            entry.container.setSwipeLocked(true);
        }
        updateSkipButtonAppearance(entry);

        entry.skipCountdownRunnable = new Runnable() {
            @Override
            public void run() {
                if (entry.isDestroyed || !entry.slotKey.equals(activeSlotKey)) {
                    entry.skipCountdownRunnable = null;
                    return;
                }
                entry.skipRemainingSeconds -= 1;
                if (entry.skipRemainingSeconds <= 0) {
                    entry.skipRemainingSeconds = 0;
                    entry.skipUnlocked = true;
                    entry.skipCountdownRunnable = null;
                    if (entry.container != null) {
                        entry.container.setSwipeLocked(false);
                    }
                    updateSkipButtonAppearance(entry);
                    emitSkipUnlocked(entry.slotKey);
                    return;
                }
                updateSkipButtonAppearance(entry);
                mainHandler.postDelayed(this, 1000L);
            }
        };
        mainHandler.postDelayed(entry.skipCountdownRunnable, 1000L);
    }

    private void hideAllInternal() {
        activeSlotKey = null;
        for (AdSlotEntry entry : loadedSlots.values()) {
            cancelSkipCountdown(entry);
            if (entry.container != null) {
                entry.container.setVisibility(View.GONE);
            }
        }
        if (viewportClipContainer != null) {
            viewportClipContainer.setVisibility(View.GONE);
        }
    }

    private void destroySlotInternal(String slotKey) {
        AdSlotEntry removed = loadedSlots.remove(slotKey);
        if (removed == null) return;
        removed.isDestroyed = true;
        cancelSkipCountdown(removed);
        if (slotKey.equals(activeSlotKey)) {
            activeSlotKey = null;
            if (viewportClipContainer != null) {
                viewportClipContainer.setVisibility(View.GONE);
            }
        }
        try {
            if (removed.fallbackImageView != null) {
                removed.fallbackImageView.setImageDrawable(null);
            }
            if (removed.container != null && removed.container.getParent() instanceof ViewGroup) {
                ((ViewGroup) removed.container.getParent()).removeView(removed.container);
            }
            if (removed.nativeAdView != null) {
                removed.nativeAdView.destroy();
            }
            if (removed.nativeAd != null) {
                removed.nativeAd.destroy();
            }
        } catch (Throwable err) {
            Log.w(TAG, "Error destroying slot " + slotKey, err);
        }
    }

    private void destroyAllInternal() {
        activeSlotKey = null;
        for (String key : new ArrayList<>(loadedSlots.keySet())) {
            destroySlotInternal(key);
        }
        if (viewportClipContainer != null) {
            viewportClipContainer.setVisibility(View.GONE);
        }
    }

    private static Drawable cloneDrawable(Context context, Drawable source) {
        if (source == null) return null;
        try {
            Drawable.ConstantState state = source.getConstantState();
            if (state != null) {
                return state.newDrawable(context != null ? context.getResources() : null).mutate();
            }
        } catch (Throwable ignored) {
        }
        return source;
    }

    private static Drawable extractRealAdImageDrawable(NativeAd nativeAd) {
        if (nativeAd == null) return null;
        MediaContent mc = nativeAd.getMediaContent();
        if (mc != null && mc.getMainImage() != null) {
            return mc.getMainImage();
        }
        List<NativeAd.Image> images = nativeAd.getImages();
        if (images != null) {
            for (NativeAd.Image img : images) {
                if (img != null && img.getDrawable() != null) {
                    return img.getDrawable();
                }
            }
        }
        return null;
    }

    private void bindOrRefreshNativeMedia(final AdSlotEntry entry) {
        if (entry == null || entry.isDestroyed || entry.nativeAd == null || entry.nativeAdView == null || !isActivityUsable()) {
            return;
        }
        try {
            final Context context = getActivity();
            final NativeAd nativeAd = entry.nativeAd;
            final NativeAdView adView = entry.nativeAdView;
            final MediaView mediaView = entry.mediaView;
            final MediaContent mediaContent = nativeAd.getMediaContent();
            final Drawable rawFallbackDrawable = extractRealAdImageDrawable(nativeAd);
            final Drawable realFallbackDrawable = cloneDrawable(context, rawFallbackDrawable);
            final boolean hasVideo = mediaContent != null && mediaContent.hasVideoContent();
            final boolean hasMainImage = mediaContent != null && mediaContent.getMainImage() != null;

            if (!entry.nativeAdBound) {
                entry.nativeAdBound = true;

                if (mediaContent != null && (hasVideo || hasMainImage)) {
                    adView.setMediaView(mediaView);
                    if (realFallbackDrawable != null && entry.fallbackImageView != null) {
                        entry.fallbackImageView.setImageDrawable(realFallbackDrawable);
                        entry.fallbackImageView.setVisibility(View.VISIBLE);
                    }
                    mediaView.setVisibility(View.VISIBLE);
                    if (entry.noMediaFallbackCard != null) {
                        entry.noMediaFallbackCard.setVisibility(View.GONE);
                    }
                } else if (realFallbackDrawable != null && entry.fallbackImageView != null) {
                    // Ad has no MediaContent (or empty MediaContent), use its real image asset as full-screen fallback
                    mediaView.setVisibility(View.GONE);
                    entry.fallbackImageView.setImageDrawable(realFallbackDrawable);
                    entry.fallbackImageView.setVisibility(View.VISIBLE);
                    adView.setImageView(entry.fallbackImageView);
                    if (entry.loadingOverlay != null) {
                        entry.loadingOverlay.setVisibility(View.GONE);
                    }
                    if (entry.noMediaFallbackCard != null) {
                        entry.noMediaFallbackCard.setVisibility(View.GONE);
                    }
                } else {
                    // Ad has neither MediaContent nor Images: show graceful branded card instead of black empty area
                    mediaView.setVisibility(View.GONE);
                    if (entry.fallbackImageView != null) {
                        entry.fallbackImageView.setVisibility(View.GONE);
                    }
                    if (entry.loadingOverlay != null) {
                        entry.loadingOverlay.setVisibility(View.GONE);
                    }
                    if (entry.noMediaFallbackCard != null) {
                        entry.noMediaFallbackCard.setVisibility(View.VISIBLE);
                    }
                }

                // Official NativeAdView binding AFTER view is attached to window
                adView.setNativeAd(nativeAd);

                if (mediaContent != null && (hasVideo || hasMainImage)) {
                    if (mediaView.getMediaContent() == null) {
                        mediaView.setMediaContent(mediaContent);
                    }
                    mediaView.requestLayout();
                    adView.requestLayout();

                    if (hasVideo) {
                        VideoController vc = mediaContent.getVideoController();
                        if (vc != null) {
                            try {
                                vc.mute(entry.isMuted);
                                if (entry.muteToggleButton != null) {
                                    entry.muteToggleButton.setVisibility(View.VISIBLE);
                                    entry.muteToggleButton.setText(entry.isMuted ? "Muted" : "Sound On");
                                }
                                vc.setVideoLifecycleCallbacks(new VideoController.VideoLifecycleCallbacks() {
                                    @Override
                                    public void onVideoStart() {
                                        if (entry.loadingOverlay != null) {
                                            entry.loadingOverlay.setVisibility(View.GONE);
                                        }
                                        if (entry.noMediaFallbackCard != null) {
                                            entry.noMediaFallbackCard.setVisibility(View.GONE);
                                        }
                                        if (entry.fallbackImageView != null && entry.fallbackImageView.getVisibility() == View.VISIBLE) {
                                            entry.fallbackImageView.setAlpha(0.25f);
                                        }
                                    }

                                    @Override
                                    public void onVideoPlay() {
                                        if (entry.loadingOverlay != null) {
                                            entry.loadingOverlay.setVisibility(View.GONE);
                                        }
                                    }

                                    @Override
                                    public void onVideoEnd() {
                                        if (entry.loadingOverlay != null) {
                                            entry.loadingOverlay.setVisibility(View.GONE);
                                        }
                                    }
                                });
                                vc.play();
                            } catch (Throwable ignored) {
                            }
                        }
                        // Safety check: hide loading spinner once MediaView renders or show fallback if empty
                        mediaView.postDelayed(() -> {
                            try {
                                if (entry.isDestroyed || !isActivityUsable()) return;
                                if (entry.loadingOverlay != null) {
                                    entry.loadingOverlay.setVisibility(View.GONE);
                                }
                                if (mediaView.getChildCount() == 0 && realFallbackDrawable == null && entry.noMediaFallbackCard != null) {
                                    mediaView.setVisibility(View.GONE);
                                    entry.noMediaFallbackCard.setVisibility(View.VISIBLE);
                                }
                            } catch (Throwable ignored) {
                            }
                        }, 2500);
                    } else {
                        // Static image ad via MediaView
                        mediaView.postDelayed(() -> {
                            try {
                                if (entry.isDestroyed || !isActivityUsable()) return;
                                if (entry.loadingOverlay != null) {
                                    entry.loadingOverlay.setVisibility(View.GONE);
                                }
                                if (mediaView.getChildCount() == 0 && realFallbackDrawable == null && entry.noMediaFallbackCard != null) {
                                    mediaView.setVisibility(View.GONE);
                                    entry.noMediaFallbackCard.setVisibility(View.VISIBLE);
                                }
                            } catch (Throwable ignored) {
                            }
                        }, 450);
                    }
                }
            } else {
                // Re-attaching or re-displaying an already-bound slot after View.GONE
                mediaView.requestLayout();
                adView.requestLayout();
                if (hasVideo && mediaContent != null) {
                    VideoController vc = mediaContent.getVideoController();
                    if (vc != null) {
                        try {
                            vc.mute(entry.isMuted);
                            vc.play();
                        } catch (Throwable ignored) {
                        }
                    }
                }
                if (entry.loadingOverlay != null) {
                    entry.loadingOverlay.setVisibility(View.GONE);
                }
            }
        } catch (Throwable err) {
            Log.w(TAG, "bindOrRefreshNativeMedia failed for " + entry.slotKey, err);
        }
    }

    private void buildNativeAdView(final AdSlotEntry entry) {
        if (!isActivityUsable() || entry == null || entry.nativeAd == null) {
            return;
        }
        Context context = getActivity();
        NativeAd nativeAd = entry.nativeAd;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;

        SwipePassthroughContainer container = new SwipePassthroughContainer(context, webView);
        container.setBackgroundColor(Color.parseColor("#0B0D14"));

        NativeAdView adView = new NativeAdView(context);
        adView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        adView.setBackground(new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{Color.parseColor("#11131D"), Color.parseColor("#090A0F"), Color.parseColor("#10121B")}
        ));

        // 1. Full-Screen Media Stage (Fallback Real Image -> Official MediaView -> Loading -> Graceful Card)
        FrameLayout mediaStage = new FrameLayout(context);
        mediaStage.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        ImageView fallbackImageView = new ImageView(context);
        fallbackImageView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        fallbackImageView.setVisibility(View.GONE);
        mediaStage.addView(fallbackImageView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        MediaView mediaView = new MediaView(context);
        mediaView.setImageScaleType(ImageView.ScaleType.CENTER_CROP);
        mediaStage.addView(mediaView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            Gravity.CENTER
        ));

        // Loading Indicator while ad video/media buffers
        LinearLayout loadingOverlay = new LinearLayout(context);
        loadingOverlay.setOrientation(LinearLayout.VERTICAL);
        loadingOverlay.setGravity(Gravity.CENTER);
        GradientDrawable loadingBg = new GradientDrawable();
        loadingBg.setColor(Color.argb(170, 16, 18, 28));
        loadingBg.setCornerRadius(dp(14));
        loadingOverlay.setBackground(loadingBg);
        loadingOverlay.setPadding(dp(18), dp(14), dp(18), dp(14));

        ProgressBar progressBar = new ProgressBar(context);
        progressBar.setIndeterminate(true);
        progressBar.setIndeterminateTintList(ColorStateList.valueOf(Color.WHITE));
        LinearLayout.LayoutParams pbLp = new LinearLayout.LayoutParams(dp(28), dp(28));
        loadingOverlay.addView(progressBar, pbLp);

        TextView loadingText = new TextView(context);
        loadingText.setText("Loading ad media...");
        loadingText.setTextColor(Color.argb(220, 255, 255, 255));
        loadingText.setTextSize(12f);
        LinearLayout.LayoutParams ltLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        ltLp.topMargin = dp(8);
        loadingOverlay.addView(loadingText, ltLp);

        FrameLayout.LayoutParams loadingLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        mediaStage.addView(loadingOverlay, loadingLp);

        // Graceful Branded Fallback Card (only shown if ad has zero media/images or media fails)
        LinearLayout noMediaFallbackCard = new LinearLayout(context);
        noMediaFallbackCard.setOrientation(LinearLayout.VERTICAL);
        noMediaFallbackCard.setGravity(Gravity.CENTER);
        GradientDrawable cardBg = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{Color.parseColor("#1A1F33"), Color.parseColor("#111422")}
        );
        cardBg.setCornerRadius(dp(18));
        cardBg.setStroke(dp(1), Color.argb(45, 255, 255, 255));
        noMediaFallbackCard.setBackground(cardBg);
        noMediaFallbackCard.setPadding(dp(22), dp(24), dp(22), dp(24));
        noMediaFallbackCard.setVisibility(View.GONE);

        Drawable rawIconDrawable = nativeAd.getIcon() != null ? nativeAd.getIcon().getDrawable() : null;
        if (rawIconDrawable != null) {
            ImageView centerIcon = new ImageView(context);
            centerIcon.setScaleType(ImageView.ScaleType.CENTER_CROP);
            GradientDrawable centerIconBg = new GradientDrawable();
            centerIconBg.setCornerRadius(dp(18));
            centerIcon.setBackground(centerIconBg);
            centerIcon.setClipToOutline(true);
            centerIcon.setImageDrawable(cloneDrawable(context, rawIconDrawable));
            LinearLayout.LayoutParams ciLp = new LinearLayout.LayoutParams(dp(72), dp(72));
            ciLp.bottomMargin = dp(14);
            noMediaFallbackCard.addView(centerIcon, ciLp);
        }

        String cardBrand = !TextUtils.isEmpty(nativeAd.getAdvertiser())
            ? nativeAd.getAdvertiser()
            : (!TextUtils.isEmpty(nativeAd.getHeadline()) ? nativeAd.getHeadline() : "Sponsored");
        TextView cardTitle = new TextView(context);
        cardTitle.setText(cardBrand);
        cardTitle.setTextColor(Color.WHITE);
        cardTitle.setTextSize(18f);
        cardTitle.setTypeface(Typeface.DEFAULT_BOLD);
        cardTitle.setGravity(Gravity.CENTER);
        noMediaFallbackCard.addView(cardTitle);

        if (!TextUtils.isEmpty(nativeAd.getHeadline()) && !nativeAd.getHeadline().equals(cardBrand)) {
            TextView cardHeadline = new TextView(context);
            cardHeadline.setText(nativeAd.getHeadline());
            cardHeadline.setTextColor(Color.argb(230, 255, 255, 255));
            cardHeadline.setTextSize(14f);
            cardHeadline.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams chLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            chLp.topMargin = dp(6);
            noMediaFallbackCard.addView(cardHeadline, chLp);
        }

        if (nativeAd.getStarRating() != null) {
            TextView ratingTv = new TextView(context);
            ratingTv.setText("Rating " + nativeAd.getStarRating() + " / 5" +
                (!TextUtils.isEmpty(nativeAd.getStore()) ? " · " + nativeAd.getStore() : ""));
            ratingTv.setTextColor(Color.parseColor("#FACC15"));
            ratingTv.setTextSize(12.5f);
            ratingTv.setTypeface(Typeface.DEFAULT_BOLD);
            LinearLayout.LayoutParams rtLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            rtLp.topMargin = dp(8);
            noMediaFallbackCard.addView(ratingTv, rtLp);
        }

        FrameLayout.LayoutParams fallbackCardLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        fallbackCardLp.setMargins(dp(24), dp(80), dp(84), dp(140));
        mediaStage.addView(noMediaFallbackCard, fallbackCardLp);

        adView.addView(mediaStage);

        // Subtle top and bottom dark scrims for crisp readability without dominating the creative
        int statusTopDp = Math.max(10, currentStatusBarInsetDp);
        View topScrim = new View(context);
        topScrim.setBackground(new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{Color.argb(150, 0, 0, 0), Color.TRANSPARENT}
        ));
        adView.addView(topScrim, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(statusTopDp + 68),
            Gravity.TOP
        ));

        View bottomScrim = new View(context);
        bottomScrim.setBackground(new GradientDrawable(
            GradientDrawable.Orientation.BOTTOM_TOP,
            new int[]{Color.argb(210, 0, 0, 0), Color.argb(95, 0, 0, 0), Color.TRANSPARENT}
        ));
        adView.addView(bottomScrim, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(260),
            Gravity.BOTTOM
        ));

        String brandText = !TextUtils.isEmpty(nativeAd.getAdvertiser())
            ? nativeAd.getAdvertiser()
            : (!TextUtils.isEmpty(nativeAd.getHeadline()) ? nativeAd.getHeadline() : "Sponsored");

        // 2. Bottom-Left Brand DP + Name + Verified Badge + Sponsored + Headline + Body (above full-width CTA)
        LinearLayout bottomLeft = new LinearLayout(context);
        bottomLeft.setOrientation(LinearLayout.VERTICAL);
        FrameLayout.LayoutParams bottomLeftLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.START
        );
        bottomLeftLp.setMargins(dp(14), 0, dp(76), dp(66));

        LinearLayout bottomBrandRow = new LinearLayout(context);
        bottomBrandRow.setOrientation(LinearLayout.HORIZONTAL);
        bottomBrandRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams bottomBrandRowLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        bottomBrandRowLp.bottomMargin = dp(6);

        ImageView bottomIconView = new ImageView(context);
        FrameLayout bottomAvatarWrap = createBrandAvatarContainer(
            context,
            cloneDrawable(context, rawIconDrawable),
            brandText,
            36,
            bottomIconView
        );
        LinearLayout.LayoutParams bottomIconLp = new LinearLayout.LayoutParams(dp(36), dp(36));
        bottomIconLp.setMarginEnd(dp(8));
        bottomBrandRow.addView(bottomAvatarWrap, bottomIconLp);
        adView.setIconView(bottomIconView);

        LinearLayout bottomBrandMeta = new LinearLayout(context);
        bottomBrandMeta.setOrientation(LinearLayout.VERTICAL);

        LinearLayout bottomBrandNameRow = new LinearLayout(context);
        bottomBrandNameRow.setOrientation(LinearLayout.HORIZONTAL);
        bottomBrandNameRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView bottomBrandName = new TextView(context);
        bottomBrandName.setText(brandText);
        bottomBrandName.setTextColor(Color.WHITE);
        bottomBrandName.setTextSize(15f);
        bottomBrandName.setTypeface(Typeface.DEFAULT_BOLD);
        bottomBrandName.setMaxLines(1);
        bottomBrandName.setMaxWidth(dp(190));
        bottomBrandName.setEllipsize(TextUtils.TruncateAt.END);
        bottomBrandName.setShadowLayer(4f, 0f, 1f, Color.BLACK);
        bottomBrandNameRow.addView(bottomBrandName, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        adView.setAdvertiserView(bottomBrandName);

        VerifiedBadgeView bottomVerifiedBadge = new VerifiedBadgeView(context);
        LinearLayout.LayoutParams bottomBadgeLp = new LinearLayout.LayoutParams(dp(15), dp(15));
        bottomBadgeLp.setMarginStart(dp(5));
        bottomBrandNameRow.addView(bottomVerifiedBadge, bottomBadgeLp);

        bottomBrandMeta.addView(bottomBrandNameRow);

        TextView sponsoredLabel = new TextView(context);
        sponsoredLabel.setText("Sponsored");
        sponsoredLabel.setTextColor(Color.argb(215, 255, 255, 255));
        sponsoredLabel.setTextSize(11f);
        sponsoredLabel.setShadowLayer(3f, 0f, 1f, Color.BLACK);
        bottomBrandMeta.addView(sponsoredLabel);

        bottomBrandRow.addView(bottomBrandMeta, new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f
        ));

        bottomLeft.addView(bottomBrandRow, bottomBrandRowLp);

        TextView headlineView = new TextView(context);
        headlineView.setText(nativeAd.getHeadline() != null ? nativeAd.getHeadline() : "");
        headlineView.setTextColor(Color.WHITE);
        headlineView.setTextSize(14.5f);
        headlineView.setTypeface(Typeface.DEFAULT_BOLD);
        headlineView.setMaxLines(2);
        headlineView.setEllipsize(TextUtils.TruncateAt.END);
        headlineView.setShadowLayer(4f, 0f, 1f, Color.BLACK);
        headlineView.setVisibility(TextUtils.isEmpty(nativeAd.getHeadline()) ? View.GONE : View.VISIBLE);
        bottomLeft.addView(headlineView);
        adView.setHeadlineView(headlineView);

        TextView bodyView = new TextView(context);
        bodyView.setText(nativeAd.getBody() != null ? nativeAd.getBody() : "");
        bodyView.setTextColor(Color.argb(235, 255, 255, 255));
        bodyView.setTextSize(12f);
        bodyView.setMaxLines(2);
        bodyView.setEllipsize(TextUtils.TruncateAt.END);
        bodyView.setShadowLayer(4f, 0f, 1f, Color.BLACK);
        LinearLayout.LayoutParams bodyLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        bodyLp.topMargin = dp(3);
        bodyView.setVisibility(TextUtils.isEmpty(nativeAd.getBody()) ? View.GONE : View.VISIBLE);
        bottomLeft.addView(bodyView, bodyLp);
        adView.setBodyView(bodyView);

        adView.addView(bottomLeft, bottomLeftLp);

        // 5. Compact Sleek Blue CTA Button (40dp height, inset left/right)
        String rawCtaText = !TextUtils.isEmpty(nativeAd.getCallToAction())
            ? nativeAd.getCallToAction().trim()
            : "Install Now";
        Button ctaButton = new Button(context);
        ctaButton.setText(rawCtaText + "  ›");
        ctaButton.setAllCaps(false);
        ctaButton.setTextColor(Color.WHITE);
        ctaButton.setTextSize(14.5f);
        ctaButton.setTypeface(Typeface.DEFAULT_BOLD);
        ctaButton.setGravity(Gravity.CENTER);
        ctaButton.setSingleLine(true);
        ctaButton.setEllipsize(TextUtils.TruncateAt.END);
        ctaButton.setIncludeFontPadding(false);
        ctaButton.setMinHeight(dp(40));
        ctaButton.setMinimumHeight(dp(40));
        ctaButton.setMinWidth(0);
        ctaButton.setMinimumWidth(0);
        GradientDrawable ctaBg = new GradientDrawable();
        ctaBg.setColor(Color.parseColor("#1684FA"));
        ctaBg.setCornerRadius(dp(20));
        ctaButton.setBackground(ctaBg);
        ctaButton.setPadding(dp(14), 0, dp(14), 0);
        ctaButton.setElevation(dp(4));
        FrameLayout.LayoutParams ctaLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(40),
            Gravity.BOTTOM
        );
        ctaLp.setMargins(dp(36), 0, dp(36), dp(12));
        adView.addView(ctaButton, ctaLp);
        adView.setCallToActionView(ctaButton);

        container.addView(adView);

        // Optional Mute/Unmute + 8-video Skip Ad Controls (placed cleanly below AdChoices)
        LinearLayout topRightControls = new LinearLayout(context);
        topRightControls.setOrientation(LinearLayout.HORIZONTAL);
        topRightControls.setGravity(Gravity.CENTER_VERTICAL);

        TextView muteBtn = new TextView(context);
        muteBtn.setText("Muted");
        muteBtn.setTextColor(Color.WHITE);
        muteBtn.setTextSize(10f);
        muteBtn.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable muteBg = new GradientDrawable();
        muteBg.setColor(Color.argb(150, 0, 0, 0));
        muteBg.setCornerRadius(dp(12));
        muteBg.setStroke(dp(1), Color.argb(75, 255, 255, 255));
        muteBtn.setBackground(muteBg);
        muteBtn.setPadding(dp(9), dp(3.5f), dp(9), dp(3.5f));
        muteBtn.setVisibility(View.GONE);
        muteBtn.setOnClickListener(v -> {
            entry.isMuted = !entry.isMuted;
            muteBtn.setText(entry.isMuted ? "Muted" : "Sound On");
            MediaContent mc = entry.nativeAd != null ? entry.nativeAd.getMediaContent() : null;
            if (mc != null && mc.hasVideoContent() && mc.getVideoController() != null) {
                try {
                    mc.getVideoController().mute(entry.isMuted);
                } catch (Throwable ignored) {
                }
            }
        });
        topRightControls.addView(muteBtn, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView skipAdBtn = new TextView(context);
        skipAdBtn.setText("Skip Ad (5)");
        skipAdBtn.setTextColor(Color.WHITE);
        skipAdBtn.setTextSize(11.5f);
        skipAdBtn.setTypeface(Typeface.DEFAULT_BOLD);
        skipAdBtn.setPadding(dp(12), dp(5.5f), dp(12), dp(5.5f));
        skipAdBtn.setVisibility(View.GONE);
        skipAdBtn.setOnClickListener(v -> {
            if (entry.requiresSkip && entry.skipUnlocked) {
                emitSkipRequested(entry.slotKey);
            }
        });
        LinearLayout.LayoutParams skipBtnLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        skipBtnLp.setMarginStart(dp(6));
        topRightControls.addView(skipAdBtn, skipBtnLp);

        FrameLayout.LayoutParams controlsLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.END
        );
        controlsLp.setMargins(0, dp(8), dp(14), 0);
        container.addView(topRightControls, controlsLp);

        // 4. Right-Side Masti Video Like / Comment / Save / Share Rail (OUTSIDE NativeAdView, above full-width CTA)
        SocialRailHolder rail = createSocialRail(context, entry.slotKey);
        FrameLayout.LayoutParams railLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.END
        );
        railLp.setMargins(0, 0, dp(10), dp(66));
        container.addView(rail.root, railLp);

        entry.container = container;
        entry.nativeAdView = adView;
        entry.mediaView = mediaView;
        entry.fallbackImageView = fallbackImageView;
        entry.loadingOverlay = loadingOverlay;
        entry.noMediaFallbackCard = noMediaFallbackCard;
        entry.muteToggleButton = muteBtn;
        entry.skipAdButton = skipAdBtn;
        entry.socialRail = rail;
    }

    private FrameLayout createBrandAvatarContainer(
        Context context,
        Drawable avatarDrawable,
        String brandName,
        int sizeDp,
        ImageView outImageView
    ) {
        FrameLayout wrapper = new FrameLayout(context);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#1E293B"));
        bg.setCornerRadius(dp(sizeDp / 2f));
        bg.setStroke(dp(1.2f), Color.argb(220, 255, 255, 255));
        wrapper.setBackground(bg);
        wrapper.setClipToOutline(true);

        String initial = !TextUtils.isEmpty(brandName)
            ? brandName.trim().substring(0, 1).toUpperCase()
            : "A";
        TextView initialTv = new TextView(context);
        initialTv.setText(initial);
        initialTv.setTextColor(Color.WHITE);
        initialTv.setTextSize(sizeDp >= 38 ? 15f : 14f);
        initialTv.setTypeface(Typeface.DEFAULT_BOLD);
        initialTv.setGravity(Gravity.CENTER);
        wrapper.addView(initialTv, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        outImageView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        if (avatarDrawable != null) {
            outImageView.setImageDrawable(avatarDrawable);
            outImageView.setVisibility(View.VISIBLE);
        } else {
            outImageView.setVisibility(View.GONE);
        }
        wrapper.addView(outImageView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        return wrapper;
    }

    private SocialRailHolder createSocialRail(Context context, final String slotKey) {
        SocialRailHolder holder = new SocialRailHolder();

        LinearLayout rail = new LinearLayout(context);
        rail.setOrientation(LinearLayout.VERTICAL);
        rail.setGravity(Gravity.CENTER_HORIZONTAL);
        holder.root = rail;

        // Like (Heart size 33 matching Feed)
        SocialIconView likeIcon = new SocialIconView(context, SocialIconView.TYPE_HEART, false);
        TextView likeCount = createActionCountText(context, "0", 13f, true);
        rail.addView(wrapSocialButton(context, likeIcon, 33, likeCount, 3, 15, () -> emitSocialAction(slotKey, "like")));
        holder.likeIcon = likeIcon;
        holder.likeCount = likeCount;

        // Comment (MessageCircleMore size 31 matching Feed)
        SocialIconView commentIcon = new SocialIconView(context, SocialIconView.TYPE_COMMENT, false);
        TextView commentCount = createActionCountText(context, "0", 13f, true);
        rail.addView(wrapSocialButton(context, commentIcon, 31, commentCount, 3, 15, () -> emitSocialAction(slotKey, "comment")));
        holder.commentCount = commentCount;

        // Save (Bookmark size 31 matching Feed)
        SocialIconView saveIcon = new SocialIconView(context, SocialIconView.TYPE_BOOKMARK, false);
        TextView saveCount = createActionCountText(context, "0", 13f, true);
        rail.addView(wrapSocialButton(context, saveIcon, 31, saveCount, 3, 15, () -> emitSocialAction(slotKey, "save")));
        holder.saveIcon = saveIcon;
        holder.saveCount = saveCount;

        // Share (Send size 30 matching Feed)
        SocialIconView shareIcon = new SocialIconView(context, SocialIconView.TYPE_SHARE, false);
        TextView shareCount = createActionCountText(context, "0", 12f, false);
        rail.addView(wrapSocialButton(context, shareIcon, 30, shareCount, 2, 0, () -> emitSocialAction(slotKey, "share")));
        holder.shareCount = shareCount;

        return holder;
    }

    private LinearLayout wrapSocialButton(
        Context context,
        View iconView,
        int iconSizeDp,
        TextView countView,
        int textTopMarginDp,
        int bottomMarginDp,
        Runnable onClick
    ) {
        LinearLayout btn = new LinearLayout(context);
        btn.setOrientation(LinearLayout.VERTICAL);
        btn.setGravity(Gravity.CENTER_HORIZONTAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            dp(54),
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        lp.bottomMargin = dp(bottomMarginDp);
        btn.setLayoutParams(lp);
        btn.setClickable(true);
        btn.setFocusable(true);
        btn.setOnClickListener(v -> onClick.run());

        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(iconSizeDp), dp(iconSizeDp));
        btn.addView(iconView, iconLp);

        LinearLayout.LayoutParams textLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        textLp.topMargin = dp(textTopMarginDp);
        btn.addView(countView, textLp);
        return btn;
    }

    private TextView createActionCountText(Context context, String initialText, float textSizeSp, boolean bold) {
        TextView tv = new TextView(context);
        tv.setText(initialText);
        tv.setTextColor(Color.WHITE);
        tv.setTextSize(textSizeSp);
        tv.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        tv.setShadowLayer(4f, 0f, 1f, Color.argb(220, 0, 0, 0));
        return tv;
    }

    private void applySocialStateToHolder(SocialRailHolder holder, JSObject state) {
        if (holder == null || state == null) return;
        boolean liked = state.optBoolean("liked", false);
        boolean saved = state.optBoolean("saved", false);
        int likes = state.optInt("likesCount", 0);
        int comments = state.optInt("commentsCount", 0);
        int saves = state.optInt("savesCount", 0);
        int shares = state.optInt("sharesCount", 0);

        holder.likeIcon.setActive(liked);
        holder.likeCount.setText(String.valueOf(Math.max(0, likes)));
        holder.commentCount.setText(String.valueOf(Math.max(0, comments)));
        holder.saveIcon.setActive(saved);
        holder.saveCount.setText(String.valueOf(Math.max(0, saves)));
        holder.shareCount.setText(String.valueOf(Math.max(0, shares)));
    }

    private void emitSocialAction(String slotKey, String action) {
        JSObject payload = new JSObject();
        payload.put("slotKey", slotKey);
        payload.put("action", action);
        notifyListeners("adSocialAction", payload);
    }

    private void emitSkipRequested(String slotKey) {
        JSObject payload = new JSObject();
        payload.put("slotKey", slotKey);
        notifyListeners("adSkipRequested", payload);
    }

    private void emitSkipUnlocked(String slotKey) {
        JSObject payload = new JSObject();
        payload.put("slotKey", slotKey);
        notifyListeners("adSkipUnlocked", payload);
    }

    @Override
    protected void handleOnDestroy() {
        destroyAllInternal();
        super.handleOnDestroy();
    }

    /**
     * Forwards vertical/horizontal swipe drags directly to the underlying Capacitor WebView FlatList
     * while preserving genuine taps on NativeAdView CTA, AdChoicesView, MediaView, and the Social Rail.
     * When swipeLocked is true (during the 5-second countdown on 8-video Skip Ads), swipes are blocked.
     */
    private static class SwipePassthroughContainer extends FrameLayout {
        private final WebView webView;
        private final float touchSlop;
        private float downX;
        private float downY;
        private boolean forwardingToWebView = false;
        private volatile boolean swipeLocked = false;
        private MotionEvent savedDownEvent = null;

        SwipePassthroughContainer(Context context, WebView webView) {
            super(context);
            this.webView = webView;
            this.touchSlop = ViewConfiguration.get(context).getScaledTouchSlop();
        }

        void setSwipeLocked(boolean locked) {
            this.swipeLocked = locked;
            if (locked) {
                forwardingToWebView = false;
                if (savedDownEvent != null) {
                    savedDownEvent.recycle();
                    savedDownEvent = null;
                }
            }
        }

        private void forwardEventToWebView(MotionEvent source) {
            if (webView == null || swipeLocked) return;
            int[] selfLoc = new int[2];
            int[] webLoc = new int[2];
            getLocationOnScreen(selfLoc);
            webView.getLocationOnScreen(webLoc);

            MotionEvent copy = MotionEvent.obtain(source);
            copy.offsetLocation(selfLoc[0] - webLoc[0], selfLoc[1] - webLoc[1]);
            webView.dispatchTouchEvent(copy);
            copy.recycle();
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent ev) {
            int action = ev.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) {
                downX = ev.getRawX();
                downY = ev.getRawY();
                forwardingToWebView = false;
                if (savedDownEvent != null) {
                    savedDownEvent.recycle();
                }
                savedDownEvent = swipeLocked ? null : MotionEvent.obtain(ev);
                super.dispatchTouchEvent(ev);
                return true;
            }

            if (action == MotionEvent.ACTION_MOVE) {
                if (swipeLocked) {
                    return true;
                }
                if (!forwardingToWebView) {
                    float dx = Math.abs(ev.getRawX() - downX);
                    float dy = Math.abs(ev.getRawY() - downY);
                    if (dx > touchSlop || dy > touchSlop) {
                        forwardingToWebView = true;
                        MotionEvent cancel = MotionEvent.obtain(ev);
                        cancel.setAction(MotionEvent.ACTION_CANCEL);
                        super.dispatchTouchEvent(cancel);
                        cancel.recycle();

                        if (savedDownEvent != null) {
                            forwardEventToWebView(savedDownEvent);
                            savedDownEvent.recycle();
                            savedDownEvent = null;
                        }
                        forwardEventToWebView(ev);
                        return true;
                    }
                    return super.dispatchTouchEvent(ev);
                } else {
                    forwardEventToWebView(ev);
                    return true;
                }
            }

            if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                if (savedDownEvent != null) {
                    savedDownEvent.recycle();
                    savedDownEvent = null;
                }
                if (forwardingToWebView) {
                    forwardEventToWebView(ev);
                    forwardingToWebView = false;
                    return true;
                }
                return super.dispatchTouchEvent(ev);
            }

            return super.dispatchTouchEvent(ev);
        }
    }

    /** Crisp Lucide vector Canvas icons matching Masti Video's Feed Like / Comment / Save / Share rail 1:1 */
    private static class SocialIconView extends View {
        static final int TYPE_HEART = 1;
        static final int TYPE_COMMENT = 2;
        static final int TYPE_BOOKMARK = 3;
        static final int TYPE_SHARE = 4;

        private final int type;
        private boolean active;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();

        SocialIconView(Context context, int type, boolean active) {
            super(context);
            this.type = type;
            this.active = active;
            setLayerType(LAYER_TYPE_SOFTWARE, null);
        }

        void setActive(boolean active) {
            if (this.active != active) {
                this.active = active;
                invalidate();
            }
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float w = getWidth();
            float h = getHeight();
            if (w <= 0 || h <= 0) return;

            float s = Math.min(w, h) / 24f;
            float strokeW = 2.0f * s;

            path.reset();
            paint.reset();
            paint.setAntiAlias(true);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            paint.setShadowLayer(4f, 0f, 1.5f, Color.argb(185, 0, 0, 0));

            if (type == TYPE_HEART) {
                // Exact Lucide Heart (24x24 viewBox)
                path.moveTo(2f * s, 9.5f * s);
                path.cubicTo(2.0000f * s, 7.2219f * s, 3.4044f * s, 5.1797f * s, 5.5316f * s, 4.3644f * s);
                path.cubicTo(7.6588f * s, 3.5491f * s, 10.0684f * s, 4.1295f * s, 11.5910f * s, 5.8240f * s);
                path.cubicTo(11.6969f * s, 5.9372f * s, 11.8450f * s, 6.0015f * s, 12.0000f * s, 6.0015f * s);
                path.cubicTo(12.1550f * s, 6.0015f * s, 12.3031f * s, 5.9372f * s, 12.4090f * s, 5.8240f * s);
                path.cubicTo(13.9271f * s, 4.1182f * s, 16.3426f * s, 3.5302f * s, 18.4749f * s, 4.3475f * s);
                path.cubicTo(20.6071f * s, 5.1647f * s, 22.0109f * s, 7.2165f * s, 22.0000f * s, 9.5000f * s);
                path.cubicTo(22.0000f * s, 11.7900f * s, 20.5000f * s, 13.5000f * s, 19.0000f * s, 15.0000f * s);
                path.lineTo(13.5080f * s, 20.3130f * s);
                path.cubicTo(13.1311f * s, 20.7459f * s, 12.5863f * s, 20.9960f * s, 12.0123f * s, 20.9996f * s);
                path.cubicTo(11.4383f * s, 21.0033f * s, 10.8904f * s, 20.7601f * s, 10.5080f * s, 20.3320f * s);
                path.lineTo(5.0000f * s, 15.0000f * s);
                path.cubicTo(3.5000f * s, 13.5000f * s, 2.0000f * s, 11.8000f * s, 2.0000f * s, 9.5000f * s);
                path.close();

                if (active) {
                    paint.setStyle(Paint.Style.FILL);
                    paint.setColor(Color.parseColor("#FE2C55"));
                    canvas.drawPath(path, paint);
                } else {
                    paint.setStyle(Paint.Style.STROKE);
                    paint.setStrokeWidth(strokeW);
                    paint.setColor(Color.WHITE);
                    canvas.drawPath(path, paint);
                }
            } else if (type == TYPE_COMMENT) {
                // Exact Lucide MessageCircleMore (outline bubble + 3 dots)
                path.moveTo(2.992f * s, 16.342f * s);
                path.cubicTo(3.1390f * s, 16.7129f * s, 3.1718f * s, 17.1193f * s, 3.0860f * s, 17.5090f * s);
                path.lineTo(2.0210f * s, 20.7990f * s);
                path.cubicTo(1.9512f * s, 21.1382f * s, 2.0619f * s, 21.4894f * s, 2.3137f * s, 21.7273f * s);
                path.cubicTo(2.5654f * s, 21.9651f * s, 2.9223f * s, 22.0558f * s, 3.2570f * s, 21.9670f * s);
                path.lineTo(6.6700f * s, 20.9690f * s);
                path.cubicTo(7.0377f * s, 20.8961f * s, 7.4185f * s, 20.9279f * s, 7.7690f * s, 21.0610f * s);
                path.cubicTo(12.1775f * s, 23.1198f * s, 17.4280f * s, 21.7067f * s, 20.2077f * s, 17.7134f * s);
                path.cubicTo(22.9874f * s, 13.7200f * s, 22.4895f * s, 8.3056f * s, 19.0281f * s, 4.8862f * s);
                path.cubicTo(15.5667f * s, 1.4668f * s, 10.1465f * s, 1.0351f * s, 6.1874f * s, 3.8633f * s);
                path.cubicTo(2.2284f * s, 6.6916f * s, 0.8795f * s, 11.9590f * s, 2.9920f * s, 16.3420f * s);
                path.close();

                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(strokeW);
                paint.setColor(Color.WHITE);
                canvas.drawPath(path, paint);

                // 3 horizontal dots inside bubble
                paint.setStyle(Paint.Style.FILL);
                paint.setColor(Color.WHITE);
                float dotR = 1.15f * s;
                canvas.drawCircle(8f * s, 12f * s, dotR, paint);
                canvas.drawCircle(12f * s, 12f * s, dotR, paint);
                canvas.drawCircle(16f * s, 12f * s, dotR, paint);
            } else if (type == TYPE_BOOKMARK) {
                // Exact Lucide Bookmark (rounded top corners)
                path.moveTo(19f * s, 21f * s);
                path.lineTo(12f * s, 17f * s);
                path.lineTo(5f * s, 21f * s);
                path.lineTo(5f * s, 5f * s);
                path.cubicTo(5.0f * s, 3.8954f * s, 5.8954f * s, 3.0f * s, 7.0f * s, 3.0f * s);
                path.lineTo(17f * s, 3f * s);
                path.cubicTo(18.1046f * s, 3.0f * s, 19.0f * s, 3.8954f * s, 19.0f * s, 5.0f * s);
                path.close();

                if (active) {
                    paint.setStyle(Paint.Style.FILL);
                    paint.setColor(Color.WHITE);
                    canvas.drawPath(path, paint);
                } else {
                    paint.setStyle(Paint.Style.STROKE);
                    paint.setStrokeWidth(strokeW);
                    paint.setColor(Color.WHITE);
                    canvas.drawPath(path, paint);
                }
            } else if (type == TYPE_SHARE) {
                // Exact Lucide Send (outline tilted paper-plane + inner fold line)
                path.moveTo(14.536f * s, 21.686f * s);
                path.cubicTo(14.6138f * s, 21.8799f * s, 14.8040f * s, 22.0050f * s, 15.0128f * s, 21.9996f * s);
                path.cubicTo(15.2217f * s, 21.9943f * s, 15.4052f * s, 21.8596f * s, 15.4730f * s, 21.6620f * s);
                path.lineTo(21.9730f * s, 2.6620f * s);
                path.cubicTo(22.0383f * s, 2.4811f * s, 21.9932f * s, 2.2788f * s, 21.8572f * s, 2.1428f * s);
                path.cubicTo(21.7212f * s, 2.0068f * s, 21.5189f * s, 1.9617f * s, 21.3380f * s, 2.0270f * s);
                path.lineTo(2.3380f * s, 8.5270f * s);
                path.cubicTo(2.1404f * s, 8.5948f * s, 2.0057f * s, 8.7783f * s, 2.0004f * s, 8.9872f * s);
                path.cubicTo(1.9950f * s, 9.1960f * s, 2.1201f * s, 9.3862f * s, 2.3140f * s, 9.4640f * s);
                path.lineTo(10.2440f * s, 12.6440f * s);
                path.cubicTo(10.7506f * s, 12.8468f * s, 11.1523f * s, 13.2478f * s, 11.3560f * s, 13.7540f * s);
                path.close();

                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(strokeW);
                paint.setColor(Color.WHITE);
                canvas.drawPath(path, paint);

                // Inner fold line
                canvas.drawLine(21.854f * s, 2.147f * s, 10.914f * s, 13.086f * s, paint);
            }
        }
    }

    /** Crisp scalloped Verified Badge matching VerifiedBadge.tsx */
    private static class VerifiedBadgeView extends View {
        private final Paint sealPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint checkPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path sealPath = new Path();
        private final Path checkPath = new Path();

        VerifiedBadgeView(Context context) {
            super(context);
            sealPaint.setStyle(Paint.Style.FILL);
            sealPaint.setColor(Color.parseColor("#0095F6"));
            checkPaint.setStyle(Paint.Style.STROKE);
            checkPaint.setColor(Color.WHITE);
            checkPaint.setStrokeCap(Paint.Cap.ROUND);
            checkPaint.setStrokeJoin(Paint.Join.ROUND);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float w = getWidth();
            float h = getHeight();
            if (w <= 0 || h <= 0) return;
            float s = Math.min(w, h) / 24f;

            sealPath.reset();
            sealPath.moveTo(20.82f * s, 8.35f * s);
            sealPath.quadTo(25.10f * s, 12.00f * s, 20.82f * s, 15.65f * s);
            sealPath.quadTo(21.26f * s, 21.26f * s, 15.65f * s, 20.82f * s);
            sealPath.quadTo(12.00f * s, 25.10f * s, 8.35f * s, 20.82f * s);
            sealPath.quadTo(2.74f * s, 21.26f * s, 3.18f * s, 15.65f * s);
            sealPath.quadTo(-1.10f * s, 12.00f * s, 3.18f * s, 8.35f * s);
            sealPath.quadTo(2.74f * s, 2.74f * s, 8.35f * s, 3.18f * s);
            sealPath.quadTo(12.00f * s, -1.10f * s, 15.65f * s, 3.18f * s);
            sealPath.quadTo(21.26f * s, 2.74f * s, 20.82f * s, 8.35f * s);
            sealPath.close();
            canvas.drawPath(sealPath, sealPaint);

            checkPaint.setStrokeWidth(2.35f * s);
            checkPath.reset();
            checkPath.moveTo(8.15f * s, 12.25f * s);
            checkPath.lineTo(10.75f * s, 14.85f * s);
            checkPath.lineTo(16.10f * s, 9.35f * s);
            canvas.drawPath(checkPath, checkPaint);
        }
    }
}
