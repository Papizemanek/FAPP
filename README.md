# YesYes

Seznamka pro dospělé – jednoduchá jako Tinder, ale jen na sex. Navíc má domluvu naslepo (každý řekne, na co má chuť, oba uvidí jen shodu) a bezpečnou schůzku.

Design (klikací návrh obrazovek): https://claude.ai/artifact/6t6o5Ewyci4ugkCSCMiwh1 – obrazovka dohody v návrhu je starší verze, platí domluva popsaná níže.
Prototyp (skutečná aplikace v prohlížeči s ukázkovými daty): https://claude.ai/artifact/E4og3hH6XUX8xTNuoe4Bb6

```
shared/   číselníky sdílené serverem a aplikací (aktivity, texty domluvy, důvody nahlášení…)
server/   API (Node.js 22, Express 5, vestavěné SQLite), hlídač check-inů, stránka pro důvěryhodnou osobu
app/      nativní aplikace (Expo SDK 57 / React Native, expo-router)
web/      webová stránka s čekací listinou (statické HTML, vícejazyčné)
marketing/ šablony bannerů a videí kampaně (render přes Playwright + ffmpeg)
```

Web (náhled): https://claude.ai/artifact/RAgJWj3Zy8etTDAiafSAgQ · Bannery a videa: https://claude.ai/artifact/6eVJn2rwiUdE4fMKy1Pjh1 · Kampaň: https://claude.ai/artifact/Vx3u8SRUwzL2gbJKR3bFSH

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
4. **Domluva naslepo** – není to „podepsaný souhlas“, ale plán, na kterém se dva shodli. Aplikace nikde netvrdí, že někdo „souhlasil“.
   - Každý zvlášť označí aktivity **Ano / Možná / Ne** a může připsat své hranice. Druhý **nikdy neuvidí cizí „ne“** – oba vidí jen shodu
     („chcete oba“, „možná – domluvíte se na místě“). Nikdo tak nemusí odmítat nahlas a nedá se tlačit „ale vždyť jsi to tam neměl/a“.
   - Společná logistika: kdy, kde, kondom, střízlivost, první setkání na veřejném místě, stopslovo. Změna logistiky = nová verze a oba znovu potvrzují;
     změna vlastních přání druhého nevynuluje.
   - Potvrzení = dvě věty: „Takhle si to představuju. Na místě můžu cokoli odmítnout – a totéž platí pro druhého.“ a „Souhlas platí jen teď a tady.
     ‚Ne‘, ‚stop‘, stopslovo, mlčení, ztuhnutí nebo opilost nejsou souhlas. Domluva v aplikaci nikoho nezbavuje odpovědnosti.“
   - **Žádný „důkaz souhlasu“:** aplikace neukazuje, kdy kdo co potvrdil, a obsah domluvy včetně potvrzení se 48 h po schůzce
     (nebo po zrušení) maže – zůstane jen, že domluva byla.
     Uchová se jen tehdy, když to chce ten, kdo hlásí problém (nahlášení, negativní hodnocení) – pak slouží jako záznam pro policii.
   - Zrušit jde kdykoli jedním tlačítkem, bez udání důvodu – i během schůzky a i z pozastaveného účtu. Novou domluvu pak 7 dní může otevřít jen ten,
     kdo zrušil (druhý nemůže tlačit opakovanými žádostmi).
   - Moderace chatu hlídá nátlak typu „v appce jsi to odsouhlasila“, „dohoda je dohoda“ – příjemce dostane upozornění, že domluva není souhlas,
     a odesílatel dostane příznak pro moderátory.
   - Odstrašení: v domluvě i při zahájení schůzky je vidět, že všichni mají ověřenou totožnost a že při podezření z trestného činu ji předáme policii;
     protějšek vidí, že druhý má zapnutý bezpečnostní režim a důvěryhodná osoba ví, kde a s kým je.
5. **Schůzka v bezpečnostním režimu** (jen s domluvou potvrzenou oběma):
   - důvěryhodná osoba dostane SMS s odkazem na stránku s polohou, stavem a tím, s kým a kde je schůzka,
   - poloha se sdílí i na pozadí; ukládá se jen poslední bod a po skončení se maže,
   - **check-iny hlídá server** – když telefon zmlkne (vybitý, odcizený), SMS odejde i tak,
   - **SOS** (podržením) pošle poplach důvěryhodné osobě; 112 v aplikaci záměrně není – odkaz na 112 vidí jen důvěryhodná osoba, a to jen při poplachu,
   - **PIN** potvrzuje „jsem v pořádku“ (check-in, zrušení SOS, ukončení). **Nouzový PIN** vypadá na obrazovce úplně stejně, ale potichu spustí poplach.
     Třikrát špatný PIN = tichý poplach,
   - protějšek vidí jen „bezpečnostní režim je zapnutý“ – nikdy SOS, poplach ani polohu,
   - **falešný hovor** – za 30 s zazvoní příchozí hovor (i jako notifikace na pozadí) jako výmluva, jak odejít,
   - zrušení domluvy, unmatch ani smazání účtu protějšku bezpečnostní režim nevypne.
