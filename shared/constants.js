// Číselníky sdílené serverem (validace) i aplikací (popisky).

export const APP_NAME = 'YesYes';

export const MIN_AGE = 18;

export const GENDERS = {
  man: 'Muž',
  woman: 'Žena',
  nonbinary: 'Nebinární',
};

// Co člověk hledá – zobrazuje se na kartě profilu.
export const TAGS = {
  oneoff: 'Jednorázovka',
  repeat: 'Opakovaně',
  myplace: 'U mě',
  yourplace: 'U tebe',
  vanilla: 'Vanilka',
  kinky: 'Kinky',
};

// Aktivity v domluvě. Každý u nich zvlášť zvolí ano / možná / ne.
export const ACTIVITIES = {
  kissing: 'Líbání a mazlení',
  oral: 'Orální',
  vaginal: 'Vaginální',
  anal: 'Anální',
  toys: 'Hračky',
  overnight: 'Přespání',
};

// Domluva není souhlas. Každý si zvlášť a naslepo vyplní, na co má chuť; druhý uvidí jen shodu.
export const WISHES = { yes: 'Ano', maybe: 'Možná', no: 'Ne' };

// Texty, které oba při uložení domluvy výslovně potvrzují. Při změně textu zvyš verzi.
export const CONSENT_TEXT_VERSION = 2;
export const INTENT_TEXT = 'Takhle si to představuju. Na místě můžu cokoli odmítnout – a totéž platí pro druhého.';
export const NOTICE_TEXT =
  'Beru na vědomí: souhlas platí jen teď a tady. „Ne“, „stop“, stopslovo, mlčení, ztuhnutí nebo opilost nejsou souhlas. Domluva v aplikaci nikoho nezbavuje odpovědnosti.';
export const DETERRENCE_TEXT = 'Všichni na YesYes mají ověřenou totožnost. Při podezření z trestného činu ji předáme policii.';

// Po zrušení domluvy může novou otevřít jen ten, kdo ji zrušil – druhý až po této době.
export const REVOKE_COOLDOWN_DAYS = 7;

// Obsah domluvy (přání, místo, stopslovo) se po schůzce maže, pokud ho někdo z dvojice nepotřebuje uchovat.
export const AGREEMENT_RETENTION_HOURS = 48;

export const CHECK_IN_OPTIONS = [15, 30, 45, 60, 90, 120];

// Kolik minut po termínu check-inu se pošle upozornění důvěryhodné osobě.
export const CHECK_IN_GRACE_MINUTES = 5;

// Po kolika špatných PINech během jedné schůzky se spustí tichý poplach.
export const WRONG_PIN_ALARM_THRESHOLD = 3;

export const MAX_PROFILE_PHOTOS = 3;

export const REPORT_REASONS = {
  consent: 'Porušení souhlasu nebo hranic',
  violence: 'Násilí nebo ohrožení',
  minor: 'Podezření na nezletilou osobu',
  harassment: 'Obtěžování',
  fake: 'Falešný profil',
  paid: 'Nabízení placených služeb',
  other: 'Jiné',
};

// Důvody negativního hodnocení po schůzce. Protějšek hodnocení nikdy nevidí.
export const FEEDBACK_REASONS = {
  consent: 'Nerespektoval/a hranice nebo „stop“',
  safety: 'Cítil/a jsem se v ohrožení',
  fake: 'Nevypadal/a jako na fotkách',
  other: 'Něco jiného',
};

// ---------------------------------------------------------------------------
// Předplatné po vzoru Tinderu. Bezpečnost (ověření, domluva, bezpečnostní režim,
// SOS, nahlašování) je vždy zdarma – platí se jen za pohodlí a viditelnost.

// 'free' = start zdarma: nic se neprodává, lajky bez limitu. 'paid' = placené úrovně zapnuté.
export const BILLING_MODES = { free: 'Start zdarma', paid: 'Placený' };

export const PLANS = {
  free: { name: 'Zdarma', rank: 0 },
  plus: { name: 'Plus', rank: 1 },
  gold: { name: 'Gold', rank: 2 },
  platinum: { name: 'Platinum', rank: 3 },
};

