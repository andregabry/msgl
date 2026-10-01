@echo off
setlocal

:: Start the Python server
echo Iniciando o Painel de Migracao...
echo.
echo Pressione Ctrl+C para encerrar.
echo.
python "%~dp0interface\server.py" --open

endlocal
pause
