const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// FAPP_DEMO=1: webový prototyp (npm run demo:build). Server nahradí simulovaný backend v prohlížeči
// a nativní moduly prázdné náhrady. Běžné sestavení aplikace se tím nemění.
if (process.env.FAPP_DEMO === '1') {
  const demo = (file) => path.join(__dirname, 'demo', file);
  const modules = {
    'react-native-maps': 'shims/maps.js',
    'expo-notifications': 'shims/notifications.js',
    'expo-screen-capture': 'shims/screen-capture.js',
    'expo-local-authentication': 'shims/local-authentication.js',
    'expo-location': 'shims/location.js',
    'expo-haptics': 'shims/haptics.js',
    '@expo-google-fonts/manrope': 'fonts.generated.js',
    '@expo-google-fonts/bricolage-grotesque': 'fonts.generated.js',
  };
  const ownModules = {
    [path.join(__dirname, 'src/lib/transport')]: 'transport.ts',
    [path.join(__dirname, 'src/lib/storage')]: 'storage.ts',
    [path.join(__dirname, 'src/lib/safetyTracking')]: 'safetyTracking.ts',
  };
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (modules[moduleName]) return { type: 'sourceFile', filePath: demo(modules[moduleName]) };
    const resolved = context.resolveRequest(context, moduleName, platform);
    if (resolved.type === 'sourceFile') {
      const replacement = ownModules[resolved.filePath.replace(/\.(ts|tsx|js)$/, '')];
      if (replacement) return { type: 'sourceFile', filePath: demo(replacement) };
    }
    return resolved;
  };
}

module.exports = config;
