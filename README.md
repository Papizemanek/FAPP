# F*app

Seznamka pro dospělé – jednoduchá jako Tinder, ale jen na sex. Navíc má výslovný souhlas obou a bezpečnou schůzku.

Design (klikací návrh obrazovek): https://claude.ai/artifact/6t6o5Ewyci4ugkCSCMiwh1
Prototyp (skutečná aplikace v prohlížeči s ukázkovými daty): https://claude.ai/artifact/E4og3hH6XUX8xTNuoe4Bb6

```
shared/   číselníky sdílené serverem a aplikací (aktivity, text souhlasu, důvody nahlášení…)
server/   API (Node.js 22, Express 5, vestavěné SQLite), hlídač check-inů, stránka pro důvěryhodnou osobu
app/      nativní aplikace (Expo SDK 57 / React Native, expo-router)
```

## Jak to funguje

1. **Registrace → povinné ověření totožnosti** (doklad + selfie u externí služby). Bez ověření nejde swipovat ani psát.
   Doklad ani fotky si neukládáme – jen výsledek, datum narození a HMAC otisk identity.
   - pod 18 let → účet se pozastaví,
   - jeden člověk = jeden účet,
   - **ban platí na osobu**: zabanovaný člověk si nový účet neověří – při shodě otisku je nový účet hned zablokovaný.
2. **Swipe a match** jako na Tinderu. Poloha domova se ukládá jen zaokrouhlená na mřížku ~1 km a vzdálenost se ukazuje v celých km
   (ochrana proti dopočítání adresy z několika měření).
3. **Chat** – texty jsou v databázi šifrované (AES-256-GCM), screenshoty jsou v chatu zakázané, fotky přicházejí rozmazané, dokud je příjemce sám neodkryje.
   Automatická moderace: zmínka o nezletilosti nebo nabídka placeného sexu se nedoručí a jde moderátorům; sdílení telefonu či jiné sítě se doručí
   s upozorněním pro příjemce.
4. **Dohoda (souhlas)** – co ano, kondom, střízlivost, kdy, kde, stopslovo. Platí, až ji potvrdí **oba**. Každá změna = nová verze a oba znovu potvrzují.
   Odvolat jde kdykoli jedním tlačítkem, bez udání důvodu – i během schůzky a i z pozastaveného účtu.
5. **Schůzka v bezpečnostním režimu** (jen s potvrzenou dohodou):
   - důvěryhodná osoba dostane SMS s odkazem na stránku s polohou, stavem a tím, s kým a kde je schůzka,
   - poloha se sdílí i na pozadí; ukládá se jen poslední bod a po skončení se maže,
   - **check-iny hlídá server** – když telefon zmlkne (vybitý, odcizený), SMS odejde i tak,
   - **SOS** (podržením) pošle poplach důvěryhodné osobě; 112 v aplikaci záměrně není – odkaz na 112 vidí jen důvěryhodná osoba, a to jen při poplachu,
   - **PIN** potvrzuje „jsem v pořádku“ (check-in, zrušení SOS, ukončení). **Nouzový PIN** vypadá na obrazovce úplně stejně, ale potichu spustí poplach.
     Třikrát špatný PIN = tichý poplach,
   - protějšek vidí jen „bezpečnostní režim je zapnutý“ – nikdy SOS, poplach ani polohu,
   - odvolání souhlasu, unmatch ani smazání účtu protějšku bezpečnostní režim nevypne.
6. **Po schůzce** přijde soukromá otázka „Proběhlo všechno podle dohody?“. Protějšek odpověď nikdy neuvidí.
7. **Nahlášení a automatické pozastavení** do kontroly moderátorem:
   - nezletilost, násilí, porušení souhlasu (nahlášení) nebo ohrožení / nerespektování dohody (hodnocení) → okamžitě,
   - jiná nahlášení od 3 lidí, jiná negativní hodnocení od 2 lidí → pozastavení.
8. **Soukromí v telefonu:** zámek aplikace (Face ID / otisk / kód telefonu, i na zamčené obrazovce jde spustit SOS),
   diskrétní režim (neutrální ikona „poznámky“ a notifikace bez obsahu), fotky bez EXIF/GPS (aplikace i server).

## Spuštění pro vývoj

Potřeba: Node.js ≥ 22.12, pro aplikaci Xcode (iOS) nebo Android Studio (Android).

