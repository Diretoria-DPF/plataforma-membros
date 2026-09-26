# Plataforma de Membros

**No ar:** https://diretoria-dpf.github.io/plataforma-membros/ — esta é a
URL que as pessoas usam.

Plataforma unificada da LAIFT (Liga Acadêmica Interdisciplinar de
Farmacologia e Toxicologia): governança comunitária (eventos, propostas com
votação, tarefas colaborativas, equipe, mensagens e administração de contas)
**e o ecossistema de aprendizagem** (área "Aprender": simuladores de
farmacologia e toxicologia, clínica virtual, laboratório e anatomia 3D —
antigo repositório o-bala-vip, incorporado aqui; ver
`docs/PLANO_UNIFICACAO_LAIFT.md`). Dividida em duas partes publicadas
separadamente:

- **Front-end**: site estático (HTML/CSS/JS puro, sem framework) publicado
  no **GitHub Pages** (pasta `frontend/`).
- **Back-end**: **API JSON em Cloudflare Workers** (pasta `worker/`), com
  **Neon PostgreSQL** como banco relacional via o driver serverless do
  próprio Neon.

O backend anterior (Google Apps Script + Planilhas) foi **desligado**: nenhum
arquivo publicado fala mais com ele, e o código fica só como arquivo em
`legacy-appsscript/`. Modelo de dados, autenticação, sessão e renderização
foram refeitos sobre PostgreSQL, sem herdar os padrões inseguros do
protótipo (SHA-256 simples de senha, identidade aceita do navegador,
`innerHTML` com dado do banco). A área "Aprender" usa a mesma sessão:
estatísticas, presença por QR assinado e IA (paciente virtual, preceptor,
geração de casos e preceptor do laboratório, via Groq) rodam na Worker.
Ver `docs/SECURITY.md`.

## Arquitetura

```
┌──────────────────────────────┐        POST JSON          ┌────────────────────────────────┐
│  frontend/ (GitHub Pages)    │  ────────────────────────▶ │  worker/ (Cloudflare Workers)   │
│  index.html + app.js + css   │  ◀────────────────────────  │  API_REGISTRY (allowlist)       │
│  site 100% estático          │       {success, ...}        │  services/* → Neon (HTTP)       │
└──────────────────────────────┘                             └────────────────────────────────┘
```

- O front-end chama `fetch()` contra o Worker, com `action`+`args` no corpo
  em JSON. O Worker só invoca os nomes de função explicitamente listados em
  `API_REGISTRY` (`worker/src/handlers.js`) — nunca resolve um nome
  dinamicamente.
- Nenhuma credencial de banco, pepper de sessão, chave de e-mail ou chave
  do Groq chega ao front-end — só o token de sessão opaco que o backend
  emite após o login (espelhado em `localStorage` por até 30 min; ver
  `docs/SECURITY.md`).
- Os módulos da área "Aprender" rodam em iframe da mesma origem e chamam
  a Worker pela **ponte** `LaiftApi.call` → `App.callLearningApi`, que só
  aceita ações `apiLearn*`, `apiAdminAttendance*`, `apiAdminAi*` e
  `apiAdminLearn*` e injeta o token da sessão (`modulos/shared/laift-identity.js`).
- Toda página publicada tem **Content-Security-Policy** estrita (sem
  `'unsafe-inline'`/`'unsafe-eval'` em `script-src`); bibliotecas de CDN
  só do jsDelivr, com versão fixa e SRI.
- O backend usa o driver HTTP serverless do próprio Neon
  (`@neondatabase/serverless`) em vez de uma conexão com estado — cada
  consulta é uma requisição HTTP isolada, sem handshake de conexão a abrir
  a cada chamada.
- Ver `docs/SECURITY.md` para o detalhamento de cada decisão de segurança,
  incluindo o modelo de CORS/CSRF.

## Stack

