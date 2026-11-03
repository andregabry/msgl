# Sistema de Migração: Google Groups → Microsoft 365

Repositório oficial e centralizado da aplicação de migração e auditoria de Google Groups para caixas compartilhadas e de usuário no Microsoft 365.

---

## 1. Visão Geral da Arquitetura

O sistema foi estruturado para manter o código da aplicação limpo, modular, rastreável e separado de documentos e artefatos de dados volumosos:

```
migrate-system/
├── config/             # Modelos e arquivos de configuração (.psd1)
│   ├── google-groups-system.example.psd1
│   └── google-groups-system.local.psd1
├── docs/               # Documentação técnica, runbooks e análises de auditoria
│   ├── analise-piloto-google-group-informatica-20260826.md
│   ├── conditional-access-20260826.md
│   ├── googleworkspacefull-repair-20260826.md
│   └── informatica-execution-20260826.md
├── interface/          # Painel Web e API Backend Local
│   ├── server.py       # Servidor HTTP/API Python nativo (seguro em 127.0.0.1 com token)
│   └── static/         # Frontend moderno (SPA sem dependências externas)
│       ├── app.js      # Lógica da interface, fluxos e polling em tempo real
│       ├── index.html  # Estrutura modular em páginas (Visão Geral, Fluxo, Cockpit, etc.)
│       └── styles.css  # Estilização com suporte a temas e alta acessibilidade
├── scripts/            # Motores de migração em PowerShell e Python
│   ├── import_mbox_to_m365_direct.py          # Inserção direta no M365 via Graph API (MIME RFC822)
│   ├── Restore-GoogleGroupToSharedMailbox.ps1 # Orquestrador de status e migração Exchange
│   ├── Prepare-GoogleGroupsMigration.ps1      # Extração canônica, deduplicação e integridade
│   ├── import_google_groups_takeout_to_staging.py # Injeção em conta Google temporária
│   └── ... (scripts de descoberta, inventário e auditoria)
├── templates/          # Modelos CSV de mapeamento e atribuição de caixas
├── tests/              # Testes unitários do sistema
├── windows/            # Scripts e lançadores para ambiente Windows
├── macos/              # Scripts de compatibilidade para macOS
├── Iniciar-Migracao.cmd # Lançador rápido Windows (inicia o servidor e abre o navegador)
├── README.md           # Este guia de arquitetura e operação
└── .gitignore          # Regras de exclusão para manter o repositório leve e rastreável
```

---

## 2. Modos de Operação

### Modo 1: Migração Direta para o Microsoft 365 (Recomendado)
- **Tecnologia:** Microsoft Graph API (`POST /users/{mailbox}/messages` com payload RFC822 bruto).
- **Vantagens:**
  - **Bypass do Google Workspace:** Não necessita criar usuário temporário no Google Workspace.
  - **Custo Zero de Licenciamento:** Não necessita atribuir licença paga de Gmail.
  - **Sem Dependência de Lote Exchange:** Dispensa a criação de lotes IMAP e tempos de espera do Exchange Online.
- **Confiabilidade:** Base SQLite local (`m365-direct-import.sqlite3`) para idempotência absoluta — retoma exatamente de onde parou sem duplicar e-mails.

### Modo 2: Reconciliação Automática de Status M365
- O sistema compara periodicamente (ou sob demanda via botão **"Verificar com M365"**) a contagem real de itens na caixa do Microsoft 365 (`TargetCurrentItems`) contra as mensagens canônicas do backup (`canonical_messages`).
- Quando os itens no M365 correspondem ou superam o backup, a conta é **automaticamente marcada como Concluída (100%)** (`EXCHANGE_BATCH_COMPLETED`), refletindo imediatamente no filtro "Migradas" da Visão Geral.

### Modo 3: Migração Tradicional via Lote IMAP do Exchange
- Suporta o fluxo legado de staging no Gmail e sincronização em lote no Exchange Online para cenários onde a migração contínua via IMAP seja estritamente exigida.

---

## 3. Como Executar a Aplicação

### No Windows:
Basta clicar duas vezes em:
```cmd
Iniciar-Migracao.cmd
```
Ou executar diretamente via terminal PowerShell / CMD:
```cmd
cd C:\Users\andre.gabry\Projects\migrate-system
python interface\server.py --open
```

O navegador abrirá automaticamente no endereço:
```
http://127.0.0.1:8765/?token=<TOKEN_GERADO_AUTOMATICAMENTE>
```

---

## 4. Estrutura de Navegação no Painel

1. **Status > Visão Geral:**
   - Estado das conexões com a nuvem (Google Cloud e Microsoft 365).
   - Métricas globais consolidadas (grupos totais, migrados, em andamento e mensagens).
   - Tabela global com abas de filtro (**Todas**, **Migradas**, **Em Andamento**, **Pendentes**).
2. **Status > Fluxo de Migração:**
   - Seletor de contas em formato de objetos clicáveis com suporte a seleção múltipla.
   - Comparação visual paralela do pipeline de migração entre diferentes grupos.
3. **Operação > Cockpit do Grupo:**
   - Painel do grupo selecionado com ações ordenadas.
   - **Novo Bloco:** *Inserção Direta na Caixa Microsoft 365 (Graph API)* com botões de carga completa, teste de 10 e-mails e reconciliação.
4. **Operação > Todos os Grupos:**
   - Catálogo tabular com seleção rápida.
5. **Backups:**
   - Gerenciamento de arquivos locais e inventário remoto no Google Takeout / Google Cloud Storage.

---

## 5. Rastreabilidade e Versionamento

O repositório `migrate-system` é versionado através do Git:
- Arquivos de credenciais locais (`config/*.local.psd1`, `service-account.json`) e caches temporários são protegidos pelo `.gitignore`.
- O histórico de alterações do código-fonte e dos módulos de migração é mantido de forma rastreável e auditável.
