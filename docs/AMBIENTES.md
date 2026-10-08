# Ambientes e como uma mudança chega ao laift.com.br

Dois ambientes, cada um com **site, API e banco próprios**. Nada de staging toca em dado de produção.

| | Produção | Homologação (staging) |
|---|---|---|
| Site | `https://laift.com.br` (Worker `laift-web`) | `https://staging.laift.com.br` (Worker `laift-web-staging`) |
| API | `https://api.laift.com.br` (Worker `plataforma-membros-api`) | `https://staging-api.laift.com.br` (Worker `plataforma-membros-api-staging`) |
| Banco (Neon) | projeto `plataforma-membros` | projeto `laift-staging`, **sem cópia de dados reais** |
| Branch | `main` | `staging` |
| E-mail (Brevo) | ligado | **desligado** (não há `BREVO_API_KEY`) |
| Cron, KV, R2 | sim | não (cache vira no-op; upload de avatar não funciona) |
| Segredos | `wrangler secret put <NOME>` | `wrangler secret put <NOME> --env staging`, valores **diferentes** (ex.: `SESSION_TOKEN_PEPPER`) |
| Indexação | sim | `noindex` |

## O caminho de uma mudança

```
branch de trabalho ──PR──▶ staging ──(publica sozinho)──▶ teste em staging.laift.com.br
                                                              │ aprovado
                                       PR staging ▶ main ◀────┘   (você mescla)
                                              │
                                              ▼  push na main = publica sozinho
                                       laift.com.br (site + API)
```

1. **Trabalhar** numa branch `feat/...` e abrir PR **para `staging`**. O CI roda os testes.
2. **Mesclar em `staging`**: o GitHub publica sozinho a API de staging (migrando o banco de staging) e o site de staging, e roda o teste de fumaça (`tools/ci/smoke.mjs`).
3. **Testar** em `https://staging.laift.com.br` (fluxos novos; e-mail não sai de lá).
4. **O "botão"**: abrir a PR `staging → main` e mesclar. O push na `main` publica sozinho:
   - a API (`deploy-worker.yml`, com testes antes);
   - o site (`deploy-frontend-cloudflare.yml`, com testes unitários e e2e `csp`/`smoke` antes e o teste de fumaça depois).

   Para republicar sem mudar código: aba **Actions → workflow → Run workflow**, com "Use workflow from" = `main` (produção) ou `staging`. Outras branches são recusadas.
5. Se quiser uma **aprovação extra** antes de produção: Settings → Environments → `production` → *Required reviewers*. O deploy passa a esperar o seu "Approve".

O que **bloqueia** a publicação do site: teste unitário ou e2e (`csp`, `smoke`) vermelho. Por exemplo, um `<script>` externo no `index.html` que a CSP não liberou.

## Migrações do banco

`tools/db/migrate.mjs` aplica `sql/NNN_*.sql` em ordem numérica e guarda o que foi feito na tabela `schema_migrations`. Rodar de novo não faz nada; se um arquivo já aplicado for editado, ele **aborta** (crie uma migração nova).

```bash
# use a URL DIRETA do Neon (não a do pooler)
DATABASE_URL=... node tools/db/migrate.mjs --dry-run                  # só lista
DATABASE_URL=... node tools/db/migrate.mjs --baseline-through 015     # UMA vez, em banco migrado à mão: registra 001–015 sem executar
DATABASE_URL=... node tools/db/migrate.mjs                            # aplica o que falta
```

- **Staging**: o deploy da API migra sozinho **se** existir o segredo `STAGING_DATABASE_URL` no Environment `staging`; sem ele, avisa e segue. Essa migração aplica **tudo** o que estiver pendente, inclusive a 023 (que liga as flags da renovação).
- **Produção**: continua **manual** de propósito. Antes, crie uma branch/snapshot do Neon (a janela de restauração do plano é curta, ~6 h) e rode `--dry-run`.

## Passos manuais, uma única vez (você)

