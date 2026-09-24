# Deployment — Plataforma de Membros

Este guia assume que você tem: uma conta Google, uma conta Neon, Node.js ≥ 18,
e acesso a um repositório GitHub (`Diretoria-DPF/plataforma-membros` ou o que
você configurar). Nenhum passo aqui foi executado por mim nesta sessão — não
tenho credenciais de Neon, Apps Script ou GitHub. Siga na ordem.

## 1. Criar o projeto/branch Neon e aplicar as migrações

1. Crie um projeto no [console do Neon](https://console.neon.tech) (ou uma
   branch nova dentro de um projeto existente, se preferir isolar o ambiente
   de desenvolvimento do de produção).
2. Anote a branch padrão (`main`, geralmente).
3. Abra o **SQL Editor** do Neon (ou conecte via `psql`) na branch de destino
   e execute, **nesta ordem exata**:
   - `sql/001_schema.sql`
   - `sql/002_functions_and_triggers.sql`

   Ambos os arquivos são idempotentes (usam `IF NOT EXISTS` / `CREATE OR
   REPLACE` / blocos de guarda para `CREATE TYPE`), então podem ser
   reaplicados com segurança se você não tiver certeza do estado atual do
   banco — mas o fluxo normal é aplicar cada arquivo **uma vez**, na ordem,
   e tratar mudanças futuras como **novos** arquivos numerados
   (`003_*.sql`, `004_*.sql`, ...), nunca editando 001/002 depois de
   aplicados em qualquer ambiente compartilhado.
4. Confira o resultado:
   ```sql
   SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
   -- Deve haver 14 tabelas: profiles, consents, preferences, events,
   -- event_registrations, proposals, votes, tasks, task_signups, feedback,
   -- audit_logs, error_logs, account_tokens, sessions.
   ```

## 2. Obter a string de conexão JDBC

O Apps Script se conecta via `Jdbc.getConnection(url, user, password)`. A
connection string que o Neon mostra no console (`postgresql://user:pass@host/db?sslmode=require&channel_binding=require`)
**não** é uma URL JDBC válida — não copie-a diretamente.

