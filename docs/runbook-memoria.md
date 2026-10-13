# Runbook: ativar a memória de estudo (passos do DONO)

Pré-requisito: PR da Operação LAIFT Agêntica mesclada e publicada. Arquitetura e limites: `docs/agentic-layer.md`. Faça tudo **primeiro em staging** (projeto Neon próprio, `--env staging` nos secrets) e só depois em produção, com **backup Neon antes** de aplicar migrações no núcleo.

Nada deste runbook é feito pelo código: criar o projeto, definir a senha e cadastrar os secrets são ações suas. Segredos **nunca** entram em arquivo do repositório nem em conversa.

## 0. Ordem resumida

1. Aplicar **035** e **036** no núcleo.
2. Criar o projeto Neon **laift-memory** e aplicar `sql/memory/001_memory.sql`.
3. Definir a **senha** do papel `laift_memory_worker` (por SQL).
4. Cadastrar os secrets `DATABASE_URL_MEMORY` e `MEMORY_SUBJECT_KEY`.
5. Ligar as flags, nesta ordem: `agents_enabled` + `agents_tutor_enabled` (só admin) -> testar o tutor -> `memory_enabled` (só admin) -> testar a memória -> ampliar.
6. Antes de qualquer membro: aprovar o texto de consentimento e atualizar a Política de Privacidade (seção 8).

## 1. Núcleo: migrações 035 e 036

As migrações do núcleo (`sql/NNN_*.sql`) são aplicadas pelo CI no deploy (`tools/db/migrate.mjs`, ledger `schema_migrations`) ou à mão:

```bash
DATABASE_URL='<URL DIRETA do núcleo, papel dono>' node tools/db/migrate.mjs --dry-run   # lista o que falta
DATABASE_URL='<URL DIRETA do núcleo, papel dono>' node tools/db/migrate.mjs
```

- **035** (`agents_core`): flags (todas desligadas), `agent_traces`. **036** (`memory_consent`): `member_memory_consent`, `memory_purge_queue` e o gatilho `AFTER DELETE ON profiles`.
- Esse migrador **nunca** lê `sql/memory/` (é subpasta): o banco de memória não é tocado pelo deploy.
- Reversão (só à mão, com `memory_enabled` desligada e a fila drenada): `sql/down/036_memory_consent.sql`, depois `sql/down/035_agents_core.sql`.

## 2. Criar o banco laift-memory e aplicar `sql/memory/001`

1. No console do Neon, crie o projeto **laift-memory** (e, para staging, **laift-memory-staging**), na mesma região do núcleo. Deixe o *scale to zero* ligado (é o que mantém o custo baixo).
2. Pegue a URL **direta** (sem `-pooler`) do **dono do esquema** desse projeto (o papel criado com o projeto). Essa URL só serve para migrar; o Worker **não** a usa.
3. Aplique, com o ledger próprio (`memory_schema_migrations`):

```bash
DATABASE_URL='<URL do DONO do laift-memory>' node tools/db/migrate.mjs --memory --dry-run
DATABASE_URL='<URL do DONO do laift-memory>' node tools/db/migrate.mjs --memory
```

O arquivo cria a extensão `vector` (sem uso), a tabela `memory_items` com RLS forçada, o gatilho do teto de 60 itens e **o papel `laift_memory_worker` por SQL** (sem senha, sem `BYPASSRLS`, sem DDL). Não crie esse papel pelo console do Neon (ele viraria `neon_superuser` e ignoraria a RLS).

Confira (como dono):

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname = 'laift_memory_worker';
-- esperado: f, f, f, f, t
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'memory_items';  -- t, t
```

> O PGlite dos testes não traz o pgvector; a sintaxe `CREATE EXTENSION IF NOT EXISTS vector` é conferida aqui, no Neon, no passo de staging. Se o seu plano não permitir a extensão, apague essa linha do arquivo **antes** de aplicar em produção (nada a usa) e avise: o arquivo não pode mudar depois de aplicado (drift).

## 3. Definir a senha do papel (por SQL, você)

No SQL Editor do Neon (ou `psql`) **como dono do laift-memory**:

```sql
ALTER ROLE laift_memory_worker PASSWORD '<senha forte e única, gerada por você>';
```

Teste de que o papel NÃO faz o que não deve (conecte como `laift_memory_worker`):

```sql
SELECT count(*) FROM memory_items;     -- 0 (sem app.subject_id nada é visível)
CREATE TABLE zz (id int);              -- ERRO: permission denied
```

A URL do Worker fica: `postgresql://laift_memory_worker:<senha>@<host-do-endpoint>/<banco>?sslmode=require`.

