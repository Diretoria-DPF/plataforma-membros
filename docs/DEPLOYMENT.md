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

## 1. Banco (Neon) e migrações 001–024

1. Crie o projeto no [console do Neon](https://console.neon.tech) (ou uma
   **branch** nova, para isolar homologação de produção).
2. **Caminho de referência:** `tools/db/migrate.mjs`, que registra o que foi aplicado em `schema_migrations` (ver [AMBIENTES.md](AMBIENTES.md), "Migrações do banco"). Aplicar à mão, no SQL Editor (ou `psql` com a connection string), só vale para banco novo. Banco já migrado à mão precisa do `--baseline-through` ([AMBIENTES.md](AMBIENTES.md), "Ativação da UX v2…", seção 3). Ordem exata, um arquivo por vez:

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
   | 16 | `sql/016_feature_flags.sql` | `feature_flags` (liga/desliga e rollout por percentual) — Fase 2 |
   | 17 | `sql/017_mfa.sql` | verificação em duas etapas: segredo cifrado, códigos de recuperação, desafio de login |
   | 18 | `sql/018_ai_orchestrator.sql` | `ai_metrics_daily` e `ai_semantic_cache` (extensão `pg_trgm`) — Fase 3 |
   | 19 | `sql/019_assistant.sql` | restrição de `ai_usage_log` aceita `assistant`; flag `chatbot_enabled` (desligada) — Lia |
   | 20 | `sql/020_rag.sql` | `kb_chunks` (base da Lia, busca vetorial e trigramas) e `ai_usage_log.retrieval_used` |
   | 21 | `sql/021_assistant_feedback.sql` | `assistant_messages` e `assistant_feedback` (avaliação das respostas da Lia) |
   | 22 | `sql/022_assistant_moderation.sql` | `assistant_moderation` e `assistant_incidents` (moderação da Lia) |
   | 23 | `sql/023_flags_v2.sql` | insere `rag_enabled`, `feedback_enabled` e `moderation_enabled` ligadas (se não existirem). Liga `ux_v2_enabled` e `chatbot_enabled` **só se** estiverem desligadas e nunca tiverem sido alteradas por admin (`updated_by` nulo e sem `SET_FEATURE_FLAG` em `audit_logs`). **Não religa** o que um admin desligou. Não aplicar antes do acervo: ver [AMBIENTES.md](AMBIENTES.md), "Ativação da UX v2…", seção 2 |
   | 24 | `sql/024_indices.sql` | índices de `rate_limit_buckets` (purga diária) e das séries do Início (`event_registrations`, `task_signups`, `learning_attempts`). Não mexe em flags |

   O código implantado **antes** de 016 a 024 continua funcionando (tabela
   ausente = flags desligadas, login sem segundo fator, IA pelo caminho antigo, Lia inativa).
   Reversões em `sql/down/`.
   Papel somente leitura para relatórios: `sql/ops/readonly_role.sql` (não é
   migração; ver o cabeçalho do arquivo).

   Todas são idempotentes (`IF NOT EXISTS`, `CREATE OR REPLACE`, blocos de
   guarda). Mesmo assim, o fluxo normal é aplicar cada uma **uma vez**, e
   toda mudança futura é um arquivo **novo** (`016_*.sql`…), nunca uma
   edição de migração já aplicada. A 013 depende da 012 e a 015 da 013.
   A reversão de cada migração nova fica em `sql/down/NNN_*.sql` (fora da
   ordem de aplicação; só se usa à mão, em rollback).
3. Antes de aplicar em produção, valide localmente as migrações de `sql/` contra um
   Postgres em memória (PGlite), em banco vazio, reaplicadas e com a
   passada de reversão (down + nova aplicação):
   ```bash
   cd worker && npm ci && npm run validate:sql
   # esperado: "<N> migrações, <M> tabelas no schema public, 0 falha(s)."
   # (N = arquivos sql/NNN_*.sql; M muda a cada migração: não use um número fixo)
   ```
4. Conferência no Neon:
   ```sql
   SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
   -- esperado: o mesmo M que o `validate:sql` imprimiu (não use um valor fixo)
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
npx wrangler secret put MFA_ENCRYPTION_KEY    # openssl rand -hex 32 — cifra o segredo da verificação em duas etapas
```

