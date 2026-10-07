# Andamento do Plano v5 — onde paramos

**Atualizado em 2026-10-04.** Para retomar: leia este arquivo, depois `C:\Users\Administrador\.claude\plans\c-users-administrador-desktop-an-lise-c-merry-reddy.md` (plano completo, com DoD e rollback por fase) e `docs/riscos-residuais.md`.

## Em uma frase
Fases 0, 2 e 3 do plano estão prontas e testadas; a Fase 1 está pela metade; **nada disso está em produção** até você mesclar as PRs e fazer os passos manuais abaixo. Tudo que é novo nasce **desligado** (feature flag), então mesclar não muda o comportamento de ninguém.

## Atualização de 2026-10-05 — por que o laift.com.br não refletia a F2/F3
- **A #27 foi mesclada** (02:32 UTC). A **API** de produção foi republicada na hora (`deploy-worker.yml` dispara em push na `main`).
- **O site não subiu**: `deploy-frontend-cloudflare.yml` só rodava à mão. Isto está corrigido na branch `feat/v5-ativacao` (PR para a `main`): o workflow passa a publicar sozinho no push em `main` (produção) e `staging` (homologação), com testes unitários + e2e `csp smoke` antes e `tools/ci/smoke.mjs` depois. `deploy-staging.yml` também publica no push de `staging`. Fluxo completo, rollback e passos únicos: **`docs/AMBIENTES.md`**.
- **Novo:** `tools/db/migrate.mjs` (runner com `schema_migrations`, `--dry-run`, `--baseline-through`) e `tools/ci/smoke.mjs`, ambos com testes (18 + 13).
- **Os bancos ainda não têm as migrações 016–018** (produção `plataforma-membros` e staging `laift-staging` estão na 015). Por isso flags, MFA e orquestrador seguem desligados. Rode o `--baseline-through 015` e depois o runner (`docs/AMBIENTES.md`).
- **Google Ads:** o commit `847ecc2` (script do AdSense no `index.html`) quebrava o e2e `csp` e barraria a publicação do site. Por decisão do usuário (2026-10-06) o script **saiu do `index.html`** por enquanto; para recolocar, o texto está no `847ecc2`, mas antes é preciso liberar `pagead2.googlesyndication.com` (e os demais domínios do AdSense) no CSP da página e ter aviso de consentimento + Privacidade atualizados.
- **Fora deste lote (próximos passos):** chave do OpenRouter (`gh secret set` pelo script), `MFA_ENCRYPTION_KEY`, ligar `use_orchestrator`, guia "Lia", atalho de promoção, RAG híbrido.

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
