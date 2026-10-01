# Raport QA — djxxr (runda 5: dopięcie uwag z R4)

Data: 2026-10-01  
Dla: Grok / kolejny prompt  
Poprzednie: `RAPORT-QA-ROUND4.md`, `docs/FULL_STATE.md`

**typecheck / build / test:** OK  
**Live smoke:** `SMOKE_ROUND5=1` + `electron .` (tylko `!app.isPackaged`) → **22 checks, 0 FAIL**  
**NIE ruszano:** Tor daemon / OpenPGP, crypto sejfu, privacy presets, historia w Zustand, `persist:private`

---

## Commity tej rundy

| Hash | Message |
|------|---------|
| `316a6c5` | fix: OAuth popup read-only URL bar + guest security parity |
| `1ed3b13` | fix: load webview-preload once via will-attach only |
| `e5f72c7` | fix: submenu safe-triangle hover + keyboard + clamp |
| `d38a792` | fix: print via guest webContents; PDF/HTML names from title |
| `6401711` | fix: purge Partitions/private before any session, EPERM retry flag |
| *(ten)* | test: smoke round5 + RAPORT-QA-ROUND5 |

---

## 1. POPUP LOGOWANIA Z PASKIEM ADRESU

**Objaw (R4 follow-up):** OAuth `BrowserWindow` bez paska adresu / domeny; niepewna parytet zabezpieczeń vs karta.

**Przyczyna:**
| Plik | Funkcja / miejsce | Co robiło źle |
|------|-------------------|---------------|
| `electron/popups.cjs` ~L199–216 | `handleWindowOpen` → `overrideBrowserWindowOptions` | Zwykłe okno bez chrome URL |
| `electron/main.cjs` `onPopupWindow` | tylko `certificate.attachCertificateHandler` | Brak pełnego `wireGuestNavigation` |
| — | brak trackingu dzieci | Popup z okna prywatnego mógł zostać po zamknięciu hosta |

**Poprawka:**
- `popup-chrome.html` + `WebContentsView` (36px) nad treścią: kłódka + host (eTLD+1 pogrubiony, reszta przygaszona)
- Klik → panel z pełnym URL + info cert (CDP gdy dostępne)
- `win.setTitle(host)` przy każdej nawigacji / redirect
- `trackPopupChild`: zamknięcie hosta zamyka popupy
- Ta sama `session` co opener (już wcześniej) → prywatne = ta sama efemeryczna sesja
- `onPopupWindow` → pełne `wireGuestNavigation`

**Parytet zabezpieczeń (popup vs karta webview):**

| Mechanizm | Karta `<webview>` | Popup BrowserWindow |
|-----------|-------------------|---------------------|
| `session` = opener | tak (partition) | **tak** (`webPreferences.session`) |
| `contextIsolation` + `sandbox` | tak (`will-attach`) | **tak** |
| Adblock / downloads / privacy na sesji | tak | **tak** (ta sama sesja) |
| Navigation guards + window.open policy | tak | **tak** (`wireGuestNavigation`) |
| Menu PPM (`context-menu.cjs`) | tak | **tak** |
| Certificate handler | tak | **tak** |
| Spellcheck | tak | **tak** |
| Ciemne scrollbary (insertCSS) | tak (renderer) | **tak** (`DARK_SCROLLBAR_CSS`) |
| `webview-preload` (hasła / PiP bridge) | tak | **nie** (nie jest webview — świadomie) |
| Chrome omnibox / karty | tak | **nie** (tylko cienki URL bar) |

**Smoke:** `popup-url-chrome` → OK — `hasChrome:true`, title `accounts.google.com`

**Status:** działa [T]

---

## 2. PODWÓJNY PRELOAD

**Objaw:** `contextBridge` „already been registered” — maskowane try/catch.

**Przyczyna:**
| Plik | Linia | Co |
|------|-------|-----|
| `electron/main.cjs` | ~575 | `ses.registerPreloadScript({ type: 'frame', filePath: wvPreloadPath })` — **każda ramka** (main + iframe) |
| `electron/security.cjs` | ~262 | `will-attach-webview` też ustawia `webPreferences.preload` |

**Podwójne ładowanie main frame** = registerPreloadScript + will-attach.  
**Iframe** dostawały preload tylko z `registerPreloadScript` (nie powinny).

**Poprawka:** usunięto `registerPreloadScript`; zostaje wyłącznie `will-attach-webview`. Usunięto try/catch maskujący. `console.debug('[webview-preload] run', { id, frame })`.

**Smoke:** `preload-main-bridge` OK (`__djxxrPw` w top); `preload-iframe-no-bridge` OK (`iframeHasBridge:false`).

**Status:** działa [T]

---

## 3. SUBMENU „WIĘCEJ NARZĘDZI”

**Objaw:** flaky hover w automacie; smoke obchodził Shift+Esc.

