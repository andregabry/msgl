[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [string[]]$SourcePath,

    [ValidateSet('Reference', 'Copy')]
    [string]$StorageMode = 'Reference',

    [string]$WorkspaceRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/_migration-system'),
    [string]$ExportId,
    [ValidateRange(5, 1024)][int]$ReserveFreeGiB = 15
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


function Resolve-ExportId {
    param([Parameter(Mandatory)][System.IO.DirectoryInfo]$GroupDirectory)

    $current = $GroupDirectory.Parent
    while ($current) {
        if ($current.Name -match '^\d{8}T\d{6}Z$') {
            return $current.Name
        }
        $current = $current.Parent
    }
    return [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
}

function Get-GroupDirectories {
    param([Parameter(Mandatory)][string[]]$Paths)

    $groupDirectories = [System.Collections.Generic.List[System.IO.DirectoryInfo]]::new()
    foreach ($path in $Paths) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Caminho de entrada não encontrado: $path"
        }
        $item = Get-Item -LiteralPath $path
        if ($item -is [System.IO.FileInfo]) {
            $candidate = $item.Directory
            if ($candidate.Name -match '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
                $groupDirectories.Add($candidate)
            }
            continue
        }
        if ($item.Name -match '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
            $groupDirectories.Add($item)
        }
        foreach ($directory in @(Get-ChildItem -LiteralPath $item.FullName -Directory -Recurse)) {
            if ($directory.Name -match '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
                $groupDirectories.Add($directory)
            }
        }
    }
    return @($groupDirectories | Sort-Object FullName -Unique)
}

function Test-ZipIntegrity {
    param([Parameter(Mandatory)][System.IO.FileInfo]$File)

    if ($File.Extension -ne '.zip') {
        return
    }
    $unzip = Get-Command unzip -ErrorAction SilentlyContinue
    if ($unzip) {
        & $unzip.Source -tq $File.FullName *> $null
    } else {
        $tar = Get-Command tar -ErrorAction SilentlyContinue
        if (-not $tar) {
            throw 'Os utilitários unzip ou tar não foram encontrados para validar o ZIP.'
        }
        & $tar.Source -tf $File.FullName *> $null
    }
    if ($LASTEXITCODE -ne 0) {
        throw "ZIP corrompido ou incompleto: $($File.FullName)"
    }
}

$workspace = [System.IO.Path]::GetFullPath($WorkspaceRoot)
$requestedExportId = $ExportId
if ($requestedExportId -and $requestedExportId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
    throw "ExportId inválido: $requestedExportId"
}
$catalogDirectory = Join-Path $workspace 'catalog'
$rawDirectory = Join-Path $workspace 'raw'
$catalogPath = Join-Path $catalogDirectory 'backups.csv'
$groupsPath = Join-Path $catalogDirectory 'groups.csv'
New-Item -ItemType Directory -Path $catalogDirectory -Force | Out-Null

$groupDirectories = @(Get-GroupDirectories -Paths $SourcePath)
if ($groupDirectories.Count -eq 0) {
    throw 'Nenhuma pasta com nome de grupo (grupo@dominio) foi encontrada nas entradas.'
}

