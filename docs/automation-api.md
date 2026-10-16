# Vio automation API (Soul)

Local API that lets the desktop assistant **Soul** control **normal** Vio tabs.
Code: `electron/lib/automation.cjs` (server + commands), `electron/ipc/register-automation.cjs` (Electron wiring),
`src/hooks/useAutomationBridge.ts` (tab store bridge), `src/components/SoulIndicator.tsx` (toolbar badge).

## Enabling

Settings → **Zaawansowane** → group **Soul** → **„Pozwól Soul sterować przeglądarką”**. Off by default
(`settings.automationEnabled`).

When enabled, Vio:

1. starts a WebSocket server on **127.0.0.1** only, port **47821** (or the next free one up to 47830);
2. generates a fresh random 32-byte token (hex) — new on every app start / every enable;
3. writes `{ "port": 47821, "token": "<64 hex>", "pid": 1234 }` to `<userData>/automation.json`.

`automation.json` is deleted when the toggle is turned off, when Vio quits, and at startup (crash leftovers).

### userData path

`main.cjs` pins userData to the folder **`moja-przegladarka`** (not `Vio`):

| OS | File |
|---|---|
| Windows | `%APPDATA%\moja-przegladarka\automation.json` (e.g. `C:\Users\<you>\AppData\Roaming\moja-przegladarka\automation.json`) |
| Linux | `~/.config/moja-przegladarka/automation.json` |

Permissions: written with mode `0600` (owner only) on Linux. On Windows the mode is not applied;
the file inherits the `%APPDATA%` ACL (your user, SYSTEM, Administrators).

## Connection and auth

- Connect to `ws://127.0.0.1:<port>`.
- The handshake is rejected if an `Origin` header is present and is not `null` / `http(s)://localhost` /
  `http(s)://127.0.0.1` (stops web pages from connecting).
- The **first message** must be `{"id": 1, "cmd": "auth", "token": "<token>"}`. Wait for its reply before sending
  anything else. A wrong token, any other first message, or no auth within 5 s → socket closed (code `4401`).
- First successful auth for a token → native dialog in Vio: *„Soul chce sterować przeglądarką” — Zezwól / Odmów*.
  „Odmów” closes the socket (`4403`). „Zezwól” is remembered until the token changes (restart / toggle off-on).
- Auth reply: `{"id": 1, "ok": true, "result": {"authenticated": true}}`.
- Max message 64 KB. Rate limit: 20 commands/s per connection (excess → `"rate limited"` error, socket stays open).
- While a client is connected, a bot icon appears in the toolbar. Clicking it disconnects all clients (code `4001`).

## Message format

Request: `{"id": <any>, "cmd": "<name>", "args": { … }}`
Reply: `{"id": <same>, "ok": true, "result": …}` or `{"id": <same>, "ok": false, "error": "<text>"}`

## Commands

| cmd | args | result |
|---|---|---|
| `listTabs` | – | `[{tabId, title, url, active, sleeping}]` — normal tabs of all normal Vio windows; `sleeping: true` = discarded or not loaded yet (restored session), call `activateTab` first |
| `openTab` | `{url}` | `{tabId}` (opens in the foreground) |
| `closeTab` | `{tabId}` | `{}` |
| `activateTab` | `{tabId}` | `{}` (also reloads a discarded tab) |
| `navigate` | `{tabId, url}` | `{}` (returns immediately; poll `getPage`) |
| `getPage` | `{tabId}` | `{url, title, text}` — `document.body.innerText`, max 20 000 chars |
| `getElements` | `{tabId, all?}` | `[{ref, role, tag, type, label, name, placeholder, value, empty, visible, checked?, options?}]` — `all: true` = whole page, not only the viewport |
| `click` | `{tabId, ref}` | `{}` |
| `fill` | `{tabId, ref, text}` | `{}` — replaces the field's content (empty `text` clears it). Also `type=time\|date\|datetime-local\|number\|range`, see Notes |
| `selectOption` | `{tabId, ref, value}` or `{tabId, ref, label}` | `{value, label}` — chooses an `<option>` of a `<select>` (label match ignores case and extra spaces) |
| `insertText` | `{tabId, text}` | `{}` — types `text` (max 10 000) into the focused editable element of the tab; no clipboard |
| `getSelection` | `{tabId}` | `{text}` — selected text of the page or of the focused field (max 10 000) |
| `pressKey` | `{tabId, key}` | `{}` — key ∈ `Enter Tab Escape Backspace Delete ArrowUp ArrowDown ArrowLeft ArrowRight PageUp PageDown Home End Space` |
| `scroll` | `{tabId, direction: "up"\|"down"}` | `{scrollY}` (80% of the viewport) |

