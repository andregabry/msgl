[CmdletBinding()]
param(
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$exoModule = Get-Module -ListAvailable -Name ExchangeOnlineManagement |
    Sort-Object Version -Descending |
    Select-Object -First 1

$gam = Get-Command gam -ErrorAction SilentlyContinue
$azCopy = Get-Command azcopy -ErrorAction SilentlyContinue
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$defaultConfigPath = Join-Path $projectRoot 'config/google-groups-system.local.psd1'
if (-not $ConfigPath -and (Test-Path -LiteralPath $defaultConfigPath -PathType Leaf)) {
    $ConfigPath = $defaultConfigPath
}
$config = if ($ConfigPath) {
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        throw "Configuração não encontrada: $ConfigPath"
    }
    Import-PowerShellDataFile -LiteralPath $ConfigPath
}
else {
    @{}
}
$mboxToPstPath = if ($config.ContainsKey('MboxToPstPath')) {
    [string]$config.MboxToPstPath
}
else {
    ''
}
$mboxToPstExists = $mboxToPstPath -and (Test-Path -LiteralPath $mboxToPstPath -PathType Leaf)

$result = [pscustomobject]@{
    PowerShellVersion          = $PSVersionTable.PSVersion.ToString()
    PowerShellArchitecture     = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
    ExchangeOnlineModule      = if ($exoModule) { $exoModule.Version.ToString() } else { 'NOT_FOUND' }
    ExchangeOnlineModulePath  = if ($exoModule) { $exoModule.Path } else { 'NOT_FOUND' }
    GamPath                   = if ($gam) { $gam.Source } else { 'NOT_FOUND' }
    AzCopyPath                = if ($azCopy) { $azCopy.Source } else { 'NOT_FOUND' }
    MboxToPstPath             = if ($mboxToPstExists) { $mboxToPstPath } else { 'NOT_FOUND' }
}

$result | Format-List

if ($gam) {
    & $gam.Source version
}

if ($azCopy) {
    & $azCopy.Source --version
}

if ($mboxToPstExists) {
    & $mboxToPstPath --version
}
