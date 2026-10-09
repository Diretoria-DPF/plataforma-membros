# Ordem de execução — identidade digital da Liga (v1, 2026-10-09)

Disparo (sessão principal, um Haiku 5.5 por ficha): **"RAIZ = <caminho do worktree>. Leia `<RAIZ>/docs/identidade/fichas/<id>.md` e execute."**
Contrato: `docs/identidade/CONTRATO.md`. Plano: `docs/identidade/PLANO.md`. 14 fichas, pico de 8 Haiku simultâneos.

## Regras fixas de toda ficha (leia antes de começar)
1. **Só edite os arquivos de que a sua ficha é DONA.** Precisa mudar outro arquivo? Não mude: escreva no relatório o trecho e o porquê.
2. **Não use git** (nada de status/add/commit/stash/checkout). A sessão principal comita.
3. **Não rode `node scripts/build.js`** nem escreva em `frontend/dist/` (pasta compartilhada; só a sessão principal gera o build).
4. CSP sem `'unsafe-inline'`: sem `<script>` inline (só JSON-LD), sem `style=""`, sem `on*=`, sem `innerHTML`/`insertAdjacentHTML`/`document.write`.
   JS cria nós com `createElement`/`createElementNS`/`textContent`; estilo só por classe, atributo ou `el.style.setProperty('--x', v)`.
5. Arquivo `.js`, `.css` ou `.mjs` novo começa com este cabeçalho (cópia de `frontend/scripts/build-blog.test.mjs:1-5`):
   ```
   /*
    * Plataforma de Membros LAIFT
    * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
    * Licença proprietária: ver LICENSE na raiz do repositório.
    */
   ```
6. Movimento só em `transform`/`opacity`; `prefers-reduced-motion: reduce` mostra o estado final. Alvo de toque ≥ 44 px. `:hover` só em
   `@media (hover: hover)`. Celular primeiro (375 px), depois desktop (1280 px); claro e escuro pelos tokens. A página lê bem sem JS.
7. Textos em português do Brasil, frases curtas, no presente. Nunca invente vagas, datas, notas, pesos, nomes de pessoa: "a divulgar".
   Proibido na interface: "em revisão", "planejado", "proposta", "pendente", "a definir pela diretoria".
8. Sem biblioteca, sem CDN, sem fonte externa, sem imagem raster nova. Mapa de terceiro só por clique.
9. **GateGuard:** se um hook pedir fatos na primeira criação/edição de um arquivo, escreva 2 linhas — quem usa o arquivo e a instrução do
   usuário (a frase "Objetivo" da sua ficha) — e repita a MESMA chamada.
10. Economize tokens: não leia arquivo grande inteiro (use Grep ou `offset`/`limit`); leia só as seções do contrato citadas na ficha.
11. Comandos de aceite: no Bash (Git Bash), a partir de `<RAIZ>/frontend`. Falhou? Corrija e rode de novo; não entregue vermelho.
12. **Relatório final (≤ 12 linhas):** id · arquivos criados/alterados · cada comando de aceite e o resultado (1 linha) · pendências para
    outros donos (trecho exato) · riscos. Nada de colar código.

## Ondas
| Onda | id | Dono de (a partir de `frontend/`, salvo `docs/`) | Depende de | Aceite |
|---|---|---|---|---|
| 0 | sessão principal | worktree `feat/identidade-liga` de `origin/main`; copiar `docs/identidade/`; `npm ci` em `frontend/` | — | `ls frontend/node_modules/playwright` |
| 1 | E1 | `edital.html` | contrato | ver ficha |
| 1 | S1 | `icons/predio-instituicao.svg` (+ prévia em `docs/identidade/capturas/predio-previa.png`) | contrato | ver ficha |
| 1 | D1 | `publico.css`, `processo.css` | contrato | ver ficha |
| 1 | D2 | `liga.css` | contrato | ver ficha |
| 1 | H1 | `liga.html`, `blog/404.html` | contrato | ver ficha |
| 1 | H2 | `processo-seletivo.html`, `sitemap.xml`, `blog/conteudo/liga.json` | contrato | ver ficha |
| 1 | J1 | `liga.js`, `liga-ciclo.json`, `liga-mapa.js` | contrato | ver ficha |
| 1 | J3 | `blog-novidade.js`, `blog-novidade.css`, `scripts/blog-novidade.test.mjs` | contrato | ver ficha |
| 1→2 | **S** sessão principal | `index.html`, `app.js`, `scripts/build.js`, `sw.js`, `termos.html`, `privacidade.html`, `404.html`, `blog/manifest.webmanifest` | onda 1 verde | CONTRATO §12; `node --test scripts/*.test.mjs` |
| 2 | B1 | `blog.html`, `scripts/build-blog.js`, `blog/contato.js` | S | ver ficha |
| 2 | W1 | `blog-sw.js`, `blog/instalar.js`, `scripts/blog-pwa.test.mjs` | S (manifest e `build.js`) | ver ficha |
| 2 | V1 | `voltar-app.js`, `voltar-app.css`, `scripts/voltar-app.test.mjs` | S (`index.html`) | ver ficha |
| 2→3 | sessão principal | build | onda 2 verde | `node scripts/build.js && node --test scripts/*.test.mjs && node scripts/e2e/run.js csp campanha` |
| 3 | Q1 | `scripts/e2e/liga.e2e.js` | build | `node scripts/e2e/run.js liga` |
| 3 | Q2 | `scripts/e2e/navegacao.e2e.js` (novo) | build | `node scripts/e2e/run.js navegacao` |
| 3 | Q3 | `scripts/e2e/blog.e2e.js`, `scripts/e2e/capturas-identidade.js` (novo) + PNGs em `docs/identidade/capturas/` | build | `node scripts/e2e/run.js blog && node scripts/e2e/capturas-identidade.js` |
| 4 | R | orquestrador (Opus): revisão dos relatórios e do diff | Q1–Q3 | checklist da revisão |
| 5 | dono | portão visual: aprovar as capturas e os itens de `PLANO.md` §4 | R | só então a PR |

## Regras de disparo
- Onda 1: as 8 de uma vez (todas dependem só do contrato). **S** começa quando as 8 estiverem verdes.
- Onda 2: B1, W1 e V1 juntos, depois de S. Em seguida a sessão principal gera o build e roda as suítes da linha "2→3".
  Esperado nessa hora: `liga.e2e.js` e `blog.e2e.js` antigos falham (a marcação mudou de propósito); Q1 e Q3 os reescrevem.
- Onda 3: Q1, Q2 e Q3 juntos, sobre o mesmo build. Um Q que achar defeito de produto **não conserta**: relata arquivo, linha e
  comportamento; a sessão principal devolve a ficha do dono ao mesmo Haiku (SendMessage), refaz o build e o Q roda de novo.
- Falhou o aceite de uma ficha? Devolver a mesma ficha ao mesmo Haiku com a saída do erro; não abrir ficha nova para o mesmo arquivo.
- Suíte completa (`npm run e2e`, inclusive `visual-qa`) só a sessão principal, em série, antes da revisão R. Se só a geometria mudar,
  regravar a baseline (`UPDATE_GEOMETRY=1`) depois do OK do orquestrador.
- Fora do plano (a sessão principal cuida): commits, PR, deploy, ligar a flag `selection_open`, editar o Google Forms (é do dono).
