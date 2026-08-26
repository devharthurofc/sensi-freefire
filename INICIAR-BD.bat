@echo off
title ORCAFACIL - Teste com Banco de Dados
cd /d "%~dp0"
REM ============================================================
REM  1. Cole abaixo SUA string de conexao do MongoDB Atlas
REM     (troque <password> pela sua senha, sem os sinais de menor/maior)
REM  2. Salve este arquivo e dê dois cliques nele
REM ============================================================
set MONGODB_URI=cole-sua-string-aqui

echo ============================================
echo   SENSI PRO - modo banco de dados
echo   Site: http://localhost:3000
echo ============================================
start "" http://localhost:3000
node server.js
pause
