[CmdletBinding()]
param(
    [string]$WorkspaceRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/_migration-system'),
    [string]$ExportId,
    [string[]]$Group,
    [string]$PythonPath = 'python',
    [string]$M365TargetDomain = 'dynamox.net',
    [string]$CachedReportRoot = (Join-Path $PSScriptRoot '..' 'reports'),
    [switch]$ForceRebuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'GoogleGroupMigrationState.psm1') -Force

function Get-PropertySum {
    param([object[]]$Items, [Parameter(Mandatory)][string]$Property)
    if (-not $Items -or $Items.Count -eq 0) { return 0 }
    $sum = 0
    foreach ($item in $Items) {
        if ($null -ne $item.$Property -and $item.$Property -ne '') {
            $sum += [double]$item.$Property
        }
    }
    return [long]$sum
}

$M365TargetDomain = $M365TargetDomain.Trim().ToLowerInvariant()
if ($M365TargetDomain -notmatch '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
    throw "Domínio de destino M365 inválido: $M365TargetDomain"
}

function ConvertTo-IsoUtcText {
    param([AllowNull()]$Value)

    if ($null -eq $Value) {
        return ''
    }
    if ($Value -is [DateTime]) {
        return $Value.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    return [string]$Value
}

function Test-CachedSummary {
    param(
        [Parameter(Mandatory)][string]$SummaryPath,
        [Parameter(Mandatory)][string]$GroupEmail,
        [Parameter(Mandatory)][object[]]$Archives
    )

    try {
        $summary = Get-Content -LiteralPath $SummaryPath -Raw | ConvertFrom-Json
        if ([string]$summary.group -ne $GroupEmail) {
            return $null
        }
        $expected = @($Archives | ForEach-Object {
            "{0}|{1}|{2}" -f `
                ([System.IO.Path]::GetFullPath([string]$_.ManagedPath)), `
                ([long]$_.Bytes), `
                ([string]$_.SHA256).ToLowerInvariant()
        } | Sort-Object)
        $actual = @($summary.input_files | ForEach-Object {
            "{0}|{1}|{2}" -f `
                ([System.IO.Path]::GetFullPath([string]$_.path)), `
                ([long]$_.bytes), `
                ([string]$_.sha256).ToLowerInvariant()
        } | Sort-Object)
        if (($expected -join "`n") -ne ($actual -join "`n")) {
            return $null
        }
        $manifestPath = Join-Path (Split-Path -Parent $SummaryPath) 'takeout-canonical-manifest.csv'
        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
            return $null
        }
        return [pscustomobject]@{
            Summary  = $summary
            SummaryPath = $SummaryPath
            Manifest = $manifestPath
        }
    }
    catch {
        return $null
    }
}

function Find-CachedManifest {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$GroupEmail,
        [Parameter(Mandatory)][object[]]$Archives
    )

    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        return $null
    }
    $candidates = @(
        Get-ChildItem -LiteralPath $Root -File -Filter 'takeout-summary.json' -Recurse |
            Sort-Object LastWriteTimeUtc -Descending
    )
    foreach ($candidate in $candidates) {
        $cached = Test-CachedSummary -SummaryPath $candidate.FullName -GroupEmail $GroupEmail -Archives $Archives
        if ($cached) {
            return $cached
        }
    }
    return $null
}

$workspace = [System.IO.Path]::GetFullPath($WorkspaceRoot)
$catalogPath = Join-Path (Join-Path $workspace 'catalog') 'backups.csv'
if (-not (Test-Path -LiteralPath $catalogPath -PathType Leaf)) {
    throw "Catálogo de backups não encontrado. Execute primeiro Import-GoogleGroupsBackup.ps1: $catalogPath"
}
foreach ($requiredFile in @($PythonPath, (Join-Path $PSScriptRoot 'get_google_groups_takeout_manifest.py'))) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Arquivo obrigatório não encontrado: $requiredFile"
    }
}

