# T07 — Boot em Fast 3G abaixo de 12 s
**Quem faz:** outro chat · **Depende de:** T00 · **Estimativa:** 6 h (medir antes de mexer)

## Objetivo
O e2e mediu 12,8 s até o esqueleto ficar tocável em 390×844 com "Fast 3G"; a meta do plano é < 12 s. Descobrir se isso piorou na Onda 3.5 e recuperar.

## Arquivos
- `frontend/scripts/e2e/atlas-perf.e2e.js` — mede o boot (preset Fast 3G; hoje aceita até 15 s em `BUDGET_3G_INTERACTIVE_MS`).
- `frontend/modulos/anatomia-3d/index.html` — preloads (esqueleto `.lod1.glb.gz`, manifest, JSON de boot, `main.js`, three).
- `frontend/modulos/anatomia-3d/js/main.js` — ordem do `boot()`; `registerOffline` e `createTelemetry` rodam no fim, depois do `atlas:ready`.
- `frontend/modulos/anatomia-3d/js/engine/assets.js` — carga e descompressão dos modelos.
- `frontend/scripts/build.js` — compressão `.glb.gz`.

## Como fazer
1. **Linha de base:** em outra pasta, `git worktree add /tmp/base origin/main~N` (o commit antes da Onda 3.5, `0881336`, já é o merge do PR #13) e rode `node scripts/build.js && node scripts/e2e/run.js atlas-perf` lá. Anote o tempo de Fast 3G.
2. Rode o mesmo na `main` atual (3 vezes cada, use a mediana: a medida varia ±1 s).
3. Se a Onda 3.5 piorou: o suspeito é o precache do Service Worker competindo com o boot. Confirme com `?flags=-offline` e mantenha o registro **depois** de `atlas:ready` (já é assim) ou adie para `requestIdleCallback`/`load + 3 s` em `js/core/offline.js`.
4. Se já era assim antes: procure ganhos em `index.html` (preload do que o boot pede primeiro) e em `main.js` (adiar o que não é necessário para o esqueleto aparecer). Cada ganho com medição antes e depois.
5. Só então baixe o orçamento do e2e para 12 s.

## Não fazer
- Não tire o esqueleto nem a camada de seleção do boot. Não remova o `.glb.gz`.

## Aceite
- [ ] Mediana de Fast 3G < 12 s em 390×844 (ou relatório mostrando que a linha de base já era > 12 s, com a causa).
- [ ] `bash docs/atlas-continuacao/validar.sh --e2e atlas-perf` passa.

## Prompt pronto
Siga `docs/atlas-continuacao/tarefas/T07-boot-fast-3g.md`: meça primeiro a linha de base (commit `0881336`) e a `main` atual com `atlas-perf` (3 execuções cada, mediana) e me mostre a tabela antes de alterar qualquer arquivo.
