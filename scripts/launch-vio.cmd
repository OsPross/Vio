@echo off
title Vio
cd /d "%~dp0.."
where npm >nul 2>&1
if errorlevel 1 (
  echo Brak npm w PATH.
  pause
  exit /b 1
)
REM Kill stale vite on 5173 so relaunch works
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
npm run electron:dev
