# Překlady F*app

Všechny texty, které vidí uživatel, jsou ve slovnících `shared/i18n/<doména>/<jazyk>.json`.
Seznam jazyků (všechny lokalizace App Storu) je v `shared/i18n/index.js` → `LOCALES`.

| Doména | Kde se používá |
| --- | --- |
| `app` | mobilní aplikace (`app/src`) |
| `server` | chyby API, SMS pro důvěryhodnou osobu, push notifikace, stránka pro důvěryhodnou osobu |
| `web` | web (`web/`) a kampaň (bannery, videa v `marketing/`) |
| `store` | texty pro App Store a Google Play |

Zdrojová řeč je **čeština** (`cs`), **angličtina** (`en`) je záloha pro chybějící klíče.

## Pravidla pro klíče

- Klíč = `<jmenný prostor>.<camelCase>`, jmenný prostor podle obrazovky nebo komponenty (`discover.empty`, `agreement.saveAndConfirm`).
- Proměnné: `{name}` (`"Domluva · {name}"`). Věty se nikdy neskládají z kousků – vždy jeden klíč s proměnnými.
- Množné číslo: hodnota je objekt podle CLDR (`{"one": "{count} lajk", "few": "{count} lajky", "many": "{count} lajku", "other": "{count} lajků"}`),
  volá se `t('likes.count', { count })`. Vždy musí být `other`; další kategorie podle jazyka (cs: one/few/many/other, en: one/other,
  ar: zero/one/two/few/many/other, ja/ko/zh/th/vi/id/ms: jen other, …).
- Popisky z `shared/constants.js` jsou v `labels.*` (`labels.activities.kissing`, `labels.tags.oneoff`, `labels.features.rewind.name`…),
  texty domluvy v `consent.intent`, `consent.notice`, `consent.deterrence`.
- Data, časy, čísla a ceny formátuje `app/src/lib/format.ts` podle jazyka – nikdy napevno `'cs-CZ'`.
- Značka **F*app** se nepřekládá.

## V aplikaci

```tsx
import { useT } from '@/lib/i18n';
const t = useT();             // v komponentě – po změně jazyka se překreslí
<Button label={t('welcome.signIn')} />

import { t } from '@/lib/i18n'; // mimo komponenty (notifikace, úlohy na pozadí)
```

## Tón překladů

- Tykání, krátce, přímo, bez vulgarit. Aplikace je pro dospělé a o sexu mluví věcně, ne lascivně.
- Texty o souhlasu, bezpečí a pomoci po schůzce jsou právně a citlivě důležité: přesný význam má přednost před stylem.
  Před spuštěním v dané zemi je musí zkontrolovat rodilý mluvčí (a u souhlasu právník).
- Kontakty na linky pomoci jsou zatím jen české; v jiných jazycích se zobrazí obecná rada.
