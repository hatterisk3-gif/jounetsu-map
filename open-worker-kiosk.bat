@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================================
REM 情熱MAP 作業員画面を Chrome キオスクモードで起動
REM 終了: Alt + F4
REM ============================================================

REM 公開URLがある場合は下を書き換えてください（空ならローカル起動）
REM 例: set "TARGET_URL=https://example.com/worker.html"
set "TARGET_URL="

set "PORT=8787"
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if "%CHROME%"=="" if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if "%CHROME%"=="" if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if "%CHROME%"=="" (
  echo Chrome が見つかりません。インストール後にもう一度実行してください。
  pause
  exit /b 1
)

if not "%TARGET_URL%"=="" goto LAUNCH

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js が見つからないため、ローカルファイルを直接開きます。
  set "TARGET_URL=%~dp0worker.html"
  goto LAUNCH
)

REM 簡易ローカルサーバーを起動（別ウィンドウ）
start "情熱MAP Local Server" /min cmd /c "cd /d ""%~dp0"" && node -e ""require('http').createServer((q,s)=>{const fs=require('fs'),p=require('path'),u=require('url').parse(q.url).pathname;let f=p.join(process.cwd(),decodeURIComponent(u==='/'?'/index.html':u));fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end('Not found');return;}const ext=p.extname(f).toLowerCase();const types={'.html':'text/html;charset=utf-8','.js':'application/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};s.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});s.end(d);});}).listen(%PORT%,()=>console.log('http://127.0.0.1:%PORT%'));"" & pause"

timeout /t 1 /nobreak >nul
set "TARGET_URL=http://127.0.0.1:%PORT%/worker.html"

:LAUNCH
echo.
echo キオスクモードで起動します
echo URL: %TARGET_URL%
echo 終了: Alt + F4
echo.

start "" "%CHROME%" --kiosk --new-window --user-data-dir="%TEMP%\passionmap-kiosk" "%TARGET_URL%"

endlocal
