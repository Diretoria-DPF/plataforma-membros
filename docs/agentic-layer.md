# Camada agêntica da LAIFT

Documento de arquitetura da camada de agentes de IA (ADR 0007) e da **memória de estudo** (ADR 0008). Vale para o código em `worker/src/agents/`, `worker/src/services/agentsService.js` e `worker/src/memory/`. Estado: **alfa** (`apiVersion: 'agents/v1-alpha'`), tudo atrás de flags **desligadas**. Pedido do dono: plano "Operação LAIFT Agêntica, trilha de produto (v1)", seção J.

## 1. Visão geral

| Peça | Onde | O que faz |
|---|---|---|
| Personas | `worker/agents/personas/*.md` -> `worker/src/agents/registry.generated.js` | Quem responde. Versionadas (`persona@versão#hash`); editar o `.md` exige subir a versão e rodar `npm run gen:agents`. |
| Guardrails | `worker/src/agents/guardrails/` | Regras puras de entrada (I1–I7) e saída (O1–O6). Recusa não é erro e não gasta cota. |
| Orquestração | `worker/src/services/agentsService.js` | `apiAgentsList` e `apiAgentsInvoke`: flags, maioridade, limites, cota, fontes, modelo (só Groq), rastro. |
| Memória | `worker/src/memory/` | Memória de estudo opt-in em **outro banco** (Neon `laift-memory`). Este documento, seção 2. |
| Núcleo | Neon principal | `agent_traces` (035), `member_memory_consent` e `memory_purge_queue` (036). |

Regras que valem para tudo: só **maiores de 18 anos** (decisão do dono, `agents/eligibility.js`); o tutor **nunca cita dose numérica**; o rastro **nunca guarda texto do usuário**; Cloudflare plano gratuito (10 ms de CPU, sem KV, ~20 subrequisições por chamada de agente).

## 2. Memória de estudo

### 2.1 Decisões do dono (12/10/2026)

- Só para **maiores de 18 anos** (a mesma `isEligibleAdult` do tutor) e só **membro e admin**.
- **Opt-in explícito**, **revogável** e **apagável**.
- Retenção: **180 dias sem uso** e **12 meses no máximo** desde a criação.
- Dose estrita no tutor. Nada a ver com a memória, mas a memória **nunca** pode guardar dado de saúde ou pessoal.

### 2.2 Arquitetura

```
Navegador (shell)        apiMemory* / apiAgentsInvoke
        |
Worker  handlers.js -> memory/service.js   (consentir, ver, preferir, apagar, exportar)
                    -> services/agentsService.js -> agents/memoryProvider.js -> memory/tutor.js
                    -> memory/admin.js     (só agregados + purga com senha)
                    -> maintenance.js      -> memory/cleanup.js (fila, vencidos, varredura)
        |                         |
 Neon NÚCLEO                Neon laift-memory   (DATABASE_URL_MEMORY, papel laift_memory_worker)
 member_memory_consent      memory_items        (RLS forçada, por pessoa)
 memory_purge_queue
 agent_traces, audit_logs
```

- `db.js`: `createMemoryDb(env)` devolve `null` sem `DATABASE_URL_MEMORY` (e **nada muda** em quem não configurou). `env.memorySql` é a injeção dos testes. O cliente do Neon é memoizado por URL no isolate.
- Toda consulta ao banco de memória é **uma transação** (`sql.transaction`, uma requisição HTTP = uma subrequisição) que começa por `set_config('app.subject_id', <pseudônimo>, true)`.
- Segredos: `DATABASE_URL_MEMORY` e `MEMORY_SUBJECT_KEY` (HMAC, mínimo 32 caracteres, **diferente** do `SESSION_TOKEN_PEPPER`). Sem qualquer um dos dois a memória é **indisponível** (falha fechada).

### 2.3 O que a memória guarda e o que não guarda

**Guarda** (`memory_items`, um por pessoa+tipo+tema, no máximo **60** por pessoa):

