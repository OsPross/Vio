# Omnibox ghost text (R6 follow-up)

## Przyczyna
| Plik | Miejsce | Co |
|------|---------|-----|
| `src/components/OmniboxSuggest.tsx` | `useEffect` ~L222–240 (`inlineApplied`) | Po otrzymaniu `completion.fill` wołał `onChange(host)` i `setSelectionRange(cur.length, host.length)` — **dopełnienie stawało się `value` inputa**, a sufiks był zaznaczony |
| Ten sam plik | `onKeyDown` Backspace ~L299–321 | Gdy zaznaczenie = dopełnienie, Backspace **usuwał zaznaczony sufiks** zamiast litery użytkownika |

Dlatego po „you” w polu było „youtube.com”, a dalsze pisanie/Backspace działało na całym dopełnionym tekście.

## Poprawka
- Usunięto efekt wpisujący completion do `value`.
- `value` = wyłącznie tekst użytkownika.
- Ghost: overlay `.omnibox-ghost` (ten sam font/padding, `scrollLeft`, kolor `--text-tertiary` / `--fg-3`) tylko gdy kursor na końcu, brak zaznaczenia, brak IME/paste-dismiss, prefiks hosta.
- Tab / → = przyjmij ghost; Enter z ghostem = `https://…`; Shift+Enter / Ctrl+Backspace = szukaj wpisanego; Esc chowa ghost.
- Logika w `src/lib/omniboxGhost.ts` + test `test/omnibox-ghost.test.mjs`.
- Fallback topsites w UI (jak w `history.cjs`), zanim wróci IPC.

## Commity
- `0e1cfbf` — ghost text (value tylko typed)
- `b4ddc0c` — topsite fallback przed IPC

## Testy
- `npm run typecheck` OK  
- `npm run test` OK (w tym omnibox-ghost)  
- `npm run build` OK  
- Live probe: `value` zostaje `"you"` (nie wstawia `youtube.com` do pola). Ghost wymaga suggest/topsite — pełna app z `main.cjs`.  
- Ręcznie: you→ghost tube.com; your→znik; Backspace; Enter; Tab+/feed; Shift+Enter; kursor w środku; Midnight/Paper.