**Przyczyna:**
| Plik | Miejsce | Co |
|------|---------|-----|
| `src/components/AppMenu.tsx` | close 180 ms, „bridge” prostokąt | Za krótkie opóźnienie / słaby safe-zone; brak natychmiastowego open na klik |

**Poprawka:**
- Open delay **100 ms**, close **300 ms**, klik → `openSubNow` od razu
- Safe triangle (barycentric) + korytarz między item a panelem
- Klawiatura: → otwiera, ← zamyka, Esc poziom wyżej (już było, dopięte clear timer)
- Clamp: flip left/right + top ≥ 4px

**Smoke:** `submenu-taskmgr-1`…`10` + `submenu-taskmgr-10x` → **10/10 OK** (bez Shift+Esc)

**Status:** działa [T]

---

## 4. DRUK / PDF / ZAPISZ

**Objaw / ryzyko:** `webview.print()` → biały podgląd; nazwy plików `page.pdf` / `page.html`.

**Przyczyna:**
| Plik | Miejsce | Co |
|------|---------|-----|
| `src/App.tsx` | `print` / Ctrl+P | `currentView()?.print?.()` na tagu webview |
| `electron/main.cjs` | `shell:save-page` / `print-to-pdf` | `defaultPath: 'page.*'` |

**Poprawka:**
- IPC `shell:print` → `guestWebContents.print({ printBackground })`
- PDF/HTML: `defaultPath` z tytułu strony (sanitize)
- `forcePath` dla smoke / automatyki
- Home: pozycje wyszarzone + `title="Niedostępne na stronie startowej"` (już było `hasPage`)

**Wyniki smoke (ścieżki):**

| Test | Wynik | Plik |
|------|-------|------|
| example.com print (silent) | OK | — (silent; UI preview = `shell:print` bez silent) |
| example.com PDF | OK | `tmp-verify/smoke-round5/example.pdf` (20 692 B) |
| example.com HTML complete | OK | `tmp-verify/smoke-round5/example.html` (21 499 B) |
| pl.wikipedia.org/wiki/Polska print | OK | silent |
| Wikipedia PDF | OK | `tmp-verify/smoke-round5/wikipedia-pl.pdf` (~6.5 MB) |
| Wikipedia HTML | OK | `tmp-verify/smoke-round5/wikipedia-pl.html` (~2.4 MB) |
| about:home Drukuj/Zapisz/PDF | OK | disabled + hint |

**Status:** działa [T]

---

## 5. PURGE PARTITIONS/PRIVATE

**Objaw:** EPERM gdy folder zajęty; purge wołał `session.fromPartition('persist:private')` (odtwarzał store).

**Przyczyna:**
| Plik | Miejsce | Co |
|------|---------|-----|
| `electron/main.cjs` whenReady | po innych initach | `session.fromPartition('persist:private')` + `rmSync` za późno |

**Poprawka:** `windowMode.purgeLegacyPrivatePartitionSync()` jako **pierwsza** rzecz w `whenReady` — tylko `fs.rmSync` na `Partitions/private`, bez tworzenia sesji. Przy błędzie: flaga `purge-private-pending`, log **raz** (`purge-private-logged`), retry przy następnym starcie; po sukcesie flagi znikają.

**Status:** działa [K] (logika; EPERM zależy od OS/lock)

---

## 6. SMOKE

- Nowy: `scripts/smoke-round5-live.cjs`
- Hook w `main.cjs`: tylko gdy `!app.isPackaged && SMOKE_ROUND5=1` (R4 też tylko unpackaged)
- Wynik: `tmp-verify/smoke-round5-results.json` — **22 checks, 0 FAIL**

Uruchomienie:
```
npx vite --host 127.0.0.1 --port 5173
$env:SMOKE_ROUND5='1'; $env:VITE_DEV_SERVER='http://127.0.0.1:5173'; npx electron .
```

---

## typecheck / build / test

```
npx tsc -b → exit 0
npm test → home-widgets ok, url-display ok
npm run build → OK, JS ~769 kB / CSS ~228 kB
```

---

## Zakazy (nadal)

- Nie zmieniać Tor daemon / fail-closed / mostów bez punktu
- Nie ruszać crypto sejfu
- Nie wracać do `persist:private` ani historii w Zustand partialize

## Uwagi / follow-up

1. Popup nie dostaje `webview-preload` (autofill haseł / PiP w popupidzie) — świadomie; OAuth zwykle nie potrzebuje
2. `contentChildren` w Electron View hierarchy bywa 1 mimo osobnego chrome view — smoke opiera się o `__djxxrPopupChrome` + title domeny
3. Pełny podgląd wydruku (nie-silent) — ręcznie Ctrl+P; smoke używa `silent:true` żeby nie blokować dialogiem

---

*Koniec RAPORT-QA-ROUND5.*
