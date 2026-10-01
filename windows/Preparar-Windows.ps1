[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Install-WingetPackage {
    param(
        [Parameter(Mandatory)][string]$CommandName,
        [Parameter(Mandatory)][string]$PackageId,
        [Parameter(Mandatory)][string]$DisplayName
    )

    if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
        Write-Host "$DisplayName já está instalado."
        return
    }
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "winget não foi encontrado. Instale o App Installer da Microsoft Store e execute novamente."
    }
    Write-Host "Instalando $DisplayName..."
    & $winget.Source install --exact --id $PackageId --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "A instalação de $DisplayName terminou com código $LASTEXITCODE."
    }
}

Install-WingetPackage -CommandName pwsh -PackageId 'Microsoft.PowerShell' -DisplayName 'PowerShell 7'
Install-WingetPackage -CommandName python -PackageId 'Python.Python.3.12' -DisplayName 'Python 3.12'
Install-WingetPackage -CommandName gcloud -PackageId 'Google.CloudSDK' -DisplayName 'Google Cloud CLI'

$pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
$python = Get-Command python -ErrorAction SilentlyContinue
if ($pythonLauncher) {
    $pythonExecutable = $pythonLauncher.Source
    $pythonPrefixArguments = @('-3')
}
elseif ($python) {
    $pythonExecutable = $python.Source
    $pythonPrefixArguments = @()
}
else {
    $installedPython = Get-ChildItem -Path (Join-Path $env:LocalAppData 'Programs/Python/Python*/python.exe') -File -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if (-not $installedPython) {
        throw 'Python foi instalado, mas ainda não está acessível. Reinicie o Windows e execute novamente.'
    }
    $pythonExecutable = $installedPython.FullName
    $pythonPrefixArguments = @()
}
Write-Host 'Instalando bibliotecas Google para o Python...'
& $pythonExecutable @pythonPrefixArguments -m pip install --user --upgrade google-api-python-client google-auth
if ($LASTEXITCODE -ne 0) {
    throw "A instalação das bibliotecas Python terminou com código $LASTEXITCODE."
}

$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
$pwshExecutable = ''
if ($pwsh) {
    $pwshExecutable = $pwsh.Source
}
else {
    $pwshCandidate = Join-Path $env:ProgramFiles 'PowerShell/7/pwsh.exe'
    if (Test-Path -LiteralPath $pwshCandidate -PathType Leaf) {
        $pwshExecutable = $pwshCandidate
    }
}
if (-not $pwshExecutable) {
    throw 'PowerShell 7 foi instalado, mas ainda não está acessível. Reinicie o Windows e execute novamente.'
}

Write-Host 'Instalando o módulo oficial ExchangeOnlineManagement...'
& $pwshExecutable -NoLogo -NoProfile -Command {
    Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
    Install-Module ExchangeOnlineManagement -Scope CurrentUser -Force -AllowClobber
}
if ($LASTEXITCODE -ne 0) {
    throw "A instalação do ExchangeOnlineManagement terminou com código $LASTEXITCODE."
}

$serviceAccountDirectory = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365'
New-Item -ItemType Directory -Path $serviceAccountDirectory -Force | Out-Null
Write-Host ''
Write-Host 'Dependências concluídas.' -ForegroundColor Green
Write-Host "Copie manualmente a conta de serviço para: $(Join-Path $serviceAccountDirectory 'service-account.json')"
Write-Host 'Depois, abra MigracaoGoogleGroupsM365.exe.'
Read-Host 'Pressione Enter para fechar'