| Tipo (`kind`) | Tema (`slug`) | Nível | Valor | Quem escreve |
|---|---|---|---|---|
| `topic_level` | tema do vocabulário | 1–5 | nenhum | resultado de simulado (média ponderada) ou o próprio membro |
| `difficulty` | tema do vocabulário | 1–5 (recorrência) | `dificil`, `confuso`, `duvida` | simulado fraco ou palavra-chave na pergunta ao tutor |
| `study_pref` | `formato`, `profundidade`, `ritmo` | nenhum | lista fechada (ex.: `exemplos`, `resumo`, `basico`, `curto`) | o próprio membro |
| `goal` | `prova`, `revisao`, `aprofundamento`, `monitoria` | nenhum | `ativo` | o próprio membro |

Mais: origem (`quiz`, `tutor`, `member`), contagem de evidências, versão do consentimento, datas e validade. O **pseudônimo** da pessoa é `subject_id = HMAC-SHA256(MEMORY_SUBJECT_KEY, profile_id)` em hexadecimal; sem a chave, o banco de memória não diz de quem é a linha.

**Não guarda e não tem onde guardar** (não existe coluna de texto livre; as CHECKs do banco aceitam só slug no formato, valores de lista fechada e níveis 1–5):

- a pergunta do estudante, a resposta do tutor, o histórico da conversa;
- nome, e-mail, telefone, identificador da conta, data de nascimento;
- qualquer dado de saúde, medicamento ou doença de pessoa, paciente real ou caso;
- texto escrito pelo membro (a tela só oferece itens do vocabulário; o servidor recusa qualquer campo extra).

Os temas do vocabulário (`memory/vocabulary.js`, ~23) vêm dos módulos de Aprender e ficam no nível de **conceito ou classe** (Farmacocinética, Antimicrobianos, Antídotos...), nunca de paciente ou medicamento de alguém. As palavras-chave mapeiam o que o estudante escreveu a um tema e o texto é **descartado**.

**Nada é escrito por modelo de IA.** Só por: (1) resultado de simulado, (2) palavra-chave do vocabulário na pergunta ao tutor, (3) preferência escolhida pelo próprio membro.

`pgvector` está habilitado no banco de memória e **sem uso** na v1 (memória semântica em texto livre está fora do escopo).

### 2.4 Consentimento

- Tabela `member_memory_consent` (núcleo): `status` (`granted`/`revoked`), `purpose_version`, datas. Auditoria sem conteúdo em `audit_logs` (`MEMORY_CONSENT_GRANTED`, `MEMORY_CONSENT_REVOKED`, `MEMORY_ITEM_DELETED`, `MEMORY_ALL_DELETED`, `MEMORY_EXPORTED`, `MEMORY_ADMIN_PURGE`).
- A **versão da finalidade** mora em `constants.js` (`MEMORY.PURPOSE_VERSION`). Mudou o texto do consentimento: aumente a versão. Quem aceitou a versão antiga passa a `needsReconsent`: **leitura e escrita fecham** até um novo aceite (os dados antigos não somem sozinhos; a pessoa pode apagar ou exportar). Para ativar, o cliente envia a versão que mostrou; se for outra, o servidor recusa (`VALIDATION`, `reason: 'version'`).
- O consentimento é conferido **no núcleo a cada chamada do tutor** e nunca é cacheado: revogar vale na hora.
- Texto proposto: `docs/memoria-consentimento-RASCUNHO.md` (aguarda aprovação do dono; **não** altera `LEGAL_VERSIONS` nem a política vigente).

### 2.5 O tutor lendo a memória

`agentsService` chama `agents/memoryProvider.js::readMemory` depois dos guardrails de entrada e da cota e antes do prompt. A memória só é lida se **todas** as condições valem: persona com `memory.read` (hoje só `tutor-clinico@1.1.0`), `memory_enabled` ligada, papel membro/admin, maior de 18, `DATABASE_URL_MEMORY` e `MEMORY_SUBJECT_KEY`, e consentimento `granted` **na versão atual**. Senão, devolve `{ available: false }` e nada é lido nem escrito.

