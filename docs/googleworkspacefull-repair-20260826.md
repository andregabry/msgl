# Correção do lote GoogleWorkspaceFull

Data: 26/08/2026

## Resultado final

- Estado do lote: `Synced`
- Total: 38
- Sincronizados: 38
- Falhas: 0
- Parados: 0
- Endpoint `GoogleWorkspace`: teste concluído com `Success`
- Autenticação usada: sessão interativa normal do Exchange Online PowerShell
- Nenhum token, aplicativo, certificado ou credencial nova foi criado

## Diagnóstico inicial

O lote tinha 39 entradas, 36 sincronizadas e 3 em falha:

| Destino do lote | Origem Google | Falha encontrada |
|---|---|---|
| `javier.silva@dynamox.net` | `javier.silva@enging.pt` | autorização Google OAuth rejeitada no histórico |
| `mario.garcia@dynamox.net` | `mario.garcia@enging.pt` | Google Calendar não habilitado para o utilizador no histórico |
| `eng.compras@dynamox.net` | `compras@enging.pt` | destinatário de destino não encontrado |

## Ações executadas

1. Testado o endpoint existente `GoogleWorkspace`; o resultado foi `Success`.
2. Retomadas individualmente as três entradas com `Start-MigrationUser`.
3. `javier.silva` e `mario.garcia` regressaram ao estado `Synced`, sem erro ativo.
4. Identificado que `eng.compras@dynamox.net` estava como mailbox excluída recuperável desde 24/08/2026.
5. Recuperada a mailbox com `Undo-SoftDeletedMailbox`, preservando o GUID esperado pelo lote, para confirmar a causa.
6. Após a informação de que o destino correto é a mailbox partilhada `compras@enging.pt`, interrompida a entrada incorreta com `Stop-MigrationUser`.
7. Removido somente o registo de migração incorreto com `Remove-MigrationUser`; nenhuma mailbox foi eliminada.
8. Confirmado o lote final com 38/38 sincronizados e nenhuma falha.

## Objetos preservados

| Objeto | Tipo | Exchange GUID | Estado |
|---|---|---|---|
| `eng.compras@dynamox.net` | `UserMailbox` | `cf710c85-0591-43a5-a49d-086d1f1be4c8` | Preservada; não pertence mais ao lote |
| `compras@enging.pt` | `SharedMailbox` | `37e48a8d-64ac-4eab-982a-7d5921e4c37d` | Preservada; destino correto informado |

A mailbox antiga `eng.compras@dynamox.net` apresentava 47 itens e último logon em 22/08/2026. Por segurança, ela não foi apagada nem mesclada automaticamente.

## Próxima etapa recomendada

Tratar `compras@enging.pt` no fluxo específico de Google Group para mailbox partilhada. Não reutilizar a antiga entrada Gmail do lote `GoogleWorkspaceFull`, pois ela estava vinculada ao GUID de `eng.compras@dynamox.net`.

## Comandos principais para verificação manual

```powershell
Connect-ExchangeOnline -UserPrincipalName andre.gabry@dynamox.net

Get-MigrationBatch -Identity GoogleWorkspaceFull |
    Format-List Identity,Status,TotalCount,SyncedCount,FailedCount,StoppedCount

Get-MigrationUser -BatchId GoogleWorkspaceFull -ResultSize Unlimited |
    Group-Object Status

Get-Mailbox -Identity compras@enging.pt |
    Format-List DisplayName,PrimarySmtpAddress,RecipientTypeDetails,ExchangeGuid

Disconnect-ExchangeOnline -Confirm:$false
```

## Referências oficiais

- Microsoft Learn: [Start-MigrationUser](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/start-migrationuser?view=exchange-ps)
- Microsoft Learn: [Stop-MigrationUser](https://learn.microsoft.com/en-us/powershell/module/exchange/stop-migrationuser?view=exchange-ps)
- Microsoft Learn: [Undo-SoftDeletedMailbox](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/undo-softdeletedmailbox?view=exchange-ps)
- Microsoft Learn: [Migração do Google Workspace com Exchange Online PowerShell](https://learn.microsoft.com/en-us/exchange/mailbox-migration/perform-gspace-migration-powershell)
