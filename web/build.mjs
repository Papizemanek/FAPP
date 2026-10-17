// Sestaví statický web F*app pro všechny jazyky ze shared/i18n/web/<jazyk>.json.
//   node web/build.mjs            → web/dist (produkce: /, /en/, /de/ … + assets)
//   node web/build.mjs --preview  → web/preview (náhled bez serveru: čekací listina se jen nasimuluje)
// Adresa serveru, e-mail a firma jsou ve web/site.config.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LOCALE, FALLBACK_LOCALE, LOCALES, isRTL } from '../shared/i18n/index.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const preview = process.argv.includes('--preview');
const outDir = path.join(root, preview ? 'preview' : 'dist');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
if (process.env.SITE_URL) config.siteUrl = process.env.SITE_URL;
if (process.env.API_URL !== undefined) config.apiUrl = process.env.API_URL;
if (preview) config.apiUrl = '';

const dictFile = (code) => path.join(root, '..', 'shared', 'i18n', 'web', `${code}.json`);
const read = (code) => {
  try {
    return JSON.parse(fs.readFileSync(dictFile(code), 'utf8'));
  } catch {
    return {};
  }
};
const fallback = read(FALLBACK_LOCALE);
const hasKey = (d, key) => key.split('.').reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), d) !== undefined;

// Jazyk se na web dostane, až když má přeložené aspoň texty úvodu (jinak by stránka byla anglicky).
const ready = LOCALES.filter((l) => l.code === DEFAULT_LOCALE || l.code === FALLBACK_LOCALE || hasKey(read(l.code), 'hero.lead'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function translator(code) {
  const dict = read(code);
  const get = (d, key) => key.split('.').reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), d);
  return (key, params) => {
    let v = get(dict, key);
    if (v === undefined || v === '') v = get(fallback, key);
    if (typeof v !== 'string') return key;
    if (params) v = v.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])));
    return esc(v);
  };
}

const icon = {
  check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  shield: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"/><path d="M9 11.5l2 2 4-4"/></svg>',
  pin: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  sos: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9.5 17h-19L12 3z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  keypad: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 11h12v10H6z"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  phone: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  note: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h3"/></svg>',
  heart: '<svg width="24" height="24" viewBox="0 0 24 24" fill="#121014" stroke="#121014" stroke-width="1.5" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5efe9" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  eyeOff: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c5.5 0 9 6 9 6a16.6 16.6 0 0 1-2.9 3.5"/><path d="M6.6 7.6C4.3 9.1 3 12 3 12s3.5 6 9 6a8.7 8.7 0 0 0 4-.9"/></svg>',
};

const pageHref = (from, to) => {
  const up = from === DEFAULT_LOCALE ? '' : '../';
  return to === DEFAULT_LOCALE ? `${up}index.html` : `${up}${to}/index.html`;
};
const canonical = (code) => `${config.siteUrl.replace(/\/$/, '')}/${code === DEFAULT_LOCALE ? '' : `${code}/`}`;

function waitlistForm(t, id) {
  const cities = ['praha', 'brno', 'ostrava', 'plzen', 'olomouc', 'liberec', 'other'];
  return `<form class="waitlist" novalidate aria-label="${t('nav.cta')}">
      <div class="row">
        <input id="${id}-email" type="email" name="email" autocomplete="email" required placeholder="${t('waitlist.emailPlaceholder')}" aria-label="${t('waitlist.email')}">
        <select id="${id}-city" name="city" aria-label="${t('waitlist.city')}">${cities.map((c) => `<option value="${c}">${t(`waitlist.cities.${c}`)}</option>`).join('')}</select>
        <button class="btn" type="submit">${t('waitlist.submit')}</button>
      </div>
      <label class="check" for="${id}-consent"><input id="${id}-consent" type="checkbox" name="consent"> <span>${t('waitlist.consent')} <a href="#soukromi">${t('waitlist.privacyLink')}</a></span></label>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>`;
}

