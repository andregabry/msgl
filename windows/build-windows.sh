#!/bin/zsh

set -euo pipefail

SCRIPT_DIRECTORY="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIRECTORY:h}"
RID="win-x64"
POWERSHELL_VERSION="7.6.5"
GCLOUD_VERSION="579.0.0"
EXCHANGE_MODULE_VERSION="3.10.1"
POWERSHELL_SHA256="32eb8f6cdce08f86e987d625a2733e54ac3e289ae7e1621b14c0b5bcec2434ea"
GCLOUD_SHA256="b745410b717dac3403017cf98c5887a44e190b2e07502b3dbf2dca421c462526"
BUILD_DIRECTORY="$PROJECT_ROOT/build/windows/$RID"
CACHE_DIRECTORY="$PROJECT_ROOT/build/windows-cache"
PACKAGE_NAME="Migracao-Google-Groups-M365-Windows-x64-PRIVADO"
PACKAGE_DIRECTORY="$PROJECT_ROOT/dist/$PACKAGE_NAME"
ZIP_PATH="$PROJECT_ROOT/dist/$PACKAGE_NAME.zip"
POWERSHELL_ARCHIVE="$CACHE_DIRECTORY/PowerShell-$POWERSHELL_VERSION-win-x64.zip"
GCLOUD_ARCHIVE="$CACHE_DIRECTORY/google-cloud-sdk-$GCLOUD_VERSION-windows-x86_64-bundled-python.zip"
SERVICE_ACCOUNT_SOURCE="${SERVICE_ACCOUNT_SOURCE:-/Users/andregabry/Projects/m365/service-account.json}"
EXCHANGE_MODULE_SOURCE="${EXCHANGE_MODULE_SOURCE:-/Users/andregabry/.local/share/powershell/Modules/ExchangeOnlineManagement/$EXCHANGE_MODULE_VERSION}"

function verify_archive() {
    local archive="$1"
    local expected="$2"
    local actual
    actual="$(shasum -a 256 "$archive" | awk '{print $1}')"
    if [[ "$actual" != "$expected" ]]; then
        print -u2 "SHA-256 incorreto para $archive"
        print -u2 "Esperado: $expected"
        print -u2 "Obtido:   $actual"
        exit 1
    fi
}

function download_if_missing() {
    local url="$1"
    local destination="$2"
    if [[ ! -f "$destination" ]]; then
        print "Baixando $(basename "$destination")..."
        curl --fail --location --retry 3 --output "$destination" "$url"
    fi
}

mkdir -p "$CACHE_DIRECTORY" "$PROJECT_ROOT/dist"
download_if_missing \
    "https://github.com/PowerShell/PowerShell/releases/download/v$POWERSHELL_VERSION/PowerShell-$POWERSHELL_VERSION-win-x64.zip" \
    "$POWERSHELL_ARCHIVE"
download_if_missing \
    "https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-$GCLOUD_VERSION-windows-x86_64-bundled-python.zip" \
    "$GCLOUD_ARCHIVE"
verify_archive "$POWERSHELL_ARCHIVE" "$POWERSHELL_SHA256"
verify_archive "$GCLOUD_ARCHIVE" "$GCLOUD_SHA256"

if [[ ! -f "$SERVICE_ACCOUNT_SOURCE" ]]; then
    print -u2 "Arquivo privado da conta de serviço não encontrado: $SERVICE_ACCOUNT_SOURCE"
    exit 1
fi
if [[ ! -f "$EXCHANGE_MODULE_SOURCE/ExchangeOnlineManagement.psd1" ]]; then
    print -u2 "Módulo ExchangeOnlineManagement $EXCHANGE_MODULE_VERSION não encontrado: $EXCHANGE_MODULE_SOURCE"
    exit 1
fi
if [[ "$PACKAGE_DIRECTORY" != "$PROJECT_ROOT/dist/"* ]]; then
    print -u2 "Caminho de saída inesperado: $PACKAGE_DIRECTORY"
    exit 1
fi