| Segredo | Uso | Efeito de trocar |
|---|---|---|
| `DATABASE_URL` | driver HTTP do Neon (`worker/src/db.js`) | nenhum para as pessoas |
| `SESSION_TOKEN_PEPPER` | hash de sessões/tokens e **chave do QR de presença v2** (derivada por HMAC, domínio `laift-attendance-qr-v1`) | logout global, links de e-mail pendentes invalidados e **todos os QRs e crachás impressos deixam de valer** (ver `docs/SECURITY.md`) |
| `BREVO_API_KEY` | e-mails de confirmação e redefinição (`worker/src/mailer.js`) | nenhum |
| `GROQ_API_KEYS` | pool de chaves da IA (`worker/src/ai/groqClient.js`) | nenhum; chaves repetidas ou vazias são ignoradas |
| `MFA_ENCRYPTION_KEY` | AES-256-GCM do segredo TOTP (`worker/src/mfa/secretBox.js`). Sem ela, deriva-se do `SESSION_TOKEN_PEPPER` | **trocar invalida o MFA de todo mundo** (todos precisam recadastrar; um admin reseta com `apiAdminResetUserMfa`). Guarde em cofre e defina **antes** de alguém ativar o MFA |

Conferência: `npx wrangler secret list` mostra os cinco nomes (nunca os
valores). `NVIDIA_API_KEY` só é preciso se a flag `nvidia_fallback` for ligada.

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
| `AI` (Workers AI, `[ai]`) | binding de produção | embeddings da base da Lia (`@cf/baai/bge-m3`). Sem ele, a busca cai para trigramas. A homologação tem o seu, em `[env.staging.ai]` (ver seção 10) |

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
npm test                 # suíte Jest (o número de testes muda: confira a saída)
npm run validate:sql     # todas as migrações de sql/, com 0 falha(s)
npm run deploy           # wrangler deploy
```

URL de teste: `https://plataforma-membros-api.diretoria-dpf.workers.dev`. Em produção, o front usa `https://api.laift.com.br`: o `API_BASE_URL` de `frontend/app.js` é escolhido pelo hostname, e o `*.workers.dev` vale só para localhost e GitHub Pages. Os três endereços estão no `connect-src` da CSP do `frontend/index.html`. Se algum mudar, atualize os dois lados.

Conferência:
- `npx wrangler tail` enquanto alguém faz login: nenhuma exceção.
- No modo admin da plataforma, painel **IA** → "Testar chaves agora": o
  esperado é 100% e uma linha por chave (só o final mascarado aparece).

## 5. Front-end (GitHub Pages)

**Atenção:** o site de produção hoje é o Worker `laift-web`, publicado por `.github/workflows/deploy-frontend-cloudflare.yml` ([AMBIENTES.md](AMBIENTES.md)). O workflow abaixo (GitHub Pages) continua existindo e também publica a cada push na `main`. Desligá-lo está pendente ([AMBIENTES.md](AMBIENTES.md), "Ativação da UX v2…", seção 6).

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
npm run e2e      # build + todos os cenários frontend/scripts/e2e/*.e2e.js (Playwright; inclui csp, smoke, home, assistant, credential e visual-qa)
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
- **Site (`laift.com.br`):** Cloudflare → Workers & Pages → `laift-web` → *Deployments* → **Rollback** (imediato); depois, `git revert` na `main`. O GitHub Pages (legado) republica pelo `deploy-frontend.yml`.
- **Schema:** o runner não reverte. Há reversões manuais em `sql/down/` (ordem inversa; não são aplicadas pelo deploy), os `down` de 020 a 024 apagam a linha de `schema_migrations`; os de 015 a 019 não. Procedimento: [AMBIENTES.md](AMBIENTES.md), "Ativação da UX v2…", seção 5. Antes de qualquer migração arriscada, teste numa branch do Neon.
- **Credenciais comprometidas:** `docs/SECURITY.md`, seção "Rotação de
  credenciais".
- **Perda de dados:** backup diário cifrado no R2 e teste de restauração em
  `docs/BACKUP_RESTORE.md` (`.github/workflows/backup.yml`).
