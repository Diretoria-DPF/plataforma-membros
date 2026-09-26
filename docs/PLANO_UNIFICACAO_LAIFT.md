# Plano de Unificação — Plataforma LAIFT

A Plataforma de Membros e o antigo repositório **o-bala-vip** (ecossistema de
aprendizagem LAIFT) viraram um sistema só. A plataforma é a porta de entrada:
login, cadastro, sessão e papéis são dela. Os módulos de aprendizagem do
o-bala-vip vivem agora em `frontend/modulos/` e aparecem na área **Aprender**.

Este documento registra o que foi feito na Fase 1 e o plano das fases
seguintes. As Fases 2, 3 e 4 foram executadas por três equipes em paralelo,
pelo contrato de `docs/PLANO_FASES_2_3_4.md`.

## Status (2026-09-26)

| Fase | Status | Onde está o detalhe |
|---|---|---|
| 1 — Integração | **Concluída** | abaixo |
| 2 — Dados e presença na Worker/Neon | **Concluída**, exceto a importação do histórico da planilha | `docs/FASE_2_DADOS_PRESENCA.md` |
| 3 — IA na Worker | **Concluída**; o Apps Script foi aposentado no front-end | `docs/FASE_3_IA_CLINICA.md` |
| 4 — Qualidade e design unificado | **Concluída** (Ondas 1 e 2), com as pendências listadas no fim | `docs/FASE_4_QUALIDADE.md` |

As seções "Limitações conhecidas até a Fase 2" e o plano das Fases 2–4
abaixo ficam como registro histórico. Cada item traz a marcação do que
foi feito ou do que continua pendente.

---

## Fase 1 — Integração (concluída)

### Decisões

| Tema | Decisão |
|---|---|
| Repositório | `plataforma-membros` é o único. O o-bala-vip foi mesclado em `frontend/modulos/` **com o histórico git preservado** (`git log --follow frontend/modulos/quiz/app.js`). |
| Cadastro | O cadastro/login próprio do o-bala-vip (matrícula/CPF + código OTP por e-mail) foi **descartado**. Vale só a conta da plataforma. |
| Identidade nos módulos | Os módulos leem nome, e-mail e papel da plataforma via `modulos/shared/laift-identity.js` → `window.App.getIdentity()`. O **e-mail** da conta é o identificador enviado ao Apps Script. O token de sessão da plataforma **nunca** sai do app principal. |
| Backend dos módulos | O Google Apps Script legado **continua** atendendo métricas, IA (clínica e laboratório) e presença até a Fase 2. A URL fica num único lugar: `frontend/learning.js`. |
| Acesso | "Aprender" aparece para **todos os logados**, visitantes inclusive. O terminal **Fiscal** fica no modo admin. |
| Isolamento | Cada módulo roda num `<iframe>` da **mesma origem**. Isso isola o CSS e os globais conflitantes (cada módulo tem seu `:root`, reset `*`, `.btn`, `allQuestions`...) sem reescrita, e mantém localStorage, IndexedDB e `window.parent` funcionando. |

### Estrutura

```
frontend/
├── index.html        # + painel "Aprender" (panel-learn) e "Fiscal" (panel-admin-fiscal)
├── app.js            # + App.getIdentity(), App.notifyActivity(), loaders dos painéis
├── learning.js       # hub, estatísticas, iframes, credencial QR, terminal fiscal
├── vendor/qrcode-generator.js   # QR local (MIT), sem enviar dado a terceiros
└── modulos/          # antigo o-bala-vip
    ├── shared/       # laift-identity.js, api-service.js, style.css (base da clínica/fiscal)
    ├── quiz/  toxicologia/  laboratorio/ (+ studio/)  anatomia-3d/  cracha/
    ├── clinica/      # página autônoma (antes embutida no index.html raiz do o-bala-vip)
    └── fiscal/       # página autônoma do terminal de check-in (só admin)
```

### Como um módulo se integra

