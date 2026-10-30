@echo off
setlocal
set "VERIFY_PYTHON=%~dp0robot_simulator\.venv\Scripts\python.exe"
if not exist "%VERIFY_PYTHON%" (
  echo Simulator Python environment is missing. See robot_simulator\README.md.
  exit /b 2
)
"%VERIFY_PYTHON%" "%~dp0tools\verify_project.py" %*
exit /b %errorlevel%
