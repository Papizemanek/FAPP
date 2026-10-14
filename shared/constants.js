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

// Co je součástí dohody. Cokoli, co tu není zaškrtnuté, dohodnuté není.
export const ACTIVITIES = {
  kissing: 'Líbání a mazlení',
  oral: 'Orální',
  vaginal: 'Vaginální',
  anal: 'Anální',
  toys: 'Hračky',
  overnight: 'Přespání',
};

// Prohlášení, které každý z dvojice výslovně potvrzuje. Při změně textu zvyš verzi.
export const CONSENT_TEXT_VERSION = 1;
export const CONSENT_TEXT =
  'Je mi 18+, souhlasím dobrovolně a vím, že souhlas můžu kdykoli odvolat – i během schůzky.';

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
  consent: 'Nerespektoval/a dohodu nebo „stop“',
  safety: 'Cítil/a jsem se v ohrožení',
  fake: 'Nevypadal/a jako na fotkách',
  other: 'Něco jiného',
};
