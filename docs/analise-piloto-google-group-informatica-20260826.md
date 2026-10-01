# Análise do piloto Google Group → caixa partilhada

Grupo de teste: `informatica@enging.pt`  
Caixa de destino: `informatica@enging.pt`  
Data da análise: 26/08/2026

## Conclusão executiva

É possível migrar o histórico do Google Group para uma caixa partilhada do Exchange Online, mas o grupo não deve ser colocado diretamente num lote Gmail como se fosse uma conta Google. Um Google Group não é uma mailbox Gmail e não pode ser impersonado pelo endpoint do Exchange. Esse foi o padrão que provocou a falha OAuth observada anteriormente em `compras@enging.pt`.

Para `informatica@enging.pt`, o caminho seguro é:

1. obter uma exportação do arquivo do próprio Google Group;
2. reconciliar essa exportação com o inventário já reconstruído a partir das caixas dos membros;
3. gerar um conjunto MIME único e auditável;
4. testar primeiro numa caixa partilhada temporária do M365;
5. somente após a validação migrar para a caixa final, usando um limite temporal que não se sobreponha aos itens já recebidos no M365.

Não deve ser feita a migração integral enquanto existirem mensagens não classificadas ou enquanto o histórico do grupo não tiver sido exportado.

## Inventário do Google Group

| Propriedade | Valor |
|---|---|
| Endereço principal | `informatica@enging.pt` |
| Nome | `Informatica` |
| Alias | `glpi@enging.pt` |
| Membros diretos atuais | 4 |
| Owners atuais | 2 |
| Conta administrativa usada | `andre.gabry@enging.pt` |
| Conta é super-administradora | Sim |
| Google Vault | Não instalado no domínio |
| Groups Settings API | Desabilitada no projeto atual |
| Histórico da conversa | **ATIVADO**, confirmado na interface do Google Groups em 26/08/2026 |

A configuração `Conversation history` não pôde ser consultada pela API porque a Groups Settings API está desabilitada. Ela foi confirmada em modo somente leitura na interface do Google Groups com a conta `andre.gabry@enging.pt`: **Histórico da conversa = ATIVADO**. Essa confirmação descreve a configuração atual; a reconciliação continua necessária porque ela não prova que o histórico permaneceu ativado durante todo o período desde 2018.

## Execução iniciada em 26/08/2026

Às 13:21 (Europe/Lisbon), foi solicitada uma exportação no Google Takeout com estas opções:

- conta: `andre.gabry@enging.pt`;
- produto selecionado: somente `Grupos do Google`;
- frequência: uma única exportação;
- destino: link de transferência por email;
- formato: ZIP;
- tamanho máximo de cada parte: 2 GB;
- estado inicial: a Google está a criar a cópia, com prazo informado de horas ou dias.

O Takeout não permite limitar a exportação a um único endereço. O arquivo conterá os grupos pertencentes à conta; somente o MBOX correspondente a `informatica@enging.pt` será admitido no manifesto do piloto. As 11 exportações periódicas já existentes na conta foram preservadas e não foram canceladas nem modificadas.

Foram adicionadas ferramentas locais de leitura e reconciliação:

- `scripts/Get-GoogleGroupsTakeoutManifest.ps1` — entrada PowerShell e criação do diretório de relatório;
- `scripts/get_google_groups_takeout_manifest.py` — leitura em fluxo dos MBOXs, SHA-256, deduplicação e reconciliação, usando apenas a biblioteca padrão;
- `tests/test_google_groups_takeout_manifest.py` — teste sintético de seleção de grupo, duplicação e diferenças entre fontes.

## Inventário histórico já existente

Uma POC anterior pesquisou referências a `informatica@enging.pt` e `glpi@enging.pt` nas caixas Gmail dos quatro membros atuais.

