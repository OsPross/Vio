# Repo współpracy (djxxr)

Instrukcja dla właściciela projektu. Agent **nie** tworzy repo na GitHubie i **nie** pushuje.

## 1. Utwórz prywatne repo „djxxr”

1. GitHub → **New repository**
2. Nazwa: `djxxr`
3. Visibility: **Private**
4. Bez README / .gitignore (lokalne już są)
5. Owner: Twoje konto (nie OsPross) — nowe, czyste repo

## 2. Podłącz remote i wypchnij `master`

W katalogu projektu (PowerShell):

```powershell
git remote add origin https://github.com/<TWOJ_USER>/djxxr.git
git push -u origin master
```

(SSH: `git@github.com:<TWOJ_USER>/djxxr.git`)

Tag bezpieczeństwa przed cleanupami: `pre-cleanup-2` zostaje lokalnie; możesz: `git push origin pre-cleanup-2`.

## 3. Dodaj kolegę jako collaborator

1. Repo `djxxr` → **Settings** → **Collaborators**
2. **Add people** → login GitHub kolegi
3. Kolega akceptuje zaproszenie e-mailem / w GitHubie

## 4. Kolega: clone i push

```powershell
git clone https://github.com/<TWOJ_USER>/djxxr.git
cd djxxr
npm ci
npm run electron:dev
```

Branchy / PR według ustaleń. Na `master` wolą fast-forward (przycisk **Pobierz zmiany** w Ustawienia → Zaawansowane, tylko w `electron:dev`).

```powershell
git checkout -b feature/foo
# …commit…
git push -u origin feature/foo
```

## 5. Aktualizacje zbudowanego .exe

Źródło (`djxxr`) jest **prywatne** — w instalatorze **nie** może być tokenu GitHub.

**Wybrane rozwiązanie:** osobne **publiczne** repo tylko na releasy, np. `OsPross/vio-releases`  
(Electron-updater czyta `latest.yml` + NSIS bez auth.)

1. Utwórz publiczne `OsPross/vio-releases` (puste).
2. W `package.json` → `build.publish`: ustaw `owner` / `repo` na to publiczne repo.
3. Lokalnie (token tylko w env, nigdy w repo):

```powershell
$env:GH_TOKEN = "<fine-grained PAT: contents write do vio-releases>"
npm run release
```

4. Sprawdź Releases na `OsPross/vio-releases` (`latest.yml` + `.exe`).

### Wydanie przez GitHub Actions (`.github/workflows/release.yml`)

Jednorazowo: w repo `Vio` → Settings → Secrets and variables → Actions dodaj secret `RELEASES_TOKEN`
(fine-grained PAT, Contents: read/write tylko do `vio-releases`).

Każde wydanie (wersja musi być wyższa niż ostatnia w `vio-releases`):

```powershell
npm version patch          # podbija package.json i tworzy tag vX.Y.Z
git push origin main --follow-tags
```

Workflow buduje `.exe` (NSIS), `.rpm`, `.AppImage` i `.flatpak` i wrzuca je jako **draft** do `vio-releases`.
Wejdź w Releases i kliknij **Publish** — dopiero opublikowany release widzi updater.

Auto-update: Windows (exe), AppImage i rpm aktualizują się same (`latest.yml` / `latest-linux.yml`).
Flatpak (plik `.flatpak`) nie ma auto-update — updater jest w nim wyłączony; nową wersję instaluje się ręcznie.

## 6. Test updatera lokalnie

Skopiuj `dev-app-update.yml.example` → `dev-app-update.yml` (gitignore) i ustaw `url` na lokalny serwer plików z `latest.yml`. W unpackaged Electron ładuje ten plik gdy `electron-updater` jest w trybie testowym (patrz `electron/updater.cjs`).

**logowanie Google zależy od UA – nie dodawać Electron do UA.**
