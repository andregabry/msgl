[CmdletBinding()]
param(
    [string]$AdminUpn,
    [string]$ExpectedDomain,
    [string]$TargetIdentity,
    [string]$ReportRoot = (Join-Path $PSScriptRoot '..' 'reports'),
    [switch]$DeviceCode,
    [switch]$DisableWAM,
    [switch]$IncludeProblemDetails,
    [switch]$DisconnectWhenDone
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module ExchangeOnlineManagement -ErrorAction Stop

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

$existingConnection = @(Get-ConnectionInformation -ErrorAction SilentlyContinue)
if ($existingConnection.Count -eq 0) {
    $connectionParameters = @{ ShowBanner = $false }
    if ($AdminUpn) {
        $connectionParameters.UserPrincipalName = $AdminUpn
    }
    if ($DeviceCode) {
        $connectionParameters.Device = $true
    }
    if ($DisableWAM) {
        $connectionParameters.DisableWAM = $true
    }

    Connect-ExchangeOnline @connectionParameters
}

$runTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportDirectory = Join-Path $ReportRoot "exchange-$runTimestamp"
New-Item -Path $reportDirectory -ItemType Directory -Force | Out-Null

try {
    $connection = @(Get-ConnectionInformation | Select-Object -First 1)
    if ($ExpectedDomain) {
        Get-AcceptedDomain -Identity $ExpectedDomain -ErrorAction Stop | Out-Null
    }

    $batches = @(Get-MigrationBatch -ResultSize Unlimited)
    $users = @(Get-MigrationUser -ResultSize Unlimited)
    $endpoints = @(Get-MigrationEndpoint)

    if ($TargetIdentity) {
        $users = @($users | Where-Object {
            ([string]$_.Identity -like "*$TargetIdentity*") -or
            ([string]$_.EmailAddress -like "*$TargetIdentity*")
        })
    }

    $batchSummary = @($batches | Select-Object @(
        'Identity',
        'Status',
        'MigrationType',
        'Direction',
        'SourceEndpoint',
        'TargetDeliveryDomain',
        'TotalCount',
        'SyncedCount',
        'FinalizedCount',
        'FailedCount',
        'StoppedCount',
        'SyncedWithErrorsCount',
        'StartTime',
        'LastSyncedDateTime',
        'CompleteAfter',
        'AutoRetryCount'
    ))

    $userSummary = @($users | Select-Object @(
        'Identity',
        'EmailAddress',
        'BatchId',
        'Status',
        'ItemsSynced',
        'ItemsSkipped',
        'LastSuccessfulSyncTime',
        'ErrorSummary'
    ))

    $endpointSummary = @($endpoints | Select-Object @(
        'Identity',
        'EndpointType',
        'RemoteServer',
        'Port',
        'Security',
        'Authentication',
        'MaxConcurrentMigrations',
        'MaxConcurrentIncrementalSyncs',
        'LastModifiedTime'
    ))

    $batchSummary | Export-Csv -Path (Join-Path $reportDirectory 'migration-batches.csv') -NoTypeInformation -Encoding utf8
    $userSummary | Export-Csv -Path (Join-Path $reportDirectory 'migration-users.csv') -NoTypeInformation -Encoding utf8
    $endpointSummary | Export-Csv -Path (Join-Path $reportDirectory 'migration-endpoints.csv') -NoTypeInformation -Encoding utf8

    $problemStatuses = @('Failed', 'Stopped', 'Corrupted', 'IncrementalFailed', 'CompletionFailed')
    $problemUsers = @($users | Where-Object {
        ([string]$_.Status -in $problemStatuses) -or
        (-not [string]::IsNullOrWhiteSpace([string]$_.ErrorSummary))
    })

    $problemDetails = foreach ($migrationUser in $problemUsers) {
        if (-not $IncludeProblemDetails) {
            [pscustomobject]@{
                Identity               = $migrationUser.Identity
                BatchId                = $migrationUser.BatchId
                Status                 = $migrationUser.Status
                StatusDetail           = $null
                ItemsSynced            = Get-SafePropertyValue $migrationUser 'ItemsSynced'
                ItemsSkipped           = Get-SafePropertyValue $migrationUser 'ItemsSkipped'
                BytesTransferred       = $null
                LastSuccessfulSyncTime = Get-SafePropertyValue $migrationUser 'LastSuccessfulSyncTime'
                Error                  = Get-SafePropertyValue $migrationUser 'ErrorSummary'
                ReportFile             = $null
            }
            continue
        }

        try {
            $statistics = Get-MigrationUserStatistics -Identity $migrationUser.Identity -IncludeReport
            $safeIdentity = ([string]$migrationUser.Identity) -replace '[^a-zA-Z0-9._-]', '_'
            $reportPath = Join-Path $reportDirectory "problem-$safeIdentity.txt"

            if ($statistics.Report -and $statistics.Report.Entries) {
                $statistics.Report.Entries |
                    Format-List * |
                    Out-String -Width 240 |
                    Set-Content -Path $reportPath -Encoding utf8
            }

            [pscustomobject]@{
                Identity               = $migrationUser.Identity
                BatchId                = $migrationUser.BatchId
                Status                 = $statistics.Status
                StatusDetail           = $statistics.StatusDetail
                ItemsSynced            = $statistics.ItemsSynced
                ItemsSkipped           = $statistics.ItemsSkipped
                BytesTransferred       = $statistics.BytesTransferred
                LastSuccessfulSyncTime = $statistics.LastSuccessfulSyncTime
                Error                  = $statistics.Error
                ReportFile             = if (Test-Path $reportPath) { $reportPath } else { $null }
            }
        }
        catch {
            [pscustomobject]@{
                Identity               = $migrationUser.Identity
                BatchId                = $migrationUser.BatchId
                Status                 = $migrationUser.Status
                StatusDetail           = $null
                ItemsSynced            = Get-SafePropertyValue $migrationUser 'ItemsSynced'
                ItemsSkipped           = Get-SafePropertyValue $migrationUser 'ItemsSkipped'
                BytesTransferred       = $null
                LastSuccessfulSyncTime = Get-SafePropertyValue $migrationUser 'LastSuccessfulSyncTime'
                Error                  = "Falha ao obter estatísticas detalhadas: $($_.Exception.Message)"
                ReportFile             = $null
            }
        }
    }

    @($problemDetails) |
        Export-Csv -Path (Join-Path $reportDirectory 'migration-problems.csv') -NoTypeInformation -Encoding utf8

    $problemBatches = @($batches | Where-Object {
        ([string]$_.Status -in $problemStatuses) -or
        ([int]$_.FailedCount -gt 0) -or
        ([int]$_.SyncedWithErrorsCount -gt 0)
    })

    foreach ($batch in @($problemBatches | Where-Object { $IncludeProblemDetails })) {
        $safeBatchName = ([string]$batch.Identity) -replace '[^a-zA-Z0-9._-]', '_'
        $batchReportPath = Join-Path $reportDirectory "batch-$safeBatchName.txt"
        try {
            $batchWithReport = Get-MigrationBatch -Identity $batch.Identity -IncludeReport
            if ($batchWithReport.Report -and $batchWithReport.Report.Entries) {
                $batchWithReport.Report.Entries |
                    Format-List * |
                    Out-String -Width 240 |
                    Set-Content -Path $batchReportPath -Encoding utf8
            }
        }
        catch {
            "Falha ao obter o relatório do lote: $($_.Exception.Message)" |
                Set-Content -Path $batchReportPath -Encoding utf8
        }
    }

    $summaryLines = @(
        "Gerado em: $(Get-Date -Format o)",
        "Conta conectada: $([string](Get-SafePropertyValue ($connection | Select-Object -First 1) 'UserPrincipalName'))",
        "Domínio validado: $ExpectedDomain",
        "Filtro de identidade: $TargetIdentity",
        "Relatórios detalhados: $([bool]$IncludeProblemDetails)",
        "Lotes: $($batches.Count)",
        "Usuários/objetos de migração: $($users.Count)",
        "Endpoints: $($endpoints.Count)",
        "Lotes com erro/atenção: $($problemBatches.Count)",
        "Usuários/objetos com erro/atenção: $($problemUsers.Count)"
    )
    $summaryLines | Set-Content -Path (Join-Path $reportDirectory 'summary.txt') -Encoding utf8

    [pscustomobject]@{
        ReportDirectory = (Resolve-Path $reportDirectory).Path
        ConnectedAs     = [string](Get-SafePropertyValue ($connection | Select-Object -First 1) 'UserPrincipalName')
        ExpectedDomain  = $ExpectedDomain
        TargetIdentity  = $TargetIdentity
        BatchCount      = $batches.Count
        MigrationUsers = $users.Count
        EndpointCount   = $endpoints.Count
        ProblemBatches  = $problemBatches.Count
        ProblemUsers    = $problemUsers.Count
    }
}
finally {
    if ($DisconnectWhenDone) {
        Disconnect-ExchangeOnline -Confirm:$false
    }
}
