# L02: QA visual do Início com `ux_v2_enabled` ligada (hero da Lia)

**Objetivo.** Dar à sessão principal provas visuais para decidir se liga `ux_v2_enabled` em produção: capturas do Início com o hero da Lia em 375 e 1280 px, nos temas claro e escuro, com flags **simuladas** no harness e2e. Nada de produção é tocado.

**Passo 0.** Leia `frontend/hero.js` (condições de montagem: `ux_v2_enabled` e `chatbot_enabled` ligadas e a Lia carregada), `frontend/scripts/e2e/harness.js` (`startApp({ role, theme, viewport, workerHandlers })`) e `frontend/scripts/e2e/visual-qa.e2e.js` (linhas 28-45: `FLAGS_ON`, viewports, temas; linhas 140-160: `memberHandlers()` com `apiGetFeatureFlags` e `apiGetHomeSummary`). Copie esses padrões; não importe de `visual-qa`.

**Arquivo-dono (novo).** `frontend/scripts/e2e/hero-ux2.e2e.js`, até 200 linhas, no mesmo formato dos outros `*.e2e.js` (`module.exports = async function () {...}`).

**Requisitos.**
1. Matriz 2 temas (`light`, `dark`) × 2 viewports (`{375,812}`, `{1280,800}`) com `role: 'member'` e flags `{ ux_v2_enabled: true, chatbot_enabled: true, feedback_enabled: true }`.
2. Em cada combinação, no `panel-home`:
   - `#hero-lia` visível, sem a classe `hidden`, com `aria-hidden` diferente de `"true"` e com conteúdo montado (pelo menos um filho);
   - `html` com `data-flag-ux-v2-enabled`;
   - sem rolagem horizontal (`document.scrollingElement.scrollWidth <= innerWidth`);
   - nenhum erro de console nem `pageerror`;
   - o retângulo do hero dentro da largura da janela.
3. Captura de página inteira em `frontend/scripts/e2e/.shots/hero-<claro|escuro>-<375x812|1280x800>.png`.
4. Caso negativo, só em 375 claro: `ux_v2_enabled: false` deixa `#hero-lia` oculto. Capture `hero-flag-desligada.png`.
5. Movimento reduzido (375 escuro, `emulateMedia({ reducedMotion: 'reduce' })`): o hero monta sem erro. Registre se há animação.
6. Imprima um resumo no formato de `visual-qa` (verificações ok e avisos). Falha de verificação sai com erro.

**Aceite (comando).**
```bash
cd "C:/Users/Administrador/Desktop/plataforma membro/frontend" && node scripts/build.js && node scripts/e2e/run.js hero-ux2
```
Esperado: todas as verificações ok e 6 PNGs em `scripts/e2e/.shots/`.

**Regras.** Sem git; não edite `hero.js`, CSS nem `index.html` (se o hero falhar, descreva a causa e o trecho exato no relatório); um único e2e por execução; cabeçalho de copyright; LF. GateGuard: se o hook pedir fatos na primeira criação do arquivo, escreva 2 linhas (quem usa: a sessão principal, para decidir a flag do hero; a instrução: "QA visual do Início com a flag ligada: capturas 375 e 1280, claro/escuro, harness e2e com flags simuladas") e repita a mesma chamada.

**Relatório (até 12 linhas).** O resultado de cada uma das 4 combinações e do caso negativo, o caminho absoluto das capturas, problemas visuais vistos (corte, contraste, sobreposição com a navegação) e a recomendação: ligar, ou não ligar e por quê.