1. Criar a branch: `git push origin main:staging`.
2. GitHub → Settings → Environments → `staging`: adicionar o segredo `STAGING_DATABASE_URL` (URL direta do projeto Neon `laift-staging`). Opcional: restringir à branch `staging`.
3. Rodar o `--baseline-through N` em staging e em produção, com N = a última migração **contígua** já aplicada à mão naquele banco. O `015` era o caso original: confira antes (seção 3 de *Ativação da UX v2, Lia viva, RAG, feedback e moderação*).
4. O token da Cloudflare já usado nos deploys precisa de **Workers Routes: Edit** e **DNS: Edit** na zona `laift.com.br` (staging usa domínio próprio).

## Ligar e desligar recursos (feature flags)

Cada recurso novo nasce **desligado** na tabela `feature_flags` (exceção: as cinco flags da renovação, que a migração 023 liga; ver *Ativação da UX v2, Lia viva, RAG, feedback e moderação*). Para ligar ou desligar, rode no SQL Editor do Neon do ambiente (ou peça pelo painel de administração, que registra em `audit_logs`):

```sql
UPDATE feature_flags SET enabled = TRUE,  rollout_pct = 100, updated_at = now() WHERE key = 'use_orchestrator';  -- IA com orçamento e cache
UPDATE feature_flags SET enabled = TRUE,  rollout_pct = 100, updated_at = now() WHERE key = 'chatbot_enabled';   -- Lia
UPDATE feature_flags SET enabled = FALSE, updated_at = now() WHERE key = 'chatbot_enabled';                      -- desligar
```

A mudança vale em até 60 segundos (cache de flags em cada instância do Worker). `mfa_required` só se liga depois de **dois** administradores cadastrarem o autenticador; `nvidia_fallback`, só com a `NVIDIA_API_KEY` cadastrada.

Segredo do MFA: `powershell -ExecutionPolicy Bypass -File tools\ci\gerar-segredo-mfa.ps1 -Ambiente staging|producao` (gera, cadastra no Worker sem mostrar o valor e deixa uma cópia fora do repositório para o cofre; recusa trocar uma chave que já existe).

## Reverter

- **Site ou API, agora**: Cloudflare → Workers & Pages → o Worker → *Deployments* → **Rollback** para a versão anterior (imediato). Depois, `git revert` do commit na `main` para o repositório refletir o que está no ar.
- **Banco**: cada migração tem reversão em `sql/down/NNN_*.sql` (manual). Se a migração mexeu em dados, restaure a branch/snapshot do Neon criada antes. Os arquivos `down` não apagam a linha de `schema_migrations`: ela precisa sair à mão (seção 5 de *Ativação da UX v2, Lia viva, RAG, feedback e moderação*).
- **Recurso novo com problema**: desligue a feature flag (`apiAdminSetFeatureFlag`); não exige novo deploy.

## Ativação da UX v2, Lia viva, RAG, feedback e moderação

Runbook da entrega única `feat/v5-ux-fundacao`. Quem executa é o dono, em produção, na ordem abaixo. Cada comando foi conferido contra o código. Onde o pedido original não bate com o repositório, o texto segue o repositório e o ponto aparece em **Atenção** ou em *Pendências*.

**Fatos que definem a ordem:**
- A **023** faz `ON CONFLICT (key) DO UPDATE SET enabled = TRUE`: liga as cinco flags e **religa** qualquer uma que tenha sido desligada antes. Por isso ela é a última, e o snapshot da seção 2.4 vem antes.
- O runner (`tools/db/migrate.mjs`) aplica **tudo o que estiver pendente** numa execução e não tem opção para pular arquivo. Para segurar a 023, a seção 2.2 usa uma pasta temporária sem ela (`--dir`).
- Os arquivos `sql/down/` **não** removem a linha de `schema_migrations`.
- **Não existe `sql/024_*`** em nenhum commit ou branch. A próxima numeração livre é a 024 (`docs/TIME_CONTRATO.md`), mas nada foi criado. Este runbook não a aplica.

### 1. Pré-requisitos

