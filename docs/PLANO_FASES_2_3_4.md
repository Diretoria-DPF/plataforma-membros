# Plano de Execução — Fases 2, 3 e 4 da Unificação LAIFT

Continuação de `docs/PLANO_UNIFICACAO_LAIFT.md` (Fase 1 concluída). Este
documento é o **contrato** entre as três equipes que trabalham em paralelo:
- quem é dono de cada arquivo;
- o modelo de dados;
- os nomes e formatos dos endpoints;
- a ponte entre os módulos e a plataforma;
- o que "pronto" significa.

Se algo aqui estiver errado ou for insuficiente, a equipe **não improvisa um
contrato diferente**: segue o mais próximo possível e registra o desvio no
relatório final, na seção "Desvios de contrato".

## Status (2026-09-26)

| Etapa | Status |
|---|---|
| Onda 1: Equipe 2 (Dados & Presença) | ✅ concluída; ver `docs/FASE_2_DADOS_PRESENCA.md` |
| Onda 1: Equipe 3 (IA & Clínica) | ✅ concluída; ver `docs/FASE_3_IA_CLINICA.md` |
| Onda 1: Equipe 4 (Qualidade, Design & Segurança) | ✅ concluída; ver `docs/FASE_4_QUALIDADE.md` |
| Integração 2 → 3 → 4 | ✅ feita (commit `9679670`) |
| Onda 2: CSP na plataforma e nos módulos | ✅ 12 páginas, sem `'unsafe-inline'`/`'unsafe-eval'` em `script-src`; E2E falha em qualquer violação |
| Onda 2: handlers inline e `innerHTML` restantes | ✅ 0 e 0; a clínica também sem `style=` |
| Onda 2: remoção do `api-service.js` e da URL do Apps Script | ✅ `grep` vazio no front-end |
| Onda 2: passe de UX (Aprender, fiscal, IA, clínica) | ✅ |
| Onda 2: revisão de segurança final e E2E completo | ✅ achados e riscos em `docs/SECURITY.md` e `docs/FASE_4_QUALIDADE.md` |
| Deploy (responsável) | ⏳ pendente: seguir `docs/DEPLOYMENT.md` |

## Decisões do responsável pelo projeto

| Tema | Decisão |
|---|---|
| Provedor de IA | **Só Groq**, mantendo **todas as chaves** atuais num pool com rodízio e failover. A redução para um único modelo fica para depois. |
| Acesso à IA | **Todos os logados**, com **cota diária por pessoa** (menor para visitantes). |
| Backend legado | O Apps Script deixa de ser usado pelo front-end ao fim das Fases 2 e 3. **Métricas zeradas** (decisão de 2026-09-26): o histórico da planilha **não** será importado; a plataforma recomeça do zero e apaga, uma vez por navegador, os dados locais do sistema antigo. |

## Equipes e ondas

| Equipe | Fase | Missão |
|---|---|---|
| **Equipe 2 — Dados & Presença** | 2 | Progresso, métricas e presença na Worker e no Neon; ponte módulo↔plataforma; terminal fiscal sem Apps Script. |
| **Equipe 3 — IA & Clínica** | 3 | IA na Worker (Groq, pool de chaves, cotas); clínica virtual e preceptor do laboratório sem Apps Script; acervo com moderação; painel admin de IA. |
| **Equipe 4 — Qualidade, Design & Segurança** | 4 | Design system único com tema escuro; motor único de quiz; XSS e handlers inline; pinagem com SRI; usabilidade, acessibilidade e mobile. |

- **Onda 1 (em paralelo):** as três equipes, cada uma em seu worktree e branch local, respeitando a tabela de donos abaixo.
- **Integração:** o integrador faz o merge nesta ordem: 2 → 3 → 4. Depois resolve conflitos, roda todas as verificações e publica no branch de trabalho.
- **Onda 2 (após a integração):** a Equipe 4 faz o endurecimento transversal:
  - CSP na plataforma e nos módulos;
  - handlers inline e `innerHTML` restantes em `clinica/` e `fiscal/`;
  - remoção do `api-service.js` e da URL do Apps Script;
  - passe de UX em `learning.js`, no fiscal e no admin de IA;
  - revisão de segurança final e E2E completo.

  As Equipes 2 e 3 corrigem o que a integração apontar.

