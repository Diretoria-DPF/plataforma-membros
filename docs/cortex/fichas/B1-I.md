# B1-I · Integração do Worker (sessão principal; arquivos quentes) — fim da onda 5

**Objetivo:** ligar os serviços da Biblioteca ao `API_REGISTRY`, registrar limites e flags públicas, atualizar os testes fixos e o OpenAPI. Haiku não executa esta ficha.
**Arquivos:** `worker/src/handlers.js`, `worker/src/constants.js`, `worker/src/services/featureFlagService.js`, `worker/test/handlers.test.js`, `worker/test/featureFlagService.test.js`, `worker/openapi.yaml` (gerado).
**Depende de:** B1-S1 a B1-S5 e B1-H1 a B1-H3 integrados em `feat/cortex-biblioteca`.

## Passos
1. `handlers.js`: imports depois da linha 55 — `import * as LibraryService from './services/libraryService.js';`, `import * as LibraryCuration from './services/libraryCurationService.js';`, `import * as LibraryAdmin from './services/libraryAdminService.js';`. Antes do `};` da linha 271 (texto literal: o OpenAPI lê a assinatura por regex, `worker/src/openapi.js:26-30`):
```js
  // ---- Biblioteca LAIFT (docs/cortex/CONTRATO-B1.md §4). O catálogo público não tem sessão: só o build o consome. ----
  apiLearnLibraryPublicCatalog: (sql, env) => run(sql, () => LibraryService.publicCatalog(sql, env)),
  apiLearnLibrarySearch: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => LibraryService.search(sql, identity, asInput(input))),
  apiLearnLibraryGetArticle: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => LibraryService.getArticle(sql, identity, asInput(input))),
  apiLearnLibrarySetFavorite: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => LibraryService.setFavorite(sql, identity, asInput(input))),
  apiLearnLibraryListFavorites: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => LibraryService.listFavorites(sql, identity, asInput(input))),
  apiLearnLibraryListCollections: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => LibraryService.listCollections(sql, identity)),
  apiLearnLibraryGetCollection: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => LibraryService.getCollection(sql, identity, asInput(input))),
  apiLearnLibrarySuggest: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LibraryService.suggest(sql, env, identity, asInput(input), cid)),
  apiAdminLearnLibraryImport: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LibraryCuration.importArticle(sql, env, identity, asInput(input), cid)),
  apiAdminLearnLibraryListQueue: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => LibraryCuration.listQueue(sql, identity, asInput(input))),
  apiAdminLearnLibraryGetArticle: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => LibraryCuration.getAdminArticle(sql, identity, asInput(input))),
  apiAdminLearnLibraryUpdateArticle: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LibraryCuration.updateArticle(sql, identity, asInput(input), cid)),
  apiAdminLearnLibrarySetStatus: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LibraryCuration.setStatus(sql, identity, asInput(input), cid)),
  apiAdminLearnLibraryClinicalReview: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LibraryCuration.clinicalReview(sql, identity, asInput(input), cid)),
  apiAdminLearnLibraryListSuggestions: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity) => LibraryAdmin.listSuggestions(sql, identity, asInput(input))),
  apiAdminLearnLibraryDecideSuggestion: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LibraryAdmin.decideSuggestion(sql, env, identity, asInput(input), cid)),
  apiAdminLearnLibraryListCollections: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => LibraryAdmin.listCollections(sql, identity)),
  apiAdminLearnLibrarySaveCollection: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LibraryAdmin.saveCollection(sql, identity, asInput(input), cid)),
  apiAdminLearnLibrarySaveTopic: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LibraryAdmin.saveTopic(sql, identity, asInput(input), cid)),
  apiAdminLearnLibraryListStaff: (sql, env, [sessionToken]) => runWithSession(sql, env, sessionToken, (identity) => LibraryAdmin.listStaff(sql, identity)),
  apiAdminLearnLibrarySetStaff: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LibraryAdmin.setStaff(sql, identity, asInput(input), cid)),
```
   Se algum Sonnet relatou assinatura diferente, ajuste aqui (o relatório dele manda).
2. `constants.js` (fim do arquivo): `import { LIBRARY_RATE_LIMITS } from './library/limits.js';` no topo e `Object.assign(RATE_LIMITS, LIBRARY_RATE_LIMITS);` (padrão das linhas 251, 379, 445, 463, 470).
3. `featureFlagService.js:120`: `PUBLIC_FLAGS` ganha `'library_enabled', 'library_member_suggest'`. Em `featureFlagService.test.js:116-121`: asserção de que as duas estão e de que `library_ai_summary` e `lia_library_enabled` **não** estão.
4. `handlers.test.js`: texto "117" (linha 11) → "138" e um `expected.push(...)` com as 21 chaves, antes da linha 62. `mfaGate.test.js` não muda.
5. `cd worker && npm run openapi` (regenera `openapi.yaml`).

## Aceite
```bash
cd worker && npm test 2>&1 | tail -6            # suíte completa, em série, 0 falhas
npm run validate:sql 2>&1 | tail -3
npm run openapi && git diff --stat openapi.yaml
```
Depois: CONTRATO-B1 §10 (backup do Neon, 029 em branch de teste, segredo `LIBRARY_CONTACT_EMAIL`, deploy), cada passo com OK do dono.