6. **Po schůzce** přijde soukromá otázka „Jak proběhla schůzka?“. Protějšek odpověď nikdy neuvidí. Při nerespektování hranic nebo ohrožení
   aplikace hned nabídne pomoc (linka Bílého kruhu bezpečí 116 006, Policie ČR 158, Persefona) a radu k lékařské péči a zajištění stop –
   bez nátlaku, oznámit to jde i později.
7. **Nahlášení a automatické pozastavení** do kontroly moderátorem:
   - nezletilost, násilí, porušení souhlasu (nahlášení) nebo ohrožení / nerespektování dohody (hodnocení) → okamžitě,
   - jiná nahlášení od 3 lidí, jiná negativní hodnocení od 2 lidí → pozastavení,
   - **varovné signály z bezpečnostního režimu** dostanou příznak u protějšku: SOS, nouzový PIN, opakovaně špatný PIN (vysoká priorita),
     zmeškaný check-in (nízká), zrušení domluvy během probíhající schůzky,
   - **vzorce chování** (90 dní): vážné signály od 2 různých lidí → pozastavení (pokud právě probíhá schůzka, až po jejím konci, aby se
     druhému nevypnula ochrana), jakékoli signály od 3 lidí → příznak pro moderátora.
8. **Předplatné po vzoru Tinderu – na startu vypnuté.** `BILLING_MODE=free` (výchozí): nic se neprodává, lajky bez limitu.
   `BILLING_MODE=paid`: 50 lajků zdarma za 12 h, Plus (neomezené lajky, vrácení swipu, na cestách, inkognito), Gold (+ kdo tě lajkl,
   5 super lajků týdně, 1 boost měsíčně), Platinum (+ prioritní lajky, odeslané lajky, Dnes večer) a jednorázové nákupy.
   Bezpečnost je vždy zdarma; účet s vážným příznakem si nekoupí viditelnost. Návrh: https://claude.ai/artifact/8XpLLyU5RCE13CK1piPckA
9. **Soukromí v telefonu:** zámek aplikace (Face ID / otisk / kód telefonu, i na zamčené obrazovce jde spustit SOS),
   diskrétní režim (neutrální ikona „poznámky“ a notifikace bez obsahu), fotky bez EXIF/GPS (aplikace i server).

## Spuštění pro vývoj

Potřeba: Node.js ≥ 22.12, pro aplikaci Xcode (iOS) nebo Android Studio (Android).

```bash
npm install
npm run seed      # demo profily v Praze: lucie@demo.yesyes … heslo demo-heslo-123, PIN 1234, nouzový PIN 9999
npm run server    # http://localhost:3000 (SMS se vypisují do konzole, ověření totožnosti je simulované)
```

Aplikace potřebuje **development build** (používá nativní moduly – poloha na pozadí, mapy, biometrie), Expo Go nestačí:

```bash
cd app
EXPO_PUBLIC_API_URL=http://<IP-počítače>:3000 npx expo run:ios      # nebo run:android
```

Ve vývoji se ověření totožnosti dokončí tlačítkem „Vývoj: simulovat úspěšné ověření“ a demo profily automaticky lajkují zpátky,
takže match vznikne hned. Na druhém telefonu nebo simulátoru se dá přihlásit jako demo profil a domluvu potvrdit.

Testy serveru (registrace, ověření, match, moderace, domluva naslepo, vzorce chování, nouzový PIN, hlídač check-inů, bany, mazání dat):

```bash
npm test
npm run typecheck   # TypeScript aplikace
```

### Webový prototyp

`npm run demo:build -w app` sestaví aplikaci pro web do jednoho souboru `app/demo/dist/yesyes.html`.
Místo serveru v něm běží simulovaný backend v prohlížeči (`app/demo/mockServer.ts` – stejná pravidla domluvy,
PINů a hlídání check-inů, moderace převzatá ze serveru) a nativní moduly mají prázdné náhrady (`app/demo/shims`).
Přepínání řeší `app/metro.config.js` jen při `YESYES_DEMO=1` – běžné sestavení aplikace se nemění.
Demo panel (štítek DEMO u pravého okraje) ukazuje „odeslané“ SMS, pohled důvěryhodné osoby a umí posunout čas.

### Jazyky

Aplikace, server, web i texty obchodů jsou ve všech 45 jazycích App Storu (arabština, hebrejština a urdština zprava doleva).
Slovníky jsou v `shared/i18n/{app,server,web,store}/<kód>.json`, zdrojem je čeština, záloha angličtina; pravidla v `shared/i18n/README.md`.
Překlady jsou strojové – **texty souhlasu, bezpečí a pomoci musí před spuštěním v dané zemi zkontrolovat rodilý mluvčí** (souhlas i právník).

```bash
node shared/i18n/check.mjs          # shoda klíčů, parametry, množná čísla, limity délky pro obchody
node shared/i18n/store-export.mjs   # texty pro App Store / Google Play → app/fastlane/metadata (fastlane deliver / supply)
```

Aplikace bere jazyk telefonu, v profilu jde přepnout. Server odpovídá podle hlavičky `X-App-Locale` / `Accept-Language`
a SMS i push posílá v jazyce příjemce.

