@echo off
rem Update catalog backups and upload them to Supabase (task 11a).
rem Output: data\archives\refresh.log. Exit code = npm exit code.

setlocal
set "REPO=%~dp0.."
cd /d "%REPO%"

if not exist "data\archives" mkdir "data\archives"

rem Locate npm: an explicit NPM_CMD wins, then the standard install path.
if not defined NPM_CMD if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
if not defined NPM_CMD if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"

if defined NPM_CMD (
  call "%NPM_CMD%" run refresh:backup >> "data\archives\refresh.log" 2>&1
) else (
  call npm.cmd run refresh:backup >> "data\archives\refresh.log" 2>&1
)

exit /b %ERRORLEVEL%
