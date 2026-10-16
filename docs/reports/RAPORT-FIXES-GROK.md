# RAPORT FIXES → Grok · 2026-10-02

Kontekst: Electron + Vite + React + Zustand (Vio / moja_przegladarka).
**NIE RUSZAĆ:** Tor fail-closed/mostki, krypto sejfu, presety prywatności, `persist:private`, historia poza Zustandem.
**Nie buduj** Windows NSIS ani full buildu bez prośby; smoke = `npm run typecheck` + `npm run electron:dev`.

---

## Commity sesji (od najstarszego)

| Hash | Temat |
|------|--------|
| `5990649` | Adblock: bramka same-site + builtin allowlist |
| `c5ff8ac` | Ustawienia: kategoria Adblock (listy, wyjątki, stats) |
| `b23231c` | Tarcza: grupowanie `host ×N`, max 5, link → Adblock |
| `ef1328d` | UA: Chrome-identical reduced + Client Hints (Google login) |
| `cb9a561` | Home: wspólna oś 580px, centruj względem treści |
| `1afc918` | Home: tokeny motywu pola wyszukiwania (Paper) |
| `63c4c90` | Home: warstwy custom wallpaper, blur 0 / dim 20% |

---

## 1. Adblock / pętla Google consent

**[T]** typecheck OK · electron:dev OK  
**[K]** Standard: first-party `gen_204` / `play…/log` nie cancel; 3p doubleclick/pagead nadal cancel.

**Przyczyna:** EasyPrivacy `||google.com^/gen_204?` + regex `/log` w Ghostery `onBeforeRequest` bez bramki first-party — tarcza pokazywała `www.google.com` / `play.google.com` na google.com.

**Fix:** `electron/adblock-plus.cjs` — `installRequestGate` / `shouldCancelMatch`:
- Standard: nie cancel same eTLD+1 (poza jawnymi w Strict); regex/generic nigdy na 1p
- Builtin allowlist (toggle): consent/accounts Google, gstatic/googleapis, MS/Apple/GitHub login, CF/hCaptcha/reCAPTCHA, PayPal/Stripe/P24/PayU/Blik
- Nowa sekcja **Adblock** w ustawieniach (osobna od Prywatności)
- Shield: grupowanie + „Pokaż wszystkie” → Adblock

Szczegóły: `docs/reports/RAPORT-ADBLOCK.md`

---

## 2. Logowanie Google (UA)

**Przyczyna:** ślady Electrona / złe Client Hints / debugger zostawał attached po CDP override.

**Fix:**
- UA: `Chrome/<major>.0.0.0` z `process.versions.chrome` (reduced, bez Electron)
- CH: `Not=A?Brand`, `Google Chrome`, `Chromium`
- CDP `Emulation.setUserAgentOverride` + **detach** debuggera
- `app.userAgentFallback`, `session.setUserAgent(persist:main)`, OAuth popup
- Pliki: `electron/ua-chrome.cjs`, `lib/ua-brands.cjs`, main/privacy/popups
- `docs/REPO.md`: logowanie Google zależy od UA — nie dodawać Electron do UA

---

## 3. Build Linux (.rpm + AppImage) — ZABLOKOWANY

**Lokalnie zmienione, NIEZACOMMITOWANE:**
- `electron/tor-daemon.cjs` + `electron/tor.cjs` — na Linuxie systemowy `tor` z PATH; brak → komunikat, bez crasha
- `package.json` — `linux: { rpm, AppImage }`, ikona `build/vio-512.png`, `executableName: vio`
- `.gitignore` — `release-linux/`

**Blokada:** brak WSL i Dockera na maszynie → nie da się zbudować artefaktów.
**Następny krok (użytkownik):** `wsl --install` (Ubuntu) albo Docker Desktop, potem:
```
npm ci && npm run build && npx electron-builder --linux rpm AppImage
```
W WSL: kopia projektu **poza** `/mnt/c`. Windows NSIS bez zmian.

---

## 4. Strona startowa (3 commity)

| # | Commit | Przyczyna → fix |
|---|--------|-----------------|
| 1 | `cb9a561` | `42vw` + 560 vs 640 → `--home-chrome-w: 580px`, oś względem `.hw-canvas` |
| 2 | `1afc918` | hardcoded dark `rgba` w `.home-ios .home-search-inner` → tokeny `--bg-elev` / `--fg` / `--fg-3` |
| 3 | `63c4c90` | `.home-bg-custom > * { position:relative }` psuło band + blur treść → `.home-bg-layer` / `.home-bg-dim`; blur default **0**, dim **20%**; `vio-bg://` w profilu |

**[T]** typecheck OK · electron:dev OK  
**[K]** Midnight + Paper + custom bg: treść wyśrodkowana, czytelna, wallpaper pod contentem.

Szczegóły: `docs/reports/RAPORT-HOME-3.md` (wcześniejsze 3 home; te 3 powyżej to kolejna fala).

---

## Working tree TERAZ (poza commitami powyżej)

```
M  .gitignore
M  electron/tor-daemon.cjs
M  electron/tor.cjs
M  package.json
?? docs/reports/RAPORT-*.md
```

Nie commituj Tor/Linux pack bez prośby użytkownika.

---

## Jak weryfikować

1. `npm run typecheck`
2. `npm run electron:dev`
3. Google: consent bez pętli, login, Gmail/YT, OAuth popup
4. Home: Midnight + Paper + własny obraz — wyśrodkowane, czytelne
5. Linux build: dopiero po WSL/Docker
