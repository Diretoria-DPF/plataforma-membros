# Fase 2 — Dados & Presença

Parte da unificação LAIFT. O contrato está em `docs/PLANO_FASES_2_3_4.md`. Esta fase tira do Google Apps Script três coisas que agora ficam na Worker e no Neon:
- as estatísticas de aprendizagem;
- a presença em eventos;
- o terminal fiscal.

Ela também cria a ponte que os módulos usam para falar com a plataforma.

## O que mudou

| Área | Antes | Agora |
|---|---|---|
| Estatísticas do hub "Aprender" | `obterDashboardAluno` no Apps Script, com o e-mail vindo do navegador | `apiLearnGetMyStats`, com a identidade da sessão. É um agregado em SQL de `learning_attempts`. |
| Conquistas | não existiam | São 7 regras, calculadas no servidor (ver a seção "Conquistas"). |
| Credencial QR | `LAIFT:ID:<e-mail>`, sem assinatura e forjável | `LAIFT:v2:<profileId>.<assinatura>`: HMAC-SHA-256 assinado pela Worker. |
| Terminal fiscal | senha fiscal (`loginFiscal`) + planilha | papel `admin` checado no servidor + `event_registrations` |
| Quem chega sem inscrição | só se estivesse na planilha | O check-in cria a inscrição. Os gatilhos de capacidade e visibilidade continuam valendo. |
| Tema dos módulos | sempre claro | Segue a plataforma. `<html data-theme="light\|dark">` é aplicado e atualizado ao vivo. |
| Perfil | métricas de participação | mais 4 cartões de aprendizagem |

### Arquivos

**Banco:**
- `sql/012_learning.sql` (novo) — tabela, colunas de presença e ajuste de dois gatilhos (ver "Desvios").

**Worker:**
- `worker/src/services/learningService.js` (novo);
- `worker/src/services/attendanceService.js` (novo);
- blocos `// Fase 2 —` em `handlers.js` e `constants.js`.

**Testes da Worker:**
- `learningService.test.js` e `attendanceService.test.js` (novos);
- bloco `// Fase 2 —` em `handlers.test.js`.

**Front-end:**
- `frontend/app.js`:
  - ponte `App.callLearningApi`;
  - `App.getTheme()` / `App.getThemePreference()`;
  - propagação do tema aos iframes;
  - métricas de aprendizagem no perfil.
- `frontend/modulos/shared/laift-identity.js`:
  - `LaiftApi.call`;
  - `LaiftIdentity.getTheme()` / `applyTheme()`;
  - evento `laift:themechange`.
- `frontend/learning.js` — estatísticas, desempenho por módulo, conquistas e credencial v2. Não chama mais o Apps Script.
- `frontend/modulos/fiscal/**` — reescrito; ganhou `fiscal.css`.
- `frontend/index.html` — somente a seção `panel-learn`, o texto de `panel-admin-fiscal` e a nota do modal da credencial.
- `frontend/styles.css` — bloco `/* Fase 2 — */` no fim.

**E2E:**
- `frontend/scripts/e2e/fase2.e2e.js` (novo).

## Contrato implementado

### Modelo de dados (`sql/012_learning.sql`)

**Tabela `learning_attempts`** — segue o Contrato 1, com os CHECKs abaixo:

| CHECK | Regra |
|---|---|
| `module` | `farmacologia`, `toxicologia`, `clinica`, `laboratorio` ou `anatomia` |
| `activity` | `quiz_estudo`, `quiz_prova`, `caso_clinico`, `formulacao` ou `simulacao_pk` |
| `score` / `max_score` | Os dois nulos, ou os dois preenchidos com `1 ≤ max_score ≤ 500` e `0 ≤ score ≤ max_score`. |
| `duration_seconds` | nulo ou entre 0 e 86 400 |
| `details` | Precisa ser um objeto JSON de no máximo 8 KB (`octet_length`). |

- Índice `(profile_id, module, created_at DESC)`.
- `ON DELETE CASCADE`: é dado pessoal de desempenho.

**Presença em `event_registrations`:**
- colunas `checked_in_at`, `checked_in_by` (`SET NULL`) e `checkin_method`;
- CHECK de domínio do método (`qr`, `manual`, `lista`);
- CHECK de coerência: horário e método vêm juntos;
- índice `(event_id, checked_in_at)`.

