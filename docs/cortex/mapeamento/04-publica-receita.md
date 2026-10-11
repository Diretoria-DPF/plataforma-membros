# Página pública /biblioteca: como o blog é montado e a escolha de dados

Somente leitura. Nenhum arquivo do repositório foi alterado. Caminhos relativos a `frontend/` salvo indicação.

## 1. Como o blog é montado
- Fonte: `blog/conteudo/*.json` (`{ "posts": [...] }`), 19 posts em 7 arquivos (`scripts/build-blog.js` L30 séries, L417-444 `build`). Arquivos `_*.json` só entram com `--incluir-exemplo`.
- `build-blog.js` valida tudo e, se houver qualquer erro, lança exceção com a lista completa (L429). Um post inválido derruba o build inteiro do site (`scripts/build.js` L111 chama o gerador sem try/catch).
- Por post: `renderPostPage` (L267) monta `dist/blog/<slug>.html`; `renderMeta` (L188-214) põe canonical `https://laift.com.br/blog/<slug>` (sem `.html`), og:*, twitter:card e JSON-LD (`@graph` com BlogPosting e BreadcrumbList). CSP em `<meta>` (L182-183).
- `dist/blog/index.json` (L441) = `{ total, posts }` com metadados sem corpo. Medido em memória, sem gravar: 19 posts = 7,6 KB (cerca de 400 bytes por post, com resumo). O teste exige teto de 20 KB (`scripts/build-blog.test.mjs` L141, L165).
- Páginas: média de 13 KB, máxima de 84 KB (campanhas).
- Front: `blog.html` (feed) carrega `blog/feed.js`, que faz `fetch('/blog/index.json')` (`blog/feed.js` L~50, `INDICE_URL`), valida cada item (`postValido`) e pagina de 6 em 6. Só `textContent`.
- `blog-sw.js` (escopo `/blog`, registrado em `blog/instalar.js` L113) faz rede primeiro, com cache próprio e `/blog/404.html` offline. Não cobre `/biblioteca`.
- `blog.html` tem a CSP `connect-src 'self'` (L4 do arquivo), então um fetch a `api.laift.com.br` seria bloqueado sem alterar a CSP.

## 2. Sitemap, robots, llms.txt, _headers, wrangler
- `sitemap.xml` (estático, 6 URLs sem `.html`) é copiado por `scripts/build.js` L56. O gerador do blog acrescenta URLs entre marcadores `blog:inicio/blog:fim` (`build-blog.js` L253-264, L442). Uma página nova precisa de um gerador análogo ou de estender esta função.
- `robots.txt`: `Allow: /` para todos; nada bloqueia `/biblioteca`. Não precisa de mudança.
- `llms.txt`: lista manual de "Páginas públicas" (L5-12). Precisa de uma linha nova para o catálogo.
- `_headers`: Link no `/` (sitemap e llms). Cache `/blog/*` = 1 h + SWR 1 dia; `/blog/index.json` = 5 min. Um `/biblioteca/*` precisa de bloco próprio. Há `X-Robots-Tag` só para staging e workers.dev.
- `wrangler.toml` (frontend): `not_found_handling = "404-page"` (L23). `html_handling` não está definido, então vale o padrão `auto-trailing-slash` (confirmado na documentação Cloudflare): `foo.html` responde em `/foo`. Para `/biblioteca/x` sem arquivo, serve o `404.html` mais próximo, então `biblioteca/404.html` (se existir) tem prioridade.
- Deploy: `.github/workflows/deploy-frontend-cloudflare.yml` roda só em push para `main`/`staging` com `paths: frontend/**` (L23-29), mais `workflow_dispatch`. Publicar um artigo no banco NÃO gera nova versão do site.

## 3. Testes de SEO e o que a página nova precisa
- `scripts/seo.test.mjs` cobre só `index.html`, `termos`, `privacidade`, robots, `_headers` (Link), sitemap e llms. Não cobre páginas do blog.
- `scripts/blog-infra.test.mjs`: cache de `_headers`, llms cita o blog, robots não bloqueia `/blog`.
- `scripts/build-blog.test.mjs`: escape, validação, rodapé e índice. Não há asserção de canonical, og, JSON-LD nem h1 nas páginas do blog (lacuna).
- `scripts/headings.test.mjs` cobre só `index.html`.
- Para `/biblioteca`, o mínimo é: canonical sem `.html`, description 70-160 caracteres, og:*, JSON-LD (`ScholarlyArticle` ou `CollectionPage` + `BreadcrumbList`), um único `<h1>`, e entrada no sitemap e no llms.txt. Para indexação acadêmica, meta `citation_title`, `citation_author`, `citation_publication_date` e `citation_doi` (Google Acadêmico lê estas tags).

