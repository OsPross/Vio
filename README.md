# Moja Przeglądarka

Własna aplikacja desktop (Electron) — sidebar, pasek adresu/szukaj, karty, WebView z sesją Google (Gmail itd.).

## Dev

```bash
npm install
npm run electron:dev
```

## Build .exe

```bash
npm run electron:build
```

Installer w `release/`.

## Uwagi

- Sesja stron (Google) siedzi w `partition: persist:main` — logujesz się raz.
- SearXNG: odpal lokalnie i ustaw URL w Ustawieniach.
- To osobny projekt od rozszerzenia Brave (`moj_brave`).
