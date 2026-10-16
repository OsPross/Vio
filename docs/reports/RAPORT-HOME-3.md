# RAPORT — home 3 poprawki

| # | Commit | Przyczyna → fix | Test |
|---|--------|-----------------|------|
| 1 | `490d56d` | `personalize.css` `.pz-cstyle-grid` 3-col → **2-col** + ring padding | [K] |
| 2 | `6699e4c` | `WidgetStrip` `inert={preview\|\|editMode}` + `.hw-bare-edit` label slot / chrome `top+28` | [K] |
| 3 | `a277a4d` | `.home` `overflow-x:hidden`; `hw-place-*` `clamp()`; shell bez `min 420px` | [T] resize 1400→800, okno żyje |

typecheck OK · overflow winowaty: `.home` + absolutne `left:10%−w/2` · na później: ręczny check personalizacji/edit UI.
