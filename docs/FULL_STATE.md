# FULL_STATE — djxxr / moja_przegladarka

Dokument stanu aplikacji dla osoby piszącej prompty (bez dostępu do repo).  
Wygenerowany z odczytu kodu (nie z pamięci sesji). Gdzie brak pewności: **niepewne**.

Data odczytu kodu: 2026-10-01.  
Aktualizacja po rundzie „naprawdę działa”: 2026-10-01.  
Repo lokalne: `C:\Users\djxxr\Desktop\moja_przegladarka`.  
Git: **2.55.0.windows.5** (winget `Git.Git`), lokalne `master` bez remote.

---

## 1. Podsumowanie (10 zdań)

1. **djxxr** to prywatna przeglądarka desktopowa na **Electron + React 19 + Zustand**, UI po polsku, produkt w builderze jako „Moja Przeglądarka” (`appId: local.djxxr.przegladarka`).
2. Renderer to SPA Vite; karty gościa to tag `<webview>` z partycjami sesji (`persist:main`, `tor-<uuid>`, `private-<uuid>`).
3. Main process (`electron/main.cjs`) obsługuje Tor (embedded Expert Bundle + fail-closed), adblock (Ghostery + legacy), historię, pobrania, sejf haseł, uprawnienia, metryki, certyfikaty.
4. Stan UI/ustawień leży w Zustand `persist` pod kluczem **`moja-przegladarka-v8`** (bez `history` — tylko `history.cjs`); sesja kart — `electron/session.cjs`.
5. Strona startowa to rozbudowany **homeChrome** (clock/search/shortcuts) + widżety z dnd/snap; Personalizacja to sheet z zakładkami Look/Layout/Widgets/Clock.
6. Chrome-like warstwa (menu ≡, skróty, kontekst, find, zoom, print/PDF) jest wdrożona; round QA + „naprawdę działa” poprawiły kontekst, private, historię, Input/Switch.
7. Tryb Tor jest izolowany (osobna partycja + SOCKS + weryfikacja check.torproject.org); nie twierdzi, że jest Tor Browserem.
8. Największe ryzyka produktowe: złożoność home/personalize, ciężki bundle JS (~765 kB), mieszanka Ghostery/legacy adblock.
9. Build Windows: `electron-builder` → NSIS; `electron/**/*` wchodzi do paczki (w tym `tor-keys/torbrowser.asc`).
10. typecheck/build/test po rundzie napraw: **przechodzą** (ostrzeżenia Vite chunk size + MODULE_TYPELESS przy teście url-display).

---

## 2. Stack i build

### Wersje (package.json + runtime z About / Electron 44.5.0)

| Składnik | Wersja |
|----------|--------|
| Aplikacja (`package.json` version) | `0.1.0` |
| Electron (dependency) | `^44.5.0` → zainstalowane **44.5.0** |
| Chromium (runtime, z AboutPage / process.versions) | **152.0.7977.130** |
| Node (runtime Electron) | **24.21.0** |
| V8 (runtime) | **15.2.124.28-electron.0** |
| React / react-dom | `^19.0.0` |
| Vite | `^6.2.0` (build log: vite **6.4.3**) |
| TypeScript | `^5.7.3` |
| Zustand | `^5.0.3` |
| motion | `^13.4.6` |
| lucide-react | `^0.475.0` |
| @dnd-kit/core, sortable, utilities | `^6.3.1`, `^10.0.0`, `^3.2.2` |
| @ghostery/adblocker (+ electron) | `^2.18.2` |
| openpgp | `^6.3.2` |
| fontsource: Instrument Sans, Manrope, JetBrains Mono | `^5.3.0` |
| electron-builder | `^26.15.3` |
| concurrently, wait-on, cross-env | dev |

### Skrypty npm

| Skrypt | Komenda |
|--------|---------|
| `dev` | `vite` |
| `build` | `tsc -b && vite build` |
| `typecheck` | `tsc -b --pretty false` |
| `test` | `node test/home-widgets.test.mjs && node --experimental-strip-types test/url-display.test.mjs` |
| `electron:dev` | concurrently: Vite `127.0.0.1:5173` + `VITE_DEV_SERVER=… electron .` |
| `electron:build` | `vite build && electron-builder --win` |
| `preview` | `vite preview` |

### electron-builder / NSIS

```json
"build": {
  "appId": "local.djxxr.przegladarka",
  "productName": "Moja Przeglądarka",
  "directories": { "output": "release" },
  "files": ["dist/**/*", "electron/**/*", "package.json"],
  "win": { "target": ["nsis"], "signAndEditExecutable": false }
}
```

- **Tor keys:** `electron/tor-keys/torbrowser.asc` wchodzi przez glob `electron/**/*` (nie wymieniony osobno).
- Entry main: `"main": "electron/main.cjs"`.

### Uruchamianie

- Dev: `npm run electron:dev` (Vite + Electron z preload).
- Produkcja lokalna po build: `npx electron .` ładuje `dist/index.html`.
- Vite: `base: './'`, `outDir: dist`, alias `@` → `src`.

### Testy

- `test/home-widgets.test.mjs` — layout/migracja widżetów home.
- `test/url-display.test.mjs` — `src/lib/url-display.ts` (strip-types).
- Skrypty poza npm: `scripts/test-tor-leaks.cjs`, `test-passwords*.cjs`, capture/probe — **narzędzia QA**, nie część `npm test`.

---

## 3. Drzewo plików (bez node_modules / dist / release)

Opis: jedno zdanie przy ważnych plikach.

### Root

