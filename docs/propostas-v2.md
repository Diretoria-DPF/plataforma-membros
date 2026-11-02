# Propostas v2

Tela de Propostas reorganizada, **atrás da flag `proposals_v2_enabled`, desligada por padrão** (migração `050`). Com a flag desligada, ou se o pacote falhar ao carregar, a tela de sempre fica idêntica.

## Como funciona

`proposals-v2.js` (pacote sob demanda `propostas2`, `lazy-bundles.js`) **não recria nada**: reposiciona os elementos de sempre, com os mesmos ids (`form-proposal`, `proposal-title`, `proposal-description`, `msg-proposal`, `my-proposals-list`, `voting-status`, `voting-list`). As listas continuam escritas por `app.js`; só ganham `data-voted` e `data-status`, atributos invisíveis que o pacote lê. `reset()` desfaz tudo quando a flag é desligada.

- **Cabeçalho** em gradiente com o atalho "Enviar proposta" (abre o formulário e leva o foco ao título).
- **Resumo da votação**: quantas votações estão abertas, quantas aguardam o seu voto e uma barra com as que você já votou. Os números vêm dos itens que estão na tela; nada é inventado. "Votar agora" leva ao primeiro item sem voto.
- **Votação aberta** vem primeiro, com Sim, Não e Comentar como sempre.
- **Minhas propostas** com filtro por situação (só as que existem).
- **Enviar proposta** numa seção recolhível. Título com no mínimo 3 caracteres e descrição com no mínimo 5, como sempre.

## Fora desta versão

A prévia mostrava opções de voto em lista com resultado parcial em porcentagem e envio em folha sobreposta. A tela real não tem resultado parcial (a API não o devolve) e o voto é Sim, Não ou Comentar; o formulário fica numa seção recolhível em vez de folha.

## Acessibilidade

Alvos de 44 px ou mais, fontes de 12 px ou mais, foco visível, `prefers-reduced-motion` respeitado, claro e escuro pelos tokens, `aria-expanded` e `aria-pressed` nos controles. Sem `innerHTML` e sem estilo inline.

## Testes

`frontend/scripts/proposals-v2.test.mjs` e `frontend/scripts/e2e/proposals-v2.e2e.js`.
