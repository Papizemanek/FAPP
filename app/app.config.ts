import type { ExpoConfig } from 'expo/config';

// Proměnné prostředí:
//   EXPO_PUBLIC_API_URL      – adresa serveru (výchozí http://localhost:3000)
//   GOOGLE_MAPS_API_KEY      – klíč pro mapy na Androidu
//   EAS_PROJECT_ID           – pro push notifikace (Expo Push)

const config: ExpoConfig = {
  name: 'F*app',
  slug: 'fapp',
  scheme: 'fapp',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#121014',
  ios: {
    bundleIdentifier: 'app.fapp',
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ['location', 'remote-notification'],
    },
  },
  android: {
    package: 'app.fapp',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundColor: '#121014',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'F*app potřebuje polohu, aby ti ukázal lidi v okolí a během schůzky ji mohl sdílet s tvou důvěryhodnou osobou.',
        locationAlwaysAndWhenInUsePermission:
          'Během schůzky sdílí F*app tvoji polohu s důvěryhodnou osobou i se zhasnutým displejem. Mimo schůzku polohu na pozadí nepoužívá.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-notifications', { color: '#FF6B8B' }],
    ['expo-local-authentication', { faceIDPermission: 'F*app se odemyká Face ID, aby se do něj nikdo nepodíval.' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Vyber si fotky do profilu.',
        cameraPermission: 'Vyfoť se do profilu.',
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
