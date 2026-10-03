# T13 — Teste de papel da "visão sistêmica"
**Quem faz:** você (humano) · **Depende de:** nada · **Estimativa:** 1 h

## Objetivo
Decidir se a "visão sistêmica" (grafo dos processos da Fisiologia, hoje atrás da flag `systemic: false`) entra, é simplificada ou sai.

## Arquivos
- `docs/atlas-conteudo/guia-revisao.md` — §5 descreve o teste.
- `docs/atlas-qa/teste-papel-visao-sistemica.md` (novo) — onde anotar as respostas.
- `frontend/modulos/anatomia-3d/js/core/flags.js` — onde a flag mora.

## Como fazer
1. Abra o atlas com `?flags=systemic`, modo Fisiologia, aba "Visão sistêmica".
2. Mostre a tela a **3 alunos**, um de cada vez, sem explicar. Pergunte: "O que você entende disso? O que acontece se tocar num ponto?"
3. Anote as respostas, palavra por palavra, no arquivo novo.
4. Decisão: 3 de 3 entendem → ligar a flag (`systemic: true` em `flags.js`, 1 linha, mais o ajuste da lista `EXPERIMENTAL` em `frontend/scripts/atlas/progress-bar.test.mjs`); 2 ou mais não entendem → simplificar ou retirar numa tarefa nova.

## Aceite
- [ ] `docs/atlas-qa/teste-papel-visao-sistemica.md` preenchido com 3 respostas e a decisão.

## Prompt pronto
(Só se a decisão for ligar a flag.) Troque `systemic` para `true` em `frontend/modulos/anatomia-3d/js/core/flags.js` e remova `'systemic'` da lista `EXPERIMENTAL` em `frontend/scripts/atlas/progress-bar.test.mjs`. Rode `bash docs/atlas-continuacao/validar.sh --e2e atlas-fisiologia atlas-a11y` e mostre o resumo.
