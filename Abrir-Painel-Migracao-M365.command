#!/bin/zsh

SCRIPT_DIRECTORY="${0:A:h}"
PYTHON_BIN="/usr/bin/python3"

cd "$SCRIPT_DIRECTORY" || exit 1

"$PYTHON_BIN" "$SCRIPT_DIRECTORY/interface/server.py" --open
PANEL_EXIT_CODE=$?

echo
echo "O painel terminou com o código $PANEL_EXIT_CODE. Pressione qualquer tecla para fechar."
read -k 1
exit $PANEL_EXIT_CODE
