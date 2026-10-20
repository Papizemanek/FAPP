// Sestaví webový prototyp do jednoho HTML souboru (demo/dist/yesyes.html):
//   1. vloží písma jako data URI (náhled nesmí načítat soubory odjinud),
//   2. spustí `expo export --platform web` s YESYES_DEMO=1 (simulovaný backend, viz metro.config.js),
//   3. vloží JS bundle přímo do stránky.
// Použití: npm run demo:build -w app
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.dirname(here);
const require = createRequire(path.join(appDir, 'package.json'));

// 1. písma
const fonts = {
  BricolageGrotesque_800ExtraBold: '@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf',
  Manrope_400Regular: '@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf',
  Manrope_500Medium: '@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf',
  Manrope_600SemiBold: '@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf',
  Manrope_700Bold: '@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf',
};
let fontModule = '// Vygenerováno skriptem demo/build.mjs – needitovat.\n';
for (const [name, file] of Object.entries(fonts)) {
  const data = readFileSync(require.resolve(file)).toString('base64');
  fontModule += `export const ${name} = 'data:font/ttf;base64,${data}';\n`;
}
fontModule += "export { useFonts } from 'expo-font';\n";
writeFileSync(path.join(here, 'fonts.generated.js'), fontModule);

// 2. export
const out = path.join(here, '.export');
rmSync(out, { recursive: true, force: true });
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', out], {
  cwd: appDir,
  stdio: 'inherit',
  env: { ...process.env, YESYES_DEMO: '1', EXPO_OFFLINE: '1', CI: '1' },
});

// 3. jedna stránka
const jsDir = path.join(out, '_expo/static/js/web');
const bundles = readdirSync(jsDir).filter((f) => f.endsWith('.js'));
if (bundles.length !== 1) throw new Error(`Čekal jsem jeden bundle, našel jsem ${bundles.length}.`);
const bundle = readFileSync(path.join(jsDir, bundles[0]), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const exportedHtml = readFileSync(path.join(out, 'index.html'), 'utf8');
const expoStyles = [...exportedHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

// Expo Router čte trasu z adresy stránky. V rámu náhledu začínáme vždy od kořene a navigace
// nesmí shodit aplikaci, kdyby rám přepis adresy nepovolil.
const preScript = `(function () {
  try { if (location.pathname !== '/') history.replaceState(null, '', '/'); } catch (e) {}
  ['pushState', 'replaceState'].forEach(function (k) {
    var orig = history[k].bind(history);
    history[k] = function (s, t, u) { try { return orig(s, t, u); } catch (e) { try { return orig(s, t); } catch (e2) {} } };
  });
})();`;

const html = `<title>YesYes</title>
<meta name="theme-color" content="#121014">
<style>
${expoStyles}
:root { color-scheme: dark; --bg: #121014; --fg: #F5EFE9; }
html { height: 100%; box-sizing: border-box; background: var(--bg); }
body { height: 100%; margin: 0; overflow: hidden; background: var(--bg); color: var(--fg); }
#root { display: flex; flex-direction: column; height: 100%; max-width: 440px; margin: 0 auto; background: var(--bg); }
</style>
<div id="root"></div>
<script>${preScript}</script>
<script>${bundle}</script>
`;

const dist = path.join(here, 'dist');
if (!existsSync(dist)) mkdirSync(dist);
const target = path.join(dist, 'yesyes.html');
writeFileSync(target, html);
console.log(`Hotovo: ${path.relative(process.cwd(), target)} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
