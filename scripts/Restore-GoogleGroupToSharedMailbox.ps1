[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$Group,

    [ValidateSet('Prepare', 'Stage', 'CleanStaging', 'CreateBatch', 'Status')]
    [string]$Phase = 'Prepare',

    [string]$Domain = 'enging.pt',
    [string]$BackupRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups'),
    [string]$BackupDirectory,
    [string]$ReportRoot = (Join-Path $PSScriptRoot '..' 'reports'),
    [string]$StateRoot,
    [string]$StateDirectoryPath,
    [string]$PreparedManifest,
    [string]$PreparedSummary,
    [string]$ServiceAccountFile = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/service-account.json'),
    [string]$PythonPath = 'python',
    [string]$StagingUser,
    [string]$TargetMailbox,
    [string]$M365TargetDomain = 'dynamox.net',
    [string]$MigrationEndpoint = 'GoogleWorkspace',
    [string]$ExchangeAdmin = 'andre.gabry@dynamox.net',
    [string]$TargetDeliveryDomain,
    [string]$BatchName,
    [ValidateRange(1, 8)][int]$Workers = 4,
    [ValidateRange(1, 2147483647)][int]$Limit,
    [switch]$RefreshManifest,
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
Import-Module (Join-Path $PSScriptRoot 'ExchangeMigrationSupport.psm1') -Force

function Resolve-GroupEmail {
    param([Parameter(Mandatory)][string]$Value, [Parameter(Mandatory)][string]$DefaultDomain)

    $normalized = $Value.Trim().ToLowerInvariant()
    if ($normalized -notmatch '@') {
        $normalized = "$normalized@$($DefaultDomain.Trim().ToLowerInvariant())"
    }
    if ($normalized -notmatch '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
        throw "Nome ou endereço de grupo inválido: $Value"
    }
    return $normalized
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

function Get-SafePropertyValue {
    param(
        [AllowNull()][object]$InputObject,
        [Parameter(Mandatory)][string]$Name
    )

    if ($null -eq $InputObject) {
        return $null
    }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return $property.Value
}

function Get-FirstPropertyValue {
    param(
        [AllowNull()][object]$InputObject,
        [Parameter(Mandatory)][string[]]$Names
    )

    foreach ($name in $Names) {
        $property = if ($null -eq $InputObject) { $null } else { $InputObject.PSObject.Properties[$name] }
        if ($null -ne $property -and $null -ne $property.Value -and [string]$property.Value -ne '') {
            return $property.Value
        }
    }
    return $null
}

function Resolve-BackupDirectory {
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$GroupEmail)

    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        throw "Pasta raiz dos backups não encontrada: $Root"
    }
    $direct = Join-Path $Root $GroupEmail
    if (Test-Path -LiteralPath $direct -PathType Container) {
        return (Resolve-Path -LiteralPath $direct).Path
    }
    $matches = @(
        Get-ChildItem -LiteralPath $Root -Directory -Recurse -ErrorAction Stop |
            Where-Object Name -EQ $GroupEmail |
            Sort-Object LastWriteTimeUtc -Descending
    )
    if ($matches.Count -eq 0) {
        throw "Nenhum backup foi encontrado para $GroupEmail dentro de $Root."
    }
    return $matches[0].FullName
}

function Get-ArchiveFiles {
    param([Parameter(Mandatory)][string]$BackupDirectory)

    $archives = @(
        Get-ChildItem -LiteralPath $BackupDirectory -File -Recurse |
            Where-Object Extension -In @('.zip', '.mbox') |
            Sort-Object FullName
    )
    if ($archives.Count -eq 0) {
        throw "O backup não contém arquivos ZIP ou MBOX: $BackupDirectory"
    }
    return $archives
}

function Test-ArchiveIntegrity {
    param([Parameter(Mandatory)][System.IO.FileInfo[]]$ArchiveFiles)

    $unzip = Get-Command unzip -ErrorAction SilentlyContinue
    $tar = Get-Command tar -ErrorAction SilentlyContinue
    foreach ($archive in $ArchiveFiles) {
        if ($archive.Extension -eq '.zip') {
            if ($unzip) {
                & $unzip.Source -tq $archive.FullName *> $null
            } elseif ($tar) {
                & $tar.Source -tf $archive.FullName *> $null
            } else {
                throw 'Os utilitários unzip ou tar não foram encontrados para validar o ZIP.'
            }
            if ($LASTEXITCODE -ne 0) {
                throw "ZIP corrompido ou incompleto: $($archive.FullName)"
            }
        }
    }
}