| Plik | Opis |
|------|------|
| `package.json` | Zależności, skrypty, konfiguracja electron-builder |
| `package-lock.json` | Lock zależności |
| `index.html` | Shell HTML Vite |
| `vite.config.ts` | Vite React, port 5173, base `./` |
| `tsconfig.json` | Strict TS, tylko `src/` |
| `README.md` | Dokumentacja użytkowa (jeśli obecna) |
| `PROJECT_OVERVIEW.md` | Starszy overview projektu |
| `BRIEFING-GROK-HOME.md` | Briefing pod home/personalize dla LLM |
| `RAPORT-QA-ROUND2.md` | Raport QA rundy sidebar/private/bookmarks/downloads |
| `.gitignore` | Ignorowane artefakty |

### `electron/`

| Plik | Opis |
|------|------|
| `main.cjs` | Proces główny: okna, IPC, wiring sesji/Tor/adblock |
| `preload.cjs` | `contextBridge` → `window.shell` |
| `webview-preload.cjs` | Preload gościa (webview) |
| `security.cjs` | CSP, partycje, permission ask, navigation guards, webview attach |
| `window-mode.cjs` | Meta okna private/tor, `private-<uuid>`, wipe |
| `session.cjs` | Persist sesji kart (`session.json` / dirty exit) |
| `tor.cjs` | Start/stop Tor mode, partycje, verify IsTor |
| `tor-daemon.cjs` | Embedded tor.exe download + OpenPGP verify + spawn |
| `tor-control.cjs` | ControlPort / NEWNYM |
| `tor-bridges-builtin.cjs` | Wbudowane mosty |
| `tor-keys/torbrowser.asc` | Klucz podpisujący Tor Browser Developers |
| `tor-keys/README.md` | Fingerprint i flow weryfikacji |
| `adblock-plus.cjs` | Ghostery Electron blocker |
| `adblock.cjs` | Legacy/fallback + cosmetic/page script |
| `privacy.cjs` | Prefs prywatności, hardenGuest, DoH, clear on quit |
| `passwords.cjs` | Sejf AES-256-GCM + scrypt, autofill IPC |
| `downloads.cjs` | Lista pobrań, drag, ephemeral |
| `history.cjs` | Historia wizyt/zapytań na dysku |
| `favicon-cache.cjs` | Cache favicon |
| `bookmarks-import.cjs` | Discovery profili Chrome/Brave/Edge + odczyt JSON |
| `certificate.cjs` | Obsługa błędów certyfikatu |
| `context-menu.cjs` | Natywne menu kontekstowe webview |
| `shortcuts-guest.cjs` | Przekazywanie skrótów z guest before-input |
| `metrics.cjs` | Snapshot CPU/RAM / goście |
| `perf.cjs` | Cache clear, memory, boot switches |
| `home-bg.cjs` | Wybór/czyszczenie tła home |

### `src/`

| Plik | Opis |
|------|------|
| `main.tsx` | Bootstrap React + import CSS + `window.__DJXXR_STORE__` |
| `App.tsx` | Shell przeglądarki: karty, omnibox, shortcuts, routing about:*, Tor, webviews |
| `store.ts` | Zustand store + DEFAULT_SETTINGS + persist v8 |
| `vite-env.d.ts` | Typy `window.shell` |
| `styles.css` | Główny chrome + internal pages + menu |
| `styles/*.css` | Moduły: ui, settings, widgets, tor, passwords, scrollbars, … |
| `components/*` | UI chrome i strony wewnętrzne |
| `components/ui/*` | Design system primitives |
| `components/personalize/*` | Sheet Personalizacji |
| `widgets/*` | Widżety home + snapMath + registry |
| `lib/*` | shortcutsRegistry, url-display, windowBoot, privacyPresets, … |

### `scripts/`, `test/`, `docs/`

| Ścieżka | Opis |
|---------|------|
| `scripts/capture-*.cjs` | Zrzuty UI do `tmp-verify/` |
| `scripts/test-tor-*.cjs`, `test-passwords*.cjs` | Testy integracyjne Electron |
| `test/*.mjs` | Testy jednostkowe npm |
| `docs/FULL_STATE.md` | Ten dokument |

---

## 4. Architektura

### 4.1 Procesy

| Proces | Plik | Rola |
|--------|------|------|
| Main | `electron/main.cjs` | BrowserWindow, session, IPC, Tor, downloads… |
| Preload (chrome) | `electron/preload.cjs` | Eksponuje `window.shell` (contextIsolation) |
| Preload (guest) | `electron/webview-preload.cjs` | Most do strony w webview (hasła/adblock — **niepewne** szczegóły kanałów IPC gościa bez pełnego dumpa pliku) |
| Renderer | `src/*` (Vite) | React UI, Zustand, tag `<webview>` |

WebPreferences typowego okna (`createWindow`): `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webviewTag: true`, `spellcheck: false` na oknie chrome (spellcheck włączany na sesjach guest).

### 4.2 Partycje i sesje

| Partycja | Znaczenie |
|----------|-----------|
| `persist:main` | Domyślne karty normalne |
| `persist:side` / `persist:side*` | Aplikacje side panel (`security.isAllowedPartition`) |
| `persist:private` | Legacy / fallback string w rendererze przy braku window partition |
| `private-<uuid>` | Okno prywatne — **bez** prefixu `persist:`, ephemeral, wipe w `window-mode.wipePrivatePartition` |
| `tor-<uuid>` | Karta/okno Tor — ephemeral, tworzone w `tor.cjs` |

`security.cjs`: `ALLOWED_PARTITIONS`, `TOR_PARTITION_RE`, `PRIVATE_PARTITION_RE`.

### 4.3 Model okien i kart

- **Okno:** `BrowserWindow` + `windowMode.setWindowMeta({ mode, partition })`.
- **Boot:** `additionalArguments` `--djxxr-boot=` / `--djxxr-partition=` + IPC `shell:window-boot` / `shell:window-boot-get`.
- **Karta (`Tab` w store):** `id`, `url`, `title`, `favicon?`, `mode: 'normal'|'private'|'tor'`, `partition?`, `pinned`, `muted`, `discarded`, `navHistory?`, `loadError?`, `lastActiveAt`.
- API store: `newTab`, `newPrivateTab` (używa `getWindowPartition()`), `newTorTab({ partition })`, `closeTab` → closedTabs (max 25, bez Tor).

