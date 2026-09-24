# Segurança — Plataforma de Membros

Este documento descreve ameaças consideradas, decisões técnicas, controles
implementados e riscos residuais. **Não há aqui nenhuma afirmação de
segurança absoluta** — apenas o que foi decidido, por quê, e o que
permanece como risco conhecido e não eliminado.

## Modelo de ameaças considerado

- Usuário anônimo tentando acessar dados/ações que exigem sessão.
- Usuário autenticado com papel `visitor`/`member` tentando acessar
  funções de `admin` ou de outro papel.
- Cliente adulterado (DevTools/chamada direta a `google.script.run`)
  enviando `userId`, `role` ou `status` forjados.
- Conta banida tentando continuar usando uma sessão já emitida.
- Conteúdo malicioso (script) submetido em campos de texto livre
  (nome, descrição de proposta, feedback) tentando executar no navegador
  de outra pessoa.
- Tentativas automatizadas de força bruta em login/cadastro/confirmação/
  redefinição de senha.
- Vazamento de credenciais do banco através de código, HTML, mensagens de
  erro ou histórico do Git.
- Corrida de concorrência em ações com efeito único (inscrição em evento
  com vaga limitada, voto, remoção do último administrador).

## Controles implementados

### Identidade e sessão
- **Nenhuma função chamável pelo cliente aceita `userId`/`role`/`status`
  como prova de identidade.** Toda função pública em `Main.gs` resolve a
  identidade a partir de um token de sessão opaco via
  `App.Security.requireSession`, que consulta o banco (join
  `sessions`+`profiles`) **a cada chamada** — nunca reutiliza um resultado
  em cache entre chamadas. Isso cobre diretamente o requisito de
  reverificar status/confirmação/papel em cada chamada autenticada.
- `google.script.run` só consegue invocar **funções de nível superior**
  do projeto. Toda a lógica de negócio vive dentro do objeto `App` (ex.:
  `App.AdminService.banUser`), que é **tecnicamente inacessível** a partir
  do navegador — não é uma convenção de nome, é uma restrição da própria
  plataforma. Isso resolve o requisito de restringir funções auxiliares
  internas sem depender só de convenção.
- Sessões têm TTL curto (30 min, `App.Constants.LIMITS.SESSION_TTL_MINUTES`),
  token de alta entropia (duas UUIDv4 concatenadas via `Utilities.getUuid()`,
  backing CSPRNG do runtime), e só o **hash** (SHA-256 com pepper do
  servidor) é persistido — o valor bruto nunca chega ao banco.
- Logout revoga a sessão no servidor (`revoked_at`); redefinição de senha
  revoga **todas** as sessões da conta.

### Sessão no cliente (HtmlService) — o que é e o que não é
O Apps Script serve a página dentro de um `iframe` sandbox; o servidor
**não tem como emitir um cookie `HttpOnly`** nesse modelo (isso não é uma
omissão, é uma limitação da plataforma). Qualquer token mantido em
JavaScript é, por definição, legível por outro script rodando no mesmo
contexto. Decisão tomada: o token de sessão fica **apenas em uma variável
JavaScript em memória no cliente** (nunca `localStorage`/`sessionStorage`/
cookie). Consequência aceita: recarregar a página exige novo login. Ganho:
um payload de XSS persistente que sobreviva entre recarregamentos não
encontra um token salvo para reutilizar depois que a página fecha.
**A defesa real contra esse cenário continua sendo nunca ter XSS em
primeiro lugar** (próxima seção) — isto é mitigação de profundidade, não
uma solução para XSS.

