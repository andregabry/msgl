#!/bin/zsh

set -euo pipefail

SCRIPT_DIRECTORY="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIRECTORY:h}"
APP_NAME="Migração Google Groups M365.app"
EXECUTABLE_NAME="MigrationGoogleGroupsM365"
BUILD_DIRECTORY="$PROJECT_ROOT/build/macos"
APP_PATH="$PROJECT_ROOT/dist/$APP_NAME"
CONTENTS_PATH="$APP_PATH/Contents"
RESOURCE_PATH="$CONTENTS_PATH/Resources/MigrationSystem"

if [[ "$APP_PATH" != "$PROJECT_ROOT/dist/"*.app ]]; then
    print -u2 "Caminho de saída inesperado: $APP_PATH"
    exit 1
fi

rm -rf "$BUILD_DIRECTORY" "$APP_PATH"
mkdir -p "$BUILD_DIRECTORY" "$CONTENTS_PATH/MacOS" "$RESOURCE_PATH"

xcrun swiftc \
    -swift-version 5 \
    -O \
    -framework Cocoa \
    -framework WebKit \
    "$SCRIPT_DIRECTORY/MigrationApp.swift" \
    -o "$BUILD_DIRECTORY/$EXECUTABLE_NAME"

install -m 755 "$BUILD_DIRECTORY/$EXECUTABLE_NAME" "$CONTENTS_PATH/MacOS/$EXECUTABLE_NAME"
install -m 644 "$SCRIPT_DIRECTORY/Info.plist" "$CONTENTS_PATH/Info.plist"

/usr/bin/ditto "$PROJECT_ROOT/interface" "$RESOURCE_PATH/interface"
/usr/bin/ditto "$PROJECT_ROOT/scripts" "$RESOURCE_PATH/scripts"
/usr/bin/ditto "$PROJECT_ROOT/config" "$RESOURCE_PATH/config"
/usr/bin/ditto "$PROJECT_ROOT/templates" "$RESOURCE_PATH/templates"

find "$RESOURCE_PATH" -type d -name '__pycache__' -prune -exec rm -rf {} +
find "$RESOURCE_PATH" -type f -name '*.pyc' -delete

plutil -lint "$CONTENTS_PATH/Info.plist" >/dev/null
codesign --force --deep --sign - "$APP_PATH" >/dev/null

print "Aplicativo criado com sucesso:"
print "$APP_PATH"
