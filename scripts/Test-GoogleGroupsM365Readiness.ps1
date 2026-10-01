[CmdletBinding()]
param(
    [string]$WorkspaceRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/_migration-system'),
    [string]$MappingCsv,
    [string[]]$Group,
    [string]$ExchangeAdmin = 'andre.gabry@dynamox.net',
    [string]$MigrationEndpoint = 'GoogleWorkspace',
    [switch]$DisconnectWhenDone
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-StagingState {
    param([Parameter(Mandatory)][string]$StateDatabase)

    $result = [ordered]@{ Verified = 0; VerificationFailed = 0; Tracked = 0 }
    if (-not (Test-Path -LiteralPath $StateDatabase -PathType Leaf)) {
        return [pscustomobject]$result
    }
    $sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if (-not $sqlite) {
        throw 'sqlite3 não foi encontrado no PATH.'
    }
    $query = 'SELECT status, COUNT(*) AS count FROM imports GROUP BY status;'
    $json = (& $sqlite.Source -json $StateDatabase $query | Out-String).Trim()
    if ($json) {
        foreach ($row in @($json | ConvertFrom-Json)) {
            switch ([string]$row.status) {
                'seeded_existing' { $result.Verified += [int]$row.count }
                'verified' { $result.Verified += [int]$row.count }
                'verification_failed' { $result.VerificationFailed += [int]$row.count }
            }
        }
    }
    $result.Tracked = $result.Verified + $result.VerificationFailed
    return [pscustomobject]$result
}

$workspace = [System.IO.Path]::GetFullPath($WorkspaceRoot)
if (-not $MappingCsv) {
    $latestPath = Join-Path (Join-Path $workspace 'catalog') 'latest-preparation.json'
    if (-not (Test-Path -LiteralPath $latestPath -PathType Leaf)) {
        throw "Nenhuma preparação foi registrada: $latestPath"
    }
    $latest = Get-Content -LiteralPath $latestPath -Raw | ConvertFrom-Json
    $MappingCsv = [string]$latest.MappingCsv
}
if (-not (Test-Path -LiteralPath $MappingCsv -PathType Leaf)) {
    throw "Mapeamento não encontrado: $MappingCsv"
}
$mapping = @(Import-Csv -LiteralPath $MappingCsv)
if ($Group) {
    $requested = @($Group | ForEach-Object {
        $value = $_.Trim().ToLowerInvariant()
        if ($value -notmatch '@') { "$value@enging.pt" } else { $value }
    })
    $mapping = @($mapping | Where-Object GroupEmail -In $requested)
}
if ($mapping.Count -eq 0) {
    throw 'Nenhum grupo foi selecionado no mapeamento.'
}

$module = Get-Module -ListAvailable ExchangeOnlineManagement |
    Sort-Object Version -Descending |
    Select-Object -First 1
if (-not $module) {
    throw 'O módulo ExchangeOnlineManagement não está instalado.'
}
Import-Module $module.Path -Force
$openedConnection = $false
$connected = @(Get-ConnectionInformation -ErrorAction SilentlyContinue | Where-Object State -EQ 'Connected')
if ($connected.Count -eq 0) {
    $connectParams = @{
        UserPrincipalName = $ExchangeAdmin
        ShowBanner        = $false
    }
    if ($PSVersionTable.Platform -eq 'Unix') {
        $connectParams.DisableWAM = $true
    }
    Connect-ExchangeOnline @connectParams
    $openedConnection = $true
}

try {
    $endpoint = Get-MigrationEndpoint -Identity $MigrationEndpoint -ErrorAction SilentlyContinue
    $targetDeliveryDomain = Get-MigrationBatch |
        Where-Object { $_.MigrationType -eq 'Gmail' -and $_.TargetDeliveryDomain } |
        Sort-Object CreationTime -Descending |
        Select-Object -First 1 -ExpandProperty TargetDeliveryDomain

    $results = foreach ($row in $mapping) {
        $groupEmail = ([string]$row.GroupEmail).ToLowerInvariant()
        $target = ([string]$row.TargetSharedMailbox).ToLowerInvariant()
        $summary = Get-Content -LiteralPath $row.Summary -Raw | ConvertFrom-Json
        $canonical = [int]$summary.takeout.canonical_unique_messages
        $contentConflicts = [int]$summary.takeout.message_id_content_hash_conflicts
        $stateDatabase = Join-Path $row.StateDirectory 'import-state.sqlite3'
        $state = Get-StagingState -StateDatabase $stateDatabase
        $recipient = Get-EXORecipient `
            -Identity $target `
            -Properties RecipientTypeDetails, PrimarySmtpAddress `
            -ErrorAction SilentlyContinue
        $migrationUser = Get-MigrationUser -Identity $target -ErrorAction SilentlyContinue
        $supportedTypes = @('SharedMailbox', 'UserMailbox', 'RoomMailbox', 'EquipmentMailbox')
        $isSupportedMailbox = $recipient -and ([string]$recipient.RecipientTypeDetails -in $supportedTypes)
        $mailboxStatistics = if ($isSupportedMailbox) {
            Get-EXOMailboxStatistics -Identity $target -ErrorAction SilentlyContinue
        }
        else { $null }

        $status = if (-not $endpoint) {
            'MigrationEndpointMissing'
        }
        elseif (-not $recipient) {
            'TargetMailboxMissing'
        }
        elseif (-not $isSupportedMailbox) {
            'TargetIsNotSupportedMailbox'
        }
        elseif ($contentConflicts -gt 0) {
            'ReviewMessageIdConflicts'
        }
        elseif ($migrationUser) {
            'MigrationAlreadyExists'
        }
        elseif ($state.VerificationFailed -gt 0) {
            'StagingVerificationFailed'
        }
        elseif ($state.Verified -gt $canonical) {
            'StagingCountMismatch'
        }
        elseif ($state.Verified -eq $canonical) {
            'ReadyForExchangeBatch'
        }
        else {
            'ReadyToStage'
        }

        [pscustomobject]@{
            GroupEmail          = $groupEmail
            TargetSharedMailbox = $target
            TargetType         = if ($recipient) { [string]$recipient.RecipientTypeDetails } else { '' }
            StagingUser         = [string]$row.StagingUser
            CanonicalMessages  = $canonical
            StagingVerified    = $state.Verified
            VerificationFailed = $state.VerificationFailed
            RemainingMessages  = $canonical - $state.Verified
            ContentConflicts   = $contentConflicts
            MigrationEndpoint  = if ($endpoint) { [string]$endpoint.Identity } else { '' }
            TargetDeliveryDomain = [string]$targetDeliveryDomain
            ExistingBatch      = if ($migrationUser) { [string]$migrationUser.BatchId } else { '' }
            TargetCurrentItems = if ($mailboxStatistics) { [long]$mailboxStatistics.ItemCount } else { 0 }
            TargetCurrentSize  = if ($mailboxStatistics) { [string]$mailboxStatistics.TotalItemSize } else { '' }
            Status             = $status
        }
    }

    $runTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $reportDirectory = Join-Path (Join-Path $workspace 'runs') "m365-readiness-$runTimestamp"
    New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
    $reportPath = Join-Path $reportDirectory 'm365-readiness.csv'
    @($results) | Export-Csv -LiteralPath $reportPath -NoTypeInformation -Encoding utf8NoBOM
    Write-Host "Endpoint            : $(if ($endpoint) { $endpoint.Identity } else { 'NÃO ENCONTRADO' })"
    Write-Host "Target delivery     : $targetDeliveryDomain"
    Write-Host "Grupos verificados  : $(@($results).Count)"
    Write-Host "Relatório            : $reportPath"
    $results
}
finally {
    if ($DisconnectWhenDone -and $openedConnection) {
        Disconnect-ExchangeOnline -Confirm:$false
    }
}
