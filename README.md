# Plataforma de Membros

**No ar:** https://diretoria-dpf.github.io/plataforma-membros/ — esta é a
URL que as pessoas usam. O back-end (Apps Script) não serve mais interface
nenhuma; é só uma API JSON chamada pelo front-end acima. Ver seção
"Arquitetura" abaixo e `docs/DEPLOYMENT.md`.

Aplicação de governança comunitária (eventos, propostas com votação,
tarefas colaborativas e administração de contas), dividida em duas partes
publicadas separadamente:

- **Front-end**: site estático (HTML/CSS/JS puro, sem framework) publicado
  no **GitHub Pages**, neste mesmo repositório (pasta `frontend/`).
- **Back-end**: **Google Apps Script Web App** exposto como API HTTP/JSON
  (`doPost`), com **Neon PostgreSQL** como banco relacional via JDBC.

Versionada com Git/GitHub e sincronizada via `@google/clasp` (só o
back-end; o front-end é publicado direto pelo GitHub Actions a partir deste
repositório).

Não é uma reescrita disfarçada da versão anterior baseada em Planilhas
Google: o modelo de dados, autenticação, sessão e renderização foram
refeitos do zero sobre PostgreSQL, sem herdar os padrões inseguros do
protótipo legado (SHA-256 simples de senha, identidade aceita diretamente
do navegador, `innerHTML` com dado do banco). Ver `docs/SECURITY.md` para o
detalhamento de cada decisão.

## Arquitetura (front-end e back-end separados)

```
┌──────────────────────────────┐        POST JSON         ┌───────────────────────────────┐
│  frontend/ (GitHub Pages)    │  ───────────────────────▶ │  Apps Script (doPost, Main.gs) │
│  index.html + app.js + css   │  ◀───────────────────────  │  API_REGISTRY (allowlist)      │
│  site 100% estático           │      {success, ...}       │  App.*Service → Neon Postgres  │
└──────────────────────────────┘                            └───────────────────────────────┘
```

- O front-end **nunca** foi feito com `google.script.run` — isso só funciona
  dentro do iframe que o próprio `HtmlService` renderiza, então um site fora
  do domínio do Apps Script não consegue usá-lo. O front-end chama
  `fetch()` contra `doPost` do Apps Script, com `action`+`args` no corpo
  em JSON (mesmo nome/ordem de argumento que as antigas chamadas
  `google.script.run.apiXxx(...)`).
- `doPost` só aceita os nomes de função explicitamente listados em
  `API_REGISTRY` (`src/Main.gs`) — nunca resolve um nome dinamicamente.
- Nenhuma credencial de banco, pepper de sessão ou senha jamais chega ao
  front-end — só o token de sessão opaco que o próprio backend emite após
  login, e que fica em memória no navegador (nunca `localStorage`).
- Ver `docs/SECURITY.md` para o detalhamento de cada decisão, incluindo o
  que muda no modelo de CSRF/CORS em relação à versão anterior (que servia
  tudo dentro do próprio Apps Script).

## Stack

- **Front-end:** HTML5 + CSS3 responsivo mobile-first + JavaScript vanilla
  (sem framework), publicado como site estático no GitHub Pages.
- **Back-end/API:** Google Apps Script (runtime V8) exposto como API
  HTTP/JSON via `doPost` — não serve mais HTML.
- **Persistência:** Neon PostgreSQL, acessado via `Jdbc.getConnection`
  (JDBC com TLS e `PreparedStatement`).
- **Senhas:** `pgcrypto` (`crypt()` + `gen_salt('bf')`) — hash sempre
  calculado no Postgres, nunca em JavaScript.
- **E-mail:** `MailApp` (confirmação de conta, redefinição de senha).
- **Ferramentas:** Git, GitHub, GitHub Actions (deploy do front-end),
  `@google/clasp` (deploy do back-end), ESLint, Jest.

## Estrutura

```
plataforma-membros/
├── .clasp.json.example     # copie para .clasp.json e preencha o scriptId real
├── .claspignore
├── .gitignore
├── .eslintrc.cjs
├── appsscript.json
├── package.json
├── README.md
├── .github/workflows/
│   └── deploy-frontend.yml # publica frontend/ no GitHub Pages a cada push
├── frontend/                # site estático — publicado no GitHub Pages
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── dev-server.js        # só para pré-visualização local, não é publicado
├── sql/
│   ├── 001_schema.sql
│   └── 002_functions_and_triggers.sql
├── src/                      # back-end — publicado no Apps Script via clasp
│   ├── Config.gs            # leitura de Script Properties (segredos)
│   ├── Constants.gs         # enums e limites compartilhados
│   ├── Security.gs          # validação, tokens, sessão, rate limit
│   ├── Database.gs          # camada JDBC (PreparedStatement sempre)
│   ├── Logging.gs           # audit_logs / error_logs minimizados
│   ├── Main.gs               # doPost (API JSON) + API_REGISTRY (allowlist)
│   └── services/
│       ├── AuthService.gs
│       ├── ProfileService.gs
│       ├── EventService.gs
│       ├── ProposalService.gs
│       ├── TaskService.gs
│       ├── AdminService.gs
│       └── AuditService.gs
├── tests/
│   ├── helpers/gasEnvironment.js  # carrega os .gs reais num vm do Node
│   ├── apiRouter.test.js    # allowlist do doPost
│   ├── validation.test.js
│   ├── permissions.test.js
│   ├── security.test.js
│   └── services.test.js
└── docs/
    ├── DEPLOYMENT.md
    ├── SECURITY.md
    ├── TERMOS_DE_USO.md          # minuta — revisão jurídica pendente
    └── POLITICA_DE_PRIVACIDADE.md  # minuta — revisão jurídica pendente
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
| Gerir pessoas e conteúdo | Não | Não | Sim | Não |
| Consultar auditoria e logs técnicos | Não | Não | Sim | Não |

Toda checagem de papel/status é feita **no servidor**, a cada chamada, a
partir da sessão resolvida no banco — nunca a partir de dado enviado pelo
cliente. Ver `docs/SECURITY.md`.

## Começando

Siga `docs/DEPLOYMENT.md` do início ao fim — cobre criação do
projeto/branch Neon, aplicação das migrações, Script Properties, `clasp`,
publicação do Web App e promoção manual do primeiro administrador.

```bash
npm install
npm run lint
npm test
```

## Primeiro administrador

**Daniel Pires Francisco** (`dpires292@gmail.com`) é o primeiro
administrador previsto. O cadastro dele nasce como `visitor` como qualquer
outro; a promoção a `admin` é manual, via SQL, após confirmação de e-mail e
verificação humana da identidade — nunca automática por nome ou e-mail
cadastrado no formulário. Ver passo a passo em `docs/DEPLOYMENT.md`.
