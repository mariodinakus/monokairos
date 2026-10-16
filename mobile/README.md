# MONO Kairos — Expo Mobile

Expo/React Native mobile client for https://monokairos.vercel.app/

This app is separate from the production website and preserves the same weather services and serverless APIs on Vercel. The original GitHub `main` branch is unchanged. This client runs inside React Native WebView; it is not a full native rewrite.

## Expo Go

Install Node.js 22.13+ and Expo Go for SDK 57. Check out the **expo-mobile** branch of https://github.com/mariodinakus/monokairos and run:

```bash
cd mobile
npm install
npx expo install --check
npx expo start --tunnel
```

Sign in with your Expo account in Expo CLI and Expo Go if prompted, then scan the QR. A GitHub commit alone does not create a live Expo.dev project or QR.

## Installable Android APK

```bash
cd mobile
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

The remote EAS service supplies the APK install link after a successful build. No Expo credentials or EAS project ID are embedded.

For iOS: `npx eas-cli build --platform ios --profile preview` (Apple signing and appropriate developer access may be required). App store submission has its own review rules.

## Features
- MONO Weather live web content, same language/theme, maps, forecast data, radar and existing API endpoints
- Native safe areas, Android back button, GPS permission helper, refresh and loading/error UI
- External web links open in the system browser
- New releases of the existing website show automatically inside the mobile client

## Limitations
- Requires internet and access to Vercel
- A WebView is not a complete React Native port; app stores may require more native functionality
- WebGL/3D maps, location permission, downloads, charts and notifications require on-device testing
- WebView may request location permission separately from Expo
- Telegram alerts are part of the original backend, not native push notifications

No Vercel secrets/API tokens are bundled into this mobile project.