/*
 * Copyright (C) 2026 ColdCoffee contributors.
 * SPDX-License-Identifier: GPL-3.0-only
 */
package com.coldcoffee.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class EndpointPolicyTest {
    @Test public void addsV1ForRootAndKeepsCustomPrefixes() {
        assertEquals("https://example.com/v1", EndpointPolicy.normalizeBaseUrl(" https://Example.com/ "));
        assertEquals("https://example.com/openai/v1", EndpointPolicy.normalizeBaseUrl("https://example.com/openai/v1/"));
        assertEquals("https://example.com/custom", EndpointPolicy.normalizeBaseUrl("https://example.com/custom"));
    }
    @Test public void completeEndpointAndDuplicateV1AreNormalized() {
        assertEquals("https://example.com/v1", EndpointPolicy.normalizeBaseUrl("https://example.com/v1/chat/completions/"));
        assertEquals("https://example.com/v1", EndpointPolicy.normalizeBaseUrl("https://example.com/v1/v1"));
        assertEquals("https://example.com/v1/models", EndpointPolicy.endpoint("https://example.com/v1", "/models"));
    }
    @Test public void rejectsNonHttpsAndCredentialsInUrls() {
        for (String url : new String[] {
                "http://example.com/v1", "file:///tmp/key", "javascript:alert(1)",
                "https://user@example.com/v1", "https://example.com/v1?key=secret",
                "https://example.com/v1#secret", "https://example.com:0/v1"}) {
            try { EndpointPolicy.normalizeBaseUrl(url); fail("Accepted invalid provider URL"); }
            catch (IllegalArgumentException expected) { /* expected */ }
        }
    }
    @Test public void methodsAndPathsAreStrict() {
        assertEquals("GET", EndpointPolicy.requestMethod("/models", "GET"));
        assertEquals("POST", EndpointPolicy.requestMethod("/responses", "POST"));
        for (String path : new String[]{"/../../admin", "/files", "/v1/models", "/models?key=x"}) {
            try { EndpointPolicy.endpoint("https://example.com", path); fail("Accepted unsupported path"); }
            catch (IllegalArgumentException expected) { /* expected */ }
        }
        try { EndpointPolicy.requestMethod("/models", "POST"); fail("Accepted unsupported method"); }
        catch (IllegalArgumentException expected) { /* expected */ }
    }
    @Test public void externalBrowserAcceptsOnlyHttpSchemes() {
        assertTrue(EndpointPolicy.isPublicExternalUrl("https://coldcoffeeai.com/"));
        assertFalse(EndpointPolicy.isPublicExternalUrl("intent://browser"));
        assertFalse(EndpointPolicy.isPublicExternalUrl("content://media/image"));
        assertFalse(EndpointPolicy.isPublicExternalUrl("file:///sdcard/key.txt"));
        assertFalse(EndpointPolicy.isPublicExternalUrl("javascript:alert(1)"));
    }
    @Test public void debugHttpIsLimitedToLoopbackAndDefaultAlwaysRejectsIt() {
        assertEquals("http://127.0.0.1:9001/v1", EndpointPolicy.normalizeBaseUrl("http://127.0.0.1:9001", true));
        assertEquals("http://localhost:9001/v1/models",
                EndpointPolicy.endpoint("http://localhost:9001", "/models", true));
        for (String url : new String[]{"http://127.0.0.1:9001", "http://localhost:9001"}) {
            try { EndpointPolicy.normalizeBaseUrl(url); fail("Release accepted cleartext"); }
            catch (IllegalArgumentException expected) { /* expected */ }
        }
        try { EndpointPolicy.normalizeBaseUrl("http://example.com", true); fail("Debug accepted public cleartext"); }
        catch (IllegalArgumentException expected) { /* expected */ }
    }
}
