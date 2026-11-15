/*
 * Copyright (C) 2026 ColdCoffee contributors.
 * SPDX-License-Identifier: GPL-3.0-only
 */
package com.coldcoffee.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Both credentials and app state stay encrypted in this app's private storage. */
final class SecureStore {
    private static final String ALIAS = "com.coldcoffee.mobile.vault.v1";
    private static final String TRANSFORM = "AES/GCM/NoPadding";
    private final SharedPreferences preferences;

    SecureStore(Context context) {
        preferences = context.getSharedPreferences("encrypted_vault_v1", Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    synchronized JSONObject read(String entry) throws Exception {
        String raw = preferences.getString(entry, null);
        if (raw == null) return new JSONObject();
        JSONObject envelope = new JSONObject(raw);
        Cipher cipher = Cipher.getInstance(TRANSFORM);
        cipher.init(Cipher.DECRYPT_MODE, key(),
                new GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)));
        cipher.updateAAD(entry.getBytes(StandardCharsets.UTF_8));
        byte[] plain = cipher.doFinal(Base64.decode(envelope.getString("data"), Base64.NO_WRAP));
        return new JSONObject(new String(plain, StandardCharsets.UTF_8));
    }

    synchronized void write(String entry, JSONObject value) throws Exception {
        byte[] plain = value.toString().getBytes(StandardCharsets.UTF_8);
        if (plain.length > 16 * 1024 * 1024) {
            throw new IllegalArgumentException("保存内容过大，请先整理会话记录");
        }
        Cipher cipher = Cipher.getInstance(TRANSFORM);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD(entry.getBytes(StandardCharsets.UTF_8));
        JSONObject envelope = new JSONObject()
                .put("version", 1)
                .put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .put("data", Base64.encodeToString(cipher.doFinal(plain), Base64.NO_WRAP));
        if (!preferences.edit().putString(entry, envelope.toString()).commit()) {
            throw new GeneralSecurityException("写入本机加密存储失败，请检查可用空间后重试");
        }
    }
}
