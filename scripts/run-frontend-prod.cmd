@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0run-frontend-prod.ps1" %*
