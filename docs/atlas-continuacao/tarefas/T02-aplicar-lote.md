# T02 — Script que aplica um lote assinado (fichas)
**Quem faz:** outro chat · **Depende de:** T00 · **Estimativa:** 4 h

## Objetivo
Quando o conselho devolver o checklist assinado de um lote, um comando coloca **só as fichas aprovadas** no atlas, sem edição manual de JSON.

## Arquivos
- `frontend/scripts/atlas/aplicar-lote.mjs` (novo) — o script. Uso: `node scripts/atlas/aplicar-lote.mjs <N> [--dry] [--incluir-ressalvas]`.
- `frontend/scripts/atlas/aplicar-lote.test.mjs` (novo) — testes.
- Reaproveitar (não reescrever): `frontend/scripts/atlas/checklist-lote.mjs` (`parseChecklist`, `LOTES`), `frontend/scripts/atlas/check-curated-signed.mjs` (`checkCuratedSigned`), `frontend/scripts/atlas/build-review-status.mjs`, `frontend/modulos/anatomia-3d/js/revisao/review-core.js` (`ONDAS`).
- Entradas: `docs/atlas-conteudo/revisao-lote-N.md` (assinado), `docs/atlas-conteudo/fichas/onda-NN.json` (itens com `sid` e `sids`), `docs/atlas-conteudo/fichas/pendente/onda-NN/lote-*.json` (as fichas).
- Saída: `frontend/modulos/anatomia-3d/data/atlas/curated/<sistema>.json` (uma chave por `sid`) e `docs/atlas-conteudo/ressalvas-lote-N.md` (novo).

## Como fazer
1. Ler `revisao-lote-N.md` com `parseChecklist`. **Recusar** (erro claro, código 1) se `signed` for falso ou se `lote` não for N.
2. Para cada onda de `LOTES[N]`: achar o sistema (`ONDAS[onda - 1]`), ler as fichas pendentes da onda e separar as que estão em `approvedSids` (aprovadas sem ressalva).
3. Para cada ficha aprovada, definir `review = { status: 'reviewed', by: <revisor do checklist>, date: <data do checklist> }` (trocando o `review` editorial; manter o resto da ficha como está) e gravar em `curated/<sistema>.json`, chave = `sid`, JSON com 2 espaços e quebra de linha no fim, chaves em ordem estável.
4. **Ressalvas:** fichas com "Aprovar com ressalva" **não entram** por padrão. Listar `sid` + texto da ressalva em `docs/atlas-conteudo/ressalvas-lote-N.md`. Depois que uma pessoa aplicar o texto na ficha pendente, rodar de novo com `--incluir-ressalvas`.
5. Reprovadas e sem marca nunca entram (a trava do build também barra).
6. `--dry` só imprime o que faria. Ao final (sem `--dry`), rodar `build-review-status.mjs` para regenerar `data/atlas/generated/review-status.json`.
7. Ser **idempotente**: rodar duas vezes dá o mesmo resultado. Não apagar fichas de outros lotes em `curated/`.

## Não fazer
- Não preencher assinatura, revisor, registro nem data por conta própria: tudo vem do checklist. Não mudar `check-curated-signed.mjs`.

## Aceite
- [ ] Teste: ficha aprovada entra com `review.status === 'reviewed'` e `by`/`date` do checklist.
- [ ] Teste: reprovada, sem marca e com ressalva ficam fora (a com ressalva aparece em `ressalvas-lote-N.md`).
- [ ] Teste: checklist em branco ou de outro lote é recusado; rodar 2× não muda nada.
- [ ] Depois de aplicar um lote de teste (em pasta temporária), `checkCuratedSigned` não acusa erro; sem o checklist, acusa.
- [ ] `node scripts/atlas/validate-curated.mjs` passa com as fichas aplicadas.

## Como validar
`bash docs/atlas-continuacao/validar.sh --e2e atlas-selos`

## Prompt pronto
Crie `frontend/scripts/atlas/aplicar-lote.mjs` e `frontend/scripts/atlas/aplicar-lote.test.mjs` seguindo, ponto a ponto, o cartão `docs/atlas-continuacao/tarefas/T02-aplicar-lote.md`. Reaproveite `parseChecklist`/`LOTES` de `checklist-lote.mjs` e `checkCuratedSigned` de `check-curated-signed.mjs`. Teste usando pastas temporárias (como em `checklist-lote.test.mjs`). Não toque em `docs/atlas-conteudo/fichas/pendente/` nem em `curated/` reais. Rode `bash docs/atlas-continuacao/validar.sh` e mostre o resumo.