| Medida | Total |
|---|---:|
| Cópias encontradas nas caixas dos membros | 29.409 |
| Cópias repetidas removidas por RFC 822 `Message-ID` | 8.919 |
| Candidatos únicos | 20.490 |
| Mensagens confirmadas como pertencentes ao grupo | 19.953 |
| Confirmadas diretamente por headers do grupo | 19.873 |
| Recuperadas por análise secundária de headers | 80 |
| Candidatos ainda não confirmados | 537 |
| Mensagens sem `Message-ID` no inventário | 0 |

Período das 19.953 mensagens confirmadas:

- mais antiga: `2018-06-15T16:12:15Z`;
- mais recente: `2026-08-25T09:26:23Z`;
- anteriores a `2026-08-25T00:00:00Z`: 19.952;
- no dia 25/08/2026 ou depois: 1.

Distribuição das mensagens confirmadas pelas caixas atuais:

| Quantas caixas possuíam a mensagem | Mensagens únicas |
|---:|---:|
| 1 | 13.479 |
| 2 | 4.303 |
| 3 | 1.967 |
| 4 | 204 |

O facto de 13.479 mensagens existirem em apenas uma das quatro caixas atuais demonstra que a união das caixas dos membros não é uma fonte canônica. Ela não contém necessariamente mensagens de antigos membros, mensagens apagadas por todos os membros atuais ou mensagens enviadas quando a entrega individual estava desativada.

## POC Google já existente

Existe a conta de staging `migracao.informatica@enging.pt`, criada em 26/08/2026. Ela está ativa e contém exatamente uma mensagem inserida pela POC.

O round-trip dessa mensagem foi verificado em modo somente leitura:

- `Message-ID`, data, From, To, Cc, Reply-To e assunto foram preservados;
- o hash do corpo da mensagem foi preservado;
- o MIME bruto ganhou aproximadamente 120 bytes, portanto o hash do arquivo bruto mudou;
- a mensagem testada não tinha anexos, logo anexos ainda não foram validados.

Conclusão: o Gmail preservou as propriedades essenciais nesse exemplo, mas o piloto precisa incluir mensagens com anexos, conteúdo HTML, caracteres não ASCII e tamanhos variados.

## Estado da caixa partilhada no M365

| Propriedade | Valor |
|---|---|
| Display name | `Enging - Informatica` |
| Endereço principal | `informatica@enging.pt` |
| Alias adicional | `informatica@dynamox.net` |
| Tipo | `SharedMailbox` |
| Exchange GUID | `c207a7d9-b842-43c9-b708-ab03c22c9e03` |
| Criada | 25/08/2026 |
| Itens totais | 21 |
| Itens na Inbox | 16 |
| Tamanho atual | aproximadamente 6,23 MB |
| Quota máxima | 50 GB |
| Archive mailbox | Não habilitada |
| Litigation Hold | Desabilitado |
| Migração associada | Nenhuma |

A caixa já contém dados de produção. Uma importação direta sem corte temporal e sem reconciliação pode duplicar mensagens que chegaram durante a transição.

## Avaliação dos métodos

### 1. Google Vault → PST → Microsoft Purview

Seria o caminho mais direto e auditável porque o Vault exporta mensagens de Groups em PST ou mbox, com metadados, contagens e checksums. Entretanto, a API respondeu `Customer does not have Vault installed`; portanto, esse método não está disponível atualmente.

### 2. Google Takeout/Data Export → reconciliação → staging Gmail → Exchange

Método recomendado para este domínio.

`andre.gabry@enging.pt` é owner do grupo e super-administrador. A exportação de dados do Google Groups para um owner inclui threads e mensagens arquivadas, além de metadados do grupo. A exportação não altera nem remove dados do Google.

Depois da exportação:

1. preservar os arquivos originais e gerar SHA-256;
2. extrair `Message-ID`, data, From, To, Cc, corpo e hashes dos anexos;
3. comparar com as 19.953 mensagens confirmadas e com as 537 pendentes;
4. usar a cópia do arquivo do grupo como fonte preferencial;
5. usar cópias das caixas dos membros apenas para preencher lacunas confirmadas;
6. inserir o conjunto final numa conta Gmail de staging;
7. migrar a staging para uma mailbox M365 por meio do endpoint Gmail já existente.

