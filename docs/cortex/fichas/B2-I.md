# B2-I · Integração do front (sessão principal; arquivos quentes) — onda 6

**Objetivo:** registrar painel, ficha, citação, aba admin e página pública no app, no build, no cache offline e na CI. Haiku não executa esta ficha.
**Arquivos:** `frontend/index.html`, `frontend/app.js`, `frontend/scripts/build.js`, `frontend/sw.js`, `frontend/app-menu.css`, `frontend/scripts/app-menu.test.mjs`, `frontend/scripts/e2e/harness.js`, `frontend/scripts/e2e/qa-full.e2e.js`, `frontend/_headers`, `.gitignore`, `.github/workflows/deploy-frontend-cloudflare.yml`.
**Depende de:** B2-H1 a B2-H8 integrados; B1-I verde (para o staging).

## Passos (cada item = CONTRATO-B2, seção indicada)
1. `index.html`: grupo "Estudo" no menu (§5, antes de `</dialog>`, linha 394); `panel-library` antes de `panel-profile` (linha 571; §3); botão em `#nav-group-admin` antes da linha 338 e `panel-admin-library` depois de `panel-admin-ai` (§6); `<link>` de `library.css` depois da linha 75; scripts na ordem do §7 entre as linhas 1063 e 1067. CSP (linha 6) não muda.
2. `app.js`: dois loaders em `PANEL_LOADERS` (linha 1072); `LaiftLibrary.reset()`, `LaiftLibraryDetail.reset()`, `LaiftAdminLibrary.reset()` e `LaiftAdminLibraryExtras.reset()` junto das linhas 143 e 886. **Não** mexer em `MEMBER_PANEL_ORDER` (§1).
3. `app-menu.css`: `:root:not([data-flag-library-enabled]) #app-menu [data-grupo="estudo"] { display: none; }`.
4. `scripts/build.js`: na lista da linha 56, `'library-cite.js', 'library-detail.js', 'library.js', 'library.css', 'admin-library-extras.js', 'admin-library.js', 'biblioteca.css'`; depois da linha 111, `require('./build-biblioteca.js').build({ outDir: DIST });` (texto exato do relatório da B2-H2). `biblioteca.html` **não** entra na lista (o gerador escreve o `dist/biblioteca.html`).
5. `sw.js`: os 6 arquivos do app no `PRECACHE` (linhas 23-29) e `CACHE_NAME` → `v5` (linha 20).
6. Testes: `scripts/app-menu.test.mjs:146-147` (acrescentar `'panel-library'`), `scripts/e2e/harness.js:254` (`MENU_PANELS`), `scripts/e2e/qa-full.e2e.js:951` (`'panel-admin-library'`).
7. `_headers`: bloco do §2.1. `.gitignore`: `frontend/biblioteca/conteudo/recente.json`.
8. Workflow: SEM `schedule` (decisão P5: sem agendamento diário; atualização por `workflow_dispatch`); no job de deploy, antes de "Gera frontend/dist/" (linha 96), o passo da B2-H4 com `BIBLIOTECA_API_URL` por branch (`main` → `https://api.laift.com.br/v1/`, `staging` → `https://staging-api.laift.com.br/v1/`). O job `testes` não busca nada (usa a reserva).

## Aceite
```bash
cd frontend && node --test scripts/*.test.mjs 2>&1 | tail -6     # só as 2 falhas conhecidas do Windows
node scripts/build.js && node scripts/e2e/run.js csp smoke home menu 2>&1 | tail -8
```
Depois: B2-H9 (e2e da Biblioteca) e o portão visual (CONTRATO-B2 §8) no navegador embutido, 375 e 1280 px, claro e escuro. Staging e produção só com o OK do dono.
