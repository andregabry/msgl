#!/bin/zsh

SCRIPT_DIRECTORY="${0:A:h}"

pwsh -NoLogo -NoProfile -File "$SCRIPT_DIRECTORY/scripts/Start-GoogleGroupsMigrationMenu.ps1"
MENU_EXIT_CODE=$?

echo
echo "O menu terminou com o código $MENU_EXIT_CODE. Pressione qualquer tecla para fechar."
read -k 1
exit $MENU_EXIT_CODE
