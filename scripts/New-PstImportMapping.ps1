[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$SourceCsv,

    [Parameter(Mandatory)]
    [string]$OutputCsv
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path $SourceCsv -PathType Leaf)) {
    throw "CSV de origem não encontrado: $SourceCsv"
}

$rows = @(Import-Csv -Path $SourceCsv)
if ($rows.Count -eq 0) {
    throw 'O CSV de origem não contém registros.'
}
if ($rows.Count -gt 500) {
    throw 'O Microsoft 365 Import Service aceita no máximo 500 linhas por arquivo de mapeamento.'
}

$requiredColumns = @('PstFile', 'TargetMailbox')
$actualColumns = @($rows[0].PSObject.Properties.Name)
$missingColumns = @($requiredColumns | Where-Object { $_ -notin $actualColumns })
if ($missingColumns.Count -gt 0) {
    throw "Colunas obrigatórias ausentes: $($missingColumns -join ', ')"
}

$duplicateNames = @($rows |
    Group-Object { [System.IO.Path]::GetFileName(([string]$_.PstFile).Trim()).ToLowerInvariant() } |
    Where-Object Count -gt 1)
if ($duplicateNames.Count -gt 0) {
    throw "Cada PST precisa ter nome único. Duplicados: $($duplicateNames.Name -join ', ')"
}

$mapping = foreach ($row in $rows) {
    $pstName = [System.IO.Path]::GetFileName(([string]$row.PstFile).Trim())
    $mailbox = ([string]$row.TargetMailbox).Trim()

    if (-not $pstName.EndsWith('.pst', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "O arquivo não possui extensão .pst: $pstName"
    }
    if ([string]::IsNullOrWhiteSpace($mailbox)) {
        throw "TargetMailbox está vazio para o arquivo: $pstName"
    }

    $azureFilePath = ''
    if ('AzureFilePath' -in $actualColumns) {
        $azureFilePath = ([string]$row.AzureFilePath).Trim().Trim('/')
    }

    $targetRootFolder = '/Migrado-Google-Groups'
    if ('TargetRootFolder' -in $actualColumns -and
        -not [string]::IsNullOrWhiteSpace([string]$row.TargetRootFolder)) {
        $targetRootFolder = ([string]$row.TargetRootFolder).Trim()
    }

    [pscustomobject][ordered]@{
        Workload            = 'Exchange'
        FilePath            = $azureFilePath
        Name                = $pstName
        Mailbox             = $mailbox
        IsArchive           = 'FALSE'
        TargetRootFolder    = $targetRootFolder
        ContentCodePage     = ''
        SPFileContainer     = ''
        SPManifestContainer = ''
        SPSiteUrl           = ''
    }
}

$outputParent = Split-Path -Parent $OutputCsv
if ($outputParent) {
    New-Item -Path $outputParent -ItemType Directory -Force | Out-Null
}

$mapping | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding utf8
Get-Item $OutputCsv