Esse caminho evita conversores MBOX→PST de terceiros e reutiliza a autenticação de conta de serviço já configurada.

### 3. Reconstrução apenas pelas caixas dos membros

É tecnicamente possível e a POC já encontrou 19.953 mensagens confirmadas, mas é um método de melhor esforço. Não permite afirmar que não houve perda, pois depende de quatro caixas atuais e ainda possui 537 itens pendentes. Só deve ser usado se o arquivo do grupo não puder ser exportado, com aceitação formal dessa limitação.

### 4. Migração Gmail direta usando o endereço do grupo

Não é válida. `informatica@enging.pt` é um objeto Google Group, não uma conta Gmail. O endpoint não pode impersonar o grupo e tende a devolver `unauthorized_client` ou erro de serviço Gmail não habilitado.

## Controle de duplicação

O conjunto final deve obedecer às seguintes regras:

1. Chave primária: RFC 822 `Message-ID`, normalizado para comparação sem diferenciar maiúsculas e minúsculas.
2. Confirmação de conteúdo: hash do corpo e hashes individuais dos anexos.
3. Conflito: mesmo `Message-ID` com conteúdo ou anexos diferentes deve ir para revisão, nunca ser descartado automaticamente.
4. Precedência de origem:
   - arquivo canônico do Google Group;
   - cópia de membro com headers completos do grupo;
   - cópia de membro confirmada por headers secundários;
   - revisão manual.
5. A staging deve manter um manifesto com source user, source Gmail ID, destination Gmail ID, `Message-ID`, hash, tamanho e resultado.
6. Antes de inserir uma mensagem, consultar a staging pelo `Message-ID`; o processo deve ser idempotente.

Para o corte inicial, usar:

```text
Date < 2026-08-25T00:00:00Z
```

Isso produz, no inventário atual, 19.952 mensagens históricas e exclui a única mensagem encontrada em 25/08/2026, que pertence à janela de transição e deve ser comparada manualmente com a caixa M365.

## Desenho seguro do piloto

### Fase A — validação sem tocar na caixa final

1. Confirmar que `Conversation history` está habilitado e registrar a configuração atual do grupo.
2. Solicitar pelo Google Takeout apenas os dados de Google Groups do owner `andre.gabry@enging.pt`. Se Takeout estiver bloqueado, usar o Data Export administrativo limitado ao serviço Groups.
3. Preservar os arquivos exportados sem modificação e gerar SHA-256.
4. Reconciliar a exportação com os manifestos existentes.
5. Resolver os 537 candidatos pendentes ou documentar explicitamente cada exclusão.
6. Selecionar aproximadamente 50 mensagens representativas:
   - mais antigas e mais recentes antes do corte;
   - mensagens do alias `glpi@enging.pt`;
   - mensagens com anexos;
   - HTML e texto simples;
   - caracteres não ASCII;
   - mensagens grandes e pequenas.
7. Limpar de forma controlada a única mensagem da staging atual, ou criar uma staging nova e vazia.
8. Inserir somente a amostra na staging com manifesto e hashes.
9. Criar uma mailbox partilhada temporária no M365, sem endereço de produção e oculta da lista de endereços.
10. Criar um lote de migração dedicado, mapeando a staging Google para a mailbox temporária, com Calendar, Contacts, Rules e Delegates ignorados.
11. Validar contagem, datas, headers, corpo, anexos, caracteres e itens ignorados.

### Fase B — carga completa na caixa final

Somente depois da aprovação da Fase A:

1. inserir na mesma staging o restante do conjunto canônico, sem duplicar a amostra;
2. confirmar que a staging contém exatamente o total esperado;
3. criar um lote separado para `informatica@enging.pt`, usando como Username a staging Google;
4. não concluir nem remover o lote até terminar a validação;
5. comparar total esperado, sincronizado, skipped items e tamanho;
6. fazer amostragem por ano, anexos, alias e remetentes;
7. preservar origem, exportação e staging durante pelo menos 30 dias após a aceitação.

## Critérios de aprovação

O piloto só deve ser aprovado quando:

