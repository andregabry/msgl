[CmdletBinding()]
param(
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$migrationScript = Join-Path $PSScriptRoot 'Invoke-GoogleGroupsMigrationSystem.ps1'
$manageStagingUserScript = Join-Path $PSScriptRoot 'Manage-GoogleStagingUser.ps1'
$newPstPackageScript = Join-Path $PSScriptRoot 'New-GoogleGroupPstPackage.ps1'
$testPstTargetScript = Join-Path $PSScriptRoot 'Test-PstImportM365Target.ps1'
$sendPstPackageScript = Join-Path $PSScriptRoot 'Send-GoogleGroupPstPackage.ps1'
$defaultConfigPath = Join-Path $projectRoot 'config/google-groups-system.local.psd1'

foreach ($requiredScript in @(
    $migrationScript,
    $manageStagingUserScript,
    $newPstPackageScript,
    $testPstTargetScript,
    $sendPstPackageScript
)) {
    if (-not (Test-Path -LiteralPath $requiredScript -PathType Leaf)) {
        throw "Script obrigatório não encontrado: $requiredScript"
    }
}

if (-not $ConfigPath -and (Test-Path -LiteralPath $defaultConfigPath -PathType Leaf)) {
    $ConfigPath = $defaultConfigPath
}
if ($ConfigPath) {
    $ConfigPath = [System.IO.Path]::GetFullPath($ConfigPath)
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        throw "Configuração não encontrada: $ConfigPath"
    }
    $config = Import-PowerShellDataFile -LiteralPath $ConfigPath
}
else {
    $config = @{}
}

$workspaceRoot = if ($config.ContainsKey('WorkspaceRoot') -and $config.WorkspaceRoot) {
    [System.IO.Path]::GetFullPath([string]$config.WorkspaceRoot)
}
else {
    Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/Google Groups/_migration-system'
}
$m365TargetDomain = if ($config.ContainsKey('M365TargetDomain') -and $config.M365TargetDomain) {
    ([string]$config.M365TargetDomain).Trim().ToLowerInvariant()
}
else {
    'dynamox.net'
}
$exchangeAdmin = if ($config.ContainsKey('ExchangeAdmin') -and $config.ExchangeAdmin) {
    ([string]$config.ExchangeAdmin).Trim().ToLowerInvariant()
}
else {
    'andre.gabry@dynamox.net'
}
$googleDomain = if ($config.ContainsKey('GoogleDomain') -and $config.GoogleDomain) {
    ([string]$config.GoogleDomain).Trim().ToLowerInvariant()
}
else {
    'enging.pt'
}
$googleAdmin = if ($config.ContainsKey('GoogleAdmin') -and $config.GoogleAdmin) {
    ([string]$config.GoogleAdmin).Trim().ToLowerInvariant()
}
else {
    'andre.gabry@enging.pt'
}
$serviceAccountFile = if ($config.ContainsKey('ServiceAccountFile') -and $config.ServiceAccountFile) {
    [System.IO.Path]::GetFullPath([string]$config.ServiceAccountFile)
}
else {
    Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'M365/service-account.json'
}
$pythonPath = if ($config.ContainsKey('PythonPath') -and $config.PythonPath) {
    [System.IO.Path]::GetFullPath([string]$config.PythonPath)
}
else {
    $pythonCommand = Get-Command python -ErrorAction Stop
    $pythonCommand.Source
}
$googleStagingOrgUnit = if ($config.ContainsKey('GoogleStagingOrgUnit')) {
    ([string]$config.GoogleStagingOrgUnit).Trim()
}
else {
    ''
}

