# F*app

Seznamka pro dospělé (18+), jednoduchá jako Tinder, zaměřená čistě na sex. Navíc má dvě věci:

- **Dohoda (souhlas):** dvojice si před schůzkou domluví, co ano a co ne, ochranu a stopslovo. Platí, až když ji potvrdí oba. Jakákoli změna znamená nové potvrzení obou a odvolat ji jde kdykoli.
- **Bezpečná schůzka:** sdílení polohy s důvěryhodnou osobou, check-iny a SOS. SOS ani zmeškaný check-in protějšek nevidí.

## Design

Klikací návrh obrazovek: https://claude.ai/artifact/6t6o5Ewyci4ugkCSCMiwh1

## Stav

Rozpracováno. Zatím je hotový základ serveru (Node.js, Express, vestavěné SQLite):

- `shared/constants.js`: číselníky sdílené serverem a webem (aktivity, souhlasy, důvody nahlášení)
- `server/src/db.js`: databázové schéma
- `server/src/model.js`: stav dohody a bezpečnostního režimu
- `server/src/routes/`: registrace, přihlášení a profil

Další na řadě: swipe a matche, chat, dohoda, bezpečnostní režim, webové rozhraní podle designu a testy.
