# PROJECT OVERVIEW — Moja Przeglądarka (djxxr)

Raport stan na **2026-09-30 (noc / Tor leak-hardening)**.  
Do przekazania innej osobie / modelowi AI (np. **Grok**).  
Źródło: `C:\Users\djxxr\Desktop\moja_przegladarka`.  
npm: `moja-przegladarka` · `appId`: `local.djxxr.przegladarka` · `productName`: **Moja Przeglądarka** · wersja: **0.1.0**.

---

## 0. Kontekst dla Groka

To **prywatna przeglądarka desktop** (Electron + React), **nie** fork Chromium. Własny chrome UI; strony w `<webview>`.

### Dwie ścieżki sesji (krytyczne)
| Tryb | Partition | Persist |
|------|-----------|---------|
| Zwyczajne | `persist:main` | tak |
| **Tor** | `tor-<uuid>` (ephemeral) | **nie** — izolacja fail-closed |

**Zasada Tor:** żadne zapytanie karty Tor nie wychodzi poza sesję Tor; nic z karty Tor nie trafia na dysk (poza świadomym „Zapisz przez Tor” z ostrzeżeniem).

### Priorytety użytkownika
1. Komfort + prywatność na co dzień — preset **Standardowa** nie psuje SSO / YT / płatności / captchy / banków.  
2. **Nie psuć:** sejf haseł, uprawnienia normalne, CSP, izolacja Tor.  
3. Po zmianie `electron/*.cjs` → **restart Electron** (Vite nie przeładowuje main).

### Bloki pracy (chronologicznie)
1. Settings + chrome polish  
2. Sejf haseł (AES-GCM + scrypt v2)  
3. Metrics / task manager  
4. Security harden (E44, sandbox, CSP, permissions)  
5. Resize/scroll Settings  
6. Tor izolowany + Expert Bundle  
7. Prywatność: Standardowa / Ścisła / Własna + Ghostery + tarcza  
8. Favicony lokalne (`data:`, bez CDN DDG)  
9. Layout chrome/NTP  
10. **Tor leak audit** — favicon/historia/bundle OpenPGP+SHA256/autostart/downloads/wipe  

---

## 1. Stack

| Warstwa | Tech |
|---------|------|
| Electron | `^44.5.0` |
| React 19 + Vite 6 + Zustand `moja-przegladarka-v8` | |
| Adblock | `@ghostery/adblocker-electron` + legacy `adblock.cjs` (YouTube/custom) |
| Fonty | lokalne `@fontsource/*` |
| Main | `electron/*.cjs` |

Brak: React Router, SQLite, auto-update, CI (są `scripts/test-*.cjs`).

---

## 2. Struktura

```
electron/
  main.cjs, preload.cjs, webview-preload.cjs
  security.cjs, passwords.cjs, metrics.cjs, perf.cjs
  adblock-plus.cjs, adblock.cjs
  privacy.cjs, favicon-cache.cjs
  tor.cjs, tor-daemon.cjs
  tor-keys/README.md          # fingerprint EF6E286D…93298290
src/
  App.tsx, store.ts, main.tsx
  lib/favicon.ts, privacyPresets.ts, useMetrics.ts
  components/ HomeSearch, AppSidebar, ShieldPanel, TorLanding,
              SettingsPage, PasswordsPanel, metrics/
  styles/ chrome-layout.css, privacy-extra.css, tor.css, …
scripts/
  test-passwords*.cjs
  test-tor-wiring.cjs
  test-tor-leaks.cjs          # audyt szczelności Tor
PROJECT_OVERVIEW.md
```

---

## 3. Architektura

- **Main:** jedno okno, min 720×480, `window.shell` przez preload.  
- **Guest:** `__djxxrPw` — zero sejfu/Node.  
- **IPC wrażliwe:** `assertFromApp` (tylko mainWindow).  
- Tor: `shell:tor-*`, `torDaemonAutostart`, `torDaemonStatus`.  
- Privacy / favicon / adblock / passwords / metrics / permissions — jak wcześniej.

---

## 4. Prywatność (persist:main) — skrót

Presety: **Standardowa** (domyślna) / **Ścisła** / **Własna**.  
Ghostery (EasyList, EasyPrivacy, uBlock, Peter Lowe), UTM strip, Sec-GPC, cookies trackers-only (Standard), HTTPS upgrade, DoH automatic, UA Chrome, WebRTC public_only.  
Ścisła: DNT, all 3P cookies, HTTPS block+warn, DoH secure, fingerprint ON, suggest OFF.  
Tarcza omnibox: wyjątki per domena, „Zapomnij stronę”.  
**Nie mieszać** z logiką Tor.

---

## 5. Tor — szczelność (stan po audycie)

### Co już było OK
| Temat | Stan |
|-------|------|
| Ephemeral `tor-uuid`, SOCKS5 na tej sesji | OK |
| Verify `check.torproject.org` przez **ses.fetch** (nie defaultSession) | OK |
| WebRTC `disable_non_proxied_udp` + kill RTCPeerConnection | OK |
| Permissions: zawsze `callback(false)` | OK |
| Favicon Tor: tylko `data:` lub litera — **bez** `faviconCachePut` | OK |
| Brak `pushHistory` dla kart Tor | OK |
| HomeSearch tylko poza Tor | OK |
| wipeSession: storage + cache + auth + hostResolver | OK |
| Ghostery XOR legacy `onBeforeRequest` (bez double-bind) | OK |

