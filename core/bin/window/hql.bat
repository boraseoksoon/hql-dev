@echo off
REM HQL Wrapper Script - Production-ready interface for HQL
REM This script provides a standardized CLI interface for HQL commands

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "HQL_ROOT=%SCRIPT_DIR%.."

REM Function to display help message
:show_help
echo HQL - Hyper Query Language
echo.
echo Usage:
echo   hql ^<command^> [options]
echo.
echo Commands:
echo   run ^<file.hql^>              Run an HQL file
echo   transpile ^<file.hql^> [out]  Transpile HQL to JavaScript
echo.
echo Global Options:
echo   --verbose, -v     Enable verbose logging
echo   --log ^<namespaces^>  Filter logging to specified namespaces
echo   --help, -h        Display help for command
echo.
echo Examples:
echo   hql run hello.hql
echo   hql transpile hello.hql output.js
goto :eof

REM Check if no arguments provided
if "%~1"=="" (
  call :show_help
  exit /b 1
)

REM Extract the command
set "COMMAND=%~1"
shift

REM Process the command
if "%COMMAND%"=="run" (
  REM Run the HQL file using the run.ts script
  deno run -A "%HQL_ROOT%\cli\run.ts" %*
) else if "%COMMAND%"=="transpile" (
  REM Transpile the HQL file using the transpile.ts script
  deno run -A "%HQL_ROOT%\cli\transpile.ts" %*
) else if "%COMMAND%"=="help" (
  REM Show help message
  call :show_help
) else if "%COMMAND%"=="--help" (
  REM Show help message
  call :show_help
) else if "%COMMAND%"=="-h" (
  REM Show help message
  call :show_help
) else (
  REM Unknown command
  echo Unknown command: %COMMAND%
  call :show_help
  exit /b 1
) 