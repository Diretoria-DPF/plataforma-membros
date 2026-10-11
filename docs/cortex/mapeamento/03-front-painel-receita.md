# Receita: painel de membro, item no menu e aba admin (front)

Branch feat/cortex-biblioteca. Caminhos relativos a `frontend/`, salvo quando indicado. Linhas conferidas nesta branch.

## Fatos que mandam na receita
- Painel = `<section id="panel-X" class="hidden">` dentro de `main.app-main` (index.html:397). Primeiro filho `<h1 class="sr-only">`. headings.test.mjs:48 e 61-68 varre todo `panel-*`: sem pular nível.
- `showPanel` (app.js:1128) chama `PANEL_LOADERS[id]` (app.js:1072). `showPanelSection` (app.js:1111) só troca visibilidade e aria-current.
- Swipe usa `MEMBER_PANEL_ORDER` (app.js:1157): painel fora da lista não entra no deslizar.
- Escopo admin pelo prefixo `panel-admin-` (voltar-app.js:14, 20-22).
- Admin chama a API com `App.callApi(acao, token, input)` (admin-moderation.js:306; admin-ai.js:127, 420, 444). Token vem de `app.getState().sessionToken`.
- `callLearningApi` (app.js:430) só aceita `^api(Learn|AdminAttendance|AdminAi|AdminLearn)[A-Z]` (app.js:427). Módulos em iframe usam essa ponte; painel admin não deve usar.

## Checklist: arquivo → o que mudar

### A. Painel de membro `panel-library`
1. `index.html` ~linha 411 (depois de `panel-learn`, antes de `panel-profile` em 571): nova `<section id="panel-library" class="hidden">` com `<h1 class="sr-only">Biblioteca</h1>`. Conteúdo montado por JS (sem innerHTML).
2. `app.js:1072-1099` (PANEL_LOADERS): `'panel-library': function () { if (window.LaiftLibrary) window.LaiftLibrary.loadPanel(); },`
3. `app.js:1157` (MEMBER_PANEL_ORDER): incluir `'panel-library'` na posição desejada. Sem isso o swipe pula o painel.
4. Arquivo novo `library.js`, modelo `learning.js` (IIFE, `window.LaiftLibrary = { loadPanel, reset }`, só `window.App` e `LaiftDom`).
5. `index.html:1059-1069`: `<script src="library.js" defer></script>` antes de `app.js` (1067). Ordem é convenção: app.js resolve `window.LaiftX` no clique.
6. `index.html:63-75`: `<link>` de `library.css` se houver CSS próprio.
7. `scripts/build.js:56` (lista explícita de cópia): incluir `'library.js'` e `'library.css'`. Arquivo fora da lista não vai para o dist.
8. `sw.js:23-29` (PRECACHE): incluir `'library.js'` e `'library.css'`. `sw.js:20` (`CACHE_NAME` = `...v4`): bump para v5 é opcional; o `install` roda porque o arquivo muda. ux-v2.test.mjs:298 exige v>=3.

### B. Item no menu hambúrguer `#app-menu`
9. `index.html:345-394` (dialog `#app-menu`): novo `<li><button class="app-menu__item" data-panel="panel-library" data-scope="member">` com svg `aria-hidden`, `<span class="app-menu__texto"><span class="app-menu__titulo">Biblioteca</span><span id="app-menu-info-library" class="app-menu__info"></span></span>`. Grupo novo: `<section class="app-menu__grupo" data-grupo="...">` com h3 e `aria-labelledby`.
10. `app-menu.js:13-25` (BADGE_IDS/INFO): só se o item mostrar contagem. Hoje são 4 contadores.
11. `app-menu.js:86-90`: grupo sem nenhum `[data-panel]` visível recebe classe `hidden`. Use isto ao esconder por flag (ver C).
12. `app-menu.css:152-200` (`.app-menu__item`, `__titulo`, `__info`): reuso, sem CSS novo.
13. `scripts/app-menu.test.mjs:146-147`: o deepEqual dos `data-panel` do dialog VAI quebrar. Incluir `panel-library`.
14. `scripts/nav-a11y.test.mjs:126-136`: só se o rótulo estiver na lista; o padrão `<span class="app-menu__titulo">` já é aceito.

### C. Gate por flag (item some com a flag desligada)
15. Worker (pré-requisito, fora do front): `worker/src/services/featureFlagService.js:120` (`PUBLIC_FLAGS`) incluir a chave; migração nova em `sql/` com a linha `FALSE`. Regra: docs/FEATURE_FLAGS.md ("Regra de nascimento"). Sem isso o atributo nunca chega ao navegador.
16. Front lê a flag assim: `apiGetFeatureFlags` (app.js:487-495, chamado em `enterApp` app.js:904) → `window.LaiftUx.applyAndRememberFlags` põe `data-flag-<chave>="1"` no `<html>` (ux-v2.js:22-25, 31). Chave em snake_case que casa `^[a-z][a-z0-9_]{0,63}$` (ux-v2.js:16). Ex.: `library_enabled` vira `data-flag-library-enabled`. Cache de primeira pintura: ux-v2.js:66 (`restoreFlags`).
17. Gate em CSS, no contêiner do grupo, não no `<li>`: `:root:not([data-flag-library-enabled]) [data-grupo="biblioteca"] { display: none; }`. Motivo: `atualizar()` (app-menu.js:86-90) só olha a classe `hidden`, não o CSS. Um item oculto por CSS deixaria o cabeçalho do grupo vazio.
18. Não esconder com `classList.toggle('hidden')` em `[data-panel]` a partir de flag: `setupNavigationForRole` (app.js:1041-1047, chamado em 914) reescreve `hidden` por papel e desfaz.

