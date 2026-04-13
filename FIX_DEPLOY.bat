@echo off
setlocal enabledelayedexpansion

echo [1/3] Searching for Git...
set "GIT_EXE="

:: Common paths for GitHub Desktop and Git for Windows
for /d %%a in ("%LocalAppData%\GitHubDesktop\app-*") do (
    if exist "%%a\resources\app\git\cmd\git.exe" set "GIT_EXE=%%a\resources\app\git\cmd\git.exe"
)
if not defined GIT_EXE (
    if exist "C:\Program Files\Git\cmd\git.exe" set "GIT_EXE=C:\Program Files\Git\cmd\git.exe"
)

if not defined GIT_EXE (
    echo [ERROR] Git not found! Please open GitHub Desktop and push manually.
    pause
    exit /b
)

echo [OK] Git found at: !GIT_EXE!

echo [2/3] Preparing files...
"!GIT_EXE!" add .
"!GIT_EXE!" commit -m "Fix ReferenceError: AnimatePresence is not defined"

echo [3/3] Pushing to GitHub...
"!GIT_EXE!" push origin main

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Changes pushed! Check Render.com dashboard.
) else (
    echo [FAILED] Push failed. Check your internet connection or GitHub login.
)

pause
