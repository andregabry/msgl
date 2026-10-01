[CmdletBinding()]
param(
    [ValidateSet('Inventory', 'Download')]
    [string]$Phase = 'Inventory',

    [string]$GroupsCsv,
    [string[]]$GroupEmail,
    [string[]]$ObjectRelativePath,
    [string]$ObjectSelectionJson,
    [string]$GroupBucketPrefix,
    [string]$BucketRoot = 'gs://dwt-takeout-export--5522609548690436666/20260826T152249Z/',
    [string]$DestinationRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/20260826T152249Z'),
    [string]$ReportRoot = (Join-Path $PSScriptRoot '..' 'reports'),
    [string]$WorkspaceRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/_migration-system'),
    [string]$ExportId,
    [ValidateRange(5, 1024)][int]$ReserveFreeGiB = 15,
    [string]$CloudSdkConfig,
    [switch]$RegisterAfterDownload,
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

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

function Get-GroupEmails {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Inventário de grupos não encontrado: $Path"
    }
    $emails = foreach ($row in @(Import-Csv -LiteralPath $Path)) {
        $property = @('email', 'Email', 'GroupEmail', 'SourceGroup') |
            Where-Object { $row.PSObject.Properties.Name -contains $_ } |
            Select-Object -First 1
        if (-not $property) {
            throw "O CSV precisa de uma coluna email, Email, GroupEmail ou SourceGroup: $Path"
        }
        $value = ([string]$row.$property).Trim().ToLowerInvariant()
        if ($value -notmatch '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
            throw "Endereço de grupo inválido no inventário: $value"
        }
        $value
    }
    return @($emails | Sort-Object -Unique)
}

function Convert-HexToBase64 {
    param([Parameter(Mandatory)][string]$Hex)

    $bytes = [Convert]::FromHexString($Hex)
    return [Convert]::ToBase64String($bytes)
}

function Get-LocalObjectState {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][long]$RemoteBytes,
        [AllowEmptyString()][string]$RemoteMd5
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return 'Missing'
    }
    $file = Get-Item -LiteralPath $Path
    if ($file.Length -ne $RemoteBytes) {
        return 'SizeMismatch'
    }
    if ([string]::IsNullOrWhiteSpace($RemoteMd5)) {
        return 'SizeVerifiedNoMd5'
    }
    $localMd5Hex = (Get-FileHash -LiteralPath $Path -Algorithm MD5).Hash
    $localMd5 = Convert-HexToBase64 -Hex $localMd5Hex
    if ($localMd5 -ne $RemoteMd5) {
        return 'Md5Mismatch'
    }
    return 'Verified'
}

function Get-PropertySum {
    param(
        [AllowEmptyCollection()][object[]]$Items,
        [Parameter(Mandatory)][string]$Property
    )

    if (@($Items).Count -eq 0) {
        return [long]0
    }
    $measurement = @($Items) | Measure-Object -Property $Property -Sum
    return [long]$measurement.Sum
}

function Save-GroupRemoteState {
    param(
        [Parameter(Mandatory)][string]$Workspace,
        [Parameter(Mandatory)][string]$Email,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$RemoteObjects,
        [Parameter(Mandatory)][object]$GroupSummary,
        [Parameter(Mandatory)][object]$RunSummary,
        [Parameter(Mandatory)][string]$RunDirectory
    )

    $safeGroup = $Email -replace '[^a-zA-Z0-9._-]', '_'
    $stateDirectory = Join-Path (Join-Path $Workspace 'groups') $safeGroup
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $statePath = Join-Path $stateDirectory 'remote-backup.json'
    $temporaryPath = "$statePath.tmp"
    [ordered]@{
        SchemaVersion   = 1
        GeneratedAtUtc  = $RunSummary.GeneratedAtUtc
        Phase           = $RunSummary.Phase
        ActiveAccount   = $RunSummary.ActiveAccount
        GroupEmail      = $Email
        ExportId        = $RunSummary.ExportId
        BucketRoot      = $RunSummary.BucketRoot
        DestinationRoot = $RunSummary.DestinationRoot
        Status          = $GroupSummary.Status
        RemoteObjects   = [int]$GroupSummary.RemoteObjects
        RemoteBytes     = [long]$GroupSummary.RemoteBytes
        MissingBytes    = [long]$GroupSummary.MissingBytes
        SelectedObjects = [int]$RunSummary.SelectedObjects
        SelectedBytes   = [long]$RunSummary.SelectedBytes
        Detail          = [string]$GroupSummary.Detail
        ReportDirectory = $RunDirectory
        Objects         = @($RemoteObjects)
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporaryPath -Encoding utf8NoBOM
    Move-Item -LiteralPath $temporaryPath -Destination $statePath -Force
}

if ($CloudSdkConfig) {
    if (-not (Test-Path -LiteralPath $CloudSdkConfig -PathType Container)) {
        throw "Configuração do Google Cloud SDK não encontrada: $CloudSdkConfig"
    }
    $env:CLOUDSDK_CONFIG = (Resolve-Path -LiteralPath $CloudSdkConfig).Path
}

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloud) {
    throw 'Google Cloud CLI (gcloud) não foi encontrado no PATH.'
}
$gsutil = Get-Command gsutil -ErrorAction SilentlyContinue
if (-not $gsutil) {
    throw 'Google Cloud CLI (gsutil) não foi encontrado no PATH.'
}

