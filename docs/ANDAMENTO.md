# Andamento do Plano v5 — onde paramos

**Atualizado em 2026-10-08.** Para retomar: leia a seção "Atualização de 2026-10-08" (logo antes de "Pull requests"), depois `docs/AMBIENTES.md` (runbook de ativação) e `docs/riscos-residuais.md`. O plano completo, com DoD e rollback por fase, está em `C:\Users\Administrador\.claude\plans\c-users-administrador-desktop-an-lise-c-merry-reddy.md`.

## Em uma frase
A UX v2 (fases A a E), a Lia viva, o RAG, o feedback e a moderação estão prontos e testados no PR único `feat/v5-ux-fundacao`, atrás de feature flags. **Nada disso está em produção** até você mesclar e seguir a ordem do runbook de `docs/AMBIENTES.md`. Mesclar sozinho não muda o comportamento: a migração 023 só liga as flags da renovação quando for aplicada, e ela não religa o que um admin já desligou.

## Atualização de 2026-10-05 — por que o laift.com.br não refletia a F2/F3
- **A #27 foi mesclada** (02:32 UTC). A **API** de produção foi republicada na hora (`deploy-worker.yml` dispara em push na `main`).
- **O site não subiu**: `deploy-frontend-cloudflare.yml` só rodava à mão. Isto está corrigido na branch `feat/v5-ativacao` (PR para a `main`): o workflow passa a publicar sozinho no push em `main` (produção) e `staging` (homologação), com testes unitários + e2e `csp smoke` antes e `tools/ci/smoke.mjs` depois. `deploy-staging.yml` também publica no push de `staging`. Fluxo completo, rollback e passos únicos: **`docs/AMBIENTES.md`**.
- **Novo:** `tools/db/migrate.mjs` (runner com `schema_migrations`, `--dry-run`, `--baseline-through`) e `tools/ci/smoke.mjs`, ambos com testes (18 + 13).
- **Os bancos ainda não têm as migrações 016–018** (produção `plataforma-membros` e staging `laift-staging` estão na 015). Por isso flags, MFA e orquestrador seguem desligados. Rode o `--baseline-through 015` e depois o runner (`docs/AMBIENTES.md`).
- **Google Ads:** o commit `847ecc2` (script do AdSense no `index.html`) quebrava o e2e `csp` e barraria a publicação do site. Por decisão do usuário (2026-10-06) o script **saiu do `index.html`** por enquanto; para recolocar, o texto está no `847ecc2`, mas antes é preciso liberar `pagead2.googlesyndication.com` (e os demais domínios do AdSense) no CSP da página e ter aviso de consentimento + Privacidade atualizados.
- **Fora deste lote (próximos passos):** chave do OpenRouter (`gh secret set` pelo script), `MFA_ENCRYPTION_KEY`, ligar `use_orchestrator`, guia "Lia", atalho de promoção, RAG híbrido.

## Atualização de 2026-10-07 — Lia, crachá virtual e orquestrador (branch `feat/v5-lia-cracha`)
- **Lia** (guia da plataforma; orienta e leva às telas, **nunca altera dados**): `worker/src/assistant/{targets,kb}.js`, `services/assistantService.js`, action `apiAssistantChat` (sessão opcional), flag `chatbot_enabled`, migração **019**. Intenção por regra primeiro (sem IA); eventos com dado vivo só do que a própria pessoa já vê; IA só para quem está logado, tem cota (`assistant`: membro 25, admin 60, visitante 0) e fez pergunta sem intenção; botões só da lista branca por papel; texto da IA nunca vira botão. Front: `frontend/assistant.js`.
- **Crachá virtual**: `frontend/credential.js` (cartão com papel, "membro desde", QR assinado, ampliar QR, salvar imagem PNG). Abre pelo hub, por qualquer `[data-open-credential]` e pela Lia.
- **Orquestrador**: o código está pronto desde a #27; falta ligar. Ver o passo a passo em `docs/AMBIENTES.md` ("Ligar e desligar recursos") e o script `tools/ci/gerar-segredo-mfa.ps1`.
- **Revisões** (`code-reviewer` + `security-reviewer`) feitas e corrigidas: cache compartilhado só para membro, injeção também no histórico, sessão expirada com a Lia aberta, contraste do cartão no tema escuro, QR ampliado a 375 px, corrida no envio, colisões de palavra-chave. Riscos aceitos: O13–O16 em `docs/riscos-residuais.md`.
- **Números**: Worker 997 testes, 19 migrações válidas, front 115 unitários (+2 falhas só no Windows por fim de linha), e2e `assistant credential csp smoke fase2 mfa home` verdes.
- **Ativação feita em 2026-10-07**:
  - **Staging** (`laift-staging`): migrações 016–019 + ledger `schema_migrations` (19 linhas), `MFA_ENCRYPTION_KEY` própria, flags `use_orchestrator` e `chatbot_enabled` ligadas; API e site publicados a partir da branch `feat/v5-lia-cracha` (deploy manual); Lia respondendo em `staging.laift.com.br`.
  - **Produção** (`plataforma-membro`): branch de backup `backup-pre-016-019-2026-10-07` no Neon, migrações 016–019 + ledger, `MFA_ENCRYPTION_KEY` própria cadastrada e **`use_orchestrator` ligada** (registrada em `audit_logs`). 6 perfis intactos, 0 erros depois. `chatbot_enabled` **segue desligada em produção** até as PRs #35 e #36 serem mescladas e o site/API novos publicados.
  - Cópias das chaves do MFA em `Desktop\segredo-mfa-staging.txt` e `segredo-mfa-producao.txt`: guardar no cofre e apagar.
