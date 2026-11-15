/*
 * Copyright (C) 2026 ColdCoffee contributors.
 * SPDX-License-Identifier: GPL-3.0-only
 */
package com.coldcoffee.mobile;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/** Methods in this class are exposed only to the packaged, controlled asset origin. */
final class NativeBridge {
    private static final int MAX_PROVIDERS = 32;
    private static final int MAX_REQUEST_BYTES = 12 * 1024 * 1024;
    private static final int MAX_RESPONSE_CHARS = 16 * 1024 * 1024;
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9_-]{1,80}");
    private static final Pattern SECRET_FIELD = Pattern.compile(
            "(?i)^(api_?key|access_?token|refresh_?token|token|secret|authorization|pass"
                    + "word|credential|cookie)$");

    private final MainActivity activity;
    private final SecureStore vault;
    private final Object providerLock = new Object();
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final ConcurrentHashMap<String, RequestJob> requests = new ConcurrentHashMap<>();
    private volatile boolean closed;
    private volatile String storageError = "";

    NativeBridge(MainActivity activity) {
        this.activity = activity;
        vault = new SecureStore(activity.getApplicationContext());
    }

    private static JSONObject json(String raw, int maxLength) throws JSONException {
        if (raw == null || raw.length() > maxLength) {
            throw new IllegalArgumentException("输入内容过大，请缩短后重试");
        }
        return new JSONObject(raw);
    }

    private JSONObject providersDocument() throws Exception {
        JSONObject document = vault.read("providers");
        if (!document.has("providers")) document.put("providers", new JSONArray());
        return document;
    }

    private static JSONObject publicProvider(JSONObject item) throws JSONException {
        return new JSONObject()
                .put("id", item.getString("id"))
                .put("name", item.optString("name"))
                .put("baseUrl", item.optString("baseUrl"))
                .put("protocol", item.optString("protocol", "chat"))
                .put("hasKey", !item.optString("apiKey", "").isEmpty());
    }

    @JavascriptInterface
    public String getProviders() {
        synchronized (providerLock) {
            try {
                JSONArray source = providersDocument().getJSONArray("providers");
                JSONArray visible = new JSONArray();
                for (int index = 0; index < source.length(); index++) {
                    visible.put(publicProvider(source.getJSONObject(index)));
                }
                return visible.toString();
            } catch (Exception error) {
                reportStorageError();
                return "[]";
            }
        }
    }

    @JavascriptInterface
    public String saveProvider(String input) {
        synchronized (providerLock) {
            try {
                JSONObject value = json(input, 32 * 1024);
                String id = value.optString("id", "");
                if (id.isEmpty()) id = "p_" + UUID.randomUUID();
                if (!IDENTIFIER.matcher(id).matches()) {
                    throw new IllegalArgumentException("服务商标识格式不正确");
                }
                String name = value.optString("name", "").trim();
                if (name.isEmpty() || name.length() > 60) {
                    throw new IllegalArgumentException("服务商名称请使用 1 至 60 个字符");
                }
                String protocol = value.optString("protocol", "chat");
                if (!protocol.equals("chat") && !protocol.equals("responses")) {
                    throw new IllegalArgumentException("请选择 Chat Completions 或 Responses 协议");
                }
                String baseUrl = EndpointPolicy.normalizeBaseUrl(value.optString("baseUrl", ""), BuildConfig.DEBUG);
                JSONObject document = providersDocument();
                JSONArray original = document.getJSONArray("providers");
                JSONArray updated = new JSONArray();
                JSONObject previous = null;
                for (int index = 0; index < original.length(); index++) {
                    JSONObject item = original.getJSONObject(index);
                    if (id.equals(item.optString("id"))) previous = item;
                    else updated.put(item);
                }
                if (previous == null && updated.length() >= MAX_PROVIDERS) {
                    throw new IllegalArgumentException("最多保存 32 个服务商，请先整理后添加");
                }
                String secret = value.optString("apiKey", "").trim();
                if (secret.isEmpty() && previous != null) secret = previous.optString("apiKey", "");
                if (secret.isEmpty()) throw new IllegalArgumentException("请填写你自己的 API Key");
                if (secret.length() > 4096 || secret.indexOf('\r') >= 0 || secret.indexOf('\n') >= 0) {
                    throw new IllegalArgumentException("API Key 格式不正确");
                }
                JSONObject item = new JSONObject()
                        .put("id", id).put("name", name).put("baseUrl", baseUrl)
                        .put("protocol", protocol).put("apiKey", secret);
                updated.put(item);
                document.put("providers", updated);
                vault.write("providers", document);
                storageError = "";
                return new JSONObject().put("ok", true).put("provider", publicProvider(item)).toString();
            } catch (Exception error) {
                return failure(error);
            }
        }
    }

    @JavascriptInterface
    public String deleteProvider(String id) {
        synchronized (providerLock) {
            try {
                if (id == null || !IDENTIFIER.matcher(id).matches()) {
                    throw new IllegalArgumentException("服务商标识格式不正确");
                }
                for (RequestJob job : requests.values()) {
                    if (job.providerId.equals(id)) job.cancel();
                }
                JSONObject document = providersDocument();
                JSONArray original = document.getJSONArray("providers");
                JSONArray updated = new JSONArray();
                for (int index = 0; index < original.length(); index++) {
                    JSONObject item = original.getJSONObject(index);
                    if (!id.equals(item.optString("id"))) updated.put(item);
                }
                document.put("providers", updated);
                vault.write("providers", document);
                return "{\"ok\":true}";
            } catch (Exception error) {
                return failure(error);
            }
        }
    }

    @JavascriptInterface
    public String getState() {
        try {
            JSONObject state = vault.read("state");
            if (!storageError.isEmpty()) state.put("storageError", storageError);
            return state.toString();
        } catch (Exception error) {
            reportStorageError();
            try {
                return new JSONObject().put("storageError", storageError).toString();
            } catch (JSONException ignored) {
                return "{}";
            }
        }
    }

    @JavascriptInterface
    public String saveState(String input) {
        try {
            JSONObject state = json(input, 16 * 1024 * 1024);
            JSONObject redacted = (JSONObject) removeSecretFields(state);
            // Also mask any configured provider key accidentally pasted into ordinary app state.
            synchronized (providerLock) {
                JSONArray providers = providersDocument().getJSONArray("providers");
                for (int index = 0; index < providers.length(); index++) {
                    String secret = providers.getJSONObject(index).optString("apiKey", "");
                    if (secret.length() >= 8) redacted = (JSONObject) maskKnownSecret(redacted, secret);
                }
                // A read failure must not silently overwrite an existing encrypted conversation.
                vault.read("state");
                vault.write("state", redacted);
            }
            return "{\"ok\":true}";
        } catch (Exception error) {
            return failure(error);
        }
    }

    private static Object removeSecretFields(Object value) throws JSONException {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            JSONObject result = new JSONObject();
            Iterator<String> names = object.keys();
            while (names.hasNext()) {
                String name = names.next();
                if (!SECRET_FIELD.matcher(name).matches()) result.put(name, removeSecretFields(object.get(name)));
            }
            return result;
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            JSONArray result = new JSONArray();
            for (int index = 0; index < array.length(); index++) {
                result.put(removeSecretFields(array.get(index)));
            }
            return result;
        }
        return value;
    }

    private static Object maskKnownSecret(Object value, String secret) throws JSONException {
        if (value instanceof JSONObject) {
            JSONObject source = (JSONObject) value;
            JSONObject result = new JSONObject();
            Iterator<String> names = source.keys();
            while (names.hasNext()) {
                String name = names.next();
                result.put(name, maskKnownSecret(source.get(name), secret));
            }
            return result;
        }
        if (value instanceof JSONArray) {
            JSONArray source = (JSONArray) value;
            JSONArray result = new JSONArray();
            for (int index = 0; index < source.length(); index++) result.put(maskKnownSecret(source.get(index), secret));
            return result;
        }
        return value instanceof String ? ((String) value).replace(secret, "[密钥已隐藏]") : value;
    }

    @JavascriptInterface
    public String startRequest(String input) {
        String id = "r_" + UUID.randomUUID();
        try {
            if (closed) throw new IllegalArgumentException("窗口正在关闭，请重新打开软件");
            JSONObject request = json(input, MAX_REQUEST_BYTES);
            id = request.optString("id", id);
            if (!IDENTIFIER.matcher(id).matches()) {
                throw new IllegalArgumentException("请求标识格式不正确");
            }
            if (requests.size() >= 4) throw new IllegalArgumentException("同时最多运行 4 个请求，请稍后再试");
            String providerId = request.optString("providerId", "");
            String path = request.optString("path", "");
            String method = EndpointPolicy.requestMethod(path, request.optString("method", "GET"));
            JSONObject provider = null;
            synchronized (providerLock) {
                JSONArray providers = providersDocument().getJSONArray("providers");
                for (int index = 0; index < providers.length(); index++) {
                    JSONObject candidate = providers.getJSONObject(index);
                    if (providerId.equals(candidate.optString("id"))) {
                        provider = candidate;
                        break;
                    }
                }
            }
            if (provider == null) throw new IllegalArgumentException("请先保存并选择服务商");
            String secret = provider.optString("apiKey", "");
            if (secret.isEmpty()) throw new IllegalArgumentException("请先填写该服务商的 API Key");
            String endpoint = EndpointPolicy.endpoint(provider.getString("baseUrl"), path, BuildConfig.DEBUG);
            JSONObject body = request.optJSONObject("body");
            byte[] data = body == null ? null : body.toString().getBytes(StandardCharsets.UTF_8);
            if (data != null && data.length > MAX_REQUEST_BYTES) {
                throw new IllegalArgumentException("发送内容过大，请减少图片或上下文后重试");
            }
            RequestJob job = new RequestJob(id, providerId, endpoint, method, secret, data);
            if (requests.putIfAbsent(id, job) != null) {
                throw new IllegalArgumentException("请求已在运行，请使用新的请求标识");
            }
            job.future = executor.submit(job);
        } catch (Exception error) {
            emitError(id, error instanceof IllegalArgumentException ? error.getMessage()
                    : "本机配置读取失败，请检查服务商设置后重试", 0);
        }
        return id;
    }

    @JavascriptInterface
    public void cancelRequest(String id) {
        RequestJob job = requests.get(id);
        if (job != null) job.cancel();
    }

    @JavascriptInterface
    public void copyText(String text) {
        if (text == null || text.length() > 4 * 1024 * 1024) return;
        activity.runOnUiThread(() -> {
            ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            clipboard.setPrimaryClip(ClipData.newPlainText("冷咖啡", text));
        });
    }

    @JavascriptInterface
    public void shareText(String text) {
        if (text == null || text.length() > 1024 * 1024) return;
        activity.runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_TEXT, text);
            activity.startActivity(Intent.createChooser(intent, activity.getString(R.string.share_title)));
        });
    }

    @JavascriptInterface
    public void openExternal(String value) {
        if (!EndpointPolicy.isPublicExternalUrl(value)) return;
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(value))
                        .addCategory(Intent.CATEGORY_BROWSABLE));
            } catch (Exception error) {
                Toast.makeText(activity, "没有可用的浏览器，请先复制链接", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public String getVersion() {
        try {
            return new JSONObject().put("version", BuildConfig.VERSION_NAME)
                    .put("versionCode", BuildConfig.VERSION_CODE)
                    .put("applicationId", BuildConfig.APPLICATION_ID)
                    .put("releaseSigned", BuildConfig.RELEASE_SIGNED)
                    .put("platform", "android").toString();
        } catch (JSONException error) {
            return "{}";
        }
    }

    private void reportStorageError() {
        storageError = "本机加密资料读取失败；原资料仍保留，请重新打开软件后检查";
        activity.runOnUiThread(() -> Toast.makeText(activity, storageError, Toast.LENGTH_LONG).show());
    }

    private static String failure(Exception error) {
        String message = error instanceof IllegalArgumentException ? error.getMessage()
                : "本机加密存储操作失败，原资料已保留；请检查存储空间后重试";
        try {
            return new JSONObject().put("ok", false).put("error", message).toString();
        } catch (JSONException ignored) {
            return "{\"ok\":false,\"error\":\"本机操作失败，请重试\"}";
        }
    }

    private void emit(JSONObject event) {
        if (!closed) activity.dispatchNativeEvent(event);
    }

    private void emitError(String id, String message, int status) {
        try {
            emit(new JSONObject().put("id", id).put("type", "error")
                    .put("message", message == null ? "请求失败，请检查网络后重试" : message)
                    .put("status", status));
        } catch (JSONException ignored) {
            // No credential or request data is logged.
        }
    }

    void close() {
        closed = true;
        for (RequestJob job : requests.values()) job.cancel();
        requests.clear();
        executor.shutdownNow();
    }

    private final class RequestJob implements Runnable {
        final String id;
        final String providerId;
        final String endpoint;
        final String method;
        final String secret;
        final byte[] data;
        final AtomicBoolean terminal = new AtomicBoolean(false);
        volatile boolean cancelled;
        volatile HttpURLConnection connection;
        volatile Future<?> future;

        RequestJob(String id, String providerId, String endpoint, String method,
                   String secret, byte[] data) {
            this.id = id;
            this.providerId = providerId;
            this.endpoint = endpoint;
            this.method = method;
            this.secret = secret;
            this.data = data;
        }

        void cancel() {
            cancelled = true;
            HttpURLConnection active = connection;
            if (active != null) active.disconnect();
            Future<?> running = future;
            if (running != null) running.cancel(true);
            finish("cancelled");
            requests.remove(id, this);
        }

        void finish(String type) {
            if (!terminal.compareAndSet(false, true)) return;
            try {
                emit(new JSONObject().put("id", id).put("type", type));
            } catch (JSONException ignored) {}
        }

        private void fail(String message, int status) {
            if (!terminal.compareAndSet(false, true)) return;
            emitError(id, message, status);
        }

        private void chunk(String text) throws JSONException {
            if (!cancelled && !terminal.get() && !text.isEmpty()) {
                emit(new JSONObject().put("id", id).put("type", "chunk").put("text", text));
            }
        }

        @Override
        public void run() {
            try {
                if (cancelled || closed) return;
                connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setRequestMethod(method);
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(20_000);
                connection.setReadTimeout(120_000);
                connection.setUseCaches(false);
                connection.setRequestProperty("Authorization", "Bearer " + secret);
                connection.setRequestProperty("Accept", "text/event-stream, application/json");
                connection.setRequestProperty("Accept-Encoding", "identity");
                connection.setRequestProperty("User-Agent", "ColdCoffee-Mobile/" + BuildConfig.VERSION_NAME);
                if (data != null && method.equals("POST")) {
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    connection.setDoOutput(true);
                    connection.setFixedLengthStreamingMode(data.length);
                    try (OutputStream output = connection.getOutputStream()) {
                        if (cancelled) return;
                        output.write(data);
                    }
                }
                int status = connection.getResponseCode();
                if (cancelled) return;
                if (status >= 300 && status < 400) {
                    fail("接口发生跳转，请填写最终的 HTTPS API 地址后重试", status);
                    return;
                }
                String contentType = connection.getContentType();
                if (contentType == null) contentType = "application/json";
                emit(new JSONObject().put("id", id).put("type", "headers")
                        .put("status", status).put("contentType", contentType)
                        .put("headers", new JSONObject().put("content-type", contentType)));
                InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                if (input == null) {
                    chunk(status >= 400 ? "{\"error\":{\"message\":\"服务商未返回错误详情\"}}" : "");
                    finish("done");
                    return;
                }
                if (status >= 400) {
                    try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                        byte[] bytes = new byte[2048];
                        int count;
                        while (!cancelled && (count = stream.read(bytes)) != -1) {
                            if (output.size() + count > 64 * 1024) break;
                            output.write(bytes, 0, count);
                        }
                        chunk(redact(new String(output.toByteArray(), StandardCharsets.UTF_8)));
                    }
                } else {
                    try (InputStreamReader reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
                        char[] chars = new char[2048];
                        int count;
                        int total = 0;
                        String pending = "";
                        while (!cancelled && (count = reader.read(chars)) != -1) {
                            total += count;
                            if (total > MAX_RESPONSE_CHARS) {
                                fail("模型响应过大，已停止读取；请减少生成长度后重试", status);
                                return;
                            }
                            String text = pending + new String(chars, 0, count);
                            pending = "";
                            if (!text.isEmpty() && Character.isHighSurrogate(text.charAt(text.length() - 1))) {
                                pending = text.substring(text.length() - 1);
                                text = text.substring(0, text.length() - 1);
                            }
                            chunk(text);
                        }
                        if (!pending.isEmpty()) chunk(pending);
                    }
                }
                if (cancelled) finish("cancelled");
                else finish("done");
            } catch (Exception error) {
                if (cancelled || Thread.currentThread().isInterrupted()) finish("cancelled");
                else if (error instanceof java.net.SocketTimeoutException) {
                    fail("连接或读取超时，请检查网络和服务商状态后重试", 0);
                } else if (error instanceof javax.net.ssl.SSLException) {
                    fail("HTTPS 证书验证失败，请检查服务商证书和手机时间", 0);
                } else {
                    fail("连接失败，请检查 HTTPS 接口地址、网络和服务商状态", 0);
                }
            } finally {
                if (connection != null) connection.disconnect();
                requests.remove(id, this);
            }
        }

        private String redact(String value) {
            return value.replace(secret, "[密钥已隐藏]")
                    .replaceAll("(?i)Bearer\\s+[^\\s\"<>]{8,}", "Bearer [已隐藏]")
                    .replaceAll("\\b(?:sk|sk-proj|ghp|github_pat)[_-][A-Za-z0-9_-]{8,}", "[密钥已隐藏]");
        }
    }
}