## 4. Secrets do Worker

```bash
cd worker
npx wrangler secret put DATABASE_URL_MEMORY          # cole a URL do passo 3 (papel laift_memory_worker)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # gera a chave
npx wrangler secret put MEMORY_SUBJECT_KEY           # cole a chave gerada (mín. 32 caracteres)
# staging: acrescente --env staging nos dois, com valores DIFERENTES dos de produção
```

- Guarde a `MEMORY_SUBJECT_KEY` no seu cofre. **Não a troque depois de ligar a memória**: trocar a chave muda todos os pseudônimos e deixa a memória existente órfã (a varredura diária a apaga; na prática é um reset).
- Sem os dois secrets o tutor funciona normal, a tela mostra "memória indisponível" e o cron não toca no banco de memória.

## 5. Flags (Admin > flags, ou `apiAdminSetFeatureFlag`)

Todas nascem desligadas. Sequência recomendada, **cada passo só depois de o anterior funcionar**:

1. `agents_enabled` e `agents_tutor_enabled` com `conditions: { "role": "admin" }`. Teste o Tutor na aba Aprender (sem memória).
2. `memory_enabled` com `conditions: { "role": "admin" }`. Teste (como admin):
   - ativar a memória no Perfil (aceitar o termo);
   - fazer uma pergunta com tema do vocabulário ao tutor ("explique meia-vida") e, depois de uns 5 minutos, outra: o selo "usou sua memória de estudo" aparece quando há itens;
   - ver, exportar, apagar um item, apagar tudo, desativar;
   - `apiAdminMemoryStats` mostra `configured: true`, os totais e `purgeQueue.pending: 0`.
3. Só depois: remover a condição de papel e usar `rollout_pct` para ampliar (membros).

## 6. Verificações depois de ligar

| O quê | Como | Esperado |
|---|---|---|
| Fila de exclusão | `apiAdminMemoryStats` -> `purgeQueue` (ou `SELECT * FROM memory_purge_queue` no núcleo) | `pending` 0; se `oldestHours` > 24, há falha de limpeza: veja `last_error_code` |
| Erros | `error_logs`, códigos `MEMORY_DB_FAILED`, `MAINTENANCE_FAILED` | poucos/nenhum |
| Custo | Neon > projeto laift-memory > consumo | alerta manual a **70 CU-h**/mês; o banco deve ficar suspenso quase todo o tempo |
| Exclusão de conta | `DELETE FROM profiles WHERE id = '<id>'` (como hoje) e, no dia seguinte, `memory_purge_queue` vazia | fila esvaziada pelo cron |
| Agentes | `apiAdminAgentsStats` | chamadas, tokens, latência e `memoryUsedCalls` |

## 7. Rollback

1. Desligue `memory_enabled` (vale em até 60 s). O tutor segue sem memória; **apagar/revogar e a limpeza do cron continuam funcionando**.
2. Para parar de tocar no banco de memória: apague o secret `DATABASE_URL_MEMORY` (`npx wrangler secret delete DATABASE_URL_MEMORY`). A fila de exclusão fica esperando.
3. Para apagar tudo: `sql/memory/down/001_memory.sql` (como dono) e, depois, `DROP OWNED BY laift_memory_worker; DROP ROLE laift_memory_worker;`. Ou apague o projeto Neon.
4. Núcleo: `sql/down/036_memory_consent.sql` (apaga consentimentos e fila: antes, drene a fila).

## 8. Antes de abrir para membros (jurídico)

- Aprove o texto do consentimento e as seções 5 e 7 da Política em `docs/memoria-consentimento-RASCUNHO.md`.
- Atualize `docs/POLITICA_DE_PRIVACIDADE.md` e `LEGAL_VERSIONS.PRIVACY` (`worker/src/constants.js`) **juntos** (e o texto fixo em `frontend/index.html`).
- Se mudar a finalidade/texto do consentimento depois, aumente `MEMORY.PURPOSE_VERSION`: todos terão que aceitar de novo.

## 9. Backup

O backup do Neon (`tools/backup`) cobre o núcleo. A memória é **derivada** (níveis e preferências reconstruíveis) e pequena; perdê-la significa recomeçar. Se quiser cópia, faça `pg_dump` manual do projeto laift-memory, guardando-a com o mesmo cuidado (embora pseudonimizada, é dado pessoal).

## 10. Trocar a senha do papel

`ALTER ROLE laift_memory_worker PASSWORD '<nova>';` e, em seguida, `npx wrangler secret put DATABASE_URL_MEMORY` com a URL nova. Enquanto isso, a memória fica indisponível (o tutor segue sem ela).
