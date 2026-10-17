// Vyrenderuje bannery a videa kampaně ze scény marketing/src/stage.html.
//   node marketing/render.mjs                    → vše: plné sady pro cs+en, základní sada pro ostatní přeložené jazyky, videa cs+en
//   node marketing/render.mjs --langs de,fr      → jen tyto jazyky (plná sada bannerů)
//   node marketing/render.mjs --videos --langs de → videa v němčině
//   node marketing/render.mjs --banners          → jen bannery
// Potřebuje Playwright (Chromium) a ffmpeg. Výstup: marketing/out/{banners,video,og}/…
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../shared/i18n/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const out = path.join(here, 'out');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const FULL_LANGS = ['cs', 'en'];
const CONCEPTS = ['brand', 'blind', 'safety', 'consent', 'verified', 'duress', 'soft'];
const SOCIAL = [
  [1080, 1080],
  [1080, 1350],
  [1080, 1920],
];
const DISPLAY = [
  [300, 250],
  [728, 90],
  [160, 600],
  [300, 600],
  [320, 50],
  [970, 250],
];
const DISPLAY_CONCEPTS = ['brand', 'safety', 'soft'];
const VIDEOS = [
  ['how', 1080, 1920],
  ['how', 1080, 1080],
  ['how', 1920, 1080],
  ['safety', 1080, 1920],
  ['bumper', 1080, 1920],
  ['bumper', 1080, 1080],
];
const FPS = 30;

const translated = (code) => {
  try {
    return !!JSON.parse(fs.readFileSync(path.join(repo, 'shared', 'i18n', 'web', `${code}.json`), 'utf8')).ads?.brandTitle;
  } catch {
    return false;
  }
};

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}

// Jednoduchý statický server nad repozitářem – scéna si načítá slovníky a fonty.
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const file = path.join(repo, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(repo) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function open(browser, base, params, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/marketing/src/stage.html?${new URLSearchParams({ ...params, w, h })}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  if (errors.length) console.warn('  chyba ve scéně:', errors.join(' | '));
  return page;
}

async function banner(browser, base, lang, concept, w, h, file) {
  const page = await open(browser, base, { kind: 'banner', concept, lang }, w, h);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  return file;
}

async function video(browser, base, lang, name, w, h) {
  const page = await open(browser, base, { kind: 'video', video: name, lang }, w, h);
  const duration = await page.evaluate(() => window.duration);
  const dir = path.join(out, 'video', lang);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${w}x${h}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-preset', 'medium', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(duration * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.seek(t), f / FPS);
    const shot = await page.screenshot({ type: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: w, height: h } });
    if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((resolve, reject) => ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg skončil s kódem ${code}`)))));
  // náhledový obrázek (plakát) videa
  await page.evaluate((t) => window.seek(t), Math.min(duration - 0.5, duration * 0.62));
  await page.screenshot({ path: file.replace(/\.mp4$/, '.jpg'), type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  return file;
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await fn(queue.shift());
    }),
  );
}

const explicit = opt('langs')?.split(',').filter(Boolean);
const doBanners = flag('banners') || !flag('videos');
const doVideos = flag('videos') || !flag('banners');

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const started = Date.now();

if (doBanners) {
  const full = explicit ?? FULL_LANGS;
  const core = explicit ? [] : LOCALE_CODES.filter((c) => !FULL_LANGS.includes(c) && translated(c));
  const jobs = [];
  for (const lang of full) {
    for (const c of CONCEPTS) for (const [w, h] of SOCIAL) jobs.push([lang, c, w, h]);
    for (const c of DISPLAY_CONCEPTS) for (const [w, h] of DISPLAY) jobs.push([lang, c, w, h]);
  }
  for (const lang of core) {
    jobs.push([lang, 'brand', 1080, 1080], [lang, 'safety', 1080, 1920], [lang, 'blind', 1080, 1350]);
  }
  for (const lang of [...full, ...core]) jobs.push([lang, 'og', 1200, 630]);
  let done = 0;
  await pool(jobs, 4, async ([lang, concept, w, h]) => {
    if (concept === 'og') {
      const dir = path.join(out, 'og');
      fs.mkdirSync(dir, { recursive: true });
      await banner(browser, base, lang, 'brand', w, h, path.join(dir, `og-${lang}.jpg`));
    } else {
      const dir = path.join(out, 'banners', lang);
      fs.mkdirSync(dir, { recursive: true });
      await banner(browser, base, lang, concept, w, h, path.join(dir, `${concept}-${w}x${h}.jpg`));
    }
    done += 1;
    if (done % 25 === 0 || done === jobs.length) console.log(`bannery ${done}/${jobs.length}`);
  });
}

if (doVideos) {
  const langs = explicit ?? FULL_LANGS;
  for (const lang of langs) {
    await pool(VIDEOS, 2, async ([name, w, h]) => {
      const file = await video(browser, base, lang, name, w, h);
      console.log('video', path.relative(repo, file));
    });
  }
}

await browser.close();
server.close();
console.log(`Hotovo za ${Math.round((Date.now() - started) / 1000)} s → ${path.relative(process.cwd(), out)}`);