- Até **8 itens** (objetivo e preferência primeiro), com **timeout de 1,2 s**; qualquer falha ou estouro = o tutor segue **sem memória**.
- Cache de **5 minutos** por pessoa na memória do isolate (só os itens, nunca o consentimento).
- Os itens entram no prompt como **bloco de DADOS** (JSON marcado como dado, depois das regras e da persona), nunca como instrução; a forma é enxuta (`tipo`, `tema`, `nivel`, `valor`), sem ids nem datas.
- O retorno traz `memory: { available: true, used: true, count: N }`; o front mostra o selo "usou sua memória de estudo". O rastro (`agent_traces.memory_used`) registra o uso.
- Ler **marca os itens como usados** (renova os 180 dias, sem passar de 12 meses da criação), no mesmo comando SQL.

### 2.6 Escrita

Depois da resposta, só se a leitura confirmou o consentimento e o desfecho foi `allow`/`rewrite`: as dúvidas do vocabulário citadas na pergunta viram `difficulty/duvida` (recorrência sobe 1 a cada pergunta, até 5). Roda em `waitUntil` (o `index.js` entrega `ctx.waitUntil` aos handlers em `env.waitUntil`), **nunca bloqueia a resposta**, e qualquer falha é silêncio (aviso `MEMORY_WRITE_SKIPPED` no log, sem conteúdo). O resultado de simulado (`apiLearnSubmitQuizAttempt`) grava nível (média ponderada de até 9 observações) e, se o nível for 1 ou 2, a dúvida; sem banco de memória o handler não faz nenhuma consulta a mais.

Escrita do próprio membro: `apiMemorySetPreference` (só `topic_level`, `study_pref`, `goal`; precisa de consentimento vigente).

### 2.7 Apagar

| Caminho | O que acontece | Falhou? |
|---|---|---|
| Apagar um item / tudo (`apiMemoryDeleteItem`, `apiMemoryDeleteAll`) | apaga no banco de memória; vale **mesmo com a flag desligada** ou o aceite desatualizado | `MEMORY_UNAVAILABLE` (nunca finge que apagou) |
| Revogar consentimento (`apiMemorySetConsent {granted:false}`) | grava a revogação **no núcleo primeiro** (a leitura fecha), depois apaga na memória | a pessoa entra em `memory_purge_queue` (`reason: 'revoked'`); a resposta diz `queued: true` e prazo de 24 h |
| Novo aceite | bloqueado enquanto houver apagamento pendente na fila (tenta concluí-lo antes) | `MEMORY_UNAVAILABLE`, `reason: 'pending_purge'` |
| Exclusão de conta | o gatilho `AFTER DELETE ON profiles` (036) enfileira `account_deleted`; o consentimento sai por CASCADE | a linha só sai da fila **depois** do apagamento; falhou, fica (`attempts`, `last_error_code`) |
| Admin (`apiAdminPurgeMemberMemory`) | exige senha (e 2º fator, se houver); apaga a memória de **uma** pessoa; vale com a flag desligada | enfileira (`reason: 'admin'`) |

Limpeza (`maintenance.js` -> `memory/cleanup.js`, **só roda se `DATABASE_URL_MEMORY` e `MEMORY_SUBJECT_KEY` existem**):

- **Fila** (todo dia, 20 pessoas por rodada) e de forma **oportunista** (3 pessoas em segundo plano depois de apagar tudo). **Prazo-alvo: 24 h.**
- **Vencidos** (todo dia): `expires_at <= now()`. Pula o banco se ninguém consentiu e a fila está vazia (não acorda o Neon à toa).
- **Varredura semanal** (domingo, UTC): apaga o que não pertence a ninguém com consentimento `granted` (conta excluída cuja fila falhou, revogação cuja limpeza falhou). Nunca apaga com lista truncada: acima de 300 consentimentos a varredura é **pulada** com aviso (limite de CPU do plano gratuito); itens escritos há menos de 1 hora ficam.
- Falha de limpeza **nunca derruba o cron**: cada tarefa é isolada e registrada em `error_logs` (`MAINTENANCE_FAILED`).

### 2.8 Retenção

