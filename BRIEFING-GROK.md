# Briefing dla Groka — Vio (cały projekt)

**Data:** 2026-10-21  
**Właściciel / user:** djxxr  
**Ścieżka lokalna:** `C:\Users\djxxr\Desktop\moja_przegladarka`  
**Produkt:** **Vio** — prywatna przeglądarka desktopowa (Windows first, Linux też)  
**To NIE jest fork Chromium** — Electron + własny React UI; strony w `<webview>`.

| | |
|---|---|
| npm name | `moja-przegladarka` |
| productName | **Vio** |
| appId | `local.djxxr.przegladarka` |
| wersja | **0.1.2** |
| Persist Zustand | klucz `moja-przegladarka-v8` |
| userData (Windows) | `%APPDATA%\moja-przegladarka` (folder **nie** nazywa się `Vio`) |

---

## 0. Jak z Tobą (Grok) pracować

- User **nie czyta kodu** — na końcu zadania tłumacz **prosto po polsku**, co się zmieniło w używaniu przeglądarki.
- Po sensownych zmianach w kodzie: **commit + `git push origin main`** (nie czekaj na „zrób push”). Cel: bot Discord w kanale **`#changelog-vio`** dostaje commit z GitHuba.
- Nie pushuj force; nie commituj sekretów (`.env`, `GH_TOKEN`, vault, tokeny).
- Przed „done”: `npm run typecheck` + `npm test`. Po zmianach w `electron/*.cjs` — **restart Electron** (HMR tylko renderer).
- Po zmianach w kodzie: `graphify update .` jeśli Graphify jest dostępne (często nie ma w PATH — OK).

### Twarde NIE RUSZAĆ (bez wyraźnej zgody usera)

1. **Tor** — `electron/tor*.cjs`, `tor-keys/`, Tor w downloads/favicon/session/`useTorSession`.
2. **Sejf haseł** — `passwords.cjs`, most autofill w `webview-preload.cjs` (bez zmiany crypto).
3. **Privacy presets** — `privacy.cjs` + ich ustawienia.
4. **Partycje** — `persist:private` **zabronione**; `partition-names.cjs`. Tor/private nigdy przez `defaultSession` / `persist:main`.
5. **UA** — nigdy nie dodawać `"Electron"` do User-Agent (psuje logowanie Google).
6. Nie luzować `create-window.cjs` (contextIsolation, sandbox, nodeIntegration false) ani `assertFromApp`.

---

## 1. Repo, Discord, releasy

### GitHub

| Repo | Rola |
|------|------|
| **`OsPross/Vio`** (private) | Kod źródłowy. Remote: `origin` → branch **`main`**. |
| **`OsPross/vio-releases`** (public) | Tylko instalatory / `latest.yml` dla electron-updater. |

Lokalnie bywa stary branch `cleanup-2` / `master` — **pracuj na `main`**.

### Discord changelog (`#changelog-vio`)

- **Nie ma bota Discord w tym repo.**  
- Workflow: agent/user robi **commit + push na `main`** → GitHub (webhook / GitHub→Discord) publikuje commit w **`#changelog-vio`**.  
- Reguła Cursor: `.cursor/rules/commit-push-changelog.mdc` — domyślnie commit+push po skończonym tasku.  
- Message w stylu: `feat:` / `fix:` / `chore:`.

### Releasy / auto-update

- `npm run release` potrzebuje **`GH_TOKEN` w env** (nigdy w repo) — publikacja do `vio-releases`.  
- GitHub Actions: secret `RELEASES_TOKEN`; tagi `vX.Y.Z` → draft release (exe, rpm, AppImage, flatpak) → ręcznie **Publish**.  
- Szczegóły: `docs/REPO.md`.  
- Logowanie Google zależy od UA — **nie** wkładać Electron do UA.

---

## 2. Stack

| Warstwa | Tech |
|---------|------|
| Shell | Electron **^44.5** (main = CommonJS `.cjs`) |
| Builder | electron-builder ^26 — NSIS (Win), rpm + AppImage (+ flatpak w release) |
| Updater | electron-updater ^6.8 → GitHub `vio-releases` |
| UI | React **19**, Vite **6**, TypeScript **5.7** `strict` |
| Stan | Zustand **5** (persist) |
| Motion / ikony / DnD | motion 13, lucide-react, @dnd-kit |
| Adblock | @ghostery/adblocker-electron |
| Extensions | electron-chrome-extensions ^4.9 |
| Tor verify | openpgp |
| Automation | `ws` (Soul WebSocket) |

**Brak:** React Router, SQLite, CI.

### Komendy

| Task | Command |
|------|---------|
| Dev | `npm run electron:dev` (Vite `127.0.0.1:5173` + Electron) |
| Typecheck | `npm run typecheck` |
| Testy | `npm test` (łańcuch `test/*`) |
| Lint / format | `npm run lint` / `npm run format` |
| Build UI | `npm run build` → `dist/` |
| Instalator Win | `npm run electron:build` → `release/` |
| Linux | `npm run electron:build:linux` → `release-linux/` |
| Release | `npm run release` (`GH_TOKEN`) |
| Tor/vault QA | `node scripts/test-tor-leaks.cjs`, `test-tor-wiring.cjs`, `test-passwords*.cjs` |

