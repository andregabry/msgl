[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BucketRoot,
    [string]$GoogleDomain = 'enging.pt',
    [string]$GoogleAdmin = 'andre.gabry@enging.pt',
    [string]$ServiceAccountFile = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/service-account.json'),
    [string]$PythonPath = 'python',
    [string]$WorkspaceRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/_migration-system')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($BucketRoot -notmatch '^gs://([^/]+)/(.+?)/?$') {
    throw 'BucketRoot precisa apontar para uma exportação no formato gs://bucket/exportacao/.'
}
$bucketName = $Matches[1]
$objectRoot = $Matches[2].TrimEnd('/')
$exportId = $objectRoot.Split('/')[-1]
$bucketPrefix = "gs://$bucketName/$objectRoot/"

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloud) {
    throw 'Google Cloud CLI (gcloud) não foi encontrado no PATH.'
}
$activeAccount = (& $gcloud.Source config get-value account 2>$null | Out-String).Trim()
if (-not $activeAccount -or $activeAccount -eq '(unset)') {
    throw 'O gcloud não possui uma conta administrativa ativa. Use Autenticar Google no painel.'
}

$runTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportRoot = Join-Path $WorkspaceRoot 'runs/discovery'
$reportDirectory = Join-Path $reportRoot "google-groups-$runTimestamp"
New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null

Write-Host 'Atualizando a lista administrativa de Google Groups...'
$inventoryOutput = @(& (Join-Path $PSScriptRoot 'Get-GoogleGroupInventory.ps1') `
    -Domain $GoogleDomain `
    -AuthMode ServiceAccount `
    -AdminUser $GoogleAdmin `
    -ServiceAccountFile $ServiceAccountFile `
    -PythonPath $PythonPath `
    -ReportRoot $reportDirectory)
$inventory = $inventoryOutput |
    Where-Object { $_.PSObject.Properties.Name -contains 'GroupsCsv' } |
    Select-Object -Last 1
if (-not $inventory) {
    throw 'O coletor administrativo terminou sem informar o inventário gerado.'
}
$groupsCsv = [string]$inventory.GroupsCsv
if (-not (Test-Path -LiteralPath $groupsCsv -PathType Leaf)) {
    throw 'O inventário administrativo de grupos não foi gerado.'
}

$directoryGroups = [ordered]@{}
foreach ($row in @(Import-Csv -LiteralPath $groupsCsv)) {
    $emailProperty = @('email', 'Email', 'GroupEmail') |
        Where-Object { $row.PSObject.Properties.Name -contains $_ } |
        Select-Object -First 1
    if (-not $emailProperty) {
        throw 'O inventário administrativo não possui uma coluna de e-mail.'
    }
    $email = ([string]$row.$emailProperty).Trim().ToLowerInvariant()
    if ($email -match "^[a-z0-9][a-z0-9._-]*@$([regex]::Escape($GoogleDomain))$") {
        $directoryGroups[$email] = [pscustomobject]@{
            Email       = $email
            DisplayName = [string]$row.name
            Description = [string]$row.description
        }
    }
}

Write-Host 'Consultando as pastas da exportação no Google Cloud...'
$jsonText = (& $gcloud.Source storage ls --json "$bucketPrefix*" 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    if ($jsonText -match 'reauthentication failed|refreshing your current auth tokens|gcloud auth login') {
        throw "A sessão do Google Cloud expirou para $activeAccount. Use Autenticar Google no painel."
    }
    throw "Não foi possível listar a exportação $bucketPrefix`n$jsonText"
}
$remoteItems = if ($jsonText) { @($jsonText | ConvertFrom-Json) } else { @() }
$remoteByGroup = [ordered]@{}
foreach ($item in $remoteItems) {
    if ([string]$item.type -notin @('object', 'cloud_object')) {
        continue
    }
    $objectName = [string]$item.metadata.name
    $expectedPrefix = "$objectRoot/"
    if (-not $objectName.StartsWith($expectedPrefix, [StringComparison]::Ordinal)) {
        continue
    }
    $relativeName = $objectName.Substring($expectedPrefix.Length)
    $parts = @($relativeName -split '/', 2)
    if ($parts.Count -ne 2) {
        continue
    }
    $email = $parts[0].ToLowerInvariant()
    if (-not $directoryGroups.Contains($email)) {
        continue
    }
    if (-not $remoteByGroup.Contains($email)) {
        $remoteByGroup[$email] = [ordered]@{
            GroupEmail    = $email
            DisplayName   = $directoryGroups[$email].DisplayName
            Description   = $directoryGroups[$email].Description
            RemoteObjects = 0
            RemoteBytes   = [long]0
            BucketPrefix  = "$bucketPrefix$($parts[0])/"
            LastUpdatedUtc = ''
        }
    }
    $group = $remoteByGroup[$email]
    $group.RemoteObjects++
    $group.RemoteBytes += [long]$item.metadata.size
    $updated = if ($item.metadata.updated -is [datetime]) {
        $item.metadata.updated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    else {
        [string]$item.metadata.updated
    }
    if ($updated -gt $group.LastUpdatedUtc) {
        $group.LastUpdatedUtc = $updated
    }
}

$result = [ordered]@{
    SchemaVersion       = 1
    GeneratedAtUtc      = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    ActiveAccount       = $activeAccount
    GoogleDomain        = $GoogleDomain
    ExportId            = $exportId
    BucketRoot          = $bucketPrefix
    DirectoryGroups     = $directoryGroups.Count
    GroupsWithBackups   = $remoteByGroup.Count
    Groups              = @($remoteByGroup.Values)
    DirectoryGroupsCsv  = $groupsCsv
    ReportDirectory     = $reportDirectory
}

New-Item -ItemType Directory -Path $WorkspaceRoot -Force | Out-Null
$statePath = Join-Path $WorkspaceRoot 'remote-groups.json'
$temporaryPath = "$statePath.tmp"
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporaryPath -Encoding utf8NoBOM
Move-Item -LiteralPath $temporaryPath -Destination $statePath -Force

Write-Host "Google Groups ativos : $($directoryGroups.Count)"
Write-Host "Grupos com backup    : $($remoteByGroup.Count)"
Write-Host "Exportação           : $exportId"
Write-Host "Catálogo remoto      : $statePath"
[pscustomobject]$result