function Show-FileInManager {
    param([Parameter(Mandatory)][string]$Path)

    if ($IsWindows) {
        Start-Process explorer.exe -ArgumentList "/select,`"$Path`""
    }
    elseif ($IsMacOS) {
        Start-Process -FilePath 'open' -ArgumentList '-R', $Path
    }
    else {
        Start-Process (Split-Path -Parent $Path)
    }
}

function Get-M365TargetMailbox {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $localPart = $GroupEmail.Trim().ToLowerInvariant().Split('@', 2)[0]
    return "$localPart@$m365TargetDomain"
}

function Get-GoogleStagingUser {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $localPart = $GroupEmail.Trim().ToLowerInvariant().Split('@', 2)[0]
    return "migracao.$localPart@$googleDomain"
}

function Invoke-MigrationSystem {
    param([Parameter(Mandatory)][hashtable]$Parameters)

    $arguments = @{} + $Parameters
    if ($ConfigPath) {
        $arguments.ConfigPath = $ConfigPath
    }
    & $migrationScript @arguments
}

function Get-SelectableGroups {
    $catalogPath = Join-Path (Join-Path $workspaceRoot 'catalog') 'groups.csv'
    if (-not (Test-Path -LiteralPath $catalogPath -PathType Leaf)) {
        throw "O catálogo de grupos ainda não existe: $catalogPath"
    }

    $catalog = @(Import-Csv -LiteralPath $catalogPath)
    if ($catalog.Count -eq 0) {
        throw 'O catálogo de grupos está vazio.'
    }
    $latestExportId = @($catalog.ExportId | Sort-Object -Descending | Select-Object -First 1)[0]
    return @(
        $catalog |
            Where-Object ExportId -EQ $latestExportId |
            Sort-Object GroupEmail |
            ForEach-Object {
                [pscustomobject]@{
                    GroupEmail = ([string]$_.GroupEmail).ToLowerInvariant()
                    ExportId = [string]$_.ExportId
                    ArchiveFiles = [int]$_.ArchiveFiles
                    ArchiveBytes = [long]$_.ArchiveBytes
                }
            }
    )
}

function Select-GroupEmail {
    param([Parameter(Mandatory)][string]$Action)

    $groups = @(Get-SelectableGroups)
    if ($groups.Count -eq 0) {
        throw 'Nenhum grupo do export mais recente está disponível.'
    }

    Write-Host ''
    Write-Host "$Action - selecione o grupo" -ForegroundColor Cyan
    for ($index = 0; $index -lt $groups.Count; $index++) {
        $group = $groups[$index]
        $sizeMiB = [math]::Round(([double]$group.ArchiveBytes / 1MB), 2)
        Write-Host (" {0}. {1}  ({2} arquivo(s), {3:N2} MiB)" -f `
            ($index + 1), $group.GroupEmail, $group.ArchiveFiles, $sizeMiB)
    }
    Write-Host ' 0. Cancelar e voltar ao menu'

    while ($true) {
        $selectionInput = Read-Host 'Escolha o número do grupo'
        if ($null -eq $selectionInput) {
            return $null
        }
        [int]$selection = 0
        if (-not [int]::TryParse(([string]$selectionInput).Trim(), [ref]$selection)) {
            Write-Warning 'Digite somente o número mostrado ao lado do grupo.'
            continue
        }
        if ($selection -eq 0) {
            return $null
        }
        if ($selection -ge 1 -and $selection -le $groups.Count) {
            return [string]$groups[$selection - 1].GroupEmail
        }
        Write-Warning 'Opção inexistente. Escolha um dos números apresentados.'
    }
}

function Confirm-MenuAction {
    param([Parameter(Mandatory)][string]$Prompt)

    Write-Host ''
    Write-Host $Prompt -ForegroundColor Yellow
    Write-Host ' 1. Confirmar e continuar'
    Write-Host ' 0. Cancelar'
    while ($true) {
        $confirmation = Read-Host 'Escolha 1 ou 0'
        if ($null -eq $confirmation -or ([string]$confirmation).Trim() -eq '0') {
            return $false
        }
        if (([string]$confirmation).Trim() -eq '1') {
            return $true
        }
        Write-Warning 'Opção inválida. Escolha 1 para confirmar ou 0 para cancelar.'
    }
}

function Get-LatestPreparation {
    $latestPath = Join-Path (Join-Path $workspaceRoot 'catalog') 'latest-preparation.json'
    if (-not (Test-Path -LiteralPath $latestPath -PathType Leaf)) {
        return $null
    }
    return Get-Content -LiteralPath $latestPath -Raw | ConvertFrom-Json
}

function Get-LatestPreparationRow {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $latest = Get-LatestPreparation
    if (-not $latest -or -not (Test-Path -LiteralPath $latest.MappingCsv -PathType Leaf)) {
        return $null
    }
    $selected = @(
        Import-Csv -LiteralPath $latest.MappingCsv |
            Where-Object { ([string]$_.GroupEmail).ToLowerInvariant() -eq $GroupEmail }
    )
    if ($selected.Count -eq 1) {
        return $selected[0]
    }
    return $null
}

function Show-GroupCatalog {
    $catalogPath = Join-Path (Join-Path $workspaceRoot 'catalog') 'groups.csv'
    if (-not (Test-Path -LiteralPath $catalogPath -PathType Leaf)) {
        Write-Warning "O catálogo ainda não existe: $catalogPath"
        Write-Host 'Registre primeiro a pasta que contém os backups.'
        return
    }

    $rows = @(
        Import-Csv -LiteralPath $catalogPath |
            Sort-Object ExportId, GroupEmail |
            ForEach-Object {
                [pscustomobject]@{
                    Exportação = $_.ExportId
                    Grupo = $_.GroupEmail
                    Arquivos = [int]$_.ArchiveFiles
                    TamanhoMiB = [math]::Round(([double]$_.ArchiveBytes / 1MB), 2)
                }
            }
    )
    if ($rows.Count -eq 0) {
        Write-Warning 'O catálogo de backups está vazio.'
        return
    }
    $rows | Format-Table -AutoSize | Out-Host
}

