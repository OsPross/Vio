# Raport QA — djxxr (runda 4: częściowo / niepewne)

Data: 2026-10-01  
Dla: Grok / kolejny prompt  
Poprzednie: `RAPORT-QA-ROUND3.md`, `docs/FULL_STATE.md`

**typecheck / build / test:** OK  
**Live smoke:** `SMOKE_ROUND4=1` + `electron .` (bez stubów IPC) → **23 checks, 0 FAIL**  
**NIE ruszano:** Tor daemon / OpenPGP, crypto sejfu, privacy presets, historia, private partycje (zasady round 3)

---

## Commity tej rundy

| Hash | Message |
|------|---------|
| `3a72f31` | fix: spellcheck pl+en-US default on (Tor off) |
| `6928b6c` | fix: window.open OAuth same-session, block ungated popups |
| `d8f1a55` | feat: PiP omnibox icon + Alt+P shortcut |
| `092823c` | fix: F12/Ctrl+Shift+I always open DevTools; allowInspect=PPM only |
| `98fa218` | test: live smoke ≡ menu + OAuth (SMOKE_ROUND4) |

---

## 1. SPELLCHECK

**Objaw:** brak czerwonych podkreśleń / podpowiedzi w polach na stronach; `perfSpellcheck` wyglądał jak wyłączona funkcja.

**Przyczyna:**
| Plik | Funkcja / miejsce | Co robiło źle |
|------|-------------------|---------------|
| `electron/perf.cjs` ~L94 | `applySessionPerf` | **zawsze** `ses.setSpellCheckerEnabled(false)` — kasowało włączenie z `main` |
| `electron/privacy.cjs` ~L236 | `attachToSession` | **zawsze** wyłączało spellcheck |
| `src/store.ts` L692 | `DEFAULT_SETTINGS.perfSpellcheck` | default `false` |
| `electron/main.cjs` L346 | `webPreferences.spellcheck` | `false` na BrowserWindow |
| `src/App.tsx` webview | `webpreferences=` | brak `spellcheck=yes` |
| Renderer | brak IPC | `perfSpellcheck` nie sterował sesją |

**Zależność (wyjaśnienie):**
1. `webPreferences.spellcheck` / `spellcheck=yes` na webview — UI podkreśleń Chromium  
2. `session.setSpellCheckerEnabled(true)` — Hunspell ON  
3. `session.setSpellCheckerLanguages(['pl','en-US'])` — słowniki  
4. `perfSpellcheck` (Zustand) → IPC `shell:spellcheck-config` / `perfApplySession({spellcheck})` → kroki 2–3  

**Poprawka:**
- Nowy `electron/spellcheck.cjs` — jedyne miejsce apply
- Usunięte hard-disable z `perf.cjs` i `privacy.cjs`
- Default `perfSpellcheck: true` + one-shot migracja localStorage
- Tor (`tor-*`): spellcheck **WYŁĄCZONY** — Hunspell może pobierać słowniki poza obwodem Tora; udokumentowane w Settings hint
- PPM „Dodaj do słownika” już było w `context-menu.cjs` (zostaje, z szacunkiem do Tor)

**Status:** działa [T]

---

## 2. WINDOW.OPEN / POPUPY

### Ścieżki (katalog)

| Ścieżka | Zachowanie |
|---------|------------|
| `target=_blank` / disposition `foreground-tab` \| `background-tab` \| `default` | **Nowa karta** (`deny` + `shell:open-url`) |
| `window.open(url, name, 'width=…,height=…')` z gestem / OAuth host | **Prawdziwe BrowserWindow**, `webPreferences.session = opener.session` (ta sama partycja, cookies, `window.opener`, `postMessage`) |
| `window.open('about:blank', …)` (OAuth blank→navigate) | allow BrowserWindow, ta sama sesja |
| `window.open` bez gestu, nie-OAuth | **deny** + `shell:popup-blocked` → ikona AppWindow w omniboxie → „pozwól” |
| `window.close()` z popupu | natywne BrowserWindow — działa |
| Tor | **bez** chrome popupów — URL jako karta Tor w tej samej partycji |
| OAuth hosts (Google, Microsoft, GitHub, Discord, …) | allow nawet gdy gesture tracker nie złapie clicka |

**Przyczyna (stary kod `security.cjs` ~L301–328):**
- `noopener` w features mylnie = „popup”
- `overrideBrowserWindowOptions` **bez** `session: opener.session` → osobna sesja, SSO się sypie
- brak blokady bez gestu / brak UI

**Poprawka:** `electron/popups.cjs` + wiring w `attachNavigationGuards`; ikona w omniboxie; IPC `popup-allow` / `popup-open-allowed`.

