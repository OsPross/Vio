# Raport — baseline wydajności (PERF_BENCH)

Data pomiaru: 2026-10-01  
Środowisko: Windows, Electron 44.5, dev (`!app.isPackaged`), UI z Vite `127.0.0.1:5173`  
Uruchomienia: **3×** (`node scripts/run-perf-baseline.cjs`), scenariusz idle 10 kart = **10 min** (`PERF_BENCH_IDLE_MS=600000`), CPU w tle **60 s** (`PERF_BENCH_IDLE_BG_MS=60000`)  
Wynik surowy (mediana): `tmp-verify/perf/baseline-median-latest.json`, kopie runów: `baseline-run{1,2,3}.json`  
**Tylko pomiar** — bez optymalizacji i bez zmian zachowania poza flagą `PERF_BENCH=1` (React Profiler, marki, `__DJXXR_STORE__` już było w dev).

---

## Mediana metryk (3 przebiegi)

| Kategoria | Metryka | Mediana | Jednostka / uwagi |
|-----------|---------|---------|-------------------|
| **Start** | launch → `app.whenReady` (main) | 1669 | ms |
| | launch → okno widoczne | 4172 | ms |
| | launch → strona startowa interaktywna | 4988 | ms |
| **RAM — pusta strona startowa** | łącznie procesów | 657 | MB WS |
| | renderer UI | 154 | MB |
| | Browser (main) | 323 | MB |
| | GPU | 123 | MB |
| | goście (Tab) | 0 | MB |
| | CPU łącznie (snapshot) | 3.85 | % |
| | CPU renderer UI | 0.89 | % |
| | CPU GPU | 2.82 | % |
| **RAM/CPU — 10 kart** (youtube, wikipedia, reddit, github, onet, wp, allegro, x.com, google, example) | łącznie | 1405 | MB |
| | renderer UI | 309 | MB |
| | goście (suma Tab) | 389 | MB |
| | Browser | 253 | MB |
| | GPU | 153 | MB |
| | CPU łącznie | 7.74 | % |
| | CPU renderer UI | 5.72 | % |
| | czas otwarcia 10 URL | 18037 | ms (do snapshotu po ~18 s ładowania) |
| **10 kart po 10 min bezczynności** | łącznie | 1170 | MB |
| | renderer UI | 301 | MB |
| | goście | 161 | MB |
| | CPU łącznie | 7.84 | % |
| **30 kart** | łącznie | 1169 | MB |
| | goście (count w metryce) | 1 | proces Tab w snapshotcie* |
| | CPU łącznie | 8.73 | % |
| **CPU w tle (blur, 60 s)** | łącznie (mediana próbek co 2 s) | 8.995 | % |
| | renderer UI | 6.03 | % |
| | goście Tab (agregat) | 0.87 | % |
| | Browser | 1.21 | % |
| | GPU | 0.625 | % |
| **Karty UI** | przełączenie karty (klik → 2× rAF) | 21.15 | ms |
| | nowa karta (2× rAF) | 21.80 | ms |
| **FPS / long tasks** | menu ≡ (1.2 s) | 140.8 | FPS; long tasks: 0 |
| | scroll historii (40 kroków, po seed 5000) | 147.2 | FPS; long tasks: 0 |
| | churn 30× `setActive` (motion) | 38.5 | FPS; long tasks: 0 |
| | reorder paska kart (proxy drag, motion layout) | 95.1 | FPS; long tasks: 0 |
| **React Profiler (PERF_BENCH)** | re-renderów łącznie, 30 s idle | 119 880 | count |
| | re-renderów `App`, 30 s idle | 3431 | count |
| | re-renderów suma `Tab:*`, 30 s idle | 116 883 | count |
| | re-renderów łącznie, 5 s po 1× load strony | 20 840 | count |
| | re-renderów `App`, 5 s load | 565 | count |
| | re-renderów suma `Tab:*`, 5 s load | 20 319 | count |
| **Listenery** | Δ webContents po open+close 20 kart | 0 | count |
| | Δ listenerów webContents | 0 | |
| | Δ ipcMain listeners | 0 | |
| **Dysk / persist** | userData | 1128 | MB |
| | `history/visits.jsonl` (= history.jsonl w raporcie) | 1 064 481 | B (~1.0 MB, po seed 5000) |
| | cache (Cache + Code/GPU cache) | 376 | MB |
| | localStorage `moja-przegladarka-v8` | ~10 598 | B (chars×2) |
| **Build** | chunki JS+CSS (dist/assets) | 1021 | KB |
| | `index-BHG__zzI.js` | 789 | KB |
| | `index-CUoWAN_3.css` | 232 | KB |