### CSRF
Não implementamos um token CSRF dedicado. Justificativa: `google.script.run`
não é um endpoint HTTP comum acessível por um `<form>` ou `fetch` de outra
origem — a chamada depende de código JavaScript executando dentro do
`iframe` específico daquela implantação, carregado por aquele usuário. Um
site de terceiros não consegue simplesmente montar uma requisição para
`google.script.run` do jeito que consegue para um endpoint REST clássico.
**Risco residual real:** se um atacante conseguir executar JavaScript
*dentro* da própria página (XSS), ele herda a mesma capacidade de chamar
`google.script.run` que o usuário legítimo — nesse cenário um token CSRF
não ajudaria de qualquer forma, porque o script malicioso rodaria no mesmo
contexto autorizado. Por isso o investimento foi todo em prevenir XSS
(próxima seção), não em CSRF.

### XSS
- Toda a interface usa `document.createTextNode`/`textContent`/DOM
  properties para exibir dado vindo do servidor. **Nenhum `innerHTML` é
  usado com conteúdo dinâmico** em `src/ui/Scripts.html` (a única marcação
  fixa em HTML é a estática escrita por nós, sem interpolação de dados do
  banco).
- Nos templates `.html` do servidor (`Index.html`), usamos exclusivamente
  `<?= expr ?>` (que o `HtmlService` escapa automaticamente) para qualquer
  valor — nunca `<?!= expr ?>` (não escapado) fora dos `include()` de
  arquivos locais confiáveis.
- Conteúdo de propostas/feedback é tratado como texto puro em todo o
  fluxo: validado por tamanho, nunca reinterpretado como HTML.

### Autorização
- Toda função de serviço que faz algo sensível chama
  `App.Security.requireRole(identity, [...papéis permitidos])` **no
  servidor**, mesmo que a interface já esconda o botão correspondente para
  aquele papel. A ocultação de um botão de navegação (`Navigation.html`) é
  documentada explicitamente como conveniência de UI, não como controle de
  acesso.
- A visibilidade de eventos (`public`/`authenticated`/`members`) é
  filtrada dentro do `WHERE` da consulta SQL, nunca filtrada só depois de
  buscar tudo.

### Banco de dados
- 100% das consultas usam `PreparedStatement` com parâmetros tipados
  (`setString`/`setInt`/`setBoolean`/`setNull`); nenhuma entrada de usuário
  é concatenada em SQL. Para colunas `ENUM`, o placeholder recebe um cast
  explícito (`?::account_status`) — o valor continua vindo como parâmetro
  ligado, o cast é só a forma de o Postgres aceitar um enum customizado via
  bind.
- Ordenação/paginação administrativa (`AdminService.listUsers`) usa uma
  **lista fechada** de colunas/direções permitidas — um valor fora da
  lista cai no padrão seguro (`created_at DESC`), nunca é interpolado.
- Senhas nunca são hasheadas em JavaScript: `crypt()`/`gen_salt('bf', 10)`
  do `pgcrypto` rodam inteiramente no Postgres. O texto puro da senha
  trafega apenas dentro da conexão TLS até o banco.
- Conexão/`PreparedStatement`/`ResultSet` são sempre fechados em blocos
  `finally`, em todo caminho (sucesso ou exceção) — ver `Database.gs` e
  `tests/services.test.js`.
- Proteção do último administrador ativo usa
  `pg_advisory_xact_lock` (não um `COUNT(*)` simples) especificamente para
  serializar tentativas concorrentes de rebaixar/banir dois admins ao
  mesmo tempo — ver comentário em `sql/002_functions_and_triggers.sql`.
- Vagas de evento usam `SELECT ... FOR UPDATE` na linha do evento antes de
  contar inscrições, para serializar a última vaga sob concorrência.

### Minimização e logs
- `App.Logging` nunca grava senha, token (bruto ou hash), cookie, telefone,
  e-mail completo ou corpo livre de proposta/feedback em `audit_logs` ou
  `error_logs`.
- Listagens administrativas (`AdminService.listUsers`) devolvem só os
  campos necessários à tarefa de gestão (nome, e-mail, papel, status) —
  não telefone/cidade/escolaridade/hash.
