# Raport — cleanup (stabilność i czysty kod)

Data: 2026-10-01  
Zakazy zachowane: Tor daemon/fail-closed/mosty, crypto sejfu, privacy presets (logika w Settings/store bez zmian zachowania), `persist:private`, historia w Zustand.

---

## Smoke baseline (krok 0)

| Smoke | Wynik |
|-------|--------|
| Round4 | 23 checks, **0 FAIL** |
| Round5 | 22 checks, **0 FAIL** |
| Round7 | 18 checks, **fail=0** |

Logi: `tmp-verify/cleanup/smoke{4,5,7}-baseline.log`  
Po TabWebview extract: smoke7 ponownie **fail=0**.

---

## Testy dodane przed refaktorem

| Plik | Zakres |
|------|--------|
| `test/store.test.mjs` | karty, closedTabs, session restore, persist helpers |
| `test/shortcuts-registry.test.mjs` | allowlista w inputach |
| `test/popup-policy.test.cjs` | OAuth / _blank / Tor / gesture |
| `test/partitions.test.cjs` | `private-*` nigdy `persist:` |
| `test/ua-chrome.test.cjs` | brands Client Hints |
| `test/tab-navigate.test.mjs` | tytuły / draft / internal URL |

Istniejące: url-display, bangs, omnibox-ghost, home-widgets, notes — bez regresji.  
`npm test` / `typecheck` / `lint` (0 errors, warnings OK).

---

## Usunięte (z dowodem)

| Co | Dowód | Commit |
|----|--------|--------|
| `shell:set-proxy` + `preload.setProxy` | brak wywołań w `src/`; tylko martwy no-op w main | `6d419a1` |
| `torProxyEnabled` | tylko typ/default w store, zero odczytów UI | `6d419a1` |
| `presetHomeWidgets` | tylko definicja + test; zwracała `[]` | `6d419a1` |
| `scripts/probe-*`, `patch-downloads-ipc.cjs` | nie w `package.json` / smoke | `cccf1c9` |
| `RAPORT-*.md` z roota | przeniesione → `docs/reports/` | `8db1534` |
| `src/lib/privacyPresets.ts` | knip + zero importów (presety inline w Settings) | (ten raport) |

**Zostawione celowo**

| Co | Dlaczego |
|----|----------|
| `torProxyUrl` + pole w Settings | nadal przekazywane do `torStart` — zmiana UI = zmiana zachowania |
| `homeLayout` / `homeAlign` | nadal klasy CSS w `HomeSearch` / preview |
| Ghostery / openpgp / electron-chrome-extensions | knip fałszywie „unused” (require z main) |
| Privacy preset values w Settings | ban: nie ruszać logiki presetów |

---

## Mapa App.tsx

| | Linie |
|--|-------|
| **Przed** | ~3895 |
| **Po (obecnie)** | ~3096 |
| Cel | &lt; 300 |

### Przed (obszary → linie, szacunek)

| Obszar | ~linie |
|--------|--------|
| TabWebview + visit/favicon/hasła | ~690 |
| App state / effects / IPC | ~900 |
| Shortcuts | ~200 |
| Omnibox / navigate | ~200 |
| Tab strip + chrome JSX | ~1200 |
| Dialogi / find / pages | ~500 |

### Wyciągnięte

| Moduł | Linie |
|-------|-------|
| `src/features/tabs/TabWebview.tsx` | ~658 |
| `src/lib/tabNavigate.ts` | ~70 |
| `src/lib/persistMerge.ts` | ~130 |
| `electron/lib/{popup-policy,ua-brands,partition-names,atomic-write,logger}.cjs` | helpers |

Mapa robocza: `docs/reports/APP-MAP-WIP.md`.

---

## Największe pliki (przed → po)

| Plik | Przed (cleanup start) | Po |
|------|----------------------|-----|
| `src/App.tsx` | ~3683–3895 | **~3096** |
| `src/store.ts` | ~1911 | **~1922** (persist safety +) |
| `src/components/SettingsPage.tsx` | ~1544 | **~1760** (prettier earlier) |
| `electron/main.cjs` | ~1596 | **~1591** |

Cel „żaden plik &gt; 600” — **nie osiągnięty** dla App/store/Settings/main (kolejne rundy split).

---

## Stabilność (zrobione)

- `ErrorBoundary` — settings, sidebar, about:*  
- Atomic write — history + notes  
- Main: `uncaughtException` / `unhandledRejection` → logger (`userData/logs`)  
- Persist: corrupt JSON → `.corrupt-*` backup + defaults  

## Stabilność (jeszcze nie)

- Helper liczący listenery przed/po 20 kart (poza perf-bench openClose20)  
- Atomic write bookmarks/vault metadata  
- Pełna migracja `console.*` → logger  
- Typowane kanały IPC w jednym pliku  
- `"type": "module"` (MODULE_TYPELESS nadal w testach)  
- Store slices / Settings sections / `ipc/register-*.cjs`  
- `useShallow` wszędzie w App  

---

## Lint / format

- `eslint.config.mjs` — typescript-eslint, react-hooks (exhaustive-deps **warn**), no-unused-vars **warn**  
- Prettier — commit `style: prettier format-only for src/`  
- `npm run lint` → 0 errors  

---

## Perf (informacyjnie, bez optymalizacji)

Porównanie z `docs/reports/RAPORT-PERF-BASELINE.md` / hotfix (mediana już z rundy PERF-HOTFIX):

| Metryka | BASELINE | HOTFIX (po perf) | Cleanup (ten round) |
|---------|----------|------------------|---------------------|
| Re-rendery idle 30 s | 119 880 | 293 / early 1 | nie mierzono ponownie (refactor only) |
| whenReady / widoczne | 1669 / 4172 | 55 / 784 | bez celowych zmian startu |
| CPU UI w tle | 6% | 0% | — |

Cleanup **nie** wdrażał nowych optymalizacji; oczekiwany wpływ na perf ≈ 0. Pełny `perf-bench` 3× można odtworzyć osobno po dokończeniu splitu App.

---

## Commity (wybrane)

| Commit | Temat |
|--------|--------|
| `a752ad9` | testy safety-net |
| `3d11942` / `1d30299` | ESLint+Prettier / format-only |
| `8db1534` | reports → docs/reports |
| `cccf1c9` | usunięcie probe/patch |
| `6d419a1` | set-proxy / torProxyEnabled |
| `b56bf87` | extract TabWebview |
| `a994efe` … `1ec439f` | ErrorBoundary, atomic IO, logger, persist recovery |
| `6720dd7` | tabNavigate |

---

## Status vs brief

| Punkt | Status |
|-------|--------|
| 0 Siatka + testy + lint | **DONE** |
| 1 Martwy kod | **DONE** (główne); knip nadal raportuje false positives dla electron |
| 2 Podział App/store/Settings/main | **WIP** (TabWebview + helpers; App nadal ~3k) |
| 3 Spójność IPC/logger/ui/module/strict | **częściowo** (logger, persistMerge; reszta otwarta) |
| 4 Stabilność | **większość DONE**; listener helper / pełny logger open |
| 5 Docs | **ARCHITECTURE + FULL_STATE + ten raport** |

**Następna sesja (sugerowana):** wyciągnąć `useIpcEvents` + `useShortcuts` + `TabStrip` z App; slices store; Settings sections; `ipc/register-*.cjs`; potem smoke R4/5/7 + opcjonalnie perf-bench 1×.
