[CmdletBinding()]
param(
    [string]$AdminUser = 'andre.gabry@dynamox.net',
    [string]$WorkspaceRoot,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module (Join-Path $PSScriptRoot 'ExchangeMigrationSupport.psm1') -Force

if (-not $WorkspaceRoot) {
    $WorkspaceRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/_migration-system'
}

if (-not $OutputPath) {
    $catalogDir = Join-Path $WorkspaceRoot 'catalog'
    if (-not (Test-Path -LiteralPath $catalogDir -PathType Container)) {
        New-Item -Path $catalogDir -ItemType Directory -Force | Out-Null
    }
    $OutputPath = Join-Path $catalogDir 'm365-mailboxes.json'
}

Write-Host "A conectar ao Exchange Online como $AdminUser..." -ForegroundColor Cyan
$connection = Connect-VerifiedExchangeOnline -ExchangeAdmin $AdminUser

Write-Host "A consultar caixas de correio no Exchange Online..." -ForegroundColor Cyan
$supportedTypes = @('UserMailbox', 'SharedMailbox', 'RoomMailbox', 'EquipmentMailbox')

$rawRecipients = @(
    Get-EXORecipient -ResultSize Unlimited `
        -RecipientTypeDetails $supportedTypes `
        -Properties DisplayName, PrimarySmtpAddress, RecipientTypeDetails, Alias |
        Sort-Object DisplayName
)

$mailboxes = [System.Collections.Generic.List[object]]::new()
foreach ($r in $rawRecipients) {
    $smtp = [string]$r.PrimarySmtpAddress
    if ([string]::IsNullOrWhiteSpace($smtp)) { continue }
    $upn = if ($r.PSObject.Properties['UserPrincipalName'] -and $r.UserPrincipalName) {
        ([string]$r.UserPrincipalName).Trim().ToLowerInvariant()
    } else {
        $smtp.Trim().ToLowerInvariant()
    }
    $mailboxes.Add([pscustomobject]@{
        DisplayName        = [string]$r.DisplayName
        PrimarySmtpAddress = $smtp.Trim().ToLowerInvariant()
        RecipientType      = [string]$r.RecipientTypeDetails
        UserPrincipalName  = $upn
        Alias              = [string]$r.Alias
    })
}

$outputDir = Split-Path -Parent $OutputPath
if ($outputDir -and -not (Test-Path -LiteralPath $outputDir -PathType Container)) {
    New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
}

$json = $mailboxes | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "Total de caixas de correio encontradas no M365: $($mailboxes.Count)" -ForegroundColor Green
Write-Host "Guardado em: $OutputPath" -ForegroundColor Green
Write-Host ""

$mailboxes | Select-Object -First 15 | Format-Table DisplayName, PrimarySmtpAddress, RecipientType -AutoSize | Out-Host
if ($mailboxes.Count -gt 15) {
    Write-Host "... e mais $($mailboxes.Count - 15) caixas." -ForegroundColor DarkGray
}