// Funkce → nejnižší úroveň, která ji obsahuje.
export const FEATURES = {
  unlimitedLikes: { plan: 'plus', name: 'Neomezené lajky', detail: 'Swipuj, kolik chceš.' },
  rewind: { plan: 'plus', name: 'Vrácení swipu', detail: 'Vrať omylem odmítnutý profil.' },
  travel: { plan: 'plus', name: 'Na cestách', detail: 'Swipuj v jiném městě ještě před cestou.' },
  incognito: { plan: 'plus', name: 'Inkognito', detail: 'Uvidí tě jen ti, koho lajkneš.' },
  seeLikes: { plan: 'gold', name: 'Kdo tě lajkl', detail: 'Uvidíš všechny, kdo tě lajkli.' },
  weeklySuperLikes: { plan: 'gold', name: '5 super lajků týdně', detail: 'Dej najevo, že o někoho opravdu stojíš.' },
  monthlyBoost: { plan: 'gold', name: '1 boost měsíčně', detail: '30 minut nahoře u lidí v okolí.' },
  priorityLikes: { plan: 'platinum', name: 'Prioritní lajky', detail: 'Tvůj lajk uvidí dřív než ostatní.' },
  sentLikes: { plan: 'platinum', name: 'Odeslané lajky', detail: 'Koho jsi lajkl/a za posledních 7 dní.' },
  tonight: { plan: 'platinum', name: 'Dnes večer kdykoli', detail: 'Ukaž, že máš čas ještě dnes.' },
};

export const FREE_LIKES_PER_WINDOW = 50;
export const LIKES_WINDOW_HOURS = 12;
export const WEEKLY_SUPER_LIKES = 5;
export const BOOST_MINUTES = 30;
// „Dnes večer“ platí do 6:00 ráno pražského času.
export const TONIGHT_END_HOUR = 6;
export const SENT_LIKES_DAYS = 7;

// Produkty v obchodech. Ceny jsou výchozí návrh v Kč – skutečné se nastavují v App Store a Google Play.
export const PRODUCTS = {
  plus_1m: { kind: 'plan', plan: 'plus', months: 1, priceCzk: 199 },
  plus_6m: { kind: 'plan', plan: 'plus', months: 6, priceCzk: 894 },
  plus_12m: { kind: 'plan', plan: 'plus', months: 12, priceCzk: 1428 },
  gold_1m: { kind: 'plan', plan: 'gold', months: 1, priceCzk: 349 },
  gold_6m: { kind: 'plan', plan: 'gold', months: 6, priceCzk: 1674 },
  gold_12m: { kind: 'plan', plan: 'gold', months: 12, priceCzk: 2748 },
  platinum_1m: { kind: 'plan', plan: 'platinum', months: 1, priceCzk: 499 },
  platinum_6m: { kind: 'plan', plan: 'platinum', months: 6, priceCzk: 2394 },
  platinum_12m: { kind: 'plan', plan: 'platinum', months: 12, priceCzk: 3948 },
  boost_1: { kind: 'credit', credit: 'boost', amount: 1, priceCzk: 99 },
  boost_5: { kind: 'credit', credit: 'boost', amount: 5, priceCzk: 399 },
  superlike_1: { kind: 'credit', credit: 'superlike', amount: 1, priceCzk: 39 },
  superlike_5: { kind: 'credit', credit: 'superlike', amount: 5, priceCzk: 149 },
  tonight_1: { kind: 'credit', credit: 'tonight', amount: 1, priceCzk: 129 },
};

export const CREDITS = { boost: 'Boost', superlike: 'Super lajk', tonight: 'Dnes večer' };

// Města pro „Na cestách“ – poloha je střed města, nikdy přesné místo.
export const TRAVEL_CITIES = {
  praha: { name: 'Praha', lat: 50.08, lng: 14.42 },
  brno: { name: 'Brno', lat: 49.19, lng: 16.61 },
  ostrava: { name: 'Ostrava', lat: 49.83, lng: 18.28 },
  plzen: { name: 'Plzeň', lat: 49.74, lng: 13.37 },
  liberec: { name: 'Liberec', lat: 50.77, lng: 15.06 },
  olomouc: { name: 'Olomouc', lat: 49.59, lng: 17.25 },
  budejovice: { name: 'České Budějovice', lat: 48.97, lng: 14.47 },
  hradec: { name: 'Hradec Králové', lat: 50.21, lng: 15.83 },
  bratislava: { name: 'Bratislava', lat: 48.15, lng: 17.11 },
  viden: { name: 'Vídeň', lat: 48.21, lng: 16.37 },
  berlin: { name: 'Berlín', lat: 52.52, lng: 13.4 },
};
