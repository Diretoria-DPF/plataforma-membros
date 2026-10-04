# Deployment — Plataforma de Membros LAIFT

Guia do ambiente atual: **Neon PostgreSQL** (banco), **Cloudflare Workers**
(API JSON, pasta `worker/`) e **GitHub Pages** (site estático, pasta
`frontend/`). O backend anterior em Google Apps Script foi desligado; o
código dele fica só como arquivo histórico em `legacy-appsscript/` e não
participa de nenhum passo abaixo.

Pré-requisitos: Node.js ≥ 20, conta Neon, conta Cloudflare (com Workers, KV
e R2), conta Brevo (e-mail transacional), chaves do Groq (IA da área
"Aprender") e acesso de escrita ao repositório no GitHub.

Faça na ordem. Cada passo diz como conferir antes de seguir.

## 1. Banco (Neon) e migrações 001–015

1. Crie o projeto no [console do Neon](https://console.neon.tech) (ou uma
   **branch** nova, para isolar homologação de produção).
2. Abra o **SQL Editor** na branch de destino (ou `psql` com a connection
   string) e aplique **nesta ordem exata**, um arquivo por vez:

   | # | Arquivo | O que traz |
   |---|---|---|
   | 1 | `sql/001_schema.sql` | extensões (`uuid-ossp`, `pgcrypto`), tipos e tabelas base |
   | 2 | `sql/002_functions_and_triggers.sql` | funções e gatilhos (`updated_at`, proteção do último admin) |
   | 3 | `sql/003_rate_limits.sql` | `rate_limit_buckets` (limites e cotas de IA) |
   | 4 | `sql/004_event_visibility_guard.sql` | guarda de visibilidade de eventos |
   | 5 | `sql/005_fase2_schema.sql` | perfil estendido, imagens, status "em andamento", conclusão de tarefa |
   | 6 | `sql/006_event_location.sql` | local do evento |
   | 7 | `sql/007_connections_moderation.sql` | conexões e denúncias |
   | 8 | `sql/008_league_org_chart.sql` | organograma da liga |
   | 9 | `sql/009_messaging.sql` | mensageria E2EE |
   | 10 | `sql/010_messaging_simplify.sql` | ajuste da mensageria |
   | 11 | `sql/011_messaging_clear_and_delete.sql` | limpar/apagar mensagens |
   | 12 | `sql/012_learning.sql` | `learning_attempts` e presença (check-in) — Fase 2 |
   | 13 | `sql/013_clinical_ai.sql` | `clinical_cases` e `ai_usage_log` — Fase 3 |
   | 14 | `sql/014_atlas_telemetry.sql` | telemetria anônima do Atlas 3D |
   | 15 | `sql/015_ai_usage_provider.sql` | coluna `provider` em `ai_usage_log` (Groq/NVIDIA) |

   Todas são idempotentes (`IF NOT EXISTS`, `CREATE OR REPLACE`, blocos de
   guarda). Mesmo assim, o fluxo normal é aplicar cada uma **uma vez**, e
   toda mudança futura é um arquivo **novo** (`016_*.sql`…), nunca uma
   edição de migração já aplicada. A 013 depende da 012 e a 015 da 013.
   A reversão de cada migração nova fica em `sql/down/NNN_*.sql` (fora da
   ordem de aplicação; só se usa à mão, em rollback).
3. Antes de aplicar em produção, valide localmente as 15 migrações contra um
   Postgres em memória (PGlite), em banco vazio, reaplicadas e com a
   passada de reversão (down + nova aplicação):
   ```bash
   cd worker && npm ci && npm run validate:sql
   # esperado: "15 migrações, 28 tabelas no schema public, 0 falha(s)."
   ```
4. Conferência no Neon:
   ```sql
   SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
   -- esperado: 28
   ```
5. Para uma migração arriscada, crie antes uma branch no Neon, aplique e
   teste nela, e só então aplique na principal.

## 2. Segredos do Worker

Segredos **nunca** vão para `wrangler.toml`, commit, log ou `docs/`. São
cadastrados com o Wrangler, que os guarda criptografados na Cloudflare:

