@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  🍃 正在唤醒纳西妲,请稍候…
echo.
if not exist node_modules (
  echo  [首次运行] 正在安装依赖,请稍候…
  call npm install --ignore-scripts
)
start "" http://127.0.0.1:5179
node server.js
pause

