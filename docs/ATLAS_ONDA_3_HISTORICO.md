# Atlas 3D — Onda 3: histórico (append-only)

Registro de decisões, situações e respostas às revisões. O plano em vigor fica em [ATLAS_ONDA_3_PLANO.md](ATLAS_ONDA_3_PLANO.md). Não se apaga nada daqui: só se acrescenta.

## 02/10/2026 — PR 3.0 (correções críticas)
- Os 10 "crimes" da Prova de Fogo foram reproduzidos. Os principais:
  - C2: toque não abria estrutura, porque `registry.pick` era chamado sem câmera;
  - C1/C6: duas listas de ações;
  - C3: nomes repetidos;
  - C5: rótulos empilhados;
  - C7: painel de camadas atrás do canvas.
- PR #10 (hotfix C2, C1, C6) e PR #11 (restante) mesclados. O post-mortem está em `docs/atlas-qa/post-mortem-pr-3-0.md`.

## 02/10/2026 — PR 3.1 (nomes, lista e UX base)
- Os 1.382 nomes foram traduzidos para PT em 20 lotes (prompt v3, revisão cruzada, 94 correções).
- `prioridades.json` com 300 estruturas, Voltar/Anterior/Próxima e "Ouvir".
- `.glb.gz` reduziu o boot para 9,2–9,4 s em HTTP/2.
- PR #12 mesclado. O post-mortem está em `docs/atlas-qa/post-mortem-pr-3-1.md`.

## 02/10/2026 — PR 3.2: decisões
- **Formato do PR:** PR único com commits por bloco ("Um PR só", decisão do usuário). O plano v2.0 do usuário foi adotado.
- **CSP:** sem RCSB e PubChem e sem chamada direta. Se a Worker falhar, a tela mostra "Serviço de moléculas indisponível" e "Tentar de novo" (decisão do usuário).
- **Gates 0.2 e 0.3:** o usuário informou que o conselho já concordou. A declaração formal segue pendente de assinatura em `ata-revisao-3-2.md`.
- **Cotas:** o modelo tem só 31 estruturas cardiovasculares distintas, então cardiovascular passou de 36 para 31 e nervoso de 48 para 53. Está registrado em `cotas.md` ("Alterações pós-aprovação"), pendente de assinatura.
- **Respostas à revisão do usuário (C1–C3, O1–O3):**
  - C1, determinismo: confirmado, SHA-256 `7c9645db…6676`.
  - C2: o post-mortem 3.1 existe.
  - C3: a declaração do conselho foi escrita para assinatura. Não foi presumida.
  - O1: tabela "Alterações pós-aprovação" em `cotas.md`.
  - O2: `check-curated-signed` no build + teste de isolamento de `pendente/`.
  - O3: precedência ZA × HRA com `sourceOfName`.

## 02/10/2026 — PR 3.2: execução
- Bloco A (`6c35ea2`) e B1 (`d21674d`).
- Onda 01: 31 fichas pelo `atlas-curador`; revisão técnica prévia com 25 correções (1 de gravidade alta), todas aplicadas (`47a74b7`).
- Bloco E, proxy (`71ffd5d`). O auditor apontou 2 "críticos", que eram falsos positivos (`LaiftDom` global).
- Bloco C:
  - motor PK/PD (`71ffd5d`);
  - aba Clínica com a crise colinérgica (`06ee4c9`).
- Bloco D: timeline, estudo de via e visão sistêmica (`5b8e71f`).
  - De passagem, corrigido: no celular, avançar no estudo recolhia o painel.
  - A11y: contraste dos controles (`6f2aeaf`).
- Agentes de aplicação interrompidos por limite de uso (429) duas vezes. Relançados sem perda, porque os arquivos só são gravados no fim.
- Revisões técnicas prévias:
  - compostos: 2 de gravidade alta (atropina/neostigmina; flip-flop do AAS);
  - processos e vias: 1 de gravidade alta (CID D72.0 → D71).
  - Tudo aplicado (`295e03a`) e integrado (`bb22708`).

## 02/10/2026 — Revisão final do usuário (plano v3.0)
- Adotada, com ajustes por fatos do código:
  - M2 e M3 já existiam;
  - selos da ficha já existiam;
  - o gate da ficha não assinada foi mantido;
  - a ferramenta não publica fichas pendentes;
  - as fichas já ficavam fora do boot.
- C1, ferramenta de revisão (`295e03a`). C2:
  - selos, filtro e busca (`47da519`);
  - de passagem, corrigido o painel PK/PD, que ficava dentro do botão da aba.
- C3, C4 e M3: guia e flag `systemic` (`d9c5ad6`). C5: este documento e o plano v3.0.

## 02/10/2026 — Plano v4.0 (3 lotes, 3 gates, 4 semanas)
- Adotado por decisão do usuário: 3 lotes (104, 60 e 136 fichas), checklist em markdown por lote, SLA de 3 dias, escalação em 1 semana e teto de 6 semanas.
- Ajustes por fatos do código:
  - os números corretos somam 300 (lote 1 = 104, não 99);
  - a regra dos 90% publica só as fichas aprovadas. Ficha sem marca só entra com "aprovação em bloco" explícita, porque o selo "Revisado por" não pode ser inventado;
  - a ferramenta C1 e o `review-status` já estavam prontos: ficam no código, como opcionais.
- Ferramentas novas: `pacote-lote.mjs`, `checklist-lote.mjs` e a trava `check-curated-signed` por ficha. O backlog está em `docs/atlas-backlog.md`.

## 03/10/2026 — Onda 3.5 e fim da preparação dos lotes
- PR #13 mesclado (lote 1, 104 fichas, na pasta de pendentes). Os agentes do dia seguinte pararam no limite de uso; retomados sem perda.
- 300 fichas escritas. Revisão técnica prévia nos lotes 1 e 2 (todas as correções aplicadas); lote 3 sem revisão prévia, com pontos de atenção para o conselho (plano v4.0, ajuste de custo pedido pelo usuário).
- Quiz: 50 casos (lote 4a) em `docs/atlas-conteudo/quiz/pendente/`, com a mesma trava dos checklists.
- Onda 3.5 entregue em código: A.1 offline, A.2 telemetria, A.3 persistência, B.2 quiz, C favoritos/compartilhar/resumo, D.1 sem CDN, D.2 conselho plural, D.3 "O que mudou". Itens humanos: migração 014 e deploy da Worker (para ligar a telemetria), teste em aparelho real, 3 revisores titulares, 3 alunos e post-mortem.
- O `index.html` da plataforma (fora do atlas) ainda carrega Chart.js do jsDelivr para seus próprios painéis: fora do escopo desta onda.