- a exportação do arquivo do grupo estiver preservada com checksums;
- não houver conflito de `Message-ID` não resolvido;
- todas as mensagens da amostra estiverem presentes uma única vez;
- datas, remetentes, destinatários, assunto e corpo estiverem preservados;
- anexos tiverem nomes, tamanhos e hashes equivalentes;
- não houver item maior que 150 MB sem plano alternativo;
- o lote não apresentar skipped/corrupted items não explicados;
- nenhuma mensagem posterior ao corte tiver sido importada;
- o tamanho final permanecer dentro da quota de 50 GB ou houver licença/archive planejados.

## Riscos e proteções

| Risco | Proteção |
|---|---|
| Arquivo do grupo incompleto porque o histórico esteve desligado | Comparar Takeout/Data Export com a união das caixas dos membros |
| Mensagens duplicadas | Corte temporal, `Message-ID`, hashes e manifesto idempotente |
| Perda de anexos | Amostra obrigatória com anexos e comparação de hash |
| Importação na caixa errada | Validar Primary SMTP e Exchange GUID antes de criar o lote |
| Contaminação da caixa final durante a POC | Usar primeiro uma mailbox M365 temporária |
| Estouro da quota de 50 GB | Calcular tamanho MIME total antes da carga completa |
| Reexecução do mesmo lote | Não recriar o conjunto; usar a mesma staging e o mesmo manifesto |
| Impossibilidade de rollback | Preservar origem e testar fora da caixa final antes da carga completa |

## Artefatos existentes

Os seguintes arquivos foram preservados sem alteração em `/Users/andregabry/Projects/m365`:

- `informatica-dedup.csv` — 20.490 candidatos únicos;
- `informatica-final-manifest.csv` — 19.953 mensagens confirmadas;
- `informatica-suspect-remaining.csv` — 537 itens pendentes;
- `informatica-test-import.json` e `informatica-test-message.eml` — auditoria da POC de uma mensagem.

## Cobertura da exportação Google

O Google Admin lista 22 grupos no domínio, mas a conta administrativa `andre.gabry@enging.pt` aparece em apenas 4 grupos na página pessoal **Os meus grupos**. Assim, o Takeout individual não é considerado uma fonte canônica suficiente para todos os grupos do domínio.

Com autorização expressa do administrador, foi iniciada em `26/08/2026 16:22` a exportação administrativa `Google Groups - Todos - 2026-08-26`, com escopo **Todos os utilizadores** e **Todos os serviços**. O estado inicial foi `Agendada`. Esse arquivo será a fonte de maior cobertura; o Takeout individual continuará útil como fonte adicional de conferência para `informatica@enging.pt` e demais grupos presentes na conta administrativa.

Como a exportação administrativa abrange todos os serviços da organização, ela deve ser protegida como um conjunto de dados confidenciais. A análise usará somente os arquivos necessários para Google Groups; não haverá ingestão automática do restante do conteúdo.

## Referências oficiais

- Google: [Exportar dados do Google Groups](https://support.google.com/groups/answer/9975859)
- Google: [Ativar ou desativar o histórico de conversas](https://support.google.com/a/users/answer/6103429)
- Google: [Exportar os dados da organização](https://support.google.com/a/answer/14339894)
- Google: [Dados de Groups suportados pelo Vault](https://support.google.com/vault/answer/6127699)
- Google: [Conteúdo das exportações do Vault](https://support.google.com/vault/answer/6099459)
- Google: [Groups Migration API — fluxo é para importar mensagens para Google Groups](https://developers.google.com/workspace/admin/groups-migration/v1/guides/overview)
- Microsoft: [Visão geral da importação de PST](https://learn.microsoft.com/en-us/purview/pst-import-overview)
- Microsoft: [FAQ de importação PST e comportamento de duplicados](https://learn.microsoft.com/en-us/purview/pst-import-faq)
- Microsoft: [Migração Google Workspace por PowerShell](https://learn.microsoft.com/en-us/exchange/mailbox-migration/perform-gspace-migration-powershell)
