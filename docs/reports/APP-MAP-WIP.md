# App.tsx map (cleanup-2 done)

App.tsx ~376 lines (layout + compose).

## Extracted
| Module | Notes |
|--------|-------|
| `hooks/useIpcEvents` | shell.on* + settings→shell config |
| `hooks/useShortcuts` | chrome shortcuts + trap |
| `hooks/useSessionPersist` | restore/save session |
| `hooks/useTabLifecycle` | discard timer, hot tabs, guestWc |
| `hooks/useTorSession` | Tor start/identity |
| `hooks/useBrowserNav` | go/navigate/zoom/find |
| `hooks/useAppMenuActions` | ≡ menu + command host |
| `features/tabs/{TabStrip,TabContent,TabWebview}` | strip + stage + guest |
| `features/omnibox/BrowserChrome` | chrome bar |
| `features/dialogs/*` | overlays |
| `features/shell/AppChrome` | sidebar + chrome shell |

## Other splits
| Area | Home |
|------|------|
| store | `src/store/` slices |
| settings | `components/settings/sections/*` |
| main IPC | `electron/ipc/register-*.cjs` |
| windows | `electron/windows/{create-window,wire-guest}.cjs` |