function Invoke-PrepareGroup {
    param([Parameter(Mandatory)][string]$GroupEmail)

    Write-Host ''
    Write-Host "Preparando $GroupEmail..." -ForegroundColor Cyan
    Write-Host 'Os backups serão verificados por tamanho e SHA-256; as mensagens serão deduplicadas localmente.'
    $null = Invoke-MigrationSystem -Parameters @{
        Phase = 'Prepare'
        Group = @($GroupEmail)
    }

    $row = Get-LatestPreparationRow -GroupEmail $GroupEmail
    if (-not $row) {
        throw "A preparação terminou sem produzir um mapeamento para $GroupEmail."
    }
    $summary = Get-Content -LiteralPath $row.Summary -Raw | ConvertFrom-Json
    $status = if ([string]$row.ReadyForStage -eq 'True') { 'PRONTO' } else { 'EXIGE REVISÃO' }

    Write-Host ''
    Write-Host 'Resultado da preparação' -ForegroundColor Green
    [pscustomobject]@{
        Grupo = $GroupEmail
        Mensagens = [int]$summary.takeout.canonical_unique_messages
        DuplicidadesRemovidas = [int]$summary.takeout.duplicate_occurrences
        ConflitosDeConteudo = [int]$summary.takeout.message_id_content_hash_conflicts
        DefeitosDeLeitura = [int]$summary.takeout.messages_with_parse_defects
        DestinoM365 = Get-M365TargetMailbox -GroupEmail $GroupEmail
        Estado = $status
    } | Format-List | Out-Host

    return $row
}

function Get-OrPrepareGroup {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $row = Get-LatestPreparationRow -GroupEmail $GroupEmail
    if ($row) {
        return $row
    }

    Write-Host "O preparo mais recente não contém $GroupEmail." -ForegroundColor Yellow
    if (-not (Confirm-MenuAction -Prompt 'Deseja preparar esse grupo agora?')) {
        throw 'Operação cancelada. Use a opção Preparar antes de inserir.'
    }
    return Invoke-PrepareGroup -GroupEmail $GroupEmail
}

function Invoke-StagingUserTool {
    param(
        [Parameter(Mandatory)][ValidateSet('Check', 'Create')][string]$Action,
        [Parameter(Mandatory)][string]$GroupEmail,
        [switch]$Execute
    )

    $parameters = @{
        Action = $Action
        Group = $GroupEmail
        StagingUser = Get-GoogleStagingUser -GroupEmail $GroupEmail
        GoogleAdmin = $googleAdmin
        ServiceAccountFile = $serviceAccountFile
        PythonPath = $pythonPath
        Confirm = $false
    }
    if ($googleStagingOrgUnit) { $parameters.OrgUnitPath = $googleStagingOrgUnit }
    if ($Execute) { $parameters.Execute = $true }
    return & $manageStagingUserScript @parameters
}

function Show-StagingUserResult {
    param([Parameter(Mandatory)]$Result)

    $propertyNames = @($Result.PSObject.Properties.Name)
    [pscustomobject]@{
        Estado = [string]$Result.status
        ContaTemporaria = [string]$Result.primary_email
        UnidadeOrganizacional = if ('org_unit_path' -in $propertyNames) { [string]$Result.org_unit_path } else { '' }
        Suspensa = if ('suspended' -in $propertyNames) { [bool]$Result.suspended } else { $null }
        GmailConfigurado = if ('is_mailbox_setup' -in $propertyNames) { [bool]$Result.is_mailbox_setup } else { $null }
    } | Format-List | Out-Host
}

function Invoke-CreateOrCheckStagingUser {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $stagingUser = Get-GoogleStagingUser -GroupEmail $GroupEmail
    Write-Host ''
    Write-Host "Consultando $stagingUser no Google Workspace..." -ForegroundColor Cyan
    $result = Invoke-StagingUserTool -Action Check -GroupEmail $GroupEmail
    Show-StagingUserResult -Result $result

    if ([string]$result.status -eq 'EXISTS') {
        if ([bool]$result.suspended) {
            Write-Warning 'A conta existe, mas está suspensa. Ative-a antes de preparar o Gmail.'
        }
        else {
            Write-Host 'A conta já existe; nenhuma alteração foi feita.' -ForegroundColor Green
        }
        Write-Host 'A opção 4 confirmará se a licença criou uma caixa Gmail utilizável.'
        return $result
    }
    if ([string]$result.status -ne 'NOT_FOUND') {
        throw "Estado inesperado ao consultar a conta: $($result.status)"
    }

    Write-Host ''
    Write-Host 'A conta será criada sem licença atribuída pelo app.' -ForegroundColor Yellow
    Write-Host 'A senha aleatória será descartada; o acesso da migração usa a conta de serviço.'
    if ($googleStagingOrgUnit) {
        Write-Host "Unidade organizacional configurada: $googleStagingOrgUnit"
    }
    else {
        Write-Warning 'Nenhuma OU de estágio foi configurada. Uma regra de licenciamento automático do Google pode atribuir licença ao criar a conta.'
    }
    if (-not (Confirm-MenuAction -Prompt "Criar agora $stagingUser no Google Workspace?")) {
        Write-Host 'Criação cancelada. Nenhuma conta foi alterada.'
        return $result
    }

    $created = Invoke-StagingUserTool -Action Create -GroupEmail $GroupEmail -Execute
    Show-StagingUserResult -Result $created
    Write-Host 'Conta criada. Atribua manualmente uma licença com Gmail e depois use a opção 4.' -ForegroundColor Green
    return $created
}

