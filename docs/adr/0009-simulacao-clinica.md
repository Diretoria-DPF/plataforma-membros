# ADR 0009: Simulação clínica com pacientes variados

Status: aceita em 2026-10-13 (beta, atrás de `clinical_sim_enabled`, **desligada**). Complementa o ADR 0007. Origem: plano "Operação LAIFT Agêntica, trilha de produto (v1)", seções G, I e J.

## Contexto
O paciente virtual da Clínica responde sempre no mesmo estilo, definido pelo caso. Treinar anamnese exige variar **como** o paciente se comunica (pressa, desconfiança, baixo letramento em saúde, memória ruim, confusão) sem variar **os fatos** do caso. O risco clínico é de conteúdo: falas e estágios de quadro que nenhum profissional conferiu, um paciente que entrega o diagnóstico, uma dose dita pelo paciente e um caso errado publicado. O dono pediu a simulação contra a recomendação inicial e decidiu (12/10/2026): `clinical_sim_enabled` **fica desligada** e nenhum caso com `sim_profile` é publicado até existir um **revisor clínico** (ainda indefinido); só maiores de 18 anos; dose estrita.

## Decisão
- **O servidor sorteia o paciente, o modelo não.** Quatro eixos (personalidade 6, letramento em saúde 3, recall 2, confusão 2) viram trechos de prompt FIXOS do catálogo (`clinicalSim/catalog.js`). `mulberry32(seed)`, ordem de sorteio fixa (um número por eixo), pesos por dificuldade, combinações incoerentes removidas (confuso exige recall baixo). O cliente manda só a semente; o servidor refaz os eixos a cada turno e os mantém ocultos até o debrief.
- **Parâmetro, não action.** `input.simulation = { seed, version, ... }` em `apiLearnClinicalChat/Evaluate`; a ponte dos módulos não muda. O módulo sabe da disponibilidade por `simulation.available` na resposta de `apiLearnGetMyAiQuota`, que a Clínica já chama. Sem a flag ou sem o parâmetro: caminho antigo, **sem consulta nova** e prompt **byte a byte** igual (teste contra baseline gerado do código anterior).
- **Persona só como fonte de texto e de regras.** A simulação não passa pelo `agentsService`. A fala do paciente passa pelo guardrail de saída da persona `paciente-virtual` (O1, O3, O4, O5, O6): sem diagnóstico, sem dose, sem vazar o prompt, sempre no personagem. A persona fica `draft` até o dono definir o revisor.
- **Nota calculada pelo servidor.** O preceptor devolve a nota de 4 componentes; o servidor limita cada um (hipótese 30, conduta 30, processo 20, comunicação adaptada 20), aplica tetos por fatos e por desfecho e soma.
- **Revisão humana imposta no banco** (`sql/037`): caso com `sim_profile` só fica `approved` com lista de conferência de 4 itens e revisor clínico diferente do autor (CHECKs mais o gatilho `clinical_sim_review_guard`); edição de caso publicado exige nova revisão e `content_version` maior; caso de IA nunca leva `sim_profile`. Sem tabela nova: semente e eixos vão em `learning_attempts.details.sim`.
- **Casos permitidos**: embutidos (conteúdo do repositório) e do acervo com `sim_profile` aprovado; nunca os gerados na sessão.
- **Versão.** `SIM_VERSION` (`sim-v1`) identifica pesos, ordem e catálogo; qualquer mudança que altere o paciente de uma semente exige nova versão.

## Consequências
- Rollback por flag (efeito imediato); `sql/down/037_clinical_sim.sql` apaga as colunas novas.
- O paciente nunca fala número de comprimidos ou doses (dose estrita): o catálogo manda usar linguagem de leigo. O custo é uma anamnese menos precisa sobre a quantidade ingerida.
- O chat clínico continua sem guardrail de entrada (como antes): a injeção é contida pelo prompt e pela saída do paciente.
- Ainda não há tela para cadastrar casos de simulação nem para o checklist de revisão: `sim_profile` entra por SQL de administrador e a aprovação pela API existente. Isso fica para quando houver revisor.
- Passos para ligar: `docs/agentic-layer.md`, seção 4.7.
