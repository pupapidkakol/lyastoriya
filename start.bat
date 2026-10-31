@echo off
chcp 65001 >nul
cd /d "%~dp0server"
if not exist node_modules call npm install
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
npm start
pause