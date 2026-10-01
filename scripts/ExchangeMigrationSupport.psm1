Set-StrictMode -Version Latest

function Connect-VerifiedExchangeOnline {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$ExchangeAdmin)

    if (-not (Get-Module -Name ExchangeOnlineManagement)) {
        $module = Get-Module -ListAvailable ExchangeOnlineManagement |
            Sort-Object Version -Descending |
            Select-Object -First 1
        if (-not $module) {
            throw 'O módulo ExchangeOnlineManagement não está instalado.'
        }
        Import-Module $module.Path
    }

    $openedConnection = $false
    $connections = @(Get-ConnectionInformation -ErrorAction SilentlyContinue |
        Where-Object State -EQ 'Connected')
    if ($connections.Count -eq 0) {
        Write-Host "Autentique-se com a conta administrativa esperada: $ExchangeAdmin" -ForegroundColor Cyan
        Connect-ExchangeOnline -UserPrincipalName $ExchangeAdmin -Device -ShowBanner:$false
        $openedConnection = $true
        $connections = @(Get-ConnectionInformation -ErrorAction Stop |
            Where-Object State -EQ 'Connected')
    }

    Write-Host ''
    Write-Host 'Conexões do Exchange Online:' -ForegroundColor Cyan
    Get-ConnectionInformation |
        Format-Table UserPrincipalName, ConnectionUri, State -AutoSize |
        Out-Host

    $expected = $ExchangeAdmin.Trim().ToLowerInvariant()
    $matching = @($connections | Where-Object {
        ([string]$_.UserPrincipalName).Trim().ToLowerInvariant() -eq $expected
    })
    if ($matching.Count -eq 0) {
        $actualUsers = @($connections | ForEach-Object {
            ([string]$_.UserPrincipalName).Trim().ToLowerInvariant()
        } | Where-Object { $_ } | Sort-Object -Unique)
        $actualText = if ($actualUsers.Count) { $actualUsers -join ', ' } else { '(não identificada)' }
        throw "A sessão do Exchange está autenticada como $actualText, mas este sistema exige $expected. Feche a sessão incorreta e autentique-se com a conta esperada."
    }

    return [pscustomobject]@{
        OpenedConnection  = $openedConnection
        UserPrincipalName = $expected
        ConnectionUri     = [string]$matching[0].ConnectionUri
        State             = [string]$matching[0].State
    }
}

function Resolve-GoogleTargetDeliveryDomain {
    [CmdletBinding()]
    param(
        [AllowEmptyString()][string]$RequestedDomain = '',
        [object[]]$MigrationBatches = @(),
        [object[]]$AcceptedDomains = @()
    )

    $acceptedNames = @($AcceptedDomains | ForEach-Object {
        ([string]$_.DomainName).Trim().ToLowerInvariant()
    } | Where-Object { $_ } | Sort-Object -Unique)

    if (-not [string]::IsNullOrWhiteSpace($RequestedDomain)) {
        $requested = $RequestedDomain.Trim().ToLowerInvariant()
        if ($requested -notmatch '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
            throw "TargetDeliveryDomain inválido: $RequestedDomain"
        }
        if ($acceptedNames.Count -gt 0 -and $requested -notin $acceptedNames) {
            throw "O TargetDeliveryDomain configurado ($requested) não aparece nos domínios aceitos do Exchange Online."
        }
        return $requested
    }

    $batchCandidates = @($MigrationBatches | Where-Object {
        ([string]$_.MigrationType -eq 'Gmail') -and
        -not [string]::IsNullOrWhiteSpace([string]$_.TargetDeliveryDomain)
    } | ForEach-Object {
        ([string]$_.TargetDeliveryDomain).Trim().ToLowerInvariant()
    } | Sort-Object -Unique)
    if ($batchCandidates.Count -eq 1) {
        return $batchCandidates[0]
    }
    if ($batchCandidates.Count -gt 1) {
        throw "Foram encontrados vários TargetDeliveryDomain em lotes Gmail anteriores: $($batchCandidates -join ', '). Configure explicitamente o domínio correto."
    }

    $routingCandidates = @($acceptedNames | Where-Object {
        $_ -match '\.mail\.onmicrosoft\.com$' -or
        $_ -match '^(m365|o365|google|gmail|migration|mailroute)\.'
    } | Sort-Object -Unique)
    if ($routingCandidates.Count -eq 1) {
        return $routingCandidates[0]
    }
    if ($routingCandidates.Count -gt 1) {
        throw "Mais de um domínio de roteamento pode ser usado: $($routingCandidates -join ', '). Defina TargetDeliveryDomain na configuração local."
    }

    $acceptedText = if ($acceptedNames.Count) { $acceptedNames -join ', ' } else { '(nenhum retornado)' }
    throw "Não foi possível identificar um subdomínio de roteamento para a migração Google Workspace. Domínios aceitos encontrados: $acceptedText. Crie o subdomínio exigido pelos pré-requisitos da Microsoft ou configure TargetDeliveryDomain explicitamente."
}

Export-ModuleMember -Function Connect-VerifiedExchangeOnline, Resolve-GoogleTargetDeliveryDomain
