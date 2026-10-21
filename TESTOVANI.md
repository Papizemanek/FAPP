# Testovací nasazení – krok za krokem

Výsledek: server YesYes běží na internetu, ale bez přístupového klíče z něj nikdo nic nedostane. Aplikace je
nainstalovaná na tvých telefonech (bez App Storu a Google Play) a mluví s tímhle serverem.

- **Cena:** Railway cca 5 USD měsíčně, Expo zdarma. iPhone navíc potřebuje Apple Developer Program (99 USD ročně).
- **Čas:** zhruba hodina, z toho půl hodiny čekání na sestavení aplikace.
- **Režim testu:** ověření totožnosti se potvrdí tlačítkem, SMS a push notifikace se jen zapisují do logu serveru.
  Veriff ani Twilio nepotřebuješ.

Odškrtávej si jednotlivé kroky. Když se něco zasekne, pošli mi, na kterém kroku jsi a co vidíš.

---

## Část A – příprava (jednou)

- [ ] **A1. Node.js 22:** stáhni z [nodejs.org](https://nodejs.org) verzi „LTS“ (22 nebo novější) a nainstaluj.
- [ ] **A2. Git:** Mac – v Terminálu napiš `git --version`, a pokud se nabídne instalace, potvrď ji.
      Windows – stáhni z [git-scm.com](https://git-scm.com) a nainstaluj. Na Windows pak všechny příkazy
      z tohoto návodu piš do programu **Git Bash** (nainstaluje se s Gitem).
- [ ] **A3. Kontrola:** v Terminálu (Git Bash) napiš `node -v` → musí vypsat `v22…` nebo vyšší.
- [ ] **A4. Účet Railway:** na [railway.com](https://railway.com) → Login → **Login with GitHub** (účet, kde je
      repozitář `papizemanek/fapp`). Přidej platební kartu (Hobby plán).
- [ ] **A5. Účet Expo:** na [expo.dev](https://expo.dev) → Sign up (zdarma).
- [ ] **A6. Jen pro iPhone:** přihlas se do [Apple Developer Programu](https://developer.apple.com/programs/)
      a počkej na schválení (až 48 h). Pro Android nic.

## Část B – vygeneruj tajné klíče

- [ ] **B1.** V Terminálu (Git Bash) spusť tyto čtyři příkazy a každý výsledek si ulož do poznámek pod daným jménem:

```bash
openssl rand -base64 32   # → DATA_KEY
openssl rand -base64 32   # → IDENTITY_SECRET
openssl rand -base64 32   # → ADMIN_TOKEN
openssl rand -hex 24      # → ACCESS_KEY (přístupový klíč k celému serveru)
```

> **DATA_KEY a IDENTITY_SECRET nesmíš ztratit** – bez nich nejdou přečíst uložená data. Ulož je do správce hesel.

## Část C – server na Railway

- [ ] **C1.** Na railway.com: **New Project → Deploy from GitHub repo → papizemanek/fapp**.
      (Kdyby Railway repozitář neviděl: **Configure GitHub App** a povol mu přístup k `fapp`.)
- [ ] **C2.** Klikni na vzniklou službu → **Settings → Source → Branch** → vyber `claude/gifted-pasteur-dpkg04`.
- [ ] **C3.** Pravým tlačítkem na službu (v plátně projektu) → **Attach Volume** → Mount path `/data`.
      Bez toho by se databáze při každém restartu smazala.
- [ ] **C4.** Služba → záložka **Variables** → **Raw Editor** → vlož následující řádky a doplň hodnoty z části B:

```
DATA_KEY=…
IDENTITY_SECRET=…
ADMIN_TOKEN=…
ACCESS_KEY=…
PORT=3000
TRUST_PROXY=1
```

  `NODE_ENV` **nenastavuj** – tím zůstane testovací režim se simulovaným ověřením a SMS.
- [ ] **C5.** **Settings → Networking → Generate Domain** → port `3000`. Dostaneš adresu typu
      `https://fapp-production-1234.up.railway.app` – ulož si ji jako **ADRESA_SERVERU**.
- [ ] **C6.** Ve **Variables** přidej ještě `PUBLIC_URL=<ADRESA_SERVERU>` (bez lomítka na konci).
- [ ] **C7.** Počkej, až v záložce **Deployments** bude poslední nasazení zelené (**Active**). Trvá to pár minut.
- [ ] **C8. Kontrola:**
  - otevři v prohlížeči `<ADRESA_SERVERU>/health` → musí ukázat `{"ok":true}`,
  - otevři `<ADRESA_SERVERU>` → prohlížeč se zeptá na jméno a heslo (jméno cokoli, heslo = `ACCESS_KEY`).
    To je správně: bez klíče nikdo nic neuvidí.

> Nepovinné: místo `…up.railway.app` můžeš mít `test.yesyesapp.com` – **Settings → Networking → Custom Domain**,
> zadej `test.yesyesapp.com` a u registrátora domény přidej záznam CNAME přesně podle toho, co Railway ukáže.
> Pak tuhle adresu použij jako ADRESA_SERVERU (i v kroku C6).

## Část D – aplikace (Expo)

- [ ] **D1.** V Terminálu:

```bash
git clone https://github.com/papizemanek/fapp.git
cd fapp
git checkout claude/gifted-pasteur-dpkg04
npm install
cd app
npx eas-cli login          # přihlas se účtem z expo.dev
npx eas-cli init           # potvrď vytvoření projektu; na konci vypíše jeho ID
```

- [ ] **D2.** ID projektu z `eas init` ulož do Expa i do Terminálu:

```bash
npx eas-cli env:create --environment preview --name EAS_PROJECT_ID --value "<ID>" --visibility plaintext
export EAS_PROJECT_ID=<ID>          # v každém novém okně Terminálu je potřeba znovu
```

- [ ] **D3.** Přístupový klíč ulož do Expa jako tajnou proměnnou (do souborů ho nepiš):

```bash
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_ACCESS_KEY --value "<ACCESS_KEY>" --visibility sensitive
```

- [ ] **D4.** Otevři soubor `app/eas.json` (v jakémkoli textovém editoru) a v profilu `test` nahraď
      `https://ZMEN-NA-ADRESU-SERVERU.up.railway.app` svou ADRESOU_SERVERU. Ulož.

### Android

- [ ] **D5a.** `npx eas-cli build -p android --profile test` → na otázky odpověz Enterem (výchozí volby).
      Sestavení běží v cloudu 15–30 minut.
- [ ] **D6a.** Na konci se vypíše odkaz a QR kód. Otevři ho na telefonu, stáhni APK a nainstaluj
      (Android se zeptá na povolení instalace z neznámých zdrojů – povol). Totéž na druhém telefonu.

### iPhone

- [ ] **D5i.** `npx eas-cli device:create` → vyber „Website“ → odkaz otevři na **každém** iPhonu a nainstaluj profil
      (Nastavení → Stažený profil).
- [ ] **D6i.** `npx eas-cli build -p ios --profile test` → přihlas se Apple účtem, ostatní otázky Enterem.
- [ ] **D7i.** Odkaz z konce sestavení otevři na iPhonu a nainstaluj. Na iOS 16+ zapni
      **Nastavení → Soukromí a zabezpečení → Režim pro vývojáře** a restartuj telefon.

> Odkazy na stažení posílej jen testerům. Bez nainstalovaného testovacího buildu se k serveru nikdo nedostane.

## Část E – co otestovat (dva telefony)

- [ ] **E1. Registrace** na obou telefonech (různé e-maily, věk 18+).
- [ ] **E2. Ověření:** „Ověřit totožnost“ → „Simulovat úspěšné ověření (testovací režim)“.
- [ ] **E3. Profil:** nahraj fotku, povol polohu. Telefony musí být v okruhu nastavené vzdálenosti.
- [ ] **E4. Swipe** doprava na obou → match → chat (zkus i poslat fotku).
- [ ] **E5. Domluva naslepo:** oba vyplní, uvidí jen shodu; zkus i odvolání.
- [ ] **E6. Bezpečná schůzka:** důvěryhodná osoba (jakékoli číslo), check-in, SOS, nouzový PIN.
      „Odeslané“ SMS najdeš v Railway → **Deployments → View Logs**. Odkaz z SMS otevři v prohlížeči –
      to je stránka, kterou uvidí důvěryhodná osoba (funguje i bez klíče).
- [ ] **E7. Po schůzce:** hodnocení, nahlášení, blokace.
- [ ] **E8. Jazyky:** Profil → Jazyk.

## Když něco nejde

| Co vidíš | Co s tím |
| --- | --- |
| Nasazení na Railway je červené | Deployments → klikni na něj → View Logs, pošli mi posledních pár řádků. |
| `/health` nejde otevřít | Zkontroluj krok C5 (port 3000) a C7. |
| Aplikace píše chybu spojení | Adresa v `app/eas.json` (D4) musí přesně odpovídat ADRESE_SERVERU a `EXPO_PUBLIC_ACCESS_KEY` (D3) musí být stejný jako `ACCESS_KEY` na Railway. Po opravě sestav aplikaci znovu. |
| `eas build` hlásí chybějící projectId | Znovu `export EAS_PROJECT_ID=<ID>` (D2) ve stejném okně Terminálu. |
| Mapa na Androidu je prázdná | Chybí klíč Google Maps – pro test to nevadí, ostatní funguje. |

## Údržba

- Server se aktualizuje sám po každé změně ve větvi. Aplikaci po změně kódu sestav znovu (D5).
- Kdyby přístupový klíč unikl: změň `ACCESS_KEY` na Railway i v Expu
  (`npx eas-cli env:update --environment preview --name EXPO_PUBLIC_ACCESS_KEY`) a sestav aplikaci znovu.
- Po testování: Railway → projekt → Settings → **Delete Project** (smaže server i data).

Ostrý provoz (skutečné ověření, SMS, doména yesyesapp.com) je popsaný v README v části „Produkce – co je potřeba zařídit“.
