# Raport QA — djxxr (runda 7: weryfikacja R6 + dziury)

Data: 2026-10-01  
Dla: Grok / kolejny prompt  
Poprzednie: `RAPORT-QA-ROUND6.md`, `RAPORT-OMNIBOX-GHOST.md`

**typecheck / build / test:** OK (`tsc -b`, `vite build`, home-widgets + notes + url-display + bangs + omnibox-ghost; `test-tor-leaks` OK w tym adblock + Ctrl+Shift+T)  
**Live smoke:** `SMOKE_ROUND7=1` → **fail=0 / 18** (`scripts/smoke-round7-live.cjs`, electron przeciw Vite 5173, bez stubów)  
**NIE ruszano:** Tor daemon / fail-closed / mosty, crypto sejfu, privacy presets, `persist:private`, historia w Zustand

---

## Commity tej rundy

| Hash | Message |
|------|---------|
| `c9e1e4e` | fix: Chrome-like shortcuts in inputs and contenteditable |
| `ca47edd` | fix: Chrome userAgentData via CDP Emulation.setUserAgentOverride |
| `1bc97c6` | feat: electron-chrome-extensions — tabs, action popups, toolbar icons |
| `168df49` | refactor: remove legacy adblock.cjs — Ghostery-only engine |
| `df8d048` | fix: X1/X2 back/forward from app-command only on Windows |
| `24d07f0` | fix: flush notes to disk on quit and page hide |
| `baa008f` | test: add smoke-round7-live for R6 checklist automation |
| `ec0a9fa` | fix: type browser-action-list for React JSX IntrinsicElements |
| `c6d8462` | fix: init chrome extensions API after app ready; allow guest adblock IPC |

---

## 1. SKRÓTY W POLACH TEKSTOWYCH

