# Eventos v2

Nova tela Eventos, aprovada pelo dono e **atrás da flag `events_v2_enabled`, desligada por padrão** (criada na migração 050, ver `docs/interface-v2.md`). Com a flag desligada, ou se o pacote falhar, a tela de sempre (`#panel-events` em `index.html`, montada em `app.js`) fica idêntica.

## O que muda com a flag ligada

- **Topo em gradiente** com o título e o atalho da Guia.
- **Próximo evento em destaque**: o primeiro por data que ainda tem vaga (ou em que a pessoa já está inscrita), com o botão de inscrição.
- **Filtros**: Todos, Minhas inscrições (só com sessão) e Com vagas.
- **Cartões** com data, local, descrição, foto (mesmo visualizador de sempre), vagas reais e a ação: Inscrever-se, Cancelar inscrição (só em evento que ainda não começou, com confirmação), "Sem vagas" desativado, ou "Faça login para se inscrever".
- **Histórico** dos concluídos, com estados de carregando, vazio e erro com nova tentativa.
- O gráfico de ocupação da tela de sempre não aparece na v2 (as vagas estão em cada cartão).

## Dados e ações

Os mesmos de sempre, chamados pelo `app.js`: `apiListEvents`, `apiRegisterForEvent`, `apiCancelEventRegistration` e `apiListRecentCompletedEvents`. O `events-v2.js` só desenha o que recebe; nenhuma API nova, nenhuma função removida.

## Acessibilidade

Resultado de inscrever e cancelar anunciado na região `role="status"` (`#events-status`); o foco volta ao botão do mesmo evento após a atualização; filtros com `aria-pressed`; alvos de pelo menos 44 px; fontes de pelo menos 12 px; `prefers-reduced-motion`; tema claro e escuro pelos tokens. Sem `innerHTML`.

## Carregamento

`events-v2.js` e `events-v2.css` ficam no pacote sob demanda `eventos2` (`lazy-bundles.js`), fora do shell e do precache. O `app.js` só o baixa com `data-flag-events-v2-enabled` no `<html>`; todas as regras do CSS dependem do atributo.

## Testes

`frontend/scripts/events-v2.test.mjs` (unidade e fiação) e `frontend/scripts/e2e/events-v2.e2e.js` (375x812, 768x1024 e 1280x800, tema escuro, movimento reduzido e flag desligada).
