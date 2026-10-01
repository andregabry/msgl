[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('Register', 'Prepare', 'ValidateM365', 'AuditStage', 'Stage', 'CleanStaging', 'CreateBatch', 'Status')]
    [string]$Phase,

    [string[]]$SourcePath,
    [string[]]$Group,
    [string]$ConfigPath,
    [ValidateSet('Reference', 'Copy')]
    [string]$StorageMode = 'Reference',
    [string]$WorkspaceRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/_migration-system'),
    [string]$ExportId,
    [string]$Domain = 'enging.pt',
    [string]$GoogleAdmin = 'andre.gabry@enging.pt',
    [string]$ExchangeAdmin = 'andre.gabry@dynamox.net',
    [string]$M365TargetDomain = 'dynamox.net',
    [string]$ServiceAccountFile = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/service-account.json'),
    [string]$PythonPath = 'python',
    [string]$MigrationEndpoint = 'GoogleWorkspace',
    [string]$TargetDeliveryDomain,
    [string]$StagingUser,
    [string]$TargetMailbox,
    [string]$BatchName,
    [ValidateRange(1, 8)][int]$Workers = 4,
    [ValidateRange(1, 2147483647)][int]$Limit,
    [switch]$ForceRebuild,
    [switch]$ApproveMessageIdConflicts,
    [switch]$ApproveNonEmptyTarget,
    [switch]$ApproveGoogleWelcomeRemoval,
    [switch]$RepairInternalDateFailures,
    [switch]$RepairOnly,
    [switch]$Execute,
    [switch]$StartBatch,
    [switch]$DisconnectWhenDone
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Import-Module (Join-Path $PSScriptRoot 'GoogleGroupMigrationState.psm1') -Force

$defaultLocalConfig = Join-Path (Join-Path $PSScriptRoot '..') 'config/google-groups-system.local.psd1'
if (-not $ConfigPath -and (Test-Path -LiteralPath $defaultLocalConfig -PathType Leaf)) {
    $ConfigPath = $defaultLocalConfig
}
if ($ConfigPath) {
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        throw "Configuração não encontrada: $ConfigPath"
    }
    $config = Import-PowerShellDataFile -LiteralPath $ConfigPath
    $configBindings = @{
        WorkspaceRoot        = 'WorkspaceRoot'
        Domain               = 'GoogleDomain'
        GoogleAdmin          = 'GoogleAdmin'
        ExchangeAdmin        = 'ExchangeAdmin'
        M365TargetDomain     = 'M365TargetDomain'
        ServiceAccountFile   = 'ServiceAccountFile'
        PythonPath           = 'PythonPath'
        MigrationEndpoint    = 'MigrationEndpoint'
        TargetDeliveryDomain = 'TargetDeliveryDomain'
    }
    foreach ($parameterName in $configBindings.Keys) {
        $configKey = $configBindings[$parameterName]
        if (-not $PSBoundParameters.ContainsKey($parameterName) -and
            $config.ContainsKey($configKey) -and
            -not [string]::IsNullOrWhiteSpace([string]$config[$configKey])) {
            Set-Variable -Name $parameterName -Value $config[$configKey]
        }
    }
}

function Resolve-GroupEmail {
    param([Parameter(Mandatory)][string]$Value, [Parameter(Mandatory)][string]$DefaultDomain)

    $normalized = $Value.Trim().ToLowerInvariant()
    if ($normalized -notmatch '@') {
        $normalized = "$normalized@$DefaultDomain"
    }
    if ($normalized -notmatch '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
        throw "Grupo inválido: $Value"
    }
    return $normalized
}

