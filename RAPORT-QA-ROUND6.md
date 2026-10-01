# Raport QA — djxxr (runda 6: codzienny komfort)

Data: 2026-10-01  
Dla: Grok / kolejny prompt  
Poprzednie: `RAPORT-QA-ROUND5.md`, `RAPORT-QA-ROUND4.md`, `docs/FULL_STATE.md`

**typecheck / build / test:** OK (`tsc -b`, `vite build`, home-widgets + notes + url-display + bangs)  
**Live smoke:** częściowy — unit/module load OK; pełne `electron:dev` ścieżki A–H do ręcznego checklistu poniżej  
**NIE ruszano:** Tor daemon / fail-closed / mosty, crypto sejfu, privacy presets, `persist:private`, historia w Zustand

---

## Commity tej rundy

| Hash | Message |
|------|---------|
| `353e980` | fix: omnibox edit lock — no overwrite while dirty, Esc×2, skip shortcuts in inputs |
| `937c77e` | fix: DDG bangs — !g=Google, trailing bangs, migrate + unit test |
| `82579d2` | fix: remove Tor tab-strip button; Tor via + menu / tab PPM / ≡ |
| `89ce620` | fix: mouse X1/X2 back/forward via app-command + preload, no Backspace-nav |
| `c875477` | feat: omnibox inline autocomplete from history/bookmarks/topsites |
| `933b3d5` | fix: Ctrl+L/Alt+D/F6 select-all; Ctrl+Enter adds www+.com |
| `6979f08` | fix: type historySuggest bookmarks option |
| `e7fdb47` | fix: adblock cosmetic early inject, no double/SPA flicker |
| `8f0cd23` / `f9d1a0e` | fix: PiP userGesture + Alt+P guest + autoPipOnTabSwitch |
| `c76b961` | feat: notes editor with disk persist, search, markdown light |
| `7332f76` | feat: extensions via loadExtension (folder/zip/crx/CWS) |
| `51be618` | fix: crash and network error pages with Odśwież |
| `da6acaf` | feat: restore closed windows via Ctrl+Shift+T (+ UA/CH, zoom, paste, Esc FS, drop) |
| `3e3855e` | fix: ClosedTab restore typing + persistent zoom badge |

---

## A. OMNIBOX

### A1. Edycja tekstu
**Objaw:** czasem nie da się usuwać / edytować URL.  
**Przyczyna:** kontrolowany draft nadpisywany przez sync URL karty / skracanie przy fokusie; skróty chrome łapały Backspace/Delete w inpucie.  
**Poprawka:** `omniEditingRef` + `omniFocusedRef` — przy fokusie i dirty nic z zewnątrz nie nadpisuje; pełny URL + select-all przy fokusie; skróty aplikacji pomijane gdy fokus w inpucie; Esc×2 (URL → fokus stronie); IME/AltGr bez zmian ścieżki.  
**Status:** działa [T] (logika + code review; ręcznie: edycja / polskie znaki)

### A2. Inline autocomplete
**Objaw:** brak dopełnienia jak w Chrome.  
**Przyczyna:** brak ścieżki suggest → zaznaczony sufiks.  
**Poprawka:** historia (frecency) + zakładki + top sites; dopełnienie tylko prefiksu hosta/URL; Backspace usuwa dopełnienie; Enter = pierwsza podpowiedź.  
**Status:** działa [T]

### A3. Bangi
**Objaw:** `!g` → Gmail zamiast Google; brak trailing bang.  
**Przyczyna:** lista bangów / parser.  
**Poprawka:** `src/lib/bangs.ts` zgodna z DDG (`!g` Google, `!gmail`, `!yt`, `!w`, …); bang na początku i końcu; test `test/bangs.test.mjs`.  
**Status:** działa [T] (unit)

### A4. Skróty omnibox
**Objaw:** brak Ctrl+L / Ctrl+Enter / Shift+Delete.  
**Poprawka:** Ctrl+L, Alt+D, F6 → fokus + zaznaczenie; Ctrl+Enter → `www.`+`.com`; Shift+Delete usuwa podpowiedź historii.  
**Status:** działa [T]

---

## B. PRZYCISK TORA
**Objaw:** Tor na głównym pasku narzędzi.  
**Przyczyna:** przycisk w chrome.  
**Poprawka:** usunięty z paska; Tor w ≡ (Nowe okno Tor), PPM karty/linku, menu „+” (PPM/long-press); w oknie Tor zostaje wskaźnik obwodu. Logika demona **nietknięta**.  
**Status:** działa [T]