- **Admin sem acesso ao MFA** (perdeu o celular e os códigos): **outro**
  administrador chama `apiAdminResetUserMfa`, informando a **própria senha e o
  próprio código** (reautenticação). O reset apaga o MFA da pessoa, encerra as
  sessões dela, **invalida a senha** e envia o link de redefinição ao e-mail
  dela — assim, quem só conhece a senha antiga não consegue entrar e cadastrar o
  próprio autenticador antes do dono. Com dois administradores, nenhum fica
  trancado. Não há tela para isso ainda; chamada de emergência:
  ```bash
  curl -s https://api.laift.com.br/v1/ -H 'Content-Type: application/json' \
    -d '{"action":"apiAdminResetUserMfa","args":["<seu token de sessão>","<id da pessoa>",{"password":"<sua senha>","code":"<código de 6 dígitos>"}]}'
  ```
  O token de sessão sai do login (`apiLogin`/`apiLoginMfa`); digite a senha num
  arquivo ou prompt, não direto na linha de comando, para não ir ao histórico.
- **Desligar a obrigatoriedade em emergência:** `apiAdminSetFeatureFlag` com
  `["<token>","mfa_required",{"enabled":false,"password":"…","code":"…"}]`. Essa
  flag só vale para todos (sem percentual nem condições) e exige reautenticação.

## 9. Manutenção periódica

- **Faxina automática diária** (Cron Trigger `17 6 * * *`, 03:17 em
  Brasília — `[triggers]` em `worker/wrangler.toml`, código em
  `worker/src/maintenance.js`). É registrada sozinha pelo `npm run deploy`;
  não há passo manual. Apaga: `ai_usage_log` com mais de 180 dias,
  `atlas_telemetry` com mais de 90 dias, sessões expiradas há mais de 1 dia,
  tokens de conta expirados há mais de 7 dias, baldes de rate limit com mais
  de 8 dias, `audit_logs` com mais de 2 anos e `error_logs` com mais de 30
  dias (os prazos estão em `RETENTION`, `worker/src/maintenance.js`; o corte
  é sempre por `created_at`). A Lia tem prazos próprios: `assistant_messages` sai após 180 dias; `assistant_incidents`, após 365; em `assistant_feedback`, o comentário é anonimizado após 90 dias e o registro sai após 365. Para guardar uma trilha de auditoria por mais
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

1. **Banco:** crie o banco vazio e aplique todas as migrações de `sql/` com `tools/db/migrate.mjs`, em ordem. A homologação as recebe sozinha no deploy de `staging`, se existir `STAGING_DATABASE_URL`.
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

**Cuidado com quem pode publicar.** O workflow roda a partir de qualquer
branch e usa o token da Cloudflare do repositório: quem tem escrita no
repositório poderia, numa branch, alterar o workflow ou o `wrangler.toml` e
publicar por cima da produção. Os jobs usam o *Environment* `staging` do
GitHub; em **Settings → Environments → staging** restrinja as branches
permitidas e, se houver mais de uma pessoa com escrita, exija aprovação. O
ideal é um token próprio de staging; como o token atual também precisa de
DNS na zona, outra opção é anexar os dois domínios de staging uma única vez
pelo painel e manter o token do CI sem permissão de DNS.

O fluxo normal passa a ser: PR → publicar a branch em staging → conferir
(login, painéis, o que a mudança toca) → mesclar na `main`. Migrações novas
entram **primeiro** no banco de staging.

O que a homologação **não** tem, de propósito: cron de faxina (a manutenção
diária só roda em produção; o `wrangler.toml` esvazia o cron que o ambiente
herdaria), URL `*.workers.dev` (só os dois domínios de staging respondem),
KV (o cache vira no-op) e R2 (envio de avatar e de imagem de evento não
funciona até existirem recursos de teste). O site de
staging fica fora dos buscadores por cabeçalho (`X-Robots-Tag`, regra por host
em `frontend/_headers`), assim como as URLs `*.workers.dev`. O binding Workers AI existe na homologação (`[env.staging.ai]`), mas sem cron (`crons = []`) a base só é reindexada à mão, por `apiAdminReindexKb`.

## 11. PWA (instalar como aplicativo)