function Find-LatestValidPreparationRow {
    param(
        [Parameter(Mandatory)][string]$Workspace,
        [Parameter(Mandatory)][string]$GroupEmail
    )

    $isolatedRecord = Get-GoogleGroupPreparationRecord -WorkspaceRoot $Workspace -GroupEmail $GroupEmail
    if ($isolatedRecord) {
        $isolatedPath = Join-Path (Get-GoogleGroupStateDirectory -WorkspaceRoot $Workspace -GroupEmail $GroupEmail) 'preparation.json'
        Write-Host "Preparação isolada      : $isolatedPath"
        return $isolatedRecord
    }

    $mappingCandidates = [System.Collections.Generic.List[string]]::new()
    $latestPath = Join-Path (Join-Path $Workspace 'catalog') 'latest-preparation.json'
    if (Test-Path -LiteralPath $latestPath -PathType Leaf) {
        try {
            $latest = Get-Content -LiteralPath $latestPath -Raw | ConvertFrom-Json
            if ($latest.MappingCsv -and (Test-Path -LiteralPath $latest.MappingCsv -PathType Leaf)) {
                $mappingCandidates.Add([System.IO.Path]::GetFullPath([string]$latest.MappingCsv))
            }
        }
        catch {
            Write-Warning "A referência global da preparação não pôde ser lida; procurando por grupo. $($_.Exception.Message)"
        }
    }

    $runsRoot = Join-Path $Workspace 'runs'
    if (Test-Path -LiteralPath $runsRoot -PathType Container) {
        Get-ChildItem -LiteralPath $runsRoot -Directory -Filter 'prepare-*' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc -Descending |
            ForEach-Object {
                $candidate = Join-Path $_.FullName 'mailbox-mapping.csv'
                if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and
                    -not $mappingCandidates.Contains([System.IO.Path]::GetFullPath($candidate))) {
                    $mappingCandidates.Add([System.IO.Path]::GetFullPath($candidate))
                }
            }
    }

    foreach ($mappingPath in $mappingCandidates) {
        $selected = @(
            Import-Csv -LiteralPath $mappingPath |
                Where-Object {
                    ([string]$_.GroupEmail).Trim().ToLowerInvariant() -eq $GroupEmail
                }
        )
        if ($selected.Count -ne 1) { continue }
        $row = $selected[0]
        $requiredFiles = @([string]$row.Manifest, [string]$row.Summary)
        if (@($requiredFiles | Where-Object {
            [string]::IsNullOrWhiteSpace($_) -or -not (Test-Path -LiteralPath $_ -PathType Leaf)
        }).Count -gt 0) {
            continue
        }
        if ([string]::IsNullOrWhiteSpace([string]$row.BackupDirectory) -or
            -not (Test-Path -LiteralPath $row.BackupDirectory -PathType Container)) {
            continue
        }
        Write-Host "Preparação legada encontrada: $mappingPath"
        $runDirectory = Split-Path -Parent $mappingPath
        Save-GoogleGroupPreparationRecord `
            -WorkspaceRoot $Workspace `
            -MappingRow $row `
            -PreparationRun $runDirectory | Out-Null
        return (Get-GoogleGroupPreparationRecord -WorkspaceRoot $Workspace -GroupEmail $GroupEmail)
    }

    throw "Nenhuma preparação válida foi encontrada para $GroupEmail. Use Preparar backup para esse grupo e tente novamente."
}

$workspace = [System.IO.Path]::GetFullPath($WorkspaceRoot)

switch ($Phase) {
    'Register' {
        if (-not $SourcePath -or $SourcePath.Count -eq 0) {
            throw 'A fase Register exige -SourcePath com a pasta dos backups baixados.'
        }
        $parameters = @{
            SourcePath    = $SourcePath
            StorageMode   = $StorageMode
            WorkspaceRoot = $workspace
        }
        if ($ExportId) { $parameters.ExportId = $ExportId }
        & (Join-Path $PSScriptRoot 'Import-GoogleGroupsBackup.ps1') @parameters
        return
    }
    'Prepare' {
        $parameters = @{
            WorkspaceRoot = $workspace
            PythonPath    = $PythonPath
            M365TargetDomain = $M365TargetDomain
            ForceRebuild  = $ForceRebuild
        }
        if ($ExportId) { $parameters.ExportId = $ExportId }
        if ($Group) { $parameters.Group = $Group }
        & (Join-Path $PSScriptRoot 'Prepare-GoogleGroupsMigration.ps1') @parameters
        return
    }
    'ValidateM365' {
        $parameters = @{
            WorkspaceRoot      = $workspace
            ExchangeAdmin      = $ExchangeAdmin
            MigrationEndpoint  = $MigrationEndpoint
            DisconnectWhenDone = $DisconnectWhenDone
        }
        if ($Group) { $parameters.Group = $Group }
        & (Join-Path $PSScriptRoot 'Test-GoogleGroupsM365Readiness.ps1') @parameters
        return
    }
}

if (-not $Group -or $Group.Count -ne 1) {
    throw "A fase $Phase exige exatamente um -Group. As operações externas são deliberadamente executadas grupo a grupo."
}
$groupEmail = Resolve-GroupEmail -Value $Group[0] -DefaultDomain $Domain
$row = Find-LatestValidPreparationRow -Workspace $workspace -GroupEmail $groupEmail

$expectedStagingUser = if ($StagingUser) {
    $StagingUser.Trim().ToLowerInvariant()
}
else {
    ([string]$row.StagingUser).Trim().ToLowerInvariant()
}
$expectedTargetMailbox = if ($TargetMailbox) {
    $TargetMailbox.Trim().ToLowerInvariant()
}
else {
    ([string]$row.TargetSharedMailbox).Trim().ToLowerInvariant()
}
if ($expectedStagingUser -ne ([string]$row.StagingUser).Trim().ToLowerInvariant()) {
    throw "Isolamento bloqueou a operação: $groupEmail foi preparado para $($row.StagingUser), não para $expectedStagingUser."
}
if ($expectedTargetMailbox -ne ([string]$row.TargetSharedMailbox).Trim().ToLowerInvariant()) {
    throw "Isolamento bloqueou a operação: $groupEmail foi preparado para $($row.TargetSharedMailbox), não para $expectedTargetMailbox."
}

$restorePhase = if ($Phase -eq 'AuditStage') { 'Prepare' } else { $Phase }
$restoreParameters = @{
    Group                     = $groupEmail
    Phase                     = $restorePhase
    Domain                    = $Domain
    BackupDirectory           = [string]$row.BackupDirectory
    PreparedManifest          = [string]$row.Manifest
    PreparedSummary           = [string]$row.Summary
    ReportRoot                = Join-Path (Join-Path $workspace 'runs') 'restore'
    StateDirectoryPath        = [string]$row.StateDirectory
    ServiceAccountFile        = $ServiceAccountFile
    PythonPath                = $PythonPath
    MigrationEndpoint         = $MigrationEndpoint
    ExchangeAdmin             = $ExchangeAdmin
    M365TargetDomain          = $M365TargetDomain
    Workers                   = $Workers
    ApproveMessageIdConflicts = $ApproveMessageIdConflicts
    ApproveNonEmptyTarget     = $ApproveNonEmptyTarget
    ApproveGoogleWelcomeRemoval = $ApproveGoogleWelcomeRemoval
    RepairInternalDateFailures = $RepairInternalDateFailures
    RepairOnly                = $RepairOnly
    Execute                   = $Execute
    StartBatch                = $StartBatch
    DisconnectWhenDone        = $DisconnectWhenDone
    Confirm                   = $false
}
if ($TargetDeliveryDomain) { $restoreParameters.TargetDeliveryDomain = $TargetDeliveryDomain }
if ($StagingUser) { $restoreParameters.StagingUser = $StagingUser }
if ($TargetMailbox) { $restoreParameters.TargetMailbox = $TargetMailbox }
if ($BatchName) { $restoreParameters.BatchName = $BatchName }
if ($PSBoundParameters.ContainsKey('Limit')) { $restoreParameters.Limit = $Limit }

& (Join-Path $PSScriptRoot 'Restore-GoogleGroupToSharedMailbox.ps1') @restoreParameters
