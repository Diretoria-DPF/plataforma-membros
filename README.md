# Plataforma de Membros

Aplicação de governança comunitária (eventos, propostas com votação,
tarefas colaborativas e administração de contas) construída como um
**Google Apps Script Web App** com **Neon PostgreSQL** como banco
relacional, versionada com Git/GitHub e sincronizada via `@google/clasp`.

Não é uma reescrita disfarçada da versão anterior baseada em Planilhas
Google: o modelo de dados, autenticação, sessão e renderização foram
refeitos do zero sobre PostgreSQL, sem herdar os padrões inseguros do
protótipo legado (SHA-256 simples de senha, identidade aceita diretamente
do navegador, `innerHTML` com dado do banco). Ver `docs/SECURITY.md` para o
detalhamento de cada decisão.

## Stack

- **Backend/servidor de páginas:** Google Apps Script (runtime V8),
  `HtmlService`, Web App, `google.script.run`.
- **Frontend:** HTML5 + CSS3 responsivo mobile-first + JavaScript vanilla
  (sem framework).
- **Persistência:** Neon PostgreSQL, acessado via `Jdbc.getConnection`
  (JDBC com TLS e `PreparedStatement`).
- **Senhas:** `pgcrypto` (`crypt()` + `gen_salt('bf')`) — hash sempre
  calculado no Postgres, nunca em JavaScript.
- **E-mail:** `MailApp` (confirmação de conta, redefinição de senha).
- **Ferramentas:** Git, GitHub, `@google/clasp`, ESLint, Jest.

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
├── sql/
│   ├── 001_schema.sql
│   └── 002_functions_and_triggers.sql
├── src/
│   ├── Config.gs            # leitura de Script Properties (segredos)
│   ├── Constants.gs         # enums e limites compartilhados
│   ├── Security.gs          # validação, tokens, sessão, rate limit
│   ├── Database.gs          # camada JDBC (PreparedStatement sempre)
│   ├── Logging.gs           # audit_logs / error_logs minimizados
│   ├── Main.gs               # doGet + ÚNICAS funções chamáveis pelo cliente
│   ├── services/
│   │   ├── AuthService.gs
│   │   ├── ProfileService.gs
│   │   ├── EventService.gs
│   │   ├── ProposalService.gs
│   │   ├── TaskService.gs
│   │   ├── AdminService.gs
│   │   └── AuditService.gs
│   └── ui/
│       ├── Index.html
│       ├── Styles.html
│       ├── Header.html
│       ├── Navigation.html
│       ├── Modals.html
│       └── Scripts.html
├── tests/
│   ├── helpers/gasEnvironment.js  # carrega os .gs reais num vm do Node
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
