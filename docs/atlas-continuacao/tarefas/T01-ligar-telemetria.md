# T01 — Ligar a telemetria anônima do atlas
**Quem faz:** você (Neon e deploy) + outro chat (1 linha de código) · **Depende de:** T00 · **Estimativa:** 1 h

## Objetivo
Passar a coletar o uso anônimo do atlas (6 eventos) e vê-lo no painel Admin > IA > "Atlas 3D — uso anônimo".

## Arquivos
- `sql/014_atlas_telemetry.sql` — migração (já pronta; **você** aplica no Neon).
- `docs/DEPLOYMENT.md` — como aplicar migrações e fazer o deploy da Worker.
- `frontend/modulos/anatomia-3d/js/core/flags.js` — trocar `telemetry: false` por `telemetry: true`.
- `frontend/scripts/atlas/progress-bar.test.mjs` — na linha `const EXPERIMENTAL = ['systemic', 'telemetry'];` remover `'telemetry'`.
- `docs/atlas-rollback.md` — §6 já explica como desligar (conferir).

## Como fazer
1. No Neon, crie um **branch temporário**, rode o conteúdo de `sql/014_atlas_telemetry.sql` e confira: `SELECT count(*) FROM atlas_telemetry;` (deve dar 0). Só então aplique em produção (com a sua confirmação).
2. Faça o deploy da Worker (passos em `docs/DEPLOYMENT.md`). A Worker já tem as ações `apiLearnAtlasTelemetry` e `apiAdminLearnAtlasTelemetry`.
3. **Teste antes de ligar para todos:** abra o atlas com `?flags=telemetry` na URL, navegue, feche a aba e confira no painel Admin > IA que os eventos aparecem.
4. Só depois, num PR de 2 linhas, ligue a chave em `flags.js` e ajuste o teste de flags como descrito acima.

## Não fazer
- Não coloque `profile_id`, e-mail, IP nem texto de busca na telemetria. Não aumente a retenção (90 dias).

## Aceite
- [ ] Painel mostra contagens de `app_open` e `structure_view` depois de usar o atlas.
- [ ] `grep -n "telemetry" frontend/modulos/anatomia-3d/js/core/flags.js` mostra `true`.
- [ ] `bash docs/atlas-continuacao/validar.sh` passa (o teste de flags precisa estar atualizado).

## Como validar
`bash docs/atlas-continuacao/validar.sh --e2e atlas-fundacao`

## Prompt pronto
Troque a flag `telemetry` para `true` em `frontend/modulos/anatomia-3d/js/core/flags.js` e remova `'telemetry'` da lista `EXPERIMENTAL` em `frontend/scripts/atlas/progress-bar.test.mjs`. Não mude mais nada. Rode `bash docs/atlas-continuacao/validar.sh --e2e atlas-fundacao` e mostre o resumo.
