# Equipe v2

Tela Equipe reapresentada, **atrás da flag `team_v2_enabled`, desligada por padrão** (migração `050`). Com a flag desligada, ou se o pacote falhar, a tela de sempre fica idêntica.

## Como funciona

`team-v2.js` (pacote sob demanda `equipe2`, `lazy-bundles.js`) não recria nada nem chama a API: organograma, formulário de pedido, pedidos recebidos e "Meus adicionados" são os mesmos nós de `app.js`, com as mesmas regras de conexão. O script acrescenta um cabeçalho e quatro atalhos (Organograma, Adicionar, Pedidos, Meus adicionados) que mostram um cartão por vez (atributo `hidden`). "Pedidos (N)" usa o número de pedidos já listados na tela. Tudo é desfeito por `reset()`.

O visual do organograma (linhas de pessoa de 56 px, diretorias com cabeçalho em gradiente) vem de `team-v2.css`, só sob `data-flag-team-v2-enabled` e `data-tm2`.

## Fora desta versão

Nenhum dado novo: sem cargo ao lado do nome nas listas e sem contagem de membros por diretoria, porque a API não os devolve nesses pontos.

## Testes

`frontend/scripts/team-v2.test.mjs` e `frontend/scripts/e2e/team-v2.e2e.js`.
