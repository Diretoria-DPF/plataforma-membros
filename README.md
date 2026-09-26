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

Não é uma reescrita disfarçada da versão anterior baseada em Planilhas
Google: o modelo de dados, autenticação, sessão e renderização foram
refeitos do zero sobre PostgreSQL, sem herdar os padrões inseguros do
protótipo legado (SHA-256 simples de senha, identidade aceita diretamente
do navegador, `innerHTML` com dado do banco). Ver `docs/SECURITY.md` para o
detalhamento de cada decisão.

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
- Nenhuma credencial de banco, pepper de sessão ou chave de e-mail jamais
  chega ao front-end — só o token de sessão opaco que o próprio backend
  emite após login, e que fica em memória no navegador (nunca
  `localStorage`).
- O backend usa o driver HTTP serverless do próprio Neon
  (`@neondatabase/serverless`) em vez de uma conexão com estado — cada
  consulta é uma requisição HTTP isolada, sem handshake de conexão a abrir
  a cada chamada. Ver `docs/DEPLOYMENT.md` para o porquê disso ter
  substituído a versão anterior em Google Apps Script.
- Ver `docs/SECURITY.md` para o detalhamento de cada decisão de segurança,
  incluindo o modelo de CORS/CSRF.

## Stack

- **Front-end:** HTML5 + CSS3 responsivo mobile-first + JavaScript vanilla
  (sem framework), publicado como site estático no GitHub Pages.
- **Back-end/API:** Cloudflare Workers (JavaScript, runtime V8 na borda),
  roteamento por allowlist fechada.
- **Persistência:** Neon PostgreSQL, acessado via `@neondatabase/serverless`
  (HTTP, sem conexão com estado) e `PreparedStatement`/template tag
  parametrizado em toda consulta.
- **Rate limit:** tabela própria no Postgres (`rate_limit_buckets`), via
  UPSERT atômico — sem depender de um serviço de cache externo.
- **Senhas:** `pgcrypto` (`crypt()` + `gen_salt('bf')`) — hash sempre
  calculado no Postgres, nunca em JavaScript.
- **E-mail:** API HTTP da Brevo (confirmação de conta, redefinição de
  senha).
- **Ferramentas:** Git, GitHub, GitHub Actions (deploy do front-end),
  Wrangler (deploy do back-end), Jest.

## Estrutura

```
plataforma-membros/
├── README.md
├── .gitignore
├── .github/workflows/
│   └── deploy-frontend.yml   # publica frontend/ no GitHub Pages a cada push
│
├── frontend/                 # site estático — publicado no GitHub Pages
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── messaging.js, msg-crypto.js  # mensageria E2EE
│   ├── learning.js           # área "Aprender" (hub dos módulos LAIFT)
│   ├── modulos/              # módulos de aprendizagem (antigo o-bala-vip), em iframe
│   ├── vendor/               # bibliotecas de terceiros versionadas (QR Code)
│   └── dev-server.js         # servidor local só para pré-visualização, não é publicado
│
├── worker/                   # backend — publicado no Cloudflare Workers
│   ├── wrangler.toml         # config + vars públicas (segredos via `wrangler secret put`)
│   ├── src/
│   │   ├── index.js          # roteador HTTP: CORS, parse, dispatch
│   │   ├── handlers.js       # API_REGISTRY (allowlist) + run/runWithSession
│   │   ├── security.js       # tokens, sessão, rate limit
│   │   ├── db.js             # driver Neon serverless
│   │   ├── constants.js
│   │   ├── errors.js
│   │   ├── logging.js
│   │   ├── mailer.js         # API da Brevo
│   │   └── services/         # AuthService, ProfileService, EventService, ...
│   └── test/                 # Jest (ESM nativo do Node)
│
├── sql/                      # migrações numeradas e idempotentes (001 … 011)
│
├── docs/
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
│   ├── PLANO_UNIFICACAO_LAIFT.md     # fusão com o o-bala-vip e próximas fases
│   ├── TERMOS_DE_USO.md              # minuta — revisão jurídica pendente
│   └── POLITICA_DE_PRIVACIDADE.md    # minuta — revisão jurídica pendente
│
└── legacy-appsscript/         # backend ANTERIOR (Google Apps Script), arquivado
    ├── README.md               # por que existe, por que não usar para nada novo
    ├── src/                    # .gs originais
    ├── tests/
    └── ...
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
| Usar a área "Aprender" (módulos LAIFT) | Sim | Sim | Sim | Não |
| Terminal fiscal (check-in/crachás)¹ | Não | Não | Sim | Não |
| Gerir pessoas e conteúdo | Não | Não | Sim | Não |
| Consultar auditoria e logs técnicos | Não | Não | Sim | Não |

¹ Até a Fase 2 do `docs/PLANO_UNIFICACAO_LAIFT.md`, o terminal fiscal ainda é
protegido pela senha fiscal do Apps Script legado; o papel admin aqui só
controla a exibição do painel.

Toda checagem de papel/status é feita **no servidor**, a cada chamada, a
partir da sessão resolvida no banco — nunca a partir de dado enviado pelo
cliente. Ver `docs/SECURITY.md`.

## Começando

Siga `docs/DEPLOYMENT.md` do início ao fim — cobre criação do
projeto/branch Neon, aplicação das migrações, segredos do Worker, deploy
via Wrangler, publicação do front-end e promoção manual do primeiro
administrador.

```bash
cd worker
npm install
npm test
npm run deploy
```

## Primeiro administrador

**Daniel Pires Francisco** (`dpires292@gmail.com`) é o primeiro
administrador previsto. O cadastro dele nasce como `visitor` como qualquer
outro; a promoção a `admin` é manual, via SQL, após confirmação de e-mail e
verificação humana da identidade — nunca automática por nome ou e-mail
cadastrado no formulário. Ver passo a passo em `docs/DEPLOYMENT.md`.
