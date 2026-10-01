# RAPORT-PERF-2

Data: 2026-10-01 · Vite 5173 · idle 60s / bg 30s / max 10 kart · `tmp-verify/perf2/{baseline,final}.json` · smoke7 fail=0/18

| Metryka | Przed | Po | Cel | Osiągnięty |
|--------|------:|---:|-----|:----------:|
| Okno widoczne | 855 ms | 614 ms | — | tak |
| Czas do interakcji | 3466 ms | 3542 ms | <1500 ms | **nie** |
| Main RSS (pusta) | 286 MB | 140 MB | <200 MB | **tak** |
| UI RSS @10 kart | 162 MB | 160 MB | — | tak |
| index.js (build) | 795 kB | 250 kB (+chunks) | mniejszy | **tak** |
| MaxListeners 30+5 | ryzyko | 0 | 0 | **tak** |
| Adblock przed 1. req | true | true (skip rebuild) | bez regresji | **tak** |

Przyczyny: TTI — Vite/App (lazy settings nie ściął interactive); RAM — `adblock.init` po `privacy-config` mimo `engine.bin`; listeners — observeTab bez cleanup + późny patch; bundle — brak `manualChunks`.
Na później: TTI packaged (&lt;1,5s) defer motion/lucide; split DownloadsUI; Chromium native poza V8.
