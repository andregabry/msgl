[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [string]$Group,
    [string]$ConfigPath,
    [string]$WorkspaceRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/_migration-system'),
    [string]$PythonPath = 'python',
    [string]$MboxToPstPath = '',
    [string]$M365TargetDomain = 'dynamox.net',
    [string]$TargetMailbox,
    [string]$TargetRootFolder = '/Historico Google Groups',
    [ValidateRange(1000, 19500)][int]$MaximumPstSizeMB = 19000
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$defaultConfigPath = Join-Path (Join-Path $PSScriptRoot '..') 'config/google-groups-system.local.psd1'
if (-not $ConfigPath -and (Test-Path -LiteralPath $defaultConfigPath -PathType Leaf)) {
    $ConfigPath = $defaultConfigPath
}
if ($ConfigPath) {
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        throw "Configuração não encontrada: $ConfigPath"
    }
    $config = Import-PowerShellDataFile -LiteralPath $ConfigPath
    foreach ($binding in @{
        WorkspaceRoot = 'WorkspaceRoot'
        PythonPath = 'PythonPath'
        MboxToPstPath = 'MboxToPstPath'
        M365TargetDomain = 'M365TargetDomain'
    }.GetEnumerator()) {
        if (-not $PSBoundParameters.ContainsKey($binding.Key) -and
            $config.ContainsKey($binding.Value) -and $config[$binding.Value]) {
            Set-Variable -Name $binding.Key -Value ([string]$config[$binding.Value])
        }
    }
}

foreach ($requiredPath in @(
    $PythonPath,
    $MboxToPstPath,
    (Join-Path $PSScriptRoot 'materialize_google_groups_canonical_mbox.py'),
    (Join-Path $PSScriptRoot 'New-PstImportMapping.ps1')
)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Ferramenta obrigatória não encontrada: $requiredPath"
    }
}

$groupEmail = $Group.Trim().ToLowerInvariant()
if ($groupEmail -notmatch '@') { $groupEmail = "$groupEmail@enging.pt" }
if ($groupEmail -notmatch '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
    throw "Grupo inválido: $Group"
}
$localPart = $groupEmail.Split('@', 2)[0]
if ($M365TargetDomain -notmatch '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
    throw "Domínio de destino M365 inválido: $M365TargetDomain"
}
if (-not $TargetMailbox) { $TargetMailbox = "$localPart@$M365TargetDomain" }
$TargetMailbox = $TargetMailbox.Trim().ToLowerInvariant()
if ($TargetMailbox -notmatch '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
    throw "Caixa de destino M365 inválida: $TargetMailbox"
}

$workspace = [System.IO.Path]::GetFullPath($WorkspaceRoot)
$latestPath = Join-Path (Join-Path $workspace 'catalog') 'latest-preparation.json'
if (-not (Test-Path -LiteralPath $latestPath -PathType Leaf)) {
    throw 'Nenhuma preparação foi encontrada. Use primeiro a opção Preparar mensagens.'
}
$latest = Get-Content -LiteralPath $latestPath -Raw | ConvertFrom-Json
$mapping = @(Import-Csv -LiteralPath $latest.MappingCsv)
$selected = @($mapping | Where-Object GroupEmail -EQ $groupEmail)
if ($selected.Count -ne 1) {
    throw "$groupEmail não está no preparo mais recente. Prepare esse grupo novamente."
}
$row = $selected[0]
if ([string]$row.ReadyForStage -ne 'True') {
    throw "$groupEmail possui conflitos pendentes e não pode gerar um PST."
}
$sourceSummary = Get-Content -LiteralPath $row.Summary -Raw | ConvertFrom-Json
$canonicalMessages = [int]$sourceSummary.takeout.canonical_unique_messages
if ([int]$sourceSummary.takeout.message_id_content_hash_conflicts -gt 0) {
    throw 'O manifesto possui conflitos de Message-ID/conteúdo que exigem revisão.'
}

