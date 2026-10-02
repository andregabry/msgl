# Guia de Configuração: Microsoft 365 & Microsoft Graph

## 1. Registo da Aplicação no Microsoft Entra ID
1. Aceda ao portal **Microsoft Entra admin center** (`entra.microsoft.com`).
2. Em **App registrations**, clique em **New registration**:
   - Nome: `Enging-Workspace-Migration-Hub`
   - Supported account types: *Accounts in this organizational directory only (Single tenant)*
3. Guarde o **Application (Client) ID** e o **Directory (Tenant) ID**.

## 2. Permissões de API (Application-Only)
Para permitir que o sistema sincronize utilizadores e caixas de correio de forma autónoma sem intervenção interativa de utilizador final:
1. Em **API permissions > Add a permission > Microsoft Graph > Application permissions**:
   - `User.Read.All`: Leitura de todos os perfis de utilizador.
   - `Directory.Read.All`: Leitura de metadados organizacionais.
   - `MailboxSettings.Read.All`: Leitura de configurações de caixas de correio.
2. Clique obrigatoriamente em **Grant admin consent for [Tenant]**.

## 3. Criação de Segredo da Aplicação (Client Secret)
1. Aceda a **Certificates & secrets > Client secrets > New client secret**.
2. Guarde o valor do segredo imediatamente e configure a variável `MICROSOFT_CLIENT_SECRET` no ficheiro `.env`.
3. Nunca exponha nem envie este segredo para o frontend ou para registos de log.

## 4. Requisitos para Microsoft Purview PST Import
- Atribuição do papel **Mailbox Import Export** ou **Organization Management** no Exchange Online para a conta ou serviço responsável pela submissão do trabalho de importação no Purview.
- Obtenção da SAS URL temporária do Azure Storage associada à sua organização através do portal de conformidade do Microsoft Purview.
