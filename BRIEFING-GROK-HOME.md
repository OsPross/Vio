# Briefing dla Groka — djxxr / moja_przegladarka
## Strona startowa, Personalizacja, widżety, free-place, ScaledPreview

**Data stanu:** 2026-09-30  
**Ścieżka projektu:** `C:\Users\djxxr\Desktop\moja_przegladarka`  
**Stack:** Electron 44 + Vite 6 + React 19 + Zustand (persist `moja-przegladarka-v8`) + Motion + Lucide  
**Uruchomienie:** `npm run electron:dev` (Vite `127.0.0.1:5173` + Electron)  
**Testy:** `npm test` → `node test/home-widgets.test.mjs`  
**Typecheck/build:** `npm run typecheck` / `npm run build`

---

## 0. Twarde ograniczenia użytkownika (NIE RUSZAĆ)

- **Tor**, **sejf haseł**, **prywatność** — nie zmieniać logiki / IPC / UI bezpieczeństwa.
- Motywy: pracować przez **tokeny CSS**; sprawdzać szczególnie **Midnight** i **Paper**.
- Nie dodawać „nowych systemów od zera”, jeśli da się naprawić istniejące — ale ostatnia iteracja *wymusiła* model `homeChrome` (zegar/wyszukiwarka/skróty jako freestyle).
- Reduce-motion respektować (`perfReduceMotion`, `uiMotion`, `prefers-reduced-motion`).

---

## 1. Czym jest produkt w tym fragmencie

Prywatna przeglądarka Electron. **Nowa karta** = komponent `HomeSearch` (`src/components/HomeSearch.tsx`): tło, swobodnie rozmieszczane elementy (chrome + widżety), FAB personalizacji, tryb edycji układu, galeria dodawania widżetów.

**Personalizacja** = modal `PersonalizeSheet` (styl Arc): podgląd na żywo + zakładki Wygląd / Układ / Widżety / Zegar i wyszukiwarka.

---

## 2. Architektura aktualna (po ostatnich naprawach)

### 2.1. Dwa rodzaje „rzeczy na home”

| Rodzaj | Typy | Persist | Plik |
|--------|------|---------|------|
| **Chrome** | `clock`, `search`, `shortcuts` | `settings.homeChrome: HomeChromeItem[]` | `store.ts` |
| **Widżety extra** | `weather`, `notes`, `todo`, `calendar`, `recent`, `downloads`, `resources` | `settings.homeWidgets: HomeWidget[]` | `store.ts` + `widgets/registry.ts` |

**Chrome NIE jest** w `HomeWidgetType` / `EXTRA_WIDGET_TYPES`. Osobny model:

```ts
type HomeChromeItem = {
  id: 'clock' | 'search' | 'shortcuts';
  anchor: 'center' | 'left' | 'right';
  x: number; // komórki siatki 8px od osi anchora
  y: number; // komórki od góry canvasu
};
```

Rozmiary chrome (px) — `chromeSizeToPx()`:
- clock: **560×168**
- search: **640×72**
- shortcuts: **640×104**

Domyślny stack (po `packHomeChromeVertical`):
- clock `y: 8`
- search `y: 31`
- shortcuts `y: 44`  
(`HOME_GRID_PX = 8`)

`packHomeChromeVertical`: jeśli wszystkie trzy mają `anchor:'center'` i `x:0`, wymusza brak nachodzenia w pionie (naprawia stare złe save’y). Jeśli user rozsunie w X / zmieni anchor — packing nie rusza.

### 2.2. Jeden canvas na całą stronę

`HomeSearch` **nie** ma już osobnego „header shell” z zegarem. Wszystko renderuje `WidgetStrip` wewnątrz:

```html
.home.home-widgets-root
  └─ .home-widgets-band   /* position:absolute; inset:0; pełny home */
       └─ WidgetStrip     /* chrome + widgets */
```

CSS kluczowe (`widgets.css` + `chrome-layout.css`):
- `.home-widgets-band` — full-bleed absolute, w normalnym trybie `pointer-events: none`, dzieci `auto`.
- W `.home.is-editing-widgets` band ma **wyższy z-index** niż ewentualny header, żeby dało się chwytać karty.
- Wcześniej header (z-index 2) **zjadał pointer events** i „drag nie działał” — naprawione klasami edit-mode.

### 2.3. Free-place math — `src/widgets/snapMath.ts`

| Funkcja | Rola |
|---------|------|
| `widgetToPx` / `chromeToPx` | grid → `left/top/width/height` |
| `pxToWidgetPos` | px → `{anchor,x,y}` |
| `snapDrag` | siatka 8px, snap do środka canvasu, krawędzi kolumny 640, innych boxów; próg **6px**; **Alt** wyłącza snap; linie guide tylko przy zrównaniu; **jedna** korekta na oś (bez podwójnego snapu do tej samej linii) |
| `resolveCollision` | po dropie odpycha w prawo/dół, clamp do canvasu |
| `shouldUseFlexFallback(windowWidth)` | `window < 900` → flex wrap zamiast absolute (**musi** brać `window.innerWidth`, NIE szerokość shella ~720 — to był root cause „nie da się przeciągać”) |

