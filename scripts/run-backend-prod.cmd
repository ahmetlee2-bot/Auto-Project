@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0run-backend-prod.ps1" %*