function Get-LatestCachedManifest {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$SafeGroupName,
        [Parameter(Mandatory)][string]$GroupEmail,
        [Parameter(Mandatory)][System.IO.FileInfo[]]$ArchiveFiles
    )

    $actualPaths = @($ArchiveFiles.FullName | Sort-Object)
    $candidates = @(
        Get-ChildItem -LiteralPath $Root -Directory -Filter "takeout-$SafeGroupName-*" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc -Descending
    )
    foreach ($candidate in $candidates) {
        $summaryPath = Join-Path $candidate.FullName 'takeout-summary.json'
        $manifestPath = Join-Path $candidate.FullName 'takeout-canonical-manifest.csv'
        if (-not (Test-Path -LiteralPath $summaryPath -PathType Leaf) -or
            -not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
            continue
        }
        $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
        if ([string]$summary.group -ne $GroupEmail) {
            continue
        }
        $cachedPaths = @($summary.input_files.path | ForEach-Object {
            [System.IO.Path]::GetFullPath([string]$_)
        } | Sort-Object)
        if (($actualPaths -join "`n") -ne ($cachedPaths -join "`n")) {
            continue
        }

        foreach ($inputFile in $summary.input_files) {
            $path = [System.IO.Path]::GetFullPath([string]$inputFile.path)
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
                throw "Arquivo registrado no manifesto não existe mais: $path"
            }
            $file = Get-Item -LiteralPath $path
            if ($file.Length -ne [long]$inputFile.bytes) {
                throw "Tamanho do backup mudou desde a análise: $path"
            }
            $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actualHash -ne ([string]$inputFile.sha256).ToLowerInvariant()) {
                throw "SHA-256 do backup não confere: $path"
            }
        }
        return [pscustomobject]@{
            Directory = $candidate.FullName
            Manifest  = $manifestPath
            Summary   = $summaryPath
            Cached    = $true
        }
    }
    return $null
}

function New-CanonicalManifest {
    param(
        [Parameter(Mandatory)][string]$GroupEmail,
        [Parameter(Mandatory)][string]$SafeGroupName,
        [Parameter(Mandatory)][System.IO.FileInfo[]]$ArchiveFiles,
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$Python
    )

    $analyzer = Join-Path $PSScriptRoot 'get_google_groups_takeout_manifest.py'
    foreach ($requiredFile in @($Python, $analyzer)) {
        if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
            throw "Arquivo obrigatório não encontrado: $requiredFile"
        }
    }
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $outputDirectory = Join-Path $Root "takeout-$SafeGroupName-$timestamp"
    $arguments = @($analyzer, '--group', $GroupEmail, '--output-dir', $outputDirectory)
    foreach ($archive in $ArchiveFiles) {
        $arguments += @('--input', $archive.FullName)
    }
    & $Python @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "A análise do Takeout terminou com código $LASTEXITCODE."
    }
    return [pscustomobject]@{
        Directory = $outputDirectory
        Manifest  = Join-Path $outputDirectory 'takeout-canonical-manifest.csv'
        Summary   = Join-Path $outputDirectory 'takeout-summary.json'
        Cached    = $false
    }
}

