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

## 1. Banco (Neon) e migrações 001–013

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

   Todas são idempotentes (`IF NOT EXISTS`, `CREATE OR REPLACE`, blocos de
   guarda). Mesmo assim, o fluxo normal é aplicar cada uma **uma vez**, e
   toda mudança futura é um arquivo **novo** (`014_*.sql`…), nunca uma
   edição de migração já aplicada. A 013 depende da 012.
3. Antes de aplicar em produção, valide localmente as 13 migrações contra um
   Postgres em memória (PGlite), em banco vazio e reaplicadas:
   ```bash
   cd worker && npm ci && npm run validate:sql
   # esperado: "13 migrações, 27 tabelas no schema public, 0 falha(s)."
   ```
4. Conferência no Neon:
   ```sql
   SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
   -- esperado: 27
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
| `APP_BASE_URL` | `https://diretoria-dpf.github.io/plataforma-membros/` | links dos e-mails |
| `ALLOWED_ORIGINS` | `https://diretoria-dpf.github.io`, `http://localhost:4174`, `http://localhost:4175` | CORS |
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

```bash
cd worker
npm ci
npm test                 # 373 testes (Jest)
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
  não há passo manual. Apaga: `ai_usage_log` com mais de 180 dias, sessões
  expiradas há mais de 1 dia, tokens de conta expirados há mais de 7 dias e
  baldes de rate limit com mais de 8 dias. Nunca toca `audit_logs` nem
  `error_logs`. Resultado de cada execução: `wrangler tail` ou painel da
  Cloudflare → Workers → plataforma-membros-api → Logs; falhas vão para
  `error_logs` com o código `MAINTENANCE_FAILED`.
- Revisar a fila de casos gerados por IA (painel **IA** → pendentes).
