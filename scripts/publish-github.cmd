@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0publish-github.ps1" %*
