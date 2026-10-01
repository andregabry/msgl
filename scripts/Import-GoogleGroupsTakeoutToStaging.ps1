[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][string]$Manifest,
    [Parameter(Mandatory)][string]$DestinationUser,
    [Parameter(Mandatory)][string]$ServiceAccountFile,
    [Parameter(Mandatory)][string]$StateDatabase,
    [string[]]$ExistingImportJson = @(),
    [string[]]$DedupKey = @(),
    [string]$LabelId = 'INBOX',
    [ValidateRange(1, 2147483647)][int]$Limit,
    [ValidateRange(1, 20)][int]$MaxRetries = 5,
    [ValidateRange(0, 60)][double]$SleepSeconds = 0.15,
    [ValidateRange(1, 8)][int]$Workers = 1,
    [string]$PythonPath = 'python',
    [switch]$ReverifyFailed,
    [switch]$RepairInternalDateFailures,
    [switch]$RepairOnly,
    [switch]$CheckDestination,
    [string]$InventoryReport,
    [switch]$RemoveGoogleWelcomeMessages,
    [switch]$CleanupOnly,
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$pythonScript = Join-Path $PSScriptRoot 'import_google_groups_takeout_to_staging.py'
foreach ($requiredPath in @($PythonPath, $pythonScript, $Manifest, $ServiceAccountFile)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Arquivo obrigatório não encontrado: $requiredPath"
    }
}

$arguments = @(
    '-u',
    $pythonScript,
    '--manifest', (Resolve-Path -LiteralPath $Manifest).Path,
    '--destination-user', $DestinationUser,
    '--service-account', (Resolve-Path -LiteralPath $ServiceAccountFile).Path,
    '--state-db', [System.IO.Path]::GetFullPath($StateDatabase),
    '--label-id', $LabelId,
    '--max-retries', [string]$MaxRetries,
    '--sleep-seconds', [string]::Format([Globalization.CultureInfo]::InvariantCulture, '{0}', $SleepSeconds),
    '--workers', [string]$Workers
)

foreach ($auditPath in $ExistingImportJson) {
    if (-not (Test-Path -LiteralPath $auditPath -PathType Leaf)) {
        throw "Auditoria de importação existente não encontrada: $auditPath"
    }
    $arguments += @('--existing-import-json', (Resolve-Path -LiteralPath $auditPath).Path)
}
foreach ($key in $DedupKey) {
    $arguments += @('--dedup-key', $key)
}
if ($DedupKey.Count -gt 0 -and $PSBoundParameters.ContainsKey('Limit')) {
    throw 'DedupKey e Limit não podem ser usados juntos.'
}
if ($PSBoundParameters.ContainsKey('Limit')) {
    $arguments += @('--limit', [string]$Limit)
}
if ($ReverifyFailed) {
    $arguments += '--reverify-failed'
}
if ($RepairInternalDateFailures) {
    $arguments += '--repair-internal-date-failures'
}
if ($RepairOnly) {
    if (-not $RepairInternalDateFailures) {
        throw 'RepairOnly exige RepairInternalDateFailures.'
    }
    $arguments += '--repair-only'
}
if ($CheckDestination) {
    $arguments += '--check-destination'
}
if ($InventoryReport) {
    $arguments += @('--inventory-report', [System.IO.Path]::GetFullPath($InventoryReport))
}
if ($RemoveGoogleWelcomeMessages) {
    $arguments += '--remove-google-welcome-messages'
}
if ($CleanupOnly) {
    if (-not $RemoveGoogleWelcomeMessages) {
        throw 'CleanupOnly exige RemoveGoogleWelcomeMessages.'
    }
    $arguments += '--cleanup-only'
}
if ($Execute) {
    if ($PSCmdlet.ShouldProcess($DestinationUser, 'Inserir mensagens canônicas do Takeout no Gmail de estágio')) {
        $arguments += '--execute'
    }
    else {
        return
    }
}

& $PythonPath @arguments
if ($LASTEXITCODE -ne 0) {
    throw "O importador terminou com código $LASTEXITCODE."
}