1. O primeiro `<script>` da página é `../shared/laift-identity.js`.
   - Aberto fora da plataforma, sem ninguém logado, ele redireciona para o login.
   - Ele define `window.APPS_SCRIPT_GATEWAY` a partir de `LaiftLearning.APPS_SCRIPT_URL`.
   - Ele repassa cliques, teclas e toques para `App.notifyActivity()`. Sem isso, a sessão expiraria por inatividade enquanto a pessoa usa o módulo, porque eventos dentro do iframe não chegam à plataforma.
2. O módulo usa `LaiftIdentity.get()` → `{ identifier, email, name, role, type }`, em vez da antiga `localStorage['laift_student_session']`.
3. O módulo pode chamar `LaiftIdentity.backToHub()` para voltar ao hub.
4. Para aparecer no hub, basta uma entrada em `MODULES` (`frontend/learning.js`).
5. Arquivos novos em `modulos/` são publicados automaticamente: o `build.js` copia a pasta inteira.

### O que mais mudou (correções encontradas na fusão)

- **Anatomia 3D voltou a funcionar.** `js/app.js` e `js/three-engine.js` tinham 63 marcadores `[cite: 1]` colados de um chat. Isso é erro de sintaxe, e o módulo não carregava nem no o-bala-vip original.
- **Timeout real nas chamadas ao Apps Script.** O `AbortSignal` nunca era passado ao `fetch`.
- **Escape de HTML** nos pontos do terminal fiscal e do dossiê da anatomia que interpolavam dados em `innerHTML`/`document.write`.
- **Código morto removido:** `quiz/quiz-engine.js`, `anatomia-3d/js/biohacking.js` e a "cópia local" do RDKit (eram páginas HTML salvas por engano).
- **Gatilhos ocultos removidos.** O terminal fiscal antes abria com duplo clique no cabeçalho ou Ctrl+Shift+F.
- **QR gerado localmente.** A credencial do aluno era gerada por `api.qrserver.com`; agora é gerada no navegador.

### Limitações conhecidas até a Fase 2 (histórico — resolvidas nas Fases 2 e 3, exceto o histórico antigo)

- **Histórico antigo.** O Apps Script indexava métricas por matrícula/CPF. Quem tinha histórico no sistema antigo só o verá na área "Aprender" se o Apps Script resolver o **e-mail**. Caso contrário, as estatísticas recomeçam do zero.
- **Presença.** Contas criadas só na plataforma podem não existir na planilha do Apps Script. Nesse caso o check-in por QR ou pela lista pode falhar; resta a presença manual por e-mail no terminal fiscal.
- **Senha fiscal.** O terminal ainda pede a senha fiscal própria do Apps Script: toda ação de presença exige a `sessao` fiscal devolvida por `loginFiscal`. A checagem de papel admin feita na página é só de interface.
- **Identidade não verificada no Apps Script.** O Apps Script recebe o e-mail do navegador e não tem como verificá-lo. Ver `docs/SECURITY.md`, risco residual 6.
- **Visual.** Os módulos não seguem o tema claro/escuro da plataforma e mantêm o visual próprio.

---

## Fase 2 — Dados e presença na Worker/Neon — concluída

**Objetivo:** tirar métricas, progresso e presença do Apps Script e usar a sessão verificada da Worker como identidade.

- **Pré-requisito:** o **código-fonte do Apps Script** (não está em nenhum repositório) e acesso à planilha. Sem eles não dá para migrar o histórico.
- ✅ **Feito de outro jeito:** em vez de cinco tabelas, uma só,
  `learning_attempts` (módulo, atividade, nota, duração e `details` JSONB),
  mais colunas de check-in em `event_registrations` (Contrato 1 do
  `PLANO_FASES_2_3_4.md`). Plano original:
- **Migração SQL:** criar `sql/012_learning.sql` (idempotente, no padrão das anteriores), com as tabelas:
  - `quiz_attempts` (módulo, modo, acertos, total, tempo, tópicos)
  - `module_progress`
  - `clinical_cases_resolved`
  - `lab_formulations`
  - `badges`
  
  Todas com chave em `profiles(id)`.
