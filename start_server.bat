@echo off
title Smart FreshGuard - IoT Storage Chamber Server
echo =======================================================
echo   Starting Smart FreshGuard IoT Server (Port 8080)...
echo =======================================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
