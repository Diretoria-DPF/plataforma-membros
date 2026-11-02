# Mentoria v2

Nova apresentação da Mentoria, atrás da flag `mentoring_v2_enabled` (desligada por padrão; migração 050, ver `docs/interface-v2.md`). Com a flag desligada, ou se o pacote falhar, a Mentoria de sempre (`mentoring.js`) aparece idêntica. Nenhuma regra muda: só membros; aceitar um pedido cria a conexão no servidor; as ações e mensagens são as de sempre.

## Como funciona

`mentoring-v2.js` (pacote sob demanda `mentoria2`, `lazy-bundles.js`) não recria nada: reposiciona os nós de sempre (mesmos ids) e acrescenta enfeites. `mentoring.js` avisa com o evento `laift:mentoring-render` a cada desenho e expõe `snapshot()` (últimos dados, sem nova chamada à API). `reset()` desfaz tudo quando a flag é desligada.

- **Cabeçalho** em gradiente com o aviso de sempre e um resumo de números reais: mentorias ativas, pedidos para responder, pedidos enviados e disponibilidade como mentor. Sem dados (carregando ou erro), o resumo não aparece.
- **Duas colunas** a partir de 900 px: Meus mentores e Meus mentorados; Minha disponibilidade e Escolher um mentor.
- **Linhas** com avatar de inicial e etiqueta de situação (a frase também está no texto da linha; o enfeite é oculto para leitor de tela).

## Fora desta versão

A prévia mostrava objetivos com progresso, "Marcar encontro", áreas de apoio e limite de mentorados. A Mentoria real não tem esses dados nem API para eles; ficam para uma versão com backend próprio.

## Acessibilidade e testes

Alvos de 44 px ou mais, fontes de 12 px ou mais, foco visível, `prefers-reduced-motion`, claro e escuro pelos tokens; sem `innerHTML` e sem estilo inline. Testes: `frontend/scripts/mentoring-v2.test.mjs` e `frontend/scripts/e2e/mentoring-v2.e2e.js` (`MENTORIA_SHOTS=<pasta>` grava capturas).