### 4.4 Routing stron wewnętrznych (renderer, nie prawdziwy protokół HTTP)

| URL | Komponent / zachowanie |
|-----|------------------------|
| `about:home` (`HOME_URL`) | `HomeSearch` + homeChrome/widgets |
| `about:tor` (`TOR_HOME_URL`) | `TorLanding` |
| `about:history` | `HistoryPage` |
| `about:downloads` | `DownloadsPage` |
| `about:bookmarks` | `BookmarksPage` |
| `djxxr://about` (`ABOUT_URL`) | `AboutPage` |
| `about:about` | Alias About (`ABOUT_URL_ALT`) |
| `view-source:…` | Nowa karta z tym URL (webview) |

**Ważne:** `<webview>` **nie** montuje się dla `about:*`, `djxxr://*`, HOME/TOR_HOME (`TabWebview` early return) — inaczej Chromium czyści URL.

Ustawienia: `view === 'settings'` → pełnoekranowy `SettingsPage` (nie about: URL).

### 4.5 Store Zustand — persist

- **Nazwa:** `moja-przegladarka-v8`
- **partialize:** `settings`, `bangs`, `shortcuts`, `sideApps`, `history`, `bookmarks`, `bookmarkFolders`
- **Nie w persist:** `tabs`, `activeId`, `closedTabs`, `sessionReady`, `view` — sesja kart przez main `shell:session-*`
- **merge:** migracje homeWidgets/homeChrome/sidebarMode/homeLayoutPreset/bg custom→soft / allowInspect / showBookmarksBar / darkPageScrollbars itd. (blok `merge` w `store.ts` ~1766+)

### 4.6 `settings` — klucze, typy, domyślne (`DEFAULT_SETTINGS`)

| Klucz | Typ (skrót) | Default |
|-------|-------------|---------|
| `searchEngine` | SearchEngine | `'brave'` |
| `searxUrl` | string | `'http://127.0.0.1:8080'` |
| `customSearchUrl` | string | `'https://duckduckgo.com/?q=%s'` |
| `torProxyEnabled` | boolean | `false` (deprecated) |
| `torProxyUrl` | string | `'socks5://127.0.0.1:9050'` |
| `torSeenDisclaimer` | boolean | `false` |
| `torDaemonAutostart` | boolean | `false` |
| `torBridgeMode` | none\|obfs4\|snowflake\|meek\|custom | `'none'` |
| `torBridgeLines` | string | `''` |
| `privacyPreset` | standard\|strict\|custom | `'standard'` |
| `privacySiteExceptions` | string[] | `[]` |
| `privacyClearOnQuit` | boolean | `false` |
| `privacyClearOnQuitKeep` | string[] | `[]` |
| `privacyStripTracking` | boolean | `true` |
| `privacySecGpc` | boolean | `true` |
| `privacyDnt` | boolean | `false` |
| `privacyReferrerPolicy` | boolean | `true` |
| `privacyThirdPartyCookies` | trackers\|all\|allow | `'trackers'` |
| `privacyHttpsOnly` | upgrade\|block\|off | `'upgrade'` |
| `privacyDoh` | automatic\|quad9\|…\|off | `'automatic'` |
| `privacyDohCustom` | string | `''` |
| `privacyChromeUa` | boolean | `true` |
| `privacyWebRtc` | public_only\|disable_udp\|default | `'public_only'` |
| `privacyFingerprint` | boolean | `false` |
| `privacySearchSuggest` | boolean | `true` |
| `privacyAllowAppNetwork` | boolean | `true` |
| `historyRetention` | 7\|30\|90\|always\|off | `'90'` |
| `adblockUpdateLists` | boolean | `true` |
| `adblockEnabled` | boolean | `true` |
| `adblockNetwork` | boolean | `true` |
| `adblockCosmetic` | boolean | `true` |
| `adblockTrackers` | boolean | `true` |
| `adblockCustomRules` | string | `''` |
| `openSearchInNewTab` | boolean | `false` |
| `suggestHistory` | boolean | `true` |
| `suggestBangs` | boolean | `true` |
| `homepage` | string | `about:home` |
| `startupMode` | StartupMode | `'session'` |
| `startupPages` | string | `''` |
| `downloadsFolder` | string | `''` |
| `downloadsAskWhere` | boolean | `false` |
| `sidebarWidth` | number | `220` |
| `sidebarCollapsed` | boolean | `false` |
| `showSidebar` | boolean | `true` |
| `sidebarMode` | on\|auto\|off | `'on'` |
| `sidePanelOpen` | boolean | `false` |
| `sidePanelWidth` | number | `420` |
| `activeSideAppId` | string\|null | `null` |
| `theme` | ThemeId | `'midnight'` |
| `accent` | string | `'#6b9eff'` |
| `useThemeAccent` | boolean | `true` |
| `uiGlass` | boolean | `true` |
| `glassBlur` | number | `18` |
| `glassOpacity` | number | `0.55` |
| `uiMotion` | boolean | `true` |
| `uiDensity` | UiDensity | `'comfortable'` |
| `openExternalInApp` | boolean | `true` |
| `newTabIsSearch` | boolean | `true` |
| `appName` | string | `'Przeglądarka'` |
| `omniboxPlaceholder` | string | `'Szukaj, !yt, adres…  (Ctrl+L)'` |
| `homeHeadline` … `homeShowStats`, `homeNotes`, `homeTodos` | mixed | patrz DEFAULT ~651–665 |
| `homeAppsStyle` | HomeAppsStyle | `'icons'` |
| `homeLayout` | HomeLayout | `'dashboard'` |
| `homeAlign` | HomeAlign | `'center'` |
| `homeLayoutPreset` | HomeLayoutPreset | `'centered'` |
| `homeDensity` | HomeDensity | `'comfortable'` |
| `homeWidgets` | HomeWidget[] | `[]` |
| `homeChrome` | HomeChromeItem[] | `[]` (normalize → default stack) |
| `homeWidgetStyle` | transparent\|glass\|solid | `'transparent'` |
| `homeWidgetRadius` | number | `14` |
| `homeGridGap` | number | `12` |
| `homeLayoutLock` | boolean | `false` |
| `bgStyle` | BgStyle | `'soft'` |
| `homeBgImage` | string\|null | `null` |
| `homeBgBlur` / `homeBgDim` | number | `12` / `35` |
| `homeClockStyle` | thin\|classic\|mono | `'thin'` |
| `homeShowSeconds` | boolean | `false` |
| `clock24h` | boolean | `true` |
| `perfMode` | PerfMode | `'balanced'` |
| `perfHardwareAcceleration` | boolean | `true` |
| `perfBackgroundThrottling` | boolean | `true` |
| `perfLazyTabs` | boolean | `true` |
| `perfDiscardTabs` | boolean | `true` |
| `perfDiscardMinutes` | number | `15` |
| `perfReduceMotion` | boolean | `false` |
| `perfSmoothScrolling` | boolean | `true` |
| `perfSpellcheck` | boolean | `false` |
| `perfBlockHeavyMedia` | boolean | `false` |
| `perfCacheMb` | number | `256` |
| `perfLowPowerClock` | boolean | `false` |
| `passwordsEnabled` | boolean | `true` |
| `passwordsIdleMinutes` | number | `15` |
| `passwordsAutofill` | boolean | `true` |
| `passwordsOfferSave` | boolean | `true` |
| `allowInspect` | boolean | `false` |
| `zoomFactors` | Record\<string, number\> | `{}` |
| `showBookmarksBar` | boolean | `false` |
| `darkPageScrollbars` | boolean | `true` |