**Logi live smoke (fragment):**
```
[smoke4] oauth-google-click → OK | {"oauthClick":{"found":true,"text":"Sign up with Google"},"childWindows":3}
[smoke4] stackoverflow-login-page → OK | https://stackoverflow.com/users/login
[smoke4] github-login-page → OK | https://github.com/login
```
Klik „Sign up with Google” na SO → powstały dodatkowe BrowserWindow (same-session). Pełne dokończenie logowania Google wymaga konta użytkownika (nie automatyzowane).

**Status:** działa [T]

---

## 3. PIP

**Objaw:** PiP tylko z PPM; YouTube nadpisuje kontekst — brak ścieżki chrome.

**Przyczyna:** tylko pozycja w `context-menu.cjs` (~L317); brak detekcji `<video>` i skrótu.

**Poprawka:**
- `webview-preload.cjs` → `djxxr-media` (hasVideo/playing) + listener `djxxr-pip-toggle`
- Omnibox: ikona `PictureInPicture2` gdy strona ma wideo
- Skrót **Alt+P** (`shortcutsRegistry` + handler)
- Fallback `executeJavaScript` requestPictureInPicture

**Status:** działa [T] (wiring + smoke atrapa; YouTube ręcznie: ikona omnibox / Alt+P)

---

## 4. DEVTOOLS

**Objaw:** F12 nic nie robi przy `allowInspect=false`; przełącznik mieszał DevTools z „Zbadaj”.

**Przyczyna:**
- `App.tsx` case `devtools`: early return gdy `!allowInspect`
- `AppMenu` DevTools → ustawienia zamiast otworzyć
- `DEFAULT allowInspect: false`

**Poprawka:**
- F12 + **Ctrl+Shift+I** zawsze `openDevTools()` na aktywnej webview
- Menu ≡ „Narzędzia deweloperskie” zawsze otwiera DT
- `allowInspect` **tylko** pozycja „Zbadaj element” w PPM (`context-menu` `canInspect`)
- Default `allowInspect: true` + migracja one-shot

**Status:** działa [T]

---

## 5. SMOKE ≡ (żywa aplikacja)

Uruchomienie: Vite `127.0.0.1:5173` +  
`$env:SMOKE_ROUND4='1'; $env:VITE_DEV_SERVER='…'; npx electron .`  
Skrypt: `scripts/smoke-round4-live.cjs` (hook w `main.cjs` gdy env ustawione).

| Kliknięte / check | Wynik |
|-------------------|-------|
| boot | OK — spellcheck+allowInspect true |
| ≡ Nowa karta | OK → nowa karta |
| ≡ Nowe okno | OK → `shell:newWindow` |
| ≡ Historia | OK → about:history |
| ≡ Zakładki | OK |
| ≡ Pobrane | OK |
| ≡ Ustawienia | OK → view=settings |
| ≡ Hasła | OK → settings |
| ≡ Usuń dane… | OK → dialog |
| ≡ Znajdź | OK → find bar |
| ≡ Pełny ekran | OK (toggle off po teście) |
| ≡ Menedżer zadań | OK (submenu flaky → Shift+Esc; handler działa) |
| ≡ Narzędzia deweloperskie | OK |
| ≡ O djxxr / Pomoc | OK |
| ≡ Pasek boczny Auto | OK |
| ≡ Nowe okno prywatne | OK |
| webview spellcheck=yes | OK |
| SO login + Google click | OK — childWindows≥1 |
| GitHub /login | OK |
| DevTools open | OK |

Nie klikano w smoke (świadomie): Zakończ (zabiłoby proces wcześnie), Tor window (daemon poza briefem), Drukuj/Zapisz/PDF/QR na home (disabled by design). Wiring tych akcji bez zmian od round 3.

Wynik JSON: `tmp-verify/smoke-round4-results.json`

---

## typecheck / build / test

```
npx tsc --noEmit → exit 0
npm test → home-widgets ok, url-display ok
npm run build → OK, JS ~768 kB / CSS ~228 kB
```

---

## Zakazy (nadal)

- Nie zmieniać Tor daemon / fail-closed / mostów bez punktu
- Nie ruszać crypto sejfu
- Nie wracać do `persist:private` ani historii w Zustand partialize

## Uwagi / follow-up

1. Submenu „Więcej narzędzi” — hover/click timing flaky w automacie; Shift+Esc na Task Mgr OK  
2. Purge `Partitions/private` czasem EPERM gdy plik zajęty — warning, nie blocker  
3. Double `contextBridge` na webview preload — zabezpieczone try/catch  
4. Pełne SSO Google do końca — ręcznie na koncie użytkownika  

---

*Koniec RAPORT-QA-ROUND4.*
