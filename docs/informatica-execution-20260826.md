# Execução do piloto — informatica@enging.pt

Data: 26/08/2026  
Administrador Google: `andre.gabry@enging.pt`  
Destino final: `informatica@enging.pt` (shared mailbox M365)

## Estado atual

1. Histórico da conversa confirmado como **ATIVADO** na configuração do Google Group.
2. Exportação Google Takeout iniciada às 13:21, somente para o produto **Grupos do Google**.
3. Frequência configurada como execução única, ZIP em partes de até 2 GB e entrega por link enviado por email.
4. O Google está preparando a exportação e informa que o processamento pode levar horas ou dias.
5. Nenhuma mensagem foi adicionada, removida ou alterada na caixa final M365.
6. As 11 exportações agendadas que já existiam na conta foram mantidas sem alteração.

## Exportação administrativa da organização

Depois de confirmar que a conta `andre.gabry@enging.pt` participa diretamente de apenas 4 dos 22 grupos listados no Google Admin, foi solicitada uma exportação administrativa para cobrir também os grupos sem essa conta como membro ou proprietário.

- nome da exportação: `Google Groups - Todos - 2026-08-26`;
- criada por: `andre.gabry@enging.pt`;
- início apresentado pelo Google Admin: `26/08/2026 16:22`;
- estado inicial: `Agendada`;
- utilizadores: **Todos os utilizadores**;
- serviços: **Todos os serviços**;
- autorização: o administrador confirmou expressamente o escopo completo antes do envio.

O Google Admin não ofereceu, nesse fluxo, um filtro limitado apenas ao Google Groups. Por isso, esta exportação contém dados de todos os serviços e utilizadores da organização. Os arquivos devem ser tratados como dados altamente confidenciais, mantidos com acesso restrito e usados apenas para localizar e preservar os históricos dos grupos. A exportação individual do Takeout iniciada às 13:21 permanece separada e não foi cancelada.

Nenhum lote, mensagem ou configuração do M365 foi alterado durante a solicitação da exportação administrativa. O Google informa no fluxo administrativo que uma exportação completa só pode ser iniciada uma vez a cada 30 dias; portanto, esta solicitação não deve ser cancelada.

## Controles antes da migração

- baixar todas as partes geradas pelo mesmo pedido;
- validar a integridade ZIP e registrar SHA-256;
- isolar apenas o MBOX de `informatica@enging.pt`;
- comparar o arquivo canônico com `/Users/andregabry/Projects/m365/informatica-final-manifest.csv`;
- revisar diferenças e conflitos de `Message-ID`;
- aplicar o corte `2026-08-25T00:00:00Z`;
- testar uma amostra representativa numa shared mailbox temporária;
- somente depois do aceite criar o lote para a caixa final.

## Comando de reconciliação preparado

```powershell
pwsh ./scripts/Get-GoogleGroupsTakeoutManifest.ps1 `
  -TakeoutPath ./exports/informatica/takeout-*.zip `
  -Group 'informatica@enging.pt' `
  -ExistingManifest '/Users/andregabry/Projects/m365/informatica-final-manifest.csv' `
  -CutoffUtc '2026-08-25T00:00:00Z'
```

O comando é somente leitura para os arquivos Takeout. Os relatórios gerados ficam em `reports/`, pasta ignorada pelo Git por conter dados administrativos.