- **Depois de mesclar #35 e #36** (nessa ordem, a #36 reapontada para a `main`): conferir o site em `laift.com.br` e ligar a Lia com `UPDATE feature_flags SET enabled = TRUE WHERE key = 'chatbot_enabled'` (ver `docs/AMBIENTES.md`).
- **Pendências**: o Environment `staging` do GitHub só aceita as branches `feat/*`, `fix/*` e `main` (a branch `staging` foi recusada: adicionar `staging` à regra para o deploy por push funcionar); o Trivy acusa `sharp` HIGH em `tools/atlas-pipeline` (GHSA-wq5f-xc86-pv6w, corrigido na 0.35.5); apagar a branch de backup do Neon depois de alguns dias.

## Atualização de 2026-10-08 — UX v2, Lia viva, RAG, feedback e moderação (branch `feat/v5-ux-fundacao`)

**Entrega única.** Um PR só, a partir de `feat/v5-ux-fundacao` (74 commits acima da `main`, com merges). Tudo está atrás de feature flags. A ativação é do dono, pelo runbook de `docs/AMBIENTES.md`, seção "Ativação da UX v2, Lia viva, RAG, feedback e moderação".

### O que entrou
- **Fase A, fundação visual** (`ux_v2_enabled`): tokens de cor, movimento e vidro v5 (`frontend/modulos/shared/laift-tokens.css`, `frontend/ux-glass.css`, com teste de contraste WCAG); visual sem borda de cartão sob `:root[data-flag-ux-v2-enabled]`; hover só com ponteiro fino.
- **Fase B, Início editorial e séries** (`frontend/home-editorial.css`, `frontend/dashboardAdapter.js`): layout sem cards; séries temporais em `worker/src/services/timeseriesService.js`, entregues numa chamada (`apiGetMyDashboardSeries`) e limitadas por perfil. Uma série com falha vem como `null`. Gráficos em SVG, sem biblioteca (`frontend/modulos/shared/charts.js`).
- **Fase C, Lia viva** (`chatbot_enabled`): personagem SVG em `frontend/modulos/shared/lia/` (`lia.svg`; núcleo em `lia.js`; animações WAAPI em `lia-anim.js`; estados em `lia-states.js`; humor e variações de fala em `lia-mood.js`). Micro-card de feedback em `frontend/assistant-feedback.js`. A moderação aparece na conversa como resposta da própria Lia.
- **Fase D, RAG, feedback, moderação e retenção**:
  - RAG híbrido: trigramas e vetor (`@cf/baai/bge-m3` no pgvector), fundidos por RRF com piso por lista, atrás de `rag_enabled` (`worker/src/services/ragService.js`; migração 020). As fontes aparecem como texto, sem link.
  - Feedback por resposta (polegar, categoria e comentário de até 500 caracteres) e painel "Satisfação da Lia" em `frontend/admin-ai.js` (migração 021; `feedback_enabled`).
  - Moderação com 4 níveis (0 a 3); juiz por LLM só quando há termo ofensivo; redenção com reivindicação atômica e intervalo de 1 h; decaimento de 1 nível a cada 30 dias (`worker/src/services/moderationService.js`, `worker/src/assistant/moderationGate.js`; migração 022; `moderation_enabled`).
  - Retenção da Lia (ADR 0005) em tarefas isoladas da faxina diária (`worker/src/maintenance.js`).
