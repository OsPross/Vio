# Raport — hotfix wydajności (po RAPORT-PERF-BASELINE)

Data: 2026-10-01  
Środowisko: Windows, Electron 44.5  
Pomiar: `node scripts/run-perf-baseline.cjs` ×3 (Vite `127.0.0.1:5173`), mediana: `tmp-verify/perf/baseline-median-latest.json`  
Idle 10 kart = 10 min, CPU w tle = 60 s (jak baseline)  
Smoke: Round7 live `fail=0` / 18  
`npm run typecheck` / `npm test` / `npm run build` — OK  

Zakazy zachowane: Tor daemon/fail-closed/mosty, crypto sejfu, privacy presets, `persist:private`, historia w Zustand — bez zmian zachowania w tych obszarach.

---

## Tabela BASELINE → HOTFIX (mediana 3×)

| Metryka | BASELINE | HOTFIX | Δ |
|---------|----------|--------|---|
| Re-rendery łącznie, 30 s idle (Profiler) | 119 880 | 293* | −99.8% |
| Re-rendery `App`, 30 s idle | 3431 | 7 | −99.8% |
| Re-rendery suma `Tab:*`, 30 s idle | 116 883 | 156 | −99.9% |
| „Maximum update depth exceeded” | tak (logi) | **0** | — |
| CPU renderer UI w tle (60 s, mediana próbek) | 6.03% | **0%** | −6 pp |
| CPU łącznie w tle | 8.995% | 1.08% | −7.9 pp |
| RAM UI przy 10 kartach | 309 MB | **164 MB** | −145 MB |
| RAM łącznie przy 10 kartach | 1405 MB | 1113 MB | −292 MB |
| RAM gości (10 kart, mapa OS pid) | 389 MB (typ Tab) | 243 MB (1 live webview) | — |
| RAM main (Browser) pusta strona | 323 MB | **323 MB** | 0 |
| RAM łącznie pusta strona | 657 MB | 695 MB | +38 MB |
| Start → `whenReady` (dev/Vite) | 1669 ms | **55 ms** | −1614 ms |
| Start → okno widoczne (dev) | 4172 ms | **784 ms** | −3388 ms |
| Start → interaktywne (dev) | 4988 ms | 3422 ms | −1566 ms |
| Start → widoczne (build `dist`, bez Vite) | — | **672 ms** | — |
| Start → interaktywne (build `dist`) | — | **3413 ms** | — |
| electron-builder `--dir` (packaged) | — | ~6756 ms† | — |
| Listenery okna `focus`/`resized` (EE) | N × karta → MaxListeners | **1 + 1** (fanout) | — |
| Δ WC / IPC po open+close 20 kart | 0 | 0 | OK |
| `did-fail-load` (reddit/google, 45 s wait) | częściy / timeout | **[]** | — |

\* Idle Profiler w pełnym suite odpala się **po** scenariuszu 30 kart + testach UI (~39 profilowanych `Tab:*` w drzewie + persist sesji). Szybki run zaraz po starcie: **totalRenders = 1**. Ekstrapolacja przy 10 kartach ≈ `App(7) + 10×~4 ≈ 47` (&lt; 50). Pętla usunięta u źródła.  
† Packaged run współdzielił zablokowany `userData` (EPERM cache) — liczba zawyżona; wiarygodne: **dev** i **dist+electron**.

---

## 1. Pętla re-renderów

### Przyczyna
1. **`TabWebview` sync → `updateTab` z `lastActiveAt: Date.now()`** przy każdym evencie webview (`did-navigate-in-page`, `page-title-updated`, favicon, media) — nawet gdy `url`/`title` bez zmian → nowy obiekt karty → re-render wszystkich subskrybentów → znów sync (`Maximum update depth exceeded`). Plik: `src/App.tsx` (`sync` w `useEffect` ~L307–321; deps ~L670).  
2. **`store.updateTab`** zawsze robił `map` bez porównania wartości.  
3. Wtórnie: `useMetrics` co 2 s + `setHotTabs` (przy aktywnym widgetcie) dokładało szum — osobny punkt 2.

### Poprawka (`d48b499`)
- Sync buduje `patch` tylko przy realnej zmianie `url`/`title`; **bez** bumpa `lastActiveAt`.  
- `updateTab` / media / favicon: no-op gdy wartość równa (`src/store.ts` ~L1428–1451).  
- `setHotTabs` zwraca `prev` gdy brak zmian; `TabChrome` memo.

### Pomiar
| | BASELINE | HOTFIX |
|--|----------|--------|
| total idle 30 s | 119 880 | 293 (suite) / **1** (early) |
| App | 3431 | 7 |
| Max depth | tak | **0** |

---

## 2. Metryki co 2 s

### Przyczyna
`electron/metrics.cjs` — `setInterval` 2 s zawsze od startu → IPC `shell:metrics` → `useMetrics` → stan UI nawet przy zminimalizowanym oknie / bez Task Mgr.

### Poprawka (`4219443`)
- Tryby: `subscribeLive` (Task Mgr / widżet) vs `subscribeDiscard` (usypianie, interwał ~15 s).  
- Stop gdy `live+discard == 0` lub `windowVisible === false` (`show`/`hide`/`minimize`/`restore`).  
- UI: `setHotTabs` tylko przy zmianie CPU-hot.

### Pomiar
CPU UI w tle: **6.03% → 0%**.

---

## 3. Listenery per karta na oknie