---

## C. BOCZNE PRZYCISKI MYSZY
**Objaw:** X1/X2 nie działały wszędzie / ryzyko podwójnego cofnięcia; Backspace cofał.  
**Przyczyna:** brak `app-command` + brak debounce; Backspace jako nav.  
**Poprawka:** `BrowserWindow` `app-command` + fallback mouseup 3/4 (preload + renderer) z debounce ~120 ms; Alt+←/→; Backspace **nie** nawiguje.  
**Status:** działa [T]

---

## D. PIP
**Objaw:** ikona / Alt+P nie otwierały PiP (brak user activation).  
**Przyczyna:** `requestPictureInPicture` bez gestu.  
**Poprawka:** IPC + `executeJavaScript(..., true)`; PiP przeżywa zmianę karty/minimalizację; opcja auto-PiP przy zmianie karty (domyślnie off).  
**Status:** działa [T] — ręcznie: YouTube → PiP → zmiana karty / minimize

---

## E. MIGOTANIE ADBLOCK
**Objaw:** strony mrugają (YouTube/SPA).  
**Przyczyna:** kosmetyka za późno / podwójnie / przy `did-navigate-in-page`.  
**Poprawka:** early inject (preload / start navigation); Ghostery jako źródło, legacy ograniczone; mniej reinject na SPA; Shield „Wyłącz na tej stronie” + reload.  
**Status:** działa [T] — **do nagrania:** youtube.com, onet.pl, wp.pl, reddit.com przed/po

**Różnica Ghostery vs legacy:** Ghostery = listy + CosmeticFilterEngine; legacy = prostszy adblock.cjs — zostawiono Ghostery jako główny.

---

## F. NOTATKI
**Objaw:** rozwalony edytor / utrata danych.  
**Przyczyna:** brak trwałego zapisu main / słaby UX.  
**Poprawka:** lista + autosave debounce; tytuł z 1. linii; wyszukiwanie; usuwanie z confirm/undo; markdown light; `notes.cjs` na dysku; tokeny Midnight/Paper.  
**Status:** działa [T]

---

## G. ROZSZERZENIA
**Objaw:** brak instalacji / UI.  
**Przyczyna:** brak `session.loadExtension` + strony.  
**Poprawka:**
- `electron/extensions.cjs` — folder / ZIP / CRX / Chrome Web Store (update URL → CRX → unpack → load)
- `about:extensions` — lista, włącz/wyłącz, prywatne per-ext, pin (flaga UI), uprawnienia, usuń
- `persist:main`; private tylko gdy allowPrivate; **Tor nigdy**
- Trade-off: **bez** `electron-chrome-extensions` → brak pełnego `chrome.tabs` / action popup host

| Rozszerzenie | Oczekiwane | Status w R6 | Brakujące API (jeśli fail) |
|--------------|------------|-------------|---------------------------|
| uBlock Origin Lite | MV3 blocking | do ręcznego [K] | `declarativeNetRequest` częściowo ok w Electron; UI popup może nie |
| Dark Reader | MV3 | do ręcznego [K] | `chrome.storage` / scripting — zwykle ok |
| Bitwarden | MV3 | do ręcznego [K] | `chrome.tabs`, `windows`, native messaging |
| SponsorBlock | MV3 | do ręcznego [K] | `chrome.tabs` / messaging |
| Return YouTube Dislike | MV3 | do ręcznego [K] | j.w. |

**Status:** infrastruktura [T]; konkretne CRX — **[K] checklist**

---

## H. CODZIENNA PRZEGLĄDARKA

| Punkt | Status | Uwagi |
|-------|--------|-------|
| Ctrl+Shift+T (karty + okno) | [T] | karty lokalnie; zamknięte okno → `session.pushClosedWindow` → nowe okno |
| Środkowy / Ctrl+klik link | [T] | via `background-tab` + `open-url` |
| Środkowy klik karty | [T] | zamyka |
| Ctrl+Tab / Shift+Tab / 1–9 | [T] | shortcutsRegistry + guest |
| Otwórz poprzednie karty | [T] | Settings → „Otwórz poprzednie karty” (`startupMode=session`) |
| Crash strony | [T] | `crashed` / `render-process-gone` / `unresponsive` → ErrorPage + Odśwież |
| Błędy sieci | [T] | DNS/cert/timeout mapowane; Odśwież |
| Zoom per domena + Ctrl+0 + badge | [T] | badge trwały gdy ≠100% |
| Uprawnienia Allow/Block/Remember | [T] | pasek przy omniboxie |
| Pobieranie postęp / folder / ask | [T] | DownloadsUI + settings |
| Drag na pasek / stage | [T] | URI + pliki |
| Wklej i przejdź / Ctrl+Shift+V | [T] | omnibox menu; PPM → `insertText` (plain) |
| Szukaj zaznaczenia | [T] | `searchUrl` bieżącej wyszukiwarki |
| Esc vs F11 fullscreen | [T] | Esc nie kradnie HTML FS |
| UA / Client Hints | [T/partial] | UA z `process.versions.chrome` + `sec-ch-ua*`; `navigator.userAgentData` może nadal zdradzać Electron |
| Widevine / Netflix | **brak** | `disable-component-update` w privacy — CDM nieaktualizowany; Netflix raczej nie zagra |

