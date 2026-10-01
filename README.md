# Moja Przeglądarka (djxxr)

Własna przeglądarka desktop na Electron + Vite + React (Windows).

## Wymagania

- **Windows** 10/11 (x64)
- **Node.js** 20 LTS lub nowszy (npm dołączony)
- Git (do współpracy / „Pobierz zmiany” w trybie dev)

## Dev

```bash
npm ci
npm run electron:dev
```

Otwiera Vite na `127.0.0.1:5173` i Electron z `VITE_DEV_SERVER`.

Same testy / typecheck:

```bash
npm run typecheck
npm test
```

## Build .exe (NSIS)

```bash
npm run electron:build
```

Installer trafia do `release/`.

Wydanie z `latest.yml` (aktualizacje):

```bash
npm run release
```

Szczegóły współpracy i publikacji: [docs/REPO.md](docs/REPO.md).

## Uwagi

- Sesja normalna: `persist:main`. Okna prywatne / Tor — osobne partycje (bez `persist:private`).
- Historia przeglądania nie jest w Zustand (tylko na dysku przez main).
