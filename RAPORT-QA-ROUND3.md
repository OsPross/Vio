# Raport QA — djxxr (runda „naprawdę działa” / round 3)

Data: 2026-10-01  
Dla: Grok (pisanie kolejnych promptów bez dostępu do repo)  
Pełniejszy stan: `docs/FULL_STATE.md`  
Poprzednia runda UI: `RAPORT-QA-ROUND2.md` (sidebar Auto, private/tor okna, ≡, Zakładki/Pobrane)

**typecheck / build / test:** OK  
**Git:** 2.55.0.windows.5, lokalne `master` (bez remote)  
**NIE ruszano:** Tor daemon / OpenPGP verify, crypto sejfu haseł, privacy presets (tylko UI kontrolek wokół haseł)

---

## Commity tej rundy

| Hash | Message |
|------|---------|
| `8f99cce` | baseline przed rundą napraw |
| `a4243b7` | fix: context menu popup window and coords |
| `d2ff869` | fix: never persist private browsing sessions |
| `1bf0e40` | fix: historia tylko history.cjs, migracja z Zustand |
| `347bf17` | fix: Passwords/Shield/WidgetSettings/App dialogi na Input/Switch |
| `da3a370` | docs: FULL_STATE po rundzie napraw |

---

## 1. Menu kontekstowe (guest + chrome)

**Objaw:** PPM na stronie / w polach chrome — „nic się nie dzieje” albo menu w złym miejscu/oknie.

**Przyczyna:**
- `Menu.popup` szło na złe `BrowserWindow` (`mainWindow` zamiast okna hostującego dany webview)
- współrzędne guest (`params.x/y`) traktowane jak window coords → popup poza obszarem

**Poprawka (`electron/context-menu.cjs`, wiring w `main.cjs`):**
- `hostWindowForGuest(webContents)` → właściwe okno
- `Menu.popup({ window })` **bez** wymuszania `x/y` z guest (kursor systemowy)
- logi diagnostyczne przy attach / popup
- `attachChromeEditMenu` — Cut / Copy / Paste w polach edycyjnych chrome (omnibox itd.)
- backup: `web-contents-created` + `setWindowOpenHandler` dla OAuth popupów (nie blokować legitimnych window.open)

**Status:** działa [T] (probe + commit `a4243b7`)

**Pliki:** `electron/context-menu.cjs`, `electron/main.cjs`, `scripts/probe-context-menu.cjs`

---

## 2. Private browsing — zero `persist:private`

**Objaw / ryzyko:** fallback do `persist:private` mógł zostawić dane prywatne na dysku.

**Poprawka:**
- App / store: prywatna karta **wymaga** partycji `private-<uuid>`; bez niej → nowe okno boot `private` (nie tworzyć tabu w złej sesji)
- `security.cjs`: `persist:private` **wyrzucone** z dozwolonych; tylko `persist:main`, `persist:side`, oraz wzorce `private-*` / `tor-*`
- przy starcie: purge legacy `session.fromPartition('persist:private')` (clear storage)
- private = ephemeral, wipe przy zamknięciu okna (jak wcześniej w round 2)

**Status:** działa [T] (`d2ff869`)

**Pliki:** `src/App.tsx`, `src/store.ts`, `electron/security.cjs`, `electron/main.cjs`

---

## 3. Historia — jedno źródło: `history.cjs`

**Objaw / dług:** dual-write — wizyty/zapytania w `electron/history.cjs` (JSONL) **oraz** `history[]` w Zustand `moja-przegladarka-v8`.

**Poprawka:**
- `history` **usunięte** z `partialize` (nie zapisuje się już do localStorage)
- `pushHistory` / `clearHistory` / `removeHistory` → IPC (`historyRecordQuery`, `historyClear`, `historyRemoveQuery`)
- nowa IPC: `shell:history-import-queries` + `history.importQueries` — migracja starych zapytań z Zustand przy `onRehydrateStorage`
- `SearchWidget`: sugestie historii z `historyList` (queries), nie ze store
- `SettingsPage`: licznik z `historyStatus().queries`
- App: usunięte podwójne `pushHistory` + `historyRecordQuery`

