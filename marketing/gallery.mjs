// Galerie vyrenderovaných kreativ: marketing/out/index.html (náhled pro tým, odkazy relativně na soubory v out/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '../shared/i18n/index.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const exists = (p) => fs.existsSync(path.join(out, p));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CONCEPTS = [
  ['brand', 'Značka', 'Sex. Domluvený. Bezpečný.* – *Dvě ano, nebo nic.'],
  ['yes', 'Ano.*', '*Platí, jen když ho řeknete oba.'],
  ['twoyes', 'Jedno ano nestačí.*', '*Dvě ano, nebo nic. S maketou domluvy naslepo.'],
  ['both', 'Jen když oba', 'Sex. Domluvený. Bezpečný.* – *Jen když chcete oba.'],
  ['story', 'Příběh jména', 'Chtěli jsme se jmenovat F*app.* – *Pak jsme se domluvili. Jen vlastní kanály a PR, ne placená reklama.'],
  ['blind', 'Domluva naslepo', 'Uvidíte jen shodu.'],
  ['safety', 'Bezpečí', 'Někdo ví, kde jsi.'],
  ['consent', 'Souhlas', 'Ne znamená ne. I v appce.'],
  ['verified', 'Ověření', 'Všichni jsou ověření.'],
  ['duress', 'Nouzový PIN', 'PIN, který vypadá normálně.'],
  ['soft', 'Měkká verze', 'Bez slova „sex“ – pro Google, Sklik a média.'],
];
const SOCIAL = [
  ['1080x1080', 'čtverec 1:1'],
  ['1080x1350', 'feed 4:5'],
  ['1080x1920', 'stories 9:16'],
];
const DISPLAY = ['300x250', '728x90', '160x600', '300x600', '320x50', '970x250'];
const VIDEOS = [
  ['how-1080x1920', 'Jak to funguje', '9:16 · 15 s'],
  ['safety-1080x1920', 'Bezpečí', '9:16 · 15 s'],
  ['bumper-1080x1920', 'Spot', '9:16 · 6 s'],
  ['how-1920x1080', 'Jak to funguje', '16:9 · 15 s'],
  ['how-1080x1080', 'Jak to funguje', '1:1 · 15 s'],
  ['bumper-1080x1080', 'Spot', '1:1 · 6 s'],
];

const used = new Set();
const ref = (p) => {
  used.add(p);
  return esc(p);
};

function setFor(lang) {
  const videos = VIDEOS.filter(([f]) => exists(`video/${lang}/${f}.mp4`))
    .map(
      ([f, name, meta]) => `<figure class="vid ${f.includes('1920x1080') ? 'wide' : f.includes('1080x1080') ? 'sq' : 'tall'}">
        <video controls muted loop playsinline preload="none" poster="${ref(`video/${lang}/${f}.jpg`)}" src="${ref(`video/${lang}/${f}.mp4`)}"></video>
        <figcaption><b>${name}</b><span>${meta}</span></figcaption></figure>`,
    )
    .join('');
  const social = CONCEPTS.map(([c, name, note]) => {
    const imgs = SOCIAL.filter(([s]) => exists(`banners/${lang}/${c}-${s}.jpg`))
      .map(([s, label]) => `<figure><img loading="lazy" src="${ref(`banners/${lang}/${c}-${s}.jpg`)}" alt="${esc(name)} ${s}"><figcaption>${label}</figcaption></figure>`)
      .join('');
    return imgs ? `<div class="concept"><div class="concept-head"><b>${name}</b><span>${esc(note)}</span></div><div class="row">${imgs}</div></div>` : '';
  }).join('');
  const display = ['brand', 'twoyes', 'safety', 'soft']
    .map((c) =>
      DISPLAY.filter((s) => exists(`banners/${lang}/${c}-${s}.jpg`))
        .map((s) => {
          const [w, h] = s.split('x').map(Number);
          return `<figure class="disp"><img loading="lazy" src="${ref(`banners/${lang}/${c}-${s}.jpg`)}" width="${w}" height="${h}" alt="${c} ${s}"><figcaption>${c} · ${s}</figcaption></figure>`;
        })
        .join(''),
    )
    .join('');
  return `<div class="set" data-lang="${lang}"${lang === 'cs' ? '' : ' hidden'}>
    <h2>Videa</h2><div class="videos">${videos || '<p class="muted">Pro tento jazyk zatím nejsou.</p>'}</div>
    <h2>Sociální sítě</h2>${social}
    <h2>Reklamní formáty</h2><div class="displays">${display}</div>
  </div>`;
}

const others = LOCALES.filter((l) => !['cs', 'en'].includes(l.code) && exists(`banners/${l.code}/brand-1080x1080.jpg`));
const langGrid = others
  .map(
    (l) => `<div class="lang"><div class="lang-name" dir="auto">${esc(l.name)} <span>${l.code}</span></div><div class="lang-row">
      ${['brand-1080x1080', 'yes-1080x1080', 'blind-1080x1350', 'safety-1080x1920']
        .filter((f) => exists(`banners/${l.code}/${f}.jpg`))
        .map((f) => `<img loading="lazy" src="${ref(`banners/${l.code}/${f}.jpg`)}" alt="${esc(l.name)} ${f}">`)
        .join('')}</div></div>`,
  )
  .join('');