### D. Aba admin `panel-admin-library`
19. `index.html:296-342` (`#nav-group-admin`): novo `<button type="button" data-panel="panel-admin-library">` antes de `#btn-exit-admin-mode` (338). Não vai no menu: o menu some no modo admin (app-menu.js:91-93). A barra já rola na horizontal (styles.css:234-239).
20. `index.html` ~linha 821-836 (modelo `panel-admin-ai`): `<section id="panel-admin-library" class="hidden">` com h1 sr-only.
21. `app.js:1095-1098` (PANEL_LOADERS): `'panel-admin-library': function () { if (window.LaiftAdminLibrary) window.LaiftAdminLibrary.load(window.App); },`
22. `app.js:139-143` e `882-886` (blocos que já chamam `LaiftAdminModeration.reset()`, na saída da sessão): acrescentar `window.LaiftAdminLibrary.reset()` com a mesma guarda `if`.
23. Arquivo novo `admin-library.js`, modelo `admin-moderation.js`: `load(app)`, `reset()`, `window.LaiftAdminLibrary`. Chamadas com `app.callApi('apiAdminLibrary...', token, input)`. Nome da ação livre, mas não passa pela ponte de módulos.
24. `scripts/build.js:101` (cópia separada de `admin-ai.js`) e `build.js:56`: incluir `admin-library.js`. `sw.js:25` PRECACHE: incluir.
25. `index.html` (perto de 1061-1064): `<script src="admin-library.js" defer></script>` depois de `safe-dom.js` (1063), se usar `LaiftDom`.
26. Worker (fora do front): ação nova no mapa de `worker/src/handlers.js` (ex.: linha 264, `apiAdminLearnListPendingCases`) com checagem de papel admin no service.
27. Opcional: `assistant.js:16-24` (ACTION_KEYS), só se a Lia puder navegar para o painel. Exige espelho em `worker/src/assistant/targets.js`.

### E. Tokens, estados e componentes a reutilizar
28. Cores e movimento: `modulos/shared/laift-tokens.css` (`--laift-*`: claro 134-148, escuro 210-269; `--dur-*` e `--ease-*` 91-98). `styles.css:13-26` já aliasa `--primary`, `--admin`, `--danger`, `--muted`, `--border`, `--surface-alt`. Não criar hex novo.
29. Vazio, carregando e erro: `shared-states.js:48` `LaiftStates.createStateNode(doc, kind, { title, message, actionLabel, onAction })`; `:72` `createSkeleton(doc, rows)`; `:95` `resolveListState(res, items)`. CSS em `ux.css:92-132` (`.state`, `.state-error`, `.skeleton`).
30. Helpers da ponte `window.App` (app.js:2600-2621): `renderList`, `setStatus`, `openConfirm`, `formatDate`, `h`, `text`, `clearEl`, `callApi`.
31. Classes prontas: `.card`, `.list-item`, `.meta-row`, `.actions-row`, `.badge`, `.stat-grid` (styles.css:301-313), `.ai-budget` (ux.css:304).
32. DOM seguro: `modulos/shared/safe-dom.js:102` `LaiftDom.h` (aceita `text`, `className`, `dataset`, `on*` como função). `:161` `delegateActions(root, [ACAO])` substitui `onclick=""` por `data-action`. Modelo: admin-moderation.js:286-297 e 313.

### F. Testes e2e (harness)
33. `scripts/e2e/harness.js:254` (`MENU_PANELS`): incluir `'panel-library'`. Sem isso `showPanel()` clica em `#app-nav` e falha.
34. `scripts/e2e/harness.js:185` (`startApp`), opção `workerHandlers`: cada ação nova precisa de handler no teste. O `default:` de `defaultWorkerReply` (harness.js:166) devolve listas vazias genéricas; a fila admin deve devolver o shape real.
35. Novo `scripts/library.test.mjs` (modelo `app-menu.test.mjs:164-171`): registro em build.js e sw.js; sem `innerHTML` nem `.style.`; `index.html` tem o painel e a aba admin.
36. Novo `scripts/e2e/library.e2e.js`: `run.js:9-12` pega `*.e2e.js` sozinho. Cobrir flag off (item some), membro sem aba admin, e fila admin com `calls.worker`.
37. Automático: headings.test.mjs cobre a nova section. Opcional: `scripts/e2e/visual-qa.e2e.js:43-50` (MEMBER_PANELS) e `qa-full.e2e.js:951` (painéis admin).

## Observações
- CSP: `index.html:6` tem `script-src 'self'` e `style-src 'self' 'unsafe-inline'`. Pela regra da equipe, nada de `style=""`. Mas app.js já usa `style` em strings (app.js:382-385); não copiar esse trecho.
- Há uma fila de moderação de casos clínicos em `admin-ai.js` (`apiAdminLearnListPendingCases`, linhas 420-444). A fila de artigos deve ter nome e painel próprios para não confundir.
- Não verifiquei o comando que roda os `.test.mjs` (`frontend/package.json` não tem script `test`). Conferir o workflow do CI antes de depender disso.
