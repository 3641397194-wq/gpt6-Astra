/*
 * Copyright (C) 2026 ColdCoffee contributors.
 * SPDX-License-Identifier: GPL-3.0-only
 */
package com.coldcoffee.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/assets/index.html";
    private static final int FILE_PICKER_REQUEST = 1701;
    private WebView webView;
    private NativeBridge bridge;
    private ValueCallback<Uri[]> filePickerCallback;
    private boolean destroyed;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(16, 15, 19));
        getWindow().setNavigationBarColor(Color.rgb(16, 15, 19));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(16, 15, 19));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 15, 19));
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        root.requestApplyInsets();

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBlockNetworkLoads(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSafeBrowsingEnabled(true);
        settings.setSaveFormData(false);

        bridge = new NativeBridge(this);
        webView.addJavascriptInterface(bridge, "ColdCoffeeNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isControlledDocument(uri) && request.isForMainFrame()) return false;
                if (request.isForMainFrame()) bridge.openExternal(uri.toString());
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return localAsset(request.getUrl(), request.getMethod());
            }

            @Override
            public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler,
                                           android.net.http.SslError error) {
                handler.cancel();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePickerCallback != null) filePickerCallback.onReceiveValue(null);
                filePickerCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("image/*")
                        .putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                                params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(picker, FILE_PICKER_REQUEST);
                } catch (Exception error) {
                    filePickerCallback.onReceiveValue(null);
                    filePickerCallback = null;
                }
                return true;
            }
        });
        webView.loadUrl(START_URL);
    }

    private static boolean isControlledDocument(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
                && ASSET_HOST.equalsIgnoreCase(uri.getHost())
                && "/assets/index.html".equals(uri.getPath())
                && uri.getUserInfo() == null;
    }

    private WebResourceResponse localAsset(Uri uri, String method) {
        if (!"GET".equals(method) || !"https".equalsIgnoreCase(uri.getScheme())
                || !ASSET_HOST.equalsIgnoreCase(uri.getHost())
                || uri.getUserInfo() != null || uri.getPort() != -1) {
            return response(403, "Forbidden", "text/plain", "Blocked resource");
        }
        String path = uri.getPath();
        if (path == null || !path.startsWith("/assets/")) {
            return response(404, "Not Found", "text/plain", "Missing resource");
        }
        String asset = path.substring("/assets/".length());
        if (asset.isEmpty() || asset.contains("\\") || asset.contains("\u0000")) {
            return response(403, "Forbidden", "text/plain", "Invalid resource");
        }
        for (String segment : asset.split("/")) {
            if (segment.equals("..") || segment.equals(".")) {
                return response(403, "Forbidden", "text/plain", "Invalid resource");
            }
        }
        try {
            InputStream input = getAssets().open(asset);
            Map<String, String> headers = securityHeaders();
            return new WebResourceResponse(mime(asset), "UTF-8", 200, "OK", headers, input);
        } catch (Exception error) {
            return response(404, "Not Found", "text/plain", "Missing packaged resource");
        }
    }

    private static Map<String, String> securityHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Security-Policy", "default-src 'none'; script-src 'self'; "
                + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; "
                + "media-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; "
                + "base-uri 'none'; form-action 'none'; object-src 'none'");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Referrer-Policy", "no-referrer");
        headers.put("Cache-Control", "no-store");
        return headers;
    }

    private static String mime(String asset) {
        String lower = asset.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith("license")) return "text/plain";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".webp")) return "image/webp";
        String guessed = URLConnection.guessContentTypeFromName(asset);
        return guessed == null ? "application/octet-stream" : guessed;
    }

    private static WebResourceResponse response(int status, String reason, String mime, String text) {
        return new WebResourceResponse(mime, "UTF-8", status, reason, securityHeaders(),
                new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)));
    }

    void dispatchNativeEvent(JSONObject detail) {
        String json = detail.toString().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
        runOnUiThread(() -> {
            if (!destroyed && webView != null) {
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('coldcoffee:native',"
                        + "{detail:" + json + "}));", null);
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_PICKER_REQUEST || filePickerCallback == null) return;
        ArrayList<Uri> selected = new ArrayList<>();
        if (resultCode == RESULT_OK && data != null) {
            ClipData clips = data.getClipData();
            if (clips != null) {
                for (int index = 0; index < Math.min(4, clips.getItemCount()); index++) {
                    Uri uri = clips.getItemAt(index).getUri();
                    if ("content".equals(uri.getScheme())) selected.add(uri);
                }
            } else if (data.getData() != null && "content".equals(data.getData().getScheme())) {
                selected.add(data.getData());
            }
        }
        filePickerCallback.onReceiveValue(selected.isEmpty() ? null : selected.toArray(new Uri[0]));
        filePickerCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        if (filePickerCallback != null) {
            filePickerCallback.onReceiveValue(null);
            filePickerCallback = null;
        }
        if (bridge != null) bridge.close();
        if (webView != null) {
            webView.removeJavascriptInterface("ColdCoffeeNative");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
