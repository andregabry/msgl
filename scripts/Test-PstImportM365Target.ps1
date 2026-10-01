[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$TargetMailbox,
    [string]$ExchangeAdmin = 'andre.gabry@dynamox.net',
    [switch]$DisconnectWhenDone
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$module = Get-Module -ListAvailable ExchangeOnlineManagement |
    Sort-Object Version -Descending | Select-Object -First 1
if (-not $module) { throw 'O módulo ExchangeOnlineManagement não está instalado.' }
Import-Module $module.Path -Force
$openedConnection = $false
$connected = @(Get-ConnectionInformation -ErrorAction SilentlyContinue | Where-Object State -EQ 'Connected')
if ($connected.Count -eq 0) {
    if ($ExchangeAdmin) {
        Write-Host "Na janela de autenticação, escolha uma conta administrativa. Conta esperada: $ExchangeAdmin" -ForegroundColor Cyan
    }

    # Não fixe -UserPrincipalName aqui. Em logins interativos no macOS, o navegador
    # pode devolver uma conta Microsoft já ativa; o módulo então recusa a conexão
    # quando essa identidade difere do UPN fornecido no parâmetro.
    Connect-ExchangeOnline -DisableWAM -ShowBanner:$false
    $openedConnection = $true
    $connected = @(
        Get-ConnectionInformation -ErrorAction Stop |
            Where-Object State -EQ 'Connected'
    )
    if ($connected.Count -eq 0) {
        throw 'A autenticação terminou, mas nenhuma conexão ativa com o Exchange Online foi encontrada.'
    }
}
$activeConnection = $connected | Select-Object -First 1
$authenticatedAs = if ($activeConnection.PSObject.Properties.Name -contains 'UserPrincipalName') {
    [string]$activeConnection.UserPrincipalName
}
else {
    ''
}

try {
    $recipient = Get-EXORecipient -Identity $TargetMailbox `
        -Properties RecipientTypeDetails, PrimarySmtpAddress -ErrorAction SilentlyContinue
    $supportedTypes = @('SharedMailbox', 'UserMailbox', 'RoomMailbox', 'EquipmentMailbox')
    $isSupportedMailbox = $recipient -and ([string]$recipient.RecipientTypeDetails -in $supportedTypes)
    $statistics = if ($isSupportedMailbox) {
        Get-EXOMailboxStatistics -Identity $TargetMailbox -ErrorAction SilentlyContinue
    } else { $null }
    $result = [pscustomobject]@{
        AuthenticatedAs = $authenticatedAs
        TargetMailbox = $TargetMailbox.ToLowerInvariant()
        PrimarySmtpAddress = if ($recipient) { [string]$recipient.PrimarySmtpAddress } else { '' }
        RecipientType = if ($recipient) { [string]$recipient.RecipientTypeDetails } else { '' }
        CurrentItems = if ($statistics) { [long]$statistics.ItemCount } else { 0 }
        CurrentSize = if ($statistics) { [string]$statistics.TotalItemSize } else { '' }
        Status = if (-not $recipient) {
            'TargetMailboxMissing'
        } elseif (-not $isSupportedMailbox) {
            'TargetIsNotSupportedMailbox'
        } else {
            'ReadyForPstImport'
        }
    }
    $result
}
finally {
    if ($DisconnectWhenDone -and $openedConnection) {
        Disconnect-ExchangeOnline -Confirm:$false
    }
}
