# Pipeline de Backup e Armazenamento Físico

## 1. Topologia de Armazenamento Local
Os ficheiros de backup são estruturados de forma previsível e isolada sob `BACKUP_STORAGE_ROOT`:
```text
/data/backups/
├── google/
│   ├── users/
│   │   └── {googleUserId}/
│   │       ├── gmail/{backupRequestId}/
│   │       │   └── backup_gmail.mbox
│   │       └── chat/{backupRequestId}/
│   │           └── backup_chat.mbox
│   └── groups/
│       └── {googleGroupId}/
│           └── mail/{backupRequestId}/
│               └── backup_group.pst
└── microsoft/
    └── staging/{migrationJobId}/
        └── pst-mapping.csv
```

## 2. Garantias de Integridade
- **Sem Caminhos Arbitrários:** O nome do ficheiro é sanitizado no momento da receção, e o caminho físico é validado pelo `BackupStorageProvider` para impedir ataques de *Path Traversal* (`..`) e *Zip Slip*.
- **Checksum Duplo:** O hash SHA-256 é calculado em streaming durante o processo de escrita em ficheiro temporário (`.part`). Apenas após validação é efetuada a renomeação atómica para o destino final.
- **Transações de Base de Dados:** O estado do registo no PostgreSQL só passa para `READY` após a confirmação física do ficheiro em disco.