- [ ] **Branch de backup no Neon.** No console do Neon, projeto `plataforma-membros`, crie uma branch a partir da principal com o nome gerado abaixo. Ela é o ponto de volta até a seção 4 passar. A janela de restauração do plano é de cerca de 6 h.
  ```bash
  echo "backup-pre-020-024-$(date +%F)"
  ```
- [ ] **Secrets de produção** (só os nomes, nunca os valores). Requer `npx wrangler login` feito.
  ```bash
  cd worker && npx wrangler secret list
  ```
  Esperado: `DATABASE_URL`, `SESSION_TOKEN_PEPPER`, `BREVO_API_KEY`, `GROQ_API_KEYS`, `MFA_ENCRYPTION_KEY`. `NVIDIA_API_KEY` só é preciso se a flag `nvidia_fallback` for ligada.
- [ ] **MFA_ENCRYPTION_KEY.** Se não estiver na lista, gere com o script (ele cadastra no Worker sem mostrar o valor e deixa uma cópia fora do repositório para o cofre). Trocá-la depois invalida o MFA de todos.
  ```powershell
  powershell -ExecutionPolicy Bypass -File tools\ci\gerar-segredo-mfa.ps1 -Ambiente producao
  ```
- [ ] **Chaves de IA.** `GROQ_API_KEYS` está na lista acima. No painel Administração → IA, "Testar chaves agora" deve dar 100%.
- [ ] **Secrets de homologação.**
  ```bash
  cd worker && npx wrangler secret list --env staging
  ```
  Esperado: `DATABASE_URL` e `SESSION_TOKEN_PEPPER`. Sem `BREVO_API_KEY`, de propósito.
- [ ] **Binding Workers AI (`[ai]`).** Em produção o binding `AI` existe e é usado pelo RAG (embeddings `@cf/baai/bge-m3`). Confira:
  ```bash
  grep -n -A1 "^\[.*ai\]" worker/wrangler.toml
  ```
  Esperado: `[ai]` seguido de `binding = "AI"`.
  **Atenção:** hoje **não existe** `[env.staging.ai]`, e o próprio `wrangler.toml` registra que a homologação fica só com trigramas. Se a decisão for ter embeddings em staging, adicione o bloco abaixo numa PR própria e rode o mesmo `grep`. Sem ele, a Lia em staging funciona, só com busca por trigramas.
  ```toml
  [env.staging.ai]
  binding = "AI"
  ```
- [ ] **Testes verdes** (os mesmos do CI).
  ```bash
  cd worker && npm ci && npm test && npm run validate:sql
  ```
  ```bash
  cd frontend && npm ci && npm run e2e
  ```
  `cd frontend && node --test scripts/*.test.mjs` tem **2 falhas conhecidas no Windows** (`_headers`, por causa de CRLF). No CI, em Linux, passam.
- [ ] **Homologação validada.** Branch → PR para `staging`, publicada e testada. Só então a PR `staging → main` (seção "O caminho de uma mudança").

### 2. Ordem segura

Princípio: **código primeiro, banco depois, flags por último.** Com o código no ar e as tabelas ausentes, o recurso fica inativo sem erro, porque flag ausente ou `false` desliga tudo. Verificado no código: `featureFlagService` trata tabela ausente como "tudo desligado"; `submitFeedback` checa `feedback_enabled` antes de tocar na tabela; a busca RAG só roda com `rag_enabled`; `listKbSources` devolve lista vazia sem a tabela.

> **Atenção (banco migrado à mão):** se alguma migração de 016 a 022 foi aplicada no SQL Editor sem registro, faça a **seção 3 antes do passo 2.2**. Sem o baseline, o runner tenta reaplicar essas migrações e para no primeiro erro.

#### 2.1 Publicar Worker e site

- [ ] Mesclar a PR `staging → main`. Disparam três workflows: `deploy-worker.yml` (API), `deploy-frontend-cloudflare.yml` (site `laift-web`) e `deploy-frontend.yml` (GitHub Pages, legado). Espere os três ficarem verdes em **Actions**.
- [ ] A API responde e as flags seguem desligadas.
  ```bash
  curl -s https://api.laift.com.br/v1/ -H 'Content-Type: application/json' -d '{"action":"apiGetFeatureFlags","args":[]}'
  ```
  Esperado: `"success":true`; `ux_v2_enabled` e `chatbot_enabled` `false` ou ausentes; `feedback_enabled` ausente (a chave só existe depois da 023).