URLs without a scheme get `https://` (`"example.com"` → `https://example.com/`).

### getElements

- Returns up to 300 visible elements (only those in the current viewport unless `all: true`; `visible` says whether the element is in the viewport): links, buttons, inputs, selects, textareas,
  contenteditable and common ARIA roles (button, link, checkbox, radio, tab, menuitem, option, switch, textbox, combobox).
- `<select>` items also have `options: [{value, label, selected}]` (max 30). `value` is the current value (select → selected option text). **Password fields always return `value: null`**;
  `empty` still says whether they are filled.
- `ref` is valid only for the latest `getElements` call on that tab. A new `getElements` call, any navigation
  (including in-page SPA navigation) or a page reload makes old refs fail with `"stale ref"`.

### Notes

- `click`, `fill`, `selectOption`, `insertText` and `pressKey` call `webContents.focus()` first, so keyboard focus is in the
  page (not the address bar).
- `click` uses a DOM `click()` (after scrolling the element into view). `fill` focuses and selects the field, then types
  the text as real input (`webContents.insertText`), so React/Vue controlled inputs update.
- `fill` on `time` (`HH:MM[:SS]`), `date` (`YYYY-MM-DD`), `datetime-local` (`YYYY-MM-DDTHH:MM[:SS]`), `number` and `range`
  (`-?digits[.digits]`) validates the format (`invalid <type> value` otherwise), sets the value with the native setter and
  dispatches `input` + `change`. `range` is clamped by the browser to min/max/step.
- `insertText` / `getSelection` need a focused text field or contenteditable (`no editable element focused`); a focused
  password field gives `forbidden`.
- `pressKey` sends a real key event to the tab after focusing its `webContents`; it does not bring the Vio window to the front.
- Page scripts run in a separate JS world (id 4721): the page cannot see or override them. There is **no**
  command to run arbitrary JavaScript.

## What is blocked

| Blocked | Error |
|---|---|
| Tor tabs (`tor-*`), private tabs/windows (`private-*`), internal pages (home, history, downloads, bookmarks, extensions, about, settings, vault) — invisible in `listTabs`, and every command on them fails | `forbidden` |
| Tabs in other windows (only the main normal window is exposed) | `forbidden` |
| URLs that are not `http(s)` (`javascript:`, `file:`, `chrome:`, `devtools:`, `about:`, `djxxr:`, `vio:`, `data:`, `chrome-extension:`…) and the internal `djxxr` / `vio` hosts | `forbidden url` |
| `fill`, `insertText`, `getSelection` on `type=password` or `autocomplete=*password*` fields | `forbidden` |
| Any command not listed above | `unknown command` |
| Tab whose page is not loaded (discarded / still starting) | `tab not loaded (activateTab first)` |

Isolation is enforced twice: the tab list is filtered by mode, partition and URL. Then, for every command, main
checks the tab's `webContents`: it must be a `<webview>` hosted by the normal main window and use the
`persist:main` session. If any check fails, the command is refused.

## Logging

`<userData>/logs/automation.log` (rotated to `automation.log.1` at 512 KB). The log has connect/auth events plus
command name, tabId and ok/error. It never contains the token, filled text or URLs.

## Testing

- Unit tests: `node test/automation.test.cjs` (part of `npm test`). Covers auth, origin, consent, URL blocklist,
  Tor/private/internal filtering, rate limit and the info file.
- Live: start Vio, enable the toggle, open any https page, then `node scripts/automation-test.cjs`
  (optional argument: path to `automation.json`). Click **Zezwól** in Vio. The script prints `listTabs` and
  `getPage` of the active tab.

## Example (Node)

```js
const ws = new (require('ws'))(`ws://127.0.0.1:${port}`);
ws.on('open', () => ws.send(JSON.stringify({ id: 1, cmd: 'auth', token })));
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id === 1) ws.send(JSON.stringify({ id: 2, cmd: 'listTabs' }));
  else console.log(m.result);
});
```
