@echo off
title AIMZY - Servidor
cd /d "%~dp0"
echo ============================================
echo   AIMZY - iniciando servidor...
echo   Site:   http://localhost:3000
echo   Admin:  http://localhost:3000/painel-admin
echo   Para parar: feche esta janela ou CTRL+C
echo ============================================
node server.js
pause
