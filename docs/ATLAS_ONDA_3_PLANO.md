# Atlas 3D — Onda 3: plano (v3.0)

> Versão atual, sem histórico. As decisões, as situações passadas e as respostas às revisões ficam em [ATLAS_ONDA_3_HISTORICO.md](ATLAS_ONDA_3_HISTORICO.md).

## Resumo executivo
A Onda 3 transforma o atlas, de conteúdo gerado e sem revisão, em conteúdo com fonte verificável e aprovado pelo conselho editorial.

- **PR 3.0 (correções críticas):** mesclado.
- **PR 3.1 (nomes, lista e UX base):** mesclado.
- **PR 3.2 (conteúdo):** em andamento.
- **PR 3.3 (quiz e engajamento):** depois do 3.2.

O PR 3.2 é a maior entrega. Ele já tem o código pronto, mas o conteúdo anatômico só chega ao aluno onda por onda, com a assinatura do conselho.

## 1. Estado atual (medido)
| Item | Estado |
|---|---|
| Boot em Fast 3G | 9,2–9,4 s (HTTP/2, PR 3.1). Fichas fora do boot (e2e `atlas-selos`) |
| Fichas anatômicas | 300 priorizadas (`prioridades.json`, SHA-256 `7c9645db…6676`). Onda 01 (31) pronta em pendente, aguardando o conselho. Ondas 02–10 a preparar |
| Compostos | 30 v2 com fontes (editorial) + 15 suplementos legados (rascunho) |
| Processos e vias | 15 + 19 revisados, com fontes (editorial) |
| Cenário clínico | Crise colinérgica: 6 fases e 3 antídotos (editorial) |
| Moléculas | Pelo proxy da Worker (RCSB e PubChem fora da CSP do navegador) |
| Revisão do conselho | Ferramenta `modulos/anatomia-3d/revisao/` + `docs/atlas-conteudo/guia-revisao.md` |

## 2. Objetivos da onda
1. Conteúdo com fonte de obra aprovada (`fontes.json`), sem referência inventada (validador).
2. Nada anatômico chega ao aluno sem a assinatura do conselho (trava no build).
3. O aluno sabe o que é revisado (selos, filtro, busca).
4. Farmacologia e fisiologia ensinam com números coerentes (modelo PK/PD testado contra os valores citados).

## 3. Blocos do PR 3.2
| Bloco | Escopo | Aceite | Estado |
|---|---|---|---|
| A | Camada `curated/`, `fontes.json`, schemas v2, validador | auditor sem achados | ✔ |
| B | 10 ondas de fichas (canary por sistema) | cada onda assinada | onda 01 aguardando o conselho |
| C | 30 compostos v2, modelo Cp(t)/E(t), painel PK/PD, cenário clínico | Tmax a até 25% do citado; e2e `atlas-farmaco` | ✔ (dados editoriais) |
| D | 15 processos, 19 vias, tempo da animação, estudo de via, visão sistêmica (flag) | e2e `atlas-fisiologia` | ✔ |
| E | Proxy RCSB/PubChem na Worker | Jest + e2e `atlas-moleculas` | ✔ |
| F | Verificação completa | ver §8 | ao fim |
| C1–C5 | Ferramenta do conselho, selos e filtros, fluxo e SLA, este documento | e2e `atlas-revisao` e `atlas-selos` | ✔ |
| M1–M5 | Usabilidade: abas do composto, estudo de via, teste de papel, descoberta, boot | ver §6 | M3 e M5 ✔; M1, M2 e M4 em andamento |

## 4. Gates
- **Técnicos (automáticos):**
  - `validate-curated`, `lint-pt` e os unitários de `scripts/atlas`;
  - Jest da Worker;
  - e2e `atlas*` + smoke/csp/apis;
  - `atlas-auditor`;
  - `check-curated-signed`, que barra no build ficha curada sem assinatura.
- **Humanos, por onda:** o conselho revisa 100% na ferramenta (5 dias úteis) e assina `revisao-onda-NN.md`. Depois do merge: 3 alunos, 1 aparelho real, NVDA e post-mortem em 7 dias.

## 5. Riscos
| Risco | Prob. | Impacto | Mitigação | Contingência |
|---|---|---|---|---|
| Conselho não usa a ferramenta | média | alto | HTML simples, sem login, progresso salvo | revisão pelo .md |
| Conselho atrasa > 4 semanas | média | alto | calendário do guia (§3) | pausa do projeto |
| Boot > 12 s | baixa | alto | fichas sob demanda (já testado) | dividir os arquivos curados |
| Visão sistêmica não é entendida | alta | médio | flag desligada + teste de papel | retirar no PR 3.3 |
| Aluno não percebe as fichas revisadas | alta | alto | selos, filtro, busca, chip "Novo" (M4) | onboarding |
| Agente falha ao aplicar correções (429) | média | médio | relançar | a sessão principal aplica |
| Conselho reprova uma onda inteira | baixa | alto | revisão técnica prévia por onda | refazer a onda |

## 6. Usabilidade por público
- **Conselho:** ferramenta de revisão → .md assinado → commit. Guia com prazos.
- **Aluno:**
  - selos ✓/⏳/○;
  - filtro e busca por status;
  - Farmacologia: [Compostos] [Cenários]; no composto, [PK/PD] [Clínica] [Interações] (M1);
  - estudo de via passo a passo, com barra de progresso e "Salvar no Meu Estudo" (M2).
- **Manutenção:** `review-status.json` gerado com teste de frescor, `pacote-onda.mjs`, `atlas-rollback.md` e este plano.

## 7. Cronograma
Uma onda a cada 1–2 semanas, ditado pelo prazo do conselho, num total de cerca de 14 semanas até a onda 10. O código do PR 3.2 fica pronto antes: o PR fica aberto e recebe a `main` por merge.

## 8. Definição de pronto
- **Por onda:** validador e lint verdes · conselho revisou 100% na ferramenta · `revisao-onda-NN.md` assinado · commit da onda · 3 alunos · post-mortem.
- **PR 3.2:**
  - 10 ondas assinadas;
  - 30 compostos v2;
  - processos e vias com fontes;
  - proxy em produção e `atlas-prod-check` verde;
  - bundle < 2 MB e boot < 12 s em Fast 3G;
  - 3 alunos, aparelho e NVDA;
  - post-mortem em 7 dias.

## 9. Comunicação
- Conselho: pacote da onda + link da ferramenta + guia; lembretes conforme o guia (§3).
- PR 3.2: checklist da definição de pronto e itens humanos no corpo; status atualizado a cada onda.