$catalog = @(Import-Csv -LiteralPath $catalogPath)
if (-not $ExportId) {
    $ExportId = @($catalog.ExportId | Sort-Object -Descending | Select-Object -First 1)[0]
}
$selected = @($catalog | Where-Object ExportId -EQ $ExportId)
if ($Group) {
    $requested = @($Group | ForEach-Object {
        $value = $_.Trim().ToLowerInvariant()
        if ($value -notmatch '@') { "$value@enging.pt" } else { $value }
    })
    $selected = @($selected | Where-Object GroupEmail -In $requested)
}
if ($selected.Count -eq 0) {
    throw "Nenhum backup selecionado no export $ExportId."
}

$runTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDirectory = Join-Path (Join-Path $workspace 'runs') "prepare-$runTimestamp"
$preparedDirectory = Join-Path $runDirectory 'prepared'
New-Item -ItemType Directory -Path $preparedDirectory -Force | Out-Null
$analyzer = Join-Path $PSScriptRoot 'get_google_groups_takeout_manifest.py'
$results = [System.Collections.Generic.List[object]]::new()
$mapping = [System.Collections.Generic.List[object]]::new()

foreach ($archiveGroup in @($selected | Group-Object GroupEmail | Sort-Object Name)) {
    $groupEmail = $archiveGroup.Name.ToLowerInvariant()
    $archives = @($archiveGroup.Group | Sort-Object ManagedPath)
    foreach ($a in $archives) {
        if (-not (Test-Path -LiteralPath $a.ManagedPath)) {
            $workspaceParent = Split-Path $workspace -Parent
            $macSuffix = $a.ManagedPath -replace '^.*?[/\\]Google Groups[/\\]', ''
            $guessedPath = Join-Path $workspaceParent $macSuffix
            if (Test-Path -LiteralPath $guessedPath) {
                $a.ManagedPath = $guessedPath
            }
        }
    }
    $localPart, $domain = $groupEmail.Split('@', 2)
    $integrityError = ''
    foreach ($archive in $archives) {
        if (-not (Test-Path -LiteralPath $archive.ManagedPath -PathType Leaf)) {
            $localCandidate = Join-Path (Join-Path (Join-Path (Split-Path $workspace -Parent) $archive.ExportId) $groupEmail) $archive.RelativePath
            if (Test-Path -LiteralPath $localCandidate -PathType Leaf) {
                $archive.ManagedPath = $localCandidate
                $archive.SourcePath = $localCandidate
            }
        }
        if (-not (Test-Path -LiteralPath $archive.ManagedPath -PathType Leaf)) {
            $integrityError = "O ficheiro de backup não existe nesta máquina: $($archive.ManagedPath). Este backup foi registado noutro computador. Descarregue o ficheiro via Google Takeout ou copie-o para esta máquina."
            break
        }
        $file = Get-Item -LiteralPath $archive.ManagedPath
        if ($file.Length -ne [long]$archive.Bytes) {
            $integrityError = "Tamanho divergente: $($archive.ManagedPath)"
            break
        }
        $actualHash = (Get-FileHash -LiteralPath $archive.ManagedPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne ([string]$archive.SHA256).ToLowerInvariant()) {
            $integrityError = "SHA-256 divergente: $($archive.ManagedPath)"
            break
        }
    }
    if ($integrityError) {
        $results.Add([pscustomobject]@{
            GroupEmail = $groupEmail; Status = 'IntegrityFailed'; ArchiveFiles = $archives.Count
            ArchiveBytes = Get-PropertySum -Items $archives -Property Bytes; CanonicalMessages = 0
            DuplicateOccurrences = 0; ContentConflicts = 0; ParseDefects = 0
            EarliestUtc = ''; LatestUtc = ''; Manifest = ''; Summary = ''; Cached = $false
            BackupDirectory = ''; ConflictReview = ''; ParseDefectReview = ''; Detail = $integrityError
        })
        continue
    }

    $manifestInfo = $null
    if (-not $ForceRebuild) {
        foreach ($cacheRoot in @($CachedReportRoot, (Join-Path $workspace 'runs')) | Select-Object -Unique) {
            $manifestInfo = Find-CachedManifest -Root $cacheRoot -GroupEmail $groupEmail -Archives $archives
            if ($manifestInfo) {
                break
            }
        }
    }
    if (-not $manifestInfo) {
        $groupOutput = Join-Path $preparedDirectory ($groupEmail -replace '[^a-z0-9._-]', '_')
        New-Item -ItemType Directory -Path $groupOutput -Force | Out-Null
        $arguments = @($analyzer, '--group', $groupEmail, '--output-dir', $groupOutput)
        foreach ($archive in $archives) {
            $arguments += @('--input', $archive.ManagedPath)
        }
        $logPath = Join-Path $groupOutput 'prepare.log'
        & $PythonPath @arguments *> $logPath
        if ($LASTEXITCODE -ne 0) {
            $detail = (Get-Content -LiteralPath $logPath -Tail 20 | Out-String).Trim()
            $results.Add([pscustomobject]@{
                GroupEmail = $groupEmail; Status = 'AnalysisFailed'; ArchiveFiles = $archives.Count
                ArchiveBytes = Get-PropertySum -Items $archives -Property Bytes; CanonicalMessages = 0
                DuplicateOccurrences = 0; ContentConflicts = 0; ParseDefects = 0
                EarliestUtc = ''; LatestUtc = ''; Manifest = ''; Summary = ''; Cached = $false
                BackupDirectory = Split-Path -Parent $archives[0].ManagedPath
                ConflictReview = ''; ParseDefectReview = ''; Detail = $detail
            })
            continue
        }
        $summaryPath = Join-Path $groupOutput 'takeout-summary.json'
        $manifestInfo = [pscustomobject]@{
            Summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
            SummaryPath = $summaryPath
            Manifest = Join-Path $groupOutput 'takeout-canonical-manifest.csv'
        }
        $wasCached = $false
    }
    else {
        $wasCached = $true
    }

    $summary = $manifestInfo.Summary
    $status = if ([int]$summary.takeout.message_id_content_hash_conflicts -eq 0) { 'Prepared' } else { 'ReviewRequired' }
    $backupDirectory = Split-Path -Parent $archives[0].ManagedPath
    $manifestDirectory = Split-Path -Parent $manifestInfo.Manifest
    $reviewDirectory = Join-Path (Join-Path $runDirectory 'review') ($groupEmail -replace '[^a-z0-9._-]', '_')
    New-Item -ItemType Directory -Path $reviewDirectory -Force | Out-Null
    $conflictReviewPath = Join-Path $reviewDirectory 'message-id-conflict-review.csv'
    $parseDefectReviewPath = Join-Path $reviewDirectory 'parse-defect-review.csv'
    $conflictSummaryPath = Join-Path $manifestDirectory 'takeout-message-id-conflicts.csv'
    $conflictDetailsPath = Join-Path $manifestDirectory 'takeout-message-id-conflict-details.csv'
    $occurrencesPath = Join-Path $manifestDirectory 'takeout-message-occurrences.csv'
    $canonicalPath = Join-Path $manifestDirectory 'takeout-canonical-manifest.csv'

    $conflictSummaryRows = if (Test-Path -LiteralPath $conflictSummaryPath -PathType Leaf) {
        @(Import-Csv -LiteralPath $conflictSummaryPath)
    }
    else { @() }
    if (Test-Path -LiteralPath $conflictDetailsPath -PathType Leaf) {
        $conflictDetailRows = @(Import-Csv -LiteralPath $conflictDetailsPath)
    }
    elseif ($conflictSummaryRows.Count -gt 0 -and (Test-Path -LiteralPath $occurrencesPath -PathType Leaf)) {
        $conflictDetailRows = @(
            Import-Csv -LiteralPath $occurrencesPath | Where-Object {
                $dedupKey = [string]$_.dedup_key
                @($conflictSummaryRows | Where-Object {
                    $key = [string]$_.message_id_key
                    $dedupKey -eq $key -or $dedupKey.StartsWith("$key|CONTENT:")
                }).Count -gt 0
            }
        )
    }
    else { $conflictDetailRows = @() }
    $conflictReviewRows = foreach ($detail in $conflictDetailRows) {
        $messageKey = ([string]$detail.dedup_key -split '\|CONTENT:', 2)[0]
        $conflict = $conflictSummaryRows | Where-Object message_id_key -EQ $messageKey | Select-Object -First 1
        [pscustomobject]@{
            MessageIdKey       = $messageKey
            RequiresApproval   = [int]$conflict.distinct_content_sha256_count -gt 1
            DateUtc            = [string]$detail.date_utc
            From               = [string]$detail.from
            To                 = [string]$detail.to
            Cc                 = [string]$detail.cc
            Subject            = [string]$detail.subject
            RawSHA256          = [string]$detail.raw_sha256
            ContentSHA256      = [string]$detail.content_sha256
            RawBytes           = [string]$detail.raw_bytes
            SourceArchive      = [string]$detail.source_archive
            MboxPath           = [string]$detail.mbox_path
            MboxMessageNumber  = [string]$detail.mbox_message_number
        }
    }
    @($conflictReviewRows) | Export-Csv -LiteralPath $conflictReviewPath -NoTypeInformation -Encoding utf8NoBOM

    $parseDefectRows = @(
        Import-Csv -LiteralPath $canonicalPath |
            Where-Object { [int]$_.parse_defect_count -gt 0 } |
            Select-Object dedup_key, message_id, date_utc, from, to, cc, subject,
                parse_defect_count, raw_sha256, content_sha256, source_archive,
                mbox_path, mbox_message_number
    )
    $parseDefectRows | Export-Csv -LiteralPath $parseDefectReviewPath -NoTypeInformation -Encoding utf8NoBOM
    $result = [pscustomobject]@{
        GroupEmail = $groupEmail
        Status = $status
        ArchiveFiles = $archives.Count
        ArchiveBytes = Get-PropertySum -Items $archives -Property Bytes
        CanonicalMessages = [int]$summary.takeout.canonical_unique_messages
        DuplicateOccurrences = [int]$summary.takeout.duplicate_occurrences
        ContentConflicts = [int]$summary.takeout.message_id_content_hash_conflicts
        ParseDefects = [int]$summary.takeout.messages_with_parse_defects
        EarliestUtc = ConvertTo-IsoUtcText $summary.earliest_message_utc
        LatestUtc = ConvertTo-IsoUtcText $summary.latest_message_utc
        Manifest = $manifestInfo.Manifest
        Summary = $manifestInfo.SummaryPath
        Cached = $wasCached
        BackupDirectory = $backupDirectory
        ConflictReview = $conflictReviewPath
        ParseDefectReview = $parseDefectReviewPath
        Detail = ''
    }
    $results.Add($result)
    $legacyStateDirectory = Join-Path $CachedReportRoot "$localPart-staging"
    $systemStateDirectory = Join-Path (Join-Path $workspace 'state') ($groupEmail -replace '[^a-z0-9._-]', '_')
    $stateDirectory = if (Test-Path -LiteralPath (Join-Path $legacyStateDirectory 'import-state.sqlite3') -PathType Leaf) {
        $legacyStateDirectory
    }
    else {
        $systemStateDirectory
    }
    $existingPrep = Get-GoogleGroupPreparationRecord -WorkspaceRoot $workspace -GroupEmail $groupEmail
    $resolvedTargetMailbox = if ($existingPrep -and $existingPrep.TargetSharedMailbox) {
        [string]$existingPrep.TargetSharedMailbox
    }
    else {
        "$localPart@$M365TargetDomain"
    }
    $mappingRow = [pscustomobject]@{
        GroupEmail          = $groupEmail
        TargetSharedMailbox = $resolvedTargetMailbox
        StagingUser         = "migracao.$localPart@$domain"
        BackupDirectory     = $backupDirectory
        Manifest            = $manifestInfo.Manifest
        Summary             = $manifestInfo.SummaryPath
        ConflictReview      = $conflictReviewPath
        ParseDefectReview   = $parseDefectReviewPath
        StateDirectory      = $stateDirectory
        ReadyForStage       = $status -eq 'Prepared'
    }
    $mapping.Add($mappingRow)
    Save-GoogleGroupPreparationRecord `
        -WorkspaceRoot $workspace `
        -MappingRow $mappingRow `
        -ExportId $ExportId `
        -PreparationRun $runDirectory | Out-Null
}