`expires_at = LEAST(último uso + 180 dias, criação + 12 meses)`. A CHECK `expires_at <= created_at + interval '12 months'` impede ir além mesmo com bug no Worker. Item vencido e ainda não limpo é ignorado na leitura e **recomeça do zero** se for escrito de novo.

### 2.9 Segurança

- **RLS forçada por pessoa** em `memory_items`: o papel `laift_memory_worker` só enxerga e grava as linhas do `app.subject_id` da transação. Sem o `set_config`, **nada** é visível. O modo `app.maintenance = 'on'` (cron) enxerga e apaga tudo, mas **não grava** linha de ninguém (`WITH CHECK` exige o sujeito).
- O papel é criado **por SQL** (`sql/memory/001_memory.sql`): `LOGIN`, sem superusuário, sem `BYPASSRLS`, sem DDL, só `SELECT/INSERT/UPDATE/DELETE` em `memory_items`. **Nunca crie o papel pelo console do Neon** (vira `neon_superuser` e ignora RLS). A senha o dono define depois, por SQL.
- Admin **não lê** a memória de ninguém: só `apiAdminMemoryStats` (contagens) e a purga com senha.
- Auditoria e rastro sem conteúdo; erros do banco de memória viram `MEMORY_UNAVAILABLE` com mensagem genérica (o detalhe interno não chega ao cliente).

### 2.10 Limitações (leia antes de ligar)

1. **A RLS por pessoa protege contra um `WHERE` esquecido, NÃO contra um Worker comprometido.** O Worker escolhe o `app.subject_id` (e pode ligar o modo de manutenção); quem controla o código do Worker lê a memória de todos. A defesa é: pseudônimo (o banco sozinho não identifica ninguém), ausência de texto livre e de dado de saúde por construção, papel sem DDL e a chave `MEMORY_SUBJECT_KEY` separada.
2. **Girar `MEMORY_SUBJECT_KEY` orfana toda a memória** (os pseudônimos mudam). É um reset; a varredura semanal apagaria os itens antigos.
3. **Cache de 5 minutos por isolate**: apagar um item invalida o cache do isolate que atendeu o pedido; em outro isolate o tutor pode usar o item por até 5 minutos. O **consentimento** não tem esse atraso. Dúvidas aprendidas pelo tutor aparecem no prompt só quando o cache expira.
4. **Corrida rara na escrita**: se a pessoa revoga no instante em que uma gravação em segundo plano termina, pode sobrar um item sem consentimento; a varredura semanal o apaga (em até 7 dias, não 24 h, só neste caso raro).
5. **Exclusão de conta** hoje é por SQL do responsável (não existe botão); o gatilho cobre esse caminho. Excluir o perfil sem o Worker configurado deixa a fila esperando até o banco de memória existir.
6. **Sem backup do banco de memória no fluxo atual** (`tools/backup` cobre o núcleo). Perdê-lo significa recomeçar a memória; ver o runbook.
7. A varredura semanal compara com consentimentos `granted`; aceite de versão antiga continua "vivo" (a pessoa pode reaceitar ou apagar).

### 2.11 Custo e orçamento (plano gratuito)

- **Neon Free**: o banco `laift-memory` só acorda com membro consentido usando o tutor/simulado ou na limpeza diária (que pula o banco quando não há ninguém consentido nem fila). Cache de 5 minutos por pessoa. Alerta manual em **70 CU-h** no mês.
- **Subrequisições** no caminho do tutor: leitura = 1 (consentimento, núcleo) + 1 (memória) e escrita = 1 (memória, em segundo plano) = **3** (2 com o cache quente), dentro do orçamento de ~20 por chamada (limite do plano: 50).
- **CPU**: as consultas são I/O; o HMAC (WebCrypto) e o mapeamento de palavras-chave são microssegundos. A varredura semanal calcula um HMAC por consentimento (teto de 300).
- Sem KV (plano gratuito: 1.000 gravações/dia).

### 2.12 API (alfa)