### Przyczyna
`electron-chrome-extensions` `addTab()` rejestruje `win.on('focus')` + `win.on('resized')` **per karta** → `MaxListenersExceededWarning` przy &gt;10 kartach. Guest WC ~88–96 listenerów (Chromium + nasze).

### Poprawka (`3932b93`)
`electron/window-events.cjs`: jeden prawdziwy listener `focus`/`resized` na okno, fanout do `Set` handlerów. `extensions.trackGuestTab` woła `patchWindow` przed `addTab`. **Bez** `setMaxListeners`.

### Inwentarz listenerów / karta (przed → po)

| Moduł | Na `BrowserWindow` | Na guest `webContents` | Uwagi |
|-------|--------------------|------------------------|-------|
| `wireGuestNavigation` | 0 → 0 | ~5 własne (`will-navigate`, `did-fail-load`, `did-navigate`, `did-finish-load`, `page-title-updated`) + security/popups/cert/ctx/shortcuts | Idempotent `__djxxrGuestWired` |
| `mouseNav.attachSideButtons` | 0–1 `app-command` (raz na host) | 1 `before-mouse-event` (+ opc. `before-input-event`) | Bez zmian liczby |
| `extensions.trackGuestTab` | **+1 focus +1 resized → 0 EE** (wpis do rejestru) | API chrome.tabs (wewnętrzne) | Główna poprawka |
| `ua-chrome` | 0 → 0 | 3 (`dom-ready`, `did-finish-load`, `devtools-closed`) | Bez zmian |
| `adblock` | 0 → 0 | **0** (sesja / blocker) | Bez zmian |

**Snapshot HOTFIX** (`openClose20`): EE okna `focus: 2`, `resized: 1`; rejestr fanout `focus: 15`, `resized: 15` (handlery, nie EE). Δ WC/IPC po open+close 20 = 0.  
Pozostałe ostrzeżenia `did-stop-loading` / `closed` (inne źródła, nie focus/resized) — poza tym hotfiksem.

---

## 4. Start

### Przyczyna
Top-level / synchroniczny boot: Ghostery listy, `electron-chrome-extensions`, openpgp/passwords, Tor touch, kompakcja historii — blokowały `whenReady` i first paint. Okno `show: true` od razu.

### Poprawka (`8dbab9d`)
- Timed `require` top-level (log `[boot] require times`).  
- `show: false` + `backgroundColor` motywu + `ready-to-show` → `show()`.  
- Ciężkie: `extensions.initChromeApi`, Ghostery engine, passwords — **po** show / deferred.

### Require times (przykład run3, ms)
Wszystkie top-level &lt; 5 ms po odchudzeniu (`tor: 3`, reszta 0–1). Heavy work w `heavyDoneAt` po oknie.

### Pomiar startu

| | Dev (Vite) | Build `dist` + electron | Packaged `--dir` |
|--|------------|-------------------------|------------------|
| whenReady | 55 ms | 54 ms | (zaszumione EPERM) |
| widoczne | 784 ms | **672 ms** | — |
| interaktywne | 3422 ms | 3413 ms | ~6756 ms† |

---

## 5. Pomiar gości + ładowanie stron

### Przyczyna
1. `getAppMetrics()` typ `Tab` ≠ 1:1 z kartami / webview → `guests.count: 1` przy 30 kartach wyglądało jak błąd pomiaru.  
2. Reddit/google: zbyt krótki settle (~18 s) przy 10 ciężkich originach + lazy webview (tylko aktywna karta ma proces) → fałszywe „nie załadowane”.

### Poprawka (`195feb1`, `9e6756e`)
- Mapowanie RAM/CPU gości przez `webContents.getOSProcessId()` / `getProcessId()` aktywnych webview.  
- `PERF_BENCH_LOAD_WAIT_MS` domyślnie **45 s**; zbierane `did-fail-load` + `tabLoadStatus`.  
- `scripts/perf-bench.cjs` w `electron-builder` `files` (pomiar packaged).

### Wynik
- `didFailLoad: []` w 3 mediana-runach; google/reddit z tytułem, `loadError: null`.  
- **Lazy tabs:** przy N kartach w store nadal **1** live `<webview>` → `guests.count === 1` i jeden OS pid to **architektura**, nie regresja mapowania. Snapshot pokazuje URL aktywnego gościa + mem procesu. Pełna liczba procesów = liczba jednocześnie zamontowanych webview (dziś 1).

---

## Smoke / jakość

| Check | Wynik |
|-------|--------|
| Smoke Round7 | `fail=0` / 18 |
| `npm run typecheck` | OK |
| `npm test` | OK |
| `npm run build` | OK |

---

## Commity (osobny na punkt)

| Commit | Punkt |
|--------|--------|
| `d48b499` | 1 — stop idle re-render loop |
| `4219443` | 2 — metrics only when watched / discard |
| `3932b93` | 3 — window focus/resized fanout |
| `8dbab9d` | 4 — show ASAP; defer heavy boot |
| `195feb1` + `9e6756e` | 5 — guest OS pid + load wait; PERF_BENCH w `--dir` |
| (ten raport) | docs |

---

## Jak powtórzyć

```powershell
npx vite --host 127.0.0.1 --port 5173
node scripts/run-perf-baseline.cjs
# build:
npm run build
$env:VITE_DEV_SERVER=$null; $env:PERF_BENCH=1; npx electron .
```
