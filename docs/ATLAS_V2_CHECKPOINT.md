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

## Rascunho (commit WIP — interrompido no meio, PRECISA revisar/terminar)
| Bloco | Estado quando parou | Arquivos |
|---|---|---|
| WP05 carregador/registro (Sonnet) | testes próprios passando; faltava rodar a suíte completa | `js/engine/{assets,registry,fallback}.js`, `dev/assets-harness.*`, `scripts/e2e/atlas-assets.e2e.js`, 1 linha em `scripts/e2e/harness.js` |
| WP08 casca responsiva (Sonnet) | código pronto; faltava rodar `atlas-responsive`, `smoke`, `qa-full` | `v2.html`, `css/atlas.css`, `js/ui/{shell,sheet,focus-nav,v2-entry}.js`, `scripts/e2e/atlas-responsive.e2e.js`, **modo imersivo em `frontend/learning.js` e `frontend/styles.css`** |
| WP10 pipeline 3D no CI (Sonnet) | coleções reais do `Startup.blend` confirmadas; ia rodar a 1ª exportação de teste | `tools/atlas-pipeline/**` (já commitado pelo agente), `systems-map.json` |
| H11 navegador | código pronto; faltava teste no navegador | `js/ui/navigator.js`, `css/navigator.css`, `dev/navigator-demo.*` |
| H14 barra/menu de contexto | código pronto; faltava teste no navegador | `js/ui/{toolbar,context-menu}.js`, `css/toolbar.css`, `dev/toolbar-demo.*` |
| H15 créditos | parcial | `js/ui/credits.js`, `css/credits.css`, `scripts/atlas/credits.test.mjs`, `dev/credits-demo.*` |
| H19 Fisiologia & Vias | não chegou a gravar arquivos | — |

⚠️ Antes de qualquer merge na `main`: rodar `cd frontend && npm run e2e`. As
suítes WIP (`atlas-assets`, `atlas-responsive`) podem falhar até serem
terminadas, e a mudança do host (`learning.js`/`styles.css`) precisa passar
em `smoke` e `qa-full`.

## Próximos passos ao retomar (ordem)
1. Revisar e terminar os WIP acima (Haiku para H11/H14/H15; Sonnet curto para
   WP05/WP08; retomar WP10 no CI: `tools/atlas-pipeline/run-config.json`).
2. Haiku: H19 (Fisiologia & Vias), H20 Farmacologia (reaproveita `pk-engine.js`),
   H21 Moléculas (`mol-engine.js`), H22 Meu estudo (`api-cache.js`).
3. WP11 conteúdo PT no CI (Wikidata, Wikipedia PT, ASCT+B) — depois do WP10
   gerar `data/atlas/generated/structures.json`.
4. WP13 integração (Sonnet): `js/main.js`, `js/compat/legacy-api.js`, trocar
   `v2.html` → `index.html`, remover código antigo, CSP enxuta.
5. WP14 E2E + WP15 desempenho/acessibilidade + QA revisor final (Sonnet).
6. PR para a `main`.
