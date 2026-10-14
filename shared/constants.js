// Číselníky sdílené serverem (validace) i webem (popisky).

export const APP_NAME = 'F*app';

export const GENDERS = {
  man: 'Muž',
  woman: 'Žena',
  nonbinary: 'Nebinární',
};

// Co člověk hledá – zobrazuje se na kartě profilu.
export const TAGS = {
  oneoff: 'Jednorázovka',
  repeat: 'Opakovaně',
  fwb: 'FWB',
  myplace: 'U mě',
  yourplace: 'U tebe',
  hotel: 'Hotel',
  daytime: 'Přes den',
  night: 'V noci',
  vanilla: 'Vanilka',
  kinky: 'Kinky',
};

// Co je součástí dohody. Cokoli, co tu není zaškrtnuté, dohodnuté není.
export const ACTIVITIES = {
  kissing: 'Líbání a mazlení',
  touching: 'Petting a dotyky',
  oral: 'Orální sex',
  vaginal: 'Vaginální sex',
  anal: 'Anální sex',
  toys: 'Erotické hračky',
  kink: 'Kink / BDSM (upřesnit v hranicích)',
  overnight: 'Přespání',
};

// Prohlášení, která musí každý z dvojice výslovně zaškrtnout, než je dohoda potvrzená.
export const CONSENTS = [
  { key: 'adult', text: 'Je mi 18 let nebo víc.' },
  { key: 'voluntary', text: 'Souhlasím dobrovolně, bez nátlaku a jsem při smyslech.' },
  {
    key: 'revocable',
    text: 'Vím, že souhlas můžu kdykoli – i během schůzky – odvolat. „Ne“, „stop“ nebo stopslovo znamená okamžitý konec.',
  },
  {
    key: 'scope',
    text: 'Souhlas platí jen pro to, co je v téhle dohodě. Cokoli navíc se musí znovu a výslovně domluvit.',
  },
  {
    key: 'safety',
    text: 'Beru na vědomí, že protějšek může během schůzky sdílet svou polohu, moje jméno a fotku se svou důvěryhodnou osobou.',
  },
];

export const CHECK_IN_OPTIONS = [15, 30, 45, 60, 90, 120];

// Kolik minut po termínu check-inu se stav přepne na „nereaguje“.
export const CHECK_IN_GRACE_MINUTES = 5;

export const REPORT_REASONS = {
  consent: 'Porušení souhlasu nebo hranic',
  violence: 'Násilí nebo ohrožení',
  minor: 'Podezření na nezletilou osobu',
  harassment: 'Obtěžování',
  fake: 'Falešný profil',
  paid: 'Nabízení placených služeb',
  other: 'Jiné',
};

export const MIN_AGE = 18;
