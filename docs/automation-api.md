# Vio automation API (Soul) — v2

Local API that lets the desktop assistant **Soul** control **normal** Vio tabs.
Code: `electron/lib/automation.cjs` (server, commands, events), `electron/lib/automation-scripts.cjs` (v2 page scripts),
`electron/ipc/register-automation.cjs` (Electron wiring), `src/hooks/useAutomationBridge.ts` (tab store bridge),
`src/components/SoulIndicator.tsx` (toolbar icon, STOP, side panel), `src/components/settings/sections/SoulLog.tsx`
(command log in Settings).

API v2 is backward compatible with v1: every v1 command, the port, auth, consent and `automation.json` are unchanged.
A v1 client that never sends `hello` / `subscribe` keeps working and receives no events.

## Enabling

Settings → **Zaawansowane** → group **Soul** → **„Pozwól Soul sterować przeglądarką”**. Off by default
(`settings.automationEnabled`). The same group shows the **command log** (last 200 commands: time, command, tabId,
result — never field values or URLs) and the **„Rozłącz Soul”** button (closes all clients, code `4001`).

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

## Connection, auth, handshake

- Connect to `ws://127.0.0.1:<port>`.
- The handshake is rejected if an `Origin` header is present and is not `null` / `http(s)://localhost` /
  `http(s)://127.0.0.1` (stops web pages from connecting).
- The **first message** must be `{"id": 1, "cmd": "auth", "token": "<token>"}`. Wait for its reply before sending
  anything else. A wrong token, any other first message, or no auth within 5 s → socket closed (code `4401`).
- First successful auth for a token → native dialog in Vio: *„Soul chce sterować przeglądarką” — Zezwól / Odmów*.
  „Odmów” closes the socket (`4403`). „Zezwól” is remembered until the token changes (restart / toggle off-on).
- Auth reply: `{"id": 1, "ok": true, "result": {"authenticated": true}}`.
- Then Soul sends **`hello`**:

```json
→ {"id": 2, "cmd": "hello", "args": {"client": "soul", "version": "1.4.0"}}
← {"id": 2, "ok": true, "result": {
     "apiVersion": 2, "vioVersion": "0.1.0",
     "capabilities": ["hello", "capabilities", "subscribe", "unsubscribe", "listTabs", "…every command…"],
     "events": ["tabActivated", "pageLoaded", "tabClosed", "windowFocus", "selectionChanged", "focusedField",
                "mediaState", "soulIconClicked", "panelAction", "stopRequested"]}}
```

  `capabilities` (no args) returns the same object at any time.
- Max message 64 KB. Rate limit: **20 commands/s** per connection (excess → `"rate limited"`, socket stays open).
  Events are rate-limited too: max **20 events/s** per connection, excess events are dropped.
- While a client is connected, the Soul icon is shown in the toolbar (see *Soul icon and panel*).

## Message format

Request: `{"id": <any>, "cmd": "<name>", "args": { … }}`
Reply: `{"id": <same>, "ok": true, "result": …}` or `{"id": <same>, "ok": false, "error": "<text>"}`
Event (server push, no `id`): `{"type": "event", "event": "<name>", "data": { … }}`

## Commands

### v1 (unchanged)

| cmd | args | result |
|---|---|---|
| `listTabs` | – | `[{tabId, title, url, active, sleeping}]` — normal tabs of all normal Vio windows; `sleeping: true` = discarded or not loaded yet (restored session), call `activateTab` first |
| `openTab` | `{url}` | `{tabId}` (opens in the foreground) |
| `closeTab` | `{tabId}` | `{}` |
| `activateTab` | `{tabId}` | `{}` (also reloads a discarded tab) |
| `navigate` | `{tabId, url}` | `{}` (returns immediately; poll `getPage` or wait for `pageLoaded`) |
| `getPage` | `{tabId}` | `{url, title, text}` — `document.body.innerText`, max 20 000 chars |
| `getElements` | `{tabId, all?}` | `[{ref, role, tag, type, label, name, placeholder, value, empty, visible, checked?, options?}]` — `all: true` = whole page, not only the viewport |
| `click` | `{tabId, ref}` | `{}` |
| `fill` | `{tabId, ref, text}` | `{}` — replaces the field's content (empty `text` clears it). Also `type=time\|date\|datetime-local\|number\|range`, see Notes |
| `selectOption` | `{tabId, ref, value}` or `{tabId, ref, label}` | `{value, label}` — chooses an `<option>` of a `<select>` (label match ignores case and extra spaces) |
| `insertText` | `{tabId, text}` | `{}` — types `text` (max 10 000) into the focused editable element of the tab; no clipboard |
| `getSelection` | `{tabId}` | `{text}` — selected text of the page or of the focused field (max 10 000) |
| `pressKey` | `{tabId, key}` | `{}` — key ∈ `Enter Tab Escape Backspace Delete ArrowUp ArrowDown ArrowLeft ArrowRight PageUp PageDown Home End Space` |
| `scroll` | `{tabId, direction: "up"\|"down"}` | `{scrollY}` (80% of the viewport) |