function Get-RestorePlan {
    param([Parameter(Mandatory)][object[]]$Output)

    $plan = @($Output | Where-Object {
        $_ -isnot [string] -and $null -ne $_.PSObject.Properties['Readiness']
    }) | Select-Object -Last 1
    if (-not $plan) {
        throw 'A operação não retornou o plano de restauração esperado.'
    }
    return $plan
}

function Get-ConflictApprovalPath {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $row = Get-LatestPreparationRow -GroupEmail $GroupEmail
    if (-not $row) { return $null }
    return Join-Path ([string]$row.StateDirectory) 'message-id-conflict-approval.json'
}

function Test-ConflictApproval {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $row = Get-LatestPreparationRow -GroupEmail $GroupEmail
    if (-not $row) { return $false }
    $approvalPath = Get-ConflictApprovalPath -GroupEmail $GroupEmail
    if (-not (Test-Path -LiteralPath $approvalPath -PathType Leaf)) { return $false }
    try {
        $approval = Get-Content -LiteralPath $approvalPath -Raw | ConvertFrom-Json
        $currentHash = (Get-FileHash -LiteralPath $row.Manifest -Algorithm SHA256).Hash.ToLowerInvariant()
        return [string]$approval.Group -eq $GroupEmail -and
            [string]$approval.ManifestSha256 -eq $currentHash -and
            [bool]$approval.KeepAllDistinctContentVariants
    }
    catch {
        return $false
    }
}

