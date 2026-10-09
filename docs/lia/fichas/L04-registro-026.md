# L04: Registro de pesquisas da Lia (migração 026 e serviço)

**Objetivo.** Guardar o que a Lia já pesquisou, para não pagar de novo: (a) a resposta com base de conhecimento (provedor `kb`), válida enquanto a versão da base for a mesma; (b) os resultados de bases externas (só metadados). As perguntas da base que ficaram sem resposta (`outcome='empty'`) formam a lista de lacunas para escrever conteúdo. Ninguém usa isto antes de L09 e da flag `rag_cache_enabled`.

**Passo 0.** Leia:
- `sql/018_ai_orchestrator.sql` (`ai_semantic_cache`, índices trigrama) e `sql/020_rag.sql` (estilo, `lock_timeout`, reversão);
- `sql/down/020_rag.sql`, `worker/scripts/validate-migrations.mjs`;
- `worker/src/ai/semanticCache.js` (`normalizeQuestion`, `isCacheable`, `sameMeaning`; reutilize, não copie);
- `worker/src/services/ragService.js` (`sha256Hex`);
- `worker/test/helpers/pgliteSql.js` (`createMigratedDb` aplica `sql/NNN_*.sql` em ordem) e `worker/test/semanticCache.test.js` (padrão de teste).

**Arquivos-donos.** O par `sql/026_lia_pesquisas.sql` + `sql/down/026_lia_pesquisas.sql`, e o par `worker/src/services/researchLogService.js` + `worker/test/researchLogService.test.js` (todos novos).

**Requisitos: migração (aditiva e idempotente, com cabeçalho igual ao da 020).**
```sql
CREATE TABLE IF NOT EXISTS lia_pesquisas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL,            -- 'kb' | 'europepmc' | 'pubmed' | 'openalex' | 'scielo'
  query_norm TEXT NOT NULL,          -- pergunta/termos normalizados; nunca id de pessoa
  kb_version TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL,             -- 'answered' | 'empty'
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_hit_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);
```
- CHECK de `provider` e `outcome` nas listas acima; `char_length(query_norm)` de 1 a 300; `kb_version` com até 64 caracteres.
- `UNIQUE (provider, query_norm, kb_version)`; índice GIN `gin_trgm_ops` em `query_norm`; índice em `expires_at`.
- O down faz `DROP TABLE IF EXISTS lia_pesquisas`.
- O comentário de cabeçalho explica a LGPD: sem `profile_id`, só texto que passa por `isCacheable`, retenção pela validade e limpeza no cron (L10).

**Requisitos: `researchLogService.js`.** Funções puras e tolerantes a falha: tabela ausente ou erro de banco viram `null`/`false`/`0`, nunca exceção.
- Constantes locais: `RESEARCH_LOG = { PROVIDERS, TTL_DAYS: { kb: 30, external: 7 }, SIMILARITY: 0.9, ITEMS_MAX: 10, REPLY_MAX: 4000, SOURCES_MAX: 4, ALLOWED_HOSTS: ['europepmc.org','www.ebi.ac.uk','pubmed.ncbi.nlm.nih.gov','doi.org','www.scielo.br','scielo.org','openalex.org'] }`.
- `kbVersion(documents)`: `sha256Hex` de `source|section|content` ordenados; devolve os 16 primeiros hexadecimais.
- `sanitizeResults(provider, results)`:
  - para `kb`: `{ reply ≤ 4000, sources: [{ source ≤ 100, section ≤ 200 }] ≤ 4 }`;
  - para os externos: `{ items: [{ title ≤ 300, journal ≤ 200, year (inteiro de 1800 a 2100, ou null), url (https e host em ALLOWED_HOSTS; senão o item fica sem url), ids: { pmid /^\d{1,10}$/, pmcid /^PMC\d{1,10}$/, doi ≤ 200 } }] ≤ 10 }`;
  - descarta qualquer outro campo e nunca muta a entrada.
- `lookup(sql, { provider, question, kbVersion = '' })`:
  - recusa se `!isCacheable(question)`;
  - procura primeiro a igualdade exata em `normalizeQuestion`; senão, `query_norm % q` com similaridade ≥ 0,9 e `sameMeaning`;
  - só linhas não vencidas da mesma `provider` e `kb_version`;
  - incrementa `hits` e `last_hit_at`;
  - devolve `{ id, outcome, results, similarity }` ou `null`.
- `record(sql, { provider, question, kbVersion = '', outcome, results })`: valida, sanitiza e faz upsert por `(provider, query_norm, kb_version)` com a validade do TTL (`kb` ou externo). Devolve `true` ou `false`.
- `purgeExpired(sql)`: apaga as linhas vencidas e devolve quantas apagou.

**Teste (PGlite com as migrações reais).**
- A 026 aplica.
- Ida e volta `record` → `lookup`.
- Recusa de pergunta com e-mail, CPF, "meu paciente" e nome próprio.
- Guarda de sentido: "é seguro" × "não é seguro".
- Versão da base diferente não acha.
- Linha vencida não volta, e `purgeExpired` a remove.
- `sanitizeResults` derruba host fora da lista e `http:`, e corta tamanhos.
- Um `sql` que lança faz `lookup` devolver `null` e `record` devolver `false`.

**Aceite (comando).**
```bash
cd "C:/Users/Administrador/Desktop/plataforma membro/worker" && npm run validate:sql && npm test -- -i test/researchLogService.test.js test/semanticCache.test.js
```

**Regras.** Sem git. **Não aplique a 026 em banco nenhum fora do PGlite**: a sessão principal aplica, com o OK do dono. Sem flag; cabeçalho de copyright em `.js` e `.sql`; LF; funções com menos de 50 linhas. GateGuard: se o hook pedir fatos, escreva 2 linhas (quem usa: L07 `researchService`, L09 `assistantService`, L10 `maintenance`; a instrução: "registrar as pesquisas que a Lia fizer, para economizar nas futuras pesquisas") e repita a mesma chamada.

**Relatório (até 12 linhas).** As assinaturas exportadas, os casos de teste e o resultado do aceite.
