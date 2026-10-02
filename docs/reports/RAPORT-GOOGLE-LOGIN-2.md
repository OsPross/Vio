# RAPORT — Google login “niebezpieczna przeglądarka” · 2026-10-02
Diagnoza: UA czysty, ale Ghostery `registerPreloadScript` wstrzykiwał cosmetics w okno logowania + `persistDebugger` (CDP) = sygnał automatyzacji.
Fix: pauza session preloadów na czas BrowserWindow logowania; CDP detach; bez Sec-GPC/DNT na accounts.google.com; `AutomationControlled` off.
[T] smoke bez preload: formularz email OK (`blocked:false`). [K] pełne hasło Gmail/YT w zrestartowanej apce.
