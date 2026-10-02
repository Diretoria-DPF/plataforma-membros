# Plano v2 — Atlas 3D: agentes + 4 ondas (com a auditoria do plano incorporada)

> **Atualização (Onda 2, 02/10/2026):** decisões do usuário — (1) o gate humano é **pós-merge** (risco aceito: o merge publica direto em produção; rollback em `docs/atlas-rollback.md` e chaves por novidade em `js/core/flags.js`); (2) meta de abertura **< 2 MB** transferidos (era < 1,5 MB); (3) selos de revisão em 4 estados (editorial, conteúdo antigo, gerado automaticamente, revisado) — nunca "Rascunho". O plano detalhado da Onda 2 é o "Plano Onda 2 v4"; medições de rede em `docs/atlas-qa/rede.md`.

## Contexto
Duas auditorias do atlas foram feitas: "Prova de Fogo" (nota 4,5) e "Análise Completa" (nota 8,5). Depois veio uma terceira, sobre este próprio plano. Ela apontou 5 furos (F1–F5) e 5 lacunas globais (G1–G5), todos incorporados abaixo.

**Decisões revisadas:**
- **F1 — conteúdo.** As fichas são publicadas com status editorial visível: "Em revisão pelo conselho editorial da LAIFT". Não usam o selo "Rascunho". Cada ficha tem "Sinalizar correção", e o conselho segue um SLA.
- **F3 — barra no celular.** Nada de menu radial. "Ferramentas" (⋯) abre uma folha inferior (bottom sheet) com grade 3×3 de botões grandes.
- **F4 — sessão.** A sessão salva tem `schemaVersion`; o sid que não existir mais é descartado; há listener de `hashchange`.
- **F5 — fila offline.** Uma fila única cobre quiz, estruturas, vias e processos.
- **F2/G2/G5 — testes com pessoas.** Por onda: 3 alunos (think-aloud, 20 min), 1 aparelho físico (iPhone e Android, em rodízio) e axe-core no e2e. Esta parte é do usuário/monitores.
- **G1, G3, G4 — antes ou dentro da Onda 4.** Telemetria mínima, rollback documentado e a decisão "URL pública × embutido".

---

## Parte A — Agentes (`.claude/agents/`) — ✅ criados (PR 0), com ajustes
- **Existentes:**
  - `atlas-auditor` (haiku) — revisa o diff;
  - `atlas-qa-mobile` (haiku) — roda unitários, validate-content e e2e;
  - `atlas-tradutor-pt` (haiku);
  - `atlas-curador` (sonnet);
  - `atlas-quiz-autor` (sonnet).
- **Novos:**
  - `atlas-a11y` (haiku): roda a suíte axe-core e relata violações AA.
  - `atlas-revisor-editorial` (sonnet): confere fichas contra Gray's/Moore/Netter e devolve a lista de correções. **Não marca "reviewed"**: isso é só do conselho humano.
- **Checklist do auditor ganha:**
  - `localStorage` sempre com `try/catch` e versão;
  - nenhuma chamada direta a rcsb/pubchem fora do proxy (vale a partir da Onda 4);
  - nenhum texto em inglês visível ao usuário.
- **Fluxo:** implementar → `atlas-qa-mobile` → `atlas-a11y` → `atlas-auditor` → push.

## Parte B — Ondas

### Onda 1 — "Não envergonhar" (em andamento, branch `claude/optimistic-babbage-3pm2em`)
1. ✅ **Quiz vencível.**
   - `correctSids` lista as malhas reais (coração: 29 malhas, incluindo HRA).
   - `correctSystem` serve o caso "qualquer músculo esquelético".
   - `isCorrect` aceita aliases.
   - O sistema da resposta é carregado e mostrado antes de cada pergunta.
   - `validate-content` exige sids de `structures.json`.
   - **Ajuste:** o distrator não pode estar entre as respostas certas, e o validador cobra isso. As regras ficam em `docs/atlas-conteudo/quiz-regras.md`.
   - A migração dos 8 casos já foi feita (os dados estão no commit).
