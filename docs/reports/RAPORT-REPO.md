# RAPORT-REPO

Data: 2026-10-02 · bez push / bez tworzenia GitHub (instrukcja: `docs/REPO.md`)

| Punkt | Wynik |
|-------|--------|
| 1. gitignore + README + REPO.md | OK · skan historii: brak `.env`/PEM/haseł; w repo jest publiczny `torbrowser.asc` (OK) |
| 2. Pobierz zmiany (dev) | OK · Ustawienia→Zaawansowane; dirty/non-ff → stop |
| 3. electron-updater | OK · feed = publiczne `djxxr-releases` (bez tokenu w .exe); `npm run release` + `GH_TOKEN` tylko lokalnie |
| 4. Test [T] | OK · `test-dev-sync`: behind=1, autor Kolega, ff-pull; updater: `dev-app-update.yml` → ERR_CONNECTION_REFUSED (kontrolowany) |

**Bezpieczna opcja updatera (wybrana):** osobne publiczne repo Releases — updater czyta `latest.yml` bez auth; prywatne `djxxr` zostaje tylko na kod. Token GitHub nigdy w instalatorze.

**Na później:** `history-ui-check.png` w git (screenshot); podmienić `REPLACE_WITH_YOUR_GITHUB_USER` po utworzeniu repo.
