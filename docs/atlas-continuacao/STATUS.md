# Painel de tarefas

Marque `[x]` quando a tarefa estiver **feita e validada** (`bash docs/atlas-continuacao/validar.sh` verde). Pegue sempre a primeira tarefa livre cujas dependências já estejam marcadas. Tarefas novas (T15 em diante) entram no fim, com um cartão em `tarefas/`.

| Feito | ID | Tarefa | Quem faz | Depende de | Estimativa | Cartão |
|---|---|---|---|---|---|---|
| [ ] | T00 | Fechar o PR #14 (CI verde e merge) | você | — | 15 min | [T00](tarefas/T00-fechar-pr-14.md) |
| [ ] | T01 | Ligar a telemetria (Neon, deploy, flag) | você + chat | T00 | 1 h | [T01](tarefas/T01-ligar-telemetria.md) |
| [ ] | T02 | Script que aplica um lote assinado (fichas) | chat | T00 | 4 h | [T02](tarefas/T02-aplicar-lote.md) |
| [ ] | T03 | Script que aplica os casos de quiz aprovados | chat | T02 | 2 h | [T03](tarefas/T03-aplicar-quiz.md) |
| [ ] | T04 | Receber o checklist assinado e publicar o lote (repetir por lote) | você + chat | T02/T03 + conselho | 1 h/lote | [T04](tarefas/T04-receber-checklist.md) |
| [ ] | T05 | Acessibilidade das telas novas (axe) | chat | T00 | 3 h | [T05](tarefas/T05-acessibilidade-telas-novas.md) |
| [ ] | T06 | Celular: Fixar, Compartilhar e Continuar visíveis | chat | T00 | 3 h | [T06](tarefas/T06-celular-fixar-compartilhar.md) |
| [ ] | T07 | Boot em Fast 3G abaixo de 12 s (medir antes) | chat | T00 | 6 h | [T07](tarefas/T07-boot-fast-3g.md) |
| [ ] | T08 | Aviso "Nova versão disponível" (Service Worker) | chat | T00 | 4 h | [T08](tarefas/T08-aviso-nova-versao.md) |
| [ ] | T09 | Plataforma: Chart.js sem CDN | chat | T00 | 3 h | [T09](tarefas/T09-plataforma-sem-cdn.md) |
| [ ] | T10 | Estruturas do fígado e outras sem ficha própria | chat + você | T00 | 4 h | [T10](tarefas/T10-fichas-sem-sid-proprio.md) |
| [ ] | T11 | "Conexões principais" no sistema nervoso | chat | T00 | 2 h | [T11](tarefas/T11-conexoes-sistema-nervoso.md) |
| [ ] | T12 | (Opcional) Revisão técnica prévia do lote 3 | Claude Code | — | 6 h | [T12](tarefas/T12-revisao-tecnica-lote-3.md) |
| [ ] | T13 | Teste de papel da visão sistêmica | você | — | 1 h | [T13](tarefas/T13-teste-papel-visao-sistemica.md) |
| [ ] | T14 | Aparelho real, NVDA, 3 alunos e post-mortem | você | T00 (T05–T08) | 1 dia | [T14](tarefas/T14-aparelho-real-e-fechamento.md) |

## Itens que só o conselho ou você resolvem (não são código)
- [ ] Enviar os 4 pacotes (lotes 1, 2, 3 e quiz 4a) ao conselho e acompanhar o prazo de 3 dias por lote.
- [ ] Nomear os 3 revisores titulares e registrar a assinatura da coordenação (`docs/atlas-conteudo/guia-revisao.md`, "Conselho plural").
- [ ] Confirmar os CIDs D68.5, G70.8 e D68.4/D68.3, os músculos papilares do ventrículo direito e a obra `airton` (`docs/atlas-conteudo/guia-revisao.md`, "Itens que só o conselho decide").