- **Fase E, polimento e QA visual**: esqueleto e estado de erro com nova tentativa nas listas; navegação inferior com 8 abas em 375 px; `frontend/scripts/e2e/visual-qa.e2e.js` (claro e escuro, 375×812 e 1280×800).
- **Banco**: 020 (RAG, `kb_chunks`), 021 (feedback e mensagens), 022 (moderação), 023 (flags da renovação) e 024 (índices de `rate_limit_buckets`, `event_registrations`, `task_signups` e `learning_attempts`).

### Números
- **Worker:** 48 suítes (48 arquivos em `worker/test`, conferido); 117 actions no `API_REGISTRY` (conferido); 1324 testes (número da última execução do dono, não reexecutado nesta revisão; a contagem estática dá 827 blocos `test(`/`it(` e 56 chamadas `.each(`).
- **Migrações:** 001 a 024 (24 arquivos em `sql/`; `npm run validate:sql` não foi rodado nesta revisão).
- **Front:** ~421 testes (número do dono, não reexecutado) em 17 arquivos `frontend/scripts/*.test.mjs`. Duas falhas conhecidas, só no Windows, nos testes de `_headers` (`seo.test.mjs` e `staging.test.mjs`): nesses dois arquivos, 19 de 21 passam. A causa é o CRLF do checkout; no índice do git, `frontend/_headers` está em LF.

### Decisões do dono
- Um PR único.
- As cinco flags da renovação nascem **ligadas**, mas a 023 **nunca religa o que um admin desligou**: `ux_v2_enabled` e `chatbot_enabled` só são ligadas se `updated_by` for NULL e não houver `SET_FEATURE_FLAG` para a chave em `audit_logs`. As outras três só entram se estiverem ausentes. Regra completa em `sql/023_flags_v2.sql`.
- Arte da Lia aprovada em 2026-10-08 (ADR 0003): cabeça:corpo ≈ 1:3,1, mecha lateral no lugar dos óculos, traço único de 2,2, cantos de 8 px, paleta da marca.

### O que você precisa fazer
1. Antes de tudo: os pré-requisitos da seção 1 do runbook (branch de backup no Neon, secrets, `MFA_ENCRYPTION_KEY`, chaves de IA, binding `[ai]`, testes) e a homologação validada.
2. Mesclar o PR. A `main` publica a API (`deploy-worker.yml`) e o site (`deploy-frontend-cloudflare.yml`). Não há migração automática em produção.
3. Migrar 020, 021, 022 e 024 (lote sem a 023) e depois reindexar o acervo da Lia.
4. Aplicar a 023 por último; conferir as cinco flags e a auditoria.

Ordem e comandos exatos: `docs/AMBIENTES.md`.