---

## 3. Architektura (skrót)

```
electron/main.cjs
  ├─ ipc/register-*.cjs + channels.cjs
  ├─ windows/create-window.cjs, wire-guest.cjs
  └─ domeny: tor, passwords, privacy, adblock, session, extensions, updater, …
preload.cjs → window.shell
webview-preload.cjs → window.__djxxrPw (tylko most autofill)
Renderer: App.tsx → AppChrome → TabStrip / TabWebview / BrowserChrome / settings / widgets
```

**IPC:** UI → `window.shell.*` → preload → `register-*.cjs`. Nowy kanał = **4 miejsca:**  
`channels.cjs`, `ipc-channels.ts`, `preload.cjs`, `vite-env.d.ts`.

### Partycje

| Partition | Dysk? | Użycie |
|-----------|-------|--------|
| `persist:main` | tak | normalne karty |
| `private-<uuid>` | nigdy | okno prywatne |
| `tor-<uuid>` | nigdy | Tor → SOCKS5 lokalny tor; wipe |
| `persist:private` | **FORBIDDEN** | legacy, purge przy starcie |

### Store (renderer)

- `src/store/index.ts` — slices: tabs, settings, session, ui, home.  
- Historia przeglądania **nie** w Zustand — `electron/history.cjs` na dysku.  
- Domyślne ustawienia: `DEFAULT_SETTINGS` w `constants.ts`; merge: `persistMerge.ts`.

### Gdzie zmieniać co

| Chcesz | Pierwszy plik |
|--------|----------------|
| Webview / karty | `src/features/tabs/TabWebview.tsx` |
| Pasek kart | `TabStrip.tsx` |
| Omnibox | `BrowserChrome.tsx`, `tabNavigate.ts`, `omniboxGhost.ts`, `bangs.ts` |
| Ustawienia | `src/components/settings/sections/*` |
| Home / widżety | `src/widgets/*`, `homeSlice.ts` |
| i18n | `src/i18n/` + `locales/pl.json` / `en.json` |
| Soul | `electron/lib/automation.cjs`, `docs/automation-api.md` |

Więcej: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `PROJECT_OVERVIEW.md`, `docs/FULL_STATE.md` (częściowo **przestarzały** — sprzed rebrandu Vio / Soul / i18n).

---

## 4. Funkcje produktu (stan 2026-10)

### Tryby

- Normalne okno (`persist:main`).  
- Okno prywatne (ephemeral partition).  
- Tor (izolacja + embedded/system tor, mosty, NEWNYM / „Nowa tożsamość”).

### UI chrome

- Omnibox, bangs (`!yt` itd.), ghost suggest.  
- Menu aplikacji, find bar, zoom, print/PDF.  
- Sidebar (rail aplikacji).  
- Shield (prywatność per-domena), extensions flyout, downloads panel — wspólny styl flyoutów.  
- Crash restore (oferta przywrócenia kart).  
- Side panel resize; mobile Gmail UA w wybranych kontekstach.

### Home / personalizacja

- `homeChrome`: clock, search, shortcuts (free-place na siatce).  
- Widżety: weather, notes, todo, calendar, recent, downloads, resources, **Spotify Now Playing** (PKCE), gallery…  
- `PersonalizeSheet`: Wygląd / Układ / Widżety / Zegar+szukajka.  
- Stary szczegółowy briefing home: `BRIEFING-GROK-HOME.md` (2026-09-30) — nadal przydatny do layoutu/snap.

### Ustawienia (sekcje)

Ogólne, Home, Search, Wygląd, Sidebar, Shortcuts, Privacy, Adblock, Hasła, Performance, Zasoby (task mgr), Zaawansowane (+ Soul, updater, Pobierz zmiany w dev).

### Adblock / privacy

- Ghostery + listy lokalne; wyjątki (collapsible UI).  
- Presety prywatności: Standardowa / Ścisła / Własna.  
- Color picker in-app (nie natywny Windows).

### Hasła

- Sejf AES-GCM + scrypt v2, plik vault w userData.  
- Autofill tylko HTTPS / ścisły origin; UI w `PasswordsPanel`.

### Rozszerzenia

- Chrome Web Store / CRX / folder; consent bar; Tor **bez** rozszerzeń.  
- Guest IPC install tylko z URL Web Store + consent.

### Google login

- W normalnej karcie; UA jak Chrome; bez „Electron” w UA.  
- Historia wielu rund w `docs/reports/RAPORT-GOOGLE-LOGIN*.md`.

### Soul (automation API v2)

