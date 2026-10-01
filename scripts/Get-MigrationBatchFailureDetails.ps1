[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BatchIdentity,

    [string]$AdminUpn,

    [string]$ReportRoot = (Join-Path $PSScriptRoot '..' 'reports'),

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

if (@(Get-ConnectionInformation -ErrorAction SilentlyContinue).Count -eq 0) {
    $connectParameters = @{ ShowBanner = $false; DisableWAM = $true }
    if ($AdminUpn) {
        $connectParameters.UserPrincipalName = $AdminUpn
    }
    Connect-ExchangeOnline @connectParameters
}

$runTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$safeBatchName = $BatchIdentity -replace '[^a-zA-Z0-9._-]', '_'
$reportDirectory = Join-Path $ReportRoot "batch-$safeBatchName-$runTimestamp"
New-Item -Path $reportDirectory -ItemType Directory -Force | Out-Null

try {
    $batch = Get-MigrationBatch -Identity $BatchIdentity -IncludeReport
    $migrationUsers = @(Get-MigrationUser -BatchId $BatchIdentity -ResultSize Unlimited)
    $healthyStatuses = @('Synced', 'Completed', 'Syncing', 'IncrementalSyncing', 'Completing')
    $problemUsers = @($migrationUsers | Where-Object { [string]$_.Status -notin $healthyStatuses })

    $batch | Select-Object Identity, Status, MigrationType, SourceEndpoint,
        TargetDeliveryDomain, TotalCount, SyncedCount, FailedCount, StoppedCount,
        SyncedWithErrorsCount, LastSyncedDateTime, CompleteAfter |
        Export-Csv -Path (Join-Path $reportDirectory 'batch-summary.csv') -NoTypeInformation -Encoding utf8

    $failureSummary = [System.Collections.Generic.List[object]]::new()
    $reportEntries = [System.Collections.Generic.List[object]]::new()

    foreach ($migrationUser in $problemUsers) {
        try {
            $statistics = Get-MigrationUserStatistics -Identity $migrationUser.Identity -IncludeReport
            $failureSummary.Add([pscustomobject]@{
                Identity               = Get-SafePropertyValue $migrationUser 'Identity'
                BatchId                = Get-SafePropertyValue $migrationUser 'BatchId'
                Status                 = Get-SafePropertyValue $statistics 'Status'
                StatusDetail           = Get-SafePropertyValue $statistics 'StatusDetail'
                PercentageComplete     = Get-SafePropertyValue $statistics 'PercentageComplete'
                ItemsSynced            = Get-SafePropertyValue $statistics 'ItemsSynced'
                ItemsSkipped           = Get-SafePropertyValue $statistics 'ItemsSkipped'
                BytesTransferred       = Get-SafePropertyValue $statistics 'BytesTransferred'
                LastSuccessfulSyncTime = Get-SafePropertyValue $statistics 'LastSuccessfulSyncTime'
                Error                  = Get-SafePropertyValue $statistics 'Error'
                FailureType            = Get-SafePropertyValue $statistics 'FailureType'
                FailureSide            = Get-SafePropertyValue $statistics 'FailureSide'
            })

            $report = Get-SafePropertyValue $statistics 'Report'
            $entries = Get-SafePropertyValue $report 'Entries'
            foreach ($entry in @($entries)) {
                $reportEntries.Add([pscustomobject]@{
                    MigrationIdentity = Get-SafePropertyValue $migrationUser 'Identity'
                    CreationTime      = Get-SafePropertyValue $entry 'CreationTime'
                    Severity          = Get-SafePropertyValue $entry 'Severity'
                    FailureType       = Get-SafePropertyValue $entry 'FailureType'
                    FailureSide       = Get-SafePropertyValue $entry 'FailureSide'
                    Message           = Get-SafePropertyValue $entry 'Message'
                    DataContext       = Get-SafePropertyValue $entry 'DataContext'
                    ExceptionType     = Get-SafePropertyValue $entry 'ExceptionType'
                    ExceptionMessage  = Get-SafePropertyValue $entry 'ExceptionMessage'
                })
            }

            $safeIdentity = ([string]$migrationUser.Identity) -replace '[^a-zA-Z0-9._-]', '_'
            $statistics |
                Format-List * |
                Out-String -Width 260 |
                Set-Content -Path (Join-Path $reportDirectory "statistics-$safeIdentity.txt") -Encoding utf8
        }
        catch {
            $failureSummary.Add([pscustomobject]@{
                Identity               = Get-SafePropertyValue $migrationUser 'Identity'
                BatchId                = Get-SafePropertyValue $migrationUser 'BatchId'
                Status                 = Get-SafePropertyValue $migrationUser 'Status'
                StatusDetail           = $null
                PercentageComplete     = $null
                ItemsSynced            = $null
                ItemsSkipped           = $null
                BytesTransferred       = $null
                LastSuccessfulSyncTime = $null
                Error                  = "Falha ao obter estatísticas: $($_.Exception.Message)"
                FailureType            = $null
                FailureSide            = $null
            })
        }
    }

    $failureSummary |
        Export-Csv -Path (Join-Path $reportDirectory 'failure-summary.csv') -NoTypeInformation -Encoding utf8
    $reportEntries |
        Export-Csv -Path (Join-Path $reportDirectory 'failure-report-entries.csv') -NoTypeInformation -Encoding utf8

    [pscustomobject]@{
        ReportDirectory = (Resolve-Path $reportDirectory).Path
        BatchStatus     = $batch.Status
        TotalCount      = $batch.TotalCount
        SyncedCount     = $batch.SyncedCount
        FailedCount     = $batch.FailedCount
        ProblemUsers    = $problemUsers.Count
    }
}
finally {
    if ($DisconnectWhenDone) {
        Disconnect-ExchangeOnline -Confirm:$false
    }
}