### Pendências conhecidas
- **Re-aceite da Política não existe.** `LEGAL_VERSIONS.PRIVACY` (2026-10-08) só é gravado no cadastro (`worker/src/services/authService.js`). Quem já tem conta não tem registro dessa versão.
- **Exclusão de conta é manual.** Não há ação de exclusão no `API_REGISTRY`.
- **Limiar vetorial sem calibração.** `MIN_VECTOR_SCORE` (0,45, em `worker/src/constants.js`) só pode ser calibrado no staging, com o modelo real. O PGlite não executa a busca vetorial (`worker/test/ragEval.test.js`).
- **PGlite não valida pgvector nem HNSW.** A sintaxe do índice `hnsw` de `sql/020_rag.sql` só é conferida no Neon (`worker/scripts/pgvector-shim.mjs`).
- **Reindexação depende dos bindings `[ai]`** (produção) e `[env.staging.ai]` (staging), ambos presentes em `worker/wrangler.toml`. Sem eles, `embeddingAvailable` vem `false` e a busca fica só com trigramas.
- **Folhas decorativas podem cobrir texto.** `frontend/styles.css` (linhas 72 a 104, `.leaf-field` e `.leaf`) ficam atrás do conteúdo e podem cobrir texto em alguns pontos. Conferir no QA visual.
- **Cache semântico não usa os trechos do RAG.** Uma resposta vinda do cache (validade de 7 dias) não traz fontes.
- **Hash da pergunta é reversível por dicionário** para quem lê o banco: `assistant_messages.question_hash` é o SHA-256 de `profile_id:pergunta normalizada`, e o `profile_id` fica na mesma linha. Nenhuma API devolve esse hash.
- **Política × auditoria.** A Política (seção 7) diz que incidentes saem em 365 dias, mas `assistant_incident` é gravado em `audit_logs` (`worker/src/services/moderationService.js`), que guarda 730 dias.
- **Redenção e estados de moderação sem tela.** `apiAssistantRedeem` e `apiAssistantModerationState` não são chamadas pelo front. A Lia não aciona os estados `alert`, `warning` e `suspended`. Não há tela de moderação do admin (o ADR 0004 prevê uma; hoje existe só `apiAdminAssistantModeration`).
- **Chart.js por CDN.** `frontend/index.html` (linha 927) carrega Chart.js 4.5.1 do jsdelivr para o gráfico do painel administrativo (`frontend/app.js`, `renderAdminDashboardChart`). Isso contraria a regra "nenhum script ou CDN de terceiros" de `docs/TIME_CONTRATO.md`. Os gráficos novos não dependem dele.
- **Blocos locais de movimento reduzido.** Além do bloco único de `frontend/modulos/shared/laift-tokens.css`, outros 14 arquivos CSS ainda têm `prefers-reduced-motion` (por exemplo `frontend/ux.css` e `frontend/modulos/anatomia-3d/css/atlas.css`). Isso fica fora da regra "um único bloco" do ADR 0002.
- **Desligar por SQL não é protegido.** Um `UPDATE` de `feature_flags` não grava `updated_by` nem auditoria; se a 023 for reaplicada num banco em que `ux_v2_enabled` ou `chatbot_enabled` foi desligada assim, ela religa. Para decisões que devem durar, use `apiAdminSetFeatureFlag`.
- **Documentação desatualizada fora deste escopo.** `docs/DEPLOYMENT.md` (seção 1) ainda diz "migrações 001–023" e que a 023 liga as flags inclusive as desligadas. Corrigir em PR própria.
- **Staging aplica tudo antes da API.** Se `STAGING_DATABASE_URL` existir, o push em `staging` roda o runner inteiro, incluindo a 023, antes de publicar a API (`.github/workflows/deploy-staging.yml`).
- **Riscos novos** registrados em `docs/riscos-residuais.md` (O17 a O31). Itens adiados com gatilho, em `docs/backlog-futuro.md`, seção "Lia e RAG".

## Pull requests
| PR | Branch | O que traz | Estado |
|---|---|---|---|
| #16 | `feat/v5-fundacao` | F0: staging, retenção de logs, provedores de IA (Groq/NVIDIA), CI, docs | **Mesclada** |
| #25 | `feat/v5-ux-base` | F1 parcial: base visual, PWA, painel Início | **Mesclada na `main`** |
| #26 | `feat/v5-seguranca` | F2 + F3 + pipeline de segurança + backup | Mesclada **na branch `feat/v5-ux-base`, não na `main`** (a #25 já tinha entrado, a base empilhada ficou para trás). Não vale mais |
| **#27** | `feat/v5-seguranca` | Os mesmos F2 + F3, mais as correções finais, direto para a `main` | **Mesclada na `main` em 2026-10-05** |

Lição: com PRs empilhadas, depois de mesclar a de baixo, **reaponte a de cima para a `main`** antes de mesclar (ou mescle a de cima primeiro).

## O que está pronto
- **F2 Segurança:** feature flags (`sql/016`), MFA TOTP com códigos de recuperação e reautenticação no reset (`sql/017`), limites por IP no cadastro e na redefinição, magic bytes nas imagens, `benchContext` só texto, alias `POST /v1/` + `worker/openapi.yaml` (`npm run openapi`), papel somente leitura (`sql/ops/readonly_role.sql`), backup diário cifrado age→R2 (`.github/workflows/backup.yml`, `docs/BACKUP_RESTORE.md`).
- **F3 IA:** orquestrador (`worker/src/ai/orchestrator.js`) atrás da flag `use_orchestrator`: orçamento de 450 mil tokens/24 h, cache semântico `pg_trgm` com guardas de sentido (negação, número, tamanho), NVIDIA como reserva por flag, métricas (`sql/018`), alertas diários por e-mail, painel "Orçamento de tokens e consumo", cotas recalibradas, corpus de injeção de prompt.
- **Pipeline de segurança** (`.github/workflows/security.yml`): segunda e quinta 03:00 UTC; gitleaks 8.30.1, Trivy, Semgrep (relatório), Strix (quick no PR, standard agendado, deep manual), Issue automática (`security` + `bug`).
- **Números:** Worker 856 testes; `worker/src/ai` com ≥ 95% de cobertura; 18 migrações validadas (inclui reversões e o papel somente leitura); e2e `mfa`, `ai-metrics`, `fase3`, `home`, `smoke`, `csp` verdes.

