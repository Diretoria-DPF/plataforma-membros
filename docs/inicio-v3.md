# Início v3

Nova tela Início, aprovada pelo dono e **atrás da flag `home_v2_enabled`, desligada por padrão** (migração `049`, que também semeia `entrada_v2_enabled`, usada pela tela de entrada nova). Com a flag desligada, a Início de sempre (`home.js`, `home-editorial.css`) fica idêntica.

## O que muda com a flag ligada

- **Topo em gradiente** com a saudação e três atalhos: a Guia, o crachá virtual e as mensagens e avisos (o ponto acende com mensagens ou pedidos de conexão novos).
- **Um único cartão de foco**, "Continuar de onde parou", com os dados de `engagement.js` (servidor e aparelho). Sem último módulo, o cartão some. Não há barra flutuante nem "Continuar" repetido.
- **Resumo do dia**: anel da meta (questões de hoje sobre a meta), sete pontos da semana e a sequência, tudo de `apiLearnGetEngagement`. "Mudar a meta" abre as opções 5, 10 e 20. Os pontos acesos são os últimos dias da sequência atual (a API informa só a sequência, não o histórico por dia).
- **Para hoje**: quiz do dia (`daily-quiz.js`), próximo evento e votação aberta, de `apiGetHomeSummary`. Só entra o que existe.
- **Seus assuntos**: faixa com os cinco módulos, cor e ícone SVG próprios e o aproveitamento real de `apiLearnGetMyStats` (`byModule`). Rola na horizontal com encaixe (scroll-snap) no celular e vira grade a partir de 900 px.
- **Na Liga**: o bloco de `highlights.js` (ver `docs/destaques.md`), só reposicionado e estilizado.
- **Perfil ganha "Meu desempenho"** (recolhido): os números e gráficos que antes ocupavam a Início (`home.js` com `{ embedded: true }`), carregados só quando a pessoa abre o bloco.

## Navegação responsiva (mesma estrutura, só CSS)

O menu existente (`#app-nav`, `data-panel`, painéis) não mudou de estrutura; com a flag ligada o CSS o adapta:

| Largura | Navegação |
|---|---|
| menos de 768 px | barra embaixo (a de sempre) |
| 768 px ou mais | coluna lateral de 88 px, com ícone e rótulo |
| 1100 px ou mais | menu lateral de 248 px, com o rótulo ao lado do ícone |

O menu hambúrguer (Propostas, Tarefas, Mensagens, Equipe, Biblioteca, Gestão) continua como está.

## Carregamento

`home-v3.js` e `home-v3.css` ficam no pacote sob demanda `inicio3` (`lazy-bundles.js`, fora do shell e do precache). `app.js` só o baixa com `data-flag-home-v2-enabled` no `<html>`; se o pacote falhar, a Início de sempre carrega. O CSS tem todas as regras globais condicionadas ao atributo da flag.

## Acessibilidade e movimento

Alvos de pelo menos 44 px, fontes de pelo menos 12 px, foco visível, `aria-label` no anel, na sequência e nas barras de progresso, `aria-expanded` na meta, `prefers-reduced-motion` respeitado e tema claro e escuro pelos tokens de `laift-tokens.css`. Ícones são SVG criados por `createElementNS`; nada de `innerHTML`.

## Ligar e desligar

Painel de flags do modo admin (`home_v2_enabled`). Desligar devolve a Início de sempre na próxima abertura da tela. Reversão da migração: `sql/down/049_ui_v2_flags.sql`.

## Testes

`frontend/scripts/home-v3.test.mjs` (unidade e fiação), `frontend/scripts/e2e/home-v2.e2e.js` (375x812, 768x1024 e 1280x800, tema escuro, movimento reduzido, Perfil e flag desligada) e `worker/test/uiV2FlagsMigration.test.js` (migração e reversão).