rm -rf "$BUILD_DIRECTORY" "$PACKAGE_DIRECTORY"
rm -f "$ZIP_PATH"
mkdir -p \
    "$BUILD_DIRECTORY" \
    "$PACKAGE_DIRECTORY/Resources/MigrationSystem" \
    "$PACKAGE_DIRECTORY/Resources/Private" \
    "$PACKAGE_DIRECTORY/Runtime/powershell/Modules/ExchangeOnlineManagement"

dotnet publish "$SCRIPT_DIRECTORY/MigrationWindowsLauncher/MigrationWindowsLauncher.csproj" \
    --configuration Release \
    --runtime "$RID" \
    --self-contained true \
    --output "$BUILD_DIRECTORY"

install -m 755 "$BUILD_DIRECTORY/MigracaoGoogleGroupsM365.exe" "$PACKAGE_DIRECTORY/MigracaoGoogleGroupsM365.exe"
install -m 644 "$SCRIPT_DIRECTORY/LEIA-ME-WINDOWS.txt" "$PACKAGE_DIRECTORY/LEIA-ME-WINDOWS.txt"
install -m 644 "$SCRIPT_DIRECTORY/DEPENDENCIAS-INCLUIDAS.txt" "$PACKAGE_DIRECTORY/DEPENDENCIAS-INCLUIDAS.txt"
install -m 600 "$SERVICE_ACCOUNT_SOURCE" "$PACKAGE_DIRECTORY/Resources/Private/service-account.json"

/usr/bin/ditto "$PROJECT_ROOT/interface" "$PACKAGE_DIRECTORY/Resources/MigrationSystem/interface"
/usr/bin/ditto "$PROJECT_ROOT/scripts" "$PACKAGE_DIRECTORY/Resources/MigrationSystem/scripts"
/usr/bin/ditto "$PROJECT_ROOT/templates" "$PACKAGE_DIRECTORY/Resources/MigrationSystem/templates"
mkdir -p "$PACKAGE_DIRECTORY/Resources/MigrationSystem/config"
install -m 644 "$PROJECT_ROOT/config/google-groups-system.example.psd1" \
    "$PACKAGE_DIRECTORY/Resources/MigrationSystem/config/google-groups-system.example.psd1"

unzip -q "$POWERSHELL_ARCHIVE" -d "$PACKAGE_DIRECTORY/Runtime/powershell"
unzip -q "$GCLOUD_ARCHIVE" -d "$PACKAGE_DIRECTORY/Runtime"
/usr/bin/ditto "$EXCHANGE_MODULE_SOURCE" \
    "$PACKAGE_DIRECTORY/Runtime/powershell/Modules/ExchangeOnlineManagement/$EXCHANGE_MODULE_VERSION"

PYTHON_SITE_PACKAGES="$PACKAGE_DIRECTORY/Runtime/google-cloud-sdk/platform/bundledpython/Lib/site-packages"
mkdir -p "$PYTHON_SITE_PACKAGES"
python3 -m pip install \
    --disable-pip-version-check \
    --target "$PYTHON_SITE_PACKAGES" \
    --platform win_amd64 \
    --implementation cp \
    --python-version 3.14 \
    --only-binary=:all: \
    --no-compile \
    google-api-python-client google-auth

find "$PACKAGE_DIRECTORY" -type d -name '__pycache__' -prune -exec rm -rf {} +
find "$PACKAGE_DIRECTORY" -type f \( -name '*.pyc' -o -name '.DS_Store' \) -delete

(
    cd "$PACKAGE_DIRECTORY"
    find . -type f ! -name 'SHA256SUMS.txt' -print0 |
        sort -z |
        xargs -0 shasum -a 256 > SHA256SUMS.txt
)
(
    cd "$PROJECT_ROOT/dist"
    /usr/bin/zip -q -r "$PACKAGE_NAME.zip" "$PACKAGE_NAME"
)

print "Pacote Windows privado e autocontido criado com sucesso:"
print "$ZIP_PATH"
print "SHA-256: $(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