| Action | Quem | Rate limit | Observação |
|---|---|---|---|
| `apiMemoryGet` | membro/admin | `MEMORY_READ` 60/h | estado, consentimento, itens (só com consentimento vigente), vocabulário e limites |
| `apiMemorySetConsent` | qualquer sessão (ativar: membro/admin adulto) | `MEMORY_CONSENT` 10/h | `{ granted, purposeVersion }` |
| `apiMemorySetPreference` | membro/admin | `MEMORY_WRITE` 30/h | `{ kind, slug, level?, value? }`, só vocabulário |
| `apiMemoryDeleteItem` / `apiMemoryDeleteAll` | qualquer sessão | `MEMORY_WRITE` 30/h | apagar vale com a flag desligada |
| `apiMemoryExport` | membro/admin | `MEMORY_EXPORT` 5/dia | JSON legível (`laift-memory/v1`), sem ids internos |
| `apiAdminMemoryStats` | admin | – | consentimentos por situação, fila, totais; só números |
| `apiAdminPurgeMemberMemory` | admin + senha | `MFA_MANAGE` | `{ profileId, password, code? }` |
| `apiAdminAgentsStats` | admin | – | agregados de `agent_traces` (chamadas, tokens, latência, desfechos), 1–90 dias |

Erros (`success:false` + `code`): `MEMORY_DISABLED` (flag, papel, idade), `MEMORY_UNAVAILABLE` (sem banco/chave ou falha), `CONSENT_REQUIRED`, `MEMORY_FULL`, `RATE_LIMIT`, `VALIDATION`, `NOT_FOUND`. Documentado em `worker/openapi.yaml` (`npm run openapi`).

### 2.13 Falhas e o que o estudante vê

| Situação | Comportamento |
|---|---|
| Sem `DATABASE_URL_MEMORY` ou `MEMORY_SUBJECT_KEY` | `available: false`; o tutor funciona normal; o cron não toca no banco de memória; nenhuma consulta a mais |
| `memory_enabled` desligada | nada é lido nem escrito; apagar/revogar e a limpeza do cron seguem |
| Sem consentimento, revogado ou versão antiga | nada é lido nem escrito |
| Leitura falha ou passa de 1,2 s | o tutor segue sem memória; nada é escrito nessa pergunta |
| Escrita falha ou teto de 60 | perde o aprendizado, sem erro |
| Apagamento falha | revogação já vale; limpeza enfileirada; **falha fechada** (não finge que apagou) |

## 3. Testes

Banco de memória e núcleo em Postgres de verdade (PGlite), com o papel `laift_memory_worker` e a RLS valendo: `memoryMigration`, `memoryConsentMigration`, `memoryStore`, `memoryService`, `memoryCleanup`, `memoryHandlers`, `memoryTutor`, `memoryUnits`. O validador `npm run validate:sql` tem a passada 5 (banco de memória: RLS, DDL negado, down/up). O runner `tools/db/migrate.mjs --memory` aplica `sql/memory/` com o ledger `memory_schema_migrations`.

## 4. Simulação clínica com pacientes variados (ADR 0009)

Estado: **construída e DESLIGADA**. A flag `clinical_sim_enabled` fica `FALSE` e nenhum caso com `sim_profile` pode ser publicado até existir um **revisor clínico** (ainda indefinido, decisão do dono em 12/10/2026). Código em `worker/src/clinicalSim/` (módulos puros), `worker/src/services/clinicalSimService.js` (cola) e `worker/src/services/clinicalService.js`; migração `sql/037_clinical_sim.sql`; front `frontend/modulos/clinica/clinic-sim.js`.

### 4.1 O que é
A Clínica Virtual passa a poder sortear **como o paciente fala**, sem mexer em **quais são os fatos** do caso. É parâmetro novo de `apiLearnClinicalChat` e `apiLearnClinicalEvaluate` (`input.simulation`), **não** uma action nova (a ponte dos módulos só deixa passar `api(Learn|AdminAttendance|AdminAi|AdminLearn)*`). Não passa pelo `agentsService`: a persona `paciente-virtual` (rascunho, `0.2.0`) só empresta o texto-base e as regras de saída.