Motywy `ThemeId`: `midnight | graphite | ocean | forest | ember | violet | slate | paper`.

`HomeChromeId`: `clock | search | shortcuts`.  
`HomeWidgetType`: `weather | notes | todo | calendar | recent | downloads | resources`.

### 4.7 IPC — kanały

Kierunek: **R→M** = invoke z renderera; **M→R** = `webContents.send` / `ipcRenderer.on`.

#### Invoke (preload → main) — lista z `preload.cjs` + handlery w `main.cjs` / `home-bg.cjs`

| Kanał | Kierunek | Rola (skrót) | Handler |
|-------|----------|--------------|---------|
| `shell:platform` | R→M | `process.platform` | main |
| `shell:app-info` | R→M | wersje app/electron/chrome/node/v8, userData | main |
| `shell:open-user-data` | R→M | otwórz folder profilu | main |
| `shell:open-logs-folder` | R→M | otwórz logi | main |
| `shell:new-window` | R→M | `{ boot?: 'private'\|'tor' }` → `createWindow` | main |
| `shell:window-boot-get` | R→M | meta okna | window-mode |
| `shell:quit` | R→M | quit | main |
| `shell:window-toggle-fullscreen` | R→M | fullscreen | main |
| `shell:open-external` | R→M | zewnętrzny protokół | main |
| `shell:set-proxy` | R→M | deprecated/no-op Tor path | main |
| `shell:tor-start` | R→M | start trybu Tor | tor.cjs |
| `shell:tor-stop` | R→M | stop | tor |
| `shell:tor-status` | R→M | status | tor |
| `shell:tor-refresh` | R→M | odśwież IP/status | tor |
| `shell:tor-new-identity` | R→M | NEWNYM + nowa partycja | tor |
| `shell:tor-circuit` | R→M | info obwodu | tor |
| `shell:tor-bridges` | R→M | mosty | tor/daemon |
| `shell:tor-selftest` | R→M | selftest | tor |
| `shell:tor-daemon-autostart` | R→M | skrót Startup | tor-daemon |
| `shell:tor-daemon-status` | R→M | status demona | tor-daemon |
| `shell:privacy-config` | R→M | setConfig + DoH/adblock | privacy |
| `shell:privacy-status` | R→M | cfg + adblock status | privacy |
| `shell:privacy-exception-add/remove` | R→M | wyjątki stron | privacy |
| `shell:privacy-forget-site` | R→M | forget site | privacy |
| `shell:privacy-blocked` | R→M | zablokowane per tabKey | privacy |
| `shell:favicon-cache-get/put` | R→M | cache | favicon-cache |
| `shell:history-config/status` | R→M | retention | history |
| `shell:history-record-visit/query` | R→M | zapis | history |
| `shell:history-suggest/list` | R→M | UI | history |
| `shell:history-delete*` / `clear` / `remove-query` | R→M | usuwanie | history |
| `shell:session-load/status/save/clear` | R→M | sesja kart | session |
| `shell:session-dismiss-crash` | R→M | | session |
| `shell:session-mark-clean` | R→M | | session |
| `shell:session-nav-history` | R→M | historia nawigacji WC | session |
| `shell:downloads-*` | R→M | list/config/pause/resume/cancel/remove/clear/open/show/drag | downloads |
| `shell:bookmarks-discover-profiles` | R→M | Chrome/Brave/Edge paths | bookmarks-import |
| `shell:bookmarks-read-profile` | R→M | odczyt Bookmarks JSON | bookmarks-import |
| `shell:search-suggest` | R→M | podpowiedzi wyszukiwarki | main |
| `shell:weather-fetch/suggest` | R→M | Open-Meteo | main |
| `shell:home-bg-pick/clear` | R→M | tło home | home-bg |
| `shell:adblock-config/status/cosmetic/page-script` | R→M | adblock | adblock(+plus) |
| `shell:perf-boot/apply-session/clear-cache/memory` | R→M | wydajność | perf |
| `shell:set-titlebar` | R→M | kolory overlay | main |
| `shell:set-native-theme` | R→M | nativeTheme | main |
| `shell:passwords-*` | R→M | pełny sejf (setup/unlock/list/…/page-script/activity) | passwords |
| `shell:webview-preload` | R→M | ścieżka preload gościa | main |
| `shell:metrics-subscribe/unsubscribe/set-guests/set-interval/low-power/snapshot` | R→M | metryki | metrics |
| `shell:permissions-list/revoke/respond` | R→M | uprawnienia | security |
| `shell:set-devtools-enabled` | R→M | flaga inspect | main |
| `shell:set-shortcut-trap` | R→M | trap skrótów guest | main |
| `shell:save-page` | R→M | zapis HTML | main |
| `shell:print-to-pdf` | R→M | PDF | main |
| `shell:certificate-respond` | R→M | kontynuuj/odrzuc cert | certificate |

