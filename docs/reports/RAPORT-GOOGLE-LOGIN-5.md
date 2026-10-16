# RAPORT Google Login 5 — huge update (GitHub workarounds)

## Źródła (aktualne obejścia)

| Projekt | Co robi | Ref |
|--------|---------|-----|
| **Wexond** `browser-base` | Na `accounts.google.com` usuwa `Chrome/*` (i Electron) z UA → chromeless Safari/WebKit | `src/main/user-agent.ts`, PR #559 |
| **Ferdium** | Chromeless UA na Google; **nie** woła `setUserAgent` w `will-navigate` (kasuje POST/SAML → `ERR_ABORTED`) — tylko po `did-navigate` | PR #2261, #2396 |
| **Tandem** | Na Google auth: prawdziwy UA bez fałszywych `Sec-CH-UA` (CookieMismatch); poza Google: brand „Google Chrome” + lowercase keys; skip stealth preload | `src/stealth/manager.ts` |
| **Electron** | `publickey-credentials-get/create` + `select-webauthn-account` (passkey / Win Hello) | docs session API |

## Co zmieniono w Vio

1. `electron/lib/google-auth.cjs` — wspólna detekcja URL + `buildGoogleAuthUa` (Wexond) + strip CH + brand helper
2. `electron/privacy.cjs` — Google auth: chromeless UA + strip `Sec-CH-UA*`; reszta: Tandem CH (lowercase, GREASE + Google Chrome)
3. `electron/google-login.cjs` — pauza Ghostery wcześnie; **UA dopiero po commit** (Ferdium); bez osobnego okna
4. `electron/security.cjs` — WebAuthn allow + picker kont (wcześniejszy fix)
5. `electron/ua-chrome.cjs` — Client Hints tylko lowercase
6. `test/google-auth.test.cjs`

## Crash fix (2026-10-04)

Klik „Zaloguj się” → native crash `0xFFFF7003`. Przyczyna: `webContents.setUserAgent` + (wcześniej) `unregisterPreloadScript` na accounts. **Usunięte** — zostaje tylko `privacy.cjs` webRequest (chromeless UA + strip CH). GPU HA wyłączone w `perf-boot.json` jako dodatkowa stabilizacja.

## Test

- [x] `node test/google-auth.test.cjs`
- [x] typecheck
- [ ] Gmail / YouTube: logowanie bez crasha przy „Zaloguj się”
- [ ] Brak `ERR_ABORTED` przy SSO redirectach
