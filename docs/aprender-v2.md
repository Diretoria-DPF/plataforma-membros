# Aprender v2

Nova tela Aprender, atrás da flag `learn_v2_enabled` (desligada por padrão; migração 050, ver `docs/interface-v2.md`). Com a flag desligada, ou se o pacote falhar, o hub de sempre (`learning.js`, `#learn-hub`) aparece idêntico.

## O que muda com a flag ligada

- **Topo em gradiente** com "Aprender" e o atalho da Guia.
- **Um único cartão de foco**, "Continuar de onde parou" (último módulo de `engagement.js`, servidor e aparelho). Quem nunca estudou vê "Faça o primeiro quiz"; com histórico mas sem último módulo, o cartão some.
- **Meta de hoje**: anel, sete pontos da semana e sequência (`apiLearnGetEngagement`); "Mudar a meta" abre 5, 10 e 20.
- **Para hoje**: quiz do dia (`daily-quiz.js`, só com dados do servidor), Simulado (abre Farmacologia) e Caso clínico (abre a Clínica virtual).
- **Módulos**: faixa com os cinco módulos e o aproveitamento real (`apiLearnGetMyStats`, `byModule`). Tocar abre a folha de detalhe (descrição, atividades, acerto, Começar ou Continuar); Esc fecha e o foco volta ao cartão.
- **Seu aproveitamento**, **Desempenho por módulo** (recolhível) e **Conquistas**: os mesmos números do hub de sempre. Sem conquistas na lista, a seção não aparece.
- Estados: carregando (esqueleto), erro das duas fontes (com "Tentar de novo"), erro só das estatísticas (aviso; módulos seguem) e vazio (convites, sem número inventado).

## Mesmas ações

Abrir módulo, voltar, tela cheia, primeiro quiz e quiz do dia usam `LaiftLearning` e `LaiftEngagement` como antes; nenhuma API nova. Ao voltar de um módulo, `learning.js` recarrega a tela. O visualizador de módulos (iframe) não mudou.

## Carregamento

`learn-v2.js` fica no pacote sob demanda `aprender2` (`lazy-bundles.js`); o CSS é injetado pelo script e todas as regras valem só sob `:root[data-flag-learn-v2-enabled]`. `learning.js` só pede o pacote com a flag ligada; se falhar, carrega o hub de sempre.

## Acessibilidade

Alvos de pelo menos 44 px, fontes de pelo menos 12 px, foco visível, `aria-label` no anel, na sequência e nas barras, folha com foco preso e Esc, `prefers-reduced-motion`, tema claro e escuro pelos tokens. Sem `innerHTML`; cores dos módulos por classe (sem estilo inline); apenas as porcentagens usam `style.setProperty('--p', ...)`.

## Testes

`frontend/scripts/learn-v2.test.mjs` (unidade e fiação) e `frontend/scripts/e2e/learn-v2.e2e.js` (375x812, 768x1024 e 1280x800, claro e escuro, movimento reduzido, erro, vazio, flag desligada e pacote com falha). `LEARN_V2_SHOTS=<pasta>` grava capturas.