- **Front-end:** HTML5 + CSS3 responsivo mobile-first + JavaScript vanilla
  (sem framework), publicado como site estático no GitHub Pages.
- **Back-end/API:** Cloudflare Workers (JavaScript, runtime V8 na borda),
  roteamento por allowlist fechada.
- **Persistência:** Neon PostgreSQL, acessado via `@neondatabase/serverless`
  (HTTP, sem conexão com estado), com tagged template do driver
  parametrizado em toda consulta.
- **Rate limit:** tabela própria no Postgres (`rate_limit_buckets`), via
  UPSERT atômico — sem depender de um serviço de cache externo.
- **Senhas:** `pgcrypto` (`crypt()` + `gen_salt('bf')`) — hash sempre
  calculado no Postgres, nunca em JavaScript.
- **E-mail:** API HTTP da Brevo (confirmação de conta, redefinição de
  senha).
- **IA:** Groq (API compatível com OpenAI), com pool de chaves, failover,
  cota diária por pessoa e disjuntor global (`worker/src/ai/`).
- **Ferramentas:** Git, GitHub, GitHub Actions (deploy do front-end),
  Wrangler (deploy do back-end), Jest (Worker), PGlite (validação das
  migrações), Playwright (E2E do front-end, incluindo a CSP).

## Estrutura

```
plataforma-membros/
├── README.md
├── .github/workflows/
│   └── deploy-frontend.yml   # build (ofusca app.js) e publica frontend/dist no GitHub Pages
│
├── frontend/                 # site estático — publicado no GitHub Pages
│   ├── index.html, styles.css, app.js   # plataforma (app.js é ofuscado no build)
│   ├── learning.js           # área "Aprender": hub, credencial QR, estatísticas
│   ├── admin-ai.js           # painel admin "IA": saúde das chaves, uso, moderação do acervo
│   ├── messaging.js, msg-crypto.js      # mensageria E2EE
│   ├── 404.html, termos.html, privacidade.html, static-page.js
│   ├── modulos/              # módulos LAIFT (antigo o-bala-vip), em iframe da mesma origem
│   │   ├── shared/           # laift-identity.js (ponte), safe-dom.js, laift-tokens.css,
│   │   │                     # quiz-engine.js/.css (motor único de quiz), style.css
│   │   ├── quiz/, toxicologia/        # simuladores
│   │   ├── clinica/          # clínica virtual (paciente e preceptor com IA)
│   │   ├── laboratorio/      # laboratório + studio/ (estúdio molecular)
│   │   ├── anatomia-3d/      # atlas 3D e farmacocinética
│   │   ├── fiscal/           # terminal fiscal (check-in por QR, CSV, crachás) — admin
│   │   └── cracha/           # estúdio de crachá (id, nome, cargo, qr)
│   ├── vendor/               # bibliotecas versionadas localmente (QR Code)
│   ├── scripts/
│   │   ├── build.js          # gera dist/
│   │   └── e2e/              # Playwright: smoke, fase2, fase3, fase4, csp (+ cdn-mirror/)
│   └── dev-server.js         # pré-visualização local, não é publicado
│
├── worker/                   # backend — Cloudflare Workers
│   ├── wrangler.toml         # vars públicas, R2, KV (segredos via `wrangler secret put`)
│   ├── src/
│   │   ├── index.js          # roteador HTTP: CORS, parse, dispatch
│   │   ├── handlers.js       # API_REGISTRY (allowlist) + run/runWithSession
│   │   ├── security.js       # tokens, sessão, papéis, rate limit
│   │   ├── db.js, cache.js, constants.js, errors.js, logging.js, mailer.js
│   │   ├── ai/               # groqClient (pool de chaves), prompts, validators, config
│   │   └── services/         # Auth, Profile, Event, …, Learning, Attendance, Ai, Clinical
│   ├── scripts/validate-migrations.mjs  # aplica sql/ num Postgres em memória (PGlite)
│   └── test/                 # Jest (ESM nativo do Node)
│
├── sql/                      # migrações numeradas e idempotentes (001 … 013)
│
├── docs/
│   ├── DEPLOYMENT.md                 # Neon, segredos, Worker, Pages, primeiro admin
│   ├── SECURITY.md                   # controles, CSP por página, riscos, rotação
│   ├── PLANO_UNIFICACAO_LAIFT.md     # fusão com o o-bala-vip
│   ├── PLANO_FASES_2_3_4.md          # contratos e status das fases 2, 3 e 4
│   ├── FASE_2_DADOS_PRESENCA.md, FASE_3_IA_CLINICA.md, FASE_4_QUALIDADE.md
│   ├── TERMOS_DE_USO.md              # minuta — revisão jurídica pendente
│   └── POLITICA_DE_PRIVACIDADE.md    # minuta — revisão jurídica pendente
│
└── legacy-appsscript/        # backend ANTERIOR (Apps Script), só arquivo — desligado
```

