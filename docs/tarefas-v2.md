# Tarefas v2

Tela de Tarefas reorganizada, **atrás da flag `tasks_v2_enabled`, desligada por padrão** (migração `050`). Com a flag desligada, ou se o pacote falhar ao carregar, a tela de sempre fica idêntica.

## Como funciona

`tasks-v2.js` (pacote sob demanda `tarefas2`, `lazy-bundles.js`) **não recria nada**: `#tasks-status` e `#tasks-list` continuam escritos por `app.js`, com Aderir, Marcar como concluída e Comentários. Cada item ganha `data-task-state` (`open`, `mine` ou `done`), atributo invisível que o pacote lê. `reset()` desfaz tudo quando a flag é desligada.

- **Cabeçalho** em gradiente.
- **Resumo**: tarefas em curso, concluídas e disponíveis, contadas dos itens que estão na tela.
- **Duas listas**: Disponíveis e Minhas tarefas (com filtro Todas, Em curso e Concluídas). Os itens fora do filtro ficam escondidos, sem nova consulta à API.
- Mensagem própria quando a lista escolhida está vazia; carregando e erro seguem o aviso de sempre.

## Fora desta versão

A prévia tinha "Inscrever-se", "Cancelar inscrição", "Em andamento", "Aguardando revisão" e barra de progresso. A tela real só tem Aderir e Marcar como concluída (sem cancelar, sem etapa de revisão e sem progresso), então esses elementos não entram: o pacote não cria ação nem número que a API não tenha.

## Acessibilidade

Alvos de 44 px ou mais, fontes de 12 px ou mais, foco visível, claro e escuro pelos tokens, `aria-pressed` nos filtros. Sem `innerHTML` e sem estilo inline.

## Testes

`frontend/scripts/tasks-v2.test.mjs` e `frontend/scripts/e2e/tasks-v2.e2e.js`.