2. 🔁 **Barra do celular.**
   - Barra: Camadas, Isolar e **Ferramentas (⋯)**.
   - **Ajuste F3:** em retrato, Ferramentas abre uma **folha inferior** de largura total, com fundo escurecido e grade 3×3 de botões 60×60 com rótulo.
     - É uma folha própria: não reaproveita o `#atlas-sheet`, para não apagar a ficha aberta.
   - Paisagem baixa: a grade abre acima da barra.
   - O botão interno "Mais" vira **"Mais opções" (⚙)**.
   - ✅ "Desfazer" (5 s) em Isolar e Centralizar.
3. ✅ **Falhar alto.**
   - Tela "Base de estruturas indisponível — Recarregar".
   - Aviso de integridade quando > 5% dos nós do manifest faltam no GLB. **Ajuste:** passa a emitir também o evento `atlas:integrity-warning`.
   - O manifest já tem `version`. A checagem de integridade substitui a comparação de versão.
4. ✅ **WebGL perdido.**
   - Aviso "Recarregando o 3D…" e o 3D redesenha ao voltar (o three.js recria o estado).
   - Se não voltar em 8 s, aparece "Recarregar".
   - No e2e com `WEBGL_lose_context`, o teste vira skip se a extensão não existir.
5. ✅ **Boot mais leve.**
   - O boot carrega só o esqueleto; os músculos vêm 1,5 s depois via `requestIdleCallback`, com fallback para `setTimeout`.
   - Em 3G ou economia de dados, os músculos só carregam quando a camada é ligada.
   - Medido no e2e: 1,76 MB sem compressão (≈ 1,3 MB no Pages) e esqueleto tocável em ~11 s em "3G rápido".
6. 🔁 **Retomar de onde parou + link direto** (`#sid=&view=`, com `hashchange`).
   - **Ajuste F4:**
     - `schemaVersion: 1`; a sessão de outra versão é descartada;
     - o `selectedSid` que não está em `structures.json` é zerado junto com a câmera;
     - debounce de 500 ms;
     - o chip "Continuar" aparece uma vez por sessão do navegador (`sessionStorage`).
   - O progresso do quiz fica para a Onda 2: o quiz recomeça, mas o modo é restaurado.
7. **Peek inicial:** ✅ já mostra "Toque numa estrutura para começar".
8. **Novo:**
   - suíte e2e `atlas-a11y` com axe-core (celular e desktop), meta de zero violações sérias/críticas, entrando no CI;
   - `docs/atlas-qa/ios.md`, um checklist para o aparelho físico.

### Onda 2 — "Primeira impressão"
- **Onboarding de 3 telas** (`<dialog>` com focus-trap) e "Pular". Reaparece após 30 dias, ou nunca, se marcado "Não mostrar novamente". Pode ser reaberto em Ferramentas → "Como usar".
- **Dicas de contexto.** Só depois de 30 s sem toque, rolagem ou foco em campo. Cada dica aparece uma vez (`atlas.hints.v1`).
- **Feedback ao tocar.** Pulso no destaque (ticker que devolve `false` ao terminar) e `navigator.vibrate?.(10)`; no iOS não há vibração, e isso está aceito.
- **Quiz.** Animação de acerto e erro com "+XP" e `explanation_pt`; **progresso do quiz na sessão**.
- **Progresso de carga.** Linha fina sob a topbar, que não disputa espaço com o breadcrumb.
- **Peek.** Mostra nome em PT, selos de sistema e lado, e "Ver mais".
- **Aparelho fraco.** Após 8 s sem o esqueleto: "Está demorando…". Após 20 s: botão "Tentar novamente".

### Onda 3 — Conteúdo + quiz (com agentes)
- **Nomes em PT.**
  - Os lotes `docs/atlas-traducao/lote-01..10.txt` já existem: 1 nome por linha, gerados de `structures.json` no PR #5; o formato está no `LEIA-ME.md`.
  - O `atlas-tradutor-pt` gera os `.pt.tsv`, e `tools/atlas-content/names-pt.mjs` grava `names.pt`.
- **300 prioritárias.**
  - Script `prioridades.mjs`, que gera `docs/atlas-conteudo/prioridades.json`.
  - As cotas ficam justificadas em `docs/atlas-conteudo/cotas.md` (alta cobrança em prova, base para outros sistemas, uso em `anchor-map`).
  - Commitado primeiro, para o conselho ver.
