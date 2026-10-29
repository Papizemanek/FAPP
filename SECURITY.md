# Bezpečnost YesYes

YesYes zpracovává údaje o sexuálním životě, orientaci a poloze lidí. Únik by mohl někoho vyoutovat, vystavit
vydírání nebo ho fyzicky ohrozit. Proto bereme bezpečnost jako hlavní vlastnost produktu, ne jako doplněk.

## Nahlášení zranitelnosti

Napiš na **security@yesyesapp.com** (také v `/.well-known/security.txt`). Ozveme se do 3 pracovních dnů.
Prosíme, nezveřejňuj detaily, dokud chybu neopravíme. Netestuj na účtech jiných lidí a nestahuj jejich data.
Odpovědné nahlášení nikdy nebudeme řešit právně.

## Model hrozeb

| Kdo / co | Cíl | Hlavní ochrany |
| --- | --- | --- |
| Stalker, bývalý partner | Zjistit, jestli tu někdo je, kde bydlí, s kým se schází | Účet nejde zjistit z registrace, přihlášení ani obnovy hesla. Poloha domova je jen na mřížce ~1 km. Vzdálenost se zobrazuje jen v celých km. Blokace skryje profil i fotky. Fotky jsou bez EXIF/GPS. |
| Vyděrač (sextortion) | Získat intimní konverzace a fotky | Chat a fotky jsou šifrované v klidu. Fotky vidí jen přihlášení a fotky z chatu jen ti dva v matchi. Snímky obrazovky v chatu a domluvě jsou na Androidu blokované. Přepínač aplikací obsah skryje. Moderace hlásí nátlak. |
| Útočník na účty | Převzít účet (hádání hesel, únik hesla odjinud) | scrypt, zámek po 5 chybách na účet (i z mnoha IP), 2FA (TOTP + záložní kódy), e-mail při každém přihlášení, změně hesla nebo 2FA, seznam zařízení a „odhlásit všude“. |
| Únik databáze nebo zálohy | Přečíst citlivá data | Šifrování v klidu po sloupcích (AES-256-GCM), tokeny a kódy jen jako SHA-256 otisky, e-mail jen se slepým indexem (HMAC), zálohy navíc šifrované vlastním klíčem. |
| Webový útočník | XSS, CSRF, clickjacking | CSP s otisky skriptů (bez `unsafe-inline` pro skripty). Přihlášení webu v cookie HttpOnly + SameSite=Strict s hlavičkou proti CSRF. `frame-ancestors 'none'`, HSTS, COOP/CORP. |
| Zneužití moderace | Moderátor čte, co nemá | Osobní účty s heslem + TOTP, 12h přihlášení, audit každého požadavku. Konverzaci jde číst, jen když je nahlášená nebo zachycená moderací. Volitelně jen z povolených IP. |
| Nezletilí, falešné profily | Obejít věk a totožnost | Povinné ověření dokladem a selfie. Ban na osobu přes HMAC otisk identity. Nezletilost v textu → okamžité pozastavení. |
| Hromadné stahování (scraping) | Vytěžit profily | Seznamování jen pro ověřené. Balíček má limit 20 profilů. Limity požadavků v databázi. Fotky jen přes přihlášení. |
| Zahlcení (DoS) | Shodit server | Limit těla požadavku 64 kB (fotky 4 MB), limity požadavků, aktualizované závislosti. |

## Přehled ochran (mapování na OWASP ASVS 4 / MASVS 2)

**Přihlášení a účty (ASVS V2, V3)**
- Heslo aspoň 10 znaků, scrypt se solí, porovnání v konstantním čase. Neexistující účet stojí stejný čas (fiktivní hash).
- Registrace a obnova hesla přes 6místný kód z e-mailu. Kód platí 15 minut a 5 pokusů, uložený je jen jako otisk.
  Odpověď je vždy stejná, takže nejde zjistit, kdo YesYes používá.
- Přihlášení (`auth_sessions`): 256bitový náhodný token, v DB jen SHA-256. Vyprší po 30 dnech nečinnosti a nejpozději po roce.
  Změna nebo obnova hesla odhlásí ostatní zařízení. Ban odhlásí všechna.
- 2FA: TOTP (RFC 6238, ±30 s, ochrana proti opakovanému použití kódu) a 10 jednorázových záložních kódů.
  Výzva k druhému kroku platí 5 minut a 5 pokusů. Klíč TOTP je v DB šifrovaný.
- Zámek po 5 chybných heslech na účet: 1, 2, 4… minut, nejvýš hodina. Platí i pro neexistující e-maily.
- Bezpečnostní e-maily jsou neutrální (bez zmínky o seznamování): nové přihlášení, změna hesla, zapnutí a vypnutí 2FA,
  pokus o registraci existujícím e-mailem.

**Data (ASVS V6, V8; GDPR čl. 9 a 32)**
- Šifrované sloupce: viz `SEALED_COLUMNS` v `server/src/db.js`. Patří sem e-mail, jméno, datum narození, pohlaví,
  koho hledá, bio, štítky „Moje ano“, poloha, důvěryhodná osoba, zprávy, domluvy, nahlášení, fotky a SMS fronta.
- Keyring s verzemi (`DATA_KEYS="v2:…,v1:…"`) a rotace bez výpadku (`npm run keys:rotate -w server`).
- Slepý index e-mailu: HMAC s klíčem odvozeným (HKDF) z `IDENTITY_SECRET`.
- Obsah domluvy se 48 h po schůzce maže, pokud ho někdo z dvojice nepotřebuje uchovat.
- Ze serveru nikdy neodchází přesná poloha domova ani cizí odmítnutí (druhý vidí jen shodu).

