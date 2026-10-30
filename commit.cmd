@echo off
setlocal
chcp 65001 >nul
where py >nul 2>nul
if errorlevel 1 (
    python "%~dp0tools\commit_project.py" %*
) else (
    py -3 "%~dp0tools\commit_project.py" %*
)
set "portal_commit_exit=%errorlevel%"
if "%~1"=="" pause
exit /b %portal_commit_exit%