function body(code, t) {
  const year = new Date().getFullYear();
  const options = ready
    .map((l) => `<option value="${l.code}" data-href="${pageHref(code, l.code)}"${l.code === code ? ' selected' : ''}>${esc(l.name)}</option>`)
    .join('');
  const tile = (ic, key) => `<article class="tile"><h3><span style="color:var(--safe)">${icon[ic]}</span>${t(`safety.${key}Title`)}</h3><p>${t(`safety.${key}Text`)}</p></article>`;
  return `<a class="skip" href="#obsah">${t('nav.skip')}</a>
<header class="top">
  <div class="wrap">
    <a class="logo" href="${pageHref(code, code)}" aria-label="F*app">F<b>*</b>app</a>
    <nav class="nav" aria-label="${t('nav.language')}">
      <a href="#jak">${t('nav.how')}</a><a href="#domluva">${t('nav.blind')}</a><a href="#bezpeci">${t('nav.safety')}</a><a href="#cena">${t('nav.pricing')}</a><a href="#otazky">${t('nav.faq')}</a>
    </nav>
    <div class="lang"><select id="lang-select" aria-label="${t('nav.language')}">${options}</select></div>
    <a class="btn" href="#pozvanka">${t('nav.cta')}</a>
  </div>
</header>
<main id="obsah">
  <section class="hero">
    <div class="wrap">
      <div>
        <p class="eyebrow">${t('hero.eyebrow')}</p>
        <h1><span>${t('hero.title1')}<sup aria-hidden="true">*</sup></span><span class="l2">${t('hero.title2')}</span><span class="l3">${t('hero.title3')}</span></h1>
        <p class="footnote">${t('hero.footnote')}</p>
        <p class="lead">${t('hero.lead')}</p>
        ${waitlistForm(t, 'hero')}
        <p class="note">${t('hero.note')}</p>
      </div>
      <div class="phone" role="img" aria-label="${t('hero.mockName')}, ${t('hero.mockAge')} · ${t('hero.mockSafety')}">
        <div class="screen">
          <div class="bar"><span>F<span class="star">*</span>app</span></div>
          <div class="card">
            <div class="initial">${t('hero.mockName').slice(0, 1)}</div>
            <div class="info">
              <div class="name">${t('hero.mockName')} <span style="font-family:var(--font-body);font-weight:600;font-size:1.1rem">${t('hero.mockAge')}</span></div>
              <span class="chip-safe">${icon.check} ${t('hero.mockVerified')}</span>
              <span class="meta">${t('hero.mockMeta')}</span>
            </div>
          </div>
          <div class="safety-pill"><b>${t('hero.mockSafety')}</b><span>${t('hero.mockSafetyText')}</span></div>
          <div class="actions"><span>${icon.close}</span><span class="like">${icon.heart}</span></div>
        </div>
      </div>
    </div>
  </section>

  <section id="jak">
    <div class="wrap">
      <h2>${t('how.title')}</h2>
      <p class="section-lead">${t('how.lead')}</p>
      <ol class="steps">
        ${[1, 2, 3, 4].map((n) => `<li><h3>${t(`how.step${n}Title`)}</h3><p>${t(`how.step${n}Text`)}</p></li>`).join('')}
      </ol>
    </div>
  </section>

  <section id="domluva">
    <div class="wrap split">
      <div>
        <p class="eyebrow" style="color:var(--accent)">${t('blind.eyebrow')}</p>
        <h2 style="margin-top:12px">${t('blind.title')}</h2>
        <p class="section-lead">${t('blind.text')}</p>
        <ul class="points">
          ${[1, 2, 3].map((n) => `<li><span style="color:var(--accent)">${icon.check}</span><span>${t(`blind.point${n}`)}</span></li>`).join('')}
        </ul>
      </div>
      <div class="overlap" aria-label="${t('blind.mockTitle')}">
        <h3>${t('blind.mockTitle')}</h3>
        <div class="group"><span class="label">${t('blind.mockBoth')}</span><div class="tags"><span class="tag yes">${t('blind.mockItem1')}</span><span class="tag yes">${t('blind.mockItem2')}</span></div></div>
        <div class="group"><span class="label">${t('blind.mockMaybe')}</span><div class="tags"><span class="tag maybe">${t('blind.mockItem3')}</span></div></div>
        <p class="hidden">${icon.eyeOff}<span>${t('blind.mockHidden')}</span></p>
      </div>
    </div>
  </section>

  <section id="bezpeci" class="band-safe">
    <div class="wrap">
      <p class="eyebrow">${t('safety.eyebrow')}</p>
      <h2 style="margin-top:12px">${t('safety.title')}</h2>
      <p class="section-lead">${t('safety.lead')}</p>
      <div class="tiles">
        ${tile('pin', 'trusted')}${tile('clock', 'checkin')}${tile('sos', 'sos')}${tile('keypad', 'duress')}${tile('phone', 'fakeCall')}${tile('note', 'discreet')}
      </div>
    </div>
  </section>

  <section class="manifesto">
    <div class="wrap">
      <p class="eyebrow" style="margin-bottom:16px">${t('consent.eyebrow')}</p>
      <blockquote>${t('consent.quote')}</blockquote>
      <div class="cols">
        ${[1, 2, 3].map((n) => `<div><h3>${t(`consent.point${n}Title`)}</h3><p>${t(`consent.point${n}Text`)}</p></div>`).join('')}
      </div>
    </div>
  </section>

  <section id="cena">
    <div class="wrap price">
      <div><h2>${t('pricing.title')}</h2><p class="section-lead">${t('pricing.text')}</p></div>
      <ul class="free-list">
        <li class="label">${t('pricing.freeTitle')}</li>
        ${[1, 2, 3, 4].map((n) => `<li><span style="color:var(--safe)">${icon.check}</span>${t(`pricing.free${n}`)}</li>`).join('')}
      </ul>
    </div>
  </section>

  <section id="otazky">
    <div class="wrap">
      <h2>${t('faq.title')}</h2>
      <div class="faq">
        ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<details><summary>${t(`faq.q${n}`)}</summary><p>${t(`faq.a${n}`)}</p></details>`).join('')}
      </div>
    </div>
  </section>

  <section id="pravidla">
    <div class="wrap">
      <h2>${t('rules.title')}</h2>
      <ul class="rules">${[1, 2, 3, 4, 5, 6].map((n) => `<li>${t(`rules.r${n}`)}</li>`).join('')}</ul>
    </div>
  </section>

  <section id="pozvanka" class="cta">
    <div class="wrap">
      <div class="cta-box">
        <div><h2>${t('waitlist.ctaTitle')}</h2><p>${t('waitlist.ctaText')}</p></div>
        ${waitlistForm(t, 'cta')}
      </div>
    </div>
  </section>

  <section id="soukromi" class="privacy">
    <div class="wrap"><div class="box">
      <h2>${t('privacy.title')}</h2>
      <p>${t('privacy.text', { email: esc(config.contactEmail) })}</p>
      <p>${t('privacy.controller', { company: esc(config.company) })}</p>
    </div></div>
  </section>
