# Guia de revisão do conselho editorial — Atlas 3D

Como uma onda de fichas sai de "pendente" e chega ao aluno. Vale para os 3 lotes do plano v4.0 (`cotas.md`).

**Regra que não muda:** nenhuma ficha aparece para o aluno sem a assinatura do conselho. O build falha se alguém tentar (`frontend/scripts/atlas/check-curated-signed.mjs`).

## 1. Revisar um lote (plano v4.0)
As 300 fichas vão ao conselho em 3 lotes:

| Lote | Sistemas | Fichas |
|---|---|---|
| 1 | Cardiovascular (31), Nervoso (53), Respiratório (20) | 104 |
| 2 | Digestório (40), Urinário (15), Endócrino (5) | 60 |
| 3 | Linfático (10), Esquelético (80), Muscular (40), Articular (6) | 136 |

1. A coordenação envia `lote-N.zip`, gerado por `node frontend/scripts/atlas/pacote-lote.mjs N <pasta> --revisao`. O zip contém:
   - `LEIA-ME.md`;
   - `checklist.md`;
   - `fichas/<sistema>.json`;
   - `fontes.json`.
2. O revisor lê as fichas e marca `[x]` em uma opção por ficha no `checklist.md`: Aprovar, Aprovar com ressalva (com o texto da troca) ou Reprovar (com o motivo).
   - Se leu tudo e está tudo certo, pode marcar **Aprovação em bloco**, que vale para as fichas que não marcou.
3. Preenche Revisor, Registro profissional e Data e devolve o `checklist.md`.
4. A sessão commita o arquivo **exatamente como recebido** em `docs/atlas-conteudo/revisao-lote-N.md`. Confira com `node frontend/scripts/atlas/checklist-lote.mjs docs/atlas-conteudo/revisao-lote-N.md`.

**Regra dos 90%:** o lote é aprovado com 90% ou mais das fichas aprovadas, com ou sem ressalva.
- Só as fichas aprovadas vão ao ar.
- Uma ficha reprovada, ou sem marca e sem aprovação em bloco, nunca entra. A trava do build confere ficha a ficha.
- Ressalva com texto literal: a sessão aplica e a ficha entra, com a lista no PR. Ressalva ambígua: a ficha volta na rodada seguinte.
- Reprovadas: o curador refaz, o revisor técnico confere, e a ficha volta no checklist da rodada seguinte.

**Opcional:** a ferramenta `…/modulos/anatomia-3d/revisao/` faz a mesma revisão no navegador e gera `revisao-onda-NN.md`, também aceito pela trava.

## 2. Quem faz o quê, e em quanto tempo
| Etapa | Responsável | Prazo |
|---|---|---|
| Preparar o lote: curador, revisor técnico, correções, validador e lint | Sessão do atlas | antes do envio |
| Enviar o zip e avisar o conselho | Coordenação | mesmo dia |
| Revisar e devolver o checklist | Conselho | **3 dias** |
| Aplicar as ressalvas e copiar as aprovadas para `curated/` | Sessão do atlas | mesmo dia |
| Merge do lote | Usuário autoriza | imediato |

## 2b. Conselho plural (3 revisores)
A revisão de cada lote não depende de uma só pessoa.
- **Titulares:** 3 revisores do conselho, nomeados pela coordenação do conselho (nomes e registros no topo deste arquivo, na ata `ata-revisao-3-2.md`).
- **Rodízio:** cada lote tem um revisor principal. O 1º lote vai ao titular A, o 2º ao B, o 3º ao C, e depois repete. Os outros dois são suplentes daquele lote.
- **SLA por pessoa:** 3 dias para devolver o checklist. Sem retorno em 3 dias, o lote passa ao suplente seguinte e o titular é avisado. O prazo é contado a partir do envio.
- **Dois lados:** o suplente também pode revisar em paralelo se o lote tiver mais de 100 fichas (lote 3); cada checklist cobre um intervalo de fichas combinado com a coordenação, e a trava do build confere ficha a ficha.
- **Ausência:** quem vai se ausentar avisa a coordenação com antecedência, e o rodízio pula a pessoa.
- **Pendente (humano):** nomear os 3 titulares e registrar a assinatura da coordenação neste item. Enquanto isso, vale o revisor único de cada lote.

## 3. Se a assinatura atrasar
| Prazo | O que acontece |
|---|---|
| 3 dias | Lembrete |
| 1 semana | Escalação para a coordenação do conselho |
| 6 semanas | Teto: o lote 3 pausa, os lotes 1 e 2 são mesclados, e o lote 3 é revisado com calma |

O conteúdo editorial visível (selo amarelo "⏳ Em revisão editorial") é formado pelos compostos, processos, vias e cenários. Ficha anatômica sem assinatura nunca fica visível.

## 4. O que o aluno vê
| Selo | Quando |
|---|---|
| ✓ Revisado por *nome* em *data* | Ficha assinada pelo conselho (`curated/`, `reviewed`) |
| ⏳ Em revisão editorial | Conteúdo editorial publicado, aguardando o conselho |
| ○ Conteúdo antigo · sem revisão | Base antiga migrada |
| ○ Gerado automaticamente · não revisado | Gerado por script de fontes abertas |

- **Navegador:** filtros [Todas] [Revisadas] [Em revisão], com as revisadas primeiro.
- **Busca:** com o mesmo casamento de nome, a ficha revisada vem antes.

## 5. Teste de papel da "visão sistêmica" (M3, item humano)
A visão sistêmica (grafo dos processos) está desligada por padrão (flag `systemic`) até este teste.

1. Imprima o grafo e a lista ao lado, ou mostre a tela com `?flags=systemic`.
2. Mostre a 3 alunos, um de cada vez, sem explicar nada. Pergunte: "O que você entende disso? O que acontece se tocar num ponto?"
3. Anote as respostas em `docs/atlas-qa/teste-papel-visao-sistemica.md`.
4. Decida:
   - 3 de 3 entendem → liga a flag no PR 3.3;
   - 2 ou mais não entendem → simplifica ou retira no PR 3.3.

## 6. Itens que só o conselho decide
- Confirmar no CID-10 (Volume 1) os códigos D68.5, G70.8 e D68.4/D68.3 (processos).
- Músculos papilares do modelo sem ventrículo (onda 01): confirmar a atribuição ao VD, que hoje é inferência por posição.
- Obra `airton` em `fontes.json`, marcada `confirmar: true`: autor e edição.
