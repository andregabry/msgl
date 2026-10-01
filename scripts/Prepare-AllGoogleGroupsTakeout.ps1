[CmdletBinding()]
param(
    [string]$GroupsCsv,
    [string]$BackupRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/20260826T152249Z'),
    [string]$ReportRoot = (Join-Path $PSScriptRoot '..' 'reports'),
    [string]$PythonPath = 'python',
    [string]$M365TargetDomain = 'dynamox.net'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

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

function Get-LatestGroupInventory {
    param([Parameter(Mandatory)][string]$Root)

    $matches = @(
        Get-ChildItem -LiteralPath $Root -File -Filter 'google-groups.csv' -Recurse |
            Sort-Object LastWriteTimeUtc -Descending
    )
    if ($matches.Count -eq 0) {
        throw "Nenhum inventário google-groups.csv foi encontrado em $Root."
    }
    return $matches[0].FullName
}

function Get-GroupEmail {
    param([Parameter(Mandatory)]$Row)

    $property = @('email', 'Email', 'GroupEmail', 'SourceGroup') |
        Where-Object { $Row.PSObject.Properties.Name -contains $_ } |
        Select-Object -First 1
    if (-not $property) {
        throw 'O inventário precisa de uma coluna email, Email, GroupEmail ou SourceGroup.'
    }
    return ([string]$Row.$property).Trim().ToLowerInvariant()
}

foreach ($requiredFile in @($PythonPath, (Join-Path $PSScriptRoot 'get_google_groups_takeout_manifest.py'))) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Arquivo obrigatório não encontrado: $requiredFile"
    }
}
if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) {
    throw "Raiz dos backups não encontrada: $BackupRoot"
}

$resolvedReportRoot = [System.IO.Path]::GetFullPath($ReportRoot)
if (-not $GroupsCsv) {
    $GroupsCsv = Get-LatestGroupInventory -Root $resolvedReportRoot
}
$groups = @(Import-Csv -LiteralPath $GroupsCsv)
if ($groups.Count -eq 0) {
    throw "O inventário não contém grupos: $GroupsCsv"
}

$runTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportDirectory = Join-Path $resolvedReportRoot "prepared-all-groups-$runTimestamp"
$groupsReportRoot = Join-Path $reportDirectory 'groups'
New-Item -ItemType Directory -Path $groupsReportRoot -Force | Out-Null
$analyzer = Join-Path $PSScriptRoot 'get_google_groups_takeout_manifest.py'
$results = [System.Collections.Generic.List[object]]::new()
$mapping = [System.Collections.Generic.List[object]]::new()