- [ ] Sem exceção nova depois do deploy. Acompanhe por alguns minutos e encerre com Ctrl+C.
  ```bash
  cd worker && npx wrangler tail
  ```

#### 2.2 Migrações 020, 021 e 022 (sem a 023)

- [ ] Na raiz do repositório, crie a pasta temporária com tudo menos a 023. Use o mesmo terminal nos passos seguintes, porque a variável `SEM_023` precisa existir.
  ```bash
  SEM_023="$HOME/laift-sem-023" && mkdir -p "$SEM_023" && cp sql/*.sql "$SEM_023"/ && rm "$SEM_023/023_flags_v2.sql" && ls "$SEM_023"
  ```
- [ ] Instale as dependências do runner (uma vez).
  ```bash
  (cd tools/db && npm ci)
  ```
- [ ] Informe a URL **direta** do Neon de produção (não a do pooler), sem gravá-la no histórico.
  ```bash
  read -rsp "URL direta do Neon de PRODUÇÃO: " DATABASE_URL && export DATABASE_URL
  ```
- [ ] Simulação. A primeira linha mostra o host: tem que ser o do projeto `plataforma-membros`, não o de `laift-staging`. Só 020, 021 e 022 podem aparecer.
  ```bash
  node tools/db/migrate.mjs --dir "$SEM_023" --dry-run
  ```
  Esperado: `[dry-run] aplicaria: 020_rag.sql`, `021_assistant_feedback.sql`, `022_assistant_moderation.sql`. Se aparecer qualquer migração de 001 a 019, **pare**: o ledger não bate com o banco (seção 3).
- [ ] Aplique.
  ```bash
  node tools/db/migrate.mjs --dir "$SEM_023"
  ```
  Esperado: `aplicada:` para cada um dos três. Se uma falhar, o runner desfaz esse arquivo e para. Leia a mensagem antes de rodar de novo.
- [ ] Tabelas criadas (Neon → SQL Editor).
  ```sql
  SELECT to_regclass('public.kb_chunks') AS kb, to_regclass('public.assistant_messages') AS mensagens, to_regclass('public.assistant_feedback') AS feedback, to_regclass('public.assistant_moderation') AS moderacao, to_regclass('public.assistant_incidents') AS incidentes;
  ```
  Esperado: as cinco colunas com nome, nenhuma `NULL`.

#### 2.3 Reindexar o acervo da Lia

Ação só de admin. Não há tela para ela no front; a chamada é direta na API.

- [ ] Obtenha o token de sessão de um admin com `apiLogin` (e `apiLoginMfa`, se houver MFA), como em `docs/DEPLOYMENT.md`, seção 8. Informe-o ao terminal sem deixá-lo no histórico.
  ```bash
  read -rsp "Token de sessão do admin: " TOKEN_ADMIN && export TOKEN_ADMIN
  ```
- [ ] Reindexe.
  ```bash
  curl -s https://api.laift.com.br/v1/ -H 'Content-Type: application/json' -d "{\"action\":\"apiAdminReindexKb\",\"args\":[\"$TOKEN_ADMIN\"]}"
  ```
  Esperado: `"success":true` e um `report` com `total`, `embedded` e `embeddingAvailable`. Com `embeddingAvailable` `false`, a Lia usa só trigramas até um novo reindex com o binding funcionando. HTTP 429 é o limite `ASSISTANT_REINDEX_MINUTE`: espere e repita.
- [ ] Confira o acervo.
  ```sql
  SELECT count(*) AS total, count(embedding) AS com_embedding FROM kb_chunks;
  ```
  Esperado: `total` igual a `report.total`; com `embeddingAvailable` `true`, `com_embedding` igual a `total`.

#### 2.4 Ligar as flags: a 023, por último

