# Posouzení vlivu na ochranu osobních údajů (DPIA) – návrh

> Pracovní návrh pro právníka nebo pověřence (DPO). Podle čl. 35 GDPR je posouzení povinné: jde o zvláštní
> kategorie údajů (sexuální život a orientace, biometrie při ověření totožnosti) zpracovávané ve velkém rozsahu
> a o sledování polohy. Před spuštěním ho musí odborník dokončit a schválit.

## 1. Popis zpracování

| | |
| --- | --- |
| Správce | YesYes (doplnit právnickou osobu, IČO, sídlo) |
| Účel | Seznamování dospělých za účelem sexu se souhlasem obou a bezpečnostní funkce kolem schůzky |
| Subjekty údajů | Registrovaní uživatelé 18+, jejich důvěryhodné osoby (jméno, telefon), zájemci na čekací listině |
| Rozsah | Spuštění v Praze, pak ČR a EU |

### Kategorie údajů

| Údaj | Proč | Právní základ | Uložení | Doba |
| --- | --- | --- | --- | --- |
| E-mail, heslo (hash) | účet, bezpečnostní e-maily | čl. 6(1)(b) | e-mail šifrovaný + slepý index; heslo scrypt | do smazání účtu |
| Jméno, datum narození, pohlaví | profil, kontrola věku | čl. 6(1)(b) | šifrované | do smazání účtu |
| Koho hledá, štítky „Moje ano“, bio | párování (údaje o sexuálním životě a orientaci) | **čl. 9(2)(a) výslovný souhlas** při registraci | šifrované | do smazání účtu |
| Poloha domova (mřížka ~1 km) | lidé v okolí | čl. 6(1)(b) | šifrovaná, zaokrouhlená | do změny nebo smazání |
| Poloha během schůzky | bezpečnostní režim | čl. 6(1)(b), čl. 9(2)(a) | šifrovaná, jen poslední bod | do konce schůzky (pak se maže) |
| Doklad, selfie | ověření totožnosti a věku | čl. 9(2)(a), oprávněný zájem na bezpečnosti | **neukládáme** (zpracovatel Veriff); uložen jen výsledek a HMAC otisk identity | otisk při banu trvale, jinak do smazání |
| Zprávy, fotky v chatu | komunikace | čl. 6(1)(b) | šifrované | do smazání matche nebo účtu |
| Domluva (přání, hranice, stopslovo) | souhlas obou | čl. 9(2)(a) | šifrovaná | 48 h po schůzce, pokud ji nikdo nepotřebuje uchovat (nahlášení) |
| Nahlášení, hodnocení | bezpečnost komunity | čl. 6(1)(f), čl. 9(2)(a) | šifrované | do vyřešení + promlčecí lhůta (doplnit) |
| Důvěryhodná osoba (jméno, telefon) | SMS při nouzi | čl. 6(1)(f) uživatele i třetí osoby | šifrované | do smazání nebo změny |
| Přihlášená zařízení (popis, čas) | bezpečnost účtu | čl. 6(1)(f) | otisk tokenu, popis zařízení | 30 dní nečinnosti / 1 rok |
| Audit moderátorů | odpovědnost moderace | čl. 6(1)(f), čl. 32 | databáze | doplnit (např. 2 roky) |

### Zpracovatelé (doplnit smlouvy podle čl. 28 a předávání mimo EU)
Hosting (Railway / produkční hosting v EU), Veriff (ověření totožnosti, EU), Twilio (SMS), Resend (e-maily),
Expo (push notifikace), RevenueCat, Apple a Google (platby). U každého je potřeba DPA, místo zpracování a SCC/DPF.

## 2. Nezbytnost a přiměřenost
- **Minimalizace:** doklad ani selfie neukládáme. Poloha je zaokrouhlená a vzdálenost se ukazuje jen v celých km.
  Ostatní vidí jen společná ano (ne všechny štítky). Místo a vztahový status uvidí až match. Cizí „ne“ v domluvě nikdy.
- **Přesnost:** profil si upravuje uživatel sám. Věk je ověřený dokladem.
- **Omezení uložení:** automatické mazání domluv po 48 h a polohy po schůzce. Smazání účtu maže vše kromě otisku
  identity při banu.
- **Práva subjektů:** přístup a přenositelnost (doplnit export dat), oprava v aplikaci, výmaz tlačítkem v profilu,
  odvolání souhlasu = smazání účtu, námitka u oprávněného zájmu.

## 3. Rizika a opatření

| Riziko | Pravděpodobnost × dopad | Opatření | Zbytkové riziko |
| --- | --- | --- | --- |
| Únik databáze | střední × velmi vysoký | šifrování v klidu, tokeny jako otisky, šifrované zálohy, rotace klíčů | nízké (bez klíčů nečitelné) |
| Zjištění, že někdo aplikaci používá (outing) | střední × velmi vysoký | žádná enumerace účtů, neutrální e-maily a notifikace, diskrétní ikona | nízké |
| Dohledání bydliště z polohy | nízká × velmi vysoký | mřížka ~1 km, celé km, žádná přesná poloha v API | nízké |
| Převzetí účtu | střední × vysoký | zámek pokusů, 2FA, upozornění, seznam zařízení | nízké |
| Zneužití moderátorem | nízká × vysoký | osobní účty, TOTP, audit, přístup jen k nahlášenému | nízké |
| Nezletilý uživatel | nízká × velmi vysoký | ověření dokladem, moderace textu, okamžité pozastavení | nízké |
| Vydírání intimním obsahem | střední × vysoký | šifrování, blokace snímků obrazovky (Android), moderace nátlaku, nahlášení | střední – nelze zabránit fotce jiným telefonem; poučit uživatele |
| Únik u zpracovatele | nízká × vysoký | výběr zpracovatelů v EU, DPA, minimum předávaných dat | doplnit po smlouvách |

## 4. Závěr (vyplní DPO)
- [ ] Rizika jsou přijatelná / je nutná předchozí konzultace s ÚOOÚ (čl. 36)
- [ ] Datum, podpis, termín revize (nejpozději za rok nebo při změně zpracování)
