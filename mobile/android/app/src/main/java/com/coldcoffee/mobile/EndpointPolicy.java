/*
 * Copyright (C) 2026 ColdCoffee contributors.
 * SPDX-License-Identifier: GPL-3.0-only
 */
package com.coldcoffee.mobile;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Shared, deterministic validation for customer-selected HTTPS providers. */
final class EndpointPolicy {
    private static final Set<String> REQUEST_PATHS =
            new HashSet<>(Arrays.asList("/models", "/chat/completions", "/responses"));
    private static final String[] ENDPOINT_SUFFIXES =
            {"/chat/completions", "/responses", "/models"};

    private EndpointPolicy() {}

    static String normalizeBaseUrl(String candidate) {
        return normalizeBaseUrl(candidate, false);
    }

    static String normalizeBaseUrl(String candidate, boolean allowDebugLoopback) {
        if (candidate == null || candidate.length() > 2048) {
            throw new IllegalArgumentException("请输入有效的 HTTPS 接口地址");
        }
        try {
            URI parsed = new URI(candidate.trim()).normalize();
            boolean debugHttp = allowDebugLoopback && "http".equalsIgnoreCase(parsed.getScheme())
                    && isLoopback(parsed.getHost());
            if (!("https".equalsIgnoreCase(parsed.getScheme()) || debugHttp)
                    || parsed.getHost() == null || parsed.getHost().isEmpty()
                    || parsed.getRawUserInfo() != null || parsed.getRawQuery() != null
                    || parsed.getRawFragment() != null || parsed.getPort() > 65535
                    || parsed.getPort() == 0) {
                throw new IllegalArgumentException("接口地址须使用 HTTPS，且不包含账号、查询参数或片段");
            }
            String path = parsed.getRawPath() == null ? "" : parsed.getRawPath();
            while (path.endsWith("/")) path = path.substring(0, path.length() - 1);
            for (String suffix : ENDPOINT_SUFFIXES) {
                if (path.endsWith(suffix)) {
                    path = path.substring(0, path.length() - suffix.length());
                    break;
                }
            }
            while (path.endsWith("/v1/v1")) path = path.substring(0, path.length() - 3);
            if (path.isEmpty()) path = "/v1";
            return new URI(debugHttp ? "http" : "https", null, parsed.getHost().toLowerCase(Locale.ROOT),
                    parsed.getPort(), null, null, null).toASCIIString() + path;
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("请输入有效的 HTTPS 接口地址");
        }
    }

    static String endpoint(String baseUrl, String path) {
        return endpoint(baseUrl, path, false);
    }

    static String endpoint(String baseUrl, String path, boolean allowDebugLoopback) {
        if (!REQUEST_PATHS.contains(path)) {
            throw new IllegalArgumentException("接口路径不在允许的聊天接口列表中");
        }
        return normalizeBaseUrl(baseUrl, allowDebugLoopback) + path;
    }

    private static boolean isLoopback(String host) {
        return host != null && (host.equalsIgnoreCase("localhost") || host.equals("127.0.0.1")
                || host.equals("[::1]") || host.equals("::1"));
    }

    static boolean isPublicExternalUrl(String value) {
        if (value == null || value.length() > 4096) return false;
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                    || uri.getRawUserInfo() != null || uri.getHost() == null) return false;
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            return !host.equals("localhost") && !host.equals("127.0.0.1")
                    && !host.equals("[::1]") && !host.equals("::1");
        } catch (URISyntaxException error) {
            return false;
        }
    }

    static String requestMethod(String path, String method) {
        if (!REQUEST_PATHS.contains(path)) throw new IllegalArgumentException("请选择有效的接口");
        String expected = "/models".equals(path) ? "GET" : "POST";
        if (!expected.equalsIgnoreCase(method)) {
            throw new IllegalArgumentException("接口请求方式不匹配");
        }
        return expected;
    }
}
