[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string[]]$TakeoutPath,

    [Parameter(Mandatory)]
    [string]$Group,

    [string]$ExistingManifest,

    [string]$CutoffUtc,

    [switch]$IncludePendingMessages,

    [string]$ReportRoot = (Join-Path $PSScriptRoot '..' 'reports')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$python = Get-Command python3 -ErrorAction SilentlyContinue
if (-not $python) {
    throw 'python3 não foi encontrado no PATH. O analisador usa apenas a biblioteca padrão do Python.'
}

$analyzer = Join-Path $PSScriptRoot 'get_google_groups_takeout_manifest.py'
if (-not (Test-Path $analyzer -PathType Leaf)) {
    throw "Analisador não encontrado: $analyzer"
}

$resolvedInputs = foreach ($path in $TakeoutPath) {
    if (-not (Test-Path $path)) {
        throw "Entrada Takeout não encontrada: $path"
    }
    (Resolve-Path $path).Path
}

$safeGroupName = ($Group.Trim().ToLowerInvariant() -replace '[^a-z0-9._-]', '_')
$runTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputDirectory = Join-Path $ReportRoot "takeout-$safeGroupName-$runTimestamp"

$arguments = @(
    $analyzer,
    '--group', $Group,
    '--output-dir', $outputDirectory
)

foreach ($inputPath in $resolvedInputs) {
    $arguments += @('--input', $inputPath)
}

if (-not [string]::IsNullOrWhiteSpace($ExistingManifest)) {
    if (-not (Test-Path $ExistingManifest -PathType Leaf)) {
        throw "Manifesto existente não encontrado: $ExistingManifest"
    }
    $arguments += @('--existing-manifest', (Resolve-Path $ExistingManifest).Path)
}

if (-not [string]::IsNullOrWhiteSpace($CutoffUtc)) {
    $arguments += @('--cutoff', $CutoffUtc)
}

if ($IncludePendingMessages) {
    $arguments += '--include-pending-messages'
}

& $python.Source @arguments
if ($LASTEXITCODE -ne 0) {
    throw "A análise do Takeout falhou com código $LASTEXITCODE."
}

[pscustomobject]@{
    Group           = $Group
    ReportDirectory = (Resolve-Path $outputDirectory).Path
    Summary          = (Resolve-Path (Join-Path $outputDirectory 'takeout-summary.json')).Path
    CanonicalManifest = (Resolve-Path (Join-Path $outputDirectory 'takeout-canonical-manifest.csv')).Path
    Reconciliation  = if (Test-Path (Join-Path $outputDirectory 'takeout-reconciliation.csv')) {
        (Resolve-Path (Join-Path $outputDirectory 'takeout-reconciliation.csv')).Path
    }
    else {
        $null
    }
}