## O que ficou adiado (não bloqueia a mescla — o orquestrador nasce desligado)
1. **Contabilidade fina das métricas:** uma linha por provedor tentado; `rate_limited` por requisição com 429 (hoje conta por tentativa de chave).
2. **Orçamento por modelo:** o Groq limita ~200 mil tokens/dia **por modelo**; hoje o orçamento é agregado (450 mil), então o modelo "rápido" pode receber 429 antes de o agregado estourar. Somar `ai_usage_log` por `model` e bloquear por modelo (~150 mil).
3. **Aviso `degraded` no front** (`frontend/modulos/laboratorio/js/lab-preceptor.js`): hoje a resposta aproximada aparece como "recuperada do acervo". Mostrar "resposta aproximada, a IA está indisponível".
4. **Polimentos do painel de métricas:** dia como DD/MM; ignorar resposta atrasada ao alternar 7/30 dias; e2e sem `check(true)` vazio.
5. **Reserva do orçamento por papel** (risco O10) e **orçamento da NVIDIA** (O11): só se o gatilho de `docs/riscos-residuais.md` disparar.
6. **F1 restante:** credencial virtual (`credential.js`), onboarding (`<dialog>` por papel), hero + `laift-orb.js`, Equipe em árvore, `openConfirm` com foco/Esc, SEO (h1 único, noindex no app), acessibilidade (axe, NVDA/VoiceOver), atalhos Ctrl+K/?.

## Passos que só você pode fazer
1. **Chave do OpenRouter** (a chave nunca passa pelo chat): `powershell -ExecutionPolicy Bypass -File tools\ci\registrar-segredo-openrouter.ps1 -Arquivo "$env:USERPROFILE\Desktop\segredos-openrouter.json"`, depois apague o arquivo. Defina um **limite de gasto baixo** na chave no painel do OpenRouter (risco O9). Sem a chave o Strix é pulado com aviso. Modelo padrão: Nemotron 3 Super gratuito; o `z-ai/glm-5.3:free` do roteiro **não existe** — para o GLM pago: `gh variable set STRIX_LLM --body "openrouter/z-ai/glm-5.3"`.
2. **Banco (Neon), staging primeiro:** aplicar `sql/016_feature_flags.sql`, `017_mfa.sql`, `018_ai_orchestrator.sql`, nessa ordem. O código novo funciona antes disso (tabela ausente = recurso desligado).
3. **Segredo do MFA:** `cd worker && npx wrangler secret put MFA_ENCRYPTION_KEY` (valor: `openssl rand -hex 32`), **antes** de qualquer pessoa ativar o MFA. Guarde em cofre: trocar invalida o MFA de todos.
4. **Backup:** seguir `docs/BACKUP_RESTORE.md` (chave age — privada fora do computador —, papel de leitura total no Neon com URL direta, bucket R2 privado + token, 6 secrets), rodar o workflow uma vez e treinar a restauração em branch vazia.
5. **Ligar com cuidado:** `use_orchestrator` primeiro só para administradores em staging (`apiAdminSetFeatureFlag`, ver `docs/DEPLOYMENT.md` §12); `mfa_required` só depois de **dois** administradores cadastrarem o autenticador.
6. **Pendências antigas:** "Always Use HTTPS" na Cloudflare, Search Console/Bing, decisão sobre privar o repositório (o Pages `github.io` deixa de funcionar), teste do PWA no celular (`https://staging.laift.com.br`), Brevo (domínio e remetente).

## Como retomar o trabalho
```bash
git checkout feat/v5-seguranca && git pull
cd worker && npm ci && npm test && npm run validate:sql      # 856 testes, 18 migrações
cd ../frontend && npm ci && node scripts/build.js && node scripts/e2e/run.js mfa ai-metrics fase3 home smoke csp
```
Próximo passo técnico depois das mesclas: terminar a **F1** (itens acima) e seguir para a **F4** (acervo, bibliografia, mentores, casos clínicos, chatbot, busca global). A numeração da próxima migração é **019**.

## Observações de trabalho
- Cada fase termina com `code-reviewer` + `security-reviewer`; as duas rodadas da F2 e da F3 já foram feitas e corrigidas (ver histórico dos commits `fix(seguranca)` e `fix(ia)`).
- O `GateGuard` do ambiente nega a primeira edição/criação de cada arquivo; declare os fatos e repita a mesma chamada.
- Chaves nunca no chat; o `.gitleaks.toml`/`.gitleaksignore` guardam as exceções já triadas (todas falsos positivos documentados).
