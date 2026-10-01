[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$GoogleAdmin
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw 'O Google Cloud CLI incluído no aplicativo não foi encontrado.'
}

Write-Host "Abrindo a autenticação Google para $GoogleAdmin..."
& gcloud auth login $GoogleAdmin --brief
if ($LASTEXITCODE -ne 0) {
    throw "O Google Cloud CLI terminou com código $LASTEXITCODE."
}

$activeAccount = [string](& gcloud config get-value account 2>$null | Select-Object -Last 1)
$activeAccount = $activeAccount.Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeAccount) -or $activeAccount -eq '(unset)') {
    throw 'O Google Cloud não confirmou uma conta ativa depois do login.'
}
if ($activeAccount -ine $GoogleAdmin) {
    throw "A conta autenticada foi $activeAccount, mas o aplicativo exige $GoogleAdmin."
}

Write-Host "Autenticação Google concluída: $activeAccount"
