# Atlas v2 — ponto de parada (pausa por limite de uso)

Plano completo: `docs/ATLAS_UX_SPEC.md` (UX) e o plano aprovado (cópia das
decisões abaixo). Branch: `claude/optimistic-babbage-3pm2em`. O atlas atual
(`modulos/anatomia-3d/index.html`) continua funcionando; a versão nova é
montada em `v2.html` e só substitui a antiga na integração (WP13).

## Decisões do usuário
- Licenças: HRA (CC BY) + Z-Anatomy (CC BY-SA 4.0), com tela de créditos.
- Recursos extras viram **modos** dentro do atlas (corpo 3D sempre visível).
- Tema segue a plataforma (claro/escuro).
- Células: fichas ricas (ASCT+B/Cell Ontology); 3D celular fica para depois.
- Custo: blocos pequenos no **Haiku** com API exata + teste; Sonnet só para
  integração e QA final; Opus orquestra, revisa e faz commit.

## Pronto (commitado, com teste passando)
| Bloco | Arquivos |
|---|---|
| WP01 especificação/contratos | `docs/ATLAS_UX_SPEC.md`, `js/core/*`, `css/tokens-atlas.css` |
| WP02 esquemas/fixtures/validador | `data/atlas/schema`, `data/atlas/fixtures`, `scripts/atlas/{make-fixtures,validate-content}*` |
| WP03 three.js r186 local | `vendor/three`, `scripts/atlas/vendor-three.js` |
| H1 câmera (matemática) | `js/engine/camera-math.js` |
| H2 qualidade adaptativa | `js/engine/quality.js` |
| H3 gestos | `js/engine/gestures.js` |
| H4 renderização sob demanda | `js/engine/renderer.js` |
| H4b câmera animada/painel | `js/engine/camera-rig.js` |
| H5 controles | `js/engine/controls.js` |
| H6 camadas/isolar/fantasma | `js/engine/visibility.js` |
| H7 raio-X e corte | `js/engine/xray-clip.js` |
| H8 rótulos | `js/engine/labels.js`, `css/labels.css` |
| H9 seleção | `js/engine/selection.js` |
| H10 busca | `js/ui/search-index.js` |
| H12 ficha da estrutura | `js/ui/infocard.js`, `css/infocard.css` |
| H13 painel de camadas | `js/ui/layers-panel.js`, `css/layers-panel.css` |
| H16 modo Quiz | `js/modes/quiz.js`, `data/atlas/quiz-cases.json` |
| H17 vias/processos | `data/atlas/{routes,processes,legacy-id-map}.json` |
| H18 fichas dos 72 órgãos | `data/atlas/legacy/` |

Testes unitários: `node frontend/scripts/atlas/<nome>.test.mjs` (todos saem 0).

## Estado em 27/09 (após a 2ª retomada) — último commit `7d286a4`
- **Etapa A fechada:** WP05, WP08 (casca responsiva, painel com encaixe A7,
  foco por setas na TV alcançando o canvas A8), H11, H14, H15, H19.
  `atlas-responsive` e `smoke` verdes.
- **Etapa B fechada:** H20 Farmacologia, H21 Moléculas, H22 Meu estudo, H23 busca.
- **Etapa C (scripts) pronta:** `tools/atlas-content/` (Wikidata, Wikipédia PT,
  ASCT+B, montador + reconciliação de sids), `npm test` verde.
- **WP10 (modelos 3D no CI):** total caiu de 78,4 → 48,45 MB (run #16) sem
  passar do teto de fidelidade (error ≤0,05 LOD0 / ≤0,15 LOD1). Falta: não
  publicar LOD1 quando ele tem ≥80% do LOD0 (o carregador já cai no LOD0) e
  rebalancear os orçamentos por arquivo em `budgets.json` mantendo o total de
  45 MiB; depois `commit: true`. Retomar por `tools/atlas-pipeline/run-config.json`
  e `SOURCES.md` §8e–§8j.
- **Também pronto:** `docs/ATLAS_CONTENT_POLICY.md`, `data/atlas/glossario-pt.json`
  + `scripts/atlas/lint-pt.mjs` (0 anglicismos no conteúdo atual).

## Próximos passos ao retomar (ordem)
1. WP10: caber em 45 MB → `commit: true` (modelos, manifest, LICENSES,
   `data/atlas/generated/structures.json`) e `SOURCES.md`.
2. Sonnet: `.github/workflows/atlas-content.yml` (URLs reais das tabelas
   ASCT+B por órgão; Wikidata → Wikipédia PT → ASCT+B → montador → validador).
3. WP13 integração (Sonnet): `js/main.js`, `js/compat/legacy-api.js`,
   `v2.html` → `index.html`, remover código antigo e `bio-database.js`, CSP enxuta.
4. WP14 E2E (Haiku): `atlas-flow`, `atlas-perf`, atualizar `atlas.e2e.js`/`csp.e2e.js`.
5. QA revisor final (Sonnet) + auditoria PT (Haiku) + `npm run e2e` completo → PR.

⚠️ Antes de qualquer merge na `main`: rodar `cd frontend && npm run e2e`.