$summaryCsv = Join-Path $runDirectory 'groups-prepare-summary.csv'
$mappingCsv = Join-Path $runDirectory 'mailbox-mapping.csv'
$results | Export-Csv -LiteralPath $summaryCsv -NoTypeInformation -Encoding utf8NoBOM
$mapping | Export-Csv -LiteralPath $mappingCsv -NoTypeInformation -Encoding utf8NoBOM
$latestPath = Join-Path (Join-Path $workspace 'catalog') 'latest-preparation.json'
$latest = [ordered]@{
    GeneratedAtUtc = [DateTime]::UtcNow.ToString('o')
    ExportId = $ExportId
    RunDirectory = $runDirectory
    SummaryCsv = $summaryCsv
    MappingCsv = $mappingCsv
}
$latest | ConvertTo-Json | Set-Content -LiteralPath $latestPath -Encoding utf8

$prepared = @($results | Where-Object Status -In @('Prepared', 'ReviewRequired'))
$failed = @($results | Where-Object Status -NotIn @('Prepared', 'ReviewRequired'))
$output = [ordered]@{
    ExportId = $ExportId
    GroupsSelected = @($selected.GroupEmail | Sort-Object -Unique).Count
    GroupsPrepared = $prepared.Count
    GroupsFailed = $failed.Count
    CanonicalMessages = Get-PropertySum -Items $prepared -Property CanonicalMessages
    RunDirectory = $runDirectory
    SummaryCsv = $summaryCsv
    MappingCsv = $mappingCsv
}
Write-Host "Export              : $ExportId"
Write-Host "Grupos preparados   : $($output.GroupsPrepared)/$($output.GroupsSelected)"
Write-Host "Mensagens canônicas : $($output.CanonicalMessages)"
Write-Host "Mapeamento           : $mappingCsv"
[pscustomobject]$output

if ($output.GroupsFailed -gt 0) {
    # Se um grupo específico foi pedido, só falhar se esse grupo específico não foi preparado com sucesso
    if ($Group -and $output.GroupsPrepared -gt 0) {
        $requestedEmails = @($Group | ForEach-Object {
            $v = $_.Trim().ToLowerInvariant()
            if ($v -notmatch '@') { "$v@enging.pt" } else { $v }
        })
        $failedEmails = @($results | Where-Object { $_.Status -notin @('Prepared', 'ReviewRequired') } | ForEach-Object { $_.GroupEmail })
        $requestedFailed = @($requestedEmails | Where-Object { $failedEmails -contains $_ })
        if ($requestedFailed.Count -eq 0) {
            Write-Warning "Aviso: $($output.GroupsFailed) grupo(s) do export têm ficheiros em falta nesta máquina. Consulte $summaryCsv."
        } else {
            throw "Falha na preparação do grupo $($requestedFailed -join ', '). Consulte $summaryCsv para mais detalhes."
        }
    } else {
        throw "Falha na preparação de $($output.GroupsFailed) grupo(s). Consulte $summaryCsv para mais detalhes."
    }
}


