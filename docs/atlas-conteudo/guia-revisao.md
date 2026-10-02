# Guia de revisão do conselho editorial — Atlas 3D

Como uma onda de fichas sai de "pendente" e chega ao aluno. Vale para as 10 ondas do PR 3.2 (`canary.md`, `cotas.md`).

**Regra que não muda:** nenhuma ficha aparece para o aluno sem a assinatura do conselho. O build falha se alguém tentar (`frontend/scripts/atlas/check-curated-signed.mjs`).

## 1. Revisar uma onda (membro do conselho)
1. A coordenação do atlas envia o pacote da onda (`pacote-onda-NN.json`), gerado por `node frontend/scripts/atlas/pacote-onda.mjs NN`.
2. Abra a ferramenta no navegador: `…/modulos/anatomia-3d/revisao/` no site da plataforma.
   - Não precisa de login.
   - As fichas não saem do seu computador.
3. Clique em **Escolher arquivos** e selecione o pacote. Se preferir, arraste os `lote-*.json` da onda.
4. Para cada ficha, leia o resumo, a anatomia, a histologia, a clínica e as fontes. Depois marque uma opção:
   - **Aprovar**;
   - **Aprovar com ressalva** (escreva o que muda);
   - **Reprovar** (escreva o motivo).
   O progresso fica salvo no navegador: dá para parar e continuar depois, no mesmo computador e no mesmo navegador.
5. Com 100% das fichas marcadas, preencha nome, registro profissional e data e clique em **Assinar onda**. A ferramenta baixa `revisao-onda-NN.md`.
6. Envie esse arquivo à coordenação. Ele entra no repositório exatamente como saiu da ferramenta.
   - O arquivo traz o SHA-256 do conteúdo revisado. Se a ficha mudar depois da assinatura, a mudança aparece.

**Resultado da onda (automático):**
- todas aprovadas → `aprovado`;
- alguma ressalva → `aprovado com ressalvas`;
- alguma reprovada → `reprovado`.

## 2. Quem faz o quê, e em quanto tempo (C3)
| Etapa | Responsável | Prazo |
|---|---|---|
| Preparar a onda: curador, revisor técnico prévio, correções, validador e lint | Sessão do atlas (agentes `atlas-curador` e `atlas-revisor-editorial`) | antes do envio |
| Enviar o pacote e avisar o conselho | Coordenação do atlas | mesmo dia |
| Revisar a onda na ferramenta | Membro do conselho | 5 dias úteis |
| Pedir mudança (ressalva ou reprovação) | Membro do conselho | na própria revisão |
| Aplicar as mudanças pedidas | `atlas-curador` (sessão do atlas) | 2 h depois de receber o .md |
| Conferir as mudanças aplicadas | Membro do conselho | 1 dia útil |
| Assinar (nova revisão, só das fichas alteradas) | Membro do conselho | imediato |
| Commit da onda em `curated/` com `review.status: "reviewed"`, `by` e `date` do conselho | Sessão do atlas | mesmo dia |

- **Com ressalvas:** a sessão aplica as ressalvas e o revisor confere só as fichas que mudaram. Gere um pacote menor com essas fichas.
- **Reprovado:** a onda volta inteira para as fichas pendentes. O curador refaz as reprovadas e aplica as ressalvas, o revisor técnico confere, e a onda volta ao conselho como nova revisão.

## 3. Se a assinatura atrasar (C4)
A contagem começa no envio da onda ao conselho.

| Semana | O que acontece |
|---|---|
| 1 | Onda enviada e conselho avisado. |
| 2 | Lembrete. A onda seguinte continua sendo preparada em pendente. |
| 3 | Segundo lembrete. A preparação da onda seguinte pausa. |
| 4 | Escalação para a coordenação do conselho. Nenhuma onda nova começa. |
| 8 | Projeto pausado: nenhuma onda nova é preparada. O conselho é avisado de que o conteúdo editorial visível sem revisão será retirado em 30 dias. |

O conteúdo editorial visível (selo amarelo "⏳ Em revisão editorial") é formado pelos compostos, processos, vias e cenários. Ficha anatômica sem assinatura nunca fica visível. A ficha mostra "Aguardando revisão há N dias" a partir de 30 dias.

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
