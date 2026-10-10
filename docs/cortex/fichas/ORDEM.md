# Ordem de execução · Biblioteca LAIFT, lotes B1 e B2 (v1, 2026-10-10)

Disparo (sessão principal): **"Leia `docs/cortex/fichas/<id>.md` na branch `feat/cortex-biblioteca` e execute."** Contratos: `docs/cortex/CONTRATO-B1.md`
(dados e API) e `docs/cortex/CONTRATO-B2.md` (telas). No máximo **1 Sonnet e 5 Haiku ao mesmo tempo**; subagente não cria subagente.

## Ondas
| Onda | Sonnet | Haiku (em paralelo, arquivos disjuntos) | Antes de começar |
|---|---|---|---|
| 1 | B1-S1 migração | B1-H1 identificadores · B1-H2 normalização · B1-H3 transições e limites · B2-H1 citação · B2-H4 instantâneo na CI | contratos na branch |
| 2 | B1-S2 cliente de metadados | B2-H2 gerador público · B2-H3 filtro e estilo da página · B2-H5 painel · B2-H6 ficha · B2-H10 docs | onda 1 integrada |
| 3 | B1-S3 serviço do membro | B2-H7 admin: artigos · B2-H8 admin: sugestões, coleções, áreas, equipe | onda 2 integrada |
| 4 | B1-S4 serviço de curadoria | — | S1, S2, H1-H3 |
| 5 | B1-S5 sugestões, coleções, áreas, equipe → **B1-I** (sessão principal) | — | S4 |
| 6 | **B2-I** (sessão principal) → B2-H9 e2e → portão visual → staging | — | B1-I verde |

## Donos de arquivo (nenhum arquivo em duas fichas)
| Ficha | Modelo | Arquivos |
|---|---|---|
| B1-S1 | Sonnet | `sql/029_library.sql`, `sql/down/029_library.sql`, `worker/test/libraryMigration.test.js` |
| B1-H1 | Haiku | `worker/src/library/identifiers.js`, `worker/test/libraryIdentifiers.test.js` |
| B1-H2 | Haiku | `worker/src/library/normalize.js`, `worker/test/libraryNormalize.test.js` |
| B1-H3 | Haiku | `worker/src/library/transitions.js`, `worker/src/library/limits.js`, `worker/test/libraryTransitions.test.js` |
| B1-S2 | Sonnet | `worker/src/library/metadataClient.js`, `worker/test/libraryMetadataClient.test.js`, `worker/test/fixtures/library-upstream.json` |
| B1-S3 | Sonnet | `worker/src/services/libraryService.js`, `worker/test/libraryService.test.js` |
| B1-S4 | Sonnet | `worker/src/services/libraryCurationService.js`, `worker/test/libraryCurationService.test.js` |
| B1-S5 | Sonnet | `worker/src/services/libraryAdminService.js`, `worker/test/libraryAdminService.test.js` |
| B2-H1 | Haiku | `frontend/library-cite.js`, `frontend/scripts/library-cite.test.mjs` |
| B2-H2 | Haiku | `frontend/scripts/build-biblioteca.js`, `frontend/scripts/build-biblioteca.test.mjs`, `frontend/biblioteca.html` |
| B2-H3 | Haiku | `frontend/biblioteca/catalogo.js`, `frontend/biblioteca.css`, `frontend/scripts/biblioteca-catalogo.test.mjs` |
| B2-H4 | Haiku | `frontend/scripts/fetch-biblioteca.mjs`, `frontend/scripts/fetch-biblioteca.test.mjs`, `frontend/biblioteca/conteudo/reserva.json` |
| B2-H5 | Haiku | `frontend/library.js`, `frontend/library.css`, `frontend/scripts/library.test.mjs` |
| B2-H6 | Haiku | `frontend/library-detail.js`, `frontend/scripts/library-detail.test.mjs` |
| B2-H7 | Haiku | `frontend/admin-library.js`, `frontend/scripts/admin-library.test.mjs` |
| B2-H8 | Haiku | `frontend/admin-library-extras.js`, `frontend/scripts/admin-library-extras.test.mjs` |
| B2-H9 | Haiku | `frontend/scripts/e2e/library.e2e.js`, `frontend/scripts/e2e/biblioteca.e2e.js`, `frontend/scripts/e2e/fixtures/biblioteca-snapshot.json` |
| B2-H10 | Haiku | `docs/cortex/RUNBOOK-BIBLIOTECA.md`, `docs/FEATURE_FLAGS.md`, `docs/riscos-residuais.md` |
| B1-I, B2-I | sessão principal | **arquivos quentes**: `worker/src/handlers.js`, `worker/src/constants.js`, `worker/src/services/featureFlagService.js`, `worker/test/handlers.test.js`, `worker/test/featureFlagService.test.js`, `worker/openapi.yaml`, `frontend/index.html`, `frontend/app.js`, `frontend/scripts/build.js`, `frontend/sw.js`, `frontend/app-menu.css`, `frontend/scripts/app-menu.test.mjs`, `frontend/scripts/e2e/harness.js`, `frontend/scripts/e2e/qa-full.e2e.js`, `frontend/_headers`, `.gitignore`, `.github/workflows/deploy-frontend-cloudflare.yml` |

## Regras de toda ficha
1. **Passo 0:** `git rev-parse --show-toplevel` tem de apontar para um worktree em `.claude/worktrees/` (se for o checkout principal, pare e relate). Depois `git merge --no-edit feat/cortex-biblioteca`; conflito: `git merge --abort` e relate.
2. Só crie ou edite os arquivos da sua ficha. Precisa de outro (sobretudo arquivo quente)? Não edite: relate arquivo, linha, antes/depois.
3. TDD: escreva o teste, rode e veja **falhar**; depois o código; rode de novo. Cole o resultado resumido.
4. Arquivo novo `.js`/`.mjs`/`.css` começa com o cabeçalho de licença de 5 linhas (cópia de `worker/src/handlers.js:1-5`); `.sql` com o de 3 linhas (`sql/026_lia_pesquisas.sql:1-3`); `.html` sem cabeçalho.
5. Front: sem `innerHTML`/`outerHTML`/`insertAdjacentHTML`, sem `style=""`, sem `on*=`, sem `@media (prefers-reduced-motion)` próprio, alvo ≥ 44 px, cor só por token (`docs/ux-progresso/fichas/ORDEM.md` regras 5-8). Worker: funções < 50 linhas, arquivos < 800, imutabilidade, nada de segredo.
6. Memória (3,9 GB): só a sua suíte, com `-i`; no máximo um e2e por agente (`docs/TIME_CONTRATO.md:47`). `worker/node_modules` não existe no worktree: `cd worker && npm ci` uma vez.
7. **GateGuard:** se o hook pedir fatos na primeira edição de um arquivo, escreva em 2 linhas quem usa o arquivo e o "Objetivo" da ficha, e repita a mesma chamada.
8. Fim: **um commit local** só dos seus arquivos (`git add <arquivos>`; mensagem `tipo: descrição`, sem trailer), sem push, sem PR. Relatório ≤ 12 linhas: arquivos, comandos e resultado, pendências para a sessão principal.
