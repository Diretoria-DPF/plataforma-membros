# Biblioteca v2

Novo visual da Biblioteca do app, aprovado pelo dono e **atrás da flag `library_v2_enabled`, desligada por padrão** (migração `050`). Com a flag desligada, ou se o pacote falhar ao carregar, a Biblioteca de sempre fica idêntica.

## Como funciona

`library.js`, `library-detail.js` e `library-cite.js` seguem montando a tela, buscando, filtrando, favoritando, citando (ABNT, Vancouver, BibTeX) e recebendo sugestões, com os mesmos ids, ações e validações. Nenhuma API nova.

`library-v2.js` (pacote sob demanda `biblioteca2`, `lazy-bundles.js`) só marca o painel (`data-lib2`) e carrega o CSS. Não exibe selo nem texto de revisão, de origem por IA ou de nome de revisor: a vista pública apenas mostra as informações; a aprovação fica com a administração. `reset()` desfaz tudo quando a flag é desligada.

`library-v2.css` vale só sob `data-flag-library-v2-enabled`: cabeçalho em gradiente, busca em cartão, abas e filtros rápidos em pílulas, artigos em cartões (1, 2 e 3 colunas), ficha do artigo em cartão. Claro e escuro pelos tokens.

## Onde vale

Só o painel da Biblioteca no app (`panel-library`), onde a flag pública existe. A página pública `/biblioteca` (`biblioteca.html`) não muda.

## Fora desta versão

- A prévia buscava "ao vivo" por tipo com um seletor próprio. O app já filtra por Tipo na área "Filtros"; ela segue como é, para não alterar dados nem validações.
- A prévia marcava artigos como "revisados". Por regra do dono, nenhum selo ou texto de revisão aparece na vista pública; os campos de revisão continuam nos dados e nas telas de administração.
- A anotação do resumo e o "Citar" continuam os da ficha de sempre, só com o visual novo.

## Acessibilidade

Alvos de 44 px ou mais, fontes de 12 px ou mais, foco visível, `prefers-reduced-motion` respeitado. Sem `innerHTML` e sem estilo inline.

## Ligar e desligar

Painel de flags do modo admin.

## Testes

`frontend/scripts/library-v2.test.mjs` e `frontend/scripts/e2e/library-v2.e2e.js`.
