# Política de Segurança e Governança de Dados

## 1. Gestão de Segredos e Credenciais
- Nenhuma credencial privada, token de acesso ou chave privada é armazenada no código-fonte ou versionada no Git.
- O ficheiro `.env` está excluído do repositório através do `.gitignore`.
- Ficheiros de Service Account JSON residem em pastas protegidas fora do controlo de versões.
- A SAS URL do Microsoft Purview é tratada como segredo de nível crítico e nunca é exposta no frontend nem inscrita em registos de log.

## 2. Controlo de Acesso e RBAC
- Todas as rotas de API no backend verificam obrigatoriamente a sessão do utilizador e a matriz de permissões (`assertPermission`).
- Ocultar botões no frontend é apenas um facilitador de UX; a segurança é estritamente garantida no servidor.
- Os utilizadores comuns (`USER`) apenas conseguem consultar mensagens com mapeamento direto em `chat_user_access`. Toda a consulta administrativa por parte de utilizadores com perfil `ADMIN` ou `AUDITOR` gera de imediato um evento imutável na tabela `audit_events`.

## 3. Segurança no Download e Prevenção de Malware
- Os downloads de backups passam por um endpoint protegido (`/api/backups/[id]/download`) com verificação de autenticação e papel (`backup:download`).
- Os cabeçalhos `Content-Disposition` são rigorosamente sanitizados para prevenir injeção de parâmetros HTTP.
- O sistema integra a interface `MalwareScanner`, permitindo a ligação a daemons ClamAV em ambientes de alta criticidade.