- [ ] **Snapshot.** A 023 força `enabled = TRUE` nas cinco. Anote o estado atual.
  ```sql
  SELECT key, enabled, rollout_pct FROM feature_flags ORDER BY key;
  ```
- [ ] **Gate.** Sem pasta temporária, o runner aplicaria só o que falta. Como 020–022 já estão no ledger, deve listar **apenas** a 023.
  ```bash
  node tools/db/migrate.mjs --dry-run
  ```
  Esperado: `[dry-run] aplicaria: 023_flags_v2.sql` e nada mais. Se listar outro arquivo, pare.
- [ ] Aplique a 023.
  ```bash
  node tools/db/migrate.mjs
  ```
  Esperado: `aplicada: 023_flags_v2.sql`.
- [ ] Confira as cinco flags. A mudança vale em até 60 s, pelo cache.
  ```sql
  SELECT key, enabled, rollout_pct FROM feature_flags WHERE key IN ('ux_v2_enabled', 'chatbot_enabled', 'rag_enabled', 'feedback_enabled', 'moderation_enabled') ORDER BY key;
  ```
  Esperado: cinco linhas com `enabled` = `true`.
- [ ] Se o snapshot mostrou uma flag desligada que deve continuar desligada, desligue **agora**, pela API (grava em `audit_logs`). Exemplo com `chatbot_enabled`.
  ```bash
  curl -s https://api.laift.com.br/v1/ -H 'Content-Type: application/json' -d "{\"action\":\"apiAdminSetFeatureFlag\",\"args\":[\"$TOKEN_ADMIN\",\"chatbot_enabled\",{\"enabled\":false}]}"
  ```

### 3. Banco migrado à mão (SQL Editor): baseline

Use esta seção quando alguma migração de 016 a 022 foi aplicada no SQL Editor sem registro no ledger. A produção segue `docs/DEPLOYMENT.md`, seção 1, então este é o caso típico.

- [ ] Veja se o ledger existe e o que ele tem.
  ```sql
  SELECT to_regclass('public.schema_migrations') AS ledger;
  ```
  Se não for `NULL`:
  ```sql
  SELECT name, applied_at FROM schema_migrations ORDER BY name;
  ```
- [ ] Descubra até onde o banco chegou, pelas evidências. Coluna não nula, ou `m019` igual a `1`, indica que a migração está no banco.
  ```sql
  SELECT to_regclass('public.feature_flags') AS m016, to_regclass('public.ai_metrics_daily') AS m018, (SELECT count(*) FROM feature_flags WHERE key = 'chatbot_enabled') AS m019, to_regclass('public.kb_chunks') AS m020, to_regclass('public.assistant_messages') AS m021, to_regclass('public.assistant_moderation') AS m022;
  ```
  A 017 (MFA) não tem evidência nesta consulta: confirme com quem aplicou.
- [ ] Defina **N** = a última migração **contígua** com evidência. Nunca pule uma. Exemplo: 016 a 019 aplicadas e 020 ausente, então N = 019.
- [ ] Simule e registre. `--baseline-through` só grava no ledger; **não executa** SQL.
  ```bash
  node tools/db/migrate.mjs --baseline-through 019 --dry-run
  ```
  ```bash
  node tools/db/migrate.mjs --baseline-through 019
  ```
  Troque `019` pelo N verificado. Esperado: `registrada (baseline): <arquivo>` para cada migração até N.

> **Atenção:** um N acima do real marca como aplicada uma migração que **nunca rodou**. Com N = 023, as flags nunca ligam e nenhum erro aparece. Com N = 020, a `kb_chunks` não existe e o reindex falha. A 024 não existe: `--baseline-through 024` registraria 020 a 023 sem executar nada.

### 4. Validação pós-ativação

- [ ] **Smoke test** (site, CSP e API).
  ```bash
  SMOKE_SITE_URL=https://laift.com.br SMOKE_API_URL=https://api.laift.com.br node tools/ci/smoke.mjs --retry 6 --delay 20
  ```