```bash
cd worker
npx wrangler login
npx wrangler secret put DATABASE_URL          # connection string do Neon (postgresql://…?sslmode=require)
npx wrangler secret put SESSION_TOKEN_PEPPER  # openssl rand -hex 32
npx wrangler secret put BREVO_API_KEY         # chave da API da Brevo
npx wrangler secret put GROQ_API_KEYS         # TODAS as chaves do pool, uma por linha ou separadas por vírgula
```

| Segredo | Uso | Efeito de trocar |
|---|---|---|
| `DATABASE_URL` | driver HTTP do Neon (`worker/src/db.js`) | nenhum para as pessoas |
| `SESSION_TOKEN_PEPPER` | hash de sessões/tokens e **chave do QR de presença v2** (derivada por HMAC, domínio `laift-attendance-qr-v1`) | logout global, links de e-mail pendentes invalidados e **todos os QRs e crachás impressos deixam de valer** (ver `docs/SECURITY.md`) |
| `BREVO_API_KEY` | e-mails de confirmação e redefinição (`worker/src/mailer.js`) | nenhum |
| `GROQ_API_KEYS` | pool de chaves da IA (`worker/src/ai/groqClient.js`) | nenhum; chaves repetidas ou vazias são ignoradas |

Conferência: `npx wrangler secret list` mostra os quatro nomes (nunca os
valores).

## 3. Variáveis públicas e bindings (`worker/wrangler.toml`)

Não são segredo; ficam versionadas.

| Var / binding | Valor atual | Para quê |
|---|---|---|
| `APP_BASE_URL` | `https://laift.com.br/` | links dos e-mails |
| `ALLOWED_ORIGINS` | `https://diretoria-dpf.github.io` (só na transição), `https://laift.com.br`, `http://localhost:4174`, `http://localhost:4175` | CORS |
| `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS` | remetente **verificado** na Brevo | e-mail |
| `MEDIA_PUBLIC_URL` | URL pública do bucket R2 | avatares e imagens de evento |
| `GROQ_MODEL_FAST` | `openai/gpt-oss-20b` | paciente virtual (chat) |
| `GROQ_MODEL_SMART` | `openai/gpt-oss-120b` | preceptor, geração de caso, preceptor do laboratório |
| `MEDIA_BUCKET` (R2) | `plataforma-membros-media` | upload de mídia |
| `HOT_CACHE` (KV) | namespace `6ee17e57…` | cache curto de leitura, cooldown das chaves do Groq, cache de síntese do laboratório |

Para usar um modelo só, ponha o mesmo valor nas duas vars `GROQ_MODEL_*`.
Cotas diárias por papel e o disjuntor global (3.000 chamadas/dia) ficam em
`worker/src/constants.js` (`AI_QUOTAS`, `AI_GLOBAL_DAILY_MAX`).

## 4. Deploy do Worker

### Publicação automática (recomendada, sem terminal)

O workflow `.github/workflows/deploy-worker.yml` publica a Worker sozinho a
cada push na `main` que mexa em `worker/`, e também pode ser disparado à mão
em **Actions → "Publicar Worker (API) na Cloudflare" → Run workflow**. Antes
de publicar, ele roda os testes.

Configuração única, feita no navegador:

1. **Token da Cloudflare:** dash.cloudflare.com → ícone do perfil → **My
   Profile → API Tokens → Create Token** → modelo **"Edit Cloudflare
   Workers"** → em *Account Resources* escolha a conta da liga → **Continue
   to summary → Create Token**. Copie o token (ele aparece uma vez só).
2. **Segredos no GitHub:** repositório → **Settings → Secrets and variables
   → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN`: o token do passo 1 (obrigatório);
   - `GROQ_API_KEYS`: todas as chaves do Groq, separadas por vírgula
     (opcional; se existir, é gravado como segredo da Worker a cada
     publicação);
   - `CLOUDFLARE_ACCOUNT_ID`: só se o token enxergar mais de uma conta. O
     ID fica na página inicial de **Workers e Pages**, na coluna da direita.
3. Rodar o workflow à mão uma vez (Actions → Run workflow) ou fazer merge de
   algo que mexa em `worker/`.

Se faltar o `CLOUDFLARE_API_TOKEN`, o workflow falha com a mensagem dizendo
exatamente isso. Nenhum valor de segredo aparece no log.

### Publicação manual (terminal)

```bash
cd worker
npm ci
npm test                 # 378 testes (Jest)
npm run validate:sql     # 13 migrações OK
npm run deploy           # wrangler deploy
```

URL: `https://plataforma-membros-api.diretoria-dpf.workers.dev` — é o
`API_BASE_URL` de `frontend/app.js` e aparece no `connect-src` da CSP do
`frontend/index.html`. **Se a URL mudar, atualize os dois.**

