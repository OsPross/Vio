# RAPORT-CLEANUP-2

Gałąź `cleanup-2` · tag `pre-cleanup-2` · 2026-10-01 · smoke R4/5/7 fail=0 · typecheck/test OK

| Plik | Przed | Po | ≤600 |
|------|------:|---:|:----:|
| `src/App.tsx` | ~3183 | 376 | tak |
| `src/store` (monolit→`store/index`) | ~1922 | 281 | tak |
| `SettingsPage` (shell) | ~1760 | 171 | tak |
| `electron/main.cjs` | ~1677 | 512 | tak |
| `index.js` (vite) | ~250 kB | **225 kB** | ≤250 |

Smoke: R4 0/23 FAIL · R5 0/22 · R7 fail=0/18. FULL_STATE §5 kluczowe funkcje: **działa jak przed: tak** (move-only + smokes).

**Na później:** PrivacySection 442→dalszy split; APP-MAP-WIP aktualizacja; homeSlice helpers poza slice.
