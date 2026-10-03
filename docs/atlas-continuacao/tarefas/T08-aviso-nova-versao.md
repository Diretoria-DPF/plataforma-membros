# T08 — Aviso "Nova versão disponível"
**Quem faz:** outro chat · **Depende de:** T00 · **Estimativa:** 4 h

## Objetivo
Hoje um Service Worker novo espera todas as abas do atlas fecharem para assumir. Mostrar um aviso discreto "Nova versão disponível — Atualizar" e, ao tocar, ativar o novo e recarregar.

## Arquivos
- `frontend/modulos/anatomia-3d/sw.js` — ouvir `message` com `{type:'SKIP_WAITING'}` e chamar `self.skipWaiting()`.
- `frontend/modulos/anatomia-3d/js/core/offline.js` — depois do `register`, observar `reg.waiting` / `updatefound`; chamar um callback `onUpdate(reg)`; ao confirmar, `postMessage({type:'SKIP_WAITING'})` e recarregar no `controllerchange`.
- `frontend/modulos/anatomia-3d/js/main.js` — passar o callback que mostra o aviso (reaproveitar `offerAction(texto, rótulo, fn, ms)` que já existe e é usado em "Continuar de onde parou?").
- `frontend/scripts/atlas/offline.test.mjs` — testes unitários (fake de `navigator.serviceWorker`).
- `frontend/scripts/e2e/atlas-offline.e2e.js` — e2e: dois builds diferentes (publicar `sw.js` com outro hash) fazem o aviso aparecer.

## Como fazer
1. `sw.js`: acrescentar o tratamento de `SKIP_WAITING` **sem** chamar `skipWaiting()` automaticamente (a troca só acontece com o aval do aluno).
2. `offline.js`: `registerOffline(flags, nav, win, { onUpdate })`. Se `reg.waiting` já existir ao registrar, ou quando `updatefound` terminar em `installed` com `nav.serviceWorker.controller` presente, chamar `onUpdate(reg)`.
3. Ao tocar em "Atualizar": `reg.waiting.postMessage({type:'SKIP_WAITING'})`; no evento `controllerchange` (uma vez só) fazer `location.reload()`.
4. Testes: sem controller (1ª instalação) **não** mostra aviso; com `waiting` mostra uma vez; clicar manda a mensagem.
5. E2E: no teste, depois de instalar o SW da build A, troque o corpo do `sw.js` servido (rota do Playwright em `**/sw.js` com outro número de build) e chame `reg.update()`; espere o aviso; toque; espere o recarregamento e o cache novo `atlas-<hash novo>`.

## Não fazer
- Não use `skipWaiting()` automático (poderia misturar versões de arquivos numa aba aberta). Não mostre o aviso na 1ª visita.

## Aceite
- [ ] Testes unitários dos 3 casos acima passam.
- [ ] E2E de atualização passa; o cache antigo é apagado.
- [ ] `bash docs/atlas-continuacao/validar.sh --e2e atlas-offline` passa.

## Prompt pronto
Siga `docs/atlas-continuacao/tarefas/T08-aviso-nova-versao.md`. Altere só `sw.js`, `js/core/offline.js`, `js/main.js`, `scripts/atlas/offline.test.mjs` e `scripts/e2e/atlas-offline.e2e.js`. Rode `bash docs/atlas-continuacao/validar.sh --e2e atlas-offline` e mostre o resumo.