### 2.4. Drag — `WidgetStrip.tsx` (priorytet #1 historii bugów)

Zachowanie wymagane / zaimplementowane:
- Chwyt za nagłówek / puste miejsce; **inputy/przyciski** pomijane przez `isInteractiveTarget`.
- Próg startu **4px**, `setPointerCapture` (try/catch), listenery na elemencie **i** `window` (fallback).
- Ruch przez **`transform: translate3d`** w **rAF**.
- Po puszczeniu: collision → zapis do store (`homeWidgets` / `homeChrome`).
- Strzałki ±8px (Shift ×4), **Ctrl+Z** undo (stack trzyma widgets+chrome).
- „Wyśrodkuj wszystko” = `layoutHomeChromeCentered()` + `layoutWidgetsInCenteredRow()` (extra y≈60).
- Pasek edycji: **`position: fixed; bottom: 24px; centered`** (nie sticky w flow).

Klucze drag: `chrome:clock` | `chrome:search` | `chrome:shortcuts` | `widget.id`.

**Search ma wyższy z-index (7)** niż shortcuts (2), żeby `.home-suggest` (historia) nie chowała się pod skrótami. Karty search: `overflow: visible`.

### 2.5. Zębatka / ustawienia — `WidgetSettingsPopover.tsx` + `WidgetFrame.tsx`

W trybie edycji każdy element ma **Settings2 (zębatka)** w nagłówku:
- **Widżet:** rozmiar S/M/L, styl karty transparent/glass/solid (global `homeWidgetStyle`), Usuń.
- **Zegar:** thin/classic/mono, show clock/date/seconds.
- **Search:** hint do Personalizacji.
- **Skróty:** toggle `homeShowApps`.

`WidgetFrame`: prop `bare` dla chrome (bez ciężkiej karty poza edycją); w edycji dashed outline + head z zębatką.

### 2.6. ScaledPreview — `src/components/ScaledPreview.tsx`

Jeden komponent do **wszystkich** skalowanych podglądów:
- Dziecko w wirtualnym **W×H**
- `scale = min(frameW/W, frameH/H)` przez ResizeObserver
- Wyśrodkowanie absolute + `transform-origin: center`
- `overflow: hidden`, `pointer-events: none`, `contain: strict`
- **Zakaz `vw/vh` / `clamp(…vw…)` wewnątrz podglądu** — w CSS zegara: fluid tylko poza `.home-preview-virtual`

Użycia:
| Miejsce | Virtual size |
|---------|----------------|
| `HomeLivePreview` | **1440×900** |
| `ClockStyleCard` | **240×120** (tylko „12:34”) |
| `WidgetPreview` (galeria + polecane) | rozmiar widżetu M/S/L |

**KRYTYCZNY BUG (już naprawiony, nie cofać):**  
W `WidgetStrip` pomiar canvasu **NIE może** używać `getBoundingClientRect()` wewnątrz `ScaledPreview`, bo zwraca rozmiar **po** `transform:scale` → metrics ~400px zamiast 1440 → wszystko ląduje **po lewej**.  
Używać **`offsetWidth` / `offsetHeight`** (layout size).

### 2.7. Personalize sheet

- `PersonalizeSheet.tsx` — scrim + sheet, sticky tabs (`.pz-sheet-tabs` z tłem arkusza).
- Zakładki: LookTab, LayoutTab, WidgetsTab, ClockSearchTab.
- Look: motywy (Midnight/Paper…), tło, **akcent** (swatche 22px + ring), style kart widżetów (szkło z blurem na tle, pełne wypełnione).
- WidgetsTab: lista dnd-kit, empty → polecane z `WidgetPreview`, „Edytuj układ na stronie”.

### 2.8. Style zegara

- Store default: `homeClockStyle: 'thin'` (font-weight **200**).
- classic: **600**, mono: JetBrains Mono + tabular-nums.
- `ClockDigits` — dwukropek w `.clock-colon` z `translateY(-0.06em)` + flex align (był za nisko względem cyfr).

### 2.9. Zapisz w pogodzie (disabled)

W glass (`backdrop-filter`) **nie używać `opacity` na disabled** — wychodzi „rozmyta plama”.  
`.hw-btn:disabled` ma stałe kolory ~50% jasności, `filter/backdrop-filter: none`.

---

## 3. Historia root-cause’ów (żeby nie powtórzyć)

1. **Drag martwy:** `shouldUseFlexFallback(shellWidth≤720)` zawsze true → brak absolute/transform. Fix: `window.innerWidth`.
2. **Drag martwy po full-canvas:** header `z-index:2; pointer-events:auto` nad bandem. Fix: w edit mode band wyżej, header `pointer-events:none`.
3. **Listenery drag:** `useEffect` po `setState` + `setPointerCapture` throw. Fix: listenery od razu w pointerdown + window fallback + try/catch capture.
4. **Snap podwójny:** ta sama linia środka 2×. Fix: jedna korekta na oś.
5. **Preview gigantyczny zegar:** `clamp(…vw…)` w scaled stage. Fix: ScaledPreview + CSS split real vs `.home-preview-virtual`.
6. **Preview wszystko w lewo:** `getBoundingClientRect` po scale. Fix: `offsetWidth`.
7. **Skróty na historii wyszukiwania:** za mały gap y + niski z-index search. Fix: `packHomeChromeVertical` + search z-index 7 + overflow visible.
8. **Edit bar między treścią:** był sticky. Fix: `fixed; bottom: 24px`.