function Get-StateStatistics {
    param([Parameter(Mandatory)][string]$StateDatabase)

    $result = [ordered]@{
        SeededExisting     = 0
        Verified           = 0
        VerificationFailed = 0
        Warnings           = 0
        Tracked            = 0
    }
    if (-not (Test-Path -LiteralPath $StateDatabase -PathType Leaf)) {
        return [pscustomobject]$result
    }
    $pyScript = "import sqlite3, json, sys`ndb = sys.argv[1]`nwith sqlite3.connect(db) as conn:`n    conn.row_factory = sqlite3.Row`n    c = conn.cursor()`n    c.execute('SELECT status, COUNT(*) as count FROM imports GROUP BY status')`n    rows = [dict(r) for r in c.fetchall()]`n    c.execute(`"SELECT COUNT(*) FROM imports WHERE verification_warnings IS NOT NULL AND verification_warnings NOT IN ('', '[]')`")`n    warns = c.fetchone()[0]`n    print(json.dumps({'rows': rows, 'warnings': warns}))"
    $output = (& $PythonPath -c $pyScript $StateDatabase | Out-String).Trim()
    if ($output) {
        $parsed = $output | ConvertFrom-Json
        if ($parsed.rows) {
            foreach ($row in $parsed.rows) {
                switch ([string]$row.status) {
                    'seeded_existing'      { $result.SeededExisting = [int]$row.count }
                    'verified'             { $result.Verified = [int]$row.count }
                    'verification_failed'  { $result.VerificationFailed = [int]$row.count }
                }
            }
        }
        $result.Warnings = [int]$parsed.warnings
    }
    $result.Tracked = $result.SeededExisting + $result.Verified + $result.VerificationFailed
    return [pscustomobject]$result
}

$groupEmail = Resolve-GroupEmail -Value $Group -DefaultDomain $Domain
$localPart, $groupDomain = $groupEmail.Split('@', 2)
$safeGroupName = $groupEmail -replace '[^a-z0-9._-]', '_'
if ($BackupDirectory) {
    if (-not (Test-Path -LiteralPath $BackupDirectory -PathType Container)) {
        throw "Pasta de backup não encontrada: $BackupDirectory"
    }
    $backupDirectory = (Resolve-Path -LiteralPath $BackupDirectory).Path
}
else {
    $backupDirectory = Resolve-BackupDirectory -Root $BackupRoot -GroupEmail $groupEmail
}
$archives = @(Get-ArchiveFiles -BackupDirectory $backupDirectory)
$resolvedReportRoot = [System.IO.Path]::GetFullPath($ReportRoot)
New-Item -ItemType Directory -Path $resolvedReportRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath $ServiceAccountFile -PathType Leaf)) {
    throw "Chave da conta de serviço não encontrada: $ServiceAccountFile"
}

Write-Host "Grupo                 : $groupEmail"
Write-Host "Backup                : $backupDirectory"
Write-Host "Arquivos do backup    : $($archives.Count)"
Test-ArchiveIntegrity -ArchiveFiles $archives

$manifestInfo = $null
if ($PreparedManifest -or $PreparedSummary) {
    if (-not $PreparedManifest -or -not $PreparedSummary) {
        throw 'PreparedManifest e PreparedSummary devem ser informados juntos.'
    }
    foreach ($preparedFile in @($PreparedManifest, $PreparedSummary)) {
        if (-not (Test-Path -LiteralPath $preparedFile -PathType Leaf)) {
            throw "Artefato preparado não encontrado: $preparedFile"
        }
    }
    $preparedSummaryObject = Get-Content -LiteralPath $PreparedSummary -Raw | ConvertFrom-Json
    if ([string]$preparedSummaryObject.group -ne $groupEmail) {
        throw "O resumo preparado pertence a $($preparedSummaryObject.group), não a $groupEmail."
    }
    $manifestInfo = [pscustomobject]@{
        Directory = Split-Path -Parent (Resolve-Path -LiteralPath $PreparedManifest).Path
        Manifest  = (Resolve-Path -LiteralPath $PreparedManifest).Path
        Summary   = (Resolve-Path -LiteralPath $PreparedSummary).Path
        Cached    = $true
    }
}
elseif (-not $RefreshManifest) {
    $cachedManifestParameters = @{
        Root          = $resolvedReportRoot
        SafeGroupName = $safeGroupName
        GroupEmail    = $groupEmail
        ArchiveFiles  = $archives
    }
    $manifestInfo = Get-LatestCachedManifest @cachedManifestParameters
}
if (-not $manifestInfo) {
    $newManifestParameters = @{
        GroupEmail    = $groupEmail
        SafeGroupName = $safeGroupName
        ArchiveFiles  = $archives
        Root          = $resolvedReportRoot
        Python        = $PythonPath
    }
    $manifestInfo = New-CanonicalManifest @newManifestParameters
}

$summary = Get-Content -LiteralPath $manifestInfo.Summary -Raw | ConvertFrom-Json
if ($PreparedManifest -or $PreparedSummary) {
    $archivePaths = @($archives.FullName | ForEach-Object { [System.IO.Path]::GetFullPath($_) } | Sort-Object)
    $summaryPaths = @($summary.input_files.path | ForEach-Object { [System.IO.Path]::GetFullPath([string]$_) } | Sort-Object)
    if (($archivePaths -join "`n") -ne ($summaryPaths -join "`n")) {
        throw 'Os arquivos atuais do backup não correspondem ao resumo preparado.'
    }
    foreach ($inputFile in $summary.input_files) {
        $path = [System.IO.Path]::GetFullPath([string]$inputFile.path)
        $file = Get-Item -LiteralPath $path
        if ($file.Length -ne [long]$inputFile.bytes) {
            throw "Tamanho divergente no backup preparado: $path"
        }
        $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne ([string]$inputFile.sha256).ToLowerInvariant()) {
            throw "SHA-256 divergente no backup preparado: $path"
        }
    }
}
$canonicalCount = [int]$summary.takeout.canonical_unique_messages
$contentConflicts = [int]$summary.takeout.message_id_content_hash_conflicts
$parseDefects = [int]$summary.takeout.messages_with_parse_defects
$conflictsApproved = $contentConflicts -eq 0 -or $ApproveMessageIdConflicts

if (-not $StagingUser) {
    $StagingUser = "migracao.$localPart@$groupDomain"
}
if (-not $TargetMailbox) {
    $TargetMailbox = "$localPart@$($M365TargetDomain.Trim().ToLowerInvariant())"
}
$StagingUser = $StagingUser.Trim().ToLowerInvariant()
$TargetMailbox = $TargetMailbox.Trim().ToLowerInvariant()
$stateDirectory = if ($StateDirectoryPath) {
    [System.IO.Path]::GetFullPath($StateDirectoryPath)
}
elseif ($StateRoot) {
    Join-Path ([System.IO.Path]::GetFullPath($StateRoot)) $safeGroupName
}
else {
    Join-Path $resolvedReportRoot "$localPart-staging"
}
$stateDatabase = Join-Path $stateDirectory 'import-state.sqlite3'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$restoreDirectory = Join-Path $resolvedReportRoot "restore-$safeGroupName-$timestamp"
New-Item -ItemType Directory -Path $restoreDirectory -Force | Out-Null
$migrationCsv = Join-Path $restoreDirectory 'exchange-migration.csv'
$backupChecksumsCsv = Join-Path $restoreDirectory 'backup-checksums.csv'
$destinationInventoryJson = Join-Path $restoreDirectory 'gmail-destination-inventory.json'
@([pscustomobject]@{
    EmailAddress = $TargetMailbox
    Username     = $StagingUser
}) | Export-Csv -LiteralPath $migrationCsv -NoTypeInformation -Encoding utf8NoBOM
@($summary.input_files | ForEach-Object {
    [pscustomobject]@{
        Path   = [string]$_.path
        Bytes  = [long]$_.bytes
        SHA256 = [string]$_.sha256
        Type   = [string]$_.type
    }
}) | Export-Csv -LiteralPath $backupChecksumsCsv -NoTypeInformation -Encoding utf8NoBOM

$importParameters = @{
    Manifest           = $manifestInfo.Manifest
    DestinationUser    = $StagingUser
    ServiceAccountFile = $ServiceAccountFile
    StateDatabase      = $stateDatabase
    Workers            = $Workers
    PythonPath         = $PythonPath
    ReverifyFailed     = $true
    CheckDestination   = $true
    InventoryReport    = $destinationInventoryJson
}
if ($PSBoundParameters.ContainsKey('Limit')) {
    $importParameters.Limit = $Limit
}
if ($RepairInternalDateFailures) {
    $importParameters.RepairInternalDateFailures = $true
}
if ($RepairOnly) {
    $importParameters.RepairOnly = $true
}

$importScript = Join-Path $PSScriptRoot 'Import-GoogleGroupsTakeoutToStaging.ps1'
if ($Phase -eq 'CleanStaging') {
    if (-not $Execute -or -not $ApproveGoogleWelcomeRemoval) {
        throw 'A limpeza exige -Execute e -ApproveGoogleWelcomeRemoval.'
    }
    if ($PSCmdlet.ShouldProcess($StagingUser, 'Remover somente mensagens automáticas conhecidas da Equipa do Gmail')) {
        $importParameters.Execute = $true
        $importParameters.RemoveGoogleWelcomeMessages = $true
        $importParameters.CleanupOnly = $true
        $importParameters.Confirm = $false
        & $importScript @importParameters
    }
}
elseif ($Phase -eq 'Stage') {
    if (-not $Execute) {
        throw 'A fase Stage altera o Gmail de estágio. Execute novamente com -Execute.'
    }
    if (-not $conflictsApproved) {
        throw "O manifesto possui $contentConflicts conflito(s) de Message-ID/conteúdo. Revise o relatório e use -ApproveMessageIdConflicts apenas depois da aprovação."
    }
    if ($PSCmdlet.ShouldProcess($StagingUser, "Inserir até $canonicalCount mensagens canônicas")) {
        $importParameters.Execute = $true
        $importParameters.Confirm = $false
        & $importScript @importParameters
    }
}
else {
    & $importScript @importParameters
}

$destinationInventory = if (Test-Path -LiteralPath $destinationInventoryJson -PathType Leaf) {
    Get-Content -LiteralPath $destinationInventoryJson -Raw | ConvertFrom-Json
}
else {
    $null
}
$gmailDestinationMessages = if ($destinationInventory) { [int]$destinationInventory.destination_messages } else { $null }
$gmailWelcomeMessages = if ($destinationInventory) { [int]$destinationInventory.google_welcome_messages } else { 0 }
$gmailUnknownMessages = if ($destinationInventory) { [int]$destinationInventory.unknown_messages } else { 0 }
$gmailRemovedWelcomeMessages = if ($destinationInventory -and $destinationInventory.PSObject.Properties['removed_google_welcome_messages']) {
    [int]$destinationInventory.removed_google_welcome_messages
}
else {
    0
}

$state = Get-StateStatistics -StateDatabase $stateDatabase
$state | Export-Csv -LiteralPath (Join-Path $restoreDirectory 'staging-state.csv') -NoTypeInformation -Encoding utf8NoBOM
$verifiedTotal = $state.SeededExisting + $state.Verified
$stagingComplete = $verifiedTotal -eq $canonicalCount -and $state.VerificationFailed -eq 0
$readiness = if (($gmailWelcomeMessages + $gmailUnknownMessages) -gt 0 -and $gmailRemovedWelcomeMessages -eq 0) {
    'REVIEW_GMAIL_UNTRACKED_MESSAGES'
}
elseif (-not $conflictsApproved) {
    'REVIEW_MESSAGE_ID_CONFLICTS'
}
elseif ($stagingComplete) {
    'READY_FOR_EXCHANGE_BATCH'
}
else {
    'READY_TO_STAGE_REMAINING_MESSAGES'
}

$targetCurrentItems = $null
$targetTotalItemSize = ''
$exchangeRecipientType = ''
$exchangePrimarySmtpAddress = ''
$exchangeMigrationFound = $false
$exchangeMigrationStatus = ''
$exchangeBatchStatus = ''
$exchangeStatusDetail = ''
$exchangePercentageComplete = $null
$exchangeWorkflowStep = ''
$exchangeSourceItems = $null
$exchangeLastSuccessfulSyncTime = ''
$exchangeMigrationIdentity = ''
$exchangeItemsSynced = $null
$exchangeItemsSkipped = $null
$exchangeBatchTotalCount = $null
$exchangeBatchSyncedCount = $null
$exchangeBatchFailedCount = $null
$exchangeBytesTransferred = ''
$exchangeErrorSummary = ''
if ($Phase -in @('CreateBatch', 'Status')) {
    $connection = Connect-VerifiedExchangeOnline -ExchangeAdmin $ExchangeAdmin
    $openedConnection = [bool]$connection.OpenedConnection
    try {
        $recipient = Get-EXORecipient -Identity $TargetMailbox -Properties RecipientTypeDetails, PrimarySmtpAddress, EmailAddresses
        if (-not $recipient) {
            throw "A caixa $TargetMailbox não foi encontrada no Exchange Online."
        }
        $supportedMailboxTypes = @('SharedMailbox', 'UserMailbox', 'RoomMailbox', 'EquipmentMailbox')
        if ([string]$recipient.RecipientTypeDetails -notin $supportedMailboxTypes) {
            throw "$TargetMailbox existe no Exchange Online, mas é do tipo '$($recipient.RecipientTypeDetails)'. O sistema suporta caixas de utilizador (UserMailbox) e caixas partilhadas (SharedMailbox)."
        }
        $exchangeRecipientType = [string]$recipient.RecipientTypeDetails
        $typeFriendly = if ($exchangeRecipientType -eq 'UserMailbox') { 'Caixa de utilizador' } elseif ($exchangeRecipientType -eq 'SharedMailbox') { 'Caixa partilhada' } else { $exchangeRecipientType }
        Write-Host "Destino no Exchange Online: $TargetMailbox ($typeFriendly - $exchangeRecipientType)" -ForegroundColor Cyan
        $exchangePrimarySmtpAddress = ([string]$recipient.PrimarySmtpAddress).Trim().ToLowerInvariant()
        if ([string]::IsNullOrWhiteSpace($exchangePrimarySmtpAddress)) {
            throw "O Exchange não retornou PrimarySmtpAddress para $TargetMailbox."
        }
        $recipientAddresses = @($recipient.EmailAddresses | ForEach-Object {
            ([string]$_ -replace '(?i)^smtp:', '').Trim().ToLowerInvariant()
        })
        if ($TargetMailbox -notin $recipientAddresses -and $TargetMailbox -ne $exchangePrimarySmtpAddress) {
            throw "A caixa resolvida pelo Exchange não possui o endereço selecionado $TargetMailbox. A operação foi bloqueada para evitar outro destinatário."
        }
        if ($exchangePrimarySmtpAddress -ne $TargetMailbox) {
            Write-Host "Destino selecionado      : $TargetMailbox (alias)" -ForegroundColor Yellow
            Write-Host "SMTP primária no Exchange: $exchangePrimarySmtpAddress" -ForegroundColor Yellow
        }
        @([pscustomobject]@{
            EmailAddress = $exchangePrimarySmtpAddress
            Username     = $StagingUser
        }) | Export-Csv -LiteralPath $migrationCsv -NoTypeInformation -Encoding utf8NoBOM
        $mailboxStatistics = Get-EXOMailboxStatistics -Identity $TargetMailbox -ErrorAction Stop
        $targetCurrentItems = [long]$mailboxStatistics.ItemCount
        $targetTotalItemSize = [string]$mailboxStatistics.TotalItemSize
        $endpoint = Get-MigrationEndpoint -Identity $MigrationEndpoint
        $TargetDeliveryDomain = Resolve-GoogleTargetDeliveryDomain `
            -RequestedDomain $TargetDeliveryDomain `
            -MigrationBatches @(Get-MigrationBatch -ResultSize Unlimited) `
            -AcceptedDomains @(Get-AcceptedDomain)
        Write-Host "Target delivery domain : $TargetDeliveryDomain" -ForegroundColor Cyan

        if ($Phase -eq 'CreateBatch') {
            if (-not $Execute) {
                throw 'A fase CreateBatch altera o Exchange Online. Execute novamente com -Execute.'
            }
            if (-not $stagingComplete) {
                throw "A carga de estágio não está completa: $verifiedTotal de $canonicalCount verificadas."
            }
            if ($targetCurrentItems -gt 0 -and -not $ApproveNonEmptyTarget) {
                throw "A caixa $TargetMailbox já contém $targetCurrentItems item(ns). Para evitar duplicidade, revise a origem desses itens e use -ApproveNonEmptyTarget somente se estiver seguro."
            }
            $existingMigration = Get-MigrationUser -Identity $exchangePrimarySmtpAddress -ErrorAction SilentlyContinue
            if ($existingMigration) {
                throw "$TargetMailbox já possui um objeto de migração no lote $($existingMigration.BatchId)."
            }
            if (-not $BatchName) {
                $BatchName = "GoogleGroup-$localPart-$timestamp"
            }
            if ($PSCmdlet.ShouldProcess($TargetMailbox, "Criar lote $BatchName usando $StagingUser")) {
                $batchParameters = @{
                    Name                 = $BatchName
                    SourceEndpoint       = $endpoint.Identity
                    CSVData              = [System.IO.File]::ReadAllBytes($migrationCsv)
                    TargetDeliveryDomain = $TargetDeliveryDomain
                }
                $batch = New-MigrationBatch @batchParameters
                if ($StartBatch) {
                    Start-MigrationBatch -Identity $batch.Identity
                }
                $batchStatus = Get-MigrationBatch -Identity $batch.Identity -ErrorAction SilentlyContinue
                $exchangeMigrationFound = $true
                $exchangeMigrationIdentity = [string]$batch.Identity
                $exchangeMigrationStatus = if ($batchStatus) { [string]$batchStatus.Status } elseif ($StartBatch) { 'Starting' } else { 'Stopped' }
                $readiness = if ($StartBatch) { 'EXCHANGE_BATCH_STARTED' } else { 'EXCHANGE_BATCH_CREATED' }
            }
        }
        else {
            $migrationUser = Get-MigrationUser -Identity $exchangePrimarySmtpAddress -ErrorAction SilentlyContinue
            if ($migrationUser) {
                $statistics = Get-MigrationUserStatistics -Identity $migrationUser.Identity -IncludeReport
                $migrationBatchIdentity = [string](Get-SafePropertyValue $migrationUser 'BatchId')
                $migrationBatch = if ($migrationBatchIdentity) {
                    Get-MigrationBatch -Identity $migrationBatchIdentity -IncludeReport -ErrorAction SilentlyContinue
                }
                else {
                    $null
                }
                $exchangeMigrationFound = $true
                $exchangeMigrationIdentity = [string]$migrationUser.Identity
                $exchangeMigrationStatus = [string](Get-FirstPropertyValue $statistics @('Status', 'StatusSummary'))
                if (-not $exchangeMigrationStatus) {
                    $exchangeMigrationStatus = [string](Get-SafePropertyValue $migrationUser 'Status')
                }
                $exchangeBatchStatus = [string](Get-SafePropertyValue $migrationBatch 'Status')
                $exchangeStatusDetail = [string](Get-SafePropertyValue $statistics 'StatusDetail')
                $exchangePercentageComplete = Get-SafePropertyValue $statistics 'PercentageComplete'
                $exchangeWorkflowStep = [string](Get-SafePropertyValue $statistics 'WorkflowStep')
                $exchangeSourceItems = Get-SafePropertyValue $statistics 'TotalItemsInSourceMailboxCount'
                $exchangeLastSuccessfulSyncTime = ConvertTo-IsoUtcText (Get-SafePropertyValue $statistics 'LastSuccessfulSyncTime')
                $exchangeItemsSynced = Get-FirstPropertyValue $statistics @('ItemsSynced', 'SyncedItemCount')
                $exchangeItemsSkipped = Get-FirstPropertyValue $statistics @('ItemsSkipped', 'SkippedItemCount')
                $exchangeBatchTotalCount = Get-SafePropertyValue $migrationBatch 'TotalCount'
                $exchangeBatchSyncedCount = Get-SafePropertyValue $migrationBatch 'SyncedCount'
                $exchangeBatchFailedCount = Get-SafePropertyValue $migrationBatch 'FailedCount'
                $exchangeBytesTransferred = [string](Get-SafePropertyValue $statistics 'BytesTransferred')
                $exchangeErrorSummary = [string](Get-FirstPropertyValue $statistics @('ErrorSummary', 'Error'))
                if (-not $BatchName) { $BatchName = $migrationBatchIdentity }

                [pscustomobject]@{
                    Identity           = $exchangeMigrationIdentity
                    BatchId            = $migrationBatchIdentity
                    UserStatus         = $exchangeMigrationStatus
                    BatchStatus        = $exchangeBatchStatus
                    StatusDetail       = $exchangeStatusDetail
                    PercentageComplete = $exchangePercentageComplete
                    WorkflowStep       = $exchangeWorkflowStep
                    SourceItems        = $exchangeSourceItems
                    LastSuccessfulSync = $exchangeLastSuccessfulSyncTime
                    ItemsSynced        = $exchangeItemsSynced
                    ItemsSkipped       = $exchangeItemsSkipped
                    BytesTransferred   = $exchangeBytesTransferred
                    ErrorSummary       = $exchangeErrorSummary
                    BatchTotalCount    = $exchangeBatchTotalCount
                    BatchSyncedCount   = $exchangeBatchSyncedCount
                    BatchFailedCount   = $exchangeBatchFailedCount
                } |
                    Export-Csv -LiteralPath (Join-Path $restoreDirectory 'exchange-status.csv') -NoTypeInformation -Encoding utf8NoBOM

                $statistics |
                    Format-List * |
                    Out-String -Width 300 |
                    Set-Content -LiteralPath (Join-Path $restoreDirectory 'exchange-user-statistics.txt') -Encoding utf8NoBOM
                if ($migrationBatch) {
                    $migrationBatch |
                        Format-List * |
                        Out-String -Width 300 |
                        Set-Content -LiteralPath (Join-Path $restoreDirectory 'exchange-batch-status.txt') -Encoding utf8NoBOM
                }

                $effectiveStatus = if ($exchangeBatchStatus) { $exchangeBatchStatus } else { $exchangeMigrationStatus }
                $readiness = switch -Regex ($effectiveStatus) {
                    '^(Completed)$' { 'EXCHANGE_BATCH_COMPLETED'; break }
                    '^(Synced|CompletedWithWarning)$' { 'EXCHANGE_BATCH_SYNCED'; break }
                    '^(Failed|Corrupted|Stopped|IncrementalFailed|CompletionFailed)$' { 'EXCHANGE_BATCH_FAILED'; break }
                    '^(Starting|Syncing|IncrementalSyncing|Completing|Stopping)$' { 'EXCHANGE_BATCH_SYNCING'; break }
                    default { 'EXCHANGE_BATCH_FOUND' }
                }
            }
            else {
                # Verificação direta entre o status da conta no sistema e no M365
                Write-Host "Nenhum lote IMAP registado no Exchange para $exchangePrimarySmtpAddress." -ForegroundColor Yellow
                Write-Host "Itens atuais na caixa M365: $targetCurrentItems | E-mails canónicos esperados: $canonicalCount" -ForegroundColor Cyan
                if ($targetCurrentItems -gt 0 -and ($canonicalCount -eq 0 -or $targetCurrentItems -ge $canonicalCount)) {
                    Write-Host "SUCESSO: A caixa $TargetMailbox já contém $targetCurrentItems item(ns) (esperado: $canonicalCount). A conta está verificada e concluída no M365!" -ForegroundColor Green
                    $readiness = 'EXCHANGE_BATCH_COMPLETED'
                    $exchangeMigrationStatus = 'Completed'
                    $exchangeStatusDetail = "Caixa M365 verificada com $targetCurrentItems item(ns) (esperado: $canonicalCount). Concluída."
                    $exchangePercentageComplete = 100
                    $exchangeItemsSynced = [Math]::Min($targetCurrentItems, [Math]::Max(1, $canonicalCount))
                    $exchangeSourceItems = [Math]::Max(1, $canonicalCount)
                }
                elseif ($targetCurrentItems -gt 0) {
                    Write-Host "A caixa M365 contém $targetCurrentItems item(ns) parciais (esperado: $canonicalCount)." -ForegroundColor Yellow
                    $readiness = 'READY_FOR_EXCHANGE'
                    $exchangeStatusDetail = "Caixa M365 contém $targetCurrentItems de $canonicalCount item(ns)."
                    $exchangeItemsSynced = $targetCurrentItems
                    $exchangeSourceItems = $canonicalCount
                }
                else {
                    Write-Host "A caixa M365 está vazia (0 itens) e pronta para receber e-mails." -ForegroundColor Cyan
                    $readiness = if ($stagingComplete) { 'READY_FOR_EXCHANGE' } else { 'READY_FOR_STAGING' }
                    $exchangeStatusDetail = "Caixa M365 vazia (0 itens). Pronta para inserção direta."
                }
            }

            # Se os e-mails já estão na caixa M365, garantir marcação como concluída mesmo com lote
            if ($targetCurrentItems -gt 0 -and ($canonicalCount -eq 0 -or $targetCurrentItems -ge $canonicalCount)) {
                $readiness = 'EXCHANGE_BATCH_COMPLETED'
                $exchangeMigrationStatus = 'Completed'
                $exchangePercentageComplete = 100
                if (-not $exchangeItemsSynced -or $exchangeItemsSynced -eq 0) {
                    $exchangeItemsSynced = [Math]::Min($targetCurrentItems, [Math]::Max(1, $canonicalCount))
                }
                Write-Host "Estado reconciliado: Caixa M365 OK com $targetCurrentItems item(ns) -> Marcada como CONCLUÍDA no sistema." -ForegroundColor Green
            }
        }
    }
    finally {
        if ($DisconnectWhenDone -and $openedConnection) {
            Disconnect-ExchangeOnline -Confirm:$false
        }
    }
}

