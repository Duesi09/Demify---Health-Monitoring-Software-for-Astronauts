@echo off
rem Double-click: sets up and starts the Demify phone pulse demo.
title Demify pulse demo
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Installing Node.js LTS with winget ^(click Yes if Windows asks^)...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  echo.
  echo Done. Close this window and double-click START-DEMO.cmd again.
  pause
  exit /b
)
node tools\one-click.mjs
echo.
pause