**Gatilhos:**
- `guard_event_registration()` — a inscrição que já chega com `checked_in_at` também é aceita em eventos `in_progress`. É a entrada na porta, e só a Worker grava esse campo. Todas as outras regras continuam iguais: conta banida ou sem confirmação, visibilidade `members` e capacidade.
- `guard_event_status_transition()` — ver "Desvios de contrato".

### Endpoints

Todos exigem sessão. A identidade vem sempre da sessão. A entrada é um único objeto: o que não for objeto vira `{}` e cai na validação.

| Ação | Quem | Notas |
|---|---|---|
| `apiLearnGetMyStats` | logado | Devolve os campos do contrato. Extras: `pkSimulations` e `totalActivities`. `accuracyPct` e `clinicalAvgScore` são `null` sem dados. `byModule` traz sempre os 5 módulos. |
| `apiLearnSubmitQuizAttempt` | logado | Rate limit `LEARN_SUBMIT` (120/h por perfil). Validação: `0 ≤ correct ≤ total ≤ 500`, `total ≥ 1`, inteiros de verdade (não strings), `durationSeconds` inteiro entre 0 e 86 400 (opcional), `topics` com até 20 itens de até 80 caracteres (normalizados e sem duplicatas). Devolve `{ success, attemptId }`. |
| `apiLearnRecordLabFormulation` | logado | Rate limit `LEARN_LAB` (120/h). Campos: `product` (1 a 120 caracteres), `reagents` (até 20 × 80), `temperature` (número finito entre −273,15 e 3000, opcional), `stirring` (booleano, opcional), `observation` (até 500). Devolve `{ success, attemptId }`. |
| `apiLearnGetMyAttendanceQr` | logado (visitante incluso) | Devolve `{ success, qrPayload }`. |
| `apiAdminAttendanceListEvents` | admin | Lista eventos `published`, `in_progress`, `closed` e `completed`, até 50. Os abertos vêm primeiro. Extras: `capacity` e `checkInOpen`. |
| `apiAdminAttendanceCheckIn` | admin | Rate limit `ATTENDANCE_CHECKIN` (900/h por admin). Cada método aceita só o próprio identificador: `qr` → `qrPayload`, `manual` → `email`, `lista` → `profileId`. É idempotente: `alreadyCheckedIn: true` e o registro original fica intacto. Extras em `participant`: `profileId`, `role`, `walkIn` e `checkedInAt`. |
| `apiAdminAttendanceSearch` | admin | `term` com 2 a 100 caracteres busca contas ativas e confirmadas por nome, e-mail ou usuário (até 50), e os curingas do LIKE são escapados. `term` vazio lista os inscritos do evento (até 500). |
| `apiAdminAttendanceExportCsv` | admin | Tem proteção contra injeção de fórmula: células que começam com `= + - @`, tab ou CR recebem `'` na frente, e toda célula vai entre aspas. Por padrão sai em RFC 4180. Com `excel: true`, sai com BOM UTF-8 e `;`. Extra na resposta: `rows`. A exportação é auditada. |
| `apiAdminAttendanceBadges` | admin | Recebe até 200 `profileIds` (UUIDs), remove duplicatas e mantém a ordem. Pula contas inexistentes ou banidas. Extra: `leaguePosition`. |

**Mensagens do check-in ao admin** (traduzidas dos gatilhos):
- "Evento lotado…";
- "Evento exclusivo para membros: <nome>…";
- "O check-in só fica aberto em eventos publicados ou em andamento…";
- "Nenhuma conta com esse e-mail. A pessoa precisa se cadastrar…";
- "Esta conta está banida…";
- "…não confirmou o e-mail…";
- "QR Code inválido ou adulterado…".

**Auditoria** (`audit_logs`, sem conteúdo nem e-mail):

| Ação registrada | Detalhes |
|---|---|
| `LEARN_SUBMIT_QUIZ` | módulo e atividade |
| `LEARN_RECORD_FORMULATION` | — |
| `ATTENDANCE_CHECKIN` | Registra sucesso e falha: método, profileId, walkIn e alreadyCheckedIn. Nas falhas, também o motivo: `invalid_qr` ou `registration_blocked`. |
| `ATTENDANCE_EXPORT_CSV` | número de linhas |
| `ATTENDANCE_BADGES` | pedidos e emitidos |