### Worktrees (onde cada equipe trabalha)

| Equipe | Diretório | Branch local |
|---|---|---|
| 2 | `/home/user/wt/fase2` | `equipe/fase2-dados` |
| 3 | `/home/user/wt/fase3` | `equipe/fase3-ia` |
| 4 | `/home/user/wt/fase4` | `equipe/fase4-qualidade` |

**Regras:**
- Commits pequenos, em pt-BR, no padrão Conventional Commits do repositório.
- **Nunca `git push`**, nunca mexer em outro worktree nem no checkout principal (`/home/user/plataforma-membros`).
- Rode `npm install` em `worker/` e em `frontend/` do próprio worktree.

## Donos dos arquivos (Onda 1)

Ninguém edita arquivo de outra equipe. Se precisar, descreva a mudança no
relatório final, em "Pedidos de integração". Arquivos **compartilhados** só
recebem acréscimos em blocos próprios, marcados com um comentário
`// Fase N —`, sem reformatar o que já existe.

| Área | Dono |
|---|---|
| `sql/012_learning.sql` | Equipe 2 |
| `sql/013_clinical_ai.sql` | Equipe 3 |
| `worker/src/services/learningService.js`, `attendanceService.js` (novos) | Equipe 2 |
| `worker/src/services/aiService.js`, `clinicalService.js`, `worker/src/ai/*` (novos) | Equipe 3 |
| `worker/src/handlers.js`, `worker/test/handlers.test.js`, `worker/src/constants.js` | **Compartilhados**: 2 e 3 só acrescentam blocos próprios |
| `worker/wrangler.toml` | Equipe 3 (vars do Groq); a Equipe 2 registra o que precisar em "Pedidos de integração" |
| `frontend/app.js` | Equipe 2 (ponte `callLearningApi`, tema para os módulos, métricas no perfil). A Equipe 3 só acrescenta o loader `panel-admin-ai` e a limpeza no logout. |
| `frontend/index.html` | Equipe 3 (botão e seção `panel-admin-ai`). A Equipe 2 pode ajustar a seção `panel-learn` e o fiscal se necessário. |
| `frontend/learning.js` | Equipe 2 |
| `frontend/admin-ai.js` (novo) e a linha dele em `frontend/scripts/build.js` | Equipe 3 |
| `frontend/styles.css` | Equipe 4 (as Equipes 2 e 3 acrescentam só classes novas em blocos próprios, no fim do arquivo) |
| `frontend/modulos/shared/laift-identity.js` (ponte) | Equipe 2 |
| `frontend/modulos/shared/api-service.js` | **Congelado na Onda 1** (ninguém edita; removido na Onda 2) |
| `frontend/modulos/shared/style.css`, `shared/laift-tokens.css` (novo), `shared/quiz-engine.js` (novo) | Equipe 4 |
| `frontend/modulos/fiscal/**` | Equipe 2 |
| `frontend/modulos/clinica/**`, `frontend/modulos/laboratorio/js/lab-preceptor.js` | Equipe 3 |
| `frontend/modulos/quiz/**`, `toxicologia/**`, `anatomia-3d/**`, `cracha/**`, `laboratorio/**` (exceto `lab-preceptor.js`) | Equipe 4 |
| `frontend/scripts/e2e/harness.js`, `run.js`, `smoke.e2e.js` | Integrador. Cada equipe cria **o próprio** `faseN.e2e.js`. |
| Docs | Cada equipe escreve em `docs/FASE_N_*.md` (novo, próprio). `README.md`, `DEPLOYMENT.md` e `SECURITY.md`: só pedidos de integração. |

## Contrato 1 — Modelo de dados

### `sql/012_learning.sql` (Equipe 2)