**Uwaga:** zakładki nadal tylko Zustand (to OK, osobny model).

**Status:** działa [T] (`1bf0e40`)

**Pliki:** `electron/history.cjs`, `electron/main.cjs`, `electron/preload.cjs`, `src/store.ts`, `src/App.tsx`, `src/widgets/SearchWidget.tsx`, `src/components/SettingsPage.tsx`, `src/vite-env.d.ts`

---

## 4. Natywne kontrolki → `Input` / `Switch`

**Objaw:** niespójne białe checkboxy / `stog` / surowe `<input class="sr-input">` vs UI Settings/Bookmarks.

**Poprawka:**
- `PasswordsPanel` — pola tekstowe → `Input`; togglе → `Switch` (setup/unlock/preferencje/generator; file/range zostają natywne)
- `ShieldPanel` — ochrona strony → `Switch`
- `WidgetSettingsPopover` — zegar/data/sekundy/skróty → `Switch`
- `App.tsx` — dialog certyfikatu + dialog uprawnień „Zapamiętaj” → `Switch`

**NIE zmieniano:** logiki sejfu / IPC haseł (tylko UI).

**Status:** działa [T] (`347bf17`)

**Pliki:** `PasswordsPanel.tsx`, `ShieldPanel.tsx`, `WidgetSettingsPopover.tsx`, `App.tsx`

---

## 5. Menu ≡ — weryfikacja wiring

Code audit: wszystkie `AppMenuActions` mają handlery w `App.tsx` (~linie 2415–2488):

Nowa karta / okno / prywatne / Tor · sidebar mode · Hasła · Historia · Zakładki · Pobrane · Usuń dane · Zoom · Fullscreen · Druk / Znajdź / Zapisz / PDF · Kopiuj link / QR · Task mgr / DevTools / Źródło · About · Ustawienia · Quit.

**Status:** działa [T] (wiring); pełny klik GUI w żywej app — do smoke u użytkownika.

---

## 6. Infra

- Git zainstalowany (winget `Git.Git`)
- `.gitignore` (m.in. `tmp-verify`, userData/Partitions)
- `docs/FULL_STATE.md` zaktualizowany: statusy [T]/[K], commity, rekomendacje

---

## Stack (skrót)

| | |
|--|--|
| Electron | 44.5.0 (Chromium 152 / Node 24 / V8 15.2) |
| React | 19 + Vite 6 + Zustand persist `moja-przegladarka-v8` |
| Partycje | `persist:main`, `persist:side`, `private-<uuid>`, `tor-<uuid>` |
| Historia | **tylko** `electron/history.cjs` via IPC |
| Bundle | ~765 kB JS / ~228 kB CSS |

Uruchomienie: `npm run electron:dev`

---

## Co nadal otwarte / rekomendacje na kolejny prompt

1. **Smoke GUI** w `electron:dev`: ≡ private/tor, PPM na https, private bez Partitions na dysku, historia po migracji.
2. Bundle: code-split `App.tsx` / metrics (~765 kB warning).
3. `"type": "module"` albo przenieść test url-display (MODULE_TYPELESS warning).
4. E2E skrótów guest (`before-input`).
5. Uprościć dual adblock (Ghostery vs legacy).
6. Opcjonalnie oficjalny protokół `djxxr://` w sesji (mniej pułapek webview).
7. Remote git — lokalnie tylko `master`.

**Częściowo / niepewne (nie naprawiane w round 3):** PiP UI, DevTools gated, spellcheck perf↔session, pełne ścieżki `window.open`, Tor leak test poza `npm test`.

---

## Zakazy dla kolejnych agentów (brief)

- Nie zmieniać Tor daemon / fail-closed OpenPGP / mostów, chyba że punkt tego wymaga.
- Nie ruszać crypto sejfu haseł — tylko UI wokół OK.
- Private: **nigdy** `persist:private`; tylko `private-<uuid>`.
- Historia: **nie** wracać do Zustand `history` w `partialize`.

---

*Koniec RAPORT-QA-ROUND3. Szczegóły tabel statusów: `docs/FULL_STATE.md` §5–11.*