\* `app.getAppMetrics()` na Win/Electron 44 często scala gości jako jeden typ `Tab` lub nie mapuje 1:1 do liczby `<webview>`; RAM gości rośnie przy 10 kartach, przy 30 kartach snapshot pokazał `guests.count: 1` — traktować jako ograniczenie pomiaru, nie jako faktycznie jeden proces.

---

## 10 największych podejrzanych miejsc (bez napraw)

| # | Plik / obszar | Co | Dlaczego podejrzane |
|---|---------------|-----|---------------------|
| 1 | `src/App.tsx` (useEffect → `setHotTabs` + `useMetrics`) | Co ~2 s aktualizacja stanu z metryk CPU kart | Przy wielu kartach i aktywnym `metricsActive` (np. widget statystyk na home) ciągłe `setState` → tysiące re-renderów Profiler (`Tab:*` ~3400 / 30 s / kartę przy 30 kartach idle) |
| 2 | `src/App.tsx` + `motion/react` (`LayoutGroup`, `AnimatePresence`, `layoutId="tab-active-indicator"`) | Animowany pasek kart | Mediana FPS przy churn 30 przełączeń **38.5** vs menu **140** — layout/spring na każdej aktywnej karcie |
| 3 | `src/components/PerfGate.tsx` + `Tab:*` w `App.tsx` | Profiler owija zawartość każdej karty | Przy benchu mierzy realny koszt; struktura utrwala N profili przy N kartach (overhead pomiaru + głębokie drzewo w buttonie) |
| 4 | Logi bench (`Maximum update depth exceeded`) podczas idle 10 kart | Pętla React update | W trakcie runów w konsoli powtarzający się błąd głębokości aktualizacji przy wielu webview — wskazuje na efekt/store synchronizowany z gośćmi bez stabilnych deps |
| 5 | `electron/main.cjs` (`did-attach-webview` → `wireGuestNavigation`, `mouseNav.attachSideButtons`, `extensions.trackGuestTab`) | Listenery per guest | W logach: `MaxListenersExceededWarning` na `focus`/`resized` okna przy >10 kartach; pojedynczy guest w snapshotcie miał **~96** listenerów `webContents` |
| 6 | `electron/metrics.cjs` | `setInterval` 2 s, `getAppMetrics` + push do UI | Stały tick main + IPC nawet przy jednym konsumerze; koreluje z CPU renderer UI w tle (~6%) |
| 7 | `dist/assets/index-BHG__zzI.js` (~789 KB) | Jeden duży chunk UI | Brak code-splittingu (Vite warning >500 KB); wpływa na cold start dev/prod i pamięć renderera |
| 8 | Scenariusz 10 ciężkich originów (youtube, reddit, x.com, …) | Procesy gości + sieć | RAM **~1.4 GB** po otwarciu; część URL fail (reddit/google) — nadal koszt IPC/adblock/extensions |
| 9 | `scripts/perf-bench.cjs` → `seedHistory5000()` + `HistoryPage` scroll | 5000 wpisów w `visits.jsonl` | Plik ~1 MB; scroll test OK pod FPS, ale query/render listy historii to osobny koszt przy realnym użyciu |
| 10 | `src/store.ts` (`persist` `moja-przegladarka-v8`) + `App.tsx` session persist (`persistSessionNow` na zmiany tabów) | Zapis stanu chrome | Przy masowej churn kart I/O i serializacja; userData **~1.1 GB** łącznie z cache/historią bench |

---

## Jak powtórzyć

```powershell
npm run build   # chunk sizes
npx vite --host 127.0.0.1 --port 5173
node scripts/run-perf-baseline.cjs
```

Env: `PERF_BENCH=1` ustawia runner; pojedynczy run: `PERF_BENCH=1 PERF_BENCH_QUIT=1 PERF_BENCH_RUN=1 npx electron .`

---

## Commity

| Message | Zakres |
|---------|--------|
| `perf: baseline benchmark` | `scripts/perf-bench.cjs`, `scripts/run-perf-baseline.cjs`, probe PERF (`perfProbe`, `PerfGate`, main/preload), raport |