```sql
-- Tentativas/resultados de TODAS as atividades de aprendizagem.
-- Uma linha por atividade concluída; as estatísticas saem daqui.
CREATE TABLE IF NOT EXISTS learning_attempts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module           TEXT NOT NULL,   -- 'farmacologia' | 'toxicologia' | 'clinica' | 'laboratorio' | 'anatomia'
  activity         TEXT NOT NULL,   -- 'quiz_estudo' | 'quiz_prova' | 'caso_clinico' | 'formulacao' | 'simulacao_pk'
  score            INTEGER,         -- acertos (quiz) ou nota 0–100 (caso clínico); NULL se não se aplica
  max_score        INTEGER,         -- total de questões ou 100
  duration_seconds INTEGER,
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- limitado no serviço (ex.: ≤ 8 KB)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  -- + CHECKs de domínio de module/activity e de coerência score/max_score (a Equipe 2 escreve)
);
-- + índice (profile_id, module, created_at DESC)

-- Presença em eventos da plataforma (substitui a planilha do fiscal):
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS checked_in_at  TIMESTAMPTZ;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS checked_in_by  UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS checkin_method TEXT;  -- 'qr' | 'manual' | 'lista'
```

**Formato de `details` por atividade** (a Equipe 3 escreve `caso_clinico` direto nesta tabela):

| activity | details |
|---|---|
| `quiz_estudo` / `quiz_prova` | `{ "topics": ["..."] }` |
| `caso_clinico` | `{ "caseId", "caseSource": "builtin" \| "acervo" \| "ia", "outcome": "sobreviveu" \| "obito" \| "estavel", "toxindrome", "agent" }` |
| `formulacao` | `{ "product", "reagents": ["..."], "temperature", "stirring", "observation" }` |
| `simulacao_pk` | `{ "compound", "route" }` |

### `sql/013_clinical_ai.sql` (Equipe 3)

