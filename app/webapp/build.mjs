// Sestaví webovou verzi aplikace proti skutečnému serveru do server/webapp/:
//   index.html (celá aplikace v jednom souboru, písma vložená), icon.png (ikona na plochu).
// Server ji ukazuje jen s přístupovým klíčem (viz server/src/accessGate.js, WEB_APP=1).
// Použití: npm run webapp:build -w app
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.dirname(here);
const require = createRequire(path.join(appDir, 'package.json'));
const target = path.join(appDir, '..', 'server', 'webapp');

// 1. písma jako data URI (stejný modul jako webový prototyp)
const fonts = {
  BricolageGrotesque_800ExtraBold: '@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf',
  Manrope_400Regular: '@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf',
  Manrope_500Medium: '@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf',
  Manrope_600SemiBold: '@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf',
  Manrope_700Bold: '@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf',
};
let fontModule = '// Vygenerováno skriptem demo/build.mjs nebo webapp/build.mjs – needitovat.\n';
for (const [name, file] of Object.entries(fonts)) {
  fontModule += `export const ${name} = 'data:font/ttf;base64,${readFileSync(require.resolve(file)).toString('base64')}';\n`;
}
fontModule += "export { useFonts } from 'expo-font';\n";
writeFileSync(path.join(appDir, 'demo', 'fonts.generated.js'), fontModule);

// 2. export – API na stejné adrese jako stránka (EXPO_PUBLIC_API_URL '/' → relativní /api)
const out = path.join(here, '.export');
rmSync(out, { recursive: true, force: true });
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', out], {
  cwd: appDir,
  stdio: 'inherit',
  env: { ...process.env, YESYES_WEB: '1', EXPO_PUBLIC_API_URL: '/', EXPO_OFFLINE: '1', CI: '1' },
});

const jsDir = path.join(out, '_expo/static/js/web');
const bundles = readdirSync(jsDir).filter((f) => f.endsWith('.js'));
if (bundles.length !== 1) throw new Error(`Čekal jsem jeden bundle, našel jsem ${bundles.length}.`);
const bundle = readFileSync(path.join(jsDir, bundles[0]), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const exportedHtml = readFileSync(path.join(out, 'index.html'), 'utf8');
const expoStyles = [...exportedHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

// 3. stránka – na iPhonu „Přidat na plochu“ otevírá aplikaci přes celou obrazovku
const html = `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#121014">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="YesYes">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icon.png">
<title>YesYes</title>
<style>
${expoStyles}
:root { color-scheme: dark; }
html, body { height: 100%; margin: 0; background: #121014; color: #F5EFE9; overscroll-behavior: none; }
body { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); box-sizing: border-box; overflow: hidden; }
#root { display: flex; flex-direction: column; height: 100%; max-width: 480px; margin: 0 auto; }
</style>
</head>
<body>
<div id="root"></div>
<script>${bundle}</script>
</body>
</html>
`;

mkdirSync(target, { recursive: true });
writeFileSync(path.join(target, 'index.html'), html);
copyFileSync(path.join(appDir, 'assets', 'icon.png'), path.join(target, 'icon.png'));
console.log(`Hotovo: server/webapp/index.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
