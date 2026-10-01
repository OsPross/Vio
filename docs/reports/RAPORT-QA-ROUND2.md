# Raport QA — djxxr (runda poprawek)

typecheck / build / test: OK.  
Zrzuty: `tmp-verify/` (obejrzane przed raportem).  
NIE ruszano: Tor daemon, sejf haseł, privacy presets.

---

## 1. Pasek boczny — tryb Auto

**Przyczyna:**  
W `App.tsx` przy `sidebarMode === 'auto'` dalej ustawiano layout jak dla raila (`--side-total` / kolumna siatki), więc obszar karty był wąski i ucięty (zegar „00”, pogoda przycięta). CSS Auto nie był czystym overlayem nad pełną szerokością treści.

**Poprawka:**
- Auto = klasy `no-side` + `sidebar-auto`, `--side-total: 0`
- Sidebar jako `position: fixed` overlay (cień, slide 160 ms, `prefers-reduced-motion`)
- Strefa 6 px (`.sidebar-edge-hit`) + Ctrl+Shift+S
- Ukrycie po zjechaniu kursora po 300 ms
- Przełączanie Włączony/Auto/Wyłączony bez reloadu kart i bez skoku layoutu treści

**Zrzuty:**
- `home-sidebar-on-midnight.png` / `home-sidebar-on-paper.png`
- `home-sidebar-off-midnight.png` / `home-sidebar-off-paper.png`
- `home-sidebar-auto-midnight.png` / `home-sidebar-auto-paper.png` (schowany = pełna szerokość, zegar pełny)
- `home-sidebar-auto-hover-midnight.png` / `home-sidebar-auto-hover-paper.png` (wysunięty overlay)

---

## 2. Nowe okno prywatne i Tor

**Przyczyna:**  
Ctrl+Shift+N / pozycje menu wołały `newPrivateTab` / `openTorTab` w bieżącym oknie zamiast nowego `BrowserWindow`. Boot trybu (hash / argumenty) był zawodny — brak pewnego IPC `shell:window-boot`.

**Poprawka:**
- `electron/window-mode.cjs` + `createWindow({ secondary, boot })`
- Private: partycja `private-<uuid>` (bez persist), wipe po zamknięciu
- Tor: istniejąca logika `tor-<uuid>` bez zmiany demona
- Tytuł: „Prywatne — djxxr” / „Tor — djxxr”
- Banner na stronie startowej / Tor landing
- W private: brak zapisu historii/sesji kart; pobrane na dysku, nie na liście (ephemeral downloads)
- Linki / nowa karta zostają w partycji okna
- Skróty i menu: `shell.newWindow({ boot: 'private' | 'tor' })`

**Zrzuty:**
- `window-private.png` / `window-private-paper.png` — tab „Nowa karta prywatna” + banner
- `window-tor.png` / `window-tor-paper.png` — tab Tor + banner + landing
- Uwaga: skrypt capture stubuje część IPC Tor; pełny Tor weryfikować w `electron .`

---

## 3. Menu ≡

**Przyczyna:**  
„Więcej narzędzi” miało placeholder zamiast ikony; aktywna/fokusowana pozycja dostawała obrys w akcencie; brak strony O djxxr. `djxxr://about` był ładowany w `<webview>`, co czyściło URL do pustego („Karta”).

**Poprawka:**
- Lucide `Wrench` przy „Więcej narzędzi”; wszystkie pozycje z prawdziwymi ikonami
- Hover/fokus: tylko tło `--bg-elev-2`; ring wyłącznie `:focus-visible`
- Wyłączone (Drukuj itd. na home): przygaszone + `title` „Niedostępne na stronie startowej”
- `djxxr://about` (+ alias `about:about`): AboutPage w stylu ustawień (logo, wersje Electron/Chromium/Node/V8, profil, kopiuj, skróty z rejestru, folder logów)
- TabWebview / keep-alive pomija `about:` i `djxxr://`

**Zrzuty:**
- `menu-more-tools-midnight.png` / `menu-more-tools-paper.png` — Wrench widoczny
- `about-midnight.png` / `about-paper.png` — pełna strona O djxxr

---

## 4. Zakładki — przebudowa strony

**Przyczyna:**  
Surowy HTML: białe natywne pole, natywny checkbox, gigantyczny boks „Wszystkie”, foldery wiszące pod spodem.