function Request-ConflictApproval {
    param([Parameter(Mandatory)][string]$GroupEmail)

    if (Test-ConflictApproval -GroupEmail $GroupEmail) { return $true }
    $row = Get-LatestPreparationRow -GroupEmail $GroupEmail
    if (-not $row) { throw "Não existe preparação para $GroupEmail." }
    $summary = Get-Content -LiteralPath $row.Summary -Raw | ConvertFrom-Json
    $conflictCount = [int]$summary.takeout.message_id_content_hash_conflicts
    if ($conflictCount -eq 0) { return $true }

    $reviewRows = @(Import-Csv -LiteralPath $row.ConflictReview | Where-Object RequiresApproval -EQ 'True')
    $defectRows = @(Import-Csv -LiteralPath $row.ParseDefectReview)
    Write-Host ''
    Write-Host 'Revisão obrigatória do manifesto' -ForegroundColor Yellow
    Write-Host " $conflictCount Message-ID(s) foram reutilizados por $($reviewRows.Count) mensagens de conteúdo distinto."
    Write-Host ' O manifesto manteve cada variante para evitar perda de dados.'
    Write-Host " $($defectRows.Count) mensagem(ns) têm irregularidades MIME; os bytes e hashes originais permanecem preservados."
    Write-Host " Relatório de variantes: $($row.ConflictReview)"
    Write-Host " Relatório MIME      : $($row.ParseDefectReview)"
    Write-Host ''
    Write-Host ' 1. Aprovar a conservação de todas as variantes e continuar'
    Write-Host ' 2. Mostrar os dois relatórios no gerenciador de arquivos e cancelar por agora'
    Write-Host ' 0. Cancelar'
    while ($true) {
        $reviewChoice = ([string](Read-Host 'Escolha uma opção')).Trim()
        if ($reviewChoice -in @('0', '1', '2')) { break }
        Write-Warning 'Opção inválida. Escolha 0, 1 ou 2.'
    }
    if ($reviewChoice -eq '2') {
        Show-FileInManager -Path ([string]$row.ConflictReview)
        Show-FileInManager -Path ([string]$row.ParseDefectReview)
        return $false
    }
    if ($reviewChoice -eq '0') { return $false }

    $approvalPath = Get-ConflictApprovalPath -GroupEmail $GroupEmail
    $approvalDirectory = Split-Path -Parent $approvalPath
    New-Item -ItemType Directory -Path $approvalDirectory -Force | Out-Null
    [ordered]@{
        ApprovedAtUtc = [DateTime]::UtcNow.ToString('o')
        Group = $GroupEmail
        Manifest = [string]$row.Manifest
        ManifestSha256 = (Get-FileHash -LiteralPath $row.Manifest -Algorithm SHA256).Hash.ToLowerInvariant()
        ContentConflictMessageIds = $conflictCount
        DistinctVariantMessages = $reviewRows.Count
        ParseDefectMessages = $defectRows.Count
        KeepAllDistinctContentVariants = $true
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $approvalPath -Encoding utf8NoBOM
    Write-Host "Aprovação registrada para este manifesto: $approvalPath" -ForegroundColor Green
    return $true
}

function Invoke-StagingFlow {
    param(
        [Parameter(Mandatory)][string]$GroupEmail,
        [Parameter(Mandatory)][ValidateSet('AuditStage', 'Stage', 'CreateBatch', 'Status')][string]$Phase,
        [ValidateRange(1, 2147483647)][int]$Limit,
        [switch]$Execute,
        [switch]$StartBatch,
        [switch]$ApproveNonEmptyTarget
    )

    $null = Get-OrPrepareGroup -GroupEmail $GroupEmail
    $parameters = @{
        Phase = $Phase
        Group = @($GroupEmail)
        StagingUser = Get-GoogleStagingUser -GroupEmail $GroupEmail
        TargetMailbox = Get-M365TargetMailbox -GroupEmail $GroupEmail
    }
    if ($PSBoundParameters.ContainsKey('Limit')) { $parameters.Limit = $Limit }
    if (Test-ConflictApproval -GroupEmail $GroupEmail) {
        $parameters.ApproveMessageIdConflicts = $true
    }
    if ($Execute) { $parameters.Execute = $true }
    if ($StartBatch) { $parameters.StartBatch = $true }
    if ($ApproveNonEmptyTarget) { $parameters.ApproveNonEmptyTarget = $true }
    $output = @(Invoke-MigrationSystem -Parameters $parameters)
    $plan = Get-RestorePlan -Output $output
    $plan | Select-Object Group, StagingUser, TargetSharedMailbox, Readiness,
        CanonicalMessages, VerifiedMessages, RemainingMessages,
        VerificationFailed, VerificationWarnings, TargetCurrentItems,
        TargetTotalItemSize, BatchName |
        Format-List | Out-Host
    return $plan
}

function Invoke-AuditStagingGmail {
    param([Parameter(Mandatory)][string]$GroupEmail)

    Write-Host ''
    Write-Host 'Validando licença, Gmail, backup e diário local sem inserir mensagens...' -ForegroundColor Cyan
    $plan = Invoke-StagingFlow -GroupEmail $GroupEmail -Phase AuditStage
    if ([string]$plan.Readiness -eq 'READY_TO_STAGE_REMAINING_MESSAGES') {
        Write-Host 'Gmail acessível e contagens seguras. A carga do backup pode ser iniciada.' -ForegroundColor Green
    }
    elseif ([string]$plan.Readiness -eq 'READY_FOR_EXCHANGE_BATCH') {
        Write-Host 'Toda a carga já está verificada; o lote do M365 pode ser criado.' -ForegroundColor Green
    }
    elseif ([string]$plan.Readiness -eq 'REVIEW_MESSAGE_ID_CONFLICTS') {
        Write-Host 'Gmail acessível e contagens coerentes, mas o manifesto exige aprovação das variantes antes de continuar.' -ForegroundColor Yellow
    }
    return $plan
}

function Invoke-LoadBackupToStaging {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $audit = Invoke-AuditStagingGmail -GroupEmail $GroupEmail
    if ([string]$audit.Readiness -eq 'REVIEW_MESSAGE_ID_CONFLICTS') {
        if (-not (Request-ConflictApproval -GroupEmail $GroupEmail)) {
            Write-Host 'Carga cancelada. Nenhuma mensagem foi inserida.'
            return $audit
        }
        $audit = Invoke-AuditStagingGmail -GroupEmail $GroupEmail
    }
    if ([string]$audit.Readiness -eq 'READY_FOR_EXCHANGE_BATCH') {
        Write-Host 'Não há mensagens restantes para inserir.' -ForegroundColor Green
        return $audit
    }
    if ([string]$audit.Readiness -ne 'READY_TO_STAGE_REMAINING_MESSAGES') {
        throw "A carga foi bloqueada pelo estado: $($audit.Readiness)"
    }

    Write-Host ''
    Write-Host 'Escolha o tamanho desta carga' -ForegroundColor Cyan
    Write-Host ' 1. Teste com as próximas 10 mensagens'
    Write-Host ' 2. Todas as mensagens restantes'
    Write-Host ' 0. Cancelar'
    while ($true) {
        $loadChoice = ([string](Read-Host 'Escolha uma opção')).Trim()
        if ($loadChoice -in @('0', '1', '2')) { break }
        Write-Warning 'Opção inválida. Escolha 0, 1 ou 2.'
    }
    if ($loadChoice -eq '0') {
        Write-Host 'Carga cancelada. Nenhuma mensagem foi inserida.'
        return $audit
    }

    $limitText = if ($loadChoice -eq '1') { 'até 10 mensagens' } else { 'todas as mensagens restantes' }
    $stagingUser = Get-GoogleStagingUser -GroupEmail $GroupEmail
    Write-Host ''
    [pscustomobject]@{
        Origem = 'Backup ZIP/MBOX canônico local'
        Grupo = $GroupEmail
        Carga = $limitText
        DestinoGoogleTemporario = $stagingUser
        DestinoFinalM365 = Get-M365TargetMailbox -GroupEmail $GroupEmail
    } | Format-List | Out-Host
    if (-not (Confirm-MenuAction -Prompt "Inserir $limitText em $stagingUser?")) {
        Write-Host 'Carga cancelada. Nenhuma mensagem foi inserida.'
        return $audit
    }

    Write-Host 'Inserindo e verificando cada mensagem. O diário permite retomar sem repetir as mensagens já confirmadas.' -ForegroundColor Cyan
    if ($loadChoice -eq '1') {
        return Invoke-StagingFlow -GroupEmail $GroupEmail -Phase Stage -Limit 10 -Execute
    }
    return Invoke-StagingFlow -GroupEmail $GroupEmail -Phase Stage -Execute
}

function Invoke-CreateExchangeBatch {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $audit = Invoke-AuditStagingGmail -GroupEmail $GroupEmail
    if ([string]$audit.Readiness -eq 'REVIEW_MESSAGE_ID_CONFLICTS') {
        if (-not (Request-ConflictApproval -GroupEmail $GroupEmail)) {
            Write-Host 'Criação cancelada. Nenhum lote foi criado.'
            return $audit
        }
        $audit = Invoke-AuditStagingGmail -GroupEmail $GroupEmail
    }
    if ([string]$audit.Readiness -eq 'READY_TO_STAGE_REMAINING_MESSAGES') {
        Write-Host ''
        Write-Host "O lote ainda não pode ser criado porque faltam $($audit.RemainingMessages) mensagem(ns) no Gmail temporário." -ForegroundColor Yellow
        Write-Host 'Nenhum problema foi encontrado e nenhuma alteração foi feita no M365.'
        Write-Host ' 1. Ir agora para a carga do backup'
        Write-Host ' 0. Voltar ao menu principal'
        while ($true) {
            $stageChoice = ([string](Read-Host 'Escolha 1 ou 0')).Trim()
            if ($stageChoice -in @('0', '1')) { break }
            Write-Warning 'Opção inválida. Escolha 1 ou 0.'
        }
        if ($stageChoice -eq '1') {
            return Invoke-LoadBackupToStaging -GroupEmail $GroupEmail
        }
        return $audit
    }
    if ([string]$audit.Readiness -ne 'READY_FOR_EXCHANGE_BATCH') {
        throw "O lote foi bloqueado pelo estado de segurança: $($audit.Readiness)."
    }

    Write-Host 'Executando a pré-validação somente leitura da caixa partilhada...' -ForegroundColor Cyan
    $targetAudit = Invoke-StagingFlow -GroupEmail $GroupEmail -Phase Status
    $approveNonEmptyTarget = $false
    if ($null -ne $targetAudit.TargetCurrentItems -and [long]$targetAudit.TargetCurrentItems -gt 0) {
        Write-Warning "A caixa $($targetAudit.TargetSharedMailbox) já contém $($targetAudit.TargetCurrentItems) item(ns), total $($targetAudit.TargetTotalItemSize)."
        Write-Host 'O app não consegue provar apenas por contagem se esses itens também estão no backup.'
        Write-Host ' 1. Confirmo que revisei o conteúdo existente e quero continuar'
        Write-Host ' 0. Cancelar para investigar possível sobreposição'
        while ($true) {
            $targetChoice = ([string](Read-Host 'Escolha 1 ou 0')).Trim()
            if ($targetChoice -in @('0', '1')) { break }
            Write-Warning 'Opção inválida. Escolha 1 ou 0.'
        }
        if ($targetChoice -eq '0') {
            Write-Host 'Criação cancelada. Nenhum lote foi criado.'
            return $targetAudit
        }
        $approveNonEmptyTarget = $true
    }

    Write-Host ''
    Write-Host 'Escolha como criar o lote do Exchange' -ForegroundColor Cyan
    Write-Host ' 1. Criar e iniciar o lote'
    Write-Host ' 2. Criar o lote sem iniciar'
    Write-Host ' 0. Cancelar'
    while ($true) {
        $batchChoice = ([string](Read-Host 'Escolha uma opção')).Trim()
        if ($batchChoice -in @('0', '1', '2')) { break }
        Write-Warning 'Opção inválida. Escolha 0, 1 ou 2.'
    }
    if ($batchChoice -eq '0') {
        Write-Host 'Criação cancelada. Nenhum lote foi criado.'
        return $audit
    }

    $stagingUser = Get-GoogleStagingUser -GroupEmail $GroupEmail
    $targetMailbox = Get-M365TargetMailbox -GroupEmail $GroupEmail
    $actionText = if ($batchChoice -eq '1') { 'criar e iniciar' } else { 'somente criar' }
    Write-Host ''
    [pscustomobject]@{
        OrigemGoogle = $stagingUser
        DestinoM365 = $targetMailbox
        MensagensVerificadas = $audit.VerifiedMessages
        Acao = $actionText
    } | Format-List | Out-Host
    if (-not (Confirm-MenuAction -Prompt "Confirmar: $actionText o lote para $targetMailbox?")) {
        Write-Host 'Criação cancelada. Nenhum lote foi criado.'
        return $audit
    }

    if ($batchChoice -eq '1') {
        return Invoke-StagingFlow -GroupEmail $GroupEmail -Phase CreateBatch -Execute -StartBatch -ApproveNonEmptyTarget:$approveNonEmptyTarget
    }
    return Invoke-StagingFlow -GroupEmail $GroupEmail -Phase CreateBatch -Execute -ApproveNonEmptyTarget:$approveNonEmptyTarget
}

function Invoke-ShowMigrationStatus {
    param([Parameter(Mandatory)][string]$GroupEmail)

    Write-Host ''
    Write-Host 'Consultando o Gmail temporário e o lote no Exchange Online...' -ForegroundColor Cyan
    return Invoke-StagingFlow -GroupEmail $GroupEmail -Phase Status
}

function Get-PstPackagePlan {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $row = Get-OrPrepareGroup -GroupEmail $GroupEmail
    $latest = Get-LatestPreparation
    $manifestHash = (Get-FileHash -LiteralPath $row.Manifest -Algorithm SHA256).Hash.ToLowerInvariant()
    $safeGroup = $GroupEmail -replace '[^a-z0-9._-]', '_'
    $planPath = Join-Path `
        (Join-Path (Join-Path (Join-Path $workspaceRoot 'pst') ([string]$latest.ExportId)) $safeGroup) `
        (Join-Path $manifestHash.Substring(0, 12) 'package-plan.json')
    if (-not (Test-Path -LiteralPath $planPath -PathType Leaf)) {
        return $null
    }
    $plan = Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json
    $expectedTarget = Get-M365TargetMailbox -GroupEmail $GroupEmail
    if ([string]$plan.TargetSharedMailbox -ne $expectedTarget) {
        return $null
    }
    return $plan
}

function Invoke-CreatePstPackage {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $null = Get-OrPrepareGroup -GroupEmail $GroupEmail
    Write-Host ''
    Write-Host 'Criando o pacote diretamente a partir do backup, sem acessar Gmail...' -ForegroundColor Cyan
    $parameters = @{
        Group = $GroupEmail
        TargetMailbox = Get-M365TargetMailbox -GroupEmail $GroupEmail
    }
    if ($ConfigPath) { $parameters.ConfigPath = $ConfigPath }
    $output = @(& $newPstPackageScript @parameters)
    $plan = @($output | Where-Object {
        $_ -isnot [string] -and $null -ne $_.PSObject.Properties['PstFiles']
    }) | Select-Object -Last 1
    if (-not $plan) { throw 'A geração não retornou um plano PST.' }
    if ([string]$plan.Readiness -ne 'READY_FOR_PURVIEW_UPLOAD') {
        throw "O PST exige revisão: $($plan.Readiness)"
    }
    Write-Host 'O pacote está pronto para validação e upload no Purview.' -ForegroundColor Green
    return $plan
}

function Invoke-ValidateGroup {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $targetMailbox = Get-M365TargetMailbox -GroupEmail $GroupEmail
    $result = & $testPstTargetScript `
        -TargetMailbox $targetMailbox `
        -ExchangeAdmin $exchangeAdmin `
        -DisconnectWhenDone
    $result | Format-List | Out-Host
    return $result
}

function Invoke-UploadPstPackage {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $plan = Get-PstPackagePlan -GroupEmail $GroupEmail
    if (-not $plan) {
        if (-not (Confirm-MenuAction -Prompt 'O pacote PST ainda não existe. Deseja criá-lo agora?')) {
            throw 'Operação cancelada. Nenhum arquivo foi enviado.'
        }
        $plan = Invoke-CreatePstPackage -GroupEmail $GroupEmail
    }
    if ([string]$plan.Readiness -ne 'READY_FOR_PURVIEW_UPLOAD') {
        throw "O pacote não está pronto: $($plan.Readiness)"
    }

    Write-Host ''
    Write-Host 'Validando o destino no M365...' -ForegroundColor Cyan
    $target = Invoke-ValidateGroup -GroupEmail $GroupEmail
    if ([string]$target.Status -ne 'ReadyForPstImport') {
        throw "O destino bloqueou a importação: $($target.Status)"
    }
    if ([long]$target.CurrentItems -gt 0) {
        Write-Warning 'A caixa já possui itens. Não envie novamente um pacote que já tenha sido importado pelo Purview.'
    }

    Write-Host ''
    [pscustomobject]@{
        Origem = 'Backup MBOX canônico local'
        Mensagens = $plan.CanonicalMessages
        ArquivosPST = @($plan.PstFiles).Count
        Destino = $plan.TargetSharedMailbox
        PastaNoM365 = $plan.TargetRootFolder
        Mapeamento = $plan.PurviewMappingCsv
    } | Format-List | Out-Host
    if (-not (Confirm-MenuAction -Prompt 'Deseja enviar estes PSTs ao armazenamento temporário do Microsoft Purview?')) {
        throw 'Operação cancelada. Nenhum arquivo foi enviado.'
    }

    Write-Host ''
    Write-Host 'Cole a SAS URL copiada do trabalho de importação do Purview.' -ForegroundColor Cyan
    Write-Host 'Ela ficará oculta e não será salva em arquivo nem no histórico.'
    $sasUrl = Read-Host 'SAS URL' -AsSecureString
    $receipt = & $sendPstPackageScript `
        -PackagePlan (Join-Path $plan.PackageDirectory 'package-plan.json') `
        -SasUrl $sasUrl `
        -Execute `
        -Confirm:$false
    $receipt | Format-List | Out-Host

    Show-FileInManager -Path $plan.PurviewMappingCsv
    Start-Process 'https://purview.microsoft.com'
    Write-Host 'O navegador e o CSV foram abertos. No Purview, envie o CSV, valide-o e escolha importar tudo.' -ForegroundColor Green
}

function Open-PurviewForGroup {
    param([Parameter(Mandatory)][string]$GroupEmail)

    $plan = Get-PstPackagePlan -GroupEmail $GroupEmail
    if (-not $plan) { throw 'Esse grupo ainda não possui um pacote PST. Use primeiro a opção 3.' }
    Show-FileInManager -Path $plan.PurviewMappingCsv
    Start-Process 'https://purview.microsoft.com'
    Write-Host "Mapeamento selecionado: $($plan.PurviewMappingCsv)"
}

function Show-PstAlternativeMenu {
    while ($true) {
        Write-Host ''
        Write-Host 'Alternativa PST / Microsoft Purview' -ForegroundColor Cyan
        Write-Host ' 1. Criar pacote PST diretamente do backup'
        Write-Host ' 2. Enviar PST para o Purview'
        Write-Host ' 3. Validar a caixa partilhada no M365'
        Write-Host ' 4. Abrir Purview e o CSV de mapeamento'
        Write-Host ' 0. Voltar ao menu principal'
        $pstChoice = ([string](Read-Host 'Escolha uma opção')).Trim()
        if ($pstChoice -eq '0') { return }

        switch ($pstChoice) {
            '1' {
                $groupEmail = Select-GroupEmail -Action 'Criar pacote PST diretamente do backup'
                if ($groupEmail) { $null = Invoke-CreatePstPackage -GroupEmail $groupEmail }
            }
            '2' {
                $groupEmail = Select-GroupEmail -Action 'Enviar PST para o Microsoft Purview'
                if ($groupEmail) { Invoke-UploadPstPackage -GroupEmail $groupEmail }
            }
            '3' {
                $groupEmail = Select-GroupEmail -Action 'Validar M365'
                if ($groupEmail) { $null = Invoke-ValidateGroup -GroupEmail $groupEmail }
            }
            '4' {
                $groupEmail = Select-GroupEmail -Action 'Abrir Purview e o mapeamento'
                if ($groupEmail) { Open-PurviewForGroup -GroupEmail $groupEmail }
            }
            default { Write-Warning 'Opção inválida.' }
        }
    }
}

function Show-Menu {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Write-Host ' Migração de histórico Google Groups para M365' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Write-Host ' 1. Listar backups/grupos disponíveis'
    Write-Host ' 2. Preparar mensagens de um grupo'
    Write-Host ' 3. Criar ou verificar a conta temporária no Google'
    Write-Host ' 4. Validar licença e Gmail da conta temporária'
    Write-Host ' 5. Carregar o backup na conta temporária'
    Write-Host ' 6. Criar e iniciar o lote de migração no M365'
    Write-Host ' 7. Consultar estado do lote e das contagens'
    Write-Host ' 8. Alternativa PST / Microsoft Purview'
    Write-Host ' 0. Sair'
    Write-Host ''
}

while ($true) {
    Show-Menu
    $choiceInput = Read-Host 'Escolha uma opção'
    if ($null -eq $choiceInput) {
        Write-Host 'Entrada encerrada. Menu finalizado.'
        break
    }
    $choice = ([string]$choiceInput).Trim()
    if ($choice -eq '0') {
        Write-Host 'Menu encerrado.'
        break
    }

    try {
        switch ($choice) {
            '1' { Show-GroupCatalog }
            '2' {
                $groupEmail = Select-GroupEmail -Action 'Preparar mensagens'
                if ($groupEmail) {
                    $null = Invoke-PrepareGroup -GroupEmail $groupEmail
                }
            }
            '3' {
                $groupEmail = Select-GroupEmail -Action 'Criar ou verificar conta temporária no Google'
                if ($groupEmail) {
                    $null = Invoke-CreateOrCheckStagingUser -GroupEmail $groupEmail
                }
            }
            '4' {
                $groupEmail = Select-GroupEmail -Action 'Validar licença e Gmail da conta temporária'
                if ($groupEmail) {
                    $null = Invoke-AuditStagingGmail -GroupEmail $groupEmail
                }
            }
            '5' {
                $groupEmail = Select-GroupEmail -Action 'Carregar backup na conta temporária'
                if ($groupEmail) {
                    $null = Invoke-LoadBackupToStaging -GroupEmail $groupEmail
                }
            }
            '6' {
                $groupEmail = Select-GroupEmail -Action 'Criar lote de migração no M365'
                if ($groupEmail) {
                    $null = Invoke-CreateExchangeBatch -GroupEmail $groupEmail
                }
            }
            '7' {
                $groupEmail = Select-GroupEmail -Action 'Consultar estado da migração'
                if ($groupEmail) {
                    $null = Invoke-ShowMigrationStatus -GroupEmail $groupEmail
                }
            }
            '8' { Show-PstAlternativeMenu }
            default {
                Write-Warning 'Opção inválida.'
            }
        }
    }
    catch {
        Write-Host ''
        Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host 'Nenhuma etapa posterior a esse erro foi executada.' -ForegroundColor DarkYellow
    }

    Write-Host ''
    $null = Read-Host 'Pressione Enter para voltar ao menu'
}