#### Eventy M→R (wybrane)

| Kanał | Rola |
|-------|------|
| `shell:window-boot` | boot mode/partition do renderera |
| `shell:tor-progress` | postęp demona |
| `shell:downloads-changed` | lista pobrań |
| `shell:https-warn` | ostrzeżenie HTTP→HTTPS |
| `shell:adblock-blocked` | licznik blokad |
| `shell:open-url` | otwórz URL (tor/private/background) |
| `shell:context-action` | akcja z menu kontekstowego → renderer |
| `shell:shortcut` | skrót z guest before-input |
| `shell:passwords-locked` | sejf zablokowany |
| `shell:metrics` | snapshot metryk |
| `shell:permission-ask` | dialog uprawnień |
| `shell:certificate-error` | UI cert |

---

## 5. Funkcje — tabela statusów

Statusy: **działa** / **częściowo** / **zepsute** / **brak**.  
Legenda pewności: **[T]** = przetestowane w tej rundzie (probe/kod+build); **[K]** = tylko odczyt kodu / wiring.

| Funkcja | Status | Pliki | Uwagi |
|---------|--------|-------|-------|
| Karty (otwórz/zamknij/pin/mute/discard) | działa [K] | `store.ts`, `App.tsx` | discard timer z `perfDiscard*` |
| Okna normalne | działa [K] | `main.createWindow` | bounds persist tylko normal |
| Okno prywatne Ctrl+Shift+N | działa [T] | `window-mode`, App shortcuts, AppMenu | ephemeral `private-<uuid>`; **bez** `persist:private` |
| Okno Tor Shift+Alt+N | działa [K] | j.w. + `torStart` | nie zmienia demona poza istniejącym API |
| Tor daemon embed + verify | działa [K] | `tor-daemon.cjs`, `tor-keys` | fail-closed OpenPGP — **nie ruszane** w tej rundzie |
| Tor mosty | działa [K] | `torBridgeMode`, `tor-bridges` IPC | |
| Tor Nowa tożsamość | działa [K] | `tor.newIdentity`, Ctrl+Shift+U | zamyka karty Tor |
| Tor leak test | częściowo [K] | `scripts/test-tor-leaks.cjs` | nie w `npm test` |
| Omnibox + suggest | działa [K] | `OmniboxSuggest`, history/search suggest IPC | |
| !bangi | działa [K] | `store` bangs, `normalizeInput` | |
| Historia strona | działa [T] | `HistoryPage`, `history.cjs` | jedyne źródło; migracja z Zustand |
| Zakładki + import | działa [K] | `BookmarksPage`, `bookmarks-import` | nadal Zustand-only |
| Pasek zakładek | działa [K] | `BookmarksBar`, `showBookmarksBar` | default OFF |
| Pobrane | działa [K] | `DownloadsUI`, `downloads.cjs` | pierścień + drag |
| Przywracanie sesji | działa [K] | `session.cjs`, App boot | skip private/tor window |
| Ctrl+Shift+T reopen | działa [K] | shortcutsRegistry + store `reopenClosedTab` | |
| Paleta Ctrl+K | działa [K] | `CommandPalette`, `lib/commands.ts` | guest: false w rejestrze |
| Menu ≡ — pozycje | działa [T] | `AppMenu.tsx` ↔ wiring w `App.tsx` | wszystkie handlery podpięte (code audit) |
| Menu kontekstowe guest | działa [T] | `context-menu.cjs` | hostWindowForGuest + popup bez złych x/y |
| Menu kontekstowe chrome edit | działa [T] | `attachChromeEditMenu` | Cut/Copy/Paste w polach chrome |
| Znajdź na stronie | działa [K] | `FindBar`, webview findInPage | disabled na home |
| Zoom | działa [K] | `zoomFactors` per host | |
| Druk / PDF | działa [K] | print / `shell:print-to-pdf` | disabled na home |
| Zapisz stronę | działa [K] | `shell:save-page` | |
| Źródło | działa [K] | `view-source:` nowa karta | |
| DevTools | częściowo [K] | `allowInspect` default false | F12 gated |
| Pełny ekran | działa [K] | F11 / windowToggleFullscreen | |
| PiP | częściowo [K] | tylko pozycja w `context-menu.cjs` na video | brak UI React |
| Skróty (rejestr) | działa [K] | `shortcutsRegistry.ts` + guest trap | `guest:true` przechodzi z webview |
| Hasła / autofill | działa [T] | `passwords.cjs`, `PasswordsPanel` | Input/Switch; sejf **nie ruszany** poza UI |
| Privacy presets | działa [K] | `privacyPresets.ts` + Settings | |
| Ghostery adblock | działa [K] | `adblock-plus.cjs` | preferred |
| Legacy adblock | działa [K] | `adblock.cjs` | fallback + cosmetic |
| Tarcza (Shield) | działa [T] | `ShieldPanel.tsx` | Switch zamiast checkbox |
| Uprawnienia stron | działa [T] | security + dialog w App | Switch „Zapamiętaj” |
| Favicony | działa [K] | favicon-cache + `lib/favicon.ts` | |
| Monitor zasobów / task mgr | działa [K] | `metrics.cjs`, `ResourcesPanel` | Shift+Esc |
| Sidebar on/auto/off | działa [K] | App + CSS overlay Auto | QA round 2 |
| Side apps panel | działa [K] | `AppSidebar`, `sideApps` | |
| Home chrome + widgets | działa [T] | widgets/*, WidgetSettings Switch | |
| Personalizacja sheet | działa [K] | `PersonalizeSheet` + tabs | |
| Motywy / tła / akcent | działa [K] | THEMES, bgStyle, applyThemeToDom | Paper = jasny |
| Ustawienia sekcje | działa [K] | `SettingsPage` | licznik zapytań z `historyStatus` |
| About `djxxr://about` | działa [K] | `AboutPage` | bez webview |
| Scrollbary ciemne | działa [K] | `scrollbars.css`, `darkPageScrollbars` | |
| Spellchecker | częściowo [K] | guest session pl+en-US; `perfSpellcheck` | powiązanie perf↔session: **niepewne** |
| Error page | działa [K] | `ErrorPage.tsx` | |
| Certyfikaty | działa [T] | `certificate.cjs` + dialog App | Switch „Zapamiętaj wyjątek” |
| mailto / protokoły | działa [K] | `NAV_EXTERNAL_PROMPT` + ask | |
| window.open | częściowo [K] | navigation guards / open-url | OAuth popupy dozwolone; pełne ścieżki: **niepewne** |

### Menu ≡ — pozycje (`AppMenu.tsx`)

Nowa karta; Nowe okno; Nowe okno prywatne; Nowe okno Tor; Pasek boczny (Włączony/Auto/Wyłączony); Hasła; Historia; Zakładki; Pobrane; Usuń dane…; Powiększenie −/%/+; Pełny ekran; Drukuj; Znajdź; Zapisz stronę; Zapisz PDF; Kopiuj link; Kod QR; **Więcej narzędzi** → Menedżer zadań / DevTools / Źródło; Pomoc/O djxxr; Ustawienia; Zakończ.

### Menu kontekstowe guest — konteksty (`context-menu.cjs`)

Link (nowa karta / tło / okno / prywatne / kopiuj); obraz; media; zaznaczenie (kopiuj, szukaj, otwórz URL); editable (wytnij/kopiuj/wklej + spellcheck suggestions); page (wstecz/dalej/odśwież/zapisz/drukuj/inspect jeśli allow); video PiP.

### Skróty — pełna lista z `CHROME_SHORTCUTS`

| id | accelerator | handlerKey | guest |
|----|-------------|------------|-------|
| new-tab | Ctrl+T | newTab | true |
| new-window | Ctrl+N | newWindow | true |
| new-private | Ctrl+Shift+N | newPrivateWindow | true |
| new-tor | Shift+Alt+N | newTorWindow | true |
| close-tab | Ctrl+W | closeTab | true |
| reopen-tab | Ctrl+Shift+T | reopenClosedTab | true |
| next-tab / prev-tab | Ctrl+Tab / Ctrl+Shift+Tab | nextTab/prevTab | true |
| tab-1…9 | Ctrl+1…9 | activateTabN | true |
| focus-omnibox-* | Ctrl+L / Alt+D / F6 | focusOmnibox | true |
| reload / reload-f5 | Ctrl+R / F5 | reload | true |
| hard-reload | Ctrl+Shift+R | hardReload | true |
| back / forward | Alt+←/→ | back/forward | true |
| bookmark | Ctrl+D | bookmarkPage | true |
| history | Ctrl+H | history | true |
| downloads | Ctrl+J | downloads | true |
| bookmarks-manager | Ctrl+Shift+O | bookmarksManager | **false** |
| toggle-bookmarks-bar | Ctrl+Shift+B | toggleBookmarksBar | **false** |
| find | Ctrl+F | findInPage | true |
| print | Ctrl+P | print | true |
| save | Ctrl+S | savePage | true |
| view-source | Ctrl+U | viewSource | true |
| fullscreen | F11 | toggleFullscreen | true |
| devtools | F12 | devtools | true |
| clear-data | Ctrl+Shift+Del | clearBrowsingData | true |
| zoom-in/out/reset | Ctrl++/−/0 | zoom* | true |
| settings | Ctrl+, | openSettings | false |
| sidebar | Ctrl+B | toggleSidebar | false |
| palette / palette-shift | Ctrl+K / Ctrl+Shift+P | commandPalette | false |
| tor-identity | Ctrl+Shift+U | torNewIdentity | false |
| task-mgr | Shift+Esc | taskManager | false |
| escape | Esc | escape | false |

Dodatkowo w App (poza rejestrem): **Ctrl+Shift+S** przełącza sidebar Auto open — lokalny listener.

Guest: `guest: true` → przechwytywane w webview przez `shortcuts-guest` / before-input → `shell:shortcut`. Pozycje `guest: false` działają gdy fokus w chrome (niepewne: czy always kiedy fokus w webview).

### Widżety (osobno)

| Typ | Status | Plik |
|-----|--------|------|
| weather | działa | `WeatherWidget.tsx` + weather IPC |
| notes | działa | `NotesWidget.tsx` |
| todo | działa | `TodoWidget.tsx` |
| calendar | działa | `CalendarWidget.tsx` |
| recent | działa | `RecentWidget.tsx` |
| downloads | działa | `DownloadsWidget.tsx` |
| resources | działa | `ResourcesWidget.tsx` |
| chrome clock/search/shortcuts | działa | homeChrome w HomeSearch/strip |

### Strony wewnętrzne — stan wizualny (po QA)

| Strona | Stan |
|--------|------|
| Historia | InternalPage, ciemne checkboxy, wirtualizacja |
| Zakładki | przebudowana (kolumna folderów, Input, dnd) |
| Pobrane | przebudowana (grupy dni, progress) |
| O djxxr | InternalPage + about-dl |
| Hasła | w Settings tab — własne CSS `passwords.css`, dużo natywnych inputów |
| Ustawienia | własne layout; Input w większości pól tekstowych |

---

## 6. Bezpieczeństwo

| Temat | Stan |
|-------|------|
| sandbox + contextIsolation | włączone na BrowserWindow |
| nodeIntegration | false |
| CSP | `security.attachCsp` |
| Navigation guards | `NAV_OK`, external prompt regex, `askExternal` |
| Webview partition allowlist | `isAllowedPartition` |
| Permissions | ask UI + `djxxr-permissions.json` |
| Sejf haseł | plik vault: magic `DXPW`, **v2**, **scrypt** N=131072 (v1 N=16384 migrate), **AES-256-GCM**; opcjonalnie **safeStorage** na zapamiętany klucz; idle lock; clipboard clear 30s |
| Tor fail-closed | brak SOCKS → brak trybu; verify `IsTor`; OpenPGP na sha256sums; FP klucza `EF6E286D…93298290`; brak pliku klucza → `TOR_KEY_MISSING` |
| `torbrowser.asc` | istnieje w repo; w buildzie przez `electron/**/*` |
| Ryzyka | fingerprinting tylko częściowy vs Tor Browser; UA spoof; mixed Ghostery/legacy; `allowInspect`; duże uprawnienia webview; **niepewne:** pełny audit CSP string |

---

## 7. UI i design system

### Tokeny `:root` (`styles.css`)

`--bg`, `--bg-elev`, `--bg-elev-2`, `--bg-side`, `--chrome`, `--chrome-input`, `--fg`, `--fg-2`/`--fg2`, `--fg-3`, `--accent`, `--accent-dim`, `--line`, glass vars, title/tab heights, itd. Motywy nadpisują przez `applyThemeToDom` / klasy `theme-*`.

### Pliki CSS

| Plik | Rola |
|------|------|
| `styles.css` | chrome, home, menu, bookmarks, downloads, about, sidebar-auto |
| `styles/ui.css` | Input, Switch, Segmented, checkbox dark |
| `styles/settings.css` | Settings layout |
| `styles/widgets.css` | home widgets |
| `styles/personalize.css` | Personalize sheet |
| `styles/tor.css` | Tor landing |
| `styles/passwords.css` | sejf UI |
| `styles/scrollbars.css` | cienkie scrollbary |
| `styles/chrome-layout.css` | layout chrome |
| `styles/motion.css` | motion |
| `styles/resources.css` | task manager |
| `styles/permissions.css` | dialogi uprawnień |
| `styles/privacy-extra.css` | extra privacy UI |

### `src/components/ui`

| Komponent | Użycie |
|-----------|--------|
| `Input` | Settings, Bookmarks, Downloads, History, **PasswordsPanel** |
| `Switch` | Settings, Bookmarks bar, **PasswordsPanel**, **Shield**, **WidgetSettings**, **App** (cert/perm) |
| `Segmented` | Settings |
| `Slider` | glass blur/opacity itd. |
| `Dropdown` | **niepewne** pokrycie użycia |
| `OptionCard` | personalize / settings cards |

### Paper

Motyw jasny: `bg #e8e6e1`, `elev #f4f2ed`, `fg #1a1b1e`, `accent #2f6fed`. Po QA capture: Paper działa na home/bookmarks/downloads; niektóre ekrany Tor/private w capture bywały mieszane motywem ze store.