### v2

| cmd | args | result |
|---|---|---|
| `hello` | `{client, version}` | `{apiVersion: 2, vioVersion, capabilities, events}` |
| `capabilities` | – | same as `hello` |
| `subscribe` | `{events: [...]}` | `{events}` — the connection's current subscription. Unknown name → `unknown event: <name>` |
| `unsubscribe` | `{events: [...]}` | `{events}` |
| `getReadable` | `{tabId}` | `{title, byline, text, lang}` — readability-style main text (largest `article`/`main`/`[role=main]` block, else the element holding the most paragraph text), max 50 000 chars |
| `screenshot` | `{tabId, fullPage?: false}` | `{pngBase64, width, height}` — **only the active tab of a visible, non-minimized window** (`tab not visible` otherwise). `fullPage: true` → `fullPage not supported` |
| `findInPage` | `{tabId, text, next?: bool}` | `{matches, active}` — `next: true` moves to the next match of the same text. Max 500 chars |
| `stopFind` | `{tabId}` | `{}` — clears the find highlight |
| `scrollTo` | `{tabId, ref}` or `{tabId, text}` | `{}` — scrolls the element / first visible text match (case-insensitive) to the center. `text not found`, `stale ref` |
| `mediaControl` | `{tabId?, action, value?}` | `{playing, muted, currentTime, duration, title}` — see *Media* |
| `muteTab` | `{tabId, muted: bool}` | `{}` (same as the tab's mute button) |
| `pinTab` | `{tabId, pinned: bool}` | `{}` |
| `reopenClosedTab` | – | `{tabId}` — reopens the most recently closed normal tab (`nothing to reopen` if none; never reopens a whole window) |
| `goBack` / `goForward` | `{tabId}` | `{}` — `cannot go back` / `cannot go forward` |
| `searchHistory` | `{query, limit? ≤ 20, since?}` | `[{url, title, lastVisit}]` newest first; `since` = ms timestamp (`lastVisit >= since`); default limit 10 |
| `searchBookmarks` | `{query, limit? ≤ 20}` | `[{url, title, folder}]` — matches title or URL; default limit 10 |
| `highlight` | `{tabId, ref, label?}` | `{}` — purple outline (+ optional label, max 80 chars) around the element the agent is about to act on; replaces the previous one |
| `clearHighlight` | `{tabId}` | `{}` |
| `setSoulState` | `{state, text?}` | `{}` — `state` ∈ `idle listening thinking speaking acting`; drives the Soul icon badge; `text` (max 200) is the icon tooltip |
| `panel` | `{open: bool, content?: {title, items: [{text, action?, payload?}]}}` | `{}` — small Soul side panel in Vio (max 30 items, text 500 chars). Items with `action` are buttons → `panelAction` event |

URLs without a scheme get `https://` (`"example.com"` → `https://example.com/`).

### Media

`mediaControl` acts on the page's active media element: the one that is playing, else the largest `<video>`, else
the first `<audio>/<video>` (`no media element` if none). Media inside cross-origin iframes is not reachable.

| action | value |
|---|---|
| `play`, `pause`, `toggle` | – |
| `seek` | seconds ≥ 0 |
| `seekBy` | seconds (negative = back) |
| `rate` | 0.25 – 4 |
| `volume` | 0 – 1 |

Without `tabId`: the tab whose media is playing, else the active tab. `muted` is true if the element or the whole
tab is muted. Commands run with a user gesture, so `play` works without autoplay permission.

### getElements

- Returns up to 300 visible elements (only those in the current viewport unless `all: true`; `visible` says whether the element is in the viewport): links, buttons, inputs, selects, textareas,
  contenteditable and common ARIA roles (button, link, checkbox, radio, tab, menuitem, option, switch, textbox, combobox).
- `<select>` items also have `options: [{value, label, selected}]` (max 30). `value` is the current value (select → selected option text). **Password fields always return `value: null`**;
  `empty` still says whether they are filled.
- `ref` is valid only for the latest `getElements` call on that tab (and for refs from `focusedField` events in
  between). A new `getElements` call, any navigation (including in-page SPA navigation) or a page reload makes old
  refs fail with `"stale ref"`.

### Notes

- `click`, `fill`, `selectOption`, `insertText` and `pressKey` first focus the tab's `<webview>` element in the Vio UI (this
  blurs the address bar) and then its `webContents`, so keyboard focus is in the page. `webContents.focus()` alone is not
  enough. The Vio window is not raised; while it is inactive the page gets key events but no `focus` events.