$activeAccount = (& $gcloud.Source config get-value account 2>$null | Out-String).Trim()
if (-not $activeAccount -or $activeAccount -eq '(unset)') {
    throw @'
O gcloud não possui uma conta administrativa ativa. O bucket temporário do
Data Export não aceita a conta de serviço. Autentique uma vez e mantenha o
PowerShell aberto até o comando confirmar a gravação da credencial:

  gcloud auth login andre.gabry@enging.pt

Isso não registra um aplicativo nem inscreve novamente o Mac no MDM.
'@
}

$resolvedReportRoot = [System.IO.Path]::GetFullPath($ReportRoot)
$resolvedGroupsCsv = ''
$groupEmails = @(if ($GroupEmail -and @($GroupEmail).Count -gt 0) {
    $GroupEmail | ForEach-Object {
        $value = $_.Trim().ToLowerInvariant()
        if ($value -notmatch '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
            throw "Endereço de grupo inválido: $value"
        }
        $value
    } | Sort-Object -Unique
}
else {
    if (-not $GroupsCsv) {
        $GroupsCsv = Get-LatestGroupInventory -Root $resolvedReportRoot
    }
    $resolvedGroupsCsv = (Resolve-Path -LiteralPath $GroupsCsv).Path
    Get-GroupEmails -Path $resolvedGroupsCsv
})
if ($groupEmails.Count -eq 0) {
    throw "O inventário não contém grupos: $resolvedGroupsCsv"
}
$ExportId = if ($ExportId) { $ExportId.Trim() } else { $BucketRoot.TrimEnd('/').Split('/')[-1] }
if ($ExportId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
    throw "ExportId inválido: $ExportId"
}

$runTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportDirectory = Join-Path $resolvedReportRoot "takeout-all-groups-$runTimestamp"
New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
$remoteObjectsCsv = Join-Path $reportDirectory 'remote-objects.csv'
$groupSummaryCsv = Join-Path $reportDirectory 'group-download-summary.csv'
$transferManifest = Join-Path $reportDirectory 'transfer-manifest.csv'

$bucketPrefix = $BucketRoot.TrimEnd('/') + '/'
$resolvedGroupBucketPrefix = ''
if ($GroupBucketPrefix) {
    if ($groupEmails.Count -ne 1) {
        throw 'GroupBucketPrefix somente pode ser usado com um único GroupEmail.'
    }
    $resolvedGroupBucketPrefix = $GroupBucketPrefix.TrimEnd('/') + '/'
    if (-not $resolvedGroupBucketPrefix.StartsWith($bucketPrefix, [StringComparison]::Ordinal)) {
        throw 'GroupBucketPrefix precisa estar dentro do BucketRoot configurado.'
    }
    $folderEmail = $resolvedGroupBucketPrefix.Substring($bucketPrefix.Length).TrimEnd('/')
    if ($folderEmail.Contains('/') -or $folderEmail.ToLowerInvariant() -ne $groupEmails[0]) {
        throw 'GroupBucketPrefix não corresponde exatamente ao grupo selecionado.'
    }
}
$objects = [System.Collections.Generic.List[object]]::new()
$groupSummaries = [System.Collections.Generic.List[object]]::new()

Write-Host "Conta gcloud       : $activeAccount"
Write-Host "Origem Google      : $BucketRoot"
Write-Host "Exportação         : $ExportId"
Write-Host "Grupos esperados    : $($groupEmails.Count)"