**Poprawka:**
- `InternalPage`: tytuł, licznik, `Input` + szukanie, Import/Eksport/Nowy folder, Switch „Pokaż pasek zakładek”
- Lewa kolumna 220 px: Wszystkie / Pasek / Inne / foldery użytkownika z ikonami i licznikami
- Prawa: wiersze (favicon, tytuł, url-display, folder, ⋯), dnd-kit, multi-select, edycja F2/dblclick, kontekst
- Pusty stan + import HTML oraz JSON z profilu Chrome/Brave/Edge (`%LOCALAPPDATA%`) przez `electron/bookmarks-import.cjs`
- Pasek zakładek pod omniboxem (gdy włączony)

**Zrzuty:**
- `bookmarks-empty-midnight.png` / `bookmarks-empty-paper.png`
- `bookmarks-seeded-midnight.png` / `bookmarks-seeded-paper.png` (20 zakładek, foldery Praca/Nauka/Hobby)

---

## 5. Pobrane — przebudowa strony

**Przyczyna:**  
Ta sama: białe pole, goła lista.

**Poprawka:**
- Nagłówek jak Zakładki, Input, „Wyczyść listę” z potwierdzeniem
- Wiersz: typ pliku, nazwa, rozmiar, host, data, progress+prędkość+ETA, akcje
- Stany: progressing / paused / completed / interrupted / fileMissing
- Grupowanie po dniach, pusty stan
- `webContents.startDrag` z listy
- Ikona w toolbarze z pierścieniem + popover ostatnich 5

**Zrzuty:**
- `downloads-empty-midnight.png` / `downloads-empty-paper.png`
- `downloads-seeded-midnight.png` / `downloads-seeded-paper.png` (progress, paused, error, missing, completed)

---

## 6. Wspólny szablon stron wewnętrznych

**Przyczyna:**  
Historia/Zakładki/Pobrane/About/Ustawienia bez jednego szablonu; natywne input/checkbox bez stylu.

**Poprawka:**
- `InternalPage` (nagłówek, toolbar, treść max 960 px)
- `Input` (forwardRef) w Settings/Bookmarks; ciemne checkboxy w `ui.css`
- Ciemne cienkie scrollbary na tych stronach
- `.stage` nie jest już tłem `#000` zasłaniającym internal pages

---

## Lista zmienionych / kluczowych plików

- `src/App.tsx` — sidebar Auto, window boot, about routing, bannery, TabWebview skip djxxr://
- `src/store.ts` — ABOUT_URL, sidebarMode, bookmark APIs
- `src/main.tsx` — `window.__DJXXR_STORE__` (capture)
- `src/styles.css`, `src/styles/ui.css`
- `src/components/AppMenu.tsx`, `AboutPage.tsx`, `BookmarksPage.tsx`, `BookmarksBar.tsx`, `DownloadsUI.tsx`, `InternalPage.tsx`, `HistoryPage.tsx`
- `src/components/ui/Input.tsx`
- `src/lib/windowBoot.ts`, `url-display.ts`, `bookmarksChrome.ts`
- `electron/main.cjs`, `preload.cjs`, `window-mode.cjs`, `bookmarks-import.cjs`, `downloads.cjs`
- `src/vite-env.d.ts`
- `scripts/capture-verify-round2.cjs`, `scripts/capture-verify-focus.cjs`

---

## Co sprawdzić ręcznie

1. Auto: najechanie na lewą krawędź / Ctrl+Shift+S — treść nie skacze; On↔Auto↔Off bez reloadu kart; home + zwykła strona (np. example.com).
2. Ctrl+Shift+N i menu → osobne okno prywatne; to samo dla Tor w pełnym `electron .` (nie w stub capture).
3. ≡ → hover „Więcej narzędzi” otwiera submenu; Drukuj na home przygaszone + tooltip.
4. Zakładki: DnD między wierszami i do folderu; import z profilu Chrome/Brave/Edge; pasek pod omniboxem.
5. Pobrane: przeciągnięcie ukończonego pliku do Eksploratora; pierścień przy aktywnym downloadzie.
6. Midnight + Paper: brak białych natywnych input/checkbox na Historia / Zakładki / Pobrane / About / Ustawienia.

---

## Skrypty ponownego zrzutu

Po `npm run build`:

```bash
npx electron scripts/capture-verify-round2.cjs
npx electron scripts/capture-verify-focus.cjs
```