foreach ($group in $groups) {
    $groupEmail = Get-GroupEmail -Row $group
    if ($groupEmail -notmatch '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
        throw "Endereço de grupo inválido: $groupEmail"
    }
    $localPart, $domain = $groupEmail.Split('@', 2)
    $backupDirectory = Join-Path $BackupRoot $groupEmail
    $groupOutput = Join-Path $groupsReportRoot ($groupEmail -replace '[^a-z0-9._-]', '_')
    $mapping.Add([pscustomobject]@{
        SourceGroup        = $groupEmail
        TargetSharedMailbox = "$localPart@$M365TargetDomain"
        StagingUser       = "migracao.$localPart@$domain"
        DisplayName       = [string]$group.name
        BackupDirectory   = $backupDirectory
    })

    if (-not (Test-Path -LiteralPath $backupDirectory -PathType Container)) {
        $results.Add([pscustomobject]@{
            GroupEmail       = $groupEmail
            Status           = 'BackupMissing'
            ArchiveFiles     = 0
            ArchiveBytes     = 0
            CanonicalMessages = 0
            DuplicateOccurrences = 0
            ContentConflicts = 0
            ParseDefects     = 0
            EarliestUtc      = ''
            LatestUtc        = ''
            Manifest         = ''
            Detail           = $backupDirectory
        })
        continue
    }

    $archives = @(
        Get-ChildItem -LiteralPath $backupDirectory -File -Recurse |
            Where-Object Extension -In @('.zip', '.mbox') |
            Sort-Object FullName
    )
    if ($archives.Count -eq 0) {
        $results.Add([pscustomobject]@{
            GroupEmail       = $groupEmail
            Status           = 'ArchivesMissing'
            ArchiveFiles     = 0
            ArchiveBytes     = 0
            CanonicalMessages = 0
            DuplicateOccurrences = 0
            ContentConflicts = 0
            ParseDefects     = 0
            EarliestUtc      = ''
            LatestUtc        = ''
            Manifest         = ''
            Detail           = $backupDirectory
        })
        continue
    }

    New-Item -ItemType Directory -Path $groupOutput -Force | Out-Null
    $arguments = @($analyzer, '--group', $groupEmail, '--output-dir', $groupOutput)
    foreach ($archive in $archives) {
        $arguments += @('--input', $archive.FullName)
    }
    $logPath = Join-Path $groupOutput 'prepare.log'
    & $PythonPath @arguments *> $logPath
    if ($LASTEXITCODE -ne 0) {
        $detail = (Get-Content -LiteralPath $logPath -Tail 20 | Out-String).Trim()
        $results.Add([pscustomobject]@{
            GroupEmail       = $groupEmail
            Status           = 'AnalysisFailed'
            ArchiveFiles     = $archives.Count
            ArchiveBytes     = Get-PropertySum -Items $archives -Property Length
            CanonicalMessages = 0
            DuplicateOccurrences = 0
            ContentConflicts = 0
            ParseDefects     = 0
            EarliestUtc      = ''
            LatestUtc        = ''
            Manifest         = ''
            Detail           = $detail
        })
        continue
    }

    $summaryPath = Join-Path $groupOutput 'takeout-summary.json'
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
    $results.Add([pscustomobject]@{
        GroupEmail       = $groupEmail
        Status           = if ([int]$summary.takeout.message_id_content_hash_conflicts -eq 0) { 'Prepared' } else { 'ReviewRequired' }
        ArchiveFiles     = $archives.Count
        ArchiveBytes     = Get-PropertySum -Items $archives -Property Length
        CanonicalMessages = [int]$summary.takeout.canonical_unique_messages
        DuplicateOccurrences = [int]$summary.takeout.duplicate_occurrences
        ContentConflicts = [int]$summary.takeout.message_id_content_hash_conflicts
        ParseDefects     = [int]$summary.takeout.messages_with_parse_defects
        EarliestUtc      = [string]$summary.earliest_message_utc
        LatestUtc        = [string]$summary.latest_message_utc
        Manifest         = Join-Path $groupOutput 'takeout-canonical-manifest.csv'
        Detail           = $summaryPath
    })
}

$summaryCsv = Join-Path $reportDirectory 'groups-prepare-summary.csv'
$mappingCsv = Join-Path $reportDirectory 'mailbox-mapping.csv'
$results | Export-Csv -LiteralPath $summaryCsv -NoTypeInformation -Encoding utf8NoBOM
$mapping | Export-Csv -LiteralPath $mappingCsv -NoTypeInformation -Encoding utf8NoBOM

$prepared = @($results | Where-Object Status -In @('Prepared', 'ReviewRequired'))
$reviewRequired = @($results | Where-Object Status -EQ 'ReviewRequired')
$failed = @($results | Where-Object Status -NotIn @('Prepared', 'ReviewRequired'))
$aggregate = [ordered]@{
    GeneratedAtUtc       = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    GroupsExpected       = $groups.Count
    GroupsPrepared       = $prepared.Count
    GroupsReviewRequired = $reviewRequired.Count
    GroupsFailed         = $failed.Count
    CanonicalMessages    = Get-PropertySum -Items $prepared -Property CanonicalMessages
    SummaryCsv           = $summaryCsv
    MappingCsv           = $mappingCsv
    ReportDirectory      = $reportDirectory
}
$aggregate | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $reportDirectory 'prepare-summary.json') -Encoding utf8

Write-Host "Grupos preparados   : $($prepared.Count)/$($groups.Count)"
Write-Host "Revisão obrigatória  : $($reviewRequired.Count)"
Write-Host "Falhas/sem backup    : $($failed.Count)"
Write-Host "Mensagens canônicas : $($aggregate.CanonicalMessages)"
Write-Host "Relatório             : $reportDirectory"

return [pscustomobject]$aggregate



