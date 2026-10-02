# RAPORT — Google login clean session · 2026-10-02
Diagnoza: pauza Ghostery na `persist:main` nadal za mało (CDP/webRequest/extensions). Smoke czystej sesji → tytuł „Logowanie – Konta Google”, nie blokada.
Fix: okno na `persist:google-login` (bez adblock/preload/CDP) → po wyjściu z accounts sync cookies → reload karty.
[T] typecheck OK · smoke: formularz email (title Logowanie). [K] zaloguj w zrestartowanym Vio.