</main>
<footer>
  <div class="wrap">
    <span>${t('footer.rights', { year })}</span><span>${t('footer.adults')}</span>
    <a href="#pravidla">${t('footer.rules')}</a><a href="#soukromi">${t('footer.privacy')}</a>
    <span>${t('footer.contact')}: <span style="user-select:all">${esc(config.contactEmail)}</span></span>
    <p class="help">${t('footer.help')}</p>
  </div>
</footer>`;
}

function head(code, t, assets) {
  const alternates = ready.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${canonical(l.code)}">`).join('\n');
  const fonts = preview
    ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Manrope:wght@400;600;700&display=swap">'
    : '';
  return `<title>${t('meta.title')}</title>
<meta name="description" content="${t('meta.description')}">
<meta name="claude:viewport-fit-sides" content="cover">
<meta property="og:title" content="${t('meta.ogTitle')}">
<meta property="og:description" content="${t('meta.description')}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical(code)}">
<meta property="og:image" content="${config.siteUrl.replace(/\/$/, '')}/assets/og-${code}.png">
<meta name="theme-color" content="#121014">
<meta name="rating" content="adult">
<link rel="canonical" href="${canonical(code)}">
${alternates}
<link rel="alternate" hreflang="x-default" href="${canonical(FALLBACK_LOCALE)}">
${fonts}
<link rel="stylesheet" href="${assets}site.css">`;
}