```sql
-- Acervo coletivo de casos clínicos, com moderação.
CREATE TABLE IF NOT EXISTS clinical_cases (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  toxindrome  TEXT,
  agent       TEXT,
  payload     JSONB NOT NULL,          -- caso completo, VALIDADO no servidor (formato do clinic-engine)
  source      TEXT NOT NULL,           -- 'ia' | 'admin'
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Auditoria de uso/custo da IA. Sem conteúdo de mensagens (minimização).
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  feature           TEXT NOT NULL,     -- 'chat' | 'evaluate' | 'generate_case' | 'lab_preceptor' | 'health'
  model             TEXT NOT NULL,
  key_index         SMALLINT,          -- posição no pool; NUNCA a chave
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  latency_ms        INTEGER,
  ok                BOOLEAN NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Regras:**
- 013 roda **depois** de 012 e pode referenciar `learning_attempts`.
- As migrações são idempotentes: `IF NOT EXISTS`, e guards `DO … EXCEPTION WHEN duplicate_object OR duplicate_table`.
- As duas passam em `cd worker && npm run validate:sql`, que aplica tudo duas vezes num Postgres real em memória (PGlite).

## Contrato 2 — Endpoints da Worker

**Formato e segurança:**
- Todos seguem o padrão existente: entrada em `API_REGISTRY` com `runWithSession`, regra no service, `ValidationError` e similares para erros esperados, `Logging.logAudit` em toda mutação e rate limit onde houver custo ou abuso possível.
- Endpoints usados pelos módulos recebem **um único objeto** de entrada: `(sql, env, [sessionToken, input])`.
- A identidade **sempre** vem da sessão; nenhum endpoint aceita `profileId`/`email` do cliente como identidade de quem chama.

### Equipe 2

| Ação | Entrada (`input`) | Saída |
|---|---|---|
| `apiLearnGetMyStats` | — | `{ success, stats: { accuracyPct, questionsAnswered, quizzesCompleted, clinicalCasesCompleted, clinicalAvgScore, labFormulations, byModule: { <module>: { attempts, accuracyPct } }, badges: [{ id, label, description, unlocked }] } }` |
| `apiLearnSubmitQuizAttempt` | `{ module: 'farmacologia'\|'toxicologia'\|'anatomia', mode: 'estudo'\|'prova', correct, total, durationSeconds, topics: string[] }` | `{ success, attemptId }` |
| `apiLearnRecordLabFormulation` | `{ product, reagents: string[], temperature, stirring, observation }` | `{ success }` |
| `apiLearnGetMyAttendanceQr` | — | `{ success, qrPayload }` → `LAIFT:v2:<profileId>.<assinatura>` (HMAC-SHA-256, chave derivada do `SESSION_TOKEN_PEPPER` com separação de domínio; sem segredo novo) |
| `apiAdminAttendanceListEvents` | — | `{ success, events: [{ id, title, eventDate, status, checkedInCount, registeredCount }] }` |
| `apiAdminAttendanceCheckIn` | `{ eventId, qrPayload? , email? , profileId?, method: 'qr'\|'manual'\|'lista' }` | `{ success, message, participant: { fullName, alreadyCheckedIn } }` |
| `apiAdminAttendanceSearch` | `{ eventId, term }` | `{ success, participants: [{ profileId, fullName, email, role, registered, checkedInAt }] }` |
| `apiAdminAttendanceExportCsv` | `{ eventId }` | `{ success, filename, csv }` (protegido contra injeção de fórmula: `= + - @` prefixados) |
| `apiAdminAttendanceBadges` | `{ profileIds: string[] }` | `{ success, badges: [{ profileId, fullName, role, qrPayload }] }` |

- Os `apiAdminAttendance*` exigem `requireRole(identity, ['admin'])`.
- `apiAdminAttendanceCheckIn` deve funcionar para quem **não** se inscreveu previamente (entrada na porta). Ele cria ou atualiza a inscrição, respeitando os triggers existentes de `event_registrations`. Se um trigger de capacidade bloquear, a mensagem ao admin tem que ser clara.

### Equipe 3

| Ação | Entrada | Saída |
|---|---|---|
| `apiLearnClinicalChat` | `{ caseId, caseSource, question, history: [{role, text}], patientContext }` | `{ success, patientReply }` (modelo rápido) |
| `apiLearnClinicalEvaluate` | `{ caseId, caseSource, attendance: { diagnosis, conduct, examsRequested, questionsAsked, elapsedSeconds, vitality, outcome, toxindrome, agent }, answerKey? }` | `{ success, result: { score, verdict, feedback, strengths, improvements } }` (modelo forte). Grava `learning_attempts` com `module='clinica'`, `activity='caso_clinico'`. |
| `apiLearnClinicalGenerateCase` | `{ topic, difficulty }` | `{ success, case }`. O caso é validado no servidor (JSON mode + esquema) e salvo em `clinical_cases` como `pending`. |
| `apiLearnClinicalLibrary` | `{ term?, toxindrome? }` | `{ success, cases: [...] }` (só `approved`) |
| `apiLearnClinicalEpidemiology` | — | `{ success, survivalRatePct, totalAttended, topToxindromes: [{name, count}], topAgents: [{name, count}] }` |
| `apiLearnLabPreceptor` | `{ question, benchContext, history, synthesisTerm? }` | `{ success, answer, cached }`. O cache de síntese é **só do servidor** (KV `HOT_CACHE`, chave `ai:lab-synth:<termo normalizado>`), nunca gravável pelo cliente. |
| `apiLearnGetMyAiQuota` | — | `{ success, quotas: { chat: {used, limit}, evaluate, generateCase, labPreceptor } }` |
| `apiAdminAiHealth` | — | `{ success, overallPct, keys: [{ index, masked, ok, latencyMs, status }] }` (`masked` = só os 4 últimos caracteres) |
| `apiAdminLearnListPendingCases` | — | `{ success, cases: [...] }` |
| `apiAdminLearnReviewCase` | `{ caseId, decision: 'approved'\|'rejected' }` | `{ success }` |

**Regras de IA (Equipe 3):**

- **Groq**: API compatível com OpenAI (`https://api.groq.com/openai/v1/chat/completions`).
  - Secret `GROQ_API_KEYS`: lista de chaves separadas por vírgula ou quebra de linha. É aqui que entram **todas** as chaves atuais.
  - Vars `GROQ_MODEL_FAST` (padrão `openai/gpt-oss-20b`) e `GROQ_MODEL_SMART` (padrão `openai/gpt-oss-120b`).
