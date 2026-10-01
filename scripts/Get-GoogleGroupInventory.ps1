[CmdletBinding()]
param(
    [string]$Domain = 'enging.pt',
    [ValidateSet('Auto', 'ServiceAccount', 'Gam')]
    [string]$AuthMode = 'Auto',
    [string]$AdminUser = 'andre.gabry@enging.pt',
    [string]$ServiceAccountFile = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/service-account.json'),
    [string]$PythonPath = 'python',
    [string]$ReportRoot = (Join-Path $PSScriptRoot '..' 'reports')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$runTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportDirectory = Join-Path $ReportRoot "google-$runTimestamp"
New-Item -Path $reportDirectory -ItemType Directory -Force | Out-Null

$scopeArguments = @()
if ($Domain) {
    $scopeArguments = @('domain', $Domain)
}

$groupsPath = Join-Path $reportDirectory 'google-groups.csv'
$groupsLogPath = Join-Path $reportDirectory 'google-groups.log'
$membersPath = Join-Path $reportDirectory 'google-group-members.csv'
$membersLogPath = Join-Path $reportDirectory 'google-group-members.log'

$resolvedMode = $AuthMode
if ($resolvedMode -eq 'Auto') {
    if ((Test-Path -LiteralPath $ServiceAccountFile -PathType Leaf) -and
        (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
        $resolvedMode = 'ServiceAccount'
    }
    else {
        $resolvedMode = 'Gam'
    }
}

if ($resolvedMode -eq 'ServiceAccount') {
    foreach ($requiredFile in @($ServiceAccountFile, $PythonPath)) {
        if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
            throw "Arquivo obrigatório não encontrado: $requiredFile"
        }
    }
    $collector = Join-Path $PSScriptRoot 'get_google_group_inventory.py'
    if (-not (Test-Path -LiteralPath $collector -PathType Leaf)) {
        throw "Coletor não encontrado: $collector"
    }
    $arguments = @(
        $collector,
        '--service-account-file', $ServiceAccountFile,
        '--admin-user', $AdminUser,
        '--domain', $Domain,
        '--groups-output', $groupsPath,
        '--members-output', $membersPath
    )
    & $PythonPath @arguments 2> $groupsLogPath
    if ($LASTEXITCODE -notin @(0, 2)) {
        throw "A coleta dos grupos falhou. Consulte: $groupsLogPath"
    }
    if ($LASTEXITCODE -eq 2) {
        Write-Warning "Alguns membros não puderam ser listados. Consulte: $groupsLogPath"
    }
}
else {
    $gam = Get-Command gam -ErrorAction SilentlyContinue
    if (-not $gam) {
        throw 'GAM7 não foi encontrado no PATH.'
    }
    $groupsArguments = @('print', 'groups') + $scopeArguments + @(
        'allfields',
        'memberscount',
        'managerscount',
        'ownerscount',
        'totalcount'
    )
    & $gam.Source @groupsArguments 2> $groupsLogPath |
        Set-Content -Path $groupsPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        throw "A coleta dos grupos falhou. Consulte: $groupsLogPath"
    }

    $membersArguments = @('print', 'group-members') + $scopeArguments
    & $gam.Source @membersArguments 2> $membersLogPath |
        Set-Content -Path $membersPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        throw "A coleta dos membros falhou. Consulte: $membersLogPath"
    }
}

[pscustomobject]@{
    AuthMode         = $resolvedMode
    ReportDirectory = (Resolve-Path $reportDirectory).Path
    GroupsCsv       = (Resolve-Path $groupsPath).Path
    MembersCsv      = (Resolve-Path $membersPath).Path
}
