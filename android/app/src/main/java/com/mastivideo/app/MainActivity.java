package com.mastivideo.app;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_CODE = 123;
    private int lastTopInsetDp = 0;

    public class WebAppInterface {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finishAffinity();
                }
            });
        }

        @JavascriptInterface
        public void showToast(final String message) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public boolean copyText(final String text) {
            try {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard != null) {
                    ClipData clip = ClipData.newPlainText("Masti Video", text != null ? text : "");
                    clipboard.setPrimaryClip(clip);
                    return true;
                }
            } catch (Exception ignored) {}
            return false;
        }

        @JavascriptInterface
        public boolean openExternalUrl(final String rawUrl) {
            try {
                if (rawUrl == null || rawUrl.trim().isEmpty()) return false;
                final Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(rawUrl.trim()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public void downloadVideo(final String videoUrl, final String fileName, final String requestId) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    boolean success = false;
                    String resultMessage = "Download failed";
                    HttpURLConnection conn = null;
                    InputStream input = null;
                    OutputStream output = null;
                    Uri insertedUri = null;
                    try {
                        if (videoUrl == null || (!videoUrl.startsWith("http://") && !videoUrl.startsWith("https://"))) {
                            throw new IllegalArgumentException("Invalid video URL");
                        }
                        String safeName = (fileName != null && !fileName.trim().isEmpty())
                            ? fileName.trim().replaceAll("[^a-zA-Z0-9._-]", "_")
                            : ("masti_" + System.currentTimeMillis() + ".mp4");
                        if (!safeName.toLowerCase(Locale.US).endsWith(".mp4")) {
                            safeName = safeName + ".mp4";
                        }

                        URL url = new URL(videoUrl);
                        conn = (HttpURLConnection) url.openConnection();
                        conn.setInstanceFollowRedirects(true);
                        conn.setConnectTimeout(20000);
                        conn.setReadTimeout(60000);
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0");
                        conn.connect();

                        int code = conn.getResponseCode();
                        if (code < 200 || code >= 300) {
                            throw new IllegalStateException("HTTP " + code);
                        }

                        input = conn.getInputStream();

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            ContentResolver resolver = getContentResolver();
                            ContentValues values = new ContentValues();
                            values.put(MediaStore.Video.Media.DISPLAY_NAME, safeName);
                            values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
                            values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/MastiVideo");
                            values.put(MediaStore.Video.Media.IS_PENDING, 1);

                            insertedUri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
                            if (insertedUri == null) {
                                throw new IllegalStateException("Could not create MediaStore entry");
                            }
                            output = resolver.openOutputStream(insertedUri);
                            if (output == null) {
                                throw new IllegalStateException("Could not open MediaStore stream");
                            }

                            byte[] buffer = new byte[16384];
                            int bytesRead;
                            while ((bytesRead = input.read(buffer)) != -1) {
                                output.write(buffer, 0, bytesRead);
                            }
                            output.flush();
                            output.close();
                            output = null;

                            ContentValues doneValues = new ContentValues();
                            doneValues.put(MediaStore.Video.Media.IS_PENDING, 0);
                            resolver.update(insertedUri, doneValues, null, null);
                            success = true;
                            resultMessage = "Video gallery mein save ho gayi!";
                        } else {
                            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                            if (downloadsDir != null && !downloadsDir.exists()) {
                                downloadsDir.mkdirs();
                            }
                            File outFile = new File(downloadsDir, safeName);
                            output = new FileOutputStream(outFile);
                            byte[] buffer = new byte[16384];
                            int bytesRead;
                            while ((bytesRead = input.read(buffer)) != -1) {
                                output.write(buffer, 0, bytesRead);
                            }
                            output.flush();
                            output.close();
                            output = null;

                            MediaScannerConnection.scanFile(
                                MainActivity.this,
                                new String[]{outFile.getAbsolutePath()},
                                new String[]{"video/mp4"},
                                null
                            );
                            success = true;
                            resultMessage = "Video Downloads mein save ho gayi!";
                        }
                    } catch (Exception e) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && insertedUri != null) {
                            try {
                                getContentResolver().delete(insertedUri, null, null);
                            } catch (Exception ignored) {}
                        }
                        resultMessage = e.getMessage() != null ? e.getMessage() : "Video download failed";
                    } finally {
                        try { if (input != null) input.close(); } catch (Exception ignored) {}
                        try { if (output != null) output.close(); } catch (Exception ignored) {}
                        try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
                    }

                    final boolean finalSuccess = success;
                    final String finalMsg = resultMessage;
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (bridge != null && bridge.getWebView() != null) {
                                String js = "try{window.__onNativeVideoDownloadResult&&window.__onNativeVideoDownloadResult("
                                    + JSONObject.quote(requestId != null ? requestId : "") + ","
                                    + (finalSuccess ? "true" : "false") + ","
                                    + JSONObject.quote(finalMsg)
                                    + ");}catch(e){}";
                                bridge.getWebView().evaluateJavascript(js, null);
                            }
                        }
                    });
                }
            }).start();
        }
    }

    private void triggerJsBackPress() {
        if (this.bridge != null && this.bridge.getWebView() != null) {
            final String script = "if (window.__handleAndroidBackPress) { window.__handleAndroidBackPress(); } else { window.dispatchEvent(new CustomEvent('hardwareBackPress')); }";
            this.bridge.getWebView().post(new Runnable() {
                @Override
                public void run() {
                    if (bridge != null && bridge.getWebView() != null) {
                        bridge.getWebView().evaluateJavascript(script, null);
                    }
                }
            });
        } else {
            finishAffinity();
        }
    }

    private void applyEdgeToEdgeCutoutMode() {
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().getDecorView().setBackgroundColor(Color.BLACK);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insetsController != null) {
            insetsController.show(WindowInsetsCompat.Type.statusBars());
            insetsController.show(WindowInsetsCompat.Type.navigationBars());
            insetsController.setAppearanceLightStatusBars(false);
            insetsController.setAppearanceLightNavigationBars(false);
        }
    }

    private void pushSafeAreaTopToWebView(int topDp) {
        lastTopInsetDp = Math.max(0, topDp);
        if (this.bridge == null || this.bridge.getWebView() == null) {
            return;
        }
        final String script = String.format(
            Locale.US,
            "try{document.documentElement.style.setProperty('--safe-area-inset-top','%dpx');document.documentElement.style.setProperty('--sat','%dpx');document.documentElement.style.setProperty('--safe-area-inset-bottom','0px');document.documentElement.style.setProperty('--sab','0px');}catch(e){}",
            lastTopInsetDp,
            lastTopInsetDp
        );
        this.bridge.getWebView().post(() -> {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().evaluateJavascript(script, null);
            }
        });
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReelsNativeAdPlugin.class);
        super.onCreate(savedInstanceState);

        applyEdgeToEdgeCutoutMode();

        View decorView = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            // Always reserve the top status bar / front camera strip in solid black
            // across Auto fit, Display front camera, and Hide front camera modes,
            // so the status bar never disappears or gets covered by video content.
            v.setBackgroundColor(Color.BLACK);
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, imeVisible ? ime.bottom : systemBars.bottom);

            pushSafeAreaTopToWebView(0);

            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.of(0, 0, 0, 0))
                .build();
        });
        ViewCompat.requestApplyInsets(decorView);

        // Request runtime permissions securely at startup if needed
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE,
                    Manifest.permission.READ_EXTERNAL_STORAGE
                }, PERMISSION_REQUEST_CODE);
            }
        }

        if (this.bridge != null) {
            this.bridge.addWebViewListener(new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    super.onPageCommitVisible(view, url);
                    pushSafeAreaTopToWebView(lastTopInsetDp);
                }
            });
        }

        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

            WebSettings settings = this.bridge.getWebView().getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);

            this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            boolean cameraGranted = ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
                            boolean audioGranted = ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;

                            if (cameraGranted || audioGranted) {
                                request.grant(request.getResources());
                            } else {
                                request.deny();
                            }
                        }
                    });
                }
            });
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                triggerJsBackPress();
            }
        });
    }

    @Override
    public void onBackPressed() {
        triggerJsBackPress();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyEdgeToEdgeCutoutMode();
        ViewCompat.requestApplyInsets(getWindow().getDecorView());
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyEdgeToEdgeCutoutMode();
            ViewCompat.requestApplyInsets(getWindow().getDecorView());
        }
    }
}
