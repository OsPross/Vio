# Architecture (cleanup-2)

Short map for a second person joining the repo. Behavior-critical bans stay: Tor daemon/fail-closed/bridges, vault crypto, privacy presets, `persist:private`, history in Zustand.

## Process layout

```
Electron main (electron/main.cjs ~550)
  ├─ session partitions: persist:main | private-<uuid> | tor-<uuid>
  ├─ electron/ipc/register-*.cjs + channels.cjs
  ├─ electron/windows/{create-window,wire-guest}.cjs
  ├─ Ghostery adblock, extensions, passwords, history, notes, metrics…
  └─ BrowserWindow → preload.cjs → React UI (src/)

Renderer (Vite/React)
  ├─ src/App.tsx                 — layout + compose (~376 lines)
  ├─ src/hooks/                  — useIpcEvents, useShortcuts, useSessionPersist, useTorSession, …
  ├─ src/store/                  — Zustand slices + persist v8 (history NOT persisted)
  ├─ src/features/tabs/          — TabStrip, TabContent, TabWebview
  ├─ src/features/omnibox/       — BrowserChrome, useOmniboxDraft
  ├─ src/features/dialogs/       — overlays, bookmark handlers
  ├─ src/components/settings/    — SettingsPage shell + sections/*
  └─ src/lib/                    — bangs, shortcuts, persistMerge, tabNavigate, ipc-channels…
```

## Partitions

| Name | Persist? | Use |
|------|----------|-----|
| `persist:main` | yes | Normal browsing |
| `private-<uuid>` | **never** | Private window (ephemeral) |
| `tor-<uuid>` | no | Tor mode session |
| `persist:private` | **forbidden** | Legacy — purged at boot |

Helpers: `electron/lib/partition-names.cjs`, `electron/window-mode.cjs`.

## IPC flow

1. UI calls `window.shell.*` (typed in `src/vite-env.d.ts`).
2. `electron/preload.cjs` → `ipcRenderer.invoke/on` (channel names in `src/lib/ipc-channels.ts`).
3. `electron/main.cjs` → `electron/ipc/register-*.cjs` → module APIs.

## Where to change what

| Want | Look first |
|------|------------|
| Tab / webview behavior | `src/features/tabs/TabWebview.tsx` |
| Tab strip / DnD | `src/features/tabs/TabStrip.tsx` |
| Omnibox chrome | `src/features/omnibox/BrowserChrome.tsx` |
| Omnibox titles / internal URLs | `src/lib/tabNavigate.ts` |
| Settings UI | `src/components/settings/sections/*` |
| Settings defaults / migrate | `DEFAULT_SETTINGS` + `src/lib/persistMerge.ts` |
| Keyboard shortcuts allowlist | `src/lib/shortcutsRegistry.ts` + `src/hooks/useShortcuts.ts` |
| Popup / OAuth policy | `electron/lib/popup-policy.cjs` → `electron/popups.cjs` |
| Chrome UA brands | `electron/lib/ua-brands.cjs` |
| History / notes on disk | `electron/history.cjs`, `electron/notes.cjs` (atomic write) |
| Bookmarks export | `electron/ipc/register-bookmarks.cjs` (atomic) |
| Panel crash isolation | `src/components/ErrorBoundary.tsx` |

## Size targets (cleanup-2)

App / store index / Settings shell / main — each &lt; 600 lines. See `docs/reports/RAPORT-CLEANUP-2.md`.
