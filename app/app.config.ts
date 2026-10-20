/// <reference types="node" />
import cs from '@yesyes/shared/i18n/app/cs.json';
import type { ExpoConfig } from 'expo/config';
import fs from 'node:fs';
import path from 'node:path';

// Proměnné prostředí:
//   EXPO_PUBLIC_API_URL      – adresa serveru (výchozí http://localhost:3000)
//   GOOGLE_MAPS_API_KEY      – klíč pro mapy na Androidu
//   EAS_PROJECT_ID           – pro push notifikace (Expo Push)

// Systémové texty (žádosti o oprávnění) jsou ve slovníku aplikace, jmenný prostor `native`.
// V Info.plist je výchozí čeština, ostatní jazyky dostane iOS z ./locales/<jazyk>.json
// (InfoPlist.strings). Ty generuje `node scripts/native-locales.mjs` – po změně textů ho spusť znovu.
const native = cs.native;
const localesDir = path.join(__dirname, 'locales');
const locales = fs.existsSync(localesDir)
  ? Object.fromEntries(
      fs
        .readdirSync(localesDir)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => [path.basename(file, '.json'), `./locales/${file}`]),
    )
  : {};

const config: ExpoConfig = {
  name: 'YesYes',
  slug: 'yesyes',
  scheme: 'yesyes',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#121014',
  ios: {
    bundleIdentifier: 'app.yesyes',
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ['location', 'remote-notification'],
      CFBundleAllowMixedLocalizations: true,
    },
  },
  android: {
    package: 'app.yesyes',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundColor: '#121014',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION'],
  },
  locales: Object.keys(locales).length > 0 ? locales : undefined,
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    ['expo-localization', { supportsRTL: true }],
    [
      'expo-location',
      {
        locationWhenInUsePermission: native.locationWhenInUse,
        locationAlwaysAndWhenInUsePermission: native.locationAlways,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-notifications', { color: '#FF6B8B' }],
    ['expo-local-authentication', { faceIDPermission: native.faceId }],
    [
      'expo-image-picker',
      {
        photosPermission: native.photos,
        cameraPermission: native.camera,
        microphonePermission: false,
      },
    ],
    [
      'expo-alternate-app-icons',
      [
        {
          name: 'Discreet',
          ios: './assets/icon-discreet.png',
          android: { foregroundImage: './assets/icon-discreet-foreground.png', backgroundColor: '#E9E6DF' },
        },
      ],
    ],
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '' }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
};

export default config;