---

## 4. Mapa plików (ważne)

```
src/components/HomeSearch.tsx          # home shell, FAB, editMode, gallery
src/components/ScaledPreview.tsx       # jedyny scaler podglądów
src/components/personalize/*
src/widgets/WidgetStrip.tsx            # CANVAS: chrome+widgets+drag+undo+settings
src/widgets/snapMath.ts
src/widgets/WidgetFrame.tsx
src/widgets/WidgetSettingsPopover.tsx
src/widgets/WidgetPreview.tsx
src/widgets/ClockWidget.tsx / SearchWidget / ShortcutsWidget / Weather…
src/widgets/registry.ts
src/store.ts                           # homeWidgets, homeChrome, migrate, pack
src/styles/widgets.css
src/styles/chrome-layout.css           # home-clock styles thin/classic/mono
src/styles/personalize.css
src/styles/motion.css                  # clock-digit
test/home-widgets.test.mjs             # snap + collision smoke
scripts/capture-home-verify.cjs etc.   # opcjonalne zrzuty Electron
```

Persist merge (zustand): `mergedSettings.homeChrome = normalizeHomeChrome(...)`, `homeWidgets = migrateHomeWidgets(...)`.

---

## 5. Wejście w UI (dla ręcznych testów)

1. FAB siatka (prawy dół) → Personalizacja.
2. Widżety → „Edytuj układ na stronie”.
3. Tryb edycji: dashed outline, zębatka, pasek „Wyśrodkuj / Cofnij / Gotowe”.
4. Drag: nagłówek / puste; nie input „Ustaw miasto”.
5. Fokus wyszukiwarki → historia **nad** skrótami.
6. Podgląd w arkuszu: wyśrodkowany 1440×900 (nie lewy słupek).

---

## 6. Znane ryzyka / niedokończone

- **Packing chrome** tylko dla `center`+`x:0` — user może świadomie nachodzić po rozjechaniu X; suggestions vs widgets dalej rozwiązane głównie z-indexem, nie kolizją z wysokością dropdownu.
- **Collision** traktuje chrome box jako fixed height search (72px), **nie** rozszerza o otwarty `.home-suggest` — stąd z-index, nie fizyczny push skrótów przy focusie.
- Flex fallback `<900px` window: uproszczony układ, drag absolute wyłączony.
- `homeLayout` / `homeAlign` z LayoutTab nadal istnieją w CSS klasach, ale główny layout to teraz free-place chrome — preset layout może być niespójny z nowym modelem (do świadomej decyzji).
- Automacja klikania Segmented w Electron bywa flake’owa (AnimatePresence); nie oznacza to buga UI.
- Nie ruszać Tor/passwords/privacy przy kolejnych fixach home.

---

## 7. Preferowane kolejne kroki (jeśli user poprosi)

1. Przy focusie search **dynamicznie** odsować shortcuts / resolveCollision z „ghost box” wysokości suggest.
2. Ujednolicić Layout presets z `homeChrome` (migracja preset → pozycje).
3. Osobny styl karty per-widget zamiast globalnego `homeWidgetStyle` (zębatka już sugeruje per-widget).
4. Testy jednostkowe `packHomeChromeVertical` + pomiar metrics bez getBoundingClientRect w preview.
5. Paper theme visual QA (tokeny tylko).

---

## 8. Szybki checklist „czy znowu zepsute”

| Objaw | Prawdopodobna przyczyna |
|-------|-------------------------|
| Nie da się dragować | flexFallback / pointer-events header / metrics null / interactive target |
| Preview ściśnięte w lewo | znowu getBoundingClientRect w ScaledPreview |
| Gigantyczny zegar w preview | vw/clamp wrócił do `.home-preview-virtual` |
| Historia pod skrótami | z-index search / overflow hidden na karcie |
| Chrome na sobie | packHomeChrome wyłączony albo złe y w save bez pack |
| Zapisz = plama | opacity+backdrop-filter na `.hw-btn:disabled` |

---

## 9. Kontekst rozmowy z userem (PL)

User chce:
- swobodne układanie, ale **nie** chaosu nachodzenia (szczególnie search suggest vs shortcuts),
- w edycji przesuwanie **zegara, search, skrótów** i extra widżetów,
- **zębatkę** z ustawieniami przy każdym,
- działający **podgląd** w Personalizacji,
- reload przeglądarki na życzenie (`npm run electron:dev` po kill portu 5173).

Ostatnie fixy przed tym briefingiem: overlap suggest/shortcuts + pack chrome + search z-index; wcześniej ScaledPreview offsetWidth.

---

**Koniec briefingu.** Kontynuuj pracę w tym repo od powyższego stanu; nie zaczynaj od starego modelu „sztywny header + strip tylko pod search”.
