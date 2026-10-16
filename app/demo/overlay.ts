// Demo panel nad aplikací (čisté DOM, mimo React Native): přihlašovací údaje, „odeslané“ SMS,
// pohled důvěryhodné osoby a posunutí času. V nativní aplikaci nic z toho není.

type Sms = { to: string; phone: string; text: string; sessionId: number; at: number };
type Hooks = {
  shareView: (sessionId: number) => any;
  latestSafetyId: () => number | null;
  skipTime: (minutes: number) => void;
  reset: () => void;
  billingMode: () => 'free' | 'paid';
  setBillingMode: (mode: 'free' | 'paid') => void;
  exhaustLikes: () => void;
};

const C = {
  bg: '#121014',
  surface: '#1C181F',
  line: '#3A3340',
  text: '#F5EFE9',
  muted: '#B4AAB8',
  accent: '#FF6B8B',
  safe: '#62E0B5',
  warn: '#F5B94A',
  alarm: '#FF8A80',
  sos: '#FF4B3E',
};
const FONT = "Manrope_500Medium, Manrope_400Regular, system-ui, -apple-system, 'Segoe UI', sans-serif";
const DISPLAY = "BricolageGrotesque_800ExtraBold, system-ui, sans-serif";

const sent: Sms[] = [];
let hooks: Hooks | null = null;
let root: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let shareTimer: ReturnType<typeof setInterval> | null = null;