O site é um PWA: `frontend/manifest.webmanifest`, ícones em `frontend/icons/`
(gerados por `node tools/pwa/generate-icons.mjs` a partir do logo),
`frontend/pwa.js` (registro) e `frontend/sw.js` (service worker).

- **Instalar:** Android/Chrome → menu → *Instalar app*. iPhone/Safari →
  *Compartilhar* → *Adicionar à Tela de Início*.
- **O que o service worker faz:** só o shell estático do próprio site, com
  *rede primeiro e cache de reserva*; abre a tela inicial mesmo offline. Nunca
  intercepta a API (outra origem), `POST`, `Range`, o próprio `sw.js` nem o
  Atlas 3D (que tem service worker próprio). Nada autenticado fica em cache.
- **Atualizações:** quem está online recebe a versão nova no carregamento
  seguinte. Para descartar os caches antigos de todo mundo, suba a versão em
  `frontend/sw.js` (`CACHE_NAME = CACHE_PREFIX + 'v2'`); na ativação os
  `laift-shell-*` antigos são apagados.
- **Desligar em emergência:** publique um `frontend/sw.js` que se desregistra
  e apaga os caches. Os navegadores conferem o `sw.js` a cada navegação
  (no máximo a cada 24 h), então os aparelhos se limpam sozinhos:
  ```js
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys()
        .then((names) => Promise.all(names.filter((n) => n.startsWith('laift-shell-')).map((n) => caches.delete(n))))
        .then(() => self.registration.unregister())
    );
  });
  ```
- **Conferência em aparelho real** (antes de anunciar): o ícone do iPhone não
  pode ter fundo preto; o do Android deve ficar bem recortado (ícone
  *maskable*); com o modo avião, o app abre a tela de entrada.

## 12. IA: orquestrador, orçamento de tokens e cache (Fase 3)

Flag nova nasce **desligada**: a IA segue pelo caminho de sempre até você ligar a flag. (Exceção: as cinco flags da renovação, que a migração 023 insere ou liga sem religar o que um admin desligou; ver [AMBIENTES.md](AMBIENTES.md), "Ativação da UX v2…".)

1. Aplique `sql/018_ai_orchestrator.sql` (Neon → SQL Editor). Confira com
   `SELECT count(*) FROM ai_metrics_daily;` (deve responder 0, sem erro).
2. Ligue em **staging** primeiro: flag `use_orchestrator` (`apiAdminSetFeatureFlag`
   com `["<token>","use_orchestrator",{"enabled":true}]`; essa flag aceita
   percentual e condições, ex.: `{"conditions":{"role":"admin"}}` para testar só
   com administradores). Desligar volta ao caminho antigo na hora (até 60 s).
3. Painel **Administração → IA → Orçamento de tokens e consumo**: uso das últimas
   24 h, alertas ativos, cache e consumo por modelo/recurso/provedor.
4. **Orçamento:** `AI_DAILY_TOKEN_BUDGET` (padrão 450 000 tokens/24 h, ~75% do teto
   gratuito do Groq). Mude em `[vars]` do `wrangler.toml` sem tocar em código.
   Passou do teto → o orquestrador não chama o provedor: responde pelo cache ou
   avisa que a IA volta amanhã (a cota da pessoa é devolvida).
5. **Cache semântico:** só pergunta genérica do preceptor do laboratório (sem
   bancada, histórico nem dado pessoal); acerto não gasta cota nem token;
   validade de 7 dias. Em falha do provedor, uma pergunta parecida pode ser
   servida e vem marcada `degraded`.
6. **NVIDIA como reserva:** flag `nvidia_fallback` + secret `NVIDIA_API_KEY` + as
   variáveis `NVIDIA_MODEL_FAST/SMART`. Sem os três, a reserva não é usada.
7. **Alertas** (cron diário, por e-mail aos administradores e `audit_logs`):
   tokens > 80% do orçamento, 429 em > 5% das chamadas do dia, taxa de acerto do
   cache < 30% por 3 dias. O mesmo alerta não se repete em 20 h.
8. **Cotas por pessoa** foram recalibradas pelo orçamento (chat do membro 40/dia,
   visitante 15; avaliação 10; caso gerado 4; preceptor 30). Ajuste em
   `AI_QUOTAS` (`worker/src/constants.js`).