$discovered = [System.Collections.Generic.List[object]]::new()
foreach ($groupDirectory in $groupDirectories) {
    $groupEmail = $groupDirectory.Name.ToLowerInvariant()
    $resolvedExportId = if ($ExportId) { $ExportId } else { Resolve-ExportId -GroupDirectory $groupDirectory }
    $archives = @(
        Get-ChildItem -LiteralPath $groupDirectory.FullName -File -Recurse |
            Where-Object Extension -In @('.zip', '.mbox') |
            Sort-Object FullName
    )
    foreach ($archive in $archives) {
        Test-ZipIntegrity -File $archive
        $sha256 = (Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $relativePath = [System.IO.Path]::GetRelativePath($groupDirectory.FullName, $archive.FullName)
        if ($relativePath -match '(^|[\\/])\.\.([\\/]|$)') {
            throw "Caminho de arquivo inseguro: $relativePath"
        }
        $managedPath = if ($StorageMode -eq 'Copy') {
            Join-Path (Join-Path (Join-Path $rawDirectory $resolvedExportId) $groupEmail) $relativePath
        }
        else {
            $archive.FullName
        }
        $discovered.Add([pscustomobject]@{
            ExportId        = $resolvedExportId
            GroupEmail      = $groupEmail
            FileName        = $archive.Name
            RelativePath    = $relativePath
            SourcePath      = $archive.FullName
            ManagedPath     = $managedPath
            Bytes           = [long]$archive.Length
            SHA256          = $sha256
            StorageMode     = $StorageMode
            RegisteredAtUtc = [DateTime]::UtcNow.ToString('o')
        })
    }
}

if ($discovered.Count -eq 0) {
    throw 'As pastas de grupo não contêm arquivos ZIP ou MBOX.'
}

if ($StorageMode -eq 'Copy') {
    [long]$copyBytes = 0
    foreach ($record in $discovered) {
        if (-not (Test-Path -LiteralPath $record.ManagedPath -PathType Leaf)) {
            $copyBytes += [long]$record.Bytes
        }
    }
    $rootPath = [System.IO.Path]::GetPathRoot($workspace)
    $drive = [System.IO.DriveInfo]::new($rootPath)
    [long]$reserveBytes = [long]$ReserveFreeGiB * 1GB
    if (($copyBytes + $reserveBytes) -gt $drive.AvailableFreeSpace) {
        throw ('Espaço insuficiente para copiar {0:N2} GiB mantendo a reserva de {1} GiB. Use -StorageMode Reference.' -f `
            ($copyBytes / 1GB), $ReserveFreeGiB)
    }

    foreach ($record in $discovered) {
        $destinationDirectory = Split-Path -Parent $record.ManagedPath
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
        if (Test-Path -LiteralPath $record.ManagedPath -PathType Leaf) {
            $existingHash = (Get-FileHash -LiteralPath $record.ManagedPath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($existingHash -ne $record.SHA256) {
                throw "O destino existe com conteúdo diferente; nada foi sobrescrito: $($record.ManagedPath)"
            }
            continue
        }
        $partialPath = "$($record.ManagedPath).partial"
        if (Test-Path -LiteralPath $partialPath) {
            throw "Existe uma cópia parcial que precisa ser revisada: $partialPath"
        }
        Copy-Item -LiteralPath $record.SourcePath -Destination $partialPath
        $copiedHash = (Get-FileHash -LiteralPath $partialPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($copiedHash -ne $record.SHA256) {
            throw "A cópia não passou na verificação SHA-256: $partialPath"
        }
        Move-Item -LiteralPath $partialPath -Destination $record.ManagedPath
    }
}

$existing = if (Test-Path -LiteralPath $catalogPath -PathType Leaf) {
    @(Import-Csv -LiteralPath $catalogPath)
}
else {
    @()
}

foreach ($newRecord in $discovered) {
    $pathConflict = $existing | Where-Object {
        $_.ExportId -eq $newRecord.ExportId -and
        $_.GroupEmail -eq $newRecord.GroupEmail -and
        $_.RelativePath -eq $newRecord.RelativePath -and
        $_.SHA256 -ne $newRecord.SHA256
    } | Select-Object -First 1
    if ($pathConflict) {
        throw "O mesmo arquivo já foi catalogado com outro SHA-256: $($newRecord.SourcePath)"
    }
}

$catalogByKey = [ordered]@{}
foreach ($record in $existing) {
    $key = "$($record.ExportId)|$($record.GroupEmail)|$($record.RelativePath)|$($record.SHA256)"
    $catalogByKey[$key] = $record
}
# Registos descobertos nesta maquina têm precedencia sobre caminhos antigos de outras maquinas (ex: Mac)
foreach ($record in $discovered) {
    $key = "$($record.ExportId)|$($record.GroupEmail)|$($record.RelativePath)|$($record.SHA256)"
    $catalogByKey[$key] = $record
}
$catalog = @($catalogByKey.Values | Sort-Object ExportId, GroupEmail, FileName, SHA256)
$catalog | Export-Csv -LiteralPath $catalogPath -NoTypeInformation -Encoding utf8NoBOM

$groupSummary = @(
    $catalog | Group-Object ExportId, GroupEmail | ForEach-Object {
        $first = $_.Group[0]
        [pscustomobject]@{
            ExportId    = $first.ExportId
            GroupEmail  = $first.GroupEmail
            ArchiveFiles = $_.Count
            ArchiveBytes = Get-PropertySum -Items $_.Group -Property Bytes
            StorageMode = (@($_.Group.StorageMode | Sort-Object -Unique) -join ';')
        }
    }
)
$groupSummary | Export-Csv -LiteralPath $groupsPath -NoTypeInformation -Encoding utf8NoBOM

$result = [ordered]@{
    WorkspaceRoot       = $workspace
    Catalog             = $catalogPath
    GroupsCatalog       = $groupsPath
    DiscoveredGroups    = @($discovered.GroupEmail | Sort-Object -Unique).Count
    DiscoveredFiles     = $discovered.Count
    RegisteredFiles     = $catalog.Count
    StorageMode         = $StorageMode
}
Write-Host "Grupos encontrados  : $($result.DiscoveredGroups)"
Write-Host "Arquivos encontrados: $($result.DiscoveredFiles)"
Write-Host "Modo de armazenamento: $StorageMode"
Write-Host "Catlogo             : $catalogPath"
[pscustomobject]$result