- ✅ **Serviço na Worker:** `learningService.js` com `apiLearnGetMyStats`, `apiLearnSubmitQuizAttempt`, `apiLearnRecordLabFormulation`. Plano original: criar `worker/src/services/learningService.js` e as funções `apiSubmitQuizAttempt`, `apiGetMyLearningStats`, `apiRegisterLabFormulation` etc. Todas vão no `API_REGISTRY` e usam `runWithSession`. Atualizar `worker/test/handlers.test.js`.
- ✅ **Presença:** QR v2 assinado (HMAC) e terminal fiscal só com papel admin na Worker, sem senha fiscal. Plano original: usar `events`/`event_registrations`, que já existem. O QR passa a ser um token assinado pela Worker, e o terminal fiscal exige o papel `admin` no servidor, o que elimina a senha fiscal.
- ✅ **Toxicologia:** envia pelo motor único de quiz (Fase 4). Plano original: passar a enviar as métricas, o que hoje nunca acontece.
- ✅ **Métricas no perfil:** bloco "Aprendizagem" no perfil. Plano original: somar as de aprendizagem ao `ProfileService.getMyMetrics`, exibidas no perfil.
- ⏳ **PENDENTE — Importação do histórico:** depende do código do Apps Script e de uma exportação da planilha. Plano original: script único que importa o histórico da planilha, mapeando matrícula/CPF para e-mail quando possível.

## Fase 3 — IA na Worker — concluída

- ✅ Mover para a Worker o paciente virtual, o preceptor, a geração de casos e o preceptor do laboratório. A chave da IA fica como secret (`wrangler secret put`), com rate limit por perfil (`enforceRateLimit`). Feito com pool de chaves (`GROQ_API_KEYS`), cota diária por papel e disjuntor global.
- ✅ Mover para o Neon o acervo coletivo de casos e o radar epidemiológico, com moderação pelo admin: o conteúdo é enviado por usuários e exibido a outros.
- ✅ Aposentar o Apps Script: nenhum arquivo do front-end o chama (`api-service.js` removido na Fase 4, Onda 2). ⏳ Os casos antigos do acervo da planilha não foram importados.

## Fase 4 — Qualidade e design unificado — concluída

- ✅ **XSS nos módulos (prioridade).** Zerado: nenhum `innerHTML` fora de `modulos/shared/safe-dom.js`. Há cerca de 120 usos de `innerHTML` em `modulos/`, vários com dados do backend ou do acervo comunitário. Como os módulos compartilham a origem da plataforma, onde fica `localStorage['pm_session']`, trocá-los por `textContent` ou por construtores de DOM seguros. Começar pela clínica (`appendChatBubble`, acervo) e pelo laboratório.
- ✅ Remover os handlers inline (`onclick=`) e adotar uma Content-Security-Policy. Feito: 0 handlers inline, 0 scripts inline, CSP estrita nas 12 páginas (ver `docs/SECURITY.md`).
- ✅ Fazer quiz e toxicologia compartilharem um único motor (`modulos/shared/quiz-engine.js`): hoje são 221 linhas idênticas e CSS quase igual.
- ✅ Unificar os tokens de design (`modulos/shared/laift-tokens.css`; o tema segue a plataforma) (cores, raios, tipografia) com `frontend/styles.css`, incluindo o tema escuro.
- ✅ Fixar as versões das bibliotecas por CDN que ainda estão soltas (Chart.js na anatomia, RDKit no studio) e adicionar SRI. Feito, e o RDKit fica desligado pela CSP (exigiria `'unsafe-eval'`).
- ⏳ **PENDENTE:** arquivar o repositório o-bala-vip, com o README apontando para cá. Depende de acesso de escrita ao repositório.
- ⏳ **PENDENTE:** tirar os atributos `style=` que restam nos módulos herdados (laboratório, anatomia, estúdio) para poder remover `'unsafe-inline'` de `style-src`.