**Rollback:** `use_orchestrator` em `enabled=false`. A migração 018 é aditiva
(`sql/down/018_ai_orchestrator.sql` só se quiser apagar métricas e cache).

## 13. CI/CD — Security Scans (`.github/workflows/security.yml`)

### Agendamento
| Gatilho | Quando | Strix | Duração |
|---|---|---|---|
| Pull request | a cada PR (do próprio repositório) | `quick` | minutos |
| Agendado | segunda e quinta, 03:00 UTC (00:00 em Brasília) | `standard` | 30–60 min |
| Manual (*Actions → Segurança → Run workflow*) | quando quiser; indicado antes de releases | `deep` (ou o escolhido) | 1–4 h |
| Push em `main`, `feat/v5-*`, `staging` | a cada push | não roda | — |

Em todos os gatilhos rodam também: `npm audit` das dependências de produção
(Worker e front), gitleaks (histórico completo), Trivy e Semgrep (este ainda
só relatório).

### O que bloqueia
`npm audit` (alta/crítica, só produção), gitleaks, Trivy (CRITICAL/HIGH com
correção disponível) e Strix (`--fail-on high`). Falso positivo do gitleaks:
caminho em `.gitleaks.toml` ou impressão digital em `.gitleaksignore`, sempre
com a justificativa em comentário.

### Notificações
- Falha em agendamento, push ou execução manual → **Issue** automática com as
  labels `security` e `bug`, listando quais verificações falharam e o link da
  execução. Se já houver uma Issue de segurança aberta, o workflow comenta nela
  em vez de abrir outra. Em PR a falha aparece no próprio PR.
- Você é avisado por e-mail se estiver *watching* o repositório.
- **Slack (opcional):** crie o secret `SLACK_WEBHOOK_URL` (webhook em
  api.slack.com); sem ele o passo é ignorado.

### Segredos e variáveis
| Nome | Tipo | Para quê | Como criar |
|---|---|---|---|
| `OPENROUTER_API_KEY` | secret | chave do OpenRouter, só o Strix usa | `powershell -ExecutionPolicy Bypass -File tools\ci\registrar-segredo-openrouter.ps1 -Arquivo "<json com a chave>"` (lê o arquivo localmente e envia ao `gh secret set` sem exibir o valor; depois apague o arquivo) ou `gh secret set OPENROUTER_API_KEY` |
| `STRIX_LLM` | variable (opcional) | modelo do Strix. Padrão: `openrouter/nvidia/nemotron-3-super-120b-a12b:free` | `gh variable set STRIX_LLM --body "openrouter/z-ai/glm-5.3"` |
| `SLACK_WEBHOOK_URL` | secret (opcional) | aviso no Slack | `gh secret set SLACK_WEBHOOK_URL` |

Sem `OPENROUTER_API_KEY` o job do Strix é **pulado com um aviso** (não fica
vermelho); os demais scans seguem normalmente. O `SEMGREP_APP_TOKEN` não é
usado: o Semgrep roda com as regras públicas (`p/javascript`,
`p/security-audit`), sem conta.

### Pontos de atenção
- **Modelo.** O `z-ai/glm-5.3:free` do roteiro original **não existe** no
  OpenRouter (conferido no catálogo público em 04/10/2026); o `z-ai/glm-5.3` é
  pago. Modelos gratuitos têm limite diário e de requisições por minuto: um
  `deep` pode ser interrompido por rate limit — nesse caso rode de novo ou
  defina `STRIX_LLM` com um modelo pago.
- **Privacidade do código.** O Strix envia trechos do código ao provedor do
  modelo. Em modelos gratuitos, considere que o conteúdo pode ser registrado.
  Revise antes de privar o repositório ou de incluir conteúdo sensível.
- **Relatórios.** Em repositório público os achados aparecem no log da
  execução antes de serem corrigidos; só em repositório privado o relatório é
  guardado como artefato (14 dias).
- **Versões fixas:** gitleaks 8.30.1 (SHA-256 conferido), `strix-agent==1.6.2`
  e `trivy-action` por commit. Atualize de propósito, não por acaso.
