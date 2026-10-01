[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$AdminUser
)

$ErrorActionPreference = 'Stop'

try {
    Import-Module ExchangeOnlineManagement -ErrorAction Stop
} catch {
    throw 'O módulo ExchangeOnlineManagement incluído no aplicativo não pôde ser carregado.'
}

try {
    Write-Host "Iniciando autenticação Microsoft 365 para $AdminUser..."
    Connect-ExchangeOnline -UserPrincipalName $AdminUser -Device -ShowBanner:$false -ErrorAction Stop

    $connections = @(
        Get-ConnectionInformation -ErrorAction Stop |
            Where-Object { $_.UserPrincipalName -ieq $AdminUser }
    )
    if ($connections.Count -eq 0) {
        throw "A sessão aberta não pertence à conta administrativa esperada: $AdminUser."
    }

    $connections |
        Select-Object UserPrincipalName, ConnectionUri, State |
        Format-Table -AutoSize |
        Out-String |
        Write-Host

    Write-Host "Autenticação Microsoft 365 concluída com sucesso para: $AdminUser"
} catch {
    throw $_
}
