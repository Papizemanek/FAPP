// Scéna pro kreativy kampaně. Parametry v adrese:
//   ?kind=banner&concept=safety&w=1080&h=1080&lang=cs
//   ?kind=video&video=how&w=1080&h=1920&lang=cs
// Texty jsou ze shared/i18n/web/<jazyk>.json (záloha angličtina). Video se kreslí deterministicky:
// renderer volá window.seek(t) pro každý snímek, takže výsledek nezávisí na rychlosti počítače.

const RTL = ['ar', 'he', 'ur'];
const q = new URLSearchParams(location.search);
const kind = q.get('kind') ?? 'banner';
const W = Number(q.get('w') ?? 1080);
const H = Number(q.get('h') ?? 1080);
const lang = q.get('lang') ?? 'cs';
const concept = q.get('concept') ?? 'brand';
const videoName = q.get('video') ?? 'how';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

async function loadDict(code) {
  try {
    const res = await fetch(`../../shared/i18n/web/${code}.json`);
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

function makeT(dict, fallback) {
  const get = (d, key) => key.split('.').reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), d);
  return (key, params) => {
    let v = get(dict, key);
    if (v === undefined || v === '') v = get(fallback, key);
    if (typeof v !== 'string') return key;
    if (params) v = v.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])));
    return esc(v);
  };
}

function format() {
  const r = H / W;
  if (W <= 340 && r >= 1.8) return 'sky';
  if (r <= 0.34) return H > 120 ? 'billboard' : 'strip';
  if (W < 420 && H < 420) return 'small';
  if (r >= 1.6) return 'tall';
  if (r >= 1.12) return 'portrait';
  if (r <= 0.7) return 'wide';
  return 'square';
}

// Zmenší písmo, dokud se text nevejde do svého rámečku (dlouhé jazyky jako němčina nebo finština).
function fit(el, { min = 0.35 } = {}) {
  if (!el || q.get('nofit')) return;
  const box = el.parentElement;
  const base = parseFloat(getComputedStyle(el).fontSize);
  let scale = 1;
  // Tolerance: písmo s háčky (Ř, Č) přesahuje řádek o pár pixelů i tam, kde se text vejde.
  const slack = (n) => Math.max(2, n * 0.03);
  const overflows = () =>
    el.scrollWidth > el.clientWidth + slack(el.clientWidth) ||
    box.scrollHeight > box.clientHeight + slack(box.clientHeight) ||
    el.scrollWidth > box.clientWidth + slack(box.clientWidth);
  while (overflows() && scale > min) {
    scale -= 0.04;
    el.style.fontSize = `${base * scale}px`;
  }
}

// Maketa se zmenší, aby se vešla do svého místa (dlouhé texty v maketě, malé formáty).
function fitVisual(vis) {
  const m = vis?.firstElementChild;
  if (!m) return;
  m.style.transform = '';
  const s = Math.min(1, vis.clientHeight / m.offsetHeight, vis.clientWidth / m.offsetWidth);
  m.style.transform = `scale(${s})`;
}

const icons = {
  check: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"/><path d="M9 11.5l2 2 4-4"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c5.5 0 9 6 9 6a16.6 16.6 0 0 1-2.9 3.5"/><path d="M6.6 7.6C4.3 9.1 3 12 3 12s3.5 6 9 6a8.7 8.7 0 0 0 4-.9"/></svg>',
};

const logo = () => '<span class="logo" dir="ltr">YesYes<b>*</b></span>';
const three = (t, tag = 'h1', cls = '') =>
  `<${tag} class="display three ${cls}"><span>${t('video.bumper1')}<sup>*</sup></span><span class="l2">${t('video.bumper2')}</span><span class="l3">${t('video.bumper3')}</span></${tag}>`;