foreach ($currentGroupEmail in $groupEmails) {
    $groupPrefix = if ($resolvedGroupBucketPrefix) { $resolvedGroupBucketPrefix } else { "$bucketPrefix$currentGroupEmail/" }
    $query = "$groupPrefix**"
    $jsonText = (& $gcloud.Source storage ls --json $query 2>&1 | Out-String).Trim()
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        if ($jsonText -match 'reauthentication failed|refreshing your current auth tokens|gcloud auth login') {
            throw "A sessão do Google Cloud expirou para $activeAccount. Use o botão Autenticar Google no painel e repita a consulta."
        }
        if ($jsonText -match 'permission|does not have|active account|401|403') {
            throw "A conta $activeAccount não conseguiu listar $groupPrefix`n$jsonText"
        }
        $groupSummaries.Add([pscustomobject]@{
            GroupEmail    = $currentGroupEmail
            Status        = 'MissingFromExport'
            RemoteObjects = 0
            RemoteBytes   = 0
            MissingBytes  = 0
            Detail        = $jsonText
        })
        continue
    }

    $remoteItems = if ($jsonText) { @($jsonText | ConvertFrom-Json) } else { @() }
    $groupObjectCount = 0
    [long]$groupBytes = 0
    [long]$groupMissingBytes = 0
    foreach ($item in $remoteItems) {
        if ([string]$item.type -notin @('object', 'cloud_object')) {
            continue
        }
        # Current gcloud versions identify entries as cloud_object and append
        # #generation to url. That suffix is useful for audit metadata, but it
        # must not become part of the local filename.
        $remoteUri = ([string]$item.url) -replace '#[0-9]+$', ''
        $relativePath = $remoteUri.Substring($groupPrefix.Length)
        if ([string]::IsNullOrWhiteSpace($relativePath) -or $relativePath.EndsWith('/')) {
            continue
        }
        if ($relativePath -match '(^|/)\.\.(/|$)') {
            throw "Caminho remoto inseguro: $remoteUri"
        }
        [long]$remoteBytes = [long]$item.metadata.size
        $remoteUpdatedUtc = if ($item.metadata.updated -is [datetime]) {
            $item.metadata.updated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        }
        else {
            [string]$item.metadata.updated
        }
        $localPath = Join-Path (Join-Path $DestinationRoot $currentGroupEmail) $relativePath
        $localState = Get-LocalObjectState `
            -Path $localPath `
            -RemoteBytes $remoteBytes `
            -RemoteMd5 ([string]$item.metadata.md5Hash
        )
        if ($localState -eq 'Missing') {
            $groupMissingBytes += $remoteBytes
        }
        $objects.Add([pscustomobject]@{
            GroupEmail  = $currentGroupEmail
            RemoteUri   = $remoteUri
            RelativePath = $relativePath
            RemoteBytes = $remoteBytes
            Md5Base64   = [string]$item.metadata.md5Hash
            Crc32c      = [string]$item.metadata.crc32c
            Generation  = [string]$item.metadata.generation
            UpdatedUtc  = $remoteUpdatedUtc
            LocalPath   = $localPath
            LocalState  = $localState
        })
        $groupObjectCount++
        $groupBytes += $remoteBytes
    }

    $groupSummaries.Add([pscustomobject]@{
        GroupEmail    = $currentGroupEmail
        Status        = if ($groupObjectCount -gt 0) { 'Found' } else { 'MissingFromExport' }
        RemoteObjects = $groupObjectCount
        RemoteBytes   = $groupBytes
        MissingBytes  = $groupMissingBytes
        Detail        = ''
    })
}

$objects | Export-Csv -LiteralPath $remoteObjectsCsv -NoTypeInformation -Encoding utf8NoBOM
$groupSummaries | Export-Csv -LiteralPath $groupSummaryCsv -NoTypeInformation -Encoding utf8NoBOM

$selectionFromJson = @()
if (-not [string]::IsNullOrWhiteSpace($ObjectSelectionJson)) {
    try {
        $selectionFromJson = @($ObjectSelectionJson | ConvertFrom-Json)
    }
    catch {
        throw 'A seleção JSON de arquivos do Google é inválida.'
    }
}
$requestedRelativePaths = @(
    @($ObjectRelativePath) + @($selectionFromJson) |
        ForEach-Object { ([string]$_).Trim() } |
        Where-Object { $_ } |
        Sort-Object -Unique
)
if ($requestedRelativePaths.Count -gt 0) {
    if ($groupEmails.Count -ne 1) {
        throw 'A seleção de arquivos só pode ser usada com um único grupo por execução.'
    }
    foreach ($relativePath in $requestedRelativePaths) {
        if ([System.IO.Path]::IsPathRooted($relativePath) -or $relativePath -match '(^|[\\/])\.\.([\\/]|$)') {
            throw "Caminho selecionado inseguro: $relativePath"
        }
    }
    $knownRelativePaths = @($objects.RelativePath | Sort-Object -Unique)
    $unknownRelativePaths = @($requestedRelativePaths | Where-Object { $_ -notin $knownRelativePaths })
    if ($unknownRelativePaths.Count -gt 0) {
        throw "A seleção contém arquivo(s) que não pertencem à consulta atual: $($unknownRelativePaths -join ', ')"
    }
    $selectedObjects = @($objects | Where-Object RelativePath -In $requestedRelativePaths)
}
else {
    $selectedObjects = @($objects)
}

foreach ($item in $selectedObjects) {
    $localPath = Join-Path (Join-Path $DestinationRoot $item.GroupEmail) $item.RelativePath
    $item.LocalPath = $localPath
    $item.LocalState = Get-LocalObjectState `
        -Path $localPath `
        -RemoteBytes ([long]$item.RemoteBytes) `
        -RemoteMd5 ([string]$item.Md5Base64)
}

