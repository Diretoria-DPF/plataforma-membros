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

### Sessão no cliente — decisão revisitada em 2026-09-25
O front-end é um site estático servido pela origem própria (GitHub Pages);
o backend (Cloudflare Workers) **não tem como emitir um cookie `HttpOnly`**
nesse modelo de API JSON pura. Qualquer token mantido em JavaScript é, por
definição, legível por outro script rodando no mesmo contexto.

Até a versão anterior, o token ficava **apenas em memória** (nunca
`localStorage`), especificamente para que um XSS persistente não
encontrasse um token salvo para reutilizar após a página fechar. Essa
proteção foi conscientemente trocada por conveniência de uso: por pedido
explícito, a sessão agora é espelhada em `localStorage` com sua própria
expiração de 30 minutos (`frontend/app.js`, `SESSION_CACHE_KEY`), para que
a pessoa continue logada ao atualizar a página ou voltar depois. Ao
expirar (ou no logout), o valor é apagado imediatamente — inclusive com um
temporizador que força o retorno à tela de login no exato instante da
expiração, mesmo com a aba aberta o tempo todo.

**O que isso muda de verdade:** um XSS persistente agora consegue
reutilizar a sessão salva enquanto ela não expirar (até 30 min), em vez de
perder o acesso assim que a aba fechar. **O que não muda:** o servidor
segue revalidando a sessão contra o banco a cada chamada (nunca confia
apenas no que está salvo no navegador); a senha em si nunca é persistida
em lugar nenhum do cliente; e a defesa real contra esse cenário continua
sendo nunca ter XSS em primeiro lugar (próxima seção) — isto sempre foi
mitigação de profundidade, não uma solução para XSS, com ou sem
`localStorage`.

### CSRF e CORS (atualizado após a separação front/back)
Até a versão anterior, o front-end era servido pelo próprio `HtmlService`
dentro do iframe do Apps Script, e a chamada `google.script.run` só
funcionava de dentro daquele iframe específico — nenhum site de terceiros
conseguia montá-la, então CSRF nunca foi uma preocupação real.

Isso mudou: o back-end agora é uma API HTTP/JSON pública (`doPost` em
`Main.gs`), alcançável por `fetch()` de **qualquer origem** — não só do
front-end oficial no GitHub Pages. Reavaliação:

- **CSRF clássico (cookie ambiente) não se aplica.** Não existe cookie de
  sessão nenhum — o token de sessão é um valor que o front-end precisa ler
  do estado JS em memória e **colocar explicitamente** no corpo da
  requisição. Um site malicioso não tem como ler ou adivinhar esse valor
  (ele nunca fica em cookie, `localStorage` nem em lugar algum que outra
  origem consiga acessar), então não consegue montar uma chamada
  autenticada válida em nome de outra pessoa. Isso continua verdadeiro
  independente de quem hospeda o front-end.
- **O que É novo:** qualquer origem pode agora chamar `apiRegister`,
  `apiLogin`, `apiRequestPasswordReset` etc. diretamente — não só através
  da nossa própria interface. Os limites de tentativa
  (`App.Security.enforceRateLimit`, incluindo os buckets GLOBAIS de
  `REGISTER`/`RESET_REQUEST` adicionados após a auditoria) passam a ser a
  linha de frente de verdade contra automação, não mais coadjuvante.
- **Allowlist fechada no roteador (`API_REGISTRY` em `Main.gs`):** `doPost`
  só invoca os identificadores literalmente listados no objeto — nunca
  resolve um nome de função a partir do campo `action` de forma dinâmica
  contra o escopo global. Isso impede qualquer tentativa de chamar algo
  fora da superfície pública pretendida, e uma guarda `hasOwnProperty`
  impede que um valor como `"toString"`/`"constructor"` resolva para um
  método herdado de `Object.prototype`.
- **CORS:** o front-end envia `Content-Type: text/plain;charset=utf-8`
  (não `application/json`) de propósito, para que o navegador trate a
  requisição como "simples" e não dispare um preflight `OPTIONS` — o Apps
  Script não tem como responder um preflight customizado. Validado em
  produção: `fetch()` de `https://diretoria-dpf.github.io` para o backend
  retorna `type: "cors"` com o corpo correto, sem bloqueio do navegador.
- **XSS continua sendo o risco que mais importa** (próxima seção): se
  alguém conseguir injetar script na própria página, ele herda o token de
  sessão em memória e qualquer defesa de transporte deixa de importar.

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
6. **Módulos de aprendizagem (`frontend/modulos/`, antigo o-bala-vip) —
   ver `docs/PLANO_UNIFICACAO_LAIFT.md`.**
   - **Mesma origem.** Eles rodam em iframe da **mesma origem** da
     plataforma, necessário para herdar a identidade e usar
     localStorage/IndexedDB. Não passaram pela mesma revisão do resto do
     front-end: há cerca de 120 usos de `innerHTML`, alguns com dados do
     Apps Script ou do acervo comunitário de casos clínicos. Um XSS
     num módulo alcança `localStorage['pm_session']`, como alcançaria no
     app principal (risco 1).
   - **Exposição anterior à fusão.** O o-bala-vip já era publicado na mesma
     origem (`diretoria-dpf.github.io`), então essa exposição não foi criada
     pela fusão. A correção está priorizada na Fase 4 do plano.
   - **Identidade não verificável no Apps Script.** O e-mail que os módulos
     enviam ao Apps Script (métricas, IA, presença) vem do navegador e não
     tem como ser verificado lá. Alguém pode registrar métricas em nome de
     outro e-mail. O token da plataforma nunca é enviado ao Apps Script, de
     propósito: ele não tem como validá-lo. Resolvido quando esses dados
     migrarem para a Worker, com a identidade vindo da sessão (Fase 2).
   - **Terminal fiscal.** A checagem de papel `admin` na página do terminal
     fiscal é só de interface. Quem protege as ações de presença é a senha
     fiscal do próprio Apps Script.

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
