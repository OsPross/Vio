# Raport QA — djxxr (runda 8)

Data: 2026-10-01  
Poprzednie: `RAPORT-QA-ROUND7.md`

**typecheck / test / build:** OK  
**NIE ruszano:** Tor daemon / fail-closed / mosty, crypto sejfu, privacy presets, `persist:private`, historia w Zustand

---

## Commity

| Hash | Message |
|------|---------|
| `1097287` | fix: X1/X2 via before-mouse-event (app-command never fires on Win) |
| `5cede4b` | fix: Notes panel layout — full-height columns, empty state, opaque editor |

---

## 1. Boczne przyciski myszy (fizyczna / Win32)

### Objaw
X1/X2 nie działały prawdziwą myszą. Smoke R7 „single-source OK” był fałszywy (tylko sprawdzał obecność API).

### Przyczyna
- R7 wyłączył `mouseup` na Windows w `webview-preload.cjs` i `App.tsx`, zostawiając wyłącznie `BrowserWindow` `app-command`.
- **Diagnoza (`DJXXR_DEBUG_MOUSE=1` + `scripts/dump-xbutton-events.cjs`):**
  - `app-command` — **nigdy nie pada** przy SendInput XBUTTON1/2.
  - `before-mouse-event` — **tak**, z `button: "back" | "forward"` (mouseDown/Up).
  - DOM: `mouseup` / `pointerdown` button 3/4 (gdy nie ma `preventDefault` na before-mouse).

| Miejsce kursora | Ścieżka zdarzenia |
|-----------------|------------------|
| webview (strona) | `before-mouse:guest` → `shell:browser-nav` |
| omnibox / pasek kart | `before-mouse:host` → `shell:browser-nav` |
| about:* (bez historii) | `before-mouse:host` (nav no-op, bez crasha) |
| okno prywatne | `before-mouse:host` |
| popup | ten sam host/guest attach |

### Poprawka
`electron/mouse-nav.cjs`: **jedno źródło** = `webContents.on('before-mouse-event')` przy `mouseUp` + `back`/`forward`, `preventDefault()` (żeby DOM nie dublował), `shell:browser-nav` z dedupem 180 ms. `app-command` zostaje jako fallback. Logi pod `DJXXR_DEBUG_MOUSE=1`.

### Jak sprawdzone
Nie smoke JS — **Win32 `SendInput` XBUTTON1/2** (`scripts/send-mouse-xbutton.cjs` z `SetCursorPos` nad oknem) przez `SMOKE_MOUSE=1` → `scripts/smoke-mouse-xbutton.cjs`.

```
webview-page-x1/x2 → OK (example.org ↔ example.com)
omnibox-x1/x2      → OK (source before-mouse:host)
tab-strip-x1/x2    → OK
about-page-x1      → OK (no-crash)
private-window-x1  → OK
fail=0 / 10
```

Logi: `[mouse-nav] emit { dir: 'back', source: 'before-mouse:guest:2' }` itd.

---

## 2. Notatki — układ

### Objaw
Lista ~90 px, pusty stan łamie się na 4 linie, Szukaj wystaje, panel nie wypełnia przestrzeni.

### Przyczyna
`src/styles/widgets.css` — `.hw-notes-shell { grid-template-columns: minmax(0, 34%) … }`. W wąskim widżecie L (~460 px) 34% ≈ **90 px**. Pusty stan (`WidgetEmpty`) żył w tej kolumnie. Narrow bazował tylko na `size === 'S'`, nie na realnej szerokości.

### Poprawka
- `ResizeObserver`: wide ≥ 440 px (dwie kolumny), wąsko = lista → edytor z „←”.
- Lista 240–280 px (resizable, `localStorage`), Szukaj + „+” w tej samej kolumnie.
- Pusty stan: jeden wycentrowany blok w **całym** panelu + CTA „Nowa notatka” (Ctrl+N).
- Edytor: nieprzezroczyste tło, tytuł duży, body 15 px / 1.6, max-width ~720 px.
- PPM: Przypnij / Duplikuj / Usuń; fokus po nowej notatce.

### Zrzuty
`tmp-verify/notes-r8/` (`CAPTURE_NOTES=1`):

| Plik | Werdykt |
|------|---------|
| `notes-empty-w360/800/1280` | pusty CTA wycentrowany |
| `notes-one-w800` | 2 kolumny: lista + edytor |
| `notes-one-w360` | 1 kolumna (lista; edytor po kliku) |
| `notes-twenty-w1280` | lista 20 + edytor, scroll |

---

## typecheck / test / build

```
npm run typecheck → OK
npm run test      → OK
```

---

## Do ręcznego (max 4)

1. Fizyczna mysz X1/X2 na YouTube (webview) — jeden krok  
2. X1 przy fokusie w omniboxie  
3. Notatki: pusty → „Nowa notatka”; szeroki panel dwie kolumny  
4. Notatki wąski sidebar: lista → klik → edytor z „←”
