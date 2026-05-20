@echo off
set "ROOT=%~dp0"
echo ==============================================
echo ☢️ ЗАПУСК СИСТЕМЫ СЕКТОР X (BUNKER)
echo ==============================================

echo [1/2] Запуск Бэкенда...
start "BUNKER BACKEND" cmd /k "cd /d %ROOT%backend && npm run dev"

echo [2/2] Запуск Фронтенда...
start "BUNKER FRONTEND" cmd /k "cd /d %ROOT%frontend && npm run dev"

echo ----------------------------------------------
echo ✅ Система запущена! 
echo 1. Введи IP из окна localtunnel в браузере (если спросит).
echo 2. Открой бота в Telegram.
echo ----------------------------------------------
pause
