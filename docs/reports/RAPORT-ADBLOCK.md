# RAPORT-ADBLOCK · 2026-10-02
[T] typecheck OK · electron:dev OK (Vite już na :5173, restart Electron) · [K] Google first-party `gen_204`/`play…/log` nie cancel (Standard); doubleclick/pagead 3p nadal cancel.
Przyczyna: EasyPrivacy `||google.com^/gen_204?` + regex `/log` w `ElectronBlocker.onBeforeRequest` (brak bramki same-site) — gate w `electron/adblock-plus.cjs` `installRequestGate` / `shouldCancelMatch`.
Commity: `5990649` fix engine+allowlist · `c5ff8ac` ustawienia Adblock · `b23231c` tarcza ×N / Pokaż wszystkie.
Bez buildu; Tor/vault/presety/persist:private/historia nietknięte.
