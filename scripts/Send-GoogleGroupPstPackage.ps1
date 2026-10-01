[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][string]$PackagePlan,
    [Parameter(Mandatory)][SecureString]$SasUrl,
    [string]$AzCopyPath = 'azcopy',
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $Execute) { throw 'O envio altera o armazenamento do Purview. Execute novamente com -Execute.' }
if (-not (Test-Path -LiteralPath $PackagePlan -PathType Leaf)) {
    throw "Plano do pacote não encontrado: $PackagePlan"
}
$plan = Get-Content -LiteralPath $PackagePlan -Raw | ConvertFrom-Json
if ([string]$plan.Readiness -ne 'READY_FOR_PURVIEW_UPLOAD') {
    throw "O pacote não está pronto para upload: $($plan.Readiness)"
}

$azCopy = Get-Command $AzCopyPath -ErrorAction SilentlyContinue
if (-not $azCopy) { throw "AzCopy não encontrado: $AzCopyPath" }
$pstFiles = @($plan.PstFiles)
if ($pstFiles.Count -eq 0) { throw 'O plano não contém arquivos PST.' }
foreach ($pst in $pstFiles) {
    if (-not (Test-Path -LiteralPath $pst.Path -PathType Leaf)) {
        throw "PST não encontrado: $($pst.Path)"
    }
    $actualHash = (Get-FileHash -LiteralPath $pst.Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne [string]$pst.SHA256) {
        throw "SHA-256 divergente para $($pst.Path)"
    }
}

$packageDirectory = [string]$plan.PackageDirectory
$receiptPath = Join-Path $packageDirectory 'purview-upload-receipt.json'
if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
    throw "Este pacote já possui um comprovativo de upload. Não envie novamente: $receiptPath"
}
$pstDirectory = Split-Path -Parent ([string]$pstFiles[0].Path)
$logDirectory = Join-Path $packageDirectory 'azcopy-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SasUrl)
try {
    $plainSasUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($plainSasUrl -notmatch '^https://[^?]+\?.*sig=') {
        throw 'A SAS URL não possui o formato esperado do Microsoft Purview.'
    }
    if ($PSCmdlet.ShouldProcess($plan.TargetSharedMailbox, "Enviar $($pstFiles.Count) PST(s) para o armazenamento temporário do Purview")) {
        $previousLogLocation = $env:AZCOPY_LOG_LOCATION
        $env:AZCOPY_LOG_LOCATION = $logDirectory
        try {
            & $azCopy.Source copy $pstDirectory $plainSasUrl '--recursive=false' '--include-pattern=*.pst'
            if ($LASTEXITCODE -ne 0) { throw "AzCopy terminou com código $LASTEXITCODE." }
        }
        finally {
            if ($null -eq $previousLogLocation) {
                Remove-Item Env:AZCOPY_LOG_LOCATION -ErrorAction SilentlyContinue
            }
            else {
                $env:AZCOPY_LOG_LOCATION = $previousLogLocation
            }
        }
    }
}
finally {
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $plainSasUrl = $null
}

$receipt = [ordered]@{
    UploadedAtUtc = [DateTime]::UtcNow.ToString('o')
    Group = [string]$plan.Group
    TargetSharedMailbox = [string]$plan.TargetSharedMailbox
    PstFiles = $pstFiles
    PurviewMappingCsv = [string]$plan.PurviewMappingCsv
    SasUrlWasNotStored = $true
}
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
Write-Host "Upload concluído. Comprovativo: $receiptPath" -ForegroundColor Green
Write-Host "Use este mapeamento no Purview: $($plan.PurviewMappingCsv)"
[pscustomobject]$receipt