- Erros inesperados nunca chegam ao cliente com detalhe interno: `Main.gs`
  (`App.Dispatch`) captura qualquer exceção não classificada como
  "esperada" (`App.Errors.*`), grava o detalhe real em `error_logs` com um
  `correlationId`, e devolve ao usuário só uma mensagem genérica + esse
  `correlationId` (útil para suporte pedir ao usuário, sem expor nada
  sensível).

### Limitação de tentativas
Implementada via `CacheService.getScriptCache()` — um cache **compartilhado
por todo o projeto e persistido pelo Google entre execuções** (diferente de
uma variável em memória, que morre a cada execução isolada do Apps Script).
Garantias reais: reduz automação simples de força bruta contra
login/cadastro/confirmação/redefinição dentro de janelas de minutos.
**Não é uma garantia forte:** é best-effort (pode ser despejado antes do
TTL sob pressão de memória do serviço), tem uma pequena janela de corrida
entre leitura e escrita sob concorrência muito alta, e não temos acesso ao
IP do requisitante dentro de `google.script.run` para reforçar por IP. Para
proteção robusta contra automação maliciosa persistente, a recomendação é
somar um reCAPTCHA ou WAF na frente — **não implementado nesta entrega**
(estaria fora do stack aprovado sem autorização explícita).

## Riscos residuais conhecidos (não eliminados)

1. **XSS é o ponto de falha crítico do modelo.** Se algum ponto novo da
   interface for adicionado no futuro usando `innerHTML` com dado do
   banco, todas as defesas de sessão/CSRF descritas acima perdem valor
   nesse fluxo. Qualquer revisão de código futura deveria tratar isso como
   bloqueante.
2. **Enumeração de e-mail por tempo de resposta em `login`** é mitigada
   (um `crypt()` contra um hash fixo é executado mesmo quando o e-mail não
   existe, para igualar a latência), mas não é uma garantia
   matemática de tempo constante — variação de rede/carga do Apps
   Script/Neon pode reintroduzir um sinal de tempo mensurável em condições
   adversariais.
3. **Rate limiting best-effort** (ver acima) — não substitui um WAF/
   CAPTCHA dedicado.
4. **Compatibilidade do driver JDBC do Apps Script com Neon — agora
   validada em produção**, com um ajuste real necessário: a URL JDBC não
   pode conter NENHUM parâmetro de query (`sslmode`, `ssl`,
   `channel_binding` etc.) — o driver nativo do Apps Script rejeita com
   erro fatal qualquer parâmetro que não reconheça. A TLS acontece mesmo
   assim (o Neon exige no servidor). Ver docs/DEPLOYMENT.md, seção 2.
   Colunas `ENUM`/`timestamptz` funcionaram corretamente nos testes de
   cadastro/login realizados ao vivo.
5. **CacheService como armazenamento de rate limit não é auditável** —
   não há trilha permanente de quantas tentativas ocorreram além do que já
   está em `audit_logs` (que registra cada tentativa de login com
   `result=failure`, mas não o motivo específico do bloqueio de rate
   limit).

## Rotação de credenciais

Se `DB_PASSWORD`, `SESSION_TOKEN_PEPPER` ou qualquer Script Property
sensível vazar (ex.: commit acidental, captura de tela, ex-colaborador):

1. **Banco:** gere uma nova senha para o usuário Postgres no Neon
   (console → Roles → Reset password) e atualize `DB_PASSWORD` em Script
   Properties imediatamente — a senha antiga para de funcionar assim que
   trocada no Neon.
2. **Pepper de sessão (`SESSION_TOKEN_PEPPER`):** trocar esse valor
   invalida **todos** os hashes de sessão/token existentes de uma vez
   (efeito equivalente a um logout global e invalidação de todos os links
   de confirmação/redefinição pendentes) — isso é o comportamento
   desejado em caso de comprometimento, mas avise os usuários antes, já
   que eles precisarão logar novamente.
3. Nunca reutilize a credencial antiga. Nunca registre a nova em log,
   commit, mensagem de erro ou `docs/`.
