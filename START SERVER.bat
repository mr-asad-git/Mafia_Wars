@echo off
echo.
echo  Starting Mafia Wars Server...
echo.
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not found. Download from https://nodejs.org
    pause
    exit /b 1
)
if not exist "node_modules" (
    echo  Installing dependencies...
    npm install
    echo.
)
node server.js
pause
