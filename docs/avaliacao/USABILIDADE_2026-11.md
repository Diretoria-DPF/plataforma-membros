# Revisão de usabilidade — novembro de 2026

Medido no código (não em aparelho). O que está marcado "feito" entrou nesta rodada; o resto fica na fila.

| Item | Situação |
|---|---|
| Deslizar em carrossel trocava de painel | Feito (PR #138) |
| Aprender preso numa coluna estreita no desktop | Feito (PR #138) |
| LinkedIn/Instagram só texto | Feito (PR #139) |
| Fiscal: telas demais, sem resultado grande nem contador ao vivo | Feito (PR #140) |
| Crachá: 19 controles | Feito (PR #140): 3 à vista, resto em "Personalizar" |
| Perfil do membro, confirmar identidade e comentário do voto sem Esc, sem foco de entrada e sem retorno do foco | Feito (`modal-a11y.js`) |
| Contador de mensagens com 11 px | Feito (12 px) |
| Alvos de toque < 44 px: só ícones/selos internos a botões maiores foram achados no CSS; falta medir em aparelho | Fila |
| Painéis sem estado vazio/erro/carregando padronizado | Fila: auditar painel a painel com `shared-states.js` |
| Validação inline nos formulários (`aria-invalid`, `aria-describedby`) | Fila |
| Menu com ~27 painéis (15 de admin) | Fila: agrupar por tarefa |
| Início com camadas v2/v3 empilhadas | Fila: decidir qual fica |

Próximo passo: abrir as telas em 375 px logado e registrar o que ainda falhar.