---

## Własny przegląd (≥10 tarć) + szybkie fixy

| # | Tarcie | Akcja R6 |
|---|--------|----------|
| 1 | Wklej jako tekst = `pasteAndMatchStyle` | **naprawione** → `clipboard.readText` + `insertText` |
| 2 | Zoom badge znikał po 2 s | **naprawione** — trwały gdy ≠100% |
| 3 | ErrorPage „Spróbuj ponownie” | **naprawione** → Odśwież |
| 4 | Label sesji ≠ spec | **naprawione** → „Otwórz poprzednie karty” |
| 5 | Brak crash UI | **naprawione** |
| 6 | Drop tylko na pasek kart | **naprawione** — też `.stage` |
| 7 | Esc kradł HTML FS | **naprawione** |
| 8 | Brak Client Hints headers | **naprawione** (HTTP); JS brands nadal Electron |
| 9 | Ctrl+Tab nie-MRU | zostawione (świadomie linear) |
| 10 | Image search → Google Lens hardcode | zostawione (>30 min / produkt) |
| 11 | Rozszerzenia bez action popup | udokumentowane (trade-off G) |
| 12 | Widevine | udokumentowane — nie włączamy component-update w tej rundzie |

---

## Tabela kompatybilności stron (do ręcznego)

| Strona | Logowanie / użycie | UA/CH | Uwagi |
|--------|-------------------|-------|-------|
| YouTube | [K] | [K] | PiP + adblock flicker |
| Google konto | [K] | [K] | OAuth popup (R5) |
| Discord web | [K] | [K] | |
| Netflix | oczekiwane **FAIL** | — | brak Widevine |
| Allegro | [K] | [K] | |
| 3DS bank test | [K] | [K] | |
| Cloudflare / reCAPTCHA | [K] | [K] | UA jak Chrome pomaga |

---

## typecheck / build / test

```
npm run typecheck  → OK
npm run test       → OK (home-widgets, notes, url-display, bangs)
npm run build      → OK
```

---

## Do ręcznego sprawdzenia przeze mnie

1. Omnibox: fokus, Backspace/Delete/Ctrl+Z, Esc×2, polskie znaki, autocomplete „you”→youtube, `!g` / `pogoda !g`, Ctrl+L, Ctrl+Enter, Shift+Delete  
2. Brak przycisku Tor na pasku; Tor z ≡ / + / PPM; wskaźnik tylko w oknie Tor  
3. X1/X2 wstecz/dalej na webview, about:*, private, Tor — bez podwójnego skoku; Backspace nie cofa  
4. YouTube PiP (ikona + Alt+P), zmiana karty, minimalizacja; auto-PiP off by default  
5. Flicker adblock: youtube / onet / wp / reddit — nagranie; Shield „Wyłącz na tej stronie”  
6. Notatki: zapis po restarcie, lista, search, undo delete  
7. `about:extensions`: instalacja folder/zip/crx + 1× CWS ID; Tor bez rozszerzeń  
8. Rozszerzenia z tabeli G (uBO Lite, Dark Reader, …)  
9. Crash: zabij renderer → strona „przestała działać” + Odśwież  
10. Offline / zły DNS → ErrorPage  
11. Zoom per domena + badge; Ctrl+0  
12. Kamera/mikrofon popover  
13. Ctrl+Shift+T po zamknięciu drugiego okna  
14. `navigator.userAgent` bez „Electron”; `userAgentData` — zanotuj wynik  
15. Netflix — potwierdź brak Widevine  

---

## Zakazy (przypomnienie)

Tor daemon / fail-closed / mosty · crypto sejfu · privacy presets · `persist:private` · historia w Zustand — **nie ruszane**.