### Co poprawiono w leak-hardening
1. **Favicon:** guard `.onion` / `opts.tor` w `favicon-cache` + IPC — zero zapisu dyskowego dla Tor.  
2. **Sugestie:** bez zmian potrzebnych (Tor nie woła DDG `/ac/`).  
3. **Clearnet helpers** (favicon cache, search-suggest, listy adblock, bundle) — tylko app-level, nie z kontekstu karty Tor.  
4. **Bundle:** URL `https://www.torproject.org/dist/…`, allowlist `*.torproject.org`, OpenPGP (`npm openpgp`) na bundlowanym `electron/tor-keys/torbrowser.asc` (FP `EF6E…8290`) → dopiero potem SHA256 z `sha256sums-signed-build.txt` (+ `.asc`). Fail-closed, bez fallbacku na sam hash; zapis `bundle-meta.json`.  
5. **Autostart:** migracja usuwa skróty Startup przy starcie app; ustawienie `torDaemonAutostart` **domyślnie false**; skrót tylko gdy user włączy.  
6. **Downloads:** dialog „Zapisz przez Tor” + ostrzeżenie że otwarcie PDF/DOCX może ujawnić IP; ruch przez sesję Tor (nie `preventDefault` totalny).  
7. **torrc:** `AvoidDiskWrites 1`.  
8. **Device permissions:** `setDevicePermissionHandler(() => false)`.

### DNS
Chromium przy `socks5://` w `session.setProxy` przekazuje **hostname do proxy** (≈ socks5h). Nie używamy socks4. DoH (`configureHostResolver`) jest app-wide dla normalnego trybu — nawigacje Tor idą SOCKS, nie lokalny resolver dla destination names.

### Testy
```bash
node scripts/test-tor-leaks.cjs
node scripts/test-tor-wiring.cjs
```

### QA ręczne Tor
- check.torproject.org → IsTor true  
- browserleaks WebRTC / DNS  
- brak nowych plików w `favicon-cache` po Tor  
- Autostart: brak lnk domyślnie  
- Pobranie pliku → ostrzeżenie  
- Zamknięcie ostatniej karty Tor / wyjście app → wipe  

---

## 6. Favicony (normalny tryb)

Bez CDN DDG. `page-favicon-updated` → opcjonalnie cache jako **`data:` base64** (CSP blokuje `file://`). Fallback: litera SVG z `encodeURIComponent`.

---

## 7. Layout chrome / NTP

`chrome-layout.css`: karty ~36px, pasek ~44px, omnibox 34px; aktywna karta zlewa się z paskiem; domek tylko w sidebarze; tarcza/hasła w omniboxie; NTP clamp + ikona silnika + skróty max 8 + FAB prawy dolny.

---

## 8. Sejf / metrics / permissions

Bez zmian w tej iteracji Tor. Sejf: AES-GCM + scrypt v2, main-only, autofill HTTPS+origin z `getURL()`.

---

## 9. Dane

| Co | Gdzie |
|----|--------|
| settings… | Zustand v8 |
| wyjątki privacy | `djxxr-privacy.json` |
| adblock lists | `userData/adblock-lists/` |
| favicony | `userData/favicon-cache/` (**nie** dla Tor) |
| sejf | `djxxr-passwords.vault` |
| Tor bundle | `userData/tor-runtime/<ver>/` + `bundle-meta.json` |
| Tor DataDirectory | pod tor-runtime (AvoidDiskWrites 1) |
| karty | tylko RAM |

---

## 10. Build

```bash
npm run electron:dev
npm run build
npm run electron:build
node scripts/test-tor-leaks.cjs
node scripts/test-passwords.cjs
```

---

## 11. Dług / uwagi dla kontynuacji

- Nie łamać izolacji Tor / sejfu / presetów privacy.  
- Bundle: podpis listy sum przez openpgp (czysty JS) + klucz w repo; zły/brak podpisu = abort instalacji (test: `scripts/test-tor-leaks.cjs` §4b).  
- Brak: download manager (poza Tor dialog), session restore, CI, mosty/NEWNYM UI.  
- `styles.css` + overlapping z `chrome-layout.css`.

---

## Schemat

```
Normal:  App → webview persist:main → Ghostery + privacy + passwords
Tor:     App → webview tor-uuid + SOCKS → harden (deny perms, WebRTC kill)
              → verify / nav / download tylko przez tę sesję
              → stop/quit → wipeSession
Bundle:  https://www.torproject.org/dist/ → OpenPGP(.asc)+SHA256 → tor.exe :19050
```

---

*Przy pracy: Standardowa = komfort; Ścisła = ostrzejsza; Tor = fail-closed + zero wycieków clearnet/dysk. Restart Electron po zmianach main.*
