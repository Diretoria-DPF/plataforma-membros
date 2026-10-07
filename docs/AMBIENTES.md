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

- **Staging**: o deploy da API migra sozinho **se** existir o segredo `STAGING_DATABASE_URL` no Environment `staging`; sem ele, avisa e segue.
- **Produção**: continua **manual** de propósito. Antes, crie uma branch/snapshot do Neon (a janela de restauração do plano é curta, ~6 h) e rode `--dry-run`.

## Passos manuais, uma única vez (você)

1. Criar a branch: `git push origin main:staging`.
2. GitHub → Settings → Environments → `staging`: adicionar o segredo `STAGING_DATABASE_URL` (URL direta do projeto Neon `laift-staging`). Opcional: restringir à branch `staging`.
3. Rodar o `--baseline-through 015` em staging e em produção (comando acima).
4. O token da Cloudflare já usado nos deploys precisa de **Workers Routes: Edit** e **DNS: Edit** na zona `laift.com.br` (staging usa domínio próprio).

## Ligar e desligar recursos (feature flags)

Cada recurso novo nasce **desligado** na tabela `feature_flags`. Para ligar ou desligar, rode no SQL Editor do Neon do ambiente (ou peça pelo painel de administração, que registra em `audit_logs`):

```sql
UPDATE feature_flags SET enabled = TRUE,  rollout_pct = 100, updated_at = now() WHERE key = 'use_orchestrator';  -- IA com orçamento e cache
UPDATE feature_flags SET enabled = TRUE,  rollout_pct = 100, updated_at = now() WHERE key = 'chatbot_enabled';   -- Lia
UPDATE feature_flags SET enabled = FALSE, updated_at = now() WHERE key = 'chatbot_enabled';                      -- desligar
```

A mudança vale em até 60 segundos (cache de flags em cada instância do Worker). `mfa_required` só se liga depois de **dois** administradores cadastrarem o autenticador; `nvidia_fallback`, só com a `NVIDIA_API_KEY` cadastrada.

Segredo do MFA: `powershell -ExecutionPolicy Bypass -File tools\ci\gerar-segredo-mfa.ps1 -Ambiente staging|producao` (gera, cadastra no Worker sem mostrar o valor e deixa uma cópia fora do repositório para o cofre; recusa trocar uma chave que já existe).

## Reverter

- **Site ou API, agora**: Cloudflare → Workers & Pages → o Worker → *Deployments* → **Rollback** para a versão anterior (imediato). Depois, `git revert` do commit na `main` para o repositório refletir o que está no ar.
- **Banco**: cada migração tem reversão em `sql/down/NNN_*.sql` (manual). Se a migração mexeu em dados, restaure a branch/snapshot do Neon criada antes.
- **Recurso novo com problema**: desligue a feature flag (`apiAdminSetFeatureFlag`); não exige novo deploy.
