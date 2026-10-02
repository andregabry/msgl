# Manual de Operações & Guia de Manutenção (Runbook)

## 1. Inicialização do Ambiente com Docker Compose
Para iniciar a infraestrutura completa de produção:
```bash
docker compose up -d
```
Serviços em execução:
- `migrate-postgres`: Base de dados PostgreSQL 18 exposta na porta `5432`.
- `migrate-redis`: Servidor Redis 7 exposto na porta `6379`.
- `migrate-app`: Aplicação Next.js exposta na porta `3000`.
- `migrate-worker`: Worker BullMQ de execução em segundo plano.

## 2. Inicialização Local para Desenvolvimento
```bash
# 1. Instalar dependências
npm install

# 2. Executar migrações do PostgreSQL
npx prisma migrate dev

# 3. Iniciar o servidor de desenvolvimento
npm run dev

# 4. Iniciar o worker de filas assíncronas (noutro terminal)
npm run worker
```

## 3. Monitorização de Saúde (Health Checks)
Aceda ao endpoint:
```http
GET /api/health
```
Resposta típica em modo saudável:
```json
{
  "status": "HEALTHY",
  "timestamp": "2026-10-02T08:00:00.000Z",
  "checks": {
    "postgresql": { "status": "UP" },
    "redis": { "status": "UP" },
    "storage": { "status": "UP" },
    "google": { "status": "UP" },
    "microsoft": { "status": "UP" }
  }
}
```

## 4. Gestão e Resolução de Problemas
- **Fila de Background Bloqueada:** Inspecione os trabalhos na tabela `background_jobs` ou verifique a conectividade com o Redis através do comando `redis-cli ping`.
- **Falha de Autenticação no Google Vault:** Verifique a validade do certificado da Service Account e confirme a ativação dos 5 escopos na secção de Domain-Wide Delegation no Google Admin Console.
- **Falha no AzCopy:** Certifique-se de que o executável `azcopy` se encontra no `PATH` do sistema e verifique a expiração da SAS URL temporária gerada no portal Microsoft Purview.