[long]$totalRemoteBytes = Get-PropertySum -Items @($objects) -Property RemoteBytes
[long]$missingBytes = Get-PropertySum -Items @($objects | Where-Object LocalState -EQ 'Missing') -Property RemoteBytes
$mismatches = @($objects | Where-Object LocalState -In @('SizeMismatch', 'Md5Mismatch'))
$selectedMismatches = @($selectedObjects | Where-Object LocalState -In @('SizeMismatch', 'Md5Mismatch'))
[long]$selectedBytes = Get-PropertySum -Items $selectedObjects -Property RemoteBytes
[long]$selectedMissingBytes = Get-PropertySum -Items @($selectedObjects | Where-Object LocalState -EQ 'Missing') -Property RemoteBytes
$missingGroups = @($groupSummaries | Where-Object Status -EQ 'MissingFromExport')
$rootPath = [System.IO.Path]::GetPathRoot($DestinationRoot)
$drive = [System.IO.DriveInfo]::new($rootPath)
[long]$availableBytes = $drive.AvailableFreeSpace
[long]$reserveBytes = [long]$ReserveFreeGiB * 1GB

$summary = [ordered]@{
    GeneratedAtUtc     = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    Phase              = $Phase
    ExportId           = $ExportId
    BucketRoot         = $BucketRoot
    ActiveAccount      = $activeAccount
    GroupsExpected     = $groupEmails.Count
    GroupsFound        = $groupEmails.Count - $missingGroups.Count
    GroupsMissing      = $missingGroups.Count
    RemoteObjects      = $objects.Count
    RemoteBytes        = $totalRemoteBytes
    MissingBytes       = $missingBytes
    SelectedObjects    = $selectedObjects.Count
    SelectedBytes      = $selectedBytes
    SelectedMissingBytes = $selectedMissingBytes
    LocalMismatches    = $mismatches.Count
    AvailableBytes     = $availableBytes
    ReserveBytes       = $reserveBytes
    DestinationRoot    = $DestinationRoot
    RemoteObjectsCsv   = $remoteObjectsCsv
    GroupSummaryCsv    = $groupSummaryCsv
    TransferManifest   = $transferManifest
}
$summary | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $reportDirectory 'download-summary.json') -Encoding utf8

foreach ($currentGroupEmail in $groupEmails) {
    $groupSummary = @($groupSummaries | Where-Object GroupEmail -EQ $currentGroupEmail | Select-Object -First 1)
    if ($groupSummary.Count -eq 1) {
        Save-GroupRemoteState `
            -Workspace $WorkspaceRoot `
            -Email $currentGroupEmail `
            -RemoteObjects @($objects | Where-Object GroupEmail -EQ $currentGroupEmail) `
            -GroupSummary $groupSummary[0] `
            -RunSummary ([pscustomobject]$summary) `
            -RunDirectory $reportDirectory
    }
}

Write-Host "Objetos remotos     : $($objects.Count)"
Write-Host "Objetos selecionados: $($selectedObjects.Count)"
Write-Host ('Volume remoto       : {0:N2} GiB' -f ($totalRemoteBytes / 1GB))
Write-Host ('Falta baixar        : {0:N2} GiB' -f ($missingBytes / 1GB))
Write-Host ('Espaço disponível    : {0:N2} GiB' -f ($availableBytes / 1GB))
Write-Host "Grupos sem pasta     : $($missingGroups.Count)"
Write-Host "Divergências locais  : $($mismatches.Count)"
Write-Host "Relatório             : $reportDirectory"

