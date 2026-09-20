@echo off
setlocal

set "FOLDER=%~dp0"
set "DESKTOP=%USERPROFILE%\Desktop"
set "START=%DESKTOP%\StartServer.bat"

(
echo @echo off
echo cd /d "%FOLDER%"
echo start "School ERP Server" cmd /k "node server.js"
echo timeout /t 5 /nobreak ^>nul
echo start "" "http://localhost:3000/"
echo exit
) > "%START%"

echo.
echo StartServer.bat created on Desktop.
echo.
pause