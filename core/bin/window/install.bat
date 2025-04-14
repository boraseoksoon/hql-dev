@echo off
REM Script to install HQL as a command-line tool on Windows

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "HQL_ROOT=%SCRIPT_DIR%.."
set "HQL_SCRIPT=%SCRIPT_DIR%hql.bat"

echo HQL Installation
echo ---------------
echo This script will create a batch file for HQL and add it to your PATH.
echo.

REM Create a target directory for the batch file
set "INSTALL_DIR=%USERPROFILE%\bin"
if not exist "%INSTALL_DIR%" (
  echo Creating directory %INSTALL_DIR%...
  mkdir "%INSTALL_DIR%"
)

REM Copy the HQL batch file to the target directory
echo Installing HQL to %INSTALL_DIR%\hql.bat...
copy "%HQL_SCRIPT%" "%INSTALL_DIR%\hql.bat" > nul

REM Check if %USERPROFILE%\bin is already in PATH
set "PATH_UPDATED=0"
for /f "tokens=*" %%p in ('echo %PATH%') do (
  if "%%p" == "%INSTALL_DIR%" (
    set "PATH_UPDATED=1"
  )
)

REM Add the directory to the PATH if it's not already there
if "%PATH_UPDATED%" == "0" (
  echo Adding %INSTALL_DIR% to your PATH...
  
  REM Check if running with admin privileges
  net session >nul 2>&1
  if %errorlevel% == 0 (
    REM Running as admin, set system PATH
    setx /M PATH "%PATH%;%INSTALL_DIR%"
  ) else (
    REM Running as normal user, set user PATH
    setx PATH "%PATH%;%INSTALL_DIR%"
    echo NOTE: Added to user PATH. You may need to log out and back in for changes to take effect.
  )
) else (
  echo %INSTALL_DIR% is already in your PATH.
)

echo.
echo HQL has been installed successfully!
echo You can now use HQL from the command line:
echo   hql run hello.hql
echo   hql transpile hello.hql output.js
echo.
echo NOTE: You may need to restart your command prompt or system for changes to take effect.
pause 