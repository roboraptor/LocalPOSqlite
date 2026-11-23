# Návrhy na zjednodušení a úklid (V3)

Dokument vychází z auditu repozitáře na větvi `V2` a shrnuje zjištění i plánované refaktory pro větev `V3`.

---

## 1. Nálezy z auditu

### Zbytečná složitost a mrtvý kód
- **Nepoužívané závislosti z V1 v `package.json`**: `"main": "src/app.js"` odkazuje na neexistující soubor; balíčky `express`, `body-parser`, `cors`, `path`, `pdfkit`, `qrcode`, `bootstrap-icons` nejsou nikde v `src/` ani `__tests__/` importovány.
- **Prázdný soubor**: `src/components/settings/route.ts` (0 B).
- **Nepoužívané funkce a proměnné**:
  - `reindexTabs` v `src/db.ts` (navíc zahazovala sloupec `is_staff`).
  - `fetchExternalSpaydString` v `src/lib/spayd.ts`.
  - Nepoužité importy/proměnné: `Link` a `czk` v `src/app/export/page.tsx`, `Link` v `src/app/items/page.tsx`, `Selected` a zakomentovaný JSX v `src/components/IconPicker.tsx`, redundantní ternární výraz v `src/app/page.tsx`.
  - Kontrola neexistující cesty `"/customer-display"` v `src/components/Header.tsx`.
- **Synchronní čtení disku při každém DB dotazu**: `dbProxy` volá `getDb()` při každém volání metody a `getDb()` pokaždé synchronně čte `src/data/dbposition.json` přes `fs.readFileSync`.
- **Ruční merge 19 polí v `src/app/api/general/route.ts`**: opakovaný boilerplate bez ochrany pro chybějící `current`.

### Duplikovaná logika
- **Formátování měny (`czk`)**: identicky definováno v 7 souborech (`page.tsx`, `cd/page.tsx`, `closing/page.tsx`, `export/page.tsx`, `items/page.tsx`, `receipts/page.tsx`, `TablesSettings.tsx`).
- **Komponenta `IconByName`**: zkopírována 3× (`items/page.tsx`, `CategoriesSettings.tsx`, `IconsSettings.tsx`) + inline lookup v `src/app/page.tsx`.
- **Duplicitní typy**: `ParsedReceipt` a `ParsedTab` v `closing/page.tsx` a `receipts/page.tsx`; `CustomerState` v `cd/page.tsx` vs `src/lib/customerState.ts`.
- **Čtení `dbposition.json`**: duplikováno v `src/app/api/settings/db/route.ts` místo využití `getDbPath()`.
- **Formuláře napojené na `/api/general`**: opakovaný `useEffect` + `handleChange` + `handleSubmit` v `OrgSettings`, `ReceiptSettings`, `PaymentSettings`, `EetSettings`.
- **Filtrování podle data (`toTs`, `fromBound`, `toBound`)**: zkopírováno 3× v `closing/page.tsx` a `receipts/page.tsx`.
- **Paylibo URL a duplicitní výpočet SPAYD**: skládání URL duplikováno v `src/app/page.tsx` a `PaymentSettings.tsx`; v `PaymentSettings.tsx` se `generateSpaydString` volá 2× za render.
- **Základní `@media print` pravidla**: duplikována v `closing/page.tsx` a `receipts/page.tsx`.

---

## 2. Plán úprav zachovávajících chování (V3)

- [x] **Krok 1 — Úklid mrtvého kódu a závislostí**: smazat `src/components/settings/route.ts`, vyčistit `package.json`, odstranit `reindexTabs`, `fetchExternalSpaydString`, nepoužité importy a mrtvé podmínky.
- [x] **Krok 2 — Extrakce mikro-utilit, ikony a typů**: přidat `src/lib/format.ts` (`czk`, `toTimestamp`, `isWithinDateRange`), `src/components/IconByName.tsx`, sdílet `ParsedReceipt`, `ParsedTab` v `src/types/db.ts` a `CustomerState` ze `src/lib/customerState.ts`.
- [x] **Krok 3 — Zjednodušení DB cache a `/api/general`**: cachovat `dbPath` v `src/db.ts` s `invalidateDbPath()` volaným při změně cesty, použít `getDbPath()` v `api/settings/db/route.ts` a zpřehlednit merge polí v `api/general/route.ts`.
- [x] **Krok 4 — Hook `useGeneralSettings`**: vytvořit `src/hooks/useGeneralSettings.ts` a použít ho v `OrgSettings`, `ReceiptSettings`, `EetSettings` a `PaymentSettings`.
- [x] **Krok 5 — Sdílený print základ a `buildPayliboUrl`**: přesunout společná `@media print` / `.print-only` pravidla do `src/app/globals.css`, přidat `buildPayliboUrl` do `src/lib/spayd.ts` (včetně testu) a memoizovat náhled v `PaymentSettings.tsx`.

---

## 3. Budoucí změny (mění chování)

Položky z auditu, které záměrně neřešíme v prvním čistém refaktoru, protože mění datový model nebo chování UI:

- [x] **1. Dynamické kategorie v `/items`**: nahradit hardcodovaný `CATEGORIES = ["Nápoje", "Jídlo", "Ostatní"]` v `src/app/items/page.tsx` daty z `/api/categories`.
- [ ] **2. Sjednocení timestampů v tabulce `tabs`**: sjednotit ISO 8601 z `src/app/api/tabs/route.ts` a SQLite `datetime('now')` v triggerech `trg_tabs_timestamp` / `trg_tabs_cleanup` v `src/db.ts`.
- [ ] **3. Napojení ignorovaných polí z `general` a odstranění pozůstatků `is_staff`**: napojit `currency`, `tax_enabled`, `tax_rate`, `receipt_title`, `receipt_header`, `receipt_footer`, `trx_vs_enabled`, `eet_enable` (nebo odstranit nepoužívané) a vyřešit `is_staff` v `export/page.tsx` a `tabs`.
- [ ] **4. Odtrackování databázových souborů z gitu**: odebrat verzované soubory `data my/pos.db*` a `data my/pos2.db` z gitu a doplnit `.gitignore`; opravit odkazy na neexistující `scripts/migrate.js` v `README.md` a `/data/example_items.json` v `.gitignore`.
- [ ] **5. Úprava zastaralých textů**: opravit hlášku o nutnosti restartu po změně cesty DB (`DBSettings.tsx`, `api/settings/db/route.ts`) a výchozí název `"EffortUp"` v `src/app/cd/page.tsx`.
