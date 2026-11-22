# Android integration contract

- Application ID: `com.coldcoffee.mobile`; version `3.3.0-preview.4`; versionCode `330004`.
- AGP `8.7.3`, Gradle `8.9`, JDK `17`, compile/target SDK `35`, Build Tools `35.0.0`, minimum SDK `26`.
- Build web assets first with the mobile package's build command. Then build from `mobile/android`: `bash ./gradlew --no-daemon :app:assembleRelease :app:testDebugUnitTest :app:assembleDebugAndroidTest`.
- Signing uses environment variables `COLDCOFFEE_ANDROID_KEYSTORE`, `COLDCOFFEE_ANDROID_STORE_PASSWORD`, `COLDCOFFEE_ANDROID_KEY_ALIAS`, `COLDCOFFEE_ANDROID_KEY_PASSWORD` only. With no configuration, release is unsigned (no debug signing substitute).
- Signed release output: `app/build/outputs/apk/release/ColdCoffee-Mobile-Android-3.3.0-preview.4.apk`. With absent signing configuration the name has `-unsigned` and is not a customer installer.
- UI assets are copied from `mobile/www/` during build. The launcher uses `mobile/assets/launcher-foreground.png`; the UI uses `mobile/assets/icon.png`. The vector brand substitute remains if the launcher image is absent. Legal resources are copied from `mobile/legal/`.
- Native bridge is `window.ColdCoffeeNative`; providers return `hasKey` without raw API keys; protocol field accepts `chat` or `responses`.
- Native headers event includes status, contentType and headers.content-type. JSON and UTF-8 SSE body chunks use the same event stream.
- Controlled local origin is `https://appassets.androidplatform.net/assets/index.html`; native HTTPS requests join normalized `baseUrl` and allow-listed `/models`, `/chat/completions`, `/responses` paths.
- Unit tests: `bash ./gradlew :app:testDebugUnitTest`. Android instrumentation: on an API-35 emulator run `bash ./gradlew :app:connectedDebugAndroidTest`. Four instrumented tests verify Android Keystore encryption, key omission, state field redaction, persisted provider edits, real loopback HTTP model loading, UTF-8 SSE, cancellation closing the upstream socket, opening the actual GPL dialog, blocking remote fetch, and decoding a system-file-chooser `content://` image with `createImageBitmap`.
- The content security policy allows `connect-src 'self'` for packaged legal text only. Remote resources remain blocked by both policy and asset interception. Native API requests use the separate HTTPS bridge.
- The image test intercepts `ACTION_OPEN_DOCUMENT` with a debug-only, non-exported synthetic PNG provider, then exercises the real WebView file input callback. Global file/content URL access stays disabled; no user photo or external account is used.
- HTTP is rejected in release. Only the debug build permits loopback HTTP (`127.0.0.1` / `localhost`) for deterministic instrumented fixtures. No production API or customer credentials are used by tests.
- Gradle configuration caching is disabled to avoid serializing release signing configuration. All generated `.gradle/`, `build/`, private local SDK paths, keystores and debug signing materials are ignored.
- The unmodified Gradle 8.9 wrapper JAR SHA256 is `498495120a03b9a6ab5d155f5de3c8f0d986a449153702fb80fc80e134484f17`; Gradle Apache-2.0 notices are retained beside it. Gradle 8.9 binary ZIP SHA256 is pinned in wrapper properties.
- CI invokes the checked wrapper rather than a separately installed Gradle. Both Android jobs verify its SHA-256 before execution. APK publishing checks the expected application ID, VERSION, non-debuggable flag, persistent release signature and complete APK privacy audit before uploading the named installer; pull requests also audit the unsigned build.
