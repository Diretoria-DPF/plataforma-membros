# T06 — Celular: Fixar, Compartilhar e Continuar visíveis
**Quem faz:** outro chat · **Depende de:** T00 · **Estimativa:** 3 h

## Objetivo
Conferir (e corrigir, se preciso) que, em 390×844, o aluno consegue tocar em ☆ Fixar, ↗ Compartilhar e no chip "↺ Continuar" sem abrir a ficha inteira.

## Arquivos
- `frontend/modulos/anatomia-3d/js/ui/infocard.js` — `renderActions` cria os botões `.atlas-card-pin` e `.atlas-card-share` na barra `.atlas-card-actions`.
- `frontend/modulos/anatomia-3d/css/infocard.css` — a barra `.atlas-card-actions` (grade) e as regras do modo "espiar" (peek).
- `frontend/modulos/anatomia-3d/css/atlas.css` — `.atlas-continue`.
- `frontend/modulos/anatomia-3d/js/main.js` — onde o chip é montado e a ficha é criada.
- `frontend/scripts/e2e/atlas-estudo.e2e.js` — acrescentar a verificação em 390×844.

## Como fazer
1. Antes de mexer: descubra se a barra de ações aparece no estado "espiar" (peek) no celular. Use `grep -rn "peek" frontend/modulos/anatomia-3d/js frontend/modulos/anatomia-3d/css` e abra a ficha pelo e2e em 390×844 com captura de tela.
2. No e2e novo (viewport 390×844, `isMobile`), selecione uma estrutura e meça com `boundingBox()`: `.atlas-card-pin`, `.atlas-card-share` e `.atlas-continue` devem estar visíveis, dentro da tela, com largura e altura ≥ 44.
3. Se estiverem escondidos no peek: mostrar só ☆ e ↗ como botões compactos no cabeçalho do peek (sem a barra inteira) ou liberá-los quando a ficha subir para "meio". Mantenha o `aria-label` atual.
4. Se a barra transbordar com 6 botões: a grade já usa `repeat(auto-fit, minmax(84px, 1fr))`; confirme que não corta o texto.

## Não fazer
- Não esconda Isolar/Ocultar/Fantasma/Focar para abrir espaço. Não use `position: fixed` que cubra o canvas.

## Aceite
- [ ] E2E em 390×844: os 3 controles visíveis, tocáveis e com ≥ 44×44 px.
- [ ] Em 1280×800 nada mudou (`bash docs/atlas-continuacao/validar.sh --e2e atlas-estudo atlas-responsive`).

## Prompt pronto
Siga `docs/atlas-continuacao/tarefas/T06-celular-fixar-compartilhar.md`. Primeiro escreva o e2e em 390×844 em `frontend/scripts/e2e/atlas-estudo.e2e.js` e mostre se os controles aparecem; só então corrija CSS/JS nos arquivos do cartão. Rode `bash docs/atlas-continuacao/validar.sh --e2e atlas-estudo atlas-responsive` e mostre o resumo.