$manifestPath = [System.IO.Path]::GetFullPath([string]$row.Manifest)
$manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$safeGroup = $groupEmail -replace '[^a-z0-9._-]', '_'
$packageRoot = Join-Path (Join-Path (Join-Path $workspace 'pst') ([string]$latest.ExportId)) $safeGroup
$packageDirectory = Join-Path $packageRoot $manifestHash.Substring(0, 12)
$canonicalMbox = Join-Path $packageDirectory 'canonical.mbox'
$materializeSummary = Join-Path $packageDirectory 'canonical-mbox-summary.json'
$conversionConfig = Join-Path $packageDirectory 'mail2pst-config.json'
$conversionEvents = Join-Path $packageDirectory 'conversion-events.jsonl'
$pstDirectory = Join-Path $packageDirectory 'pst'
$pstPartialDirectory = Join-Path $packageDirectory 'pst.partial'
$mappingSourceCsv = Join-Path $packageDirectory 'pst-import-source.csv'
$mappingCsv = Join-Path $packageDirectory 'pst-import-mapping.csv'
$planPath = Join-Path $packageDirectory 'package-plan.json'
New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null

if (Test-Path -LiteralPath $planPath -PathType Leaf) {
    $cachedPlan = Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json
    $cacheValid = [string]$cachedPlan.ManifestSHA256 -eq $manifestHash -and
        [int]$cachedPlan.CanonicalMessages -eq $canonicalMessages -and
        [string]$cachedPlan.Group -eq $groupEmail -and
        [string]$cachedPlan.Readiness -eq 'READY_FOR_PURVIEW_UPLOAD' -and
        @($cachedPlan.PstFiles).Count -gt 0
    foreach ($pst in @($cachedPlan.PstFiles)) {
        if (-not (Test-Path -LiteralPath $pst.Path -PathType Leaf) -or
            (Get-FileHash -LiteralPath $pst.Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$pst.SHA256) {
            $cacheValid = $false
        }
    }
    if ($cacheValid) {
        $mappingChanged = [string]$cachedPlan.TargetSharedMailbox -ne $TargetMailbox -or
            [string]$cachedPlan.TargetRootFolder -ne $TargetRootFolder
        if ($mappingChanged) {
            @($cachedPlan.PstFiles | ForEach-Object {
                [pscustomobject]@{
                    PstFile = [string]$_.Path
                    TargetMailbox = $TargetMailbox
                    AzureFilePath = ''
                    TargetRootFolder = $TargetRootFolder
                }
            }) | Export-Csv -LiteralPath $mappingSourceCsv -NoTypeInformation -Encoding utf8NoBOM
            $null = & (Join-Path $PSScriptRoot 'New-PstImportMapping.ps1') `
                -SourceCsv $mappingSourceCsv -OutputCsv $mappingCsv
            $cachedPlan.TargetSharedMailbox = $TargetMailbox
            $cachedPlan.TargetRootFolder = $TargetRootFolder
            $cachedPlan.PurviewMappingCsv = $mappingCsv
            $cachedPlan | Add-Member -NotePropertyName MappingUpdatedAtUtc `
                -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
            $cachedPlan | ConvertTo-Json -Depth 8 |
                Set-Content -LiteralPath $planPath -Encoding utf8NoBOM
            Write-Host "Mapeamento M365 atualizado para $TargetMailbox sem reconverter o PST." -ForegroundColor Green
        }
        Write-Host "Pacote PST já verificado: $packageDirectory" -ForegroundColor Green
        $cachedPlan
        return
    }
    throw "Existe um pacote incompleto ou divergente que precisa ser revisado: $packageDirectory"
}

if (-not (Test-Path -LiteralPath $canonicalMbox -PathType Leaf)) {
    & $PythonPath `
        (Join-Path $PSScriptRoot 'materialize_google_groups_canonical_mbox.py') `
        --manifest $manifestPath `
        --output $canonicalMbox `
        --summary $materializeSummary
    if ($LASTEXITCODE -ne 0) {
        throw "A materialização do MBOX terminou com código $LASTEXITCODE."
    }
}
$materialized = Get-Content -LiteralPath $materializeSummary -Raw | ConvertFrom-Json
if ([int]$materialized.canonical_messages -ne $canonicalMessages -or
    [string]$materialized.manifest_sha256 -ne $manifestHash) {
    throw 'O MBOX canônico não corresponde ao manifesto preparado.'
}

$scanText = (& $MboxToPstPath scan --input $canonicalMbox | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "A inspeção MBOX→PST terminou com código $LASTEXITCODE." }
$scan = $scanText | ConvertFrom-Json
if ([int]$scan.totals.messages -ne $canonicalMessages -or
    @($scan.skipped).Count -gt 0 -or @($scan.warnings).Count -gt 0) {
    throw "A inspeção do conversor divergiu: $($scan.totals.messages) de $canonicalMessages mensagens."
}

$pstBaseName = "google-group-$localPart-$($latest.ExportId)"
$converterConfiguration = [ordered]@{
    outputs = @([ordered]@{
        name = $pstBaseName
        maxSizeMB = $MaximumPstSizeMB
        folderMapping = 'flatten'
        includeEmptyFolders = $false
        sources = @([ordered]@{
            path = $canonicalMbox
            type = 'mbox'
            targetFolder = 'Mensagens'
        })
    })
}
$converterConfiguration | ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath $conversionConfig -Encoding utf8NoBOM

if (Test-Path -LiteralPath $pstDirectory) {
    throw "A pasta PST existe sem um plano válido: $pstDirectory"
}
if (Test-Path -LiteralPath $pstPartialDirectory) {
    throw "Existe uma conversão parcial que precisa ser revisada: $pstPartialDirectory"
}
New-Item -ItemType Directory -Path $pstPartialDirectory | Out-Null
$eventLines = @(& $MboxToPstPath convert --config $conversionConfig --output $pstPartialDirectory)
$eventLines | Set-Content -LiteralPath $conversionEvents -Encoding utf8NoBOM
if ($LASTEXITCODE -ne 0) { throw "A conversão MBOX→PST terminou com código $LASTEXITCODE." }
$events = @($eventLines | ForEach-Object {
    try { $_ | ConvertFrom-Json } catch { $null }
} | Where-Object { $null -ne $_ })
$done = @($events | Where-Object type -EQ 'done') | Select-Object -Last 1
if (-not $done) { throw 'O conversor não emitiu o evento final de conclusão.' }
Move-Item -LiteralPath $pstPartialDirectory -Destination $pstDirectory

$pstFiles = @(Get-ChildItem -LiteralPath $pstDirectory -File -Filter '*.pst' | Sort-Object Name)
if ($pstFiles.Count -eq 0) { throw 'O conversor não produziu arquivos PST.' }
$ready = [int]$done.converted -eq $canonicalMessages -and
    [int]$done.skipped -eq 0 -and [int]$done.warnings -eq 0

@($pstFiles | ForEach-Object {
    [pscustomobject]@{
        PstFile = $_.FullName
        TargetMailbox = $TargetMailbox
        AzureFilePath = ''
        TargetRootFolder = $TargetRootFolder
    }
}) | Export-Csv -LiteralPath $mappingSourceCsv -NoTypeInformation -Encoding utf8NoBOM
$null = & (Join-Path $PSScriptRoot 'New-PstImportMapping.ps1') `
    -SourceCsv $mappingSourceCsv -OutputCsv $mappingCsv

$pstRecords = @($pstFiles | ForEach-Object {
    [ordered]@{
        Name = $_.Name
        Path = $_.FullName
        Bytes = [long]$_.Length
        SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
})
$plan = [ordered]@{
    GeneratedAtUtc = [DateTime]::UtcNow.ToString('o')
    Readiness = if ($ready) { 'READY_FOR_PURVIEW_UPLOAD' } else { 'REVIEW_CONVERSION_WARNINGS' }
    Group = $groupEmail
    TargetSharedMailbox = $TargetMailbox
    TargetRootFolder = $TargetRootFolder
    ExportId = [string]$latest.ExportId
    CanonicalMessages = $canonicalMessages
    ConvertedMessages = [int]$done.converted
    SkippedMessages = [int]$done.skipped
    ConversionWarnings = [int]$done.warnings
    Manifest = $manifestPath
    ManifestSHA256 = $manifestHash
    CanonicalMbox = $canonicalMbox
    CanonicalMboxSHA256 = [string]$materialized.output_sha256
    Converter = $MboxToPstPath
    PstFiles = $pstRecords
    PurviewMappingCsv = $mappingCsv
    PackageDirectory = $packageDirectory
}
$plan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $planPath -Encoding utf8NoBOM

Write-Host ''
Write-Host "Estado               : $($plan.Readiness)"
Write-Host "Grupo                : $groupEmail"
Write-Host "Destino M365         : $TargetMailbox"
Write-Host "Mensagens canônicas : $canonicalMessages"
Write-Host "Convertidas para PST : $($plan.ConvertedMessages)"
Write-Host "Ignoradas            : $($plan.SkippedMessages)"
Write-Host "Avisos               : $($plan.ConversionWarnings)"
Write-Host "Pasta do pacote      : $packageDirectory"
Write-Host "Mapeamento Purview   : $mappingCsv"

[pscustomobject]$plan
