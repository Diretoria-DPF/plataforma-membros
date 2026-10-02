# Regras dos casos de quiz do Atlas 3D

Arquivo: `frontend/modulos/anatomia-3d/data/atlas/quiz-cases.json` (schema em `data/atlas/schema/quiz-cases.schema.json`). O `validate-content.mjs` cobra as regras marcadas com ✔.

## Resposta
- ✔ `correctSid`: a malha principal (nomeia a resposta no feedback). Precisa existir em `data/atlas/generated/structures.json`.
- ✔ `correctSids`: **todas** as malhas que contam como acerto — o aluno toca uma parte do órgão (ex.: coração = átrios, ventrículos, valvas, músculos papilares, inclusive as malhas HRA `za:vh-*`). Lados: inclua os dois quando o lado não importa.
- ✔ `correctSystem`: só para perguntas do tipo "aponte um músculo esquelético" — qualquer estrutura do sistema conta.
- O sistema da resposta é carregado e a camada ligada antes da pergunta; a câmera não se move (não entrega a resposta).

## Distratores
- ✔ 3 sids reais (malhas de `structures.json`).
- ✔ Nenhum distrator pode contar como acerto (estar em `correctSids` ou, com `correctSystem`, ser do mesmo sistema).
- Plausíveis: mesma região do corpo ou mesma função, mas **outro órgão** (ex.: coração → lobo pulmonar, traqueia, estômago).

## Texto
- `prompt_pt`: vinheta clínica de 2–4 frases que leva a uma única estrutura tocável.
- `explanation_pt`: 2–3 frases com o porquê (aparece no feedback de acerto e de erro).
- `difficulty`: `facil` | `medio` | `dificil` — meta por sistema 40/40/20.
- ✔ `id` único, em kebab-case, prefixo `caso-`.
- Fatos de nível de livro-texto (Moore, Gray's, Guyton); sem fontes inventadas.