### Hex poza tokenami

Występują w THEMES, DEFAULT accent, części CSS (np. fallbacki `#000`, kolory tor purple) — pełna lista hexów: **niepewne** bez automatycznego audytu.

---

## 8. Znane błędy i dług techniczny

| Item | Plik / przyczyna |
|------|------------------|
| Sidebar Auto kiedyś ściskał treść | naprawione: `--side-total:0` + overlay (`App.tsx` / CSS) |
| `djxxr://about` czyścił URL przez webview | naprawione: skip webview dla `djxxr://` |
| Private/Tor shortcut nie otwierał okna | naprawione: `newWindow({boot})` |
| Menu kontekstowe „nic nie robi” | naprawione: `hostWindowForGuest` + popup bez guest x/y (`a4243b7`) |
| Fallback `persist:private` | usunięty; purge dysku przy starcie (`d2ff869`) |
| Dual historia Zustand + history.cjs | naprawione: tylko `history.cjs` + migracja (`1bf0e40`) |
| Natywne checkboxy / `stog` w Passwords/Shield/Widget/App | naprawione: `Input`/`Switch` (`347bf17`) |
| Vite warning: `useMetrics` static+dynamic import | build reporter |
| Chunk JS > 500 kB | `index-*.js` ~765 kB |
| `MODULE_TYPELESS_PACKAGE_JSON` w teście url-display | brak `"type":"module"` w package.json |
| `@deprecated` torProxy global / set-proxy / presetHomeWidgets | **usunięte** w cleanup (`set-proxy`, `torProxyEnabled`, `presetHomeWidgets`); `torProxyUrl` zostaje (SOCKS Tor) |
| Skrypty `scripts/patch-*.cjs`, stare probe | **usunięte** (cleanup) |
| Monolit `App.tsx` | w trakcie: `TabWebview` → `src/features/tabs/` (~3200 linii pozostało) |
| Corrupt localStorage → biały ekran | **naprawione**: backup `.corrupt-*` + defaults |
| Panel crash wywala całą UI | **złagodzone**: `ErrorBoundary` na settings/sidebar/about:* |

