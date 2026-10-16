# MONO Kairos — Android weather alerts (1.2.0)

## Implemented and available after a successful Android build
- Animated MONO startup screen and simple LIVE badge (not Expo Mobile)
- Five native notification category switches: rain, thunderstorms/severe, gusts, morning outlook, air quality
- Opt-in location and notification permissions, actual Open-Meteo hourly forecast used to schedule native local notifications
- Timed alerts can show after the Android app is closed for events in the next **48 hours**
- Local refresh on subsequent launches (up to once every 2h), manual refresh button, display of next scheduled alerts, cancellation on full opt-out
- Local test notification button
- Web MONO and Vercel main branch untouched

### IMPORTANT distinction
These are **locally scheduled notifications based on the latest downloaded forecast**. They do **not** adapt to revised forecasts while the app is closed, do not check official EMY warnings in the background, do not work indefinitely if the user never reopens the app, and are not a substitute for public safety warnings.

## Still needed for continuously live push while closed
1. Register Android package `com.mariodinakus.monokairos` in your Firebase project.
2. Download Android `google-services.json`, configure app.json `android.googleServicesFile`, and securely add the **FCM v1 service account** credential to EAS project settings (never commit a service account private key).
3. Set a valid Expo EAS project UUID `expo.extra.eas.projectId` and use a stable signing key to build the app.
4. Provision persistent database for device subscriptions, auth and opt-out, location preferences (if explicitly consented), TTL/rate limits and rotating push tokens.
5. Run a scheduled server-side forecast checker independent of the app (Vercel + scheduled job) and send authenticated Expo push payloads with receipt handling/deduplication.
6. Rebuild EAS-signed APK, test remote push on the physical phone while force-closed and backgrounded, and ensure no notification is falsely labeled official.

Expo FCM setup: https://docs.expo.dev/push-notifications/fcm-credentials/
Expo local alerts: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/

## Notes
The GitHub Actions release build is signed with runner-generated build keys. To reliably install future APKs over the currently installed app without uninstalling, configure persistent Android signing (prefer EAS managed credentials) and check the signing fingerprint. A build success alone does not prove device usability.