### Web a kampaň

```bash
node web/build.mjs                  # web/dist – statický web pro všechny přeložené jazyky (hreflang, sitemap)
node marketing/render.mjs           # bannery (cs, en plná sada; ostatní jazyky základní), videa cs+en → marketing/out
node marketing/render.mjs --videos --langs de   # videa v dalším jazyce
node marketing/gallery.mjs          # náhledová galerie marketing/out/index.html
```

Když existuje `web/dist`, server ho sám servíruje; formulář čekací listiny posílá na `POST /api/waitlist`
(e-maily šifrované, export přes `GET /api/admin/waitlist`). Web na jiné doméně: `WEB_ORIGINS` (CORS).

Pozor na pravidla reklamy: Meta, TikTok a Reddit reklamy na seznamky pro sex nepouštějí, Google jen s certifikací,
Sklik erotiku jen 22–06 h. Kreativy „soft“ jsou bez slova sex.

**Značka:** YesYes\* (pracovně F\*app). Hvězdička je poznámka pod čarou: „\*Dvě ano, nebo nic.“ – v logu a kreativách,
v běžném textu se píše bez ní. Rešerše názvu: https://claude.ai/artifact/XAcuy32U6ydU2MoMEGS6EY. Před spuštěním ověřit
domény, rezervaci jména v App Store Connect a ochranné známky (unijní „yesyes“ firmy TREEZY ve třídách 9/35–38/42).

Vyzkoušet na vlastních telefonech (testovací server + instalace bez obchodů): [TESTOVANI.md](TESTOVANI.md).

## Produkce – co je potřeba zařídit

| Co | Proměnné | Poznámka |
| --- | --- | --- |
| Šifrovací klíč dat | `DATA_KEY` (32 B v base64), `IDENTITY_SECRET` | `openssl rand -base64 32`. Bez nich server v produkci nenastartuje. **Nesmí se ztratit** – bez nich nejdou přečíst zprávy a nefungují bany. |
| Ověření totožnosti | `VERIFICATION_PROVIDER=veriff`, `VERIFF_API_KEY`, `VERIFF_SHARED_SECRET` | Webhook: `POST {PUBLIC_URL}/api/verification/webhook`. Názvy polí ve webhooku ověřit proti aktuální dokumentaci Veriffu. Alternativa pro ČR: Bankovní identita. |
| SMS | `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` nebo `TWILIO_MESSAGING_SERVICE_SID` | Bezpečnostně kritické – zprávy jdou přes frontu s opakováním. |
| Push notifikace | `PUSH_PROVIDER=expo`, v aplikaci `EAS_PROJECT_ID` | |
| Mapy na Androidu | `GOOGLE_MAPS_API_KEY` (při buildu aplikace) | |
| Předplatné | `BILLING_MODE` (`free`/`paid`), `PAYMENTS_PROVIDER=revenuecat`, `REVENUECAT_WEBHOOK_AUTH` | Na startu `free`. Webhook: `POST {PUBLIC_URL}/api/billing/webhook/revenuecat`. Před zapnutím `paid` přidat do aplikace SDK `react-native-purchases` (funkce `purchase` v `app/src/lib/billing.ts`) a založit produkty v obchodech (ID v `shared/constants.js` → `PRODUCTS`). Testerům jde dát předplatné přes `POST /api/admin/users/:id/plan`. |
| Moderátoři | `ADMIN_TOKEN` | API pod `/api/admin` (fronta příznaků, detail uživatele, nahlášené konverzace, suspend/ban/reinstate). Zatím bez UI. |
| Web | `WEB_ORIGINS` (čárkami), `WEB_DIR` | Povolené domény webu pro čekací listinu; složka statického webu (výchozí `web/dist`). |
| Ostatní | `PUBLIC_URL`, `PORT`, `DB_FILE`, `TRUST_PROXY`, `NODE_ENV=production` | HTTPS je nutnost. |

## Co ještě zbývá

- **Právo:** údaje o sexuálním životě jsou zvláštní kategorie podle čl. 9 GDPR – před spuštěním posouzení vlivu (DPIA), zpracovatelské smlouvy
  (Veriff, Twilio, hosting v EU), podmínky a zásady ochrany soukromí. Doporučuji konzultaci s právníkem.
- **App Store / Google Play:** žádná nahota ve fotkách profilu (pravidla obchodů), hodnocení 18+, popis použití polohy na pozadí pro review.
- **Mapové podklady** na stránce důvěryhodné osoby jsou z OpenStreetMap – pro provoz je potřeba komerční poskytovatel dlaždic.
- **Moderace** je zatím pravidlová (regulární výrazy); rozhraní je připravené na ML/LLM klasifikátor a na rozpoznávání nahoty ve fotkách.
- **Kontakty na pomoc** po schůzce (`app/src/app/feedback/[id].tsx`) ověřit před spuštěním – čísla a provozovatele linek.
- Moderátorské UI, víc instancí serveru (SQLite → PostgreSQL, limit požadavků mimo paměť procesu).