**Cache:** a entrada na porta invalida os três caches de catálogo de eventos, porque `registered_count` muda.

### QR de presença v2

```
LAIFT:v2:<profileId em minúsculas>.<assinatura>
chave      = HMAC-SHA-256(SESSION_TOKEN_PEPPER, "laift-attendance-qr-v1")   ← separação de domínio
assinatura = base64url( HMAC-SHA-256(chave, "LAIFT:v2:" + profileId)[0..18) )  ← 144 bits, 24 caracteres
```

- Web Crypto (`crypto.subtle`). Não há segredo novo: a chave é derivada do pepper e fica em cache por isolate.
- Verificação:
  - regex estrita;
  - recálculo da assinatura;
  - comparação em tempo constante.
- O QR é determinístico por perfil, então o crachá impresso continua valendo.
- **Trocar o `SESSION_TOKEN_PEPPER` invalida todas as sessões e todos os QRs e crachás impressos.**
- O formato antigo `LAIFT:ID:<e-mail>` não registra presença. O fiscal só preenche o campo de presença manual, e o admin confere e confirma.
- A credencial mostra esse formato antigo, com aviso, somente quando a Worker não entrega o v2 (por exemplo, durante um deploy).

### Conquistas

Todas são calculadas em `learningService.js`, no array `BADGES`. Se mudar alguma regra, atualize esta tabela.

| id | Rótulo | Regra |
|---|---|---|
| `primeiro_simulado` | Primeiro simulado | ≥ 1 simulado (`quiz_*`) |
| `farmacologista` | Farmacologista | ≥ 80% de acerto em `farmacologia`, com ≥ 20 questões |
| `toxicologista` | Toxicologista | ≥ 80% de acerto em `toxicologia`, com ≥ 20 questões |
| `clinico` | Clínico de plantão | melhor nota em `caso_clinico` ≥ 90 (sobre 100) |
| `bancada` | Mãos na bancada | ≥ 1 `formulacao` |
| `centena` | Centena | ≥ 100 questões respondidas |
| `constancia` | Constância | ≥ 10 atividades de qualquer tipo |

`byModule[m].accuracyPct` é a soma de `score` dividida pela soma de `max_score` do módulo:
- no quiz, dá acertos sobre questões;
- no caso clínico, dá a nota média.

### Ponte módulo ↔ plataforma (Contrato 3)

- **`App.callLearningApi(action, input)`**:
  - allowlist `/^api(Learn|AdminAttendance|AdminAi|AdminLearn)[A-Z][A-Za-z]*$/`; uma ação fora dela devolve `{success:false}` sem chamada de rede;
  - o token entra como 1º argumento e nunca volta ao módulo;
  - timeout de 60 s;
  - nunca rejeita a promise;
  - não acende o banner global de "Sistema indisponível".
- **`LaiftApi.call(action, input)`**:
  - encaminha para `callLearningApi`;
  - copia a resposta para o realm do iframe via JSON, então `instanceof Array` funciona no módulo;
  - sem plataforma, devolve `{ success:false, message:'Sessão indisponível.' }`.
- **`LaiftIdentity.getTheme()`**:
  - devolve `'light'` ou `'dark'`;
  - resolve a preferência "sistema" pelo `matchMedia` da janela da plataforma.
- **Aplicação do tema:**
  - `applyTheme()` é chamado no carregamento e sempre que a preferência muda (inclusive quando o sistema troca de tema com a preferência "sistema");
  - repassa o tema a iframes aninhados;
  - dispara `laift:themechange` com `detail.theme`.

## Deploy

1. **Neon:** aplicar `sql/012_learning.sql`, antes de `013_clinical_ai.sql` da Equipe 3.
   - A migração é idempotente.
   - Para validar localmente: `cd worker && npm run validate:sql`.
2. **Worker:** `cd worker && npm run deploy`.
   - Não há secret nem var nova: a chave do QR é derivada do `SESSION_TOKEN_PEPPER`, que já existe.
3. **Front-end:** o merge na `main` publica pelo GitHub Actions.
   - A ordem recomendada é Worker antes do front.
   - Se o front chegar antes:
     - o hub mostra só um erro de carregamento;
     - a credencial cai no formato antigo com aviso;
     - o fiscal mostra "Ação desconhecida".