TODO/FIXME w `src/` i `electron/`: praktycznie brak (poza @deprecated). Reszta w node_modules — ignorować.

typecheck: **0 błędów** (2026-10-01 po rundzie).  
build: OK + ostrzeżenia powyżej.  
test: OK.

---

## 9. Wydajność

| Metryka | Wartość |
|---------|---------|
| Czas startu cold | **niepewne** (nie mierzone w tym przebiegu) |
| RAM | IPC `shell:perf-memory` / metrics — **nie mierzone tu** |
| Bundle renderer | ~764 kB JS / ~228 kB CSS (vite build) |
| Ciężkie miejsca | `App.tsx` jeszcze duży (split w toku); home widgets+motion; Ghostery; metrics on-demand |

Mechanizmy: `perfLazyTabs`, `perfDiscardTabs`, `perfBackgroundThrottling`, `perfLowPowerClock`, metrics low-power.

---

## 10. Co zrobione od ostatniego raportu

### Cleanup round (stabilność / porządki) — 2026-10-01

- Siatka: smoke R4/R5/R7 baseline + unit testy (store, shortcuts, popups, partitions, UA brands, tabNavigate).
- ESLint + Prettier (`npm run lint` / `format`).
- Martwy kod: `shell:set-proxy`, `torProxyEnabled`, `presetHomeWidgets`, probe/patch scripts; raporty → `docs/reports/`.
- Split: `src/features/tabs/TabWebview.tsx`, `src/lib/tabNavigate.ts`, `src/lib/persistMerge.ts`.
- Stabilność: ErrorBoundary, atomic write history/notes, main logger + uncaught handlers, corrupt localStorage recovery.
- Docs: `docs/ARCHITECTURE.md`. Szczegóły: `docs/reports/RAPORT-CLEANUP.md`.

