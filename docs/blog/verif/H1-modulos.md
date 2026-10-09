# H1: matriz de modulos e paineis voltados ao usuario

Checagem: 2026-10-09 | base origin/main 3bb5909 | HEAD do worktree 3bb5909 (antes do commit deste arquivo)

Agente H1 (blog-logica). Tarefa somente leitura. Nenhum npm, build, teste ou e2e foi rodado. Nenhum .env, .dev.vars, token ou chave foi aberto.

## 0. Escopo e metodo

- PASSO 0: `git rev-parse --show-toplevel` aponta para `.claude/worktrees/agent-acba4eaa0797d1022`. `git merge --no-edit feat/blog-plataforma` respondeu "Already up to date.". `git merge-base --is-ancestor 3bb5909 HEAD` respondeu base-ok. Pasta `docs/blog/verif` criada.
- Barras: frontend/index.html:251-297 (membro) e frontend/index.html:298-345 (admin).
- Codigo lido: frontend/app.js (data-nav, PANEL_LOADERS, setupNavigationForRole, setAdminMode), learning.js, home.js, hero.js, credential.js, messaging.js, msg-crypto.js, assistant.js, assistant-hints.js, assistant-feedback.js, modulos/shared/lia/lia.js, onboarding.js, mfa.js, admin-ai.js, admin-moderation.js, liga.js. Existencia de modulos/*/index.html conferida. Registro de actions em worker/src/handlers.js.
- Flags: worker/src/services/featureFlagService.js:117-131; sql/016_feature_flags.sql:26-30; sql/019_assistant.sql:21; sql/023_flags_v2.sql:46-60; docs/FEATURE_FLAGS.md.
- Testes: citados pelo nome do arquivo ou por grep. "(nome)" indica que so o nome foi conferido. Nada foi executado.
- Legenda da coluna "em producao?": [S] = docs registram publicacao do site e do Worker (docs/ANDAMENTO.md:6; docs/ANDAMENTO.md:137), sem registro por modulo. Para cada modulo, a execucao propria fica NAO CONFIRMADO.
- Legenda: M = barra do membro; F = fora da barra; Q = modulos dentro do Aprender; A = barra admin. O botao "Voltar" (frontend/index.html:340) nao e modulo e fica fora da matriz.

## 1. Producao: uma chamada publica

- Comando (o mesmo de docs/AMBIENTES.md:140; o payload tambem aparece em tools/ci/smoke.mjs:11-12):

```
curl -s https://api.laift.com.br/v1/ -H 'Content-Type: application/json' -d '{"action":"apiGetFeatureFlags","args":[]}'
```

- Hora UTC: inicio 2026-10-09T03:38:34Z; fim 2026-10-09T03:38:35Z.
- Resposta: `{"success":true,"flags":{"ux_v2_enabled":false,"chatbot_enabled":true}}`.
- Pares lidos: `ux_v2_enabled=false`; `chatbot_enabled=true`.
- Ausentes na resposta, lidas como "ausente (desligada)": `feedback_enabled`; `selection_open`.
- Nao lidas, porque nao sao publicas (worker/src/services/featureFlagService.js:120 e :131): rag_enabled, moderation_enabled, use_orchestrator, mfa_required, nvidia_fallback. Estado: NAO CONFIRMADO.
- (inferencia) `ux_v2_enabled=false` e `feedback_enabled` ausente batem com a migracao 023 ainda nao aplicada em producao (docs/ANDAMENTO.md:6; docs/CHANGELOG.md:57). A 016 cria ux_v2_enabled como FALSE (sql/016_feature_flags.sql:30). A 023 insere ux_v2_enabled como TRUE (sql/023_flags_v2.sql:47).
- chatbot_enabled=true: docs/ANDAMENTO.md:26 (2026-10-07) registra "segue desligada em producao". docs/ANDAMENTO.md:28 registra a ativacao planejada por UPDATE. Nao ha registro da execucao (secao 6). A 019 cria a flag como FALSE (sql/019_assistant.sql:21).

## 2. Numeros pedidos

- Modulos no Aprender: 5. learning.js:60-86 define MODULES (farmaco :62, toxico :67, clinica :72, lab :77, anatomia :82). learning.js:110 gera os cards a partir desse array. FISCAL_PATH (learning.js:88) nao esta em MODULES e so e usado em learning.js:358 (painel admin Fiscal). O pedido falava em 6. Ver D1.
- Questoes: 240 em cada banco, pelos comandos pedidos:

```
$ grep -c '^\s*{' frontend/modulos/quiz/questions.js                -> 240
$ grep -c 'question:' frontend/modulos/quiz/questions.js            -> 240
$ grep -c '^\s*{' frontend/modulos/toxicologia/questions.js         -> 240
$ grep -c 'question:' frontend/modulos/toxicologia/questions.js     -> 240
```

Os dois metodos batem nos dois arquivos. A etiqueta "240 questões" esta em learning.js:64 e learning.js:69.

## 3. Matriz

| ID modulo | o que faz | em producao? | atras de flag? | flag ligada em producao? | teste | rota/entrada | fato de arquitetura |
|---|---|---|---|---|---|---|---|
| M1 Inicio | Painel inicial: resumo e atalhos | [S] | nao no painel; o hero do login exige ux_v2_enabled e chatbot_enabled (hero.js:17) | ux_v2=false; chatbot=true | home.test.mjs; hero.test.mjs; e2e/home.e2e.js; worker/test/homeService.test.js | index.html:348 (secao) e :253 (botao); app.js:1074 | home.js:660 expoe window.LaiftHome; o resumo vem da action apiGetHomeSummary (handlers.js:132) |
| M2 Aprender (hub) | Hub com os 5 modulos e estatisticas do aluno | [S] | nao (learning.js sem checagem de flag) | n/a | learning-skeleton.test.mjs (nome); worker/test/learningService.test.js (nome) | index.html:362 (secao) e :257 (botao); app.js:1092 | learning.js:60-86 define MODULES; learning.js:110 gera os cards a partir dele |
| M3 Eventos (membro) | Lista de eventos e inscricao | [S] | nao (eventService.js sem checagem de flag) | n/a | worker/test/eventService.test.js (nome); e2e/home.e2e.js (cita panel-events) | index.html:397 e :261; app.js:1075 | inscricao: handlers.js:164 apiRegisterForEvent; regra em eventService.js:154 (registerForEvent) |
| M4 Propostas / votacao (membro) | Enviar proposta e votar | [S] | nao (proposalService.js sem checagem de flag) | n/a | NAO ENCONTRADO teste dedicado (secao 6); worker/test/handlers.test.js menciona proposta | index.html:411 e :265; app.js:1076 | voto: handlers.js:171 apiCastVote; regra em proposalService.js:61 (castVote) |
| M5 Tarefas (membro) | Inscricao em tarefas e comentarios | [S] | nao (taskService.js sem checagem de flag) | n/a | worker/test/taskService.test.js (nome); e2e/qa-full.e2e.js (cita panel-tasks) | index.html:439 e :271; app.js:1077 | inscricao: handlers.js:176 apiSignupForTask; regra em taskService.js:90 (signupForTask) |
| M6 Equipe / organograma | Arvore da Liga e conexoes entre membros | [S] | nao | n/a | worker/test/orgChartService.test.js (nome); worker/test/connectionService.test.js (nome); frontend/scripts/nav-a11y.test.mjs (cita panel-orgchart) | index.html:448 e :277; app.js:1078 | arvore: handlers.js:202 apiGetOrgChart; renderOrgChartTree em app.js:1571 |
| M7 Mensagens E2EE | Mensagens com cifra no navegador: X25519, HKDF, AES-GCM | [S] | nao (messaging.js e msg-crypto.js sem checagem de flag) | n/a | worker/test/messageService.test.js (nome); worker/test/messagingKeyService.test.js (nome); frontend/scripts/verify-msg-crypto.js (script) | index.html:484 e :283; app.js:1091; messaging.js:852 expoe LaiftMessaging | cifra no cliente: msg-crypto.js:170 (X25519), :226 (AES-GCM-256 por HKDF), :281 (encrypt); chaves publicas em handlers.js:222-224 |
| M8 Perfil | Dados pessoais e preferencias | [S] | nao | n/a | worker/test/profileService.test.js (nome); e2e/mfa.e2e.js (cita panel-profile) | index.html:521 e :289; app.js:1079 | servidor: handlers.js:115-117 (get e update do perfil; preferencias) |
| M9 Admin (entrada) | Troca a barra inferior pela area admin; so para papel admin | [S] | nao; visibilidade por papel em app.js:1044 | n/a | frontend/scripts/nav-a11y.test.mjs (cita btn-enter-admin-mode, nav-group-admin ou setAdminMode) | index.html:293; app.js:1069 | app.js:1062 setAdminMode troca a barra no front; index.html:247-249: autorizacao so no Worker |
| F1 Credencial / cracha virtual | Cartao com papel e QR de presenca assinado pelo Worker | NAO CONFIRMADO por modulo; #36 mesclada (docs/ANDAMENTO.md:157); publicacao com #36 nao registrada (docs/ANDAMENTO.md:28) | nao (credential.js sem checagem de flag) | n/a | frontend/scripts/credential.test.mjs; e2e/credential.e2e.js; e2e/qr.e2e.js | index.html:376 (botao em panel-learn); credential.js:270 (open) | QR assinado no servidor: credential.js:305 chama apiLearnGetMyAttendanceQr; handlers.js:244 |
| F2 Lia (assistente) | Guia que orienta e leva as telas; chat com IA para quem esta logado | Leitura de 2026-10-09 mostra flag ligada. Docs: desligada em 2026-10-07 (docs/ANDAMENTO.md:26); ativacao posterior NAO CONFIRMADO | chatbot_enabled (assistant.js:92-93; assistantService.js:46) | sim (chatbot_enabled=true) | assistant.test.mjs; assistant-hints.test.mjs; assistant-moderation.test.mjs; lia.test.mjs e outros 6 lia*.test.mjs; e2e/assistant.e2e.js; e2e/lia-estados.e2e.js; worker/test/assistantService.test.js | assistant.js:620-623 (botao flutuante); handlers.js:140 apiAssistantChat | assistant.js:620-623 esconde o botao sem a flag; assistantService.js:122 confere a flag no servidor |
| F3 Feedback da Lia | Polegar e comentario sobre as respostas | nao: feedback_enabled ausente na leitura; 023 pendente (docs/ANDAMENTO.md:6) | feedback_enabled (assistant-feedback.js:39; assistantFeedbackService.js:26) | ausente (desligada) | assistant-feedback.test.mjs; worker/test/assistantFeedbackService.test.js | assistant.js:274-276 (mostra so com a flag); handlers.js:145 apiAssistantFeedback | assistantFeedbackService.js:92 devolve disabledReply sem a flag |
| F4 Onboarding | Passos por papel apos o login; passo da Lia so com a flag de chat | NAO CONFIRMADO por modulo; #40 com data de mescla 2026-10-08 (docs/CHANGELOG.md:3 e :23); publicacao nao registrada | nao para o fluxo; o passo da Lia depende de data-flag-chatbot-enabled (onboarding.js:144) | chatbot=true | onboarding.test.mjs; e2e/onboarding.e2e.js | app.js:937 (maybeShow); onboarding.js:321 expoe LaiftOnboarding | onboarding.js:144 checa o atributo no html; sem ele nao ha passo da Lia (e2e/onboarding.e2e.js:193) |
| F5 MFA (verificacao em duas etapas) | Codigo TOTP no login e codigos de recuperacao | NAO CONFIRMADO para o recurso; MFA_ENCRYPTION_KEY cadastrada em producao em 2026-10-07 (docs/ANDAMENTO.md:26) | mfa_required (mfaService.js:41 e :196); reservada (featureFlagService.js:131) | NAO CONFIRMADO (nao publica) | mfa.test.mjs; e2e/mfa.e2e.js; worker/test/mfaService.test.js; worker/test/mfaTotp.test.js; worker/test/mfaGate.test.js | handlers.js:98 apiLoginMfa; mfa.js:277 expoe LaiftMfa | featureFlagService.js:117-118 deixa as flags de seguranca fora do navegador |
| F6 Liga (pagina publica) | Pagina de inscricao; CTA so com selection_open ligada | NAO CONFIRMADO; docs dizem em andamento (docs/CHANGELOG.md:7; docs/ANDAMENTO.md:147); git registra PR #42 mesclada (04eb9de) | selection_open (liga.js:63) | ausente (desligada) | e2e/liga.e2e.js; sem teste unitario (secao 6) | frontend/liga.html; liga.js:6 | liga.js:63 le selection_open; a chave nao e semeada em sql/; ausente = fechado (featureFlagService.js:119) |
| Q1 Farmacologia Basica | Simulador com 240 questoes | [S] | nao | n/a | e2e/quiz-farmaco.e2e.js; e2e/smoke.e2e.js (cita modulos/quiz); worker/test/learningService.test.js (nome) | learning.js:62; learning.js:266 (createFrame) | modulo em iframe (learning.js:266 e :300); tentativa em handlers.js:242 apiLearnSubmitQuizAttempt |
| Q2 Toxicologia clinica e forense | Intoxicacoes, defensivos, animais peconhentos, antidotos; etiqueta OpenFDA | [S] | nao | n/a | NAO ENCONTRADO teste unitario ou e2e dedicado (secao 6); e2e/parsers.e2e.js cita modulos/toxicologia | learning.js:67 | etiqueta 'OpenFDA' e "240 questões" em learning.js:69; questoes em modulos/toxicologia/questions.js (240) |
| Q3 Clinica Medica Virtual (OSCE) | Plantao multipaciente, acervo, preceptor com IA | [S] | nao | n/a | worker/test/clinicalService.test.js (nome); NAO ENCONTRADO teste de frontend (secao 6) | learning.js:72 | IA no servidor: handlers.js:255-259 (apiLearnClinical*) |
| Q4 Laboratorio Virtual | Ensaios de bancada, sinteses, identificacao, estudio 3D; preceptor com IA | [S] | nao | n/a | frontend/scripts/lab-preceptor.test.mjs; e2e/csp.e2e.js; e2e/parsers.e2e.js (citam modulos/laboratorio) | learning.js:77 | preceptor no servidor: handlers.js:260 apiLearnLabPreceptor; aviso 'degraded' pendente (docs/ANDAMENTO.md:172) |
| Q5 Anatomia e farmacocinetica 3D | Corpo humano 3D, PK e vias metabolicas; telemetria do Atlas | [S] | nao (ver NAO ENCONTRADO sobre a flag "telemetry") | n/a | frontend/scripts/atlas/*.test.mjs (unitarios); frontend/scripts/e2e/atlas*.e2e.js (25 arquivos) | learning.js:82; learning.js:281 (frame com #sid) | telemetria no servidor: handlers.js:266-267; tabela criada em sql/014_atlas_telemetry.sql |
| A1 Painel (admin) | Metricas gerais | [S] | nao | n/a | frontend/scripts/admin-dashboard-chart.test.mjs; worker/test/adminService.test.js (nome) | index.html:605 e :299; app.js:1083 | dados: handlers.js:182 apiAdminDashboard |
| A2 Usuarios (admin) | Listar, mudar papel, banir e desbanir | [S] | nao | n/a | worker/test/adminService.test.js (nome); e2e/qa-full.e2e.js (cita panel-admin-users) | index.html:617 e :303; app.js:2028 | handlers.js:183-186 (listar, papel, banir, desbanir) |
| A3 Eventos (admin) | Criar eventos, mudar status, listar | [S] | nao | n/a | worker/test/eventService.test.js (nome; cobertura de admin nao verificada) | index.html:630 e :307; app.js:2196 | handlers.js:188-190 (criar, status, listar) |
| A4 Propostas (admin) | Revisar propostas e mudar estado | [S] | nao | n/a | NAO ENCONTRADO teste dedicado (secao 6); e2e/qa-full.e2e.js (cita panel-admin-proposals) | index.html:669 e :311; app.js:2273 | handlers.js:191-192 (revisao e transicao) |
| A5 Tarefas (admin) | Criar tarefas e mudar status | [S] | nao | n/a | worker/test/taskService.test.js (nome); e2e/qa-full.e2e.js (cita panel-admin-tasks) | index.html:677 e :315; app.js:2368 | handlers.js:193-195 (criar, status, listar) |
| A6 Feedback (admin) | Feedback da Lia: lista, atualizacao, estatisticas | [S] | nao no painel; a coleta depende de feedback_enabled | ausente (desligada) | assistant-feedback.test.mjs; worker/test/assistantFeedbackService.test.js | index.html:703 e :319; app.js:2405 | handlers.js:146-148 (admin de feedback) |
| A7 Auditoria | Consulta de audit_logs | [S] | nao | n/a | worker/test/adminService.test.js (cita audit); NAO ENCONTRADO teste de auditService.js (secao 6) | index.html:711 e :323; app.js:2453 | handlers.js:196 apiAdminListAuditLogs |
| A8 Denuncias | Listar e resolver denuncias de perfis | [S] | nao | n/a | NAO ENCONTRADO teste dedicado (secao 6); e2e/qa-full.e2e.js (cita panel-admin-reports) | index.html:740 e :327; app.js:2515 | denuncia de perfil: handlers.js:216 apiReportProfile; resolucao em handlers.js:218 |
| A9 Fiscal (terminal fiscal) | Check-in de presenca por QR, busca, badges e CSV | [S] | nao | n/a | e2e/fase2.e2e.js; e2e/qr.e2e.js; worker/test/attendanceService.test.js (nome) | index.html:761 e :331; learning.js:355-358 | iframe modulos/fiscal/index.html (FISCAL_PATH em learning.js:88, usado em :358); acoes em handlers.js:245-249 |
| A10 IA (painel de IA) | Saude das chaves, uso, cotas e metricas | [S] | nao | n/a | frontend/scripts/admin-ai.test.mjs; e2e/ai-metrics.e2e.js; worker/test/aiMetrics.test.js (nome) | index.html:771 e :336; app.js:1095 | admin-ai.js:757 expoe LaiftAdminAi; dados em handlers.js:262-263 |
| A11 Moderacao da Lia (admin, dentro de IA) | Agregados e por pessoa: nivel, suspensao, redencao; sem nome | [S] na tela (docs/ANDAMENTO.md:87); docs/AMBIENTES.md:271 diz que nao ha tela (D5) | nao no painel; a moderacao da Lia depende de moderation_enabled (moderationService.js:167 e :182) | NAO CONFIRMADO (nao publica; 023 pendente, sql/023_flags_v2.sql:51) | admin-moderation.test.mjs; e2e/admin-moderation.e2e.js; worker/test/moderationService.test.js; worker/test/moderationGate.test.js | index.html:771 (mesma secao da IA); app.js:1097 | admin-moderation.js:338 expoe LaiftAdminModeration; handlers.js:219 apiAdminAssistantModeration |

## 4. Divergencias

- D1. O pedido fala em "6 modulos" no Aprender. A contagem real e 5 (learning.js:60-86). O sexto item citado seria o Terminal fiscal (learning.js:88), que e admin e fica fora do hub (learning.js:358).
- D2. docs/FEATURE_FLAGS.md:22 lista 3 chaves publicas (ux_v2_enabled, chatbot_enabled, feedback_enabled). worker/src/services/featureFlagService.js:120 tem 4 (inclui selection_open). A chave selection_open nao aparece em sql/ (secao 6).
- D3. docs/AMBIENTES.md:142 diz "Esperado ... chatbot_enabled false" no passo 2.1, antes da ativacao. A leitura de 2026-10-09T03:38:34Z mostra chatbot_enabled=true. Os docs nao registram quando a flag foi ligada (secao 6).
- D4. Liga e estado de merges. docs/CHANGELOG.md:7 diz "em andamento nas branches docs/ops-rotina-2026-10 e feat/liga-identidade". docs/ANDAMENTO.md:147 diz "Etapa 1 em andamento na feat/liga-identidade". `git log --merges` na base 3bb5909 mostra 990eadf (PR #41, docs/ops-rotina-2026-10), 04eb9de (PR #42, feat/liga-identidade) e 3bb5909 (PR #43, fix/usabilidade-plano-mestre). Docs e git nao batem. Qual vale: a definir pela diretoria.
- D5. docs/AMBIENTES.md:271 diz "não há tela no front para a moderação nem para a redenção". frontend/admin-moderation.js existe e os docs registram a tela criada (docs/ANDAMENTO.md:87 e :100).
- D6. docs/ANDAMENTO.md:14 (2026-10-05) diz que a producao estava na migracao 015. Essa situacao foi superada por docs/ANDAMENTO.md:26 (2026-10-07). Registro historico, sem conflito.

## NAO CONFIRMADO / NAO ENCONTRADO

- NAO CONFIRMADO: estado em producao de rag_enabled, moderation_enabled, use_orchestrator, mfa_required e nvidia_fallback. Procurado: a leitura publica unica (secao 1) nao devolve essas chaves (featureFlagService.js:120). docs/ANDAMENTO.md:26 cita use_orchestrator ligada em 2026-10-07, sem leitura posterior.
- NAO CONFIRMADO: quando e por quem chatbot_enabled foi ligada em producao. Procurado: docs/ANDAMENTO.md:26-28 e :157; docs/AMBIENTES.md; docs/CHANGELOG.md. Nenhum registro de execucao.
- NAO CONFIRMADO: publicacao em producao por modulo (M1-M9, F1-F6, Q1-Q5, A1-A11). Procurado: docs/ANDAMENTO.md:6 e :137; docs/CHANGELOG.md; docs/AMBIENTES.md. Ha registro so de site e Worker.
- NAO CONFIRMADO: publicacao do cracha e da Lia da #36 no site. Procurado: docs/ANDAMENTO.md:28 (conferir o site apos mesclar #35 e #36) e :157.
- NAO CONFIRMADO: publicacao do onboarding (#40). Procurado: docs/CHANGELOG.md:3 e :23-30. Sem registro de deploy.
- NAO CONFIRMADO: estado da Liga em producao e no git. Procurado: docs/CHANGELOG.md:7; docs/ANDAMENTO.md:147; `git log --merges` (D4).
- NAO CONFIRMADO: vagas, datas e pesos da Liga. Procurado: docs/ANDAMENTO.md:147, que registra "a definir pela diretoria".
- NAO CONFIRMADO: estado em producao da moderacao da Lia (A11). Procurado: docs/AMBIENTES.md:271 e docs/ANDAMENTO.md:87 (D5).
- NAO CONFIRMADO: integracao real com OpenFDA em Q2. Procurado: learning.js:69 (so a etiqueta). modulos/toxicologia/app.js nao foi lido em profundidade.
- NAO CONFIRMADO: aviso 'degraded' do preceptor de laboratorio (Q4). Procurado: docs/ANDAMENTO.md:172, que registra a pendencia. frontend/modulos/laboratorio/js/lab-preceptor.js nao foi lido.
- NAO CONFIRMADO: resultado de qualquer teste listado. Nenhum foi executado, por regra da tarefa.
- NAO CONFIRMADO: cobertura real de 80% em qualquer modulo. Nao foi medida.
- NAO CONFIRMADO: cobertura de admin em Eventos (A3) e Tarefas (A5). Conferido apenas o nome do arquivo de teste.
- NAO CONFIRMADO: flag de telemetria do Atlas ligada ou desligada. Procurado: frontend/admin-ai.js:332 (texto); worker/src/services/atlasTelemetryService.js sem checagem de flag (grep sem resultado).
- NAO ENCONTRADO: chave de flag "telemetry" citada em frontend/admin-ai.js:332. Procurado: grep -rn 'telemetry' em worker/src, frontend/*.js, frontend/modulos e sql/. So aparece como texto.
- NAO ENCONTRADO: selection_open em sql/. Procurado: grep -rn selection_open sql/ (sem resultado). Ela aparece so em worker/src/services/featureFlagService.js:119-120.
- NAO ENCONTRADO: teste dedicado a Propostas (M4 e A4). Procurado: worker/test/proposalService.test.js (inexistente, ls worker/test) e grep 'roposal' em worker/test (so handlers.test.js, homeService.test.js, profileService.test.js).
- NAO ENCONTRADO: teste dedicado a Denuncias (A8). Procurado: grep 'report' e 'eport' em worker/test e frontend/scripts. Nenhum arquivo dedicado.
- NAO ENCONTRADO: teste dedicado a Auditoria (A7, auditService.js). Procurado: ls worker/test, sem auditService.test.js.
- NAO ENCONTRADO: teste unitario da Liga (F6). Procurado: ls frontend/scripts com filtro liga (sem resultado). So existe e2e/liga.e2e.js.
- NAO ENCONTRADO: teste de frontend da Clinica (Q3). Procurado: grep 'modulos/clinica' em frontend/scripts e worker/test (sem resultado).
- NAO ENCONTRADO: teste de Toxicologia alem de e2e/parsers.e2e.js (Q2). Procurado: grep 'toxicologia' em frontend/scripts e worker/test.
