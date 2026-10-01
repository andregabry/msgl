[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][ValidateSet('Check', 'Create')][string]$Action,
    [Parameter(Mandatory)][string]$Group,
    [string]$Domain = 'enging.pt',
    [string]$StagingUser,
    [string]$GoogleAdmin = 'andre.gabry@enging.pt',
    [string]$ServiceAccountFile = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/service-account.json'),
    [string]$PythonPath = 'python',
    [string]$OrgUnitPath,
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Resolve-Email {
    param([Parameter(Mandatory)][string]$Value, [Parameter(Mandatory)][string]$DefaultDomain)

    $normalized = $Value.Trim().ToLowerInvariant()
    if ($normalized -notmatch '@') { $normalized = "$normalized@$DefaultDomain" }
    if ($normalized -notmatch '^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$') {
        throw "Endereço inválido: $Value"
    }
    return $normalized
}

$groupEmail = Resolve-Email -Value $Group -DefaultDomain $Domain
$localPart, $groupDomain = $groupEmail.Split('@', 2)
if (-not $StagingUser) { $StagingUser = "migracao.$localPart@$groupDomain" }
$stagingEmail = Resolve-Email -Value $StagingUser -DefaultDomain $groupDomain

$pythonScript = Join-Path $PSScriptRoot 'manage_google_staging_user.py'
foreach ($requiredPath in @($PythonPath, $pythonScript, $ServiceAccountFile)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Arquivo obrigatório não encontrado: $requiredPath"
    }
}

$arguments = @(
    '-u', $pythonScript,
    '--action', $Action.ToLowerInvariant(),
    '--service-account-file', (Resolve-Path -LiteralPath $ServiceAccountFile).Path,
    '--admin-user', $GoogleAdmin,
    '--user', $stagingEmail,
    '--group', $groupEmail
)
if (-not [string]::IsNullOrWhiteSpace($OrgUnitPath)) {
    $arguments += @('--org-unit-path', $OrgUnitPath)
}
if ($Action -eq 'Create' -and $Execute) {
    if ($PSCmdlet.ShouldProcess($stagingEmail, 'Criar utilizador temporário no Google Workspace')) {
        $arguments += '--execute'
    }
    else {
        return
    }
}

$output = (& $PythonPath @arguments 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao consultar/criar a conta temporária no Google. $output"
}
try {
    $result = $output | ConvertFrom-Json
    foreach ($propertyName in @(
        'status', 'primary_email', 'id', 'org_unit_path',
        'suspended', 'archived', 'is_admin', 'is_mailbox_setup'
    )) {
        $property = $result.PSObject.Properties[$propertyName]
        if ($null -ne $property) {
            Write-Host ("{0,-20}: {1}" -f $propertyName, $property.Value)
        }
    }
    return $result
}
catch {
    throw "A ferramenta Google retornou uma resposta inesperada: $output"
}
