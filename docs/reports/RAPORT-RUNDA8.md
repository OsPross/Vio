# RAPORT-RUNDA8

Data: 2026-10-01 · zakazy: Tor/crypto/privacy/`persist:private`/historia-Zustand — nietknięte.

| # | Problem | Przyczyna | Poprawka | Wynik |
|---|---------|-----------|----------|-------|
| 1 | X1/X2 fizyczna mysz (Win) | `app-command` nie pada; sama ścieżka R7 niewystarczająca. Kanał: `before-mouse-event` (guest=strona, host=UI). | `mouse-nav.cjs` + `navigateHistory(tabId)` 150 ms; guest `wc.goBack` w main; bez `preventDefault` na stronie | [T] SendInput fail=0/10 · [K] |
| 2 | Lista notatek ~90 px | `.hw-notes-list-pane { min-width:0 }` + tytuł `inline-flex` (ellipsis); wide &lt;520 | `--notes-list-w` 220–280 (min 200), `flex:0 0`, wide≥520, `.hw-notes-list-title-text` | [T] listW=240 @800/1280; @360 lista pełna · [K] |

**Diagnoza myszy (`DJXXR_DEBUG_MOUSE=1`):** nad stroną → `before-mouse:guest`; nad omnibox/kartami → `before-mouse:host`; `app-command` = 0.

**Commity:** `26b1b0e` (mysz) · `4db0980` (notatki)  
**typecheck / notes.test / eslint (dotknięte):** OK · **Smoke Round7:** fail=0 / 18

Na później: po `about:*`→URL nowy webview bez historii (`restore-web` canBack=false).
