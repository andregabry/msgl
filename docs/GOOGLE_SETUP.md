# Guia de Configuração: Google Workspace & Service Account

## 1. APIs Obrigatórias no Google Cloud Console
No projeto Google Cloud associado à organização (ex: `enging-migration`), ative as seguintes APIs:
1. **Admin SDK API** (`admin.googleapis.com`)
2. **Google Vault API** (`vault.googleapis.com`)
3. **Cloud Storage API** (`storage.googleapis.com`)

## 2. Criação da Service Account
1. Aceda a **IAM & Admin > Service Accounts**.
2. Crie uma Service Account com o nome `migration-svc@enging-migration.iam.gserviceaccount.com`.
3. Crie uma chave no formato **JSON** e guarde-a de forma segura em local restrito (ex: `C:\Users\andre.gabry\Projects\m365\service-account.json`).
4. **NUNCA** faça commit do ficheiro JSON no repositório Git.

## 3. Configuração de Domain-Wide Delegation (DWD)
Como as operações de Directory e Vault requerem privilégios a nível de domínio:
1. No Google Cloud Console, selecione a Service Account e ative **Enable Google Workspace Domain-wide Delegation**.
2. Anote o **Client ID** numérico da Service Account.
3. No **Google Admin Console** (`admin.google.com`), aceda a:
   **Security > Access and data control > API controls > Manage Domain Wide Delegation**.
4. Clique em **Add new** e adicione o Client ID da Service Account com os seguintes Scopes (separados por vírgula):
   ```text
   https://www.googleapis.com/auth/admin.directory.user.readonly,
   https://www.googleapis.com/auth/admin.directory.group.readonly,
   https://www.googleapis.com/auth/admin.directory.group.member.readonly,
   https://www.googleapis.com/auth/ediscovery,
   https://www.googleapis.com/auth/ediscovery.readonly
   ```

## 4. Conta de Administrador a Impersonar
Defina a variável `GOOGLE_IMPERSONATED_ADMIN` no `.env` com um e-mail de administrador do Google Workspace com privilégios de **Super Admin** ou privilégios delegados no Google Vault (ex: `andre.gabry@enging.pt`).
