# T05 — Acessibilidade das telas novas
**Quem faz:** outro chat · **Depende de:** T00 · **Estimativa:** 3 h

## Objetivo
Garantir que a tela de escolha do quiz, "Meu estudo" (resumo, exportar/importar, "O que mudou") e os botões Fixar e Compartilhar passem no axe (WCAG 2.1 A e AA), no desktop e no celular.

## Arquivos
- `frontend/scripts/e2e/atlas-a11y.e2e.js` — acrescentar os novos scans, copiando o padrão dos scans que já existem no arquivo (axe executado via `page.evaluate`, porque a CSP bloqueia `addScriptTag`).
- Telas a corrigir se o axe acusar: `frontend/modulos/anatomia-3d/js/modes/quiz.js` (`renderSetup`), `frontend/modulos/anatomia-3d/js/modes/study.js`, `frontend/modulos/anatomia-3d/js/ui/infocard.js`, `frontend/modulos/anatomia-3d/css/atlas.css`, `frontend/modulos/anatomia-3d/css/infocard.css`.

## Como fazer
1. Em `atlas-a11y.e2e.js`, abra o atlas com `atlasFlags: { onboarding: false, hints: false, quizSetup: true }`.
2. Scan 1: `AtlasShell.setMode('quiz')`, espere `#quizStartBtn`, rode o axe. Seletores úteis: `.quiz-setup`, `.quiz-setup-select`.
3. Scan 2: selecione uma estrutura (`window.__atlasInternals.selection.select('za:left-ventricle','api')`), espere `.atlas-card-pin`, rode o axe. Também `.atlas-card-share`.
4. Scan 3: `AtlasShell.setMode('estudo')`, espere `.study-stats` e `.study-changelog`; rode o axe. Seletores: `.study-io`, `.study-io-export`, `.study-io-import`, `.study-privacy`.
5. Repita em 1280×800 e 390×844. Corrija o que for `serious` ou `critical`; contraste e nome acessível são os mais prováveis (botões com `style` inline em `study.js`).
6. Todo alvo de toque com no mínimo 44×44 px.

## Não fazer
- Não desligue regras do axe nem exclua elementos para passar.

## Aceite
- [ ] `bash docs/atlas-continuacao/validar.sh --e2e atlas-a11y` passa, com os 3 scans novos nos dois tamanhos.
- [ ] Nenhuma violação `serious`/`critical`; as `minor` ficam anotadas no commit.

## Prompt pronto
Siga `docs/atlas-continuacao/tarefas/T05-acessibilidade-telas-novas.md`: acrescente em `frontend/scripts/e2e/atlas-a11y.e2e.js` os scans de axe da tela de escolha do quiz, de "Meu estudo" e dos botões Fixar/Compartilhar (1280×800 e 390×844), copiando o padrão dos scans existentes. Corrija só o que o axe acusar, nos arquivos listados no cartão. Rode `bash docs/atlas-continuacao/validar.sh --e2e atlas-a11y` e mostre o resumo.
