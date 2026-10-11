# Receita: serviço novo com actions no Worker
Branch `feat/cortex-biblioteca`. Só leitura de código. `worker/node_modules` não existe neste worktree: rodar `npm ci` em `worker/` antes de `npm test`.
## 1. Registro e envelope
- `API_REGISTRY` (`worker/src/handlers.js:88-271`): `apiXxx: (sql, env, [args]) => run(...)` ou `runWithSession(...)`.
- Despacho por `hasOwnProperty` (`index.js:84-89`). Ação desconhecida = HTTP 200 `{success:false,message:'Ação desconhecida.'}`.
- Entrada: corpo `{action, args}`; `args` é array (`index.js:91`). Objeto de entrada: `input || {}` ou `asInput(input)` (`handlers.js:84-86`, não-objeto vira `{}`).
- Sucesso `{success:true,...}`. Erro esperado (`errors.js:13-27`) vira `{success:false,message,...payload}` (`handlers.js:57-64`). Inesperado: log + mensagem genérica com `ref: correlationId` (`handlers.js:66-67`).
- HTTP 200 em todo resultado de negócio (`index.js:100`). 4xx só para JSON inválido, caminho e método (`index.js:63,70,77`).
## 2. Sessão e papel
- Público: `run(sql, cid => ...)` (`handlers.js:90`).
- Obrigatória: `runWithSession(sql, env, sessionToken, (identity, cid) => ...)` (`handlers.js:71-79`): `S.requireSession` (`security.js:186-206`) e portão de MFA (`handlers.js:76`). `{allowMfaSetup:true}` só nas ações de cadastro de MFA (`handlers.js:99-105`).
- Opcional: `sessionToken ? S.resolveSession(...) : null` dentro de `run` (`handlers.js:160-163` apiListEvents; `:140-143` apiAssistantChat). Conta banida vira null, não erro (`security.js:161-175`).
- Admin: sem wrapper. Cada service chama `S.requireRole(identity, [C.ROLES.ADMIN])` (`security.js:208-212`; `auditService.js:12-14`). O prefixo `apiAdmin` só muda a documentação (`openapi.js:40`).
## 3. Serviço
- Assinatura real: `(sql, [env,] identity, input..., correlationId)`. `env` só entra se usar e-mail, cache ou IA (`eventService.js:208` tem; `proposalService.js:14` não). Não existe um `(sql, env, identity, input)` fixo.
- Driver `neon` HTTP (`db.js:23-27`): cada chamada é uma requisição, sem BEGIN/COMMIT. Operação multi-passo vira um statement com CTE (`db.js:15-21`).
- Template tag `sql\`...${x}::uuid\`` (`proposalService.js:21-23`); SQL dinâmico `sql(texto, params)` com `$1` (`auditService.js:41-51`). COUNT volta como string: `Number()` (`auditService.js:53`).
- Validação: `S.normalizeText`, `S.isLengthValid`, `C.LIMITS` (`proposalService.js:15-19`). UUID: validar por regex antes (`featureFlagService.js:33`), senão cai no erro genérico do banco.
- Erro de banco conhecido: mapear pela mensagem (`proposalService.js:84-90`).
## 4. Rate limit
- `RATE_LIMITS` (`constants.js:169-220`); itens novos em `Object.assign(RATE_LIMITS, {...})` no fim (`constants.js:251,379,445,463,470`).
- `S.enforceRateLimit(sql, bucket, id, max, janelaSeg)` (`security.js:96-118`): um UPSERT por chamada, conta falhas, estouro = `RateLimitError`. O id é hasheado.
- Por perfil: `identity.profileId` (`handlers.js:123`). Por IP: `env.clientIp` (`index.js:96`; sem IP vira `'unknown'`). Global: id fixo (`authService.js:233`).
- Chamar depois da sessão, dentro do callback (`handlers.js:122-125`).
## 5. Auditoria
- `Logging.logAudit(sql, cid, actorId, action, targetType, targetId, result, details)` (`logging.js:12-21`). NÃO está em `auditService.js`, que só lista (`auditService.js:16`). Importar de `../logging.js` (`proposalService.js:12`).
- Usar em toda escrita bem-sucedida; falha de segurança com `'failure'` (`assistantService.js:428`). Ação em UPPER_SNAKE (`proposalService.js:26`).
- Armadilha 1: `targetId` tem cast `::uuid`; um slug falha e é engolido em silêncio (`logging.js:18-20`). Passar `null` e colocar o slug em `details`.
- Armadilha 2: `result` só aceita `'success'`/`'failure'` (`sql/001_schema.sql:295`). Nada de PII nem corpo em `details` (`logging.js:1-11`).
- Erro inesperado: `Logging.logError(sql, cid, CODE, msg, ctx)` (`logging.js:23-33`).
## 6. Feature flags
- Semear a linha na migração: `INSERT ... ON CONFLICT DO NOTHING` (`sql/019_assistant.sql:20-22`).
- `isEnabled(sql, key, identity)` (`featureFlagService.js:104-107`), cache de 60 s (`:81-102`). Tabela ausente = tudo desligado (`:92-95`); outro erro de banco sobe (`:99-100`).
- Falhar fechado no serviço: wrapper `flagOn` com try/catch (`assistantService.js:130-136`).
- Só vai ao navegador se estiver em `PUBLIC_FLAGS` (`featureFlagService.js:120`). Flag de segurança entra em `RESERVED_FLAGS` (`:131`) e exige reautenticação (`:207-215`).
## 7. Testes fixos e OpenAPI
- `test/handlers.test.js:12-62`: lista literal de todas as actions com `toEqual`. Toda action nova entra ali (hoje 117, `:11`).
- `handlers.test.js:105-116,149-153`: ações da ponte precisam casar `/^api(Learn|AdminAttendance|AdminAi|AdminLearn)[A-Z]/`, o mesmo regex de `frontend/app.js:427`. Outro prefixo não é chamado pelos módulos.
- `test/mfaGate.test.js:23,37`: ação com `sessionToken` no 1º argumento entra no teste de MFA; se for sessão opcional, vai em `OPTIONAL_SESSION`.
- `npm run openapi` = `scripts/gen-openapi.mjs`, regenera `worker/openapi.yaml`. `test/openapi.test.js:50-53` falha se o arquivo estiver defasado. A assinatura é lida por regex (`openapi.js:26-30`): escrever `(sql, env, [a, b]) =>` literal.
## 8. Teste de serviço com PGlite
- Modelo: `test/researchLogService.test.js:108-117`: `beforeAll(createMigratedDb)` (timeout 60 s), `toSql(db)`, `afterAll(db.close)`, `beforeEach` com DELETE.
- `test/helpers/pgliteSql.js:23-33` aplica todos os `sql/NNN_*.sql` em ordem. Toda migração nova roda em todo teste PGlite: precisa ser idempotente (`npm run validate:sql`).
- Mock simples: `test/featureFlagService.test.js`, com `routedSql` (`test/helpers/aiTestUtils.js:24-36`) e `makeEnv`/`makeSql` (`test/helpers/mockEnv.js:8,39`).
## 9. Antes de criar a migração
- `sql/` termina em 026 e não tem 025. `docs/ANDAMENTO.md:127` reserva 025 para a F4; `docs/lia/REVISAO.md:55` propõe 027 para inscrição nativa. Combinar antes.
## Esqueleto (pseudocódigo)
```js
// worker/src/services/libraryService.js (tabela hipotética library_articles)
export async function listArticles(sql, identity, input) {            // identity pode ser null
  const rows = await sql`SELECT id, title FROM library_articles WHERE status = 'published'`;
  return { success: true, articles: rows };
}
export async function submitArticle(sql, env, identity, input, cid) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  const title = S.normalizeText(input.title);
  if (!S.isLengthValid(title, 3, 300)) throw E.ValidationError('Título inválido.');
  const [row] = await sql`INSERT INTO library_articles (title) VALUES (${title}) RETURNING id`;
  await Logging.logAudit(sql, cid, identity.profileId, 'SUBMIT_ARTICLE', 'library_article', row.id, 'success', null);
  return { success: true, articleId: row.id };
}
// handlers.js (dentro de API_REGISTRY)
apiLearnLibraryList: (sql, env, [sessionToken, input]) => run(sql, async () => {
  const identity = sessionToken ? await S.resolveSession(sql, env.SESSION_TOKEN_PEPPER, sessionToken) : null;
  return LibraryService.listArticles(sql, identity, asInput(input));
}),
apiAdminLearnLibrarySubmit: (sql, env, [sessionToken, input]) => runWithSession(sql, env, sessionToken, (identity, cid) => LibraryService.submitArticle(sql, env, identity, asInput(input), cid)),
// Checklist: handlers.test.js (nomes em expected) · mfaGate.test.js (apiLearnLibraryList em OPTIONAL_SESSION) · npm run openapi · libraryService.test.js (PGlite) · npm test
```