const el = (tag: string, style: Partial<CSSStyleDeclaration>, text?: string) => {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (label: string, onClick: () => void, variant: 'ghost' | 'accent' | 'safe' = 'ghost') => {
  const b = el('button', {
    minHeight: '44px',
    padding: '0 16px',
    borderRadius: '999px',
    border: variant === 'ghost' ? `1.5px solid ${C.line}` : '0',
    background: variant === 'accent' ? C.accent : variant === 'safe' ? C.safe : 'transparent',
    color: variant === 'ghost' ? C.text : C.bg,
    font: `700 14px ${FONT}`,
    cursor: 'pointer',
  }, label) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

function ensureRoot() {
  if (root || typeof document === 'undefined') return;
  root = el('div', { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483000' });
  document.body.appendChild(root);

  // Úzký štítek u pravého okraje – nepřekrývá ovládání aplikace.
  const pill = button('DEMO', togglePanel, 'accent');
  Object.assign(pill.style, {
    position: 'absolute',
    right: 'max(0px, calc((100vw - 440px) / 2))',
    top: '38%',
    pointerEvents: 'auto',
    boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
    minHeight: '0',
    width: '26px',
    height: '72px',
    padding: '0',
    borderRadius: '12px 0 0 12px',
    writingMode: 'vertical-rl',
    letterSpacing: '1.5px',
    fontSize: '11px',
  });
  pill.setAttribute('aria-label', 'Demo panel');
  root.appendChild(pill);
}

function card(children: HTMLElement[]) {
  const box = el('div', {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: '0',
    width: 'min(440px, 100vw)',
    maxHeight: '85%',
    overflowY: 'auto',
    boxSizing: 'border-box',
    padding: '20px max(16px, env(safe-area-inset-left, 0px)) calc(24px + env(safe-area-inset-bottom, 0px))',
    background: C.surface,
    borderTop: `1px solid ${C.line}`,
    borderRadius: '24px 24px 0 0',
    color: C.text,
    font: `400 14px/1.5 ${FONT}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    pointerEvents: 'auto',
  });
  children.forEach((c) => box.appendChild(c));
  return box;
}

function backdrop(onClose: () => void) {
  const b = el('div', { position: 'absolute', inset: '0', background: 'rgba(10,8,12,0.6)', pointerEvents: 'auto' });
  b.addEventListener('click', (e) => e.target === b && onClose());
  return b;
}

function closePanel() {
  panel?.remove();
  panel = null;
  if (shareTimer) clearInterval(shareTimer);
  shareTimer = null;
}

function togglePanel() {
  if (panel) return closePanel();
  openPanel();
}

function openPanel() {
  if (!root || !hooks) return;
  closePanel();
  const h = hooks;
  const title = el('div', { font: `800 24px ${DISPLAY}` }, 'Prototyp F*app');
  const intro = el(
    'div',
    { color: C.muted },
    'Data jsou ukázková a běží jen v tvém prohlížeči. Nic se neodesílá – SMS pro důvěryhodnou osobu uvidíš tady.',
  );
  const creds = el('div', { background: C.bg, border: `1px solid ${C.line}`, borderRadius: '14px', padding: '12px 14px' });
  creds.innerHTML = `<div style="font-weight:700">Demo účet</div>
    <div>E-mail: <b style="user-select:all">lucie@demo.fapp</b></div>
    <div>Heslo: <b style="user-select:all">demo-heslo-123</b></div>
    <div style="color:${C.muted};margin-top:6px">PIN <b style="color:${C.text}">1234</b> · nouzový PIN <b style="color:${C.text}">9999</b> (vypadá stejně, ale spustí poplach)</div>
    <div style="color:${C.muted};margin-top:6px">Nebo si založ vlastní účet – ověření totožnosti je tu simulované.</div>`;

  const actions = el('div', { display: 'flex', flexWrap: 'wrap', gap: '8px' });
  const sid = h.latestSafetyId();
  if (sid) {
    actions.appendChild(button('Co vidí důvěryhodná osoba', () => openShare(sid), 'safe'));
    actions.appendChild(
      button('Posunout čas o 30 min', () => {
        h.skipTime(30);
        openPanel();
      }),
    );
  }
  actions.appendChild(
    button('Začít znovu', () => {
      h.reset();
      sent.length = 0;
      openPanel();
    }),
  );

  // Platby: na startu je F*app zdarma, placený režim ukazuje model po vzoru Tinderu.
  const mode = h.billingMode();
  const billingBox = el('div', { background: C.bg, border: `1px solid ${C.line}`, borderRadius: '14px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' });
  billingBox.appendChild(el('div', { fontWeight: '700' }, 'Platby'));
  billingBox.appendChild(
    el(
      'div',
      { color: C.muted },
      mode === 'free'
        ? 'Teď: start zdarma – nic se neprodává a lajky jsou bez limitu. Přepni na placený režim a uvidíš Plus, Gold a Platinum.'
        : 'Teď: placený režim – 50 lajků zdarma za 12 h, Plus, Gold, Platinum a jednorázové nákupy. Nákupy jsou jen simulované.',
    ),
  );
  const modeRow = el('div', { display: 'flex', flexWrap: 'wrap', gap: '8px' });
  const pick = (label: string, value: 'free' | 'paid') => {
    const b = button(label, () => {
      h.setBillingMode(value);
      openPanel();
    }, mode === value ? 'accent' : 'ghost');
    b.setAttribute('aria-pressed', String(mode === value));
    return b;
  };
  modeRow.appendChild(pick('Start zdarma', 'free'));
  modeRow.appendChild(pick('Placený režim', 'paid'));
  if (mode === 'paid') {
    modeRow.appendChild(
      button('Vyčerpat lajky zdarma', () => {
        h.exhaustLikes();
        closePanel();
      }),
    );
  }
  billingBox.appendChild(modeRow);

  const smsTitle = el('div', { fontWeight: '700', marginTop: '4px' }, sent.length ? 'Odeslané SMS' : 'Zatím žádné SMS');
  const list = el('div', { display: 'flex', flexDirection: 'column', gap: '8px' });
  [...sent].reverse().forEach((m) => list.appendChild(smsBubble(m)));

  panel = el('div', { position: 'absolute', inset: '0' });
  panel.appendChild(backdrop(closePanel));
  const close = button('Zavřít', closePanel);
  panel.appendChild(card([title, intro, creds, actions, billingBox, smsTitle, list, close]));
  root.appendChild(panel);
}

function smsBubble(m: Sms) {
  const b = el('div', { background: C.bg, border: `1px solid ${C.line}`, borderRadius: '14px', padding: '10px 12px' });
  const head = el('div', { color: C.muted, fontSize: '12px' }, `SMS → ${m.to} (${m.phone}) · ${new Date(m.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`);
  const body = el('div', {}, m.text);
  b.append(head, body);
  return b;
}

function toast(m: Sms) {
  if (!root) return;
  const t = el('button', {
    position: 'absolute',
    top: 'calc(10px + env(safe-area-inset-top, 0px))',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(420px, calc(100vw - 24px))',
    textAlign: 'left',
    background: C.surface,
    color: C.text,
    border: `1px solid ${/POPLACH/.test(m.text) ? C.alarm : C.line}`,
    borderRadius: '16px',
    padding: '12px 14px',
    font: `400 14px/1.45 ${FONT}`,
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    pointerEvents: 'auto',
    cursor: 'pointer',
  });
  t.innerHTML = `<div style="font-size:12px;color:${C.muted}">SMS pro ${m.to} · ukázka, nic se neodeslalo</div>`;
  t.appendChild(el('div', {}, m.text));
  t.appendChild(el('div', { fontSize: '12px', color: C.safe, marginTop: '4px', fontWeight: '700' }, 'Klepni pro pohled důvěryhodné osoby'));
  t.addEventListener('click', () => {
    t.remove();
    openShare(m.sessionId);
  });
  root.appendChild(t);
  setTimeout(() => t.remove(), 9000);
}

function openShare(sessionId: number) {
  if (!root || !hooks) return;
  closePanel();
  const h = hooks;
  panel = el('div', { position: 'absolute', inset: '0', background: C.bg, pointerEvents: 'auto', overflowY: 'auto' });
  const wrap = el('div', {
    maxWidth: '440px',
    margin: '0 auto',
    boxSizing: 'border-box',
    padding: 'calc(16px + env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-left, 0px)) 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    color: C.text,
    font: `400 15px/1.5 ${FONT}`,
  });
  panel.appendChild(wrap);
  root.appendChild(panel);

  const render = () => {
    const d = h.shareView(sessionId);
    wrap.innerHTML = '';
    const header = el('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '44px' });
    const logo = el('div', { font: `800 22px ${DISPLAY}` });
    logo.innerHTML = `F<span style="color:${C.accent}">*</span>app`;
    header.append(logo, el('div', { color: C.muted, fontSize: '13px' }, 'Pohled důvěryhodné osoby'));
    wrap.appendChild(header);
    wrap.appendChild(el('div', { color: C.muted, fontSize: '13px' }, 'Tohle uvidí v prohlížeči, když otevře odkaz z SMS. Nepotřebuje aplikaci.'));
    if (!d) {
      wrap.appendChild(el('div', {}, 'Odkaz už neplatí.'));
    } else {
      const tones: Record<string, [string, string, string, string]> = {
        ok: [`${d.name} je v pořádku`, `Poslední potvrzení v ${t(d.lastCheckInAt)}. Další čekáme do ${t(d.nextCheckInDue)}.`, C.safe, '#15241F'],
        overdue: [`${d.name} se neozval/a`, `Potvrzení mělo přijít do ${t(d.nextCheckInDue)}. Zkus zavolat. Když to nebude brát, volej 112 a nadiktuj adresu z mapy.`, C.warn, '#2A2418'],
        alarm: [`${d.name} potřebuje pomoc`, `Poplach v ${t(d.alarmAt)}. Zavolej 112 a nadiktuj polohu z mapy a místo schůzky níže.`, C.alarm, '#2A1918'],
        ended: ['Schůzka skončila', `${d.name} potvrdil/a, že je v pořádku.${d.hadAlarm ? ' Během schůzky byl spuštěn poplach – zeptej se, jestli je všechno v pořádku.' : ''}`, C.text, C.surface],
      };
      const [title, detail, color, bg] = tones[d.status];
      const status = el('div', { background: bg, border: `1px solid ${C.line}`, borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' });
      status.append(el('div', { font: `800 28px/1.15 ${DISPLAY}`, color }, title), el('div', {}, detail));
      wrap.appendChild(status);
      if (d.status === 'alarm' || d.status === 'overdue') {
        wrap.appendChild(el('div', { textAlign: 'center', background: C.sos, color: '#fff', borderRadius: '999px', padding: '16px', font: `800 17px ${FONT}` }, 'Zavolat 112'));
      }
      if (d.location) {
        const map = el('div', { height: '180px', borderRadius: '20px', border: `1px solid ${C.line}`, background: '#1E1B22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '6px', color: C.muted, fontSize: '13px' });
        map.append(el('div', { width: '18px', height: '18px', borderRadius: '50%', background: d.status === 'ok' ? C.safe : C.alarm, border: `3px solid ${C.bg}` }), el('div', {}, `${d.location.lat.toFixed(5)}, ${d.location.lng.toFixed(5)} · baterie ${Math.round((d.location.battery ?? 0) * 100)} %`), el('div', {}, '[mapa – ve skutečné verzi živá mapa]'));
        wrap.appendChild(map);
      }
      if (d.partner) {
        const p = el('div', { background: C.surface, border: `1px solid ${C.line}`, borderRadius: '16px', padding: '14px' });
        p.innerHTML = `<div style="color:${C.muted};font-size:13px">Na schůzce s:</div><div style="font-weight:700;font-size:17px"></div><div style="color:${C.muted};font-size:13px"></div>`;
        (p.children[1] as HTMLElement).textContent = `${d.partner.name}, ${d.partner.age}`;
        (p.children[2] as HTMLElement).textContent = `${new Date(d.meetAt).toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${d.place}`;
        wrap.appendChild(p);
      }
    }
    wrap.appendChild(button('Zpět do aplikace', closePanel, 'accent'));
  };
  render();
  shareTimer = setInterval(render, 2000);
}

const t = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '');

export const overlay = {
  init(h: Hooks) {
    hooks = h;
    if (typeof document === 'undefined') return;
    if (document.body) ensureRoot();
    else document.addEventListener('DOMContentLoaded', ensureRoot);
    // úvodní panel jen při první návštěvě
    try {
      if (!localStorage.getItem('fapp-demo-intro')) {
        localStorage.setItem('fapp-demo-intro', '1');
        setTimeout(openPanel, 1200);
      }
    } catch {
      setTimeout(openPanel, 1200);
    }
  },
  sms(m: Omit<Sms, 'at'>) {
    const full = { ...m, at: Date.now() };
    sent.push(full);
    ensureRoot();
    toast(full);
  },
};
