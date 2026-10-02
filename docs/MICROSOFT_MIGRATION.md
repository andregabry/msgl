# Pipeline de Migração para Microsoft 365

## 1. Princípios Fundamentais e Regras Rígidas
- **Sem Hacks de Rascunho:** O sistema rejeita veementemente a prática de injetar e-mails como rascunhos (*Drafts*) alterando flags MAPI internas ou fazendo envios SMTP simulados, pois tais métodos corrompem remetentes originais, carimbos temporais de transporte e cadeias de cabeçalhos de autenticação (DKIM/SPF/DMARC).
- **Abordagem Oficial Purview:** A importação recomendada e totalmente suportada pela Microsoft para caixas históricas e Google Groups baseia-se na geração de pacotes **PST** e na criação de ficheiros de mapeamento CSV para o **Microsoft 365 Import Service (Purview)**.
- **Transparência de Estado:** O sistema nunca reporta um e-mail como "importado" até que a Microsoft conclua o processo no Exchange Online. O estado da preparação permanece como `AWAITING_PURVIEW_JOB` até confirmação.

## 2. Formato do Mapeamento CSV Purview
O ficheiro gerado automaticamente pelo sistema segue rigorosamente o formato do Microsoft 365 Import Service:
```csv
Workload,FilePath,Name,Mailbox,IsArchive,TargetRootFolder,ContentCodePage,SPFileContainer,SPManifestContainer,SPSiteUrl
Exchange,,comercial_backup.pst,comercial@dynamox.net,FALSE,"/Google Groups/comercial@enging.pt",,,,
```

### Campos:
- **Workload:** `Exchange` (obrigatório).
- **FilePath:** Deixar em branco caso o ficheiro esteja na raiz da pasta do storage Azure.
- **Name:** Nome exato do ficheiro `.pst` carregado.
- **Mailbox:** Endereço SMTP principal da caixa de correio de destino (preferencialmente **Shared Mailbox**).
- **IsArchive:** `FALSE` (ou `TRUE` para arquivamento no Archive Mailbox).
- **TargetRootFolder:** Diretório canónico de destino no Exchange (ex: `/Google Groups/{group-email}`).

## 3. Upload Opcional com AzCopy
Quando a variável `PURVIEW_PST_SAS_URL` estiver configurada no `.env`, o worker executa o utilitário AzCopy num processo isolado:
```bash
azcopy copy "C:\data\backups\google\groups\comercial\comercial_backup.pst" "[PURVIEW_PST_SAS_URL]" --recursive=false
```
A SAS URL é tratada como segredo de alta sensibilidade e nunca é devolvida ao browser ou inscrita nos ficheiros de registo de log.