- Off by default: Settings → Zaawansowane → Soul.  
- WS tylko `127.0.0.1:47821+`, token w `automation.json`, dialog zgody.  
- Tylko normalne karty `persist:main` — **nie** Tor / private / about:*.  
- Brak eval JS, brak fill pól hasła.  
- Ikona Soul w toolbarze gdy klient podłączony; STOP; log komend.  
- Spec: **`docs/automation-api.md`**. Testy: `test/automation.test.cjs`, `scripts/automation-test.cjs`.

### i18n UI (PL / EN) — ważne, świeże

- Setting: `settings.uiLocale: 'pl' | 'en'` (domyślnie `'pl'`).  
- Przełącznik: Ustawienia → Ogólne → **Język interfejsu**.  
- Katalogi: `src/i18n/locales/pl.json` + `en.json` (~1185 kluczy, parity test `test/i18n-keys.test.mjs`).  
- API: `t` / `useT` z `src/i18n/` — **`core.ts` bez store** (unikaj cykli: liby importują `i18n/core`, nie barrel).  
- Main: `electron/lib/locale.cjs` + IPC `shell:set-ui-locale` (context menu / dialogi Electron).  
- **`searchLanguage`** (język wyników wyszukiwania) = **osobna** opcja — nie mylić z UI locale.  
- Placeholdery omnibox/home i tytuł „Nowa karta” / „New tab” idą z katalogu i18n — **nie** z edytowalnych ustawień (usunięte z Ogólne/Home, żeby przy EN nie zostawał stary PL z persist).

---

## 5. Ostatnie ważne commity (orientacyjnie)

```
f0775a5 fix(i18n): localize omnibox/home placeholders and new-tab titles
4e9b453 feat(i18n): PL/EN UI locale switcher across browser chrome
eaa3fe3 feat(search): English results language setting
2d24220 feat(ui): replace native Windows color picker
de714ce feat(settings): collapsible adblock exceptions
32ac13e feat(settings): professional typography and row layout
0735b82 feat(ui): polish internal chrome pages
8b6f4f2 chore: always commit+push for Discord changelog
19466d9 fix(session): crash restore; side panel; mobile Gmail
27003e1 feat(home): Spotify Now Playing widget
ab6e23e 0.1.2
9c8c4e5 feat(automation): API v2 Soul …
8c86ec0 feat(automation): local Soul API
3d98aed feat(extensions): Web Store install + consent
```

---

## 6. Konwencje kodu

- Main: `'use strict'`, `module.exports`, factory `createX` / `register`, kebab-case `.cjs`.  
- Renderer: function components, PascalCase `.tsx`, alias `@/*` → `src/*`.  
- Style: zwykły CSS (`styles.css` + `styles/*.css`), **bez** Tailwind / CSS modules; fonty lokalne @fontsource (CSP).  
- UI strings: PL + EN przez i18n; komentarze mieszane.  
- Logi main: `getLogger(ns)`, nie goły `console.log`.  
- Testy: `test/*.test.{mjs,cjs}`, `node:assert`, dodać do łańcucha `npm test` w `package.json`.

---

## 7. Znane pułapki

- Updater wymaga istniejącego publicznego `vio-releases` przed pierwszym `npm run release`.  
- `styles.css` overlap z `chrome-layout.css`; lint ~43 warnings.  
- Brak CI — testy tylko lokalnie.  
- Folder `beats/` lokalny, nie w repo.  
- `FULL_STATE.md` / stary `BRIEFING-GROK-HOME.md` mogą mieć nieaktualne nazwy produktu / wersje — **ten plik** jest źródłem prawdy na 2026-10-21.  
- Przy i18n: nie importuj store z `i18n/index` w libach używanych przy boot store (TDZ) — używaj `i18n/core`.

---

## 8. Checklist przed oddaniem taska

1. Nie ruszono Tor / vault / privacy / partition bez zgody.  
2. `npm run typecheck` + `npm test` OK.  
3. UI: jeśli zmiana w Electron main — restart `electron:dev`.  
4. Commit tylko swoich plików; message `feat|fix|chore`.  
5. `git push origin main` → Discord `#changelog-vio`.  
6. Krótki opis po polsku dla usera.

---

## 9. Pliki „czytaj dalej”

| Plik | Po co |
|------|--------|
| `CLAUDE.md` | Canonical agent rules (aktualne) |
| `docs/ARCHITECTURE.md` | Architektura |
| `docs/automation-api.md` | Soul API v2 |
| `docs/REPO.md` | Remote, releasy, PAT |
| `PROJECT_OVERVIEW.md` | Tor/privacy głębiej |
| `BRIEFING-GROK-HOME.md` | Home/personalize/widgets (2026-09) |
| `docs/reports/RAPORT-*.md` | Historia rund QA / Google / cleanup |
| `.cursor/rules/commit-push-changelog.mdc` | Discord push workflow |

---

**Koniec briefingu.** Przy nowym tasku: czytaj ten plik + `CLAUDE.md`; nie zgaduj stacka z pamięci sprzed i18n / Soul / Vio 0.1.2.