if ($Phase -eq 'Inventory') {
    return [pscustomobject]$summary
}
if (-not $Execute) {
    throw 'A fase Download transfere arquivos. Execute novamente com -Phase Download -Execute.'
}
if ($selectedMismatches.Count -gt 0) {
    throw "Existem $($selectedMismatches.Count) arquivo(s) selecionado(s) com tamanho ou MD5 divergente. Nada foi sobrescrito; revise remote-objects.csv."
}
if (($selectedMissingBytes + $reserveBytes) -gt $availableBytes) {
    throw ('Espaço insuficiente: faltam {0:N2} GiB e a reserva configurada é {1:N2} GiB.' -f `
        ($selectedMissingBytes / 1GB), ($reserveBytes / 1GB))
}

$pendingObjects = @($selectedObjects | Where-Object LocalState -EQ 'Missing')
$downloadIndex = 0
foreach ($object in $pendingObjects) {
    $downloadIndex++
    $localDirectory = Split-Path -Parent $object.LocalPath
    New-Item -ItemType Directory -Path $localDirectory -Force | Out-Null
    Write-Host "[$downloadIndex/$($pendingObjects.Count)] baixando e verificando: $($object.RemoteUri)"
    $downloadSuccess = $false
    try {
        & $gcloud.Source storage cp $object.RemoteUri $object.LocalPath 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $downloadSuccess = $true }
    } catch {
        $downloadSuccess = $false
    }
    if (-not $downloadSuccess -and $gsutil) {
        & $gsutil.Source -o 'GSUtil:parallel_process_count=1' cp -L $transferManifest $object.RemoteUri $object.LocalPath
        if ($LASTEXITCODE -eq 0) { $downloadSuccess = $true }
    }
    if (-not $downloadSuccess) {
        throw "Falha no download: $($object.RemoteUri). Verifique a autenticacao do Google."
    }
    $verifiedState = Get-LocalObjectState `
        -Path $object.LocalPath `
        -RemoteBytes ([long]$object.RemoteBytes) `
        -RemoteMd5 ([string]$object.Md5Base64)
    if ($verifiedState -notin @('Verified', 'SizeVerifiedNoMd5')) {
        throw "O arquivo baixado não passou na verificação: $($object.LocalPath)"
    }
    $object.LocalState = $verifiedState
}

$objects | Export-Csv -LiteralPath $remoteObjectsCsv -NoTypeInformation -Encoding utf8NoBOM
$selectedRemaining = @($selectedObjects | Where-Object LocalState -NotIn @('Verified', 'SizeVerifiedNoMd5'))
if ($selectedRemaining.Count -gt 0) {
    throw "A transferência terminou com $($selectedRemaining.Count) objeto(s) selecionado(s) não verificado(s)."
}

$summary.MissingBytes = Get-PropertySum -Items @($objects | Where-Object LocalState -EQ 'Missing') -Property RemoteBytes
$summary.SelectedMissingBytes = 0
$summary.Phase = 'Download'
$summary.GeneratedAtUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$summary | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $reportDirectory 'download-summary.json') -Encoding utf8NoBOM
foreach ($currentGroupEmail in $groupEmails) {
    $groupObjects = @($objects | Where-Object GroupEmail -EQ $currentGroupEmail)
    $groupSummary = [pscustomobject]@{
        GroupEmail    = $currentGroupEmail
        Status        = if (@($groupObjects | Where-Object LocalState -NotIn @('Verified', 'SizeVerifiedNoMd5')).Count -eq 0) {
            'DownloadedAndVerified'
        }
        else {
            'PartialDownloadVerified'
        }
        RemoteObjects = $groupObjects.Count
        RemoteBytes   = Get-PropertySum -Items $groupObjects -Property RemoteBytes
        MissingBytes  = Get-PropertySum -Items @($groupObjects | Where-Object LocalState -EQ 'Missing') -Property RemoteBytes
        Detail        = ''
    }
    Save-GroupRemoteState `
        -Workspace $WorkspaceRoot `
        -Email $currentGroupEmail `
        -RemoteObjects $groupObjects `
        -GroupSummary $groupSummary `
        -RunSummary ([pscustomobject]$summary) `
        -RunDirectory $reportDirectory
}

if ($RegisterAfterDownload) {
    foreach ($currentGroupEmail in $groupEmails) {
        $groupDirectory = Join-Path $DestinationRoot $currentGroupEmail
        & (Join-Path $PSScriptRoot 'Import-GoogleGroupsBackup.ps1') `
            -SourcePath $groupDirectory `
            -StorageMode Reference `
            -WorkspaceRoot $WorkspaceRoot `
            -ExportId $ExportId
    }
}

Write-Host 'Download, verificação e registo concluídos para todos os objetos encontrados.'
return [pscustomobject]$summary