- **Pool de chaves**:
  - rodízio round-robin;
  - failover em 401/403/429/5xx/timeout;
  - cooldown por chave em KV (`ai:key-cooldown:<i>`, TTL do `Retry-After` ou 60 s);
  - a chave nunca aparece em log, resposta ou erro.
- **Cotas por perfil em 24 h**, via `enforceRateLimit`, com valores iniciais em `constants.js`:

  | Recurso | Visitante | Membro | Admin |
  |---|---|---|---|
  | chat | 40 | 150 | 300 |
  | evaluate | 5 | 20 | 40 |
  | generate_case | 2 | 8 | 20 |
  | lab_preceptor | 20 | 80 | 160 |

  Há ainda um **disjuntor global** diário de custo (valor inicial 3000 chamadas).
- **Prompts de sistema só no servidor** (`worker/src/ai/prompts.js`, pt-BR). Têm propósito educacional explícito e ignoram pedidos para sair do papel.
  - Limites de tamanho: pergunta ≤ 500 caracteres, histórico ≤ 8 turnos, contexto ≤ 4 KB.
  - `max_tokens` definido por recurso.
- **Saída sempre texto puro.** O cliente renderiza com `textContent`, nunca `innerHTML`. Na geração de caso: `response_format: { type: 'json_object' }` + validação de esquema; caso inválido = erro esperado, sem salvar.

### Allowlist da ponte

A ponte aceita só ações que casam com
`/^api(Learn|AdminAttendance|AdminAi|AdminLearn)[A-Z][A-Za-z]*$/`. **Todo**
endpoint novo usado a partir de um módulo precisa seguir esses prefixos.

## Contrato 3 — Ponte módulo ↔ plataforma (Equipe 2 implementa; 3 e 4 consomem)

Tudo continua exposto por `modulos/shared/laift-identity.js`, que já é o
primeiro script de toda página de módulo, então nenhuma página ganha tag
nova.

| Onde | API | Comportamento |
|---|---|---|
| Plataforma (`app.js`) | `window.App.callLearningApi(action, input)` → `Promise<resposta>` | Valida `action` contra a allowlist, prefixa o token da sessão (que **não** sai do app principal), aplica timeout de 60 s e devolve `{success:false, message}` sem sessão ou em falha de rede. |
| Módulo | `window.LaiftApi.call(action, input)` → `Promise<resposta>` | Encaminha para `host.App.callLearningApi`. Sem plataforma: `{ success:false, message:'Sessão indisponível.' }`. |
| Módulo | `window.LaiftIdentity.getTheme()` → `'light'\|'dark'` | Tema efetivo da plataforma, com "sistema" já resolvido. |
| Módulo | `<html data-theme="light\|dark">` | Aplicado automaticamente pela ponte no carregamento e atualizado quando o tema da plataforma muda. A Equipe 4 estiliza com `[data-theme="dark"]`. |

A Equipe 3 e a Equipe 4 escrevem o código dos módulos **contra este
contrato** mesmo antes de ele existir no worktree delas. Chame sempre de
forma defensiva (`if (window.LaiftApi) …`); a integração junta as partes.

## Contrato 4 — Quem troca cada chamada ao Apps Script

