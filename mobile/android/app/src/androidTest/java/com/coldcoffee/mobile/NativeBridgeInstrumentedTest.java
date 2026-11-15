/*
 * Copyright (C) 2026 ColdCoffee contributors.
 * SPDX-License-Identifier: GPL-3.0-only
 */
package com.coldcoffee.mobile;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

/** Runs against real Android Keystore, WebView, private prefs and URL connections. */
@RunWith(AndroidJUnit4.class)
public class NativeBridgeInstrumentedTest {
    private ActivityScenario<MainActivity> scenario;
    private NativeBridge bridge;
    private MainActivity activity;
    private WebView webView;

    @Before public void setUp() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(context.getSharedPreferences("encrypted_vault_v1", Context.MODE_PRIVATE).edit().clear().commit());
        scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(value -> {
            activity = value;
            bridge = new NativeBridge(value);
            try {
                Field field = MainActivity.class.getDeclaredField("webView");
                field.setAccessible(true);
                webView = (WebView) field.get(value);
            } catch (Exception error) {
                throw new AssertionError(error);
            }
        });
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        boolean ready = false;
        while (System.nanoTime() < deadline) {
            if ("\"complete\"".equals(evaluate("document.readyState"))) {
                ready = true;
                break;
            }
            Thread.sleep(50);
        }
        assertTrue("Packaged interface did not finish loading", ready);
        evaluate("window.__ccNativeTestEvents=[];"
                + "window.addEventListener('coldcoffee:native',e=>window.__ccNativeTestEvents.push(e.detail));'ready'");
    }

    @After public void tearDown() {
        if (bridge != null) bridge.close();
        if (scenario != null) scenario.close();
    }

    @Test public void providerSecretsAreEncryptedAndNeverReturnedOrExportedIntoState() throws Exception {
        String secret = "fixture_" + UUID.randomUUID();
        JSONObject saved = new JSONObject(bridge.saveProvider(new JSONObject()
                .put("id", "provider_one").put("name", "Isolated fixture")
                .put("baseUrl", "https://example.com/v1").put("protocol", "chat")
                .put("apiKey", secret).toString()));
        assertTrue(saved.getBoolean("ok"));
        assertTrue(saved.getJSONObject("provider").getBoolean("hasKey"));
        assertFalse(saved.toString().contains(secret));
        String providers = bridge.getProviders();
        assertFalse(providers.contains(secret));
        assertFalse(providers.contains("apiKey"));
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String disk = context.getSharedPreferences("encrypted_vault_v1", Context.MODE_PRIVATE).getAll().toString();
        assertFalse(disk.contains(secret));
        assertFalse(disk.contains("https://example.com"));
        assertTrue(new JSONObject(bridge.saveState(new JSONObject()
                .put("apiKey", secret).put("message", "accidental " + secret)
                .put("nested", new JSONObject().put("token", secret).put("keep", true)).toString())).getBoolean("ok"));
        JSONObject state = new JSONObject(bridge.getState());
        assertFalse(state.has("apiKey"));
        assertFalse(state.getJSONObject("nested").has("token"));
        assertTrue(state.getJSONObject("nested").getBoolean("keep"));
        assertFalse(state.toString().contains(secret));

        assertTrue(new JSONObject(bridge.saveProvider(new JSONObject()
                .put("id", "provider_one").put("name", "Renamed fixture")
                .put("baseUrl", "https://example.com/v1").put("protocol", "responses")
                .put("apiKey", "").toString())).getBoolean("ok"));
        assertTrue(new JSONArray(bridge.getProviders()).getJSONObject(0).getBoolean("hasKey"));
        assertTrue(new JSONObject(bridge.deleteProvider("provider_one")).getBoolean("ok"));
        assertEquals(0, new JSONArray(bridge.getProviders()).length());
    }

    @Test public void realUrlConnectionReturnsModelsAndCancelsUtf8Stream() throws Exception {
        String secret = "fixture_" + UUID.randomUUID();
        try (FixtureServer server = new FixtureServer(secret)) {
            assertTrue(new JSONObject(bridge.saveProvider(new JSONObject()
                    .put("id", "provider_network").put("name", "Loopback fixture")
                    .put("baseUrl", "http://127.0.0.1:" + server.port() + "/v1")
                    .put("protocol", "chat").put("apiKey", secret).toString())).getBoolean("ok"));
            String modelsId = "models_" + UUID.randomUUID();
            bridge.startRequest(new JSONObject().put("id", modelsId).put("providerId", "provider_network")
                    .put("path", "/models").put("method", "GET").toString());
            JSONArray modelsEvents = waitFor(modelsId, "done", 10);
            assertTrue(joinChunks(modelsEvents).contains("fixture-model"));
            assertEquals(200, findType(modelsEvents, "headers").getInt("status"));
            assertTrue(findType(modelsEvents, "headers").getJSONObject("headers")
                    .getString("content-type").contains("application/json"));

            String chatId = "chat_" + UUID.randomUUID();
            bridge.startRequest(new JSONObject().put("id", chatId).put("providerId", "provider_network")
                    .put("path", "/chat/completions").put("method", "POST")
                    .put("body", new JSONObject().put("model", "fixture-model").put("stream", true)
                            .put("messages", new JSONArray().put(new JSONObject().put("role", "user")
                                    .put("content", "Synthetic test")))).toString());
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            JSONArray chatEvents;
            do {
                chatEvents = eventsFor(chatId);
                if (joinChunks(chatEvents).contains("你好🐈")) break;
                Thread.sleep(50);
            } while (System.nanoTime() < deadline);
            assertTrue("UTF-8 stream text must arrive intact", joinChunks(chatEvents).contains("你好🐈"));
            bridge.cancelRequest(chatId);
            waitFor(chatId, "cancelled", 5);
            assertTrue("Native cancellation must close the upstream connection", server.streamClosed.await(5, TimeUnit.SECONDS));
            assertNull(server.failure.get());
        }
    }

    @Test public void packagedGplTextOpensAndRemoteFetchStaysBlocked() throws Exception {
        evaluate("document.querySelector('#licenses-open').click();'opened'");
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        boolean opened = false;
        while (System.nanoTime() < deadline) {
            String result = evaluate("JSON.stringify({open:document.querySelector('#content-dialog').open,"
                    + "gpl:[...document.querySelectorAll('#content-body pre')].some(p=>"
                    + "p.textContent.includes('GNU GENERAL PUBLIC LICENSE')&&"
                    + "p.textContent.includes('Version 3, 29 June 2007')&&p.textContent.length>30000)})");
            JSONObject value = decodedObject(result);
            if (value.optBoolean("open") && value.optBoolean("gpl")) {
                opened = true;
                break;
            }
            Thread.sleep(50);
        }
        assertTrue("GPL body must load through same-origin WebView fetch in the actual About dialog", opened);
        evaluate("window.__ccRemoteFetch='pending';fetch('https://example.com/')"
                + ".then(()=>window.__ccRemoteFetch='unexpected').catch(()=>window.__ccRemoteFetch='blocked');'started'");
        deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        String remote = "";
        while (System.nanoTime() < deadline) {
            remote = evaluate("window.__ccRemoteFetch");
            if ("\"blocked\"".equals(remote) || "\"unexpected\"".equals(remote)) break;
            Thread.sleep(50);
        }
        assertEquals("Remote fetch must remain blocked by CSP and native resource interception", "\"blocked\"", remote);
    }

    @Test public void selectedContentUriDecodesAsBitmapWithoutGlobalContentAccess() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        Uri image = Uri.parse("content://" + BuildConfig.APPLICATION_ID + ".test-images/sample.png");
        // Exercise the real ACTION_OPEN_DOCUMENT result path without depending on a picker UI.
        Intent reply = new Intent().setData(image).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        IntentFilter filter = new IntentFilter(Intent.ACTION_OPEN_DOCUMENT);
        filter.addCategory(Intent.CATEGORY_OPENABLE);
        filter.addDataType("image/*");
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(
                filter, new Instrumentation.ActivityResult(Activity.RESULT_OK, reply), true);
        try {
            evaluate("window.__ccImageResult={state:'waiting'};"
                    + "const old=document.querySelector('#native-image-fixture');if(old)old.remove();"
                    + "const input=document.createElement('input');input.id='native-image-fixture';input.type='file';"
                    + "input.accept='image/*';input.style.cssText='all:initial;position:fixed!important;"
                    + "left:8px!important;top:8px!important;width:240px!important;height:64px!important;"
                    + "z-index:2147483647!important;opacity:1!important;background:white!important;color:black!important';"
                    + "input.onchange=async()=>{try{const file=input.files[0];if(!file)throw Error('No selected file');"
                    + "const bitmap=await createImageBitmap(file);window.__ccImageResult={state:'ok',width:bitmap.width,"
                    + "height:bitmap.height,type:file.type,size:file.size};bitmap.close();}"
                    + "catch(error){window.__ccImageResult={state:'error',message:String(error)}}};"
                    + "document.body.append(input);'installed'");
            instrumentation.waitForIdleSync();
            int[] position = new int[2];
            AtomicReference<Float> density = new AtomicReference<>(1f);
            scenario.onActivity(value -> {
                webView.getLocationOnScreen(position);
                density.set(value.getResources().getDisplayMetrics().density);
            });
            float x = position[0] + 32 * density.get();
            float y = position[1] + 32 * density.get();
            long downTime = SystemClock.uptimeMillis();
            MotionEvent down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, x, y, 0);
            MotionEvent up = MotionEvent.obtain(downTime, downTime + 80, MotionEvent.ACTION_UP, x, y, 0);
            try {
                instrumentation.sendPointerSync(down);
                instrumentation.sendPointerSync(up);
            } finally {
                down.recycle();
                up.recycle();
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            JSONObject result = new JSONObject();
            while (System.nanoTime() < deadline) {
                result = decodedObject(evaluate("JSON.stringify(window.__ccImageResult)"));
                if (!"waiting".equals(result.optString("state"))) break;
                Thread.sleep(50);
            }
            assertTrue("The real native file chooser must be invoked", monitor.getHits() > 0);
            assertEquals("Selected content:// file must reach createImageBitmap: " + result.optString("message"),
                    "ok", result.optString("state"));
            assertEquals(2, result.getInt("width"));
            assertEquals(3, result.getInt("height"));
            assertEquals("image/png", result.getString("type"));
            assertTrue(result.getInt("size") > 0);
            AtomicReference<Boolean> globalContent = new AtomicReference<>();
            scenario.onActivity(value -> globalContent.set(webView.getSettings().getAllowContentAccess()));
            assertFalse("User-selected content access must not require global content URL access", globalContent.get());
        } finally {
            instrumentation.removeMonitor(monitor);
        }
    }

    private static JSONObject decodedObject(String value) throws Exception {
        return new JSONObject((String) new JSONArray("[" + value + "]").get(0));
    }

    private String evaluate(String code) throws Exception {
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        activity.runOnUiThread(() -> webView.evaluateJavascript(code, value -> {
            result.set(value);
            complete.countDown();
        }));
        assertTrue("WebView evaluation timed out", complete.await(5, TimeUnit.SECONDS));
        return result.get();
    }

    private JSONArray eventsFor(String id) throws Exception {
        String value = evaluate("JSON.stringify((window.__ccNativeTestEvents||[]).filter(e=>e.id===" + JSONObject.quote(id) + "))");
        return new JSONArray((String) new JSONArray("[" + value + "]").get(0));
    }

    private JSONArray waitFor(String id, String type, int timeoutSeconds) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
        JSONArray events;
        do {
            events = eventsFor(id);
            for (int index = 0; index < events.length(); index++) {
                JSONObject event = events.getJSONObject(index);
                if ("error".equals(event.optString("type"))) fail(event.optString("message"));
                if (type.equals(event.optString("type"))) return events;
            }
            Thread.sleep(50);
        } while (System.nanoTime() < deadline);
        throw new AssertionError("Native event timed out: " + type);
    }

    private static JSONObject findType(JSONArray events, String type) throws Exception {
        for (int index = 0; index < events.length(); index++) {
            JSONObject value = events.getJSONObject(index);
            if (type.equals(value.optString("type"))) return value;
        }
        throw new AssertionError("Missing event: " + type);
    }

    private static String joinChunks(JSONArray events) throws Exception {
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < events.length(); index++) {
            JSONObject value = events.getJSONObject(index);
            if ("chunk".equals(value.optString("type"))) result.append(value.optString("text"));
        }
        return result.toString();
    }

    private static final class FixtureServer implements AutoCloseable {
        private final ServerSocket server;
        private final Thread thread;
        private final String secret;
        final CountDownLatch streamClosed = new CountDownLatch(1);
        final AtomicReference<Throwable> failure = new AtomicReference<>();
        private volatile boolean closed;

        FixtureServer(String secret) throws Exception {
            this.secret = secret;
            server = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
            thread = new Thread(() -> {
                try {
                    while (!closed) {
                        try (Socket socket = server.accept()) { handle(socket); }
                    }
                } catch (Throwable error) {
                    if (!closed) failure.set(error);
                }
            }, "ColdCoffee-native-fixture");
            thread.start();
        }
        int port() { return server.getLocalPort(); }
        private void handle(Socket socket) throws Exception {
            socket.setSoTimeout(10_000);
            InputStream input = socket.getInputStream();
            ByteArrayOutputStream headers = new ByteArrayOutputStream();
            int matched = 0, current;
            byte[] delimiter = {'\r', '\n', '\r', '\n'};
            while ((current = input.read()) != -1) {
                headers.write(current);
                if (headers.size() > 32 * 1024) throw new AssertionError("Fixture headers too large");
                matched = current == delimiter[matched] ? matched + 1 : (current == '\r' ? 1 : 0);
                if (matched == 4) break;
            }
            String headerText = headers.toString(StandardCharsets.UTF_8.name());
            if (!headerText.contains("Bearer " + secret)) throw new AssertionError("Fixture credential missing");
            int length = 0;
            for (String line : headerText.split("\r\n")) {
                if (line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) {
                    length = Integer.parseInt(line.substring(line.indexOf(':') + 1).trim());
                }
            }
            for (int index = 0; index < length; index++) if (input.read() == -1) break;
            OutputStream output = socket.getOutputStream();
            if (headerText.startsWith("GET /v1/models ")) {
                byte[] body = "{\"data\":[{\"id\":\"fixture-model\"}]}".getBytes(StandardCharsets.UTF_8);
                output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                        + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                output.write(body); output.flush();
            } else {
                output.write(("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n"
                        + "Cache-Control: no-cache\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                byte[] text = "data: {\"choices\":[{\"delta\":{\"content\":\"你好🐈\"}}]}\n\n"
                        .getBytes(StandardCharsets.UTF_8);
                for (byte value : text) { output.write(value); output.flush(); Thread.sleep(2); }
                // Leave the stream open until the native cancellation closes the real socket.
                if (input.read() == -1) streamClosed.countDown();
            }
        }
        @Override public void close() throws Exception {
            closed = true;
            server.close();
            thread.interrupt();
            thread.join(2000);
        }
    }
}
