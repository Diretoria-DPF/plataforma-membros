# T11 — "Conexões principais" no lugar de "Inervação" (sistema nervoso)
**Quem faz:** outro chat · **Depende de:** T00 · **Estimativa:** 2 h

## Objetivo
Nas fichas do encéfalo e da medula, o campo `anatomy.innervation` descreve **conexões** (aferências e eferências), não inervação. A tela deve rotular como "Conexões principais" quando a estrutura for do sistema nervoso central.

## Arquivos
- `frontend/modulos/anatomia-3d/js/ui/infocard.js` — onde os campos de anatomia ganham rótulo (procure `Inervação`).
- `frontend/scripts/atlas/peek.test.mjs` (ou um teste novo `infocard-labels.test.mjs`, novo) — teste do rótulo.
- `docs/atlas-backlog.md` — tirar o item "Conexões principais" da lista ao concluir.

## Como fazer
1. Em `infocard.js`, ao montar a seção de anatomia, escolha o rótulo conforme o sistema da entrada: `nervoso` e estrutura central (córtex, giros, sulcos, núcleos, medula, ventrículos, corpo caloso) → "Conexões principais"; nervos periféricos continuam "Inervação".
2. Regra simples e testável: função pura `labelInervacao(entry)` exportada; devolve "Conexões principais" se `entry.system === 'nervoso'` e a ficha **não** tem a palavra "nervo" no nome em português (`entry.names.pt`); senão "Inervação". Documente a regra num comentário curto.
3. Teste unitário com 4 exemplos: giro (conexões), medula (conexões), nervo vago (inervação), coração (inervação).

## Não fazer
- Não renomeie o campo `innervation` nos dados nem no schema.

## Aceite
- [ ] Teste com os 4 exemplos passa.
- [ ] `bash docs/atlas-continuacao/validar.sh --e2e atlas-ficha-nav` passa.

## Prompt pronto
Siga `docs/atlas-continuacao/tarefas/T11-conexoes-sistema-nervoso.md`: crie a função pura `labelInervacao(entry)` em `frontend/modulos/anatomia-3d/js/ui/infocard.js`, use-a no rótulo da seção e escreva o teste. Não mude dados nem schema. Rode `bash docs/atlas-continuacao/validar.sh --e2e atlas-ficha-nav` e mostre o resumo.