### 4.2 Eixos (`clinicalSim/axes.js`)
| Eixo | Valores |
|---|---|
| Personalidade (6) | direto, verboso, agradável, impaciente, desconfiado, ansioso |
| Letramento em saúde (3) | baixo, médio, alto |
| Recall do histórico (2) | alto, baixo |
| Confusão cognitiva (2) | lúcido, confuso |

Cada valor mapeia para um **trecho de prompt fixo e revisável** (`clinicalSim/catalog.js`, em português, sem dose nem diagnóstico). **O modelo nunca decide nem inventa o perfil**: ele só recebe os trechos, num bloco de DADOS. Combinação incoerente é removida do sorteio (confuso exige recall baixo). Os pesos mudam com a dificuldade do caso (básico, intermediário, avançado).

### 4.3 Determinismo
- `mulberry32(seed)` (`prng.js`); ordem de sorteio **fixa** (personalidade, letramento, recall, confusão), **um número do gerador por eixo, sempre**: mudar um peso não desloca os sorteios seguintes.
- `simId = sha256(caseId|seed|simVersion).slice(0, 12)` (`simId.js`, Web Crypto).
- O cliente envia só `{ seed, version, difficulty?, elapsedSeconds?, events? }`. **O servidor reconstrói os eixos a cada turno** a partir da semente; o cliente nunca informa os eixos. A fala do paciente (chat) **não devolve os eixos**; eles só aparecem no **debrief** (resposta da avaliação).
- Mudou peso, ordem ou trecho do catálogo = muda o paciente de cada semente: **suba `SIM_VERSION`** (`constants.js`). O teste dourado (`clinicalSimUnits.test.js`) falha se isso acontecer sem querer.
- Estado que evolui (`clinicalSim/state.js`): `evolve(state, eventos, dt)` é puro e imutável; estágios (`sim_profile.stages`) avançam por tempo e/ou evento e nunca voltam. O servidor refaz o estado a cada turno com o tempo e os eventos informados.

### 4.4 Quem pode simular, e com quais casos
Portões, nesta ordem: `input.simulation` presente, flag ligada para a pessoa, papel da persona (membro e admin), **maioridade** (`agents/eligibility.js`, a mesma regra do tutor), caso permitido. Sem a flag, ou sem o parâmetro, o caminho antigo roda **sem nenhuma consulta nova** e o prompt sai **byte a byte** igual (`clinicalSimService.test.js`, contra `test/fixtures/clinical-prompts-baseline.json`, gerado do código anterior).
- Casos **embutidos** (`patients.js`, conteúdo do repositório): permitidos.
- Casos do **acervo**: só com `sim_profile` (que só chega a `approved` com a revisão clínica, seção 4.6).
- Casos **gerados na sessão** (`ia`): nunca.

### 4.5 Segurança do que o paciente diz e da nota
- **Saída do paciente** passa por `checkOutput` com as regras da persona (O1, O3, O4, O5, O6): sem diagnóstico, antídoto ou nome de síndrome (O5), sem dose (O3), sem vazar o prompt (O4). Quando o guardrail troca a fala, entra uma frase **no personagem** ("Hum... não sei explicar direito...") e os avisos do tutor ("consulte a bula") nunca saem da boca do paciente. Consequência assumida (dose estrita): o paciente não diz número de comprimidos; o catálogo manda falar como leigo ("uma cartela", "um copo").
- **Entrada**: o chat clínico já não tinha guardrail de entrada (o estudante descreve exame físico, o que o I7 recusaria); a injeção é contida pelo prompt e pela saída.
- **Nota** (`clinicalSim/scoring.js`): pesos **hipótese 30, conduta 30, processo 20, comunicação adaptada 20**. O modelo só **sugere** a nota de cada componente; o servidor limita ao teto, aplica os tetos por fatos (sem hipótese escrita = 0 em hipótese; sem conduta = 0; nenhuma pergunta = 0 em processo e comunicação), soma e aplica o teto por desfecho (óbito 25, abandono 40). A "nota 100" do modelo é ignorada.
- **Gravação**: `learning_attempts.details.sim = { simId, seed, version, difficulty, axes, stage, persona, components }` (a coluna `details` jsonb já existia; não há tabela nova).
- Cota e limite de taxa são os do chat e da avaliação clínicos.