## Modelo de acesso

Papéis: `visitor`, `member`, `admin`. `banned` é um **status** da conta,
não um papel — uma conta banida perde acesso a qualquer recurso
autenticado independentemente do papel que tinha antes.

| Recurso/ação | Visitor | Member | Admin | Banned |
|---|---|---|---|---|
| Ver eventos publicados permitidos | Sim | Sim | Sim | Não em recursos autenticados |
| Inscrever-se em eventos permitidos | Sim | Sim | Sim | Não |
| Enviar propostas | Sim | Sim | Sim | Não |
| Votar em propostas abertas | Não | Sim | Sim | Não |
| Ver e aderir a tarefas | Não | Sim | Sim | Não |
| Editar próprio perfil e preferências | Sim | Sim | Sim | Não |
| Usar a área "Aprender" (módulos LAIFT, estatísticas, credencial QR) | Sim | Sim | Sim | Não |
| Usar a IA (clínica e laboratório), com cota diária¹ | Sim | Sim | Sim | Não |
| Gerar caso com IA (vai para moderação) | Sim | Sim | Sim | Não |
| Terminal fiscal (check-in, CSV, crachás) | Não | Não | Sim | Não |
| Painel IA: saúde das chaves, uso, aprovar/rejeitar casos | Não | Não | Sim | Não |
| Gerir pessoas e conteúdo | Não | Não | Sim | Não |
| Consultar auditoria e logs técnicos | Não | Não | Sim | Não |

¹ Cotas por dia (`worker/src/constants.js`, `AI_QUOTAS`), por exemplo
perguntas ao paciente virtual: 40 (visitor), 150 (member), 300 (admin);
mais um teto global de 3.000 chamadas/dia para toda a plataforma.

Toda checagem de papel/status é feita **no servidor**, a cada chamada, a
partir da sessão resolvida no banco — nunca a partir de dado enviado pelo
cliente. Ver `docs/SECURITY.md`.

## Começando

Siga `docs/DEPLOYMENT.md` do início ao fim — cobre o banco Neon e as
migrações 001–013, os segredos do Worker (`DATABASE_URL`,
`SESSION_TOKEN_PEPPER`, `BREVO_API_KEY`, `GROQ_API_KEYS`), o deploy via
Wrangler, a publicação do front-end e a promoção manual do primeiro
administrador.

```bash
cd worker && npm ci && npm test && npm run validate:sql
cd ../frontend && npm install && npm run e2e
```

## Primeiro administrador

**Daniel Pires Francisco** (`dpires292@gmail.com`) é o primeiro
administrador previsto. O cadastro dele nasce como `visitor` como qualquer
outro; a promoção a `admin` é manual, via SQL, após confirmação de e-mail e
verificação humana da identidade — nunca automática por nome ou e-mail
cadastrado no formulário. Ver passo a passo em `docs/DEPLOYMENT.md`.
