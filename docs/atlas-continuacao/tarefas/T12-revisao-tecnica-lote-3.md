# T12 — (Opcional) Revisão técnica prévia do lote 3
**Quem faz:** Claude Code com o agente `atlas-revisor-editorial` · **Depende de:** nada · **Estimativa:** 6 h, em blocos

## Objetivo
O lote 3 (136 fichas: linfático, esquelético, muscular, articular) foi ao conselho **sem** revisão técnica prévia, por custo. Fazer essa revisão em blocos pequenos reduz o retrabalho do conselho. Só vale se houver orçamento.

## Arquivos
- `docs/atlas-conteudo/fichas/pendente/onda-07/lote-01.json`, `onda-08/lote-01.json` a `lote-04.json`, `onda-09/lote-01.json` e `lote-02.json`, `onda-10/lote-01.json` — as fichas (não editar à mão).
- `docs/atlas-conteudo/fichas/revisao-previa-onda-04.md` — modelo de como registrar (criar `revisao-previa-onda-0N.md` (novo) para cada onda revisada).
- `docs/atlas-conteudo/fichas/pontos-de-atencao-lote-3.md` — pontos que os curadores marcaram.
- `.claude/agents/atlas-revisor-editorial.md` — o agente.

## Como fazer
1. Um bloco por vez (≈ 20 fichas): `onda-08/lote-01.json`, depois `lote-02`, etc.
2. No Claude Code, peça ao agente `atlas-revisor-editorial` para revisar **um arquivo**, devolvendo uma tabela (sid, campo, problema, correção com o texto exato, gravidade). Ele não edita e não aprova.
3. Aplique as correções de gravidade alta e média por **substituição de texto exata** (um script pequeno `python3` ou `node` por arquivo é suficiente; confira cada troca) e rode `node scripts/atlas/validate-curated.mjs --file <arquivo>` e `node scripts/atlas/lint-pt.mjs <arquivo>` (em `frontend/`).
4. Registre o resultado em `docs/atlas-conteudo/fichas/revisao-previa-onda-0N.md` (novo) no formato do arquivo da onda 04.
5. Gere o pacote de novo (`node scripts/atlas/pacote-lote.mjs 3 <pasta> --revisao`) e reenvie ao conselho; ele inclui o `REVISAO-TECNICA-PREVIA.md`.

## Não fazer
- A revisão técnica **não é aprovação**. Não altere `docs/atlas-conteudo/revisao-lote-3.md`.

## Aceite
- [ ] Cada arquivo revisado passa em `validate-curated` e `lint-pt` (0 erros e 0 achados).
- [ ] Existe um `revisao-previa-onda-0N.md` por onda revisada, e o zip do lote 3 traz o arquivo consolidado.

## Prompt pronto (para o Claude Code)
Use o agente `atlas-revisor-editorial` para revisar `docs/atlas-conteudo/fichas/pendente/onda-08/lote-01.json` contra as obras de `frontend/modulos/anatomia-3d/data/atlas/fontes.json`. Não edite o arquivo. Devolva a tabela: sid | campo | problema | correção proposta (texto exato) | gravidade (alta/média/baixa; "alta" só erro factual). Termine com o veredito "pronta para o conselho" ou "precisa de correções". PT-BR, conciso.