function script(code, assets) {
  const tdict = read(code).waitlist ?? {};
  const t = { ...fallback.waitlist, ...tdict };
  const data = { locale: code, apiUrl: config.apiUrl, t: { sending: t.sending, success: t.success, errorEmail: t.errorEmail, errorConsent: t.errorConsent, errorServer: t.errorServer } };
  // Úvodní stránka (čeština) přesměruje návštěvníka podle jazyka prohlížeče, pokud si sám nevybral.
  const redirect =
    code === DEFAULT_LOCALE
      ? `<script>(function(){try{if(localStorage.getItem('fapp.lang'))return;}catch(e){}var have=${JSON.stringify(ready.map((l) => l.code))};var langs=navigator.languages||[navigator.language];for(var i=0;i<langs.length;i++){var tag=String(langs[i]||'').toLowerCase();var base=tag.split('-')[0];if(base==='cs')return;var hit=null;if(base==='zh')hit=/hant|tw|hk|mo/.test(tag)?'zh-Hant':'zh-Hans';else if(base==='pt')hit=/-pt/.test(tag)?'pt-PT':'pt-BR';else if(base==='no'||base==='nn')hit='nb';else{for(var j=0;j<have.length;j++){if(have[j].toLowerCase()===tag||have[j].toLowerCase()===base){hit=have[j];break;}}}if(hit&&have.indexOf(hit)>=0&&hit!=='cs'){location.replace(hit+'/index.html');return;}}})();</script>`
      : '';
  return `<script>window.FAPP_SITE=${JSON.stringify(data).replace(/</g, '\\u003c')};</script>${redirect}
<script src="${assets}site.js" defer></script>`;
}

function render(code) {
  const t = translator(code);
  const dir = isRTL(code) ? 'rtl' : 'ltr';
  const assets = code === DEFAULT_LOCALE ? 'assets/' : '../assets/';
  if (preview && code === DEFAULT_LOCALE) {
    // Hlavní stránka náhledu dostane kostru od prohlížeče artefaktu – jazyk a směr nastavíme skriptem.
    return `${head(code, t, assets)}\n${body(code, t)}\n${script(code, assets)}\n<script>document.documentElement.lang=${JSON.stringify(code)};document.documentElement.dir=${JSON.stringify(dir)};</script>\n`;
  }
  return `<!doctype html>
<html lang="${code}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head(code, t, assets)}
</head>
<body>
${body(code, t)}
${script(code, assets)}
</body>
</html>
`;
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'assets', 'fonts'), { recursive: true });
for (const f of ['site.css', 'site.js']) fs.copyFileSync(path.join(root, 'src', f), path.join(outDir, 'assets', f));
for (const f of fs.readdirSync(path.join(root, 'src', 'fonts'))) fs.copyFileSync(path.join(root, 'src', 'fonts', f), path.join(outDir, 'assets', 'fonts', f));
for (const l of ready) {
  const file = l.code === DEFAULT_LOCALE ? path.join(outDir, 'index.html') : path.join(outDir, l.code, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, render(l.code));
}
const og = path.join(root, '..', 'marketing', 'out', 'og');
if (fs.existsSync(og)) for (const f of fs.readdirSync(og)) fs.copyFileSync(path.join(og, f), path.join(outDir, 'assets', f));
if (!preview) {
  fs.writeFileSync(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${config.siteUrl.replace(/\/$/, '')}/sitemap.xml\n`);
  fs.writeFileSync(
    path.join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${ready.map((l) => `  <url><loc>${canonical(l.code)}</loc></url>`).join('\n')}\n</urlset>\n`,
  );
}
console.log(`Web: ${ready.length} jazyků → ${path.relative(process.cwd(), outDir)}`);
