# RAPORT — Google login BrowserWindow · 2026-10-02
Diagnoza: UA bez Electron, webdriver=false; brands/Sec-CH-UA tylko Chromium (brak Google Chrome — CDP override ginie po detach).
Zmiana: `electron/google-login.cjs` — accounts.google.com w BrowserWindow (persist:main, bez preload, CDP persist); grease brands Not?A_Brand/24 + Google Chrome; webview `params.useragent`; zero inject na accounts.
[T] typecheck OK · ua-chrome.test OK · electron:dev OK · smoke login-win: brands z Google Chrome, tytuł „Logowanie – Konta Google”. [K] pełne hasło Gmail/YT — sprawdź ręcznie w otwartym oknie.
