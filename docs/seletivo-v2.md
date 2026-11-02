# Processo seletivo v2

Nova apresentação da jornada do candidato, atrás da flag `selection_v2_enabled` (desligada por padrão; migração 050, ver `docs/interface-v2.md`). Com a flag desligada, ou se o pacote falhar, a jornada de sempre (`selection.js`) aparece idêntica. Nenhuma regra muda: sem questões objetivas, sem mínimo de caracteres, aviso sobre dados de saúde, confirmação antes de enviar, rascunho no servidor, prazo individual e só visitantes.

## Como funciona

`selection-v2.js` (pacote sob demanda `seletivo2`) é carregado antes da jornada quando a flag está ligada (`app.js`; se falhar, abre a de sempre). `selection.js` avisa com o evento `laift:selection-render` a cada tela desenhada e expõe `snapshot()` e `openView()`; o v2 só acrescenta elementos ao mesmo DOM, sem trocar campos, botões ou textos de validação.

- **Cabeçalho** em gradiente com título, introdução, prazo do servidor e, nas etapas, "Etapa N de 6" com barra de progresso (`role="progressbar"`; concluídas = etapas anteriores à alcançada).
- **Aviso "Cuidado com os dados"** (sem dados de saúde, seus ou de terceiros) na apresentação e nas telas com texto livre.
- **Rascunho** (tela "Inscrição em andamento"): progresso, lista das seis etapas (abrem pela mesma regra do passo a passo) e "Como funciona" com prazo e data da próxima análise vindos do servidor.
- **Apresentação**: botão "Começar inscrição" e "Ler o edital" no cabeçalho; pontos e "Como funciona" de sempre em duas colunas a partir de 900 px.
- **Enviada**: comprovante no cabeçalho e linha do tempo de sempre.

## Fora desta versão

A prévia mostrava "Rascunho salvo hoje, às 14h20" e etapas em folha lateral. A API não devolve a hora do último salvamento e as etapas reais são telas inteiras; por isso não há horário e as etapas seguem como telas.

## Acessibilidade e testes

Alvos de 44 px ou mais, fontes de 12 px ou mais, foco no título a cada tela, `prefers-reduced-motion`, claro e escuro pelos tokens; sem `innerHTML` e sem estilo inline (só a variável `--p` da barra). Testes: `frontend/scripts/selection-v2.test.mjs` e `frontend/scripts/e2e/selection-v2.e2e.js` (`SELETIVO_SHOTS=<pasta>` grava capturas).
