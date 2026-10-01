@{
    # Pasta que contém catálogo, execuções, relatórios e estado idempotente.
    WorkspaceRoot       = 'C:\Users\SEU_USUARIO\Documents\M365\Google Groups\_migration-system'

    GoogleDomain        = 'enging.pt'
    GoogleAdmin         = 'andre.gabry@enging.pt'
    ExchangeAdmin       = 'andre.gabry@dynamox.net'
    # Domínio primário das caixas partilhadas no Microsoft 365.
    M365TargetDomain    = 'dynamox.net'
    # Opcional: use uma OU sem licença automática para as contas temporárias.
    GoogleStagingOrgUnit = ''
    ServiceAccountFile  = 'C:\Users\SEU_USUARIO\Documents\M365\service-account.json'
    PythonPath          = 'C:\caminho\para\python.exe'

    # Conversor local e fixado para materializar PSTs a partir dos MBOXs canônicos.
    MboxToPstPath       = 'C:\caminho\para\Mail2Pst.Cli.exe'

    # Usado apenas pelos scripts legados de migração Gmail; o menu de grupos
    # restaura diretamente dos backups e não consulta este endpoint.
    MigrationEndpoint   = 'GoogleWorkspace'

    # Pode ficar vazio: o sistema tenta detectar a partir de um lote Gmail existente.
    TargetDeliveryDomain = ''

    # Origem do Data Export do Google e pasta local onde cada exportação será guardada.
    GoogleTakeoutBucketRoot = 'gs://dwt-takeout-export--NUMERO/AAAAmmddTHHMMSSZ/'
    GoogleGroupsBackupRoot = 'C:\Users\SEU_USUARIO\Documents\M365\Google Groups'
}