Conferência:
- `npx wrangler tail` enquanto alguém faz login: nenhuma exceção.
- No modo admin da plataforma, painel **IA** → "Testar chaves agora": o
  esperado é 100% e uma linha por chave (só o final mascarado aparece).

## 5. Front-end (GitHub Pages)

O workflow `.github/workflows/deploy-frontend.yml` publica a cada push na
`main` que toque `frontend/`:

1. `npm install` e `npm run build` em `frontend/` geram `frontend/dist/`
   (app.js ofuscado; páginas, módulos e `static-page.js` copiados);
2. só `frontend/dist/` é publicado.

Uma única vez: **Settings → Pages → Source: GitHub Actions** (não "Deploy
from a branch", que publicaria o repositório inteiro).

Antes do merge, rode localmente:

```bash
cd frontend
npm install
npm run e2e      # build + cenários csp, fase2, fase3, fase4 e smoke (Playwright)
```

O cenário `csp` usa um espelho local dos pacotes npm do jsDelivr
(`frontend/scripts/e2e/cdn-mirror/`, instalado sozinho na primeira
execução) para conferir o SRI de cada biblioteca e falhar em qualquer
violação de CSP. **Ao trocar a versão de uma biblioteca de CDN**, atualize
juntos: a URL, o `integrity` e o `cdn-mirror/package.json`.

## 6. Primeiro administrador

O primeiro administrador é **Daniel Pires Francisco**
(`dpires292@gmail.com`). Ele se cadastra pela tela pública (nasce
`visitor`) e confirma o e-mail. **Só depois**, com a identidade verificada
por uma pessoa da diretoria, promova no SQL Editor do Neon:

```sql
BEGIN;

UPDATE profiles
SET role = 'admin'::user_role
WHERE email = 'dpires292@gmail.com'
  AND email_confirmed_at IS NOT NULL
RETURNING id, full_name, email, role, status, email_confirmed_at;

-- Confira que a linha é a pessoa certa e que role = 'admin'.

COMMIT;
```

Nenhuma linha retornada → **não dê commit**: o e-mail não foi confirmado ou
está escrito diferente. Os demais admins são promovidos pela própria
plataforma (painel admin).

## 7. Validação com contas de teste

- [ ] Cadastro → e-mail chega → confirmar → login.
- [ ] Senha errada e e-mail inexistente → mesma mensagem genérica.
- [ ] "Esqueci minha senha" → link redefine → sessões antigas caem.
- [ ] Logout revoga a sessão (o token antigo deixa de funcionar).
- [ ] Área "Aprender": abrir quiz, toxicologia, clínica, laboratório e
      anatomia; as estatísticas do perfil sobem depois de um simulado.
- [ ] Credencial QR na área "Aprender" → check-in no terminal fiscal (admin).
- [ ] Clínica: um caso completo (conversa, exames, avaliação) e o radar.
- [ ] Painel **IA**: 100% das chaves; gerar um caso → aparece em
      "pendentes" → aprovar → aparece no acervo.
- [ ] DevTools → Console em cada página: nenhuma violação de CSP.
- [ ] `SELECT action, result FROM audit_logs ORDER BY created_at DESC LIMIT 20;`
      mostra as ações acima, sem senha, token ou e-mail completo.

## 8. Rollback e recuperação

- **Worker:** `npx wrangler rollback` volta à versão anterior (ou
  `npx wrangler deployments list` e escolha). Não mexe no banco.
- **Front-end:** reverta o commit na `main` (ou rode de novo o workflow num
  commit anterior); o Pages republica.
- **Schema:** não há "undo" automático. Reverter exige uma migração nova
  (`NNN_rollback_*.sql`) — por isso o teste em branch do Neon antes.
- **Credenciais comprometidas:** `docs/SECURITY.md`, seção "Rotação de
  credenciais".

## 9. Manutenção periódica

- **Faxina automática diária** (Cron Trigger `17 6 * * *`, 03:17 em
  Brasília — `[triggers]` em `worker/wrangler.toml`, código em
  `worker/src/maintenance.js`). É registrada sozinha pelo `npm run deploy`;
  não há passo manual. Apaga: `ai_usage_log` com mais de 180 dias,
  `atlas_telemetry` com mais de 90 dias, sessões expiradas há mais de 1 dia,
  tokens de conta expirados há mais de 7 dias, baldes de rate limit com mais
  de 8 dias, `audit_logs` com mais de 2 anos e `error_logs` com mais de 30
  dias (os prazos estão em `RETENTION`, `worker/src/maintenance.js`; o corte
  é sempre por `created_at`). Para guardar uma trilha de auditoria por mais
  tempo (por exemplo, por determinação jurídica), exporte-a antes de a
  janela vencer. Resultado de cada execução: `wrangler tail` ou painel da
  Cloudflare → Workers → plataforma-membros-api → Logs; falhas vão para
  `error_logs` com o código `MAINTENANCE_FAILED`.
- Revisar a fila de casos gerados por IA (painel **IA** → pendentes).

## 10. Homologação (staging)

Ambiente à parte para testar uma branch **antes** de ela ir para a `main`
(que publica em produção). Fica em `staging.laift.com.br` (site) e
`staging-api.laift.com.br` (API), com **banco próprio e sem dados reais**.

**Nunca** crie o banco de staging como cópia do de produção: uma *branch*
comum do Neon copia tudo, inclusive dados pessoais dos membros. Use um banco
novo e vazio (outro projeto do Neon ou um banco novo na mesma instância) e
aplique as migrações da seção 1.

Uma vez, para montar o ambiente:

1. **Banco:** crie o banco vazio e aplique `sql/001` … `sql/015` na ordem.
   Crie o primeiro administrador de teste como na seção 6.
2. **Segredos da API de staging** (no diretório `worker/`; cada comando pede o
   valor no terminal):
   ```bash
   npx wrangler secret put DATABASE_URL --env staging         # string de conexão do banco de staging
   npx wrangler secret put SESSION_TOKEN_PEPPER --env staging # valor ALEATÓRIO, diferente do de produção
   npx wrangler secret put GROQ_API_KEYS --env staging        # opcional: 1 chave, para testar a IA
   ```
   **Não** cadastre a `BREVO_API_KEY` de produção: sem ela a Brevo recusa o
   envio e a homologação não manda e-mail a ninguém (crie as contas de teste
   pelo SQL da seção 6 em vez do fluxo de confirmação por e-mail).
3. **Token do GitHub Actions:** além de *Edit Cloudflare Workers*, o token
   precisa de **DNS: Edit** e **Workers Routes: Edit** na zona `laift.com.br`
   para o wrangler anexar os dois domínios na primeira publicação.

Para publicar uma branch na homologação: GitHub → **Actions** → *Publicar
homologação (staging)* → em *Use workflow from* escolha a branch → *Run
workflow* (alvo: ambos, api ou site). Conferência:

```bash
curl -I https://staging.laift.com.br/ | grep -i x-robots-tag   # noindex, nofollow
curl -i -X OPTIONS https://staging-api.laift.com.br/ -H "Origin: https://staging.laift.com.br"   # 204
```

O fluxo normal passa a ser: PR → publicar a branch em staging → conferir
(login, painéis, o que a mudança toca) → mesclar na `main`. Migrações novas
entram **primeiro** no banco de staging.

O que a homologação **não** tem, de propósito: cron de faxina (a manutenção
diária só roda em produção), KV (o cache vira no-op) e R2 (envio de avatar e
de imagem de evento não funciona até existirem recursos de teste). O site de
staging fica fora dos buscadores por cabeçalho (`X-Robots-Tag`, regra por host
em `frontend/_headers`), assim como as URLs `*.workers.dev`.
