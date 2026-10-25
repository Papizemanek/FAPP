const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// YESYES_DEMO=1: webový prototyp (npm run demo:build) – simulovaný backend v prohlížeči.
// YESYES_WEB=1: webová verze aplikace proti skutečnému serveru (npm run webapp:build).
// Nativní moduly v obou případech nahradí webové náhrady. Běžné sestavení aplikace se tím nemění.
const demoMode = process.env.YESYES_DEMO === '1';
const webMode = process.env.YESYES_WEB === '1';
if (demoMode || webMode) {
  const demo = (file) => path.join(__dirname, 'demo', file);
  const web = (file) => path.join(__dirname, 'webapp', file);
  const modules = {
    'react-native-maps': demo('shims/maps.js'),
    'expo-notifications': demo('shims/notifications.js'),
    'expo-screen-capture': demo('shims/screen-capture.js'),
    'expo-local-authentication': demo('shims/local-authentication.js'),
    'expo-location': webMode ? web('shims/location.js') : demo('shims/location.js'),
    'expo-haptics': demo('shims/haptics.js'),
    '@expo-google-fonts/manrope': demo('fonts.generated.js'),
    '@expo-google-fonts/bricolage-grotesque': demo('fonts.generated.js'),
  };
  const ownModules = webMode
    ? {
        [path.join(__dirname, 'src/lib/storage')]: web('storage.ts'),
        [path.join(__dirname, 'src/lib/safetyTracking')]: web('safetyTracking.ts'),
      }
    : {
        [path.join(__dirname, 'src/lib/transport')]: demo('transport.ts'),
        [path.join(__dirname, 'src/lib/storage')]: demo('storage.ts'),
        [path.join(__dirname, 'src/lib/safetyTracking')]: demo('safetyTracking.ts'),
      };
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (modules[moduleName]) return { type: 'sourceFile', filePath: modules[moduleName] };
    const resolved = context.resolveRequest(context, moduleName, platform);
    if (resolved.type === 'sourceFile') {
      const replacement = ownModules[resolved.filePath.replace(/\.(ts|tsx|js)$/, '')];
      if (replacement) return { type: 'sourceFile', filePath: replacement };
    }
    return resolved;
  };
}

module.exports = config;