const html = `<title>YesYes kreativy</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Manrope:wght@400;600;700&display=swap">
<style>
/* Galerie jako noční katalog: tmavá plocha značky, kreativy v reálném poměru stran, popisky jako u tiskových podkladů. */
:root { --bg: #121014; --surface: #1c181f; --line: #2a2430; --text: #f5efe9; --muted: #b4aab8; --accent: #ff6b8b; --safe: #62e0b5;
  --display: 'Bricolage Grotesque', 'Manrope', system-ui, sans-serif; --body: 'Manrope', system-ui, sans-serif; color-scheme: dark; }
body { background: var(--bg); color: var(--text); font: 400 15px/1.55 var(--body); margin: 0; }
.wrap { max-width: 1240px; margin: 0 auto; padding-block: 40px 80px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
h1 { font: 800 clamp(2.2rem, 5vw, 3.6rem)/1 var(--display); letter-spacing: -0.02em; margin: 0 0 12px; }
h1 b { color: var(--accent); }
h2 { font: 800 1.6rem/1.1 var(--display); margin: 48px 0 18px; }
.lead { color: var(--muted); max-width: 46rem; margin: 0; }
.lead code { color: var(--text); background: var(--surface); padding: 1px 6px; border-radius: 6px; font-size: 0.9em; }
.toggle { display: inline-flex; gap: 6px; margin-top: 22px; padding: 4px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); }
.toggle button { font: 700 14px var(--body); border: 0; border-radius: 999px; padding: 8px 18px; background: transparent; color: var(--muted); cursor: pointer; }
.toggle button[aria-pressed="true"] { background: var(--accent); color: var(--bg); }
.toggle button:focus-visible { outline: 2px solid var(--safe); outline-offset: 2px; }
.videos { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; align-items: end; }
.vid video { width: 100%; border-radius: 14px; background: #000; display: block; }
.vid.wide { grid-column: span 2; }
figure { margin: 0; min-width: 0; }
figcaption { display: flex; gap: 8px; align-items: baseline; color: var(--muted); font-size: 13px; margin-top: 6px; }
figcaption b { color: var(--text); }
.concept { margin-bottom: 28px; }
.concept-head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; margin-bottom: 10px; }
.concept-head b { font: 800 1.15rem var(--display); }
.concept-head span, .muted { color: var(--muted); font-size: 14px; }
.row { display: grid; grid-template-columns: 1fr 0.8fr 0.5625fr; gap: 12px; align-items: end; }
.row img, .lang-row img { width: 100%; height: auto; display: block; border-radius: 10px; }
.displays { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.disp img { max-width: 100%; height: auto; display: block; border-radius: 4px; }
.langs { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 22px; }
.lang-name { font: 800 1.05rem var(--display); margin-bottom: 8px; }
.lang-name span { font: 600 12px var(--body); color: var(--muted); margin-inline-start: 6px; }
.lang-row { display: grid; grid-template-columns: 1fr 1fr 0.8fr 0.5625fr; gap: 8px; align-items: end; }
@media (max-width: 640px) { .row { grid-template-columns: 1fr 1fr; } .vid.wide { grid-column: auto; } }
</style>
<div class="wrap">
  <h1>YesYes<b>*</b> – kreativy kampaně</h1>
  <p class="lead">Bannery a videa vyrenderované ze šablon v <code>marketing/</code>; texty jsou z překladových slovníků, takže každý jazyk jde přegenerovat příkazem <code>node marketing/render.mjs --langs de</code>. Žádná nahota ani dvojsmysly – kvůli zákonu o regulaci reklamy a pravidlům platforem.</p>
  <div class="toggle" role="group" aria-label="Jazyk kreativ">
    <button type="button" data-show="cs" aria-pressed="true">Čeština</button>
    <button type="button" data-show="en" aria-pressed="false">English</button>
  </div>
  ${setFor('cs')}
  ${setFor('en')}
  <h2>Další jazyky</h2>
  <p class="lead" style="margin-bottom:18px">Základní sada (dva čtverce, feed, stories) pro ${others.length} dalších jazyků. Ostatní formáty a videa jedním příkazem.</p>
  <div class="langs">${langGrid}</div>
</div>
<script>
document.querySelectorAll('.toggle button').forEach(function (b) {
  b.addEventListener('click', function () {
    document.querySelectorAll('.toggle button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    document.querySelectorAll('.set').forEach(function (s) { s.hidden = s.dataset.lang !== b.dataset.show; });
    document.querySelectorAll('video').forEach(function (v) { v.pause(); });
  });
});
</script>
`;

fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify([...used], null, 1));
console.log(`Galerie: ${used.size} souborů → ${path.relative(process.cwd(), path.join(out, 'index.html'))}`);