- `click` uses a DOM `click()` (after scrolling the element into view). `fill` focuses and selects the field, then types
  the text as real input (`webContents.insertText`), so React/Vue controlled inputs update.
- `fill` on `time` (`HH:MM[:SS]`), `date` (`YYYY-MM-DD`), `datetime-local` (`YYYY-MM-DDTHH:MM[:SS]`), `number` and `range`
  (`-?digits[.digits]`) validates the format (`invalid <type> value` otherwise), sets the value with the native setter and
  dispatches `input` + `change`. `range` is clamped by the browser to min/max/step.
- `insertText` / `getSelection` need a focused text field or contenteditable (`no editable element focused`); a focused
  password field gives `forbidden`.
- `pressKey` sends a real key event to the tab after focusing its `webContents`; it does not bring the Vio window to the front.
- Page scripts run in a separate JS world (id 4721): the page cannot see or override them. There is **no**
  command to run arbitrary JavaScript. `highlight` adds a `[data-vio-hl]` element to the page DOM (visible to the page).

## Events

Subscribe first: `{"id": 3, "cmd": "subscribe", "args": {"events": ["tabActivated", "selectionChanged"]}}`.

| event | data | when |
|---|---|---|
| `tabActivated` | `{tabId, url, title}` | a listed tab becomes the active tab of its window |
| `pageLoaded` | `{tabId, url, title}` | main-frame load finished (`did-finish-load`) |
| `tabClosed` | `{tabId}` | a listed tab was closed |
| `windowFocus` | `{focused}` | a normal Vio window gained / lost focus (private / Tor windows count as „not focused”). The current state is sent right after subscribing |
| `selectionChanged` | `{tabId, text}` | selection in the active tab changed and stayed the same for ~500 ms; `text` max 2000, `""` when cleared |
| `focusedField` | `{tabId, ref, type, label, editable}` or `null` | focus moved to another input/textarea/select/contenteditable in the active tab; `null` when blurred. `ref` works with `fill`/`click`. Password fields: `type: "password"`, `editable: false`, never a value |
| `mediaState` | `{tabId, playing, muted, currentTime, duration, title}` | media started playing or paused in a tab |
| `soulIconClicked` | `{}` | user clicked the Soul icon in the toolbar |
| `panelAction` | `{action, payload}` | user clicked a panel item that has an `action` (`payload` = the item's `payload` or `null`) |
| `stopRequested` | `{}` | user clicked STOP |

`selectionChanged` and `focusedField` are polled every 500 ms on the active tab (of the focused normal window), only
while at least one client is subscribed to one of them.

```json
← {"type": "event", "event": "selectionChanged", "data": {"tabId": "k3x9", "text": "zaznaczony tekst"}}
← {"type": "event", "event": "focusedField", "data": {"tabId": "k3x9", "ref": "a1b2c3d4-100001", "type": "email", "label": "E-mail", "editable": true}}
```

## Soul icon and panel

- The Soul icon (bot) is in the toolbar of every normal window **only while a Soul client is connected**. Its badge shows
  the `setSoulState` state (dot colour, pulsing for `thinking` / `acting`); the tooltip shows the state and `text`.
- Click → `soulIconClicked` event (it no longer disconnects; use „Rozłącz Soul” in Settings).
- While `state = "acting"` a red **STOP** button is shown. Clicking it:
  1. sends `stopRequested` to every subscribed client,
  2. resets the icon to `idle`,
  3. makes Vio **reject every command except** `hello`, `capabilities`, `subscribe`, `unsubscribe`, `setSoulState`
     and `panel` with `"stopped by user"` for **3 seconds**.
- `panel` opens a small panel under the toolbar on the right. The user can close it with ×. It closes and the state
  resets to `idle` when the last client disconnects.

## What is blocked

| Blocked | Error |
|---|---|
| Tor tabs (`tor-*`), private tabs/windows (`private-*`), internal pages (home, history, downloads, bookmarks, extensions, about, settings, vault) — invisible in `listTabs`, every command on them fails, **they never emit events**, cannot be read, screenshotted, highlighted or media-controlled | `forbidden` |
| `searchHistory` / `searchBookmarks`: only `http(s)` entries; private windows and Tor never write history | – |
| URLs that are not `http(s)` (`javascript:`, `file:`, `chrome:`, `devtools:`, `about:`, `djxxr:`, `vio:`, `data:`, `chrome-extension:`…) and the internal `djxxr` / `vio` hosts | `forbidden url` |
| `fill`, `insertText`, `getSelection` on `type=password` or `autocomplete=*password*` fields; no password value in `getElements`, `focusedField` or selection events | `forbidden` |
| `screenshot` of a background tab or of a hidden / minimized window | `tab not visible` |
| Any command during the 3 s after STOP (except the meta commands above) | `stopped by user` |
| Any command not listed above | `unknown command` |
| Tab whose page is not loaded (discarded / still starting) | `tab not loaded (activateTab first)` |

Isolation is enforced twice: the tab list is filtered by mode, partition and URL. Then, for every command and every
event, main checks the tab's `webContents`: it must be a `<webview>` hosted by a normal Vio window and use the
`persist:main` session. Tab events sent by the UI are accepted only from normal windows and go through the same filter.
The Soul icon, panel and state are sent only to normal windows.

## Logging

- `<userData>/logs/automation.log` (rotated to `automation.log.1` at 512 KB): connect/auth/hello events plus command
  name, tabId and ok/error. Never the token, filled text or URLs.
- In memory: the last 200 commands `{time, cmd, tabId, result}` for Settings → Soul (`result` = `ok` or the error).

## Testing

- Unit tests: `node test/automation.test.cjs` (part of `npm test`). Covers auth, origin, consent, URL blocklist,
  Tor/private/internal filtering, rate limits, the info file, every v2 command (mocked page), events (incl. Tor /
  private / internal never emitting), debounce, STOP block and the command log.
- Live on real pages: `node scripts/automation-live.cjs` (needs Vio with the Soul toggle on and a click on **Zezwól**;
  hands off mouse and keyboard, ~1.5 min). Serves Soul's `order.html`, `scripts/automation-test-page.html` and
  `scripts/automation-test-page-v2.html` on 127.0.0.1, exercises every command and event and prints a PASS/FAIL table.
  STOP, Soul icon and panel clicks need a human and are listed as MANUAL (they are covered by the unit tests).
- Live: start Vio, enable the toggle, open any https page, then `node scripts/automation-test.cjs`
  (optional argument: path to `automation.json`). Click **Zezwól** in Vio. The script prints `listTabs` and
  `getPage` of the active tab.

## Example (Node)

```js
const ws = new (require('ws'))(`ws://127.0.0.1:${port}`);
const send = (id, cmd, args) => ws.send(JSON.stringify({ id, cmd, args }));
ws.on('open', () => ws.send(JSON.stringify({ id: 1, cmd: 'auth', token })));
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.type === 'event') return console.log('event', m.event, m.data);
  if (m.id === 1) send(2, 'hello', { client: 'soul', version: '1.0' });
  if (m.id === 2) send(3, 'subscribe', { events: ['tabActivated', 'selectionChanged', 'stopRequested'] });
  if (m.id === 3) send(4, 'setSoulState', { state: 'listening' });
});
```