| Chamada antiga (Apps Script) | Nova | Quem troca |
|---|---|---|
| `obterDashboardAluno` (learning.js) | `apiLearnGetMyStats` | Equipe 2 |
| `registrarMetricasQuiz` (quiz) + **toxicologia (nunca enviava)** | `apiLearnSubmitQuizAttempt` | Equipe 4 (no motor único de quiz) |
| `registrarFormulacaoLab` (laboratorio/js/script.js) | `apiLearnRecordLabFormulation` | Equipe 4 |
| `salvarBackupApi` (anatomia) | **removida** (o cache local em IndexedDB continua) | Equipe 4 |
| `loginFiscal`, `salvarEvento`, `carimbarPresenca*`, `marcarPresencaLista`, `listarMembros`, `exportarPresencasCsv`, `logoutFiscal` | `apiAdminAttendance*` (sem senha fiscal: vale o papel admin) | Equipe 2 |
| `obterStatusSaudeIA` (fiscal) | `apiAdminAiHealth`, no novo painel admin "IA" | Equipe 3 (a Equipe 2 remove o cartão do fiscal) |
| `conversarComPaciente`, `avaliarCondutaPreceptor`, `gerarCasoProcedural`, `listarCasosAcervo`, `obterDashboardEpidemiologico`, `consolidarDashboard` | `apiLearnClinical*` | Equipe 3 |
| `consultarPreceptorIA`, `consultarCacheGlobal`, `salvarCacheGlobal` (lab-preceptor.js) | `apiLearnLabPreceptor` (cache no servidor) | Equipe 3 |
| `laift_resolved_cases` (localStorage da clínica) | derivar de `learning_attempts` via `apiLearnGetMyStats` ou manter local, a critério da Equipe 3 | Equipe 3 |

## Definição de pronto (vale para toda equipe)

1. `cd worker && npm test` verde, com testes novos para cada service e endpoint novo (padrão de `worker/test/*.test.js` com `makeSql`/`makeEnv`). `handlers.test.js` atualizado.
2. `cd worker && npm run validate:sql` verde: todas as migrações aplicam duas vezes.
3. `cd frontend && npm install && npm run e2e` verde. Isso inclui `smoke.e2e.js` (sem regressão) e o `faseN.e2e.js` da equipe, que cobre as funcionalidades novas com a Worker simulada pelo harness.
4. `node --check` em todo JS alterado. Nenhum `innerHTML`/`document.write` novo com dado dinâmico.
5. Segurança:
   - identidade só da sessão;
   - papel checado no servidor;
   - rate limit onde há custo ou abuso;
   - auditoria nas mutações;
   - nenhum segredo no front-end ou em log.
6. Visual/UX: o que a equipe tocar funciona em 360 px de largura sem rolagem horizontal, com alvos de toque ≥ 44 px e foco visível.
7. Documentação em `docs/FASE_N_*.md`:
   - o que mudou;
   - como fazer o deploy (migrações a aplicar no Neon, `wrangler secret put …`, vars);
   - riscos;
   - pendências.
8. Relatório final ao integrador, com:
   - branch;
   - `git log --oneline` dos commits;
   - resumo;
   - verificações executadas e resultados;
   - "Desvios de contrato";
   - "Pedidos de integração";
   - pendências.

## Deploy (feito pelo responsável, não pelas equipes) — ⏳ pendente

O passo a passo completo está em `docs/DEPLOYMENT.md`. Resumo:

1. Aplicar `sql/012_learning.sql` e depois `sql/013_clinical_ai.sql` no Neon.
2. `cd worker && wrangler secret put GROQ_API_KEYS` (todas as chaves, uma por linha ou separadas por vírgula).
3. `cd worker && npm run deploy`.
4. Merge na `main` → o GitHub Actions publica o front-end.

## Pendências conhecidas

- ⏳ **Revisão jurídica** da Política de Privacidade (versão 2026-09-26, com Groq como operador e a área "Aprender") e dos Termos.
- ✅ **Retenção do `ai_usage_log`:** 180 dias, apagado pela faxina diária da Worker (Cron Trigger, `worker/src/maintenance.js`), que também remove sessões, tokens e baldes de rate limit expirados.
- ⏳ **Criação/edição manual de casos** pelo admin (o acervo recomeça vazio; casos antigos da planilha não serão importados).
- ⏳ **Chamada real ao Groq** e **teste de ponta a ponta** depois do deploy. Tudo foi validado com `fetch` simulado.
- ✅ **Histórico antigo:** decisão do responsável — **não importar**; métricas recomeçam do zero. `frontend/learning.js` apaga uma única vez por navegador a sessão antiga (`laift_student_session`, com matrícula/CPF) e as métricas locais do o-bala-vip (marcador `laift_reset_v1`).
- **Rodízio de várias contas gratuitas do Groq:** mantido por decisão do responsável. Vale confirmar nos termos de uso do Groq; a camada de IA já permite reduzir para uma chave e um modelo sem reescrita.