// --- makety z aplikace (stejné jako na obrazovkách) ---
const mocks = {
  overlap: (t) => `<div class="mock overlap">
      <h4>${t('blind.mockTitle')}</h4>
      <div class="label">${t('blind.mockBoth')}</div>
      <div class="tags"><span class="tag yes" data-pop="0">${t('blind.mockItem1')}</span><span class="tag yes" data-pop="1">${t('blind.mockItem2')}</span></div>
      <div class="label">${t('blind.mockMaybe')}</div>
      <div class="tags"><span class="tag maybe" data-pop="2">${t('blind.mockItem3')}</span></div>
      <div class="hidden">${icons.eyeOff}<span>${t('blind.mockHidden')}</span></div>
    </div>`,
  profile: (t) => `<div class="mock profile">
      <div class="photo">${t('hero.mockName').slice(0, 1)}</div>
      <div class="info">
        <div class="name">${t('hero.mockName')} <span>${t('hero.mockAge')}</span></div>
        <span class="chip">${icons.check} ${t('hero.mockVerified')}</span>
        <span class="meta">${t('hero.mockMeta')}</span>
      </div>
    </div>`,
  safety: (t) => `<div class="mock safety">
      <div class="map"><div class="road"></div><div class="ring"></div><div class="pin"></div><span class="shared">${t('ads.mockLocation')}</span></div>
      <div class="pill"><b>${t('hero.mockSafety')}</b><span>${t('hero.mockSafetyText')}</span></div>
      <div class="timer"><span>${t('ads.mockCheckin')}</span><b class="mins">${t('ads.mockMinutes', { min: 30 })}</b></div>
      <div class="sos"><div class="fill"></div><span>${t('ads.mockSos')}</span></div>
    </div>`,
  pin: (t) => `<div class="mock pinpad">
      <div class="label">${t('ads.mockPin')}</div>
      <div class="dots">${'<i class="dot"></i>'.repeat(4)}</div>
      <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<span class="key" data-key="${n}">${n}</span>`).join('')}</div>
    </div>`,
  contact: (t) => `<div class="mock"><div class="contact"><div class="avatar">${t('ads.mockTrustedName').slice(0, 1)}</div><div><b>${t('ads.mockTrustedName')}</b><span>${t('ads.mockTrusted')}</span></div></div></div>`,
  sms: (t) => `<div class="notify"><div class="from"><i></i>${t('ads.mockSmsFrom')}</div><b>${t('ads.mockSms', { name: t('hero.mockName') })}</b></div>`,
  alarm: (t) => `<div class="notify alarm"><div class="from"><i></i>${t('ads.mockSmsFrom')}</div><b>${t('ads.mockAlarm', { name: t('hero.mockName') })}</b></div>`,
  verified: (t) => `<div class="verified-mark">${icons.shield}<span class="chip" style="color:var(--safe);font-size:calc(var(--u)*4)">${icons.check} ${t('hero.mockVerified')}</span></div>`,
};

// --- bannery ---
const BANNERS = {
  brand: { title: (t) => three(t, 'h1', 'title'), visual: null, footnote: true },
  blind: { title: (t) => `<h1 class="display title">${t('ads.blindTitle')}</h1>`, text: 'ads.blindText', visual: 'overlap' },
  safety: { title: (t) => `<h1 class="display title">${t('ads.safetyTitle')}</h1>`, text: 'ads.safetyText', visual: 'safety' },
  consent: { title: (t) => `<h1 class="display title quote">${t('ads.consentTitle')}</h1>`, text: 'ads.consentText', visual: null },
  verified: { title: (t) => `<h1 class="display title">${t('ads.verifiedTitle')}</h1>`, text: 'ads.verifiedText', visual: 'profile' },
  duress: { title: (t) => `<h1 class="display title">${t('ads.duressTitle')}</h1>`, text: 'ads.duressText', visual: 'pin' },
  soft: { title: (t) => `<h1 class="display title">${t('ads.softTitle')}</h1>`, text: 'ads.softText', visual: 'safety' },
};

function renderBanner(t, stage, fmt) {
  const spec = BANNERS[concept] ?? BANNERS.brand;
  const compact = ['strip', 'billboard', 'sky', 'small'].includes(fmt);
  // V malých formátech je místo tří řádků jen jedna věta.
  const title = compact && concept === 'brand' ? `<h1 class="display title">${t('ads.brandTitle')}</h1>` : spec.title(t);
  const text = spec.text ? `<p class="text">${t(spec.text)}</p>` : concept === 'brand' && !compact ? `<p class="footnote">${t('hero.footnote')}</p>` : '';
  const visual = spec.visual && !compact ? `<div class="visual">${mocks[spec.visual](t)}</div>` : '';
  stage.innerHTML = `
    <div class="glow" style="width:calc(var(--u)*90);height:calc(var(--u)*90);inset-inline-end:calc(var(--u)*-30);top:calc(var(--u)*-30);background:${concept === 'soft' || concept === 'safety' ? 'var(--safe)' : 'var(--accent)'}"></div>
    <div class="banner">
      <div class="top">${logo()}<span class="age" dir="ltr">${t('ads.adults')}</span></div>
      <div class="copy">${title}${text}</div>
      ${visual}
      <div class="bottom"><span class="cta">${t('ads.cta')}</span><span class="soon">${t('ads.soon')}</span></div>
    </div>`;
  if (fmt === 'strip' && H < 70) stage.classList.add('tiny');
  if (!visual && !compact) stage.classList.add('novis');
  stage.querySelectorAll('.map .ring').forEach((r) => (r.style.transform = 'scale(0.9)'));
  // Měří se až po načtení všech písem (jinak tamilština nebo hindština přetečou).
  return () => {
    const titleEl = stage.querySelector('.title, .three');
    if (titleEl?.classList.contains('three')) titleEl.querySelectorAll('span').forEach((s) => (s.style.whiteSpace = 'nowrap'));
    fit(titleEl);
    fit(stage.querySelector('.text'));
    fit(stage.querySelector('.footnote'));
    fitVisual(stage.querySelector('.visual'));
  };
}

// --- videa: scény s časováním (sekundy) ---
const VIDEOS = {
  how: {
    duration: 15,
    scenes: [
      { from: 0, to: 2.6, cap: ['video.how1'], vis: null, solo: true },
      { from: 2.6, to: 5.4, cap: ['video.how2'], vis: 'profile' },
      { from: 5.4, to: 8.6, cap: ['video.how3', 'video.how3b'], vis: 'overlap' },
      { from: 8.6, to: 11.2, cap: ['video.how4'], vis: 'safety' },
      { from: 11.2, to: 13.2, cap: ['video.how5', 'video.how5b'], vis: 'pin' },
      { from: 13.2, to: 15, end: true },
    ],
  },
  safety: {
    duration: 15,
    scenes: [
      { from: 0, to: 2.8, cap: ['video.safety1'], vis: null, solo: true },
      { from: 2.8, to: 5.6, cap: ['video.safety2'], vis: 'contact' },
      { from: 5.6, to: 8.4, cap: ['video.safety3'], vis: 'safety' },
      { from: 8.4, to: 11.2, cap: ['video.safety4'], vis: 'sms' },
      { from: 11.2, to: 13.4, cap: ['video.safety5'], vis: 'sosOnly' },
      { from: 13.4, to: 15, end: true },
    ],
  },
  bumper: { duration: 6, bumper: true },
};

function sceneHtml(t, s, i) {
  if (s.end) {
    return `<div class="scene endcard" data-i="${i}">${three(t, 'div')}<p>${t('video.endText')}</p><span class="cta">${t('ads.cta')}</span><p class="stores">${t('ads.stores')} · ${t('ads.adults')}</p></div>`;
  }
  const [title, sub] = s.cap;
  const vis = s.vis === 'sosOnly' ? `<div class="mock safety big" style="max-width:calc(var(--u)*70)"><div class="sos"><div class="fill"></div><span>${t('ads.mockSos')}</span></div><div class="label" style="text-align:center">${t('ads.mockHold')}</div></div>` : s.vis ? mocks[s.vis](t) : '';
  const extra = s.vis === 'pin' ? `<div class="alarm-wrap" style="position:absolute;inset-inline:calc(var(--u)*8);top:calc(var(--u)*6)">${mocks.alarm(t)}</div>` : '';
  return `<div class="scene${s.solo ? ' solo' : ''}" data-i="${i}">
      <div class="cap"><div class="display">${t(title)}${s.solo ? '<span class="star">*</span>' : ''}</div>${sub ? `<p class="sub">${t(sub)}</p>` : ''}</div>
      ${s.solo ? '' : `<div class="vis${['contact', 'sms', 'sosOnly'].includes(s.vis) ? ' bigger' : ''}">${vis}</div>`}${extra}
    </div>`;
}

function renderVideo(t, stage) {
  const v = VIDEOS[videoName] ?? VIDEOS.how;
  window.duration = v.duration;
  if (v.bumper) {
    stage.innerHTML = `<div class="glow" style="width:calc(var(--u)*110);height:calc(var(--u)*110);inset-inline-start:calc(var(--u)*-40);bottom:calc(var(--u)*-50);background:var(--accent)"></div>
      <div class="video"><div class="scene solo bump" style="opacity:1">${three(t, 'div')}<p class="footnote" style="margin-top:calc(var(--u)*5);opacity:0">${t('hero.footnote')}</p></div>
      <div class="brandbar" style="opacity:0">${logo()}<span class="age">${t('ads.soon')} · ${t('ads.adults')}</span></div></div>`;
    const lines = [...stage.querySelectorAll('.three span')];
    lines.forEach((s) => (s.style.whiteSpace = 'nowrap'));
    const foot = stage.querySelector('.footnote');
    const bar = stage.querySelector('.brandbar');
    window.seek = (time) => {
      lines.forEach((el, i) => {
        const p = ease((time - 0.25 - i * 1.0) / 0.45);
        el.style.opacity = String(p);
        el.style.transform = `translateY(${(1 - p) * 30}%) scale(${1 + (1 - p) * 0.15})`;
      });
      const f = ease((time - 3.4) / 0.5);
      foot.style.opacity = String(f);
      bar.style.opacity = String(ease((time - 3.9) / 0.5));
      const star = stage.querySelector('.three sup');
      star.style.display = 'inline-block';
      star.style.transform = `rotate(${time * 40}deg)`;
    };
    return () => fit(stage.querySelector('.three'));
  }
  stage.innerHTML = `<div class="glow g1" style="width:calc(var(--u)*100);height:calc(var(--u)*100);background:var(--accent)"></div>
    <div class="glow g2" style="width:calc(var(--u)*80);height:calc(var(--u)*80);background:var(--safe)"></div>
    <div class="video">${v.scenes.map((s, i) => sceneHtml(t, s, i)).join('')}
    <div class="brandbar">${logo()}<span class="age">${t('ads.adults')}</span></div></div>`;
  const scenes = [...stage.querySelectorAll('.scene')];
  // Každou scénu nejdřív ukážeme, aby šlo změřit a zmenšit text, pak ji zase schováme.
  const layout = () =>
    scenes.forEach((el) => {
      el.style.opacity = '1';
      fit(el.querySelector('.cap .display'));
      fit(el.querySelector('.three'));
      el.style.opacity = '0';
    });
  const g1 = stage.querySelector('.g1');
  const g2 = stage.querySelector('.g2');
  const bar = stage.querySelector('.brandbar');
  window.seek = (time) => {
    g1.style.transform = `translate(${-30 + 20 * Math.sin(time * 0.5)}%, ${-25 + 10 * Math.cos(time * 0.4)}%)`;
    g2.style.transform = `translate(${60 + 15 * Math.cos(time * 0.45)}%, ${110 + 10 * Math.sin(time * 0.6)}%)`;
    v.scenes.forEach((s, i) => {
      const el = scenes[i];
      const lt = time - s.from;
      const len = s.to - s.from;
      const inP = ease(lt / 0.45);
      const outP = s.end || i === v.scenes.length - 1 ? 0 : ease((lt - (len - 0.3)) / 0.3);
      const visible = time >= s.from - 0.01 && time < s.to + (s.end ? 1 : 0);
      el.style.opacity = visible ? String(inP * (1 - outP)) : '0';
      const cap = el.querySelector('.cap');
      if (cap) cap.style.transform = `translateY(${(1 - inP) * 8 - outP * 6}%)`;
      const vis = el.querySelector('.vis');
      if (vis) vis.style.transform = `translateY(${(1 - ease((lt - 0.12) / 0.5)) * 12}%) scale(${0.96 + 0.04 * ease((lt - 0.12) / 0.5)})`;
      if (s.end) {
        el.querySelectorAll('.three span').forEach((sp, k) => {
          const p = ease((lt - 0.1 - k * 0.18) / 0.4);
          sp.style.opacity = String(p);
          sp.style.transform = `translateY(${(1 - p) * 25}%)`;
        });
        bar.style.opacity = String(1 - ease(lt / 0.3));
      } else if (i === 0) {
        bar.style.opacity = String(ease(time / 0.5));
      }
      if (!visible) return;
      // vnitřní animace makety
      el.querySelectorAll('[data-pop]').forEach((tag) => {
        const p = ease((lt - 0.7 - Number(tag.dataset.pop) * 0.35) / 0.35);
        tag.style.opacity = String(p);
        tag.style.transform = `scale(${0.7 + 0.3 * p})`;
      });
      const ring = el.querySelector('.ring');
      if (ring) {
        const ph = (lt * 0.8) % 1;
        ring.style.transform = `scale(${0.3 + ph})`;
        ring.style.opacity = String(0.7 * (1 - ph));
      }
      const mins = el.querySelector('.mins');
      if (mins) mins.innerHTML = t('ads.mockMinutes', { min: Math.max(1, 30 - Math.floor(clamp((lt - 0.6) / 1.6) * 12)) });
      const dots = el.querySelectorAll('.dot');
      if (dots.length) {
        dots.forEach((d, k) => d.classList.toggle('on', lt > 0.5 + k * 0.3));
        // nouzový PIN 9999 – stisky klávesy 9
        el.querySelectorAll('.key').forEach((key) => {
          const pressed = key.dataset.key === '9' && [0, 1, 2, 3].some((k) => lt >= 0.5 + k * 0.3 && lt < 0.64 + k * 0.3);
          key.classList.toggle('hit', pressed);
        });
        const alarm = el.querySelector('.alarm-wrap');
        if (alarm) {
          const p = ease((lt - 1.75) / 0.3);
          alarm.style.opacity = String(p);
          alarm.style.transform = `translateY(${(1 - p) * -40}%)`;
        }
      }
      const fill = el.querySelector('.sos .fill');
      if (fill) fill.style.width = s.vis === 'sosOnly' ? `${clamp((lt - 0.5) / 1.2) * 100}%` : '0%';
      const notify = el.querySelector('.vis > .notify');
      if (notify) notify.style.transform = `translateY(${(1 - ease((lt - 0.5) / 0.4)) * -60}%)`;
    });
  };
  return layout;
}

async function main() {
  const [dict, fallback] = await Promise.all([loadDict(lang), lang === 'en' ? Promise.resolve({}) : loadDict('en')]);
  const t = makeT(dict, fallback);
  const fmt = format();
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.includes(lang) ? 'rtl' : 'ltr';
  const stage = document.getElementById('stage');
  stage.style.width = `${W}px`;
  stage.style.height = `${H}px`;
  stage.style.setProperty('--u', `${Math.min(W, H) / 100}px`);
  stage.className = `fmt-${fmt} concept-${concept}`;
  await document.fonts.ready;
  // fonty se načítají líně – vynutíme je dopředu, ať se text měří už ve správném písmu
  await Promise.all(['800 40px "Bricolage Grotesque"', '700 20px Manrope', '400 20px Manrope', '600 20px Manrope'].map((f) => document.fonts.load(f).catch(() => {})));
  const layout = kind === 'video' ? renderVideo(t, stage) : renderBanner(t, stage, fmt);
  // Písma pro jiné abecedy se stahují, až když je na stránce text, který je potřebuje.
  const text = stage.textContent;
  await Promise.all(
    ['400', '700', '800'].flatMap((w) => [`${w} 40px "Noto Script"`, `${w} 40px "Manrope"`, `${w} 40px "Bricolage Grotesque"`]).map((f) => document.fonts.load(f, text).catch(() => {})),
  );
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => r()));
  layout?.();
  if (kind === 'video') window.seek(0);
  window.ready = true;
}

main();
