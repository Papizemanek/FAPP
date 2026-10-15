// Číselníky sdílené serverem (validace) i aplikací (popisky).

export const APP_NAME = 'F*app';

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
export const DETERRENCE_TEXT = 'Všichni na F*app mají ověřenou totožnost. Při podezření z trestného činu ji předáme policii.';

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
