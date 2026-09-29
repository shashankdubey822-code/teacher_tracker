@echo off
title MRU Teacher Timetable & Availability Tracker
cd /d "%~dp0"

echo ========================================================
echo   MRU Teacher Timetable & Availability Tracker
echo   EduPage Reverse Engineered for Manav Rachna University
echo ========================================================
echo.

echo [1/3] Checking Python dependencies...
python -m pip install -r backend\requirements.txt --quiet --disable-pip-version-check

echo.
echo [2/3] Starting backend server on http://localhost:8000...
start /b python backend\server.py

timeout /t 2 /nobreak >nul

echo.
echo [3/3] Launching web app in your browser...
start http://localhost:8000

echo.
echo ========================================================
echo   Server is running!
echo   Open: http://localhost:8000
echo   To stop the server, simply close this command window.
echo ========================================================
echo.
pause
