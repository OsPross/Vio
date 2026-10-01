# App.tsx map (WIP — cleanup round)

Before TabWebview extract: ~3895 lines. After: ~3207.

## Extracted
| Module | Lines (approx) | Notes |
|--------|----------------|-------|
| `src/features/tabs/TabWebview.tsx` | ~705 | Guest `<webview>`, sync, favicon, passwords IPC, zoom |

## Still in App.tsx (export function App ~L95+)
| Area | Approx lines | Planned home |
|------|--------------|--------------|
| Store selectors + local UI state | ~100 | AppShell / hooks |
| Metrics / hot tabs / discard | ~80 | `hooks/useTabMetrics.ts` |
| Window boot / session persist | ~150 | `hooks/useSessionPersist.ts` |
| IPC listeners (downloads, tor, shortcuts payload, permissions, …) | ~250 | `hooks/useIpcEvents.ts` |
| Keyboard shortcuts handler | ~200 | `hooks/useShortcuts.ts` |
| Omnibox draft / navigate / bangs | ~200 | `features/omnibox/` |
| Menu / sidebar / chrome JSX | ~800 | `features/menu/` + shell |
| Dialogs (save password, about, QR, clear, bookmark) | ~200 | already partly `AppDialogs` |
| Find bar wiring | ~50 | `features/find/` |
| Tab strip JSX + DnD | ~400 | `features/tabs/TabStrip.tsx` |
| Page host (webview list + internal pages) | ~300 | `features/tabs/TabContent.tsx` |

## Other large files (targets)
| File | Lines | Plan |
|------|-------|------|
| `src/store.ts` | ~1900 | slices: tabs, settings, home, ui |
| `src/components/SettingsPage.tsx` | ~1540 | section components |
| `electron/main.cjs` | ~1600 | `ipc/register-*.cjs` |