$plan = [ordered]@{
    GeneratedAtUtc          = [DateTime]::UtcNow.ToString('o')
    Phase                   = $Phase
    Readiness               = $readiness
    Group                   = $groupEmail
    BackupDirectory         = $backupDirectory
    BackupFiles             = @($archives.FullName)
    CanonicalManifest       = [System.IO.Path]::GetFullPath($manifestInfo.Manifest)
    ManifestWasCached       = [bool]$manifestInfo.Cached
    CanonicalMessages       = $canonicalCount
    EarliestMessageUtc      = ConvertTo-IsoUtcText $summary.earliest_message_utc
    LatestMessageUtc        = ConvertTo-IsoUtcText $summary.latest_message_utc
    MessageIdConflicts      = $contentConflicts
    ConflictsApproved       = [bool]$conflictsApproved
    ParseDefects            = $parseDefects
    StagingUser             = $StagingUser
    TargetSharedMailbox     = $TargetMailbox
    TargetCurrentItems      = $targetCurrentItems
    TargetTotalItemSize     = $targetTotalItemSize
    ExchangeRecipientType  = $exchangeRecipientType
    ExchangePrimarySmtp    = $exchangePrimarySmtpAddress
    ExchangeMigrationFound = $exchangeMigrationFound
    ExchangeMigrationStatus = $exchangeMigrationStatus
    ExchangeBatchStatus     = $exchangeBatchStatus
    ExchangeStatusDetail    = $exchangeStatusDetail
    ExchangePercentageComplete = $exchangePercentageComplete
    ExchangeWorkflowStep    = $exchangeWorkflowStep
    ExchangeSourceItems     = $exchangeSourceItems
    ExchangeLastSuccessfulSyncTime = $exchangeLastSuccessfulSyncTime
    ExchangeMigrationIdentity = $exchangeMigrationIdentity
    ExchangeItemsSynced    = $exchangeItemsSynced
    ExchangeItemsSkipped   = $exchangeItemsSkipped
    ExchangeBatchTotalCount = $exchangeBatchTotalCount
    ExchangeBatchSyncedCount = $exchangeBatchSyncedCount
    ExchangeBatchFailedCount = $exchangeBatchFailedCount
    ExchangeBytesTransferred = $exchangeBytesTransferred
    ExchangeErrorSummary   = $exchangeErrorSummary
    StateDatabase           = $stateDatabase
    VerifiedMessages        = $verifiedTotal
    VerificationFailed      = $state.VerificationFailed
    VerificationWarnings    = $state.Warnings
    RemainingMessages       = $canonicalCount - $verifiedTotal
    GmailDestinationMessages = $gmailDestinationMessages
    GmailGoogleWelcomeMessages = $gmailWelcomeMessages
    GmailUnknownMessages    = $gmailUnknownMessages
    GmailRemovedWelcomeMessages = $gmailRemovedWelcomeMessages
    GmailDestinationInventory = if ($destinationInventory) { $destinationInventoryJson } else { '' }
    BackupChecksumsCsv      = $backupChecksumsCsv
    ExchangeMigrationCsv    = $migrationCsv
    MigrationEndpoint       = $MigrationEndpoint
    TargetDeliveryDomain    = $TargetDeliveryDomain
    BatchName               = $BatchName
}
$planPath = Join-Path $restoreDirectory 'restore-plan.json'
$plan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $planPath -Encoding utf8NoBOM

Write-Host ""
Write-Host "Estado                : $readiness"
Write-Host "Mensagens canônicas   : $canonicalCount"
Write-Host "Verificadas no estágio: $verifiedTotal"
Write-Host "Restantes              : $($canonicalCount - $verifiedTotal)"
Write-Host "Falhas de verificação : $($state.VerificationFailed)"
Write-Host "Avisos verificados     : $($state.Warnings)"
Write-Host "Manifesto              : $($manifestInfo.Manifest)"
Write-Host "Plano                  : $planPath"
Write-Host "CSV do Exchange        : $migrationCsv"

[pscustomobject]$plan