**Objaw:** skróty chrome bywały blokowane w inputach / omniboxie albo odwrotnie — edycja pola kradziona przez chrome.  
**Przyczyna:** `353e980` pomijało skróty w editable zbyt szeroko; brak jawnej allowlisty Chrome.  
**Poprawka:** `src/lib/shortcutsRegistry.ts` — `ALLOWED_IN_EDITABLE` + `isEditableDomTarget` (input/textarea/select/**contenteditable**); zawsze: Ctrl+T/W/Shift+T/N/Shift+N, Ctrl+L/Alt+D/F6, Ctrl+Tab, Ctrl+1..9, Ctrl+R/F5, Ctrl+F/P/±/0, F11/F12, Alt+←/→, Shift+Esc; litery/Backspace/Delete/Ctrl+A/C/V/X/Z/Y zostają w polu.  
**Status:** działa [T] — smoke: fokus w omniboxie + Ctrl+T otworzył kartę (`shortcut-ctrl-t-in-field → OK`)

---

## 2. USER-AGENT DATA JAK CHROME

**Objaw:** `navigator.userAgentData` / brands zdradzały Electron; Google „przeglądarka może nie być bezpieczna”.  
**Przyczyna:** sam string UA bez `userAgentMetadata` w CDP.  
**Poprawka:** `electron/ua-chrome.cjs` + `Emulation.setUserAgentOverride` z metadata (Chromium + Google Chrome + Not.A/Brand, platform/fullVersionList) per guest (także private; Tor tylko UA, bez zmiany logiki Tora). Debugger nie blokuje F12.  
**Status:** działa [T]

Wynik smoke (guest `example.com`):

```
ua: Mozilla/5.0 (Windows NT 10.0; Win64; x64) … Chrome/152.0.7977.130 Safari/537.36
brands: Not.A/Brand 99 · Google Chrome 152 · Chromium 152
fullVersionList: …152.0.7977.130 (Chrome+Chromium)
platform: Windows / platformVersion: 15.0.0
hasElectron: false · hasDjxxr: false
Worker navigator.userAgent / brands: OK (bez Electron)
```

browserleaks.com/client-hints + logowanie accounts.google.com: **do ręcznego** (poniżej).

---

## 3. ROZSZERZENIA PO LUDZKU

**Objaw:** `loadExtension` bez chrome.tabs / action popup / badge / contextMenus; brak ikon w toolbarze.  
**Przyczyna:** brak hosta API; `initChromeApi` było wołane przed `app.ready` → fail „Session can only be received when app is ready”.  
**Poprawka:** `electron-chrome-extensions` (GPL-3.0) — `initChromeApi` po `whenReady`, `trackGuestTab` (Tor **nigdy**), `handleCRXProtocol`, `<browser-action-list>` + przycisk puzzle → `about:extensions`, contextMenus w PPM, ciemne tło popupów; private wg `allowPrivate`.  
**Status:** działa [T] częściowo — smoke UI OK (`bal`+puzzle); instalacja konkretnych CRX **[K]**

### Tabela rozszerzeń (live)

| Rozszerzenie | Status | Brakujące API / uwagi |
|--------------|--------|------------------------|
| uBlock Origin Lite | [K] | MV3; wymaga instalacji CWS/folder — nie instalowano w smoke |
| Dark Reader | [K] | action popup — host gotowy; do ręcznego |
| Bitwarden (login+autofill github.com/login) | [K] | `chrome.tabs`/`runtime` — host gotowy; autofill do ręcznego |
| SponsorBlock | [K] | |
| Return YouTube Dislike | [K] | |
| Tor | **NIGDY** | `trackGuestTab` skip + brak `browser-action-list` |
| Private | wg przełącznika | `attachToPrivateSession` tylko `allowPrivate` |

---

## 4. JEDEN ADBLOCK

**Objaw:** dual binding Ghostery + legacy `adblock.cjs` (podwójne `onBeforeRequest` / flicker).  
**Przyczyna:** `adblock-plus.cjs` require’ował legacy.  
**Poprawka:** usunięto `electron/adblock.cjs`; Ghostery jedyny silnik sieciowy; `customRules` → `parseFilters` + `blocker.update`; fallback tylko cosmetic CSS + YT page script gdy Ghostery nie wstanie. Guest IPC `adblock-cosmetic` przez `wrapAppOrGuest`.  
**Status:** działa [T]

**Flicker (seria zrzutów co 100 ms):**  
katalog `…/djxxr-smoke7-*/flicker-youtube` (t0…t1100). Obejrzane t0 / t500 / t1100 — ten sam layout YouTube (historia wyłączona, dark PL), **bez** migania reklam / skoków CSS między klatkami. example.com stabilny. onet.pl / wp.pl / reddit.com: **[K]** (nie w automacie).

---

## 5. SMOKE R6 NA ŻYWO + NAPRAWY

**Objaw:** dziury z checklisty R6 (X1/X2 double, notes po restarcie, crash/offline UI, Ctrl+Shift+T po zamknięciu okna).  
**Przyczyna (X1/X2):** dwa źródła (app-command + mouseup) mimo debounce.  
**Poprawka:** na win32 **tylko** `app-command` (chrome + webview-preload pomijają mouseup 3/4).  
**Przyczyna (notes):** brak `flushNow` przy quit + debounce draftu.  
**Poprawka:** `notes.flushNow()` w `before-quit`; flush draftu na `pagehide`/`visibilitychange`.  
**Crash / offline:** `forcefullyCrashRenderer` + DNS fail → ErrorPage (już R6; potwierdzone).  
**Ctrl+Shift+T:** `sessionPopClosedWindow` + shortcut registry — smoke `wins=2` OK.

### Wynik `smoke-round7-live` (18/18 OK)

| # | Punkt | Wynik |
|---|--------|-------|
| 1 | Omnibox fokus + Ctrl+T w polu | OK |
| 2 | Brak Tor na toolbarze | OK |
| 3 | X1/X2 single-source (win) | OK |
| 4 | PiP API | OK |
| 5 | Flicker shots YT/example | OK |
| 6 | Notes create/list | OK |
| 7 | Extensions UI + browser-action-list | OK |
| 8 | Tor bez rozszerzeń | OK |
| 9 | Crash → ErrorPage | OK |
| 10 | Offline/DNS → ErrorPage | OK |
| 11 | Zoom | OK |
| 12 | Permission API | OK |
| 13 | Ctrl+Shift+T po zamknięciu okna | OK |
| 14 | UA / userAgentData / Worker | OK |

---

## 6. WIDEVINE (analiza, bez zmian w kodzie)

Żeby **Netflix / Disney+ / Spotify web** grały DRM:

1. **castLabs Electron (ECS)** zamiast stock Electron (`electron` → mirror `github.com/castlabs/electron-releases`, tag `v{ver}+wvcus`). Drop-in, ale wersja musi śledzić ECS (nie zawsze = najnowszy Electron upstream).
2. **Component Updater** musi móc pobrać Widevine CDM — dziś `privacy.cjs` ma `disable-component-update` (świadomie anty-telemetry). Trzeba wyjątku albo `components.whenReady()` z ECS API; konflikt z modelem prywatności.
3. **VMP / EVS:** buildy ECS są podpisane tylko pod **dev**. Produkcja (Netflix e100 bez podpisu) wymaga darmowego EVS (`python -m castlabs_evs.vmp sign-pkg …`) **po** code-sign na Windows, **przed** na macOS.
4. **NSIS / electron-builder:** `electronDownload.mirror` + `electronVersion` z sufiksem `+wvcus`; afterPack hook EVS; weryfikacja `verify-pkg`.
5. **Aktualizacje:** własny kanał ECS (nie electron-releases upstream); pin wersji; test regresji Tor/adblock przy każdym bumpie.
6. **Tor:** Widevine w sesji Tor zwykle zbędne/niepożądane — nie ładować CDM w partycjach Tor; fail-closed demona **nietknięty**.

**Szacunek pracy:** 2–4 dni robocze (ECS swap + builder + EVS + wyłączenie CDM w Tor + QA Netflix/Disney/Spotify) + bieżący koszt utrzymania forków ECS przy update’ach. **Nie wdrażane w R7.**

---

## typecheck / build / test

```
npm run typecheck  → OK
npm run test       → OK
npm run build      → OK (vite)
node scripts/test-tor-leaks.cjs → OK (adblock Ghostery-only, Ctrl+Shift+T via registry)
SMOKE_ROUND7=1     → fail=0 / 18
```

---

## Do ręcznego sprawdzenia (max 8)

1. YouTube search field + omnibox: Backspace / Ctrl+A w polu; Ctrl+W / Ctrl+Tab nadal chrome  
2. https://browserleaks.com/client-hints — porównaj z smoke brands/fullVersionList; brak Electron  
3. accounts.google.com — logowanie bez „ta przeglądarka może nie być bezpieczna”  
4. Zainstaluj uBO Lite + Dark Reader — ikona/popup pod toolbar; Tor bez ikon  
5. Bitwarden: login + autofill na github.com/login  
6. Flicker adblock: onet.pl / wp.pl / reddit.com (shield „Wyłącz na tej stronie”)  
7. Notatki: napisz → zabij proces → restart → treść na dysku  
8. X1/X2 fizyczna mysz na webview: jeden skok wstecz (nie dwa)

---

## Zakazy (przypomnienie)

Tor daemon / fail-closed / mosty · crypto sejfu · privacy presets · `persist:private` · historia w Zustand — **nie ruszane**.
