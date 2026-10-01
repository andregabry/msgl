[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string[]]$GroupEmail,

    [string]$BucketRoot = 'gs://dwt-takeout-export--5522609548690436666/20260826T152249Z/',

    [string]$DestinationRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/20260826T152249Z'),

    [string]$CloudSdkConfig
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


if ($CloudSdkConfig) {
    $env:CLOUDSDK_CONFIG = $CloudSdkConfig
}

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloud) {
    throw 'Google Cloud CLI (gcloud) não foi encontrado no PATH.'
}

$gsutil = Get-Command gsutil -ErrorAction SilentlyContinue
if (-not $gsutil) {
    throw 'Google Cloud CLI (gsutil) não foi encontrado no PATH.'
}

$folderUris = @(& $gcloud.Source storage ls $BucketRoot)
if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível listar o bucket: $BucketRoot"
}

$folderByLowerName = @{}
foreach ($folderUri in $folderUris) {
    if (-not $folderUri.EndsWith('/')) {
        continue
    }

    $folderName = $folderUri.TrimEnd('/').Split('/')[-1]
    $folderByLowerName[$folderName.ToLowerInvariant()] = $folderName
}

$results = foreach ($email in $GroupEmail) {
    if ($email -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$') {
        throw "Endereço de grupo inválido: $email"
    }

    $lookupKey = $email.ToLowerInvariant()
    if (-not $folderByLowerName.ContainsKey($lookupKey)) {
        throw "A pasta do grupo não foi encontrada no bucket: $email"
    }

    $sourceFolderName = $folderByLowerName[$lookupKey]
    $sourceUri = "$($BucketRoot.TrimEnd('/'))/$sourceFolderName/"
    $destination = Join-Path $DestinationRoot $email.ToLowerInvariant()

    if ($PSCmdlet.ShouldProcess($destination, "Sincronizar $sourceUri")) {
        New-Item -ItemType Directory -Force -Path $destination | Out-Null

        # gsutil validates each downloaded object's checksum before accepting it.
        # -n preserves completed files when the command is resumed. One process
        # avoids the documented macOS multiprocessing instability; threads stay enabled.
        $sourceGlob = "$sourceUri*"
        & $gsutil.Source -o 'GSUtil:parallel_process_count=1' -m cp -n -r $sourceGlob $destination
        if ($LASTEXITCODE -ne 0) {
            throw "O download do grupo falhou: $email"
        }

        $files = @(Get-ChildItem -LiteralPath $destination -File -Recurse)
        [pscustomobject]@{
            GroupEmail      = $email.ToLowerInvariant()
            SourceUri       = $sourceUri
            Destination     = $destination
            DownloadedFiles = $files.Count
            DownloadedBytes = Get-PropertySum -Items $files -Property Length
        }
    }
}

$results


