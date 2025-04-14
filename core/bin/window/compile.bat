@echo off
REM Script to compile HQL into a single binary executable

REM Set the directory of this script as the current directory
cd /d "%~dp0\.."

REM Output directory for the binary
set OUTPUT_DIR=.\bin
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo Compiling HQL binary...

REM Use deno compile to create a standalone executable for Windows
echo Building for Windows target
deno compile --allow-all ^
  --output "%OUTPUT_DIR%\hql" ^
  cli/main.ts

if %ERRORLEVEL% equ 0 (
  echo Compilation successful!
  echo Binary file has been created: %OUTPUT_DIR%\hql.exe
  echo You can now add this directory to your PATH or move the binary to a directory in your PATH
) else (
  echo Compilation failed!
  exit /b 1
) 