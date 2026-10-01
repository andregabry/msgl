Set-StrictMode -Version Latest

function Get-GoogleGroupStateDirectory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$WorkspaceRoot,
        [Parameter(Mandatory)][string]$GroupEmail
    )

    $normalized = $GroupEmail.Trim().ToLowerInvariant()
    if ($normalized -notmatch '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
        throw "Grupo inválido para o estado isolado: $GroupEmail"
    }
    $safeName = $normalized -replace '[^a-z0-9._-]', '_'
    return Join-Path (Join-Path ([System.IO.Path]::GetFullPath($WorkspaceRoot)) 'groups') $safeName
}

function Save-GoogleGroupPreparationRecord {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$WorkspaceRoot,
        [Parameter(Mandatory)]$MappingRow,
        [AllowEmptyString()][string]$ExportId = '',
        [AllowEmptyString()][string]$PreparationRun = ''
    )

    $groupEmail = ([string]$MappingRow.GroupEmail).Trim().ToLowerInvariant()
    $stateDirectory = Get-GoogleGroupStateDirectory -WorkspaceRoot $WorkspaceRoot -GroupEmail $groupEmail
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

    $manifest = [System.IO.Path]::GetFullPath([string]$MappingRow.Manifest)
    $summary = [System.IO.Path]::GetFullPath([string]$MappingRow.Summary)
    $backupDirectory = [System.IO.Path]::GetFullPath([string]$MappingRow.BackupDirectory)
    foreach ($requiredFile in @($manifest, $summary)) {
        if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
            throw "Não é possível registar ${groupEmail}: arquivo ausente: $requiredFile"
        }
    }
    if (-not (Test-Path -LiteralPath $backupDirectory -PathType Container)) {
        throw "Não é possível registar ${groupEmail}: backup ausente: $backupDirectory"
    }
    $summaryObject = Get-Content -LiteralPath $summary -Raw | ConvertFrom-Json
    if (([string]$summaryObject.group).Trim().ToLowerInvariant() -ne $groupEmail) {
        throw "O resumo de preparação pertence a $($summaryObject.group), não a $groupEmail."
    }

    $record = [ordered]@{
        SchemaVersion       = 1
        UpdatedAtUtc        = [DateTime]::UtcNow.ToString('o')
        GroupEmail          = $groupEmail
        ExportId            = $ExportId
        PreparationRun      = $PreparationRun
        TargetSharedMailbox = ([string]$MappingRow.TargetSharedMailbox).Trim().ToLowerInvariant()
        StagingUser         = ([string]$MappingRow.StagingUser).Trim().ToLowerInvariant()
        BackupDirectory     = $backupDirectory
        Manifest            = $manifest
        ManifestSha256      = (Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant()
        Summary             = $summary
        ConflictReview      = [string]$MappingRow.ConflictReview
        ParseDefectReview   = [string]$MappingRow.ParseDefectReview
        StateDirectory      = [System.IO.Path]::GetFullPath([string]$MappingRow.StateDirectory)
        ReadyForStage       = [System.Convert]::ToBoolean($MappingRow.ReadyForStage)
    }
    $recordPath = Join-Path $stateDirectory 'preparation.json'
    $temporaryPath = "$recordPath.tmp"
    $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporaryPath -Encoding utf8NoBOM
    Move-Item -LiteralPath $temporaryPath -Destination $recordPath -Force
    return [pscustomobject]$record
}

function Get-GoogleGroupPreparationRecord {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$WorkspaceRoot,
        [Parameter(Mandatory)][string]$GroupEmail
    )

    $normalized = $GroupEmail.Trim().ToLowerInvariant()
    $stateDirectory = Get-GoogleGroupStateDirectory -WorkspaceRoot $WorkspaceRoot -GroupEmail $normalized
    $recordPath = Join-Path $stateDirectory 'preparation.json'
    if (-not (Test-Path -LiteralPath $recordPath -PathType Leaf)) {
        return $null
    }
    try {
        $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
        if (([string]$record.GroupEmail).Trim().ToLowerInvariant() -ne $normalized) {
            return $null
        }
        foreach ($requiredFile in @([string]$record.Manifest, [string]$record.Summary)) {
            if ([string]::IsNullOrWhiteSpace($requiredFile) -or
                -not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
                return $null
            }
        }
        if ([string]::IsNullOrWhiteSpace([string]$record.BackupDirectory) -or
            -not (Test-Path -LiteralPath $record.BackupDirectory -PathType Container)) {
            return $null
        }
        $summaryObject = Get-Content -LiteralPath $record.Summary -Raw | ConvertFrom-Json
        if (([string]$summaryObject.group).Trim().ToLowerInvariant() -ne $normalized) {
            return $null
        }
        $actualManifestHash = (Get-FileHash -LiteralPath $record.Manifest -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualManifestHash -ne ([string]$record.ManifestSha256).ToLowerInvariant()) {
            return $null
        }
        return $record
    }
    catch {
        return $null
    }
}

Export-ModuleMember -Function Get-GoogleGroupStateDirectory, Save-GoogleGroupPreparationRecord, Get-GoogleGroupPreparationRecord