### Commity lokalne (`master`) — wcześniejsze rundy

| Hash | Message |
|------|---------|
| `8f99cce` | baseline przed rundą napraw |
| `a4243b7` | fix: context menu popup window and coords |
| `d2ff869` | fix: never persist private browsing sessions |
| `1bf0e40` | fix: historia tylko history.cjs, migracja z Zustand |
| `347bf17` | fix: Passwords/Shield/WidgetSettings/App dialogi na Input/Switch |

### Runda QA round 2 (wcześniej, w baseline)

1. Sidebar Auto jako overlay Arc-like (6px, Ctrl+Shift+S, 300 ms hide, 160 ms slide).
2. Okna private/tor z boot IPC i partycjami.
3. Menu Wrench, focus-visible, About `djxxr://about`.
4. Przebudowa Zakładek i Pobrań + InternalPage.
5. Capture scripts `capture-verify-round2.cjs` / `capture-verify-focus.cjs`.
6. `window.__DJXXR_STORE__` w `main.tsx` pod QA.
7. Input w Settings; ciemne checkboxy w ui.css.

### Runda „naprawdę działa” (ten przebieg)

1. Git zainstalowany (winget), `git init`, `.gitignore`, baseline commit.
2. Context menu: logi + `hostWindowForGuest` + chrome Cut/Copy/Paste.
3. Usunięte `persist:private` z App/security + purge dysku.
4. Historia: sole source `history.cjs`; `importQueries` + onRehydrate; SearchWidget/Settings na IPC.
5. Input/Switch w PasswordsPanel, Shield, WidgetSettings, dialogach cert/perm.
6. Menu ≡: code-audit wiring w `App.tsx` (wszystkie handlery podpięte).
7. Tor daemon / vault crypto: **bez zmian** (zgodnie z briefem).

---

## 11. Rekomendacje (kolejność)

1. **Dokończyć split `App.tsx` / `store.ts` / `SettingsPage` / `main.cjs` IPC** — cel App &lt; 300 linii (cleanup WIP).
2. **Ręczny smoke w pełnym `electron:dev`** — kliknąć ≡ (private/tor/historia/zakładki), PPM na stronie, private window bez plików Partitions.
3. **Code-split chunks** — obniżyć ~765 kB i warning Vite.
3. **Dodać `"type": "module"` lub przenieść test url-display** — uciszyć MODULE_TYPELESS.
4. **Smoke test E2E skrótów guest** — regresja before-input.
5. **Uprościć dual adblock** — jasna ścieżka Ghostery-only vs legacy.
6. **Udokumentować / zablokować martwe skrypty probe** w `scripts/`.
7. **Zmniejszyć powierzchnię Personalize/home** albo testy snapshot layoutu — częste źródło regresji UI.
8. **Rozważyć oficjalny protokół `djxxr://` w sesji** zamiast fake-URL — mniej pułapek webview.
9. **Remote git / mirror** — lokalny `master` bez origin.

---

## Wyniki weryfikacji

Uruchomione po rundzie napraw: `npx tsc --noEmit`, `npm run build`, `npm test`.

### typecheck

```
npx tsc --noEmit
(exit 0, brak błędów)
```

### build

```
> moja-przegladarka@0.1.0 build
> tsc -b && vite build
vite v6.4.3 building for production...
✓ built in 3.54s
dist/assets/index-*.css ~228.16 kB │ gzip 57.64 kB
dist/assets/index-*.js  ~764.71 kB │ gzip 231.45 kB
(!) Some chunks are larger than 500 kB
(exit 0)
```

### test

```
> moja-przegladarka@0.1.0 test
home-widgets.test.mjs: ok
(node) MODULE_TYPELESS_PACKAGE_JSON warning for url-display.ts
url-display.test.mjs: ok
(exit 0)
```

### Menu ≡ (code audit)

Wszystkie pozycje `AppMenuActions` mają handlery w `App.tsx` (~2415–2488): newTab/window/private/tor, sidebar, passwords/history/bookmarks/downloads, clear, zoom, fullscreen, print/find/save/pdf, copy/QR, task mgr/devtools/source, about/settings/quit.

### Nie objęte pełnym kliknięciem GUI w tej sesji

Tor daemon end-to-end, password vault crypto, każda pozycja ≡ w żywej aplikacji — wymaga `npm run electron:dev` u użytkownika.

---

*Koniec FULL_STATE. Runda napraw zapisana w commitach `a4243b7`…`347bf17`; Tor/vault poza UI bez zmian.*
