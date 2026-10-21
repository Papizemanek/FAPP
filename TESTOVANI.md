# Testovací nasazení na dva telefony

Server poběží na Railway (cca 5 USD měsíčně), aplikace se sestaví v cloudu přes Expo (EAS, zdarma) a nainstaluje
se přímo do telefonů – bez App Storu a Google Play.

Server běží ve **vývojovém režimu**: ověření totožnosti se potvrdí tlačítkem, SMS a push notifikace se jen vypisují
do logu serveru. Nic dalšího (Veriff, Twilio) tedy není potřeba.

**Uzavřený provoz:** s proměnnou `ACCESS_KEY` server bez klíče nic neukáže – API odpovídá jako prázdný server,
web se v prohlížeči zeptá na heslo a vyhledávače stránky neindexují. Klíč je zabudovaný jen v testovacím buildu
aplikace, který dostanou testeři. Volný zůstává jen odkaz pro důvěryhodnou osobu z SMS (chrání ho vlastní tajný
token), aby fungoval i lidem bez aplikace.

## Co budeš potřebovat

- počítač (Mac nebo Windows) s [Node.js 22](https://nodejs.org) a [Gitem](https://git-scm.com)
- účet na [railway.com](https://railway.com) (přihlášení přes GitHub, platební karta)
- účet na [expo.dev](https://expo.dev) (zdarma)
- **Android:** nic dalšího
- **iPhone:** placený [Apple Developer Program](https://developer.apple.com/programs/) (99 USD ročně, schválení až 48 h)

## 1. Server na Railway

1. Na railway.com: **New Project → Deploy from GitHub repo → papizemanek/fapp**.
2. V nastavení služby (**Settings → Source**) vyber větev `claude/gifted-pasteur-dpkg04` (nebo ji předtím slouč do `main`).
   Railway najde `Dockerfile` a server sestaví sám.
3. **Trvalý disk:** pravým tlačítkem na službu → **Attach Volume**, mount path `/data`. Bez něj se databáze po každém
   restartu smaže.
4. **Adresa:** Settings → Networking → **Generate Domain**, port `3000`. Dostaneš něco jako
   `https://yesyes-production-1234.up.railway.app`.
5. **Proměnné** (záložka Variables). Hodnoty vygeneruješ v terminálu příkazem `openssl rand -base64 32` (každou zvlášť):

   | Proměnná | Hodnota |
   | --- | --- |
   | `DATA_KEY` | výstup `openssl rand -base64 32` |
   | `IDENTITY_SECRET` | výstup `openssl rand -base64 32` |
   | `ADMIN_TOKEN` | výstup `openssl rand -base64 32` |
   | `PUBLIC_URL` | adresa z kroku 4 |
   | `ACCESS_KEY` | výstup `openssl rand -hex 24` – přístupový klíč; ulož si ho, budeš ho potřebovat i pro aplikaci |

   `NODE_ENV` **nenastavuj** – tím zůstane vývojový režim se simulovaným ověřením a SMS.
6. **Kontrola:**
   - `<adresa>/health` v prohlížeči → `{"ok":true}` (server běží),
   - `<adresa>` v prohlížeči → zeptá se na jméno a heslo (jméno cokoli, heslo = `ACCESS_KEY`),
   - `curl <adresa>/api/me` → „nenalezeno“ (bez klíče nic), `curl -H "X-Access-Key: <klíč>" <adresa>/api/me` →
     chyba o přihlášení (s klíčem server odpovídá).
7. **Vlastní adresa (nepovinné):** místo `…up.railway.app` můžeš použít třeba `test.yesyesapp.com` –
   Settings → Networking → Custom Domain a u registrátora záznam CNAME, který Railway ukáže.

## 2. Aplikace (Expo EAS)

V terminálu:

```bash
git clone https://github.com/papizemanek/fapp.git
cd fapp
git checkout claude/gifted-pasteur-dpkg04
npm install
cd app
npx eas-cli login          # účet z expo.dev
npx eas-cli init           # založí projekt, vypíše jeho ID
```

1. V `app/eas.json` v profilu `test` přepiš `EXPO_PUBLIC_API_URL` na adresu serveru z kroku 1.4 (nebo 1.7).
   Přístupový klíč do souboru **nepiš** (repozitář by ho prozradil) – ulož ho do Expa jako tajnou proměnnou:
   ```bash
   npx eas-cli env:create --environment preview --name EXPO_PUBLIC_ACCESS_KEY --value "<ACCESS_KEY>" --visibility sensitive
   ```
   Profil `test` si ji při sestavení vezme sám.
2. Pokud `eas init` napíše, že ID projektu nemůže uložit do konfigurace, přidej ho do téhož profilu:
   `"EAS_PROJECT_ID": "<id>"` vedle `EXPO_PUBLIC_API_URL`, a v terminálu nastav `export EAS_PROJECT_ID=<id>`
   (Windows: `set EAS_PROJECT_ID=<id>`).

### Android

```bash
npx eas-cli build -p android --profile test
```

Sestavení trvá 15–30 minut. Na konci dostaneš odkaz a QR kód – otevři ho v telefonu, stáhni APK a nainstaluj
(telefon se zeptá na povolení instalace z neznámých zdrojů).

### iPhone

```bash
npx eas-cli device:create   # vygeneruje odkaz – otevři ho na každém iPhonu a nainstaluj profil
npx eas-cli build -p ios --profile test
```

EAS se přihlásí k Apple účtu a certifikáty vyřeší sám. Hotový build nainstaluješ přes odkaz z konce sestavení.
Na iOS 16 a novějším je potřeba zapnout **Nastavení → Soukromí a zabezpečení → Režim pro vývojáře**.

Po každé změně kódu stačí build spustit znovu. Server se aktualizuje sám při pushi do vybrané větve.

Odkazy na stažení buildu z Expa posílej jen testerům. Kdyby klíč unikl, změň `ACCESS_KEY` na Railway
i v Expu (`npx eas-cli env:update`) a sestav aplikaci znovu – staré buildy se pak k serveru nepřipojí.

## 3. Co otestovat

1. **Registrace** na obou telefonech (různé e-maily, věk 18+).
2. **Ověření:** „Ověřit totožnost“ → tlačítko „Simulovat úspěšné ověření (testovací režim)“.
3. **Profil:** fotka, povolit polohu. Telefony musí být v okruhu nastavené vzdálenosti.
4. **Swipe** doprava na obou → match → chat.
5. **Domluva naslepo:** oba vyplní, uvidí jen shodu; zkus i odvolání.
6. **Bezpečná schůzka:** důvěryhodná osoba (jakékoli číslo), check-in, SOS, nouzový PIN.
   „Odeslané“ SMS i s odkazem na stránku pro důvěryhodnou osobu najdeš v Railway → **Deployments → View Logs**.
   Odkaz otevři v prohlížeči.
7. **Po schůzce:** hodnocení, nahlášení, blokace.
8. **Jazyky:** Profil → Jazyk.

## Co v testu nefunguje

- skutečné ověření dokladem (Veriff) – jen tlačítko
- skutečné SMS (Twilio) – jen log
- push notifikace – jen log
- mapa na Androidu bez `GOOGLE_MAPS_API_KEY` může být prázdná (zbytek funguje)

Až budeš chtít ostrý provoz, postup je v README v části „Produkce – co je potřeba zařídit“.