## 4. Dados dinâmicos hoje
- `liga.js` L23-27 `apiBase()`: `laift.com.br` ou `www` vai a `https://api.laift.com.br`; `staging` vai a `staging-api`; o resto vai ao `*.workers.dev`. `www` está no mapa mas não em `ALLOWED_ORIGINS`; hoje o `www` só redireciona (`redirect-www/`), então não é problema real.
- `liga.js` L51-54: `POST` com `{action:'apiGetFeatureFlags', args:['']}`, `credentials: 'omit'`, timeout de 5 s. Usada em `liga.html`, `processo-seletivo.html` e `edital.html`. Mesmo padrão em `app.js` L19-24.
- Por isso essas três páginas têm `connect-src` com os três hosts da API (`liga.html` L5, `processo-seletivo.html` L5, `edital.html` L5). `blog.html` não tem.
- CORS (`worker/src/index.js` L25-47): preflight OPTIONS responde 204; `Access-Control-Allow-Origin` só para origens em `ALLOWED_ORIGINS` (`worker/wrangler.toml`: `https://laift.com.br` em produção, `https://staging.laift.com.br` em staging, mais localhost). Só `POST` em `/`, `/v1`, `/v1/`; qualquer outro caminho dá 404.
- Ação pública = entrada em `API_REGISTRY` (`worker/src/handlers.js` L135, `apiGetFeatureFlags` com `run`, sem sessão). `worker/test/handlers.test.js` L12-16 exige a lista EXATA de 117 ações, então toda ação nova exige atualizar o teste. Não há rate limit nessa ação.
- `worker/src/cache.js`: cache KV (`HOT_CACHE`) com TTL, disponível para os handlers.

## 5. Instantâneo estático no build versus chamada à API
Instantâneo (JSON + HTML gerados):
- Prós: HTML pronto para o rastreador (SEO e Google Acadêmico sem depender de JS); zero custo de banco por visita; funciona com o banco fora do ar (requisito de `docs/cortex/ESCALA-BANCO.md` §3 camada 0 e E1b); mesmo padrão do blog, sem código novo de infraestrutura; CSP sem mudança.
- Contras: frescor depende de gatilho de build (ver §6); exige ler os dados na CI (token/segredo ou endpoint público novo); cada publicação gera redeploy completo do site.
- Tamanho (estimativa, 50-100 artigos sem resumo, só título, autores, ano, revista, link e slug): cerca de 150-300 bytes por artigo, 8-30 KB no total, poucos KB comprimidos. Ordem de grandeza de 100 páginas HTML: menos de 1 MB.

API ao Worker (POST `apiListPublicLibrary`):
- Prós: publicação aparece na hora; sem redeploy; uma fonte só.
- Contras: POST não é cacheável na borda sem Cache API explícita (não há hoje); crawlers veem página vazia se não executarem JS; cada visita consome Neon (contra o plano de escala); modo degradado exige cache próprio ou o instantâneo de qualquer forma; CSP com o host novo; mais superfície pública (rate limit a criar).
- Modo degradado: com API fora, a página só mostra "não foi possível carregar" e some do Google se o HTML não existir. Com instantâneo, o catálogo continua igual.

## 6. Páginas por artigo: viável?
- Sim. O blog já gera 19 páginas com o mesmo código, em uma passada. Para 100 artigos o custo é linear e pequeno.
- Riscos a tratar: (a) um artigo inválido derruba o build, então a biblioteca precisa de validação isolada (ou falha só do catálogo); (b) títulos de artigos podem conter palavras que as `FRASES_PROIBIDAS` do blog recusam (ex.: "garantido"), então não reutilizar essa lista; (c) é preciso gerar sitemap e llms por artigo; (d) o rodapé e a barra públicos se reaproveitam de `renderCabecalho`/`RODAPE`.
- Fonte dos dados no build: (1) endpoint público novo, chamado pela CI; ou (2) export do banco com segredo na CI. A opção 1 não exige segredo de banco na CI, mas depende da API no momento do build; se ela cair, o build deve usar o último snapshot commitado.
- Gatilho: `deploy-frontend-cloudflare.yml` tem só `push`/`workflow_dispatch`. Precisa de `schedule` (cron, ex.: diário) e/ou um disparo na publicação (`repository_dispatch` chamado pelo Worker com token novo). Sem isso, o instantâneo fica desatualizado.

## Recomendação
Instantâneo estático gerado no build, no padrão do blog: `biblioteca/<slug>.html`, `biblioteca/index.json` e entradas no sitemap e no llms.txt, com dados apenas de artigos `publicado` e sem resumo ou coleções (esses ficam para membros, via API autenticada). Justificativa: a página é pública e precisa de HTML para o Google; o plano de escala pede que a leitura pública não dependa do Neon; o custo é de poucos KB. Como complemento, um workflow com `schedule` e `workflow_dispatch` fecha o frescor. Não usar a API como fonte da página pública.
