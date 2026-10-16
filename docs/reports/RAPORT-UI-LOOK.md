# RAPORT — UI look + własny obraz

| # | Commit | Przyczyna → fix | Test |
|---|--------|-----------------|------|
| 1 | `6d9107a` | `.sbtn`/`.sr*` tylko w `.settings-page` → global `.sbtn` + siatka Szczegóły w `resources.css` | [T] typecheck + dev |
| 2 | `b7b23d5` | submenu overflow scrollował menu → `app-menu-scroll` + `subwrap` 100% | [K] |
| 3 | `c9d164e` | `file:`/path w CSS + `z-index:1` na sheet → `vio-bg:` + portal z-index 200 | [K]/[T] restart |
| 4 | `87773fd` | setup „Ustaw miasto” na home → ukryj bez city; miasto w Widżetach; karta CSS | [K] |

typecheck OK · Vio dev uruchomione.
