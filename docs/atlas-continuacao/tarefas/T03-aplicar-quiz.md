# T03 — Script que aplica os casos de quiz aprovados
**Quem faz:** outro chat · **Depende de:** T02 (copiar o padrão) · **Estimativa:** 2 h

## Objetivo
Levar os casos `q4a-*` aprovados no checklist do lote 4a para o quiz do atlas.

## Arquivos
- `frontend/scripts/atlas/aplicar-quiz.mjs` (novo) — uso: `node scripts/atlas/aplicar-quiz.mjs [--dry]`.
- `frontend/scripts/atlas/aplicar-quiz.test.mjs` (novo).
- Reaproveitar: `frontend/scripts/atlas/checklist-lote.mjs` (`parseChecklist`, `QUIZ_LOTE`), padrão de `aplicar-lote.mjs` (T02).
- Entradas: `docs/atlas-conteudo/revisao-lote-4a.md` (assinado), `docs/atlas-conteudo/quiz/pendente/lote-4a-*.json`.
- Saída: `frontend/modulos/anatomia-3d/data/atlas/quiz-cases.json` (acrescenta os casos aprovados ao fim, sem mexer nos 8 existentes).
- Schema: `frontend/modulos/anatomia-3d/data/atlas/schema/quiz-cases.schema.json`.

## Como fazer
1. Recusar se o checklist não estiver assinado ou se `lote !== '4a'`.
2. Juntar os casos dos 5 arquivos `lote-4a-*.json`; manter só os de `approvedSids`.
3. Validar cada caso contra o schema (o `ajv` está em `frontend/node_modules`); casos inválidos: erro e nada é gravado.
4. Acrescentar ao `quiz-cases.json` sem duplicar `id`; manter a ordem do arquivo de origem.
5. Ressalvas: listar em `docs/atlas-conteudo/ressalvas-lote-4a.md` (novo) e deixar o caso de fora até `--incluir-ressalvas`.
6. A trava `check-curated-signed.mjs` já exige `revisao-lote-4a.md` assinado para qualquer caso fora de `QUIZ_BASE_IDS`; não mude isso.

## Não fazer
- Não edite o enunciado, a resposta nem a explicação dos casos. Não assine nada.

## Aceite
- [ ] Teste: só os aprovados entram; 2ª execução não duplica; checklist em branco é recusado.
- [ ] `node --test scripts/atlas/quiz-mode.test.mjs` e `quiz-select.test.mjs` passam com os casos novos.
- [ ] `bash docs/atlas-continuacao/validar.sh --e2e atlas-quiz` passa (o e2e usa filtros e conta casos: se a contagem mudar, atualizar o teste, não o código).

## Prompt pronto
Crie `frontend/scripts/atlas/aplicar-quiz.mjs` e o teste, seguindo `docs/atlas-continuacao/tarefas/T03-aplicar-quiz.md`. Use `parseChecklist` e `QUIZ_LOTE` de `checklist-lote.mjs`. Teste em pasta temporária. Não altere `quiz-cases.json` real. Rode `bash docs/atlas-continuacao/validar.sh` e mostre o resumo.
