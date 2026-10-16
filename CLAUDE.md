# CLAUDE.md — Vio

Vio is a private desktop web browser (Windows first, Linux builds too). It is **not** a Chromium fork: it is an Electron app with its own React UI, and web pages run inside `<webview>` tags. It has a normal mode, ephemeral private windows, isolated Tor mode, an encrypted password vault, Ghostery adblock, Chrome extensions, a widget home page and a metrics/task manager.
npm name `moja-przegladarka`, productName **Vio**, appId `local.djxxr.przegladarka`, version 0.1.0. Docs and reports are mostly in Polish.

## Stack
- Electron ^44.5 (main process in CommonJS `.cjs`), electron-builder ^26 (NSIS on Windows, rpm and AppImage on Linux), electron-updater ^6.8
- React 19, Vite 6, TypeScript 5.7 (`strict`), Zustand 5 (persist), motion 13, lucide-react, @dnd-kit
- @ghostery/adblocker-electron, electron-chrome-extensions ^4.9, openpgp (verifies the Tor bundle)
- Node 20+. There is no React Router, no SQLite and no CI.

## Commands
| Task | Command |
|---|---|
| Dev (Vite :5173 + Electron) | `npm run electron:dev` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm test` (a chain of node/tsx tests in `test/`) |
| Lint / format | `npm run lint` (currently 0 errors, ~43 warnings) / `npm run format` |
| Renderer build | `npm run build` (`tsc -b && vite build` → `dist/`) |
| Windows installer | `npm run electron:build` → `release/` |
| Linux | `npm run electron:build:linux` → `release-linux/` |
| Release + auto-update | `npm run release` (needs `GH_TOKEN` in env, **never** in the repo; see `docs/REPO.md`) |
| Tor / vault checks | `node scripts/test-tor-leaks.cjs`, `node scripts/test-tor-wiring.cjs`, `node scripts/test-passwords*.cjs` |

After changing `electron/*.cjs`, **restart Electron**: Vite HMR only reloads the renderer.

## Architecture
```
Electron main  electron/main.cjs  (boot, partitions, wiring, quit/wipe)
  ├─ electron/ipc/register-*.cjs   one file per domain, all registered at the end of main.cjs
  ├─ electron/ipc/channels.cjs     IPC channel names ('shell:*'), mirrored in src/lib/ipc-channels.ts
  ├─ electron/windows/create-window.cjs  BrowserWindow (contextIsolation, sandbox, webviewTag)
  ├─ electron/windows/wire-guest.cjs     per-webview wiring (permissions, popups, events)
  └─ domain modules (below)
Preloads
  electron/preload.cjs           → window.shell  (app UI; typed in src/vite-env.d.ts)
  electron/webview-preload.cjs   → window.__djxxrPw (guest pages: autofill bridge only, no vault/Node)
  electron/popup-chrome-preload.cjs → window.popupChrome (popup window chrome)
Renderer (src/)
  App.tsx → features/shell/AppChrome → features/tabs (TabStrip, TabContent, TabWebview)
          → features/omnibox/BrowserChrome, features/dialogs/*, components/*, widgets/*
```
IPC flow: UI calls `window.shell.x()` → `preload.cjs` (`ipcRenderer.invoke`/`on`) → `register-*.cjs` → module. Sensitive handlers check `assertFromApp` (the sender must be the main window). **A new channel needs all 4 edits:** `channels.cjs`, `ipc-channels.ts`, `preload.cjs`, `vite-env.d.ts`.

### Partitions (sessions)
| Partition | On disk? | Used for |
|---|---|---|
| `persist:main` | yes | normal browsing |
| `private-<uuid>` | never | private windows (ephemeral) |
| `tor-<uuid>` | never | Tor tabs, SOCKS5 to the local tor, wiped on close/quit |
| `persist:private` | **forbidden**, legacy, purged at boot | — |
Helpers: `electron/lib/partition-names.cjs` (`assertEphemeralPrivate`), `electron/window-mode.cjs`. Test: `test/partitions.test.cjs`.

### Main-process modules (electron/)
- `tor.cjs`, `tor-daemon.cjs`, `tor-control.cjs`, `tor-bridges-builtin.cjs`, `tor-keys/`: Tor session, bundle download (OpenPGP + SHA256, fail-closed), daemon and control port. **PROTECTED**
- `passwords.cjs`: password vault (AES-GCM + scrypt v2, main-only, `djxxr-passwords.vault`). **PROTECTED**
- `privacy.cjs`: privacy presets Standardowa / Ścisła / Własna, per-site exceptions (`djxxr-privacy.json`). **PROTECTED**
- `security.cjs`: CSP, permission handlers, hardening
- `session.cjs`: session/partition setup
- `adblock-plus.cjs`: Ghostery engine, lists in `userData/adblock-lists/`, cosmetic filters
- `ua-chrome.cjs` + `lib/ua-brands.cjs`: Chrome UA and client hints. **Never add "Electron" to the UA** (it breaks Google login)
- `google-login.cjs`, `lib/google-auth.cjs`: Google sign-in in a normal tab
- `popups.cjs` + `lib/popup-policy.cjs`: popup and OAuth window policy
- `extensions.cjs`, `lib/chrome-extension-id.cjs`, `lib/chrome-webstore-companion.cjs`: Chrome extensions and Web Store install
- `updater.cjs`: electron-updater (GitHub provider; `dev-app-update.yml` for local tests)
- `history.cjs`, `notes.cjs`, `downloads.cjs`, `favicon-cache.cjs`, `home-bg.cjs`, `bookmarks-import.cjs`: data on disk (use `lib/atomic-write.cjs`)
- `metrics.cjs`, `perf.cjs`: task manager and perf probes
- `context-menu.cjs`, `certificate.cjs`, `spellcheck.cjs`, `pip.cjs`, `mouse-nav.cjs`, `shortcuts-guest.cjs`, `webcontents-events.cjs`, `window-events.cjs`
- `dev-sync.cjs`: the "Pobierz zmiany" git fast-forward button (dev builds only)
- `lib/logger.cjs`: `getLogger(ns)`. Use it instead of a bare `console.log` in main.

### Renderer state (src/store/)
- One Zustand store, `useStore` (`store/index.ts`), built from slices: `tabsSlice`, `settingsSlice`, `sessionSlice`, `uiSlice`, `homeSlice`
- Persisted under key `moja-przegladarka-v8` (`constants.ts` `PERSIST_KEY`); migrations and merging in `src/lib/persistMerge.ts`, defaults in `DEFAULT_SETTINGS`
- **Browsing history is NOT in Zustand.** It lives on disk via `electron/history.cjs`. Tab contents are RAM only.
- Hooks in `src/hooks/` (`useIpcEvents`, `useShortcuts`, `useSessionPersist`, `useTorSession`, `useTabLifecycle`, …)

### Where to change what
| Want | Look first |
|---|---|
| Tab/webview behaviour | `src/features/tabs/TabWebview.tsx` (lazy chunk `feat-tab-webview`) |
| Tab strip / drag and drop | `src/features/tabs/TabStrip.tsx` |
| Omnibox | `src/features/omnibox/BrowserChrome.tsx`, `src/lib/tabNavigate.ts`, `omniboxGhost.ts`, `bangs.ts` |
| Settings UI | `src/components/settings/sections/*` |
| Shortcuts | `src/lib/shortcutsRegistry.ts` + `src/hooks/useShortcuts.ts` |
| Home page widgets | `src/widgets/*` (`registry.ts`), `store/homeSlice.ts` |
| Shared UI primitives | `src/components/ui/*` (Switch, Select, Slider, Dropdown…). Reuse them. |

More: `docs/ARCHITECTURE.md`, `PROJECT_OVERVIEW.md` (Tor/privacy details), `docs/FULL_STATE.md`, `docs/reports/RAPORT-*.md` (history of past work rounds).

## HARD RULES
1. **Do not modify without explicit permission from the user:** Tor code (`tor*.cjs`, `tor-keys/`, Tor parts of downloads/favicon/session/`useTorSession`), vault crypto (`passwords.cjs`, `webview-preload.cjs` autofill bridge), privacy presets (`privacy.cjs` + their settings), and partition rules (`persist:private` stays forbidden; `partition-names.cjs`).
2. **Tor and private tabs stay isolated:** no Tor/private request goes through `defaultSession` or `persist:main`, no favicon/history/disk write for Tor, and no permissions for Tor. Run `scripts/test-tor-leaks.cjs` if anything near this is touched.
3. **Never log, print or commit secrets** (tokens, `GH_TOKEN`, keys, vault contents, passwords, cookies). Do not weaken `.gitignore`'s secret patterns.
4. Do not loosen the security of `create-window.cjs` (contextIsolation, sandbox, nodeIntegration false) or remove `assertFromApp` checks.
5. Do not add "Electron" to the user agent.

## Conventions
- Main process: CommonJS `.cjs`, `'use strict'`, `module.exports = { … }`, factory pattern `createX(deps)` / `register(ipcDeps)`. Files are kebab-case.
- Renderer: TS strict (unused vars allowed), function components, PascalCase `.tsx` components, camelCase `.ts` lib/hooks (`useX.ts`), import alias `@/*` → `src/*`. Feature folders have an `index.ts` barrel.
- Styling: plain CSS, no Tailwind and no CSS modules. Big global `src/styles.css` (~5.5k lines) + `src/styles/*.css`; className-based, inline `style` only for dynamic values. Fonts are local `@fontsource`, with no CDNs (CSP).
- Comments and UI strings: UI text is Polish; code comments are mixed EN/PL.
- File size target: App / store index / Settings shell / main.cjs each < 600 lines.
- Tests: `test/*.test.{mjs,cjs}`, plain `node:assert`, no framework. Add new test files to the `npm test` chain in `package.json`.

## Workflow
- The user does not read code. **At the end of each task, explain in simple Polish** what changed and what it means for using the browser.
- Before saying "done": run `npm run typecheck` and `npm test` (plus the Tor/vault scripts if relevant). For UI changes, launch `npm run electron:dev` and check. Report failures honestly.
- Commit only files you changed yourself (the working tree often holds other uncommitted WIP). Never commit `graphify-out/`, `.claude/`, `release*/`, `dist/`, `tmp-verify/`, or screenshots. Do not push unless asked (there is no remote yet; see `docs/REPO.md`).
- After code changes, run `graphify update .` (Graphify is set up; the graph is in `graphify-out/`).

## Tools / plugins
- **Graphify:** code navigation first: `graphify query "<question>"`, `graphify path A B`, `graphify explain <node>`; overview in `graphify-out/GRAPH_REPORT.md`.
- **Context7:** look up Electron/React/Vite/Zustand/electron-builder APIs instead of guessing (Electron 44 and React 19 are recent).
- **Context Mode** (`ctx_batch_execute` / `ctx_execute`): for large outputs (test logs, lint, big files, git log).
- **Agent Skills:** use them where they fit (debugging, security-and-hardening for anything near Tor/vault, code-review before bigger commits).
- Do not install new plugins or MCP servers without asking (limit ~6 in total).

## Known issues / TODO (as of 2026-10-16)
- `package.json` `build.publish.owner` is still `REPLACE_WITH_YOUR_GITHUB_USER`, so `npm run release` won't publish correctly yet.
- `EXTENSIONS_INSTALL_ASK` / `EXTENSIONS_INSTALL_RESPOND` exist in `electron/ipc/channels.cjs` but not in `src/lib/ipc-channels.ts` (this comes from uncommitted extensions WIP).
- `test/chrome-extension-id.test.cjs` and `test/google-auth.test.cjs` pass but are not in the `npm test` chain.
- `main.cjs` loads `scripts/probe-*`/`smoke-*` via env flags, but only when unpackaged (`!app.isPackaged`). Only `perf-bench.cjs` ships in the build.
- Large uncommitted WIP (extensions popup, Google login, adblock, UI) in the tree. There is no `main` branch locally (work happens on `master`; there is also a `cleanup-2` branch).
- `styles.css` overlaps with `styles/chrome-layout.css`; lint has ~43 warnings; repo root has stray files (`history-ui-check.png`, `BRIEFING-GROK-HOME.md`, `RAPORT-CLEANUP.md`, `tmp-verify/`).
- There is no CI, so tests only run locally.