1. No Neon, obtenha os dados de conexão **pooled** (opção "Connection
   pooling" ativada / hostname terminado em `-pooler`) — o Apps Script abre
   uma conexão nova a cada execução, então usar o endpoint com pooler evita
   esgotar o limite de conexões diretas do Neon sob uso concorrente.
2. Monte a URL JDBC manualmente no formato:
   ```
   jdbc:postgresql://<host-pooler>:5432/<database>?sslmode=require
   ```
   Não inclua `channel_binding=require` — esse parâmetro é específico do
   `libpq`/driver Node do Neon; o suporte a ele pelo driver PostgreSQL JDBC
   embutido no Apps Script não é documentado publicamente, então foi
   omitido deliberadamente (ver docs/SECURITY.md, "Riscos residuais").
3. Guarde separadamente: host, usuário, senha, nome do banco.

**Restrições confirmadas na documentação oficial do Apps Script (JDBC
service, consultada nesta sessão):** a conexão só funciona em portas ≥ 1025
(5432 do Postgres está OK) e exige TLS 1.2+. Também é necessário autorizar,
no firewall do banco, as faixas de IP de onde o Apps Script se conecta —
**mas** isso só é relevante se você ativar o recurso **IP Allow** do Neon,
que é exclusivo do plano pago **Scale** (confirmado na documentação do
Neon). No plano padrão, o Neon não bloqueia por IP — a segurança da conexão
depende de TLS + credenciais fortes. Se sua organização ativar IP Allow no
futuro, valide antes se a lista de faixas de IP do Apps Script é praticável
de configurar lá (não testado nesta sessão).

## 3. Criar o projeto Apps Script e configurar Script Properties

1. Acesse [script.google.com](https://script.google.com) → **Novo projeto**.
2. Renomeie para "Plataforma de Membros".
3. No editor, abra **Configurações do projeto** ⚙️ → copie o **ID do
   script** (você vai usar no `.clasp.json`).
4. Ainda em Configurações do projeto, vá em **Script Properties** e
   cadastre manualmente (nunca via código, nunca versionado):

   | Propriedade | Valor de exemplo | Obrigatória |
   |---|---|---|
   | `DB_JDBC_URL` | `jdbc:postgresql://SEU-HOST-pooler.neon.tech:5432/SEU_BANCO?sslmode=require` | Sim |
   | `DB_USER` | `SEU_USUARIO_NEON` | Sim |
   | `DB_PASSWORD` | `SUA_SENHA_NEON` | Sim |
   | `SESSION_TOKEN_PEPPER` | uma string aleatória longa (ex.: gerada com `openssl rand -hex 32`) | Sim |
   | `APP_BASE_URL` | preenchido depois do primeiro deploy (fallback; normalmente desnecessário) | Não |
   | `MAIL_FROM_NAME` | `Plataforma de Membros` | Não |

## 4. Vincular o clasp e sincronizar os arquivos

```bash
npm install
npx clasp login
cp .clasp.json.example .clasp.json
# edite .clasp.json e cole o scriptId copiado no passo 3
npx clasp status
```

`clasp status` deve listar exatamente: `appsscript.json` e todos os arquivos
sob `src/**/*.gs` e `src/**/*.html` — nada de `sql/`, `tests/`, `docs/`,
`package.json` etc. (isso é controlado pelo `.claspignore`, que ignora tudo
por padrão e libera só o necessário). **Confira essa lista antes de
prosseguir.** Eu não pude rodar `clasp status`/`clasp push` de verdade nesta
sessão porque não existe um `scriptId` real disponível aqui — isso fica como
verificação pendente para você.

Como o `rootDir` do `.clasp.json` é a raiz do repositório, os arquivos são
enviados preservando o caminho (ex.: `src/ui/Index.html` vira o arquivo
`src/ui/Index` no projeto Apps Script — o editor moderno do Apps Script
exibe nomes com `/` como pastas visuais). Por isso `Main.gs` referencia os
templates HTML como `'src/ui/Index'`, `'src/ui/Styles'` etc., e não apenas
`'Index'`.

```bash
npx clasp push
```

## 5. Autorizar escopos e publicar o Web App

1. No editor do Apps Script, rode a função `doGet` uma vez manualmente (ou
   abra a implantação de teste) para disparar a tela de autorização OAuth.
   Os escopos são **detectados automaticamente** pelo Apps Script a partir
   do código real (não declaramos `oauthScopes` manualmente no
   `appsscript.json` — ver docs/SECURITY.md sobre essa decisão). Confira em
   **Configurações do projeto → Escopos OAuth do projeto** que a lista
   inclui apenas o necessário (serviço externo/JDBC e envio de e-mail) antes
   de publicar para outras pessoas.
2. **Implantar → Nova implantação → Tipo: App da Web**.
   - Executar como: **Eu** (proprietário) — necessário para que
     visitantes sem conta Google consigam usar o app, já que a autorização
     de acesso é feita pela própria aplicação (sessão própria), não pelo
     login do Google.
   - Quem pode acessar: **Qualquer pessoa** (a proteção de dados
     pessoais/ações autenticadas é feita pela camada de sessão da
     aplicação, não pelo controle de acesso do Google).
3. Copie a URL de implantação gerada.

## 6. Validar os fluxos com contas de teste

Antes de considerar o ambiente utilizável, valide manualmente (eu não
consegui rodar nada disto sem credenciais reais):

- [ ] Cadastro de uma conta de teste → e-mail de confirmação chega →
      confirmar → login funciona.
- [ ] Login com senha errada e com e-mail inexistente → mesma mensagem
      genérica nos dois casos.
- [ ] "Esqueci minha senha" → e-mail chega → link redefine a senha →
      sessões antigas dessa conta param de funcionar.
- [ ] Um `SELECT` direto em `audit_logs` no Neon mostra as ações acima,
      sem senha/token/telefone/e-mail completo nos detalhes.
- [ ] Logout revoga a sessão (tentar reusar o token antigo falha).

## 7. Promover manualmente o primeiro administrador

O primeiro administrador é **Daniel Pires Francisco**
(`dpires292@gmail.com`). Ele deve se cadastrar normalmente pela tela pública
(nascendo como `visitor`) e confirmar o e-mail. **Só depois disso**, com a
identidade verificada por um humano da diretoria, promova manualmente via
SQL no Neon:

```sql
BEGIN;

UPDATE profiles
SET role = 'admin'::user_role
WHERE email = 'dpires292@gmail.com'
  AND email_confirmed_at IS NOT NULL
RETURNING id, full_name, email, role, status, email_confirmed_at;

-- Confira que a linha retornada é realmente a pessoa certa e que
-- role = 'admin' antes de confirmar.

COMMIT;
```

Se a consulta não retornar nenhuma linha, **não dê commit** — investigue
antes (provavelmente o e-mail ainda não foi confirmado, ou está escrito
diferente do cadastro).

## 8. Enviar o código ao GitHub (sem segredos)

```bash
git init
git add .
git status   # confirme que .clasp.json (real) NÃO aparece — só .clasp.json.example
git commit -m "Estrutura inicial da plataforma de membros"
git branch -M main
git remote add origin https://github.com/Diretoria-DPF/plataforma-membros.git
git push -u origin main
```

(Já feito — repositório publicado em
https://github.com/Diretoria-DPF/plataforma-membros.)

## 9. Rollback e recuperação

- **Rollback de deploy do Web App:** no editor Apps Script, **Implantar →
  Gerenciar implantações**, edite a implantação ativa e aponte para uma
  versão anterior do script (o Apps Script versiona cada `clasp push`
  seguido de deploy). Isso não afeta o banco.
- **Rollback de schema:** como as migrações são incrementais e numeradas,
  reverter uma mudança de schema exige escrever um novo arquivo
  `NNN_rollback_*.sql` que desfaça explicitamente a alteração (não existe
  "undo" automático). Para o Neon especificamente, considere criar uma
  **branch** antes de aplicar uma migração arriscada em produção
  (`neon branches create`), testar nela, e só então aplicar na branch
  principal.
- **Recuperação de credenciais comprometidas:** ver docs/SECURITY.md,
  seção "Rotação de credenciais".

## Status real (atualizado após deploy ao vivo)

- **Neon:** projeto `plataforma-membros` (`jolly-snow-39561777`, São Paulo)
  criado, `001_schema.sql`/`002_functions_and_triggers.sql` aplicados e
  verificados contra o banco de verdade (14 tabelas, 13 gatilhos), incluindo
  um teste real do gatilho de proteção do último admin (bloqueou/permitiu
  corretamente). Banco limpo, sem dados de teste.
- **GitHub:** publicado em https://github.com/Diretoria-DPF/plataforma-membros
  (público).
- **Apps Script:** projeto criado, código publicado via `clasp push`, Web App
  **implantado e no ar**:
  `https://script.google.com/macros/s/AKfycbwYCBnyvnAyfa_EGi1AdZZb1ChFOuJtdSoDBYDoLVO_KipSaNUMRs8fcfbkbzpQP9Ki6w/exec`
  — a tela de login carrega corretamente (verificado ao vivo no navegador).
  Autorização OAuth já concedida pelo dono (`dpires292@gmail.com`).
- **Pendente (só você pode fazer):** cadastrar `DB_JDBC_URL`, `DB_USER`,
  `DB_PASSWORD`, `SESSION_TOKEN_PEPPER` em Script Properties (passo 3 acima)
  — sem isso, cadastro/login retornam erro genérico porque a conexão ao
  banco não tem credencial. Depois disso, seguir os passos 6 e 7
  (validar fluxos com conta de teste, promover o primeiro admin).

Durante o deploy real, dois bugs só reprodutíveis no Apps Script de verdade
(não em Node/V8 padrão, por isso os testes automatizados não pegaram antes)
foram encontrados e corrigidos ao vivo:
1. O Apps Script avalia o código de nível superior de todos os `.gs` em
   **ordem alfabética pelo nome do arquivo**, não por dependência — o
   arquivo de entrada precisou ser renomeado de `Code.gs` para `Main.gs`
   para rodar depois de `Config.gs` (que declara o namespace `App`).
2. Um comentário explicando o risco de uma "scriptlet vazia" do HtmlService
   continha, literalmente, a sintaxe vazia dentro de si — o HtmlService varre
   o arquivo procurando esse padrão como texto bruto, sem entender que
   estava dentro de um comentário, e isso quebrava a geração do template.

Ambos têm teste de regressão dedicado (`tests/loadOrder.test.js`,
`tests/htmlTemplateSafety.test.js`) para não voltarem a acontecer.

## Verificações que ainda ficam pendentes

- Envio real de e-mail (`MailApp.sendEmail`) — só é exercitado quando
  alguém completa o fluxo de cadastro/redefinição de senha com Script
  Properties configuradas.
- Comportamento do driver JDBC com colunas ENUM/`timestamptz` do Neon sob
  carga real de uso (validado apenas via `run_sql`/`run_sql_transaction`
  do MCP do Neon, não via JDBC do Apps Script em si).
- Promoção do primeiro administrador (passo 7) — depende de alguém
  completar o cadastro real primeiro.
