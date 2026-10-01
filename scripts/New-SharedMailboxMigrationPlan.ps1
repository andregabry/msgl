[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [string]$CsvPath,

    [string]$OutputPath,

    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module ExchangeOnlineManagement -ErrorAction Stop

function Split-DelegateList {
    param([AllowNull()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return @()
    }

    return @($Value -split ';' |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Sort-Object -Unique)
}

if (-not (Test-Path $CsvPath -PathType Leaf)) {
    throw "CSV não encontrado: $CsvPath"
}

if (@(Get-ConnectionInformation -ErrorAction SilentlyContinue).Count -eq 0) {
    throw 'Conecte-se primeiro com Connect-ExchangeOnline. O script não abre uma sessão implicitamente.'
}

$rows = @(Import-Csv -Path $CsvPath)
if ($rows.Count -eq 0) {
    throw 'O CSV não contém registros.'
}

$requiredColumns = @(
    'SourceGroup',
    'TargetPrimarySmtpAddress',
    'DisplayName',
    'Alias',
    'FullAccessMembers',
    'SendAsMembers'
)

$actualColumns = @($rows[0].PSObject.Properties.Name)
$missingColumns = @($requiredColumns | Where-Object { $_ -notin $actualColumns })
if ($missingColumns.Count -gt 0) {
    throw "Colunas obrigatórias ausentes: $($missingColumns -join ', ')"
}

$plan = foreach ($row in $rows) {
    $target = ([string]$row.TargetPrimarySmtpAddress).Trim()
    $displayName = ([string]$row.DisplayName).Trim()
    $alias = ([string]$row.Alias).Trim()
    $fullAccessMembers = @(Split-DelegateList $row.FullAccessMembers)
    $sendAsMembers = @(Split-DelegateList $row.SendAsMembers)

    if ([string]::IsNullOrWhiteSpace($target) -or
        [string]::IsNullOrWhiteSpace($displayName) -or
        [string]::IsNullOrWhiteSpace($alias)) {
        [pscustomobject]@{
            SourceGroup = $row.SourceGroup
            Target      = $target
            Action      = 'Invalid'
            Detail      = 'TargetPrimarySmtpAddress, DisplayName e Alias são obrigatórios.'
        }
        continue
    }

    $existingRecipient = Get-Recipient -Identity $target -ErrorAction SilentlyContinue
    if ($existingRecipient) {
        if ([string]$existingRecipient.RecipientTypeDetails -eq 'SharedMailbox') {
            $mailboxAction = 'ReuseSharedMailbox'
            $detail = 'A shared mailbox já existe; somente delegações ausentes serão planejadas.'
        }
        elseif ([string]$existingRecipient.RecipientTypeDetails -eq 'UserMailbox') {
            $mailboxAction = 'ReuseUserMailbox'
            $detail = 'A caixa de utilizador já existe no Exchange Online; será reutilizada como destino da migração.'
        }
        else {
            [pscustomobject]@{
                SourceGroup = $row.SourceGroup
                Target      = $target
                Action      = 'Collision'
                Detail      = "O endereço pertence a $($existingRecipient.RecipientTypeDetails). Nenhuma alteração será feita."
            }
            continue
        }
    }
    else {
        $mailboxAction = 'CreateSharedMailbox'
        $detail = 'O endereço está livre no Exchange Online.'
    }

    if ($Apply -and $mailboxAction -eq 'CreateSharedMailbox') {
        if ($PSCmdlet.ShouldProcess($target, 'Criar shared mailbox')) {
            $newMailboxParameters = @{
                Shared             = $true
                Name               = $displayName
                DisplayName        = $displayName
                Alias              = $alias
                PrimarySmtpAddress = $target
            }
            New-Mailbox @newMailboxParameters | Out-Null
        }
    }

    if ($Apply) {
        foreach ($delegate in $fullAccessMembers) {
            $existingPermission = Get-MailboxPermission `
                -Identity $target `
                -User $delegate `
                -ErrorAction SilentlyContinue |
                Where-Object { 'FullAccess' -in $_.AccessRights -and -not $_.Deny }

            if (-not $existingPermission -and $PSCmdlet.ShouldProcess("$target <- $delegate", 'Conceder FullAccess')) {
                Add-MailboxPermission `
                    -Identity $target `
                    -User $delegate `
                    -AccessRights FullAccess `
                    -InheritanceType All `
                    -AutoMapping:$true | Out-Null
            }
        }

        foreach ($delegate in $sendAsMembers) {
            $existingPermission = Get-RecipientPermission `
                -Identity $target `
                -Trustee $delegate `
                -ErrorAction SilentlyContinue |
                Where-Object { 'SendAs' -in $_.AccessRights -and -not $_.Deny }

            if (-not $existingPermission -and $PSCmdlet.ShouldProcess("$target <- $delegate", 'Conceder SendAs')) {
                Add-RecipientPermission `
                    -Identity $target `
                    -Trustee $delegate `
                    -AccessRights SendAs `
                    -Confirm:$false | Out-Null
            }
        }
    }

    [pscustomobject]@{
        SourceGroup = $row.SourceGroup
        Target      = $target
        Action      = $mailboxAction
        Detail      = $detail
    }
}

if ($OutputPath) {
    $outputParent = Split-Path -Parent $OutputPath
    if ($outputParent) {
        New-Item -Path $outputParent -ItemType Directory -Force | Out-Null
    }
    @($plan) | Export-Csv -Path $OutputPath -NoTypeInformation -Encoding utf8
}

$plan