- **Fichas: 15 lotes de ~20 (`atlas-curador`), passando por `atlas-revisor-editorial`.**
  - `review.status: "editorial"` entra no `content.schema.json`, junto com `review.published_by`, `review.review_requested_at` e o campo opcional `mnemonic_pt`.
  - `mnemonic_pt` só com fonte consagrada; nunca inventado.
  - **UI:** escudo cinza com o texto "Em revisão pelo conselho editorial da LAIFT" e "Sinalizar correção".
    - Depois de 30 dias sem revisão: ícone amarelo com "aguardando revisão há X dias".
    - Após revisão: "Revisado por [nome] em [data]".
  - `tools/atlas-content/review-status.mjs` gera o relatório semanal, priorizando cardiovascular e nervoso. SLA: 10% por semana.
  - Guia do revisor em `docs/atlas-conteudo/guia-revisao.md`.
- **Ouvir a ficha:** 🔊 com `speechSynthesis` pt-BR.
- **Quiz: 200 casos.** 20 por sistema, 40/40/20 por dificuldade, sids reais e distratores conforme as regras; sorteio de 10 por sessão, com filtros.

### Onda 4 — Retenção e robustez
**Antes de começar:**
- `docs/atlas-rollback.md`: revert, invalidação do service worker, restauração do Neon e feature flags no Worker.
- Decisão da URL (G4): pública ou embutida.

**Itens:**
1. **XP e conquistas.**
   - `apiLearnRecordAtlasActivity` com dedup `usuário:sid:dia`.
   - Fila offline única, idempotente (`js/sync-queue.js`), para quiz, estruturas, vias e processos.
   - XP derivado em `getMyStats`; 4 conquistas novas.
   - O painel Aprender mostra XP, nível e a próxima conquista.
2. **Link compartilhável:** `navigator.share` ou copiar, e `postMessage`/hash entre `learning.js` e o iframe, conforme a decisão G4.
3. **PWA do módulo** (`sw.js`).
   - O cache leva a versão do build; o build ganha injeção de hash (`scripts/build.js` já existe e será estendido).
   - Mensagem `SKIP_WAITING` e limpeza de caches velhos.
4. **Erros e sinalização.**
   - `apiLogClientError`: URLs sem query string, sem dados pessoais, até 10 por sessão.
   - "Sinalizar correção" grava em `atlas_content_reports`, pela migração `sql/014_atlas.sql`. O Neon é aplicado num branch temporário e só vai para produção **com a sua confirmação**; a migração inclui o down.
5. **Proxy RCSB/PubChem**, com cache e TTL. Se o Worker cair, o fallback é o acesso direto **com aviso** de exposição do IP. Remover os hosts do `connect-src` e atualizar a política de privacidade.
6. **G1 — telemetria mínima.**
   - `apiLearnRecordAtlasEvent` com os eventos `session_start/end`, `structure_view`, `quiz_start/finish`, `mode_switch` e `error_shown`.
   - Envio em lote (30 s ou 10 eventos), sem dados pessoais.
   - Gráfico simples no admin.

---

## Verificação por onda (gate)
| Verificação | Responsável |
|---|---|
| CI `atlas-e2e` verde, `atlas-auditor` OK, `atlas-a11y` sem violação séria | Claude/agentes |
| 5 viewports (e2e) + 1 aparelho físico (`docs/atlas-qa/ios.md`) | Claude + usuário |
| 3 alunos, think-aloud, 20 min | Usuário/monitores |
| Métrica da onda comparada | Claude (e2e/telemetria) |

**Critérios de sucesso:**
- Onda 1: < 15 s em 3G rápido (✅ ~11 s); caso 1 do quiz vencível (✅).
- Onda 2: onboarding concluído > 60%; primeira seleção < 30 s.
- Onda 3: fichas cobrindo > 60% dos nomes únicos (meta de longo prazo; as 300 dão ~21%, com prioridade nos mais cobrados); acerto no quiz entre 40% e 70%.
- Onda 4: retenção D7 > 40%; mais de 2 sessões por semana.

**Verificação automática da Onda 1:**
- quiz dá "Acerto";
- barra e Ferramentas cabem em 390×844 e 844×390;
- 404 em `structures` mostra "Recarregar";
- WebGL volta;
- 3G < 15 s;
- link, retomada e sessão de versão inválida são descartados sem erro;
- `hashchange` funciona;
- axe sem violações sérias.

## Fora de escopo
Vídeos, ilustrações licenciadas, ranking de turma (LGPD), TypeScript, WebGPU e remoção da camada legada.
