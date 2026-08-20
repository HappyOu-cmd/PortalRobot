@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -m robot_simulator %*
) else (
  python -m robot_simulator %*
)
