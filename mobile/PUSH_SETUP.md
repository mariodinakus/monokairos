# MONO Android notifications — implementation status

## Working in version 1.1.0
- Animated custom loading screen and native branding
- Native Expo Notifications settings UI; five categories and persistent preferences
- Real local Android notification test, after user permission
- Kept MONO website and existing Vercel backend unchanged

## Before real push delivery (even while app is closed)
1. Create or connect an official Google Firebase project, register Android package `com.mariodinakus.monokairos`.
2. Enable FCM v1, download `google-services.json` for Android. Upload FCM service-account credential **privately** to Expo EAS (never commit the private key).
3. Associate this app with its own Expo EAS project ID under `extra.eas.projectId`, and ensure Android `googleServicesFile` points to the downloaded file in the build environment.
4. Provision persistent per-device subscription storage and implement secure registration, opt-out and rate limits on backend.
5. Implement scheduled weather checks/thresholds from live sources and authenticated Expo push sends, receipts and deduplication.
6. Turn on registration in the app and issue an **EAS-signed** APK with stable signing key; the current GitHub release APK signing may differ between runs.

Note: The native settings switches intentionally do not register a device or send remote pushes until the backend is provisioned. Local notification test is not proof of remote FCM delivery. Check FCM credentials: https://docs.expo.dev/push-notifications/fcm-credentials/
