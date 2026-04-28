@echo off
title Tragedy of the Commons - Simulation Server
color 0B

echo.
echo  ============================================
echo   Tragedy of the Commons - Shared Sea Edition
echo  ============================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please install Node.js from:
    echo  https://nodejs.org/
    echo.
    echo  Download the LTS version, install it,
    echo  then run this script again.
    echo.
    pause
    exit /b 1
)

:: Show Node version
echo  Node.js version:
node --version
echo.

:: Install dependencies if needed
if not exist "node_modules" (
    echo  Installing dependencies (first run)...
    echo.
    npm install
    echo.
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERROR] Failed to install dependencies.
        echo  Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo  Dependencies installed successfully!
    echo.
)

:: Start the server
echo  Starting simulation server...
echo  -------------------------------------------
echo.
echo  TEACHER: Open http://localhost:3000/admin
echo  STUDENTS: Open http://localhost:3000
echo.
echo  Press Ctrl+C to stop the server.
echo  -------------------------------------------
echo.

node server.js

:: If server exits
echo.
echo  Server stopped.
pause
