# Raport — weryfikacja po PERF-HOTFIX (RAPORT-PERF-VERIFY)

Data: 2026-10-01  
Środowisko: Windows, Electron 44.5, Vite `127.0.0.1:5173`  
Zakazy zachowane: Tor daemon/fail-closed/mosty, crypto sejfu, privacy presets, `persist:private`, historia w Zustand.

Pomiary: `scripts/probe-perf-verify-tabs.cjs`, `scripts/probe-perf-verify-adblock.cjs`, `PERF_BENCH` (idle skrócony do 3–5 s; aktywacja każdej karty).  
Artefakty: `tmp-verify/perf/baseline-20261001-223326.json`, logi `tmp-verify/perf-verify-*.log`.

---

## 1. Karty w tle — czy żyją?

### Przyczyna (HOTFIX)
`keep = perfLazyTabs ? tylko aktywna : wszystkie` → przy włączonym lazy **każde przełączenie odmontowywało** `<webview>` nieaktywnych kart (YouTube/formularze ginęły). Raport HOTFIX błędnie traktował „1 live webview” jako OK.

### Dowód (żywa aplikacja, `PERF_VERIFY_TABS=1`)
| Test | Wynik |
|------|--------|
| Link w tle (`newTab(..., { background: true })`) | `bgWebviewMounted: true`, `activeUnchanged: true`, tytuł „Example Domain” **bez** kliknięcia |
| Po odwiedzeniu → przełącz → wróć | `stillMountedWhileBackground: true`, `sameWcAfterReturn: true`, `markSurvived: true` (JS mark na stronie) |
| `ok` | **true** |

### Poprawka
- `keep = active \|\| !discarded` (Chrome-like; CSS ukrywa, nie unmount).
- Lazy = tylko **sesja przy starcie** (`discarded` na nieaktywnych gdy `perfLazyTabs`).
- `perfDiscardTabs`: timer nadal odmontowuje po bezczynności; **pomija** karty z `playing` / `hasVideo` (audio/PiP).
- `perf-bench`: reset sesji + **aktywacja każdej** z 10/30 kart przed pomiarem.

### RAM (po aktywacji wszystkich gości)

| Scenariusz | Karty | Guest WC | Guest procesy | Guest RAM | RAM łącznie |
|------------|------:|---------:|--------------:|----------:|------------:|
| empty home | 1 | 0* | 0 | 0 | 690 MB |
| **10 kart** | 10 | **10** | **10** | **1935 MB** | **3067 MB** |
| **30 kart** | 30 | **30** | **30** | **4716 MB** | **5998 MB** |

\* empty = `about:home` bez webview.  
Porównanie do HOTFIX („1 live webview / ~243 MB gości”) — tam mierzono architekturę unmount, nie Chrome-like keep.

---

## 2. Adblock / hasła / rozszerzenia po deferze

### Przyczyna
`adblock.init()` / passwords / `initChromeApi` w `setImmediate` **po** `show` → pierwsza nawigacja gościa mogła iść bez Ghostery.

### Dowód
| | Cold (brak `engine.bin`) | Warm (cache) |
|--|-------------------------|--------------|
| Engine ready | init ~638 ms, potem gate | **deserialize 59–74 ms** przed oknem |
| `readyBeforeFirstRequest` | **true** (delta +435 ms) | **true** (BBC; first blocked `cdn.optimizely.com`, delta +2720 ms bo nawigacja później) |
| `blockedCount` (bbc.com) | — | **12** |
| Przykłady zablokowanych | — | `pagead2.googlesyndication.com/.../adsbygoogle.js`, `cdn.optimizely.com/...`, `uk-script.dotmetrics.net/...`, `a1.api.bbc.com/event?...` |

### Poprawka
- Sync `loadCachedEngineSync()` (`engine.bin`) **przed** `createWindow`.
- Przy braku cache: `webRequest` boot-gate ≤ **1,5 s** + log; UI może być widoczne wcześniej.
- Po show: extensions + passwords + ewentualny init/refresh list; zapis `engine.bin` po `fromLists`.
- `getRecentBlocked('global')` agreguje wszystkie tabId.

Autofill/content scripts: `passwords.init` + `initChromeApi` nadal zaraz po show (przed ciężkim refresh list przy cache hicie); engine z dysku jest gotowy przed pierwszym requestem gościa.

---

## 3. MaxListenersExceededWarning (`did-stop-loading` / `closed`)

### Przyczyna
Jak `focus`/`resized`: `electron-chrome-extensions` `observeWindow` → `once('closed')`; `observeTab` → `did-stop-loading` (oraz host WC z `createTab` placeholder). Przy churn kart EE >10 **bez** `setMaxListeners`.

### Poprawka
- `window-events.cjs`: fanout także dla **`closed`** + patch `once`/`off`.
- Nowy `webcontents-events.cjs`: fanout eventów `observeTab` (w tym `did-stop-loading`); patch w `trackGuestTab` + host WC przy `createWindow`.

### Dowód
- Probe: EE `focus: 2`, `resized: 1`, `closed: 2`; fanout registry `closed/focus/resized` ≤2.
- Bench: `before20Tabs.windowFanout` EE focus/resized/closed ≤2; **brak** `MaxListenersExceededWarning` w logu verify-bench2.
- Guest fanout: `did-stop-loading` w registry = 1–2 (nie N×EE).

---

## Smoke / CI

| | |
|--|--|
| `npm run typecheck` | OK |
| `npm test` | OK |
| `npm run build` | OK |
| Smoke Round7 | **fail=0** / 18 (`tmp-verify/smoke7-verify.log`) |

---

## Commity (osobno na punkt)

1. Karty keep-alive + discard media guard + perf-bench activate-all  
2. Adblock engine cache + boot-gate + timing  
3. Fanout `closed` / `did-stop-loading` (window + webcontents)