4. **Depois do deploy:**
   - avisar os membros que o QR mudou (credencial na área "Aprender");
   - reimprimir crachás pelo fiscal: "Selecionar todos" → "Imprimir crachás selecionados".

## Riscos

- **Módulos na mesma origem.** A allowlist da ponte reduz o que um módulo *pede*, mas um script injetado num módulo ainda alcança `window.top.App.getState()` e `localStorage['pm_session']` (ver `docs/SECURITY.md`, item 6). O isolamento real depende de CSP e sandbox, que ficam para a Onda 2 da Equipe 4.
- **QR estático.** Uma foto do QR de outra pessoa permite registrar a presença dela. A mitigação é a portaria olhar para quem apresenta o QR. Revogar exige trocar o pepper, o que é global. Um QR com validade ou versão por perfil fica como evolução possível.
- **Rate limits novos:** `LEARN_*` 120/h e `ATTENDANCE_CHECKIN` 900/h. Se uma portaria muito cheia bater no limite, ajuste em `constants.js`.
- **Gatilho de inscrição alterado.** Qualquer INSERT com `checked_in_at` preenchido é aceito em `in_progress`. Hoje só a Worker, no caminho de admin, grava esse campo.
- **Rolagem dupla em 360 px.** No celular, a barra de navegação fixa da plataforma cobre a parte de baixo do iframe do fiscal até a página rolar. Funciona, mas o ajuste fino fica para a Equipe 4.
- **Crachá individual com `%` no nome.** O estúdio `cracha/index.html` decodifica os parâmetros duas vezes (`URLSearchParams.get` e depois `decodeURIComponent`), então um nome com `%` pode falhar ali. O problema é anterior a esta fase, e a interface do crachá não foi alterada.

## Pendências

- **Importação do histórico da planilha** (métricas e presenças antigas) — não implementada de propósito. Precisa de:
  - o código do Apps Script, para saber o formato;
  - uma exportação da planilha;
  - o mapeamento de matrícula/CPF para o e-mail da conta.

  Enquanto isso, as estatísticas começam do zero.
- **Gravação pelos módulos.** A troca das chamadas de gravação nos módulos (`quiz`, `toxicologia`, `laboratorio` → `apiLearnSubmitQuizAttempt` / `apiLearnRecordLabFormulation`) é da Equipe 4, no motor único de quiz. Até lá, só os casos clínicos (Equipe 3) alimentam `learning_attempts`.
- **Remoção do legado.** `LaiftLearning.APPS_SCRIPT_URL` e `window.APPS_SCRIPT_GATEWAY` continuam até a Onda 2.
- **Simulação PK.** `simulacao_pk` existe no domínio da tabela, mas não tem endpoint de gravação nesta rodada, porque não está no contrato.

## Desvios de contrato

1. **`012` corrige `guard_event_status_transition()`.**
   - O problema: o gatilho de 002 nunca aceitou `in_progress`, embora a Worker ofereça `published → in_progress → closed/completed/archived` ao admin. O banco recusava e o admin via só um erro genérico, de modo que "evento em andamento" era inalcançável.
   - A correção: a nova regra é a união do que o banco já aceitava com o que a Worker aceita.
   - Por que entrou aqui: sem isso, "check-in em eventos publicados/em andamento" não funcionaria.
2. **`012` estende `guard_event_registration()`** para aceitar a entrada na porta (`checked_in_at` preenchido) em `in_progress`. As regras de capacidade e visibilidade não mudaram.
3. **Campos extras nas respostas** (tudo aditivo):
   - `attemptId` em `apiLearnRecordLabFormulation`;
   - `pkSimulations` e `totalActivities` em stats;
   - `capacity` e `checkInOpen` nos eventos;
   - `profileId`, `role`, `walkIn` e `checkedInAt` em `participant`;
   - `rows` no CSV;
   - `leaguePosition` nos crachás.
4. **Entradas opcionais extras:**
   - `apiAdminAttendanceExportCsv` aceita `excel: true`, que liga o BOM e o `;`;
   - `apiAdminAttendanceSearch` com `term` vazio lista os inscritos.
5. **`accuracyPct` e `clinicalAvgScore` podem ser `null`** quando ainda não há dados. É melhor que um 0% enganoso.
6. **CHECK de 8 KB em `details` no banco.** Vale também para o `caso_clinico` gravado pela Equipe 3.