- [ ] **Flags públicas**, sem sessão. `ux_v2_enabled`, `chatbot_enabled` e `feedback_enabled` devem estar `true`.
  ```bash
  curl -s https://api.laift.com.br/v1/ -H 'Content-Type: application/json' -d '{"action":"apiGetFeatureFlags","args":[]}'
  ```
- [ ] **Todas as flags**, como admin. `rag_enabled` e `moderation_enabled` não são públicas, então só aparecem aqui.
  ```bash
  curl -s https://api.laift.com.br/v1/ -H 'Content-Type: application/json' -d "{\"action\":\"apiAdminListFeatureFlags\",\"args\":[\"$TOKEN_ADMIN\"]}"
  ```
- [ ] Com uma **conta de teste** (nunca conta de membro real):
  - [ ] **Início**: os gráficos carregam (`apiGetMyDashboardSeries`). Série com falha vem como `null`; investigue nos logs.
  - [ ] **Lia**: pergunte "quem pode ver meus dados?" (tópico de privacidade em `worker/src/assistant/kb.js`). Deve responder.
  - [ ] **Feedback**: polegar para cima numa resposta; polegar para baixo em outra, com categoria e comentário.
  - [ ] **Satisfação**: Administração → IA → "Satisfação da Lia" mostra as avaliações de teste.
  - [ ] **Moderação**: não há tela no front. Mande uma mensagem ofensiva à Lia com a conta de teste e confira o aviso. Depois, no SQL Editor, troque o UUID.
    ```sql
    SELECT level, until, last_incident_at FROM assistant_moderation WHERE profile_id = '<UUID da conta de teste>';
    ```
    E o resumo para admin.
    ```bash
    curl -s https://api.laift.com.br/v1/ -H 'Content-Type: application/json' -d "{\"action\":\"apiAdminAssistantModeration\",\"args\":[\"$TOKEN_ADMIN\",{}]}"
    ```
- [ ] **Logs de erro.** Depois da ativação, não deve haver `ASSISTANT_RAG_FAILED` novo. Leia a mensagem de cada `MAINTENANCE_FAILED`.
  ```sql
  SELECT created_at, code, message FROM error_logs WHERE code IN ('ASSISTANT_RAG_FAILED', 'MAINTENANCE_FAILED') ORDER BY created_at DESC LIMIT 20;
  ```
  `MAINTENANCE_FAILED` nas tarefas da Lia é esperado nas madrugadas entre o deploy e a seção 2.2, porque a faxina roda às 03:17 (Brasília) e cada tarefa é isolada (`worker/src/maintenance.js`).
- [ ] **Auditoria.** A reindexação e as mudanças feitas pela API ficam em `audit_logs`. A 023 e os `UPDATE` de SQL **não** passam por ela.
  ```sql
  SELECT created_at, action, result FROM audit_logs WHERE action IN ('REINDEX_ASSISTANT_KB', 'SET_FEATURE_FLAG') ORDER BY created_at DESC LIMIT 10;
  ```
- [ ] **Dia seguinte.** Confira a faxina das 03:17 sem `MAINTENANCE_FAILED` das tarefas da Lia.

### 5. Rollback

Do mais leve ao mais pesado. Cada passo é independente.

**5.1 Desligar por flag.** Vale em até 60 s, sem deploy. Pela API, que grava em `audit_logs`. Troque `rag_enabled` por `chatbot_enabled` (botão de emergência da Lia), `feedback_enabled`, `moderation_enabled` ou `ux_v2_enabled`.
```bash
curl -s https://api.laift.com.br/v1/ -H 'Content-Type: application/json' -d "{\"action\":\"apiAdminSetFeatureFlag\",\"args\":[\"$TOKEN_ADMIN\",\"rag_enabled\",{\"enabled\":false}]}"
```
Para desligar as cinco de uma vez, pelo SQL (não grava em `audit_logs`).
```sql
UPDATE feature_flags SET enabled = FALSE, updated_at = now() WHERE key IN ('ux_v2_enabled', 'chatbot_enabled', 'rag_enabled', 'feedback_enabled', 'moderation_enabled');
```

