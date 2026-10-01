[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "EXCHANGE_WORKER_READY"

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line -or $line -eq 'EXIT') {
        break
    }
    if ([string]::IsNullOrWhiteSpace($line)) {
        continue
    }

    $global:LASTEXITCODE = 0
    $cmdExit = 0
    try {
        Invoke-Expression $line
        if ($null -ne $global:LASTEXITCODE -and $global:LASTEXITCODE -ne 0) {
            $cmdExit = $global:LASTEXITCODE
        }
    } catch {
        Write-Host "Erro na execução: $_" -ForegroundColor Red
        $cmdExit = 1
    }
    Write-Host "__CMD_FINISHED__:$cmdExit"
}
