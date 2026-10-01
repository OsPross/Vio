# Architecture (cleanup round)

Short map for a second person joining the repo. Behavior-critical bans stay: Tor daemon/fail-closed/bridges, vault crypto, privacy presets, `persist:private`, history in Zustand.

## Process layout

```
Electron main (electron/main.cjs)
  ├─ session partitions: persist:main | private-<uuid> | tor-<uuid>
  ├─ IPC handlers (many still inline in main.cjs — to split into ipc/register-*.cjs)
  ├─ Ghostery adblock, extensions, passwords, history, notes, metrics…
  └─ BrowserWindow → preload.cjs → React UI (src/)

Renderer (Vite/React)
  ├─ src/App.tsx          — shell chrome (still large; extracting features/)
  ├─ src/store.ts         — Zustand + persist v8 (history NOT here)
  ├─ src/features/tabs/   — TabWebview + visit helpers
  ├─ src/components/      — pages, menu, settings, UI kit
  └─ src/lib/             — pure helpers (bangs, shortcuts, persistMerge, tabNavigate…)
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
2. `electron/preload.cjs` → `ipcRenderer.invoke/on`.
3. `electron/main.cjs` → `ipcMain.handle` / module APIs.

Planned: single `src/lib/ipc-channels.ts` + `electron/ipc/register-*.cjs` (not fully done yet).

## Where to change what

| Want | Look first |
|------|------------|
| Tab / webview behavior | `src/features/tabs/TabWebview.tsx` |
| Omnibox titles / internal URLs | `src/lib/tabNavigate.ts` |
| Settings defaults / migrate | `DEFAULT_SETTINGS` + `src/lib/persistMerge.ts` |
| Keyboard shortcuts allowlist | `src/lib/shortcutsRegistry.ts` |
| Popup / OAuth policy | `electron/lib/popup-policy.cjs` → `electron/popups.cjs` |
| Chrome UA brands | `electron/lib/ua-brands.cjs` |
| History / notes on disk | `electron/history.cjs`, `electron/notes.cjs` (atomic write) |
| Panel crash isolation | `src/components/ErrorBoundary.tsx` |

## App.tsx split status

See `docs/reports/APP-MAP-WIP.md`. Target: App &lt; 300 lines; no file &gt; 600 without justification.