**5.2 Worker e site.** Cloudflare → Workers & Pages → `plataforma-membros-api` (API) ou `laift-web` (site) → *Deployments* → **Rollback**. Para a API, também pela linha de comando.
```bash
cd worker && npx wrangler rollback
```
Depois, `git revert` do merge na `main`, para o repositório refletir o que está no ar.

**5.3 Esquema.** Só com as flags já desligadas e se for preciso remover as tabelas. O runner não reverte. Cole cada arquivo de `sql/down/` no SQL Editor, na ordem da tabela, e depois apague a linha correspondente do ledger, porque o `down` não a remove.

| Ordem | Reversão (`sql/down/`) | Efeito | Linha a apagar do ledger |
|---|---|---|---|
| 1 | `023_flags_v2.sql` | apaga `rag_enabled`, `feedback_enabled` e `moderation_enabled`; `ux_v2_enabled` e `chatbot_enabled` voltam a `false` | `023_flags_v2.sql` |
| 2 | `022_assistant_moderation.sql` | apaga `assistant_moderation` e `assistant_incidents`: punições vigentes deixam de existir | `022_assistant_moderation.sql` |
| 3 | `021_assistant_feedback.sql` | apaga `assistant_feedback` e `assistant_messages`: **irreversível** | `021_assistant_feedback.sql` |
| 4 | `020_rag.sql` | apaga `kb_chunks`; a extensão `vector` fica | `020_rag.sql` |

Para ver o conteúdo de um arquivo antes de colar.
```bash
cat sql/down/023_flags_v2.sql
```
Para apagar a linha do ledger, uma por migração revertida.
```sql
DELETE FROM schema_migrations WHERE name = '023_flags_v2.sql';
```

> **Atenção:** as reversões de 021 e 022 apagam mensagens, feedback e punições de pessoas. Faça o backup da seção 1 antes e decida com o dono (seção 6).

### 6. Pendências (decisão do dono)

- [ ] **Re-aceite da política de privacidade.** O aceite só é gravado no cadastro (`worker/src/services/authService.js`, documento `privacy`, versão `LEGAL_VERSIONS.PRIVACY` = `2026-10-08`). Quem já tem conta não tem registro dessa versão. Decidir se haverá re-aceite.
- [ ] **Exclusão de conta.** Não há ação de exclusão de conta no `API_REGISTRY` (`worker/src/handlers.js`). Hoje é manual. As tabelas da Lia saem junto por `ON DELETE CASCADE`, mas o fluxo de exclusão não existe no código.
- [ ] **Custo do reindex e dos embeddings.** O repositório não registra custo nem orçamento do Workers AI (`@cf/baai/bge-m3`). O único freio é o limite `ASSISTANT_REINDEX_MINUTE`. Definir teto e responsável.
- [ ] **Folhas decorativas.** Não encontrei no repositório arquivo nem referência a "folha" ou "leaf" que corresponda ao pedido. Confirmar o que é antes de decidir.
- [ ] **Site legado no GitHub Pages.** `deploy-frontend.yml` ainda publica a cada push na `main`, além do Worker `laift-web`. Decidir se desliga.
- [ ] **Homologação.** (a) Sem `[env.staging.ai]`, a busca da Lia em staging é só por trigramas (seção 1). (b) O push em `staging` roda o runner inteiro, **inclusive a 023**, se `STAGING_DATABASE_URL` existir: a homologação liga as flags no primeiro push.
- [ ] **A 023 e a regra "não religar".** O comportamento real: a 023 religa `ux_v2_enabled` e `chatbot_enabled` se elas estiverem desligadas. Se a regra for "não religar", a 023 precisa mudar **antes** de chegar à produção (migração aplicada não se edita, então só dá para fazer agora).
- [ ] **Migração 024.** Não existe. Se for criada, entra no lote da 2.2, antes da 023.
- [ ] **Documentação fora deste escopo.** `docs/FEATURE_FLAGS.md` diz que só `ux_v2_enabled` é pública e que toda flag nova nasce desligada. O código (`PUBLIC_FLAGS`) tem três, e a 023 é a exceção. Não foi editado nesta entrega.