### 4.6 Revisão humana em dois passos (imposta no banco)
Caso com `sim_profile` só fica `approved` se **(1)** a lista de conferência tem os 4 itens verdadeiros (`semDadoReal`, `gabaritoConferido`, `estagiosPlausiveis`, `linguagemRevisada`) e **(2)** o revisor clínico é **outra pessoa** que o autor. Valem para a API e para qualquer SQL: CHECKs e o gatilho `clinical_sim_review_guard` (037). Editar `sim_profile` ou `payload` de caso publicado exige nova revisão e `content_version` maior. Caso gerado por IA continua `pending` e **nunca** leva `sim_profile` (CHECK `source = 'admin'`). A exclusão de conta do autor ou do revisor não trava nem invalida o acervo (FK `SET NULL`).

Aprovar pela API: `apiAdminLearnReviewCase` com `{ caseId, decision: 'approved', checklist: { semDadoReal: true, gabaritoConferido: true, estagiosPlausiveis: true, linguagemRevisada: true } }`, chamada por um admin diferente do autor. Sem `checklist` num caso com `sim_profile`, o banco recusa e a API devolve a mensagem clara.

`sim_profile` é inserido por SQL de um administrador (`source = 'admin'`); ainda não há tela para criar casos de simulação nem para o checklist (fica para quando houver revisor).

### 4.7 Por que está desligada e como ligar
Desligada porque o conteúdo clínico da simulação (estágios do quadro, gabarito, falas) exige conferência de um profissional antes de chegar ao estudante, e o dono ainda não definiu quem. Para ligar, **nesta ordem**:
1. Definir o revisor clínico (uma conta de administrador, diferente de quem cria os casos).
2. Aplicar a `sql/037_clinical_sim.sql` (staging, depois produção, com backup do Neon antes) e fazer o deploy do Worker e do front.
3. Cadastrar o primeiro caso com `sim_profile` (SQL) e aprová-lo pela revisão da seção 4.6. Casos embutidos já funcionam sem isso.
4. Ligar `clinical_sim_enabled` **só para admin** (`conditions: {"role": "admin"}`), testar em staging (aviso "Modo simulação (beta)" na Clínica, debrief no fim), depois ampliar por `rollout_pct`.
5. Aprovar a persona `paciente-virtual` (`status: active`, versão nova) quando o revisor aprovar o texto.

Desfazer: desligar a flag (efeito imediato). `sql/down/037_clinical_sim.sql` apaga as colunas novas.

### 4.8 API (alfa, beta no front)
| Action | Mudança |
|---|---|
| `apiLearnClinicalChat` | `input.simulation`. Com a flag, a resposta ganha `simulation: { simId, guardrails }`. |
| `apiLearnClinicalEvaluate` | `input.simulation`. Com a flag, a resposta ganha `simulation: { simId, version, difficulty, axes[], components, weights }` (debrief). |
| `apiLearnGetMyAiQuota` | Com a flag ligada para a pessoa, traz `simulation: { available: true, version }`; é assim que o módulo sabe se mostra o botão. Sem a flag o campo não existe. |
| `apiAdminLearnReviewCase` | `input.checklist` para casos com `sim_profile`. |

### 4.9 Limitações
- O "Modo simulação" só vale a partir do próximo caso e a semente é sorteada no navegador; quem chamar a API à mão pode escolher a semente e, nos casos embutidos, a dificuldade. Isso só altera o próprio treino e a própria nota.
- Quem chamar a avaliação no meio do caso vê os eixos antes do fim (custa uma avaliação da cota).
- A premissa de maioridade é a do tutor: conta existente = maior de 18 anos (ADR 0007).
- Testes: `clinicalSimUnits`, `clinicalSimMigration` (PGlite), `clinicalSimService` (inclui revisão com o banco de verdade) e `frontend/scripts/clinic-sim.test.mjs`.