```bash
npm install
npm run seed      # demo profily v Praze: lucie@demo.fapp … heslo demo-heslo-123, PIN 1234, nouzový PIN 9999
npm run server    # http://localhost:3000 (SMS se vypisují do konzole, ověření totožnosti je simulované)
```

Aplikace potřebuje **development build** (používá nativní moduly – poloha na pozadí, mapy, biometrie), Expo Go nestačí:

```bash
cd app
EXPO_PUBLIC_API_URL=http://<IP-počítače>:3000 npx expo run:ios      # nebo run:android
```

Ve vývoji se ověření totožnosti dokončí tlačítkem „Vývoj: simulovat úspěšné ověření“ a demo profily automaticky lajkují zpátky,
takže match vznikne hned. Na druhém telefonu nebo simulátoru se dá přihlásit jako demo profil a dohodu potvrdit.

Testy serveru (registrace, ověření, match, moderace, dohoda, nouzový PIN, hlídač check-inů, bany, mazání dat):

```bash
npm test
npm run typecheck   # TypeScript aplikace
```

### Webový prototyp

`npm run demo:build -w app` sestaví aplikaci pro web do jednoho souboru `app/demo/dist/fapp.html`.
Místo serveru v něm běží simulovaný backend v prohlížeči (`app/demo/mockServer.ts` – stejná pravidla souhlasu,
PINů a hlídání check-inů, moderace převzatá ze serveru) a nativní moduly mají prázdné náhrady (`app/demo/shims`).
Přepínání řeší `app/metro.config.js` jen při `FAPP_DEMO=1` – běžné sestavení aplikace se nemění.
Demo panel (štítek DEMO u pravého okraje) ukazuje „odeslané“ SMS, pohled důvěryhodné osoby a umí posunout čas.

## Produkce – co je potřeba zařídit

| Co | Proměnné | Poznámka |
| --- | --- | --- |
| Šifrovací klíč dat | `DATA_KEY` (32 B v base64), `IDENTITY_SECRET` | `openssl rand -base64 32`. Bez nich server v produkci nenastartuje. **Nesmí se ztratit** – bez nich nejdou přečíst zprávy a nefungují bany. |
| Ověření totožnosti | `VERIFICATION_PROVIDER=veriff`, `VERIFF_API_KEY`, `VERIFF_SHARED_SECRET` | Webhook: `POST {PUBLIC_URL}/api/verification/webhook`. Názvy polí ve webhooku ověřit proti aktuální dokumentaci Veriffu. Alternativa pro ČR: Bankovní identita. |
| SMS | `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` nebo `TWILIO_MESSAGING_SERVICE_SID` | Bezpečnostně kritické – zprávy jdou přes frontu s opakováním. |
| Push notifikace | `PUSH_PROVIDER=expo`, v aplikaci `EAS_PROJECT_ID` | |
| Mapy na Androidu | `GOOGLE_MAPS_API_KEY` (při buildu aplikace) | |
| Moderátoři | `ADMIN_TOKEN` | API pod `/api/admin` (fronta příznaků, detail uživatele, nahlášené konverzace, suspend/ban/reinstate). Zatím bez UI. |
| Ostatní | `PUBLIC_URL`, `PORT`, `DB_FILE`, `TRUST_PROXY`, `NODE_ENV=production` | HTTPS je nutnost. |

## Co ještě zbývá

- **Právo:** údaje o sexuálním životě jsou zvláštní kategorie podle čl. 9 GDPR – před spuštěním posouzení vlivu (DPIA), zpracovatelské smlouvy
  (Veriff, Twilio, hosting v EU), podmínky a zásady ochrany soukromí. Doporučuji konzultaci s právníkem.
- **App Store / Google Play:** žádná nahota ve fotkách profilu (pravidla obchodů), hodnocení 18+, popis použití polohy na pozadí pro review.
- **Mapové podklady** na stránce důvěryhodné osoby jsou z OpenStreetMap – pro provoz je potřeba komerční poskytovatel dlaždic.
- **Moderace** je zatím pravidlová (regulární výrazy); rozhraní je připravené na ML/LLM klasifikátor a na rozpoznávání nahoty ve fotkách.
- Moderátorské UI, víc instancí serveru (SQLite → PostgreSQL, limit požadavků mimo paměť procesu).