**Web a API (ASVS V4, V5, V13, V14)**
- Všechny vstupy validuje server (typy, délky, výčty). SQL jen přes parametrizované dotazy.
- Hlavičky: CSP, HSTS (při HTTPS), X-Frame-Options DENY, nosniff, Referrer-Policy no-referrer, COOP, CORP, Permissions-Policy.
- Cookie webu: `HttpOnly; SameSite=Strict; Secure; Path=/api`. Změny vyžadují `X-Requested-With: yesyes`.
- Webhooky ověřené podpisem (HMAC) nebo tajným klíčem.
- Uzavřený provoz (`ACCESS_KEY`): bez klíče server vypadá jako neexistující. Vývojový režim na veřejné adrese bez klíče nenastartuje.

**Mobilní aplikace (MASVS STORAGE, AUTH, PLATFORM)**
- Token v Keychainu / Keystore (expo-secure-store, `AFTER_FIRST_UNLOCK`). Webová verze ho vůbec nemá (cookie HttpOnly).
- Zámek aplikace (Face ID, otisk, kód), který po 30 s na pozadí zamyká znovu. SOS jde i ze zamčené obrazovky.
- Přepínač aplikací vždy skrývá obsah. Snímky obrazovky v chatu a domluvě jsou blokované (Android) a nahrávání obrazovky taky (iOS).
- Diskrétní režim: neutrální ikona a notifikace bez obsahu.

**Provoz**
- Kontejner běží jako neprivilegovaný uživatel `node`.
- CI: testy, typy, kontrola překladů, `npm audit` (server bez zranitelností), CodeQL (security-extended), gitleaks a Dependabot.

## Provozní postupy

### Tajemství
| Proměnná | K čemu | Ztráta znamená |
| --- | --- | --- |
| `DATA_KEY` / `DATA_KEYS` | šifrování dat v klidu | **nečitelná data** – ulož do správce hesel a mimo hosting |
| `IDENTITY_SECRET` (≥ 32 znaků) | otisky identity (ban), slepý index e-mailů | nefunkční ban a přihlášení – nikdy neměnit |
| `BACKUP_KEY` | šifrování záloh | nečitelné zálohy – ulož jinam než zálohy |
| `ACCESS_KEY` | uzavřený testovací provoz | jen výměna klíče a nové sestavení aplikace |
| `RESEND_API_KEY`, `TWILIO_*`, `VERIFF_*`, `REVENUECAT_WEBHOOK_AUTH` | externí služby | vyměnit u poskytovatele |

Tajemství nikdy nepatří do repozitáře, chatu ani logů. Při podezření na únik je okamžitě vyměň.

### Rotace šifrovacího klíče
1. `openssl rand -base64 32` → nový klíč.
2. `DATA_KEYS="v2:<nový>,v1:<starý>"` a restart. Nová data jdou novým klíčem.
3. `npm run keys:rotate -w server` → přešifruje stará data.
4. `DATA_KEYS="v2:<nový>"`. Starý klíč bezpečně zlikviduj.

### Zálohy
- `BACKUP_KEY=… npm run backup -w server -- /zalohy/yesyes-$(date +%F).yyb` (denně, mimo hosting, 30 dní).
- Obnova: `npm run restore -w server -- záloha.yyb nová.db`. Jednou za čtvrtletí obnovu vyzkoušej.

### Moderátoři
- `npm run moderator -w server -- add jana@yesyesapp.com "Jana"` vypíše jednorázové heslo a odkaz pro autentizační aplikaci.
- Přihlášení: `POST /api/admin/login {email, password, code}` → token na 12 h. Audit: `GET /api/admin/audit`.
- Odchod moderátora: `npm run moderator -w server -- disable <e-mail>` (okamžitě odhlásí).
- Nastav `ADMIN_IPS` na adresy kanceláře nebo VPN.

### Incident (únik dat, převzetí účtů)
1. **Omezit:** vyměnit dotčená tajemství, odhlásit dotčené účty (`DELETE FROM auth_sessions …`), případně zapnout `ACCESS_KEY`.
2. **Zjistit rozsah:** logy hostingu, `audit_log`, které tabulky a období.
3. **Do 72 hodin** ohlásit ÚOOÚ (čl. 33 GDPR). Údaje o sexuálním životě znamenají vysoké riziko, takže je potřeba informovat
   i dotčené lidi (čl. 34) – srozumitelně, s radou, co dělat.
4. **Opravit a poučit se:** oprava, test, který chybu zachytí, zápis do tohoto dokumentu.

## Co ještě zbývá před ostrým spuštěním

- [ ] Externí penetrační test (web, API, iOS a Android podle MASVS) a poté program odměn za nalezené chyby.
- [ ] Právník a DPO: posouzení vlivu (`docs/DPIA.md`), zpracovatelské smlouvy (Veriff, Twilio, Resend, Expo, RevenueCat, hosting).
- [ ] Ostrá doména s TLS (HSTS preload až po ověření) a `NODE_ENV=production`.
- [ ] Ukládání klíčů ve správci tajemství s auditem přístupu (např. AWS KMS / Doppler / 1Password Secrets Automation).
- [ ] Monitoring a alerting (neúspěšná přihlášení, 5xx, podezřelé dotazy) bez osobních údajů v logech.
- [ ] Passkeys (WebAuthn) jako náhrada hesla – po vydání nativních buildů.
