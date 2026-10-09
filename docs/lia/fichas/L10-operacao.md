# L10: Operação: limpeza do registro no cron e guia de ativação das flags novas

**Objetivo.** (1) Apagar todo dia as linhas vencidas de `lia_pesquisas` (retenção LGPD do registro). (2) Documentar para o dono como reindexar, aplicar a 026 e ligar as três flags novas na ordem segura.

**Passo 0.** Leia:
- `worker/src/maintenance.js`: cabeçalho (lista das limpezas), `assistantRetentionTasks` e `runMaintenance` (linha 195, tarefas isoladas);
- `worker/test/maintenance.test.js` e `worker/test/maintenanceAssistantRetention.test.js`;
- `worker/src/services/researchLogService.js` (de L04: `purgeExpired`);
- `docs/AMBIENTES.md` (seções "Ligar e desligar recursos" e "Ativação da UX v2, Lia viva, RAG…", §2 a §5);
- `docs/lia/PLANO.md` §0, §4 e §5.

**Arquivos-donos.** `worker/src/maintenance.js`, `worker/test/maintenance.test.js` e `docs/AMBIENTES.md`.

**Requisitos.**
1. `maintenance.js`:
   - nova tarefa `liaResearchPurge: () => ResearchLog.purgeExpired(sql)`, no mesmo formato isolado das outras (uma falha não derruba as demais; tabela ausente devolve 0);
   - acrescente uma linha ao comentário de cabeçalho.
2. Teste: a tarefa existe, devolve a contagem e, com `purgeExpired` falhando, as outras tarefas seguem. Ajuste a lista esperada de tarefas, se o teste a fixar.
3. `docs/AMBIENTES.md`: nova subseção **"Lia: registro, seleção e pesquisa externa (2026-10)"**, no estilo de lista de verificação, com comandos copiáveis:
   - **Antes de tudo:** conferir `rag_enabled` (condição de papel ou `rollout_pct` < 100 impede o cron de reindexar, porque avalia sem identidade); reindexar pelo painel e conferir `embeddingAvailable`;
   - **Migração 026:** simulação com `node tools/db/migrate.mjs --dry-run` (só a 026 pode aparecer), depois aplicar; reversão por `sql/down/026_lia_pesquisas.sql`;
   - **Flags**, uma de cada vez, com o que observar no painel de IA e em `error_logs`:
     - `rag_cache_enabled` primeiro;
     - `rag_rerank_enabled` só depois da calibração no staging;
     - `research_enabled` só depois do OK jurídico (Política, seção 5) e com rótulo de teste para admin (`conditions: { role: 'admin' }`) antes de abrir para todos;
   - **Rollback:** desligar a flag pelo painel (grava auditoria); por SQL não grava;
   - **Consulta das lacunas da base** (somente leitura): `SELECT query_norm, hits FROM lia_pesquisas WHERE provider='kb' AND outcome='empty' ORDER BY hits DESC LIMIT 30;`.
4. Não altere as outras seções do `AMBIENTES.md`.

**Aceite (comando).**
```bash
cd "C:/Users/Administrador/Desktop/plataforma membro/worker" && npm test -- -i test/maintenance.test.js test/maintenanceAssistantRetention.test.js test/researchLogService.test.js
```
E: `Select-String -Path docs/AMBIENTES.md -Pattern 'rag_cache_enabled|rag_rerank_enabled|research_enabled|026'` devolve pelo menos 4 linhas.

**Regras.** Sem git, sem banco de produção e sem flag (você só documenta; quem executa é a sessão principal, com o OK do dono). Nenhum segredo nem URL de banco no documento: use `read -rsp` como as seções vizinhas. Cabeçalho de copyright; LF. GateGuard: se o hook pedir fatos, escreva 2 linhas (quem usa: o cron `scheduled` → `runMaintenance`, e o dono, no guia; a instrução: "registrar as pesquisas que a Lia fizer", com retenção LGPD) e repita a mesma chamada.

**Relatório (até 12 linhas).** A tarefa nova, o resultado do aceite, as linhas da subseção nova no `AMBIENTES.md` e as pendências.
