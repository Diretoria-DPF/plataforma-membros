# Contrato das Publicações (campanhas) do blog LAIFT — v1 (2026-10-09)

Quem escreve o módulo de blocos (M1), o CSS (M2), o JS (M3), o feed (F1), o conteúdo (C1–C5) e o QA (Q1)
segue este contrato **ao pé da letra**. Ele estende `docs/blog/WIREFRAME.md` (regras globais continuam valendo:
CSP `script-src 'self'; style-src 'self'`, sem `style=""`, sem `innerHTML`, JS só muda estilo por CSSOM,
movimento só em `transform`/`opacity`, `prefers-reduced-motion` respeitado, toque ≥ 44 px, `:hover` só em
`@media (hover: hover)`, cabeçalho de copyright em `.js/.css/.mjs`).

## 0. Visão geral

- Série nova **`campanhas`**, rótulo de interface **"Publicações"**. Um post de campanha é um post normal (mesmo
  cabeçalho, breadcrumbs, contato, JSON-LD) + os blocos extras deste contrato + `/blog-campanha.css` + `/blog/campanha.js`.
- Blocos extras só são aceitos em posts com `"serie": "campanhas"`.
- Primeira publicação: `outubro-rosa-2026` (fixada, ícone `laco`), em `frontend/blog/conteudo/campanhas.json`.
- A página funciona sem JS: cartas são `<details>`, dados são `<table>`, barras têm largura de fallback por CSS.

| Arquivo | Dono | Papel |
|---|---|---|
| `frontend/scripts/blog-blocos-campanha.js` | M1 | CommonJS: `{ BLOCOS_CAMPANHA, HOSTS_FONTES, validar, render, checarPost }` |
| `frontend/scripts/blog-blocos-campanha.test.mjs` | M1 | `node --test` do módulo |
| `frontend/blog/conteudo/_EXEMPLO-campanha.json` | M1 | um post fictício com TODOS os blocos (só entra com `--incluir-exemplo`) |
| `frontend/blog-campanha.css` | M2 | estilos de todos os blocos + destaque do feed + acento da série |
| `frontend/blog/campanha.js` | M3 | deck, contadores, barras, sumário ativo |
| `frontend/blog.html`, `frontend/blog/feed.js` | F1 | chip "Publicações", destaque da campanha do mês |
| `frontend/blog/icones.svg`, `frontend/blog/404.html`, `frontend/blog.css` | I1 | símbolo `laco`, 404 do blog, estilos da 404 |
| `frontend/scripts/build-blog.js`, `frontend/scripts/build.js` | **sessão principal (S1)** | plugue (seção 1) |

## 1. Plugue no gerador (S1 — sessão principal; nenhum Haiku edita estes arquivos)

Em `frontend/scripts/build-blog.js`:
1. `const campanha = require('./blog-blocos-campanha.js');`
2. `SERIES` recebe `'campanhas'`; `SERIE_ROTULO.campanhas = 'Publicações'`; `ICONES` recebe `'laco'`.
3. `validatePost`: um bloco é aceito se `BLOCOS.includes(b.t)` **ou** (`post.serie === 'campanhas'` e
   `campanha.BLOCOS_CAMPANHA.includes(b.t)`). Para cada bloco de campanha: `campanha.validar(b, { blocos: post.blocos, icones: ICONES })`
   devolve `string[]` (prefixar com `bloco ${i} (${b.t})`). Se `post.serie === 'campanhas'`: somar `campanha.checarPost(post.blocos)`.
   (O módulo **não** faz `require('./build-blog.js')` no topo — seria circular; só a CLI `--checar-parte` o carrega, dentro da função.)
   `checarPost(blocos)` checa: ≤ 1 `sumario` e ≤ 1 `referencias`; todo `ref` e todo `#ref-<id>` existem; ids únicos; emoji em
   qualquer texto de qualquer bloco (inclusive `p`, `lista`…) fora de `habitos[].emoji` = erro; o 1º bloco é `destaque` tom
   `atencao` e há outro `destaque` tom `atencao` entre os 3 últimos blocos (aviso de saúde no topo e no fim).
4. `renderPostPage`: `RENDER[b.t] ? RENDER[b.t](b, ctx) : campanha.render(b, ctxC)`, com
   `ctxC = { esc, renderInline: (t) => renderInline(t, ctx), icone, avisos: ctx.avisos, contador: ctx.contador, blocos: post.blocos }`.
5. `<head>`: se `post.serie === 'campanhas'`, `<link rel="stylesheet" href="/blog-campanha.css">` logo depois de `/blog.css`;
   e `'/blog/campanha.js'` entra em `scripts` (só nesse post, se o arquivo existir).
6. `frontend/scripts/build.js`: incluir `'blog-campanha.css'` na lista de cópia (`blog/campanha.js` e `blog/404.html`
   já vão pelo `cpSync` de `blog/`).
7. Aceite: `cd frontend && node --test scripts/build-blog.test.mjs scripts/blog-blocos-campanha.test.mjs && node scripts/build-blog.js --incluir-exemplo --out ../.tmp-blog`.

## 2. Regras comuns dos blocos de campanha

- Todo texto é texto puro (o gerador escapa). Campos marcados **(inline)** passam por `ctx.renderInline`: aceitam
  `[rótulo](destino)` só para destinos internos e para âncoras de fonte `#ref-<id>`.
- **`ref`** (opcional na maioria dos itens) = id de um item do bloco `referencias` do mesmo post. Renderiza
  `<sup class="blog-ref"><a href="#ref-<id>" aria-label="Fonte <n>"><n></a></sup>`, onde `<n>` é a posição (1-based) do id
  no bloco `referencias` (achado em `ctx.blocos`). `checarPost` falha se um `ref` ou `#ref-<id>` não existir.
- Links externos **só** no bloco `referencias`, na chave `href` (o gerador não checa frases em `href`), `https://` e host
  exatamente em `HOSTS_FONTES` (seção 6). Nada de `[<>"'\s]` no link.
- **Emoji só em `habitos[].emoji`.** `validar` recusa `\p{Extended_Pictographic}` em qualquer outro texto de bloco de campanha.
- Ids gerados: `ctx.contador.campanha = (ctx.contador.campanha || 0) + 1` → sufixo `-N` (único na página).
  Blocos de campanha **não** emitem `<h2>` e **não** mexem em `ctx.contador.h2`: cada seção começa com um bloco `h2` comum
  (ids `s-1`, `s-2`… do gerador); o título opcional de um bloco de campanha vira `<h3>`.
- Números (`valor`, `valores`) são `number` no JSON; o servidor formata com `Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })`.
- `validar` devolve mensagens curtas em português; `render` nunca lança para bloco que passou em `validar`.

## 3. Esquema e HTML de cada bloco

### 3.1 `sumario` (máx. 1 por post)
`{ "t": "sumario", "titulo"?: "Nesta publicação" }` — lista, em ordem, todos os blocos `h2` comuns de `ctx.blocos` (k-ésimo h2 → `#s-k`).
```html
<nav class="blog-sumario" aria-labelledby="sumario-N"><p class="blog-sumario__titulo" id="sumario-N">Nesta publicação</p>
<ol class="blog-sumario__lista"><li><a class="blog-sumario__link" href="#s-1">Texto do h2</a></li>…</ol></nav>
```

### 3.2 `painel` (dashboard; KPIs, gráficos, tabelas)
```json
{ "t": "painel", "titulo"?: "…",
  "kpis"?: [ { "valor": 78610, "casas"?: 0, "prefixo"?: "", "sufixo"?: " casos/ano", "rotulo": "…", "detalhe"?: "… (inline)", "ref"?: "id" } ],
  "graficos"?: [ { "titulo": "…", "unidade"?: "casos por 100 mil mulheres", "casas"?: 1, "series"?: ["2023–2025", "2026–2028"],
                   "itens": [ { "rotulo": "Sudeste", "valores": [84.5, 80.1] } ], "nota"?: "…", "ref"?: "id" } ],
  "tabelas"?: [ { "titulo": "…", "colunas": ["Região", "Casos"], "linhas": [["Sudeste", 39000]], "casas"?: 0, "nota"?: "…", "ref"?: "id" } ] }
```
Limites: pelo menos um de `kpis/graficos/tabelas`; `kpis` 1–6; `graficos` 1–3, `itens` 2–12, `valores` com o mesmo
tamanho de `series` (1 se não houver `series`; `series` tem 1 ou 2 nomes), todos ≥ 0; `tabelas` 1–3, `colunas` 2–8, `linhas` 1–20
(cada linha com `colunas.length` células, string ou number); `casas` 0–2.
```html
<div class="blog-painel">
  <h3 class="blog-painel__titulo">…</h3>
  <ul class="blog-painel__kpis">
    <li class="blog-kpi">
      <p class="blog-kpi__valor"><span class="blog-kpi__prefixo">…</span><span class="blog-kpi__num" aria-hidden="true" data-valor="78610" data-casas="0">78.610</span><span class="blog-sr-only">78.610</span><span class="blog-kpi__sufixo"> casos/ano</span></p>
      <p class="blog-kpi__rotulo">…</p><p class="blog-kpi__detalhe">… <sup class="blog-ref">…</sup></p>
    </li>
  </ul>
  <figure class="blog-grafico" data-series="2">
    <figcaption class="blog-grafico__titulo">Título <span class="blog-grafico__unidade">(unidade)</span></figcaption>
    <ul class="blog-grafico__legenda"><li data-serie="1">2023–2025</li><li data-serie="2">2026–2028</li></ul>   <!-- só com series -->
    <ul class="blog-grafico__linhas">
      <li class="blog-grafico__linha">
        <span class="blog-grafico__rotulo">Sudeste</span>
        <span class="blog-grafico__trilho" aria-hidden="true"><span class="blog-grafico__barra" data-serie="1" data-v="0.845" data-p="85"></span><span class="blog-grafico__barra" data-serie="2" data-v="0.801" data-p="80"></span></span>
        <span class="blog-grafico__valores"><span class="blog-grafico__valor" data-serie="1"><span class="blog-sr-only">2023–2025: </span>84,5</span> <span class="blog-grafico__valor" data-serie="2"><span class="blog-sr-only">2026–2028: </span>80,1</span></span>
      </li>
    </ul>
    <p class="blog-grafico__nota">Nota. <sup class="blog-ref">…</sup></p>
  </figure>
  <div class="blog-tabela-dados" role="region" aria-labelledby="tab-N" tabindex="0">
    <table><caption id="tab-N">Título</caption><thead><tr><th scope="col">Região</th>…</tr></thead>
    <tbody><tr><th scope="row">Sudeste</th><td data-num>39.000</td></tr></tbody></table>
    <p class="blog-tabela-dados__nota">Nota. <sup class="blog-ref">…</sup></p>
  </div>
</div>
```
`data-v` = valor ÷ maior valor do gráfico (3 casas, 0–1); `data-p` = `data-v` arredondado ao múltiplo de 5 mais próximo, em %
(0, 5, …, 100). A 1ª célula de cada linha é `<th scope="row">`; células numéricas ganham `data-num`.

### 3.3 `deck` (mitos × verdades)
```json
{ "t": "deck", "titulo"?: "…", "instrucao"?: "Toque em cada carta para ver a resposta.",
  "cartas": [ { "frase": "…", "veredito": "mito|verdade|depende", "explicacao": "… (inline)", "ref": "id" } ] }
```
6–12 cartas; `ref` **obrigatório** em toda carta; `frase` ≤ 120 caracteres; `explicacao` ≤ 400.
```html
<div class="blog-deck" data-deck>
  <h3 class="blog-deck__titulo">…</h3><p class="blog-deck__instrucao">…</p>
  <div class="blog-deck__filtros" role="group" aria-label="Filtrar cartas" hidden>
    <button type="button" class="blog-chip" aria-pressed="true" data-filtro="todas">Todas</button>
    <button type="button" class="blog-chip" aria-pressed="false" data-filtro="mito">Mitos</button>
    <button type="button" class="blog-chip" aria-pressed="false" data-filtro="verdade">Verdades</button>
    <button type="button" class="blog-chip" aria-pressed="false" data-filtro="depende">Depende</button>  <!-- só se houver carta "depende" -->
  </div>
  <p class="blog-deck__placar" aria-live="polite" hidden></p>
  <ul class="blog-deck__cartas">
    <li class="blog-carta" data-veredito="mito">
      <details class="blog-carta__det">
        <summary class="blog-carta__frente"><span class="blog-carta__pergunta">Mito ou verdade?</span><span class="blog-carta__frase">…</span><span class="blog-carta__dica">Ver resposta</span></summary>
        <div class="blog-carta__verso"><p class="blog-carta__veredito">Mito</p><p class="blog-carta__explicacao">… <sup class="blog-ref">…</sup></p></div>
      </details>
    </li>
  </ul>
</div>
```
Rótulos do veredito: `mito` → "Mito", `verdade` → "Verdade", `depende` → "Depende".

### 3.4 `comparativo` (passado × presente)
```json
{ "t": "comparativo", "titulo"?: "…", "rotulos"?: { "tema": "Tema", "antes": "Antes", "agora": "Hoje" },
  "itens": [ { "tema": "…", "antes": "… (inline)", "agora": "… (inline)", "ref"?: "id" } ] }
```
3–10 itens.
```html
<div class="blog-comparativo"><h3 class="blog-comparativo__titulo">…</h3>
<table class="blog-comparativo__tabela"><caption class="blog-sr-only">Título ou "Comparação: antes e hoje"</caption>
<thead><tr><th scope="col">Tema</th><th scope="col" data-col="antes">Antes</th><th scope="col" data-col="agora">Hoje</th></tr></thead>
<tbody><tr><th scope="row">…</th><td data-col="antes" data-rotulo="Antes">…</td><td data-col="agora" data-rotulo="Hoje">… <sup class="blog-ref">…</sup></td></tr></tbody></table></div>
```
No celular (< 600 px) o CSS empilha as células e mostra `attr(data-rotulo)` em `::before`.

### 3.5 `guia` (equipamentos, exames, direitos — cartões com campos rotulados)
```json
{ "t": "guia", "titulo"?: "…", "itens": [ { "icone"?: "laboratorio", "nome": "…", "campos": [ { "rotulo": "O que é", "texto": "… (inline)" } ], "ref"?: "id" } ] }
```
2–10 itens; `campos` 1–4; `icone` (se houver) tem de estar na lista de ícones do gerador.
```html
<ul class="blog-guia"><li class="blog-guia__item"><svg class="blog-guia__icone" …><use href="/blog/icones.svg#laboratorio"></use></svg>
<h3 class="blog-guia__nome">…</h3><dl class="blog-guia__campos"><div><dt>O que é</dt><dd>…</dd></div>…</dl><p class="blog-guia__fonte"><sup class="blog-ref">…</sup></p></li></ul>
```

### 3.6 `faixas` (públicos por fase da vida)
```json
{ "t": "faixas", "titulo"?: "…", "itens": [ { "faixa": "criancas|adolescentes|jovens|adultas|idosas|homens|todas", "rotulo": "Crianças", "idade"?: "até 12 anos", "texto": "… (inline)", "dicas"?: ["… (inline)"], "ref"?: "id" } ] }
```
3–7 itens; `dicas` 0–5. Nenhum `<details>` vem aberto.
```html
<div class="blog-faixas"><h3 class="blog-faixas__titulo">…</h3>
<details class="blog-faixa" data-faixa="criancas"><summary class="blog-faixa__resumo"><span class="blog-faixa__rotulo">Crianças</span><span class="blog-faixa__idade">até 12 anos</span></summary>
<div class="blog-faixa__corpo"><p>… <sup class="blog-ref">…</sup></p><ul class="blog-lista"><li>…</li></ul></div></details>…</div>
```

### 3.7 `habitos` (única exceção à regra "sem emoji")
```json
{ "t": "habitos", "titulo"?: "…", "itens": [ { "emoji": "🏃‍♀️", "titulo": "…", "efeito": "protege|reduz-risco|apoia-tratamento|evitar", "texto": "… (inline)", "ref": "id" } ] }
```
4–10 itens; `ref` obrigatório; `emoji` = 1 emoji (1 a 8 code points, casa `\p{Extended_Pictographic}`).
Rótulo do efeito: `protege` → "Ajuda a prevenir", `reduz-risco` → "Reduz o risco", `apoia-tratamento` → "Apoia o tratamento", `evitar` → "Evite".
```html
<ul class="blog-habitos"><li class="blog-habito" data-efeito="protege"><span class="blog-habito__emoji" aria-hidden="true">🏃‍♀️</span>
<h3 class="blog-habito__titulo">…</h3><p class="blog-habito__efeito">Ajuda a prevenir</p><p class="blog-habito__texto">… <sup class="blog-ref">…</sup></p></li></ul>
```

### 3.8 `referencias` (máx. 1 por post; obrigatório se houver `ref`)
```json
{ "t": "referencias", "itens": [ { "id": "epi-inca-estimativa-2026", "titulo": "…", "orgao": "INCA / Ministério da Saúde",
  "href": "https://www.gov.br/inca/…", "doi"?: "10.xxxx/…", "acesso": "2026-10-09", "tipo": "dados|artigo|lei|guia|noticia" } ] }
```
1–60 itens; `id` casa `^[a-z0-9-]{3,48}$` e é único; `acesso` AAAA-MM-DD; `href` https com host em `HOSTS_FONTES`; `doi` casa `^10\.\d{4,9}/\S+$`.
```html
<ol class="blog-referencias"><li class="blog-referencia" id="ref-ID" data-tipo="lei"><span class="blog-referencia__titulo">…</span>.
<span class="blog-referencia__orgao">…</span>. <a href="…" target="_blank" rel="noopener noreferrer">Acessar a fonte<span class="blog-sr-only"> (abre em nova aba)</span></a>.
DOI: <a href="https://doi.org/…" target="_blank" rel="noopener noreferrer">10.…<span class="blog-sr-only"> (abre em nova aba)</span></a>.
<span class="blog-referencia__acesso">Acesso em 9 de outubro de 2026.</span></li></ol>
```
(a data de acesso por extenso é montada pelo `render` a partir do ISO; não escreva datas por extenso no JSON).

### 3.9 Blocos comuns reaproveitados
`p`, `h2`, `lista`, `destaque`, `fatos`, `etapas`, `cartoes`, `cta`, `contato` (ver `_EXEMPLO.json`). Em campanhas,
até **3** `destaque` (aviso de saúde no topo, um alerta no meio, aviso no fim).

## 4. CSS (`frontend/blog-campanha.css`, M2)

- Carregado depois de `/modulos/shared/laift-tokens.css` e `/blog.css`; só `var(--…)` dos tokens + tokens próprios no topo:
  `.blog-artigo[data-serie="campanhas"], .blog-campanha-destaque, .blog-card[data-serie="campanhas"] { --campanha-acento: …; --campanha-suave: …; }`
  com versão escura em `@media (prefers-color-scheme: dark)`. Contraste: texto ≥ 4.5:1, bordas/barras ≥ 3:1 sobre o fundo do token.
- Todas as classes das seções 3 e 5. Cartas: frente/verso com giro só por `transform` (`rotateY`) e `opacity` quando
  `[open]`; `@media (prefers-reduced-motion: reduce)` = sem giro, verso visível direto. `summary` com alvo ≥ 44 px e foco visível.
- Barras: `.blog-grafico__barra { transform-origin: left center; transform: scaleX(var(--v, 0)); }` + 21 regras de fallback
  `.blog-grafico__barra[data-p="0"] { --v: 0 }` … `[data-p="100"] { --v: 1 }` (a página sem JS mostra a largura certa).
  Transição de `transform` só fora de movimento reduzido. Série 2 com cor/padrão distinto da série 1 (não só cor: borda tracejada ou opacidade).
- `.blog-tabela-dados`: rolagem horizontal própria (`overflow-x: auto`), foco visível, cabeçalho fixo à esquerda opcional.
- `.blog-comparativo` empilha em < 600 px; `.blog-guia`, `.blog-habitos` em grade `auto-fit, minmax(16rem, 1fr)`.
- `.blog-sumario`: lista de chips roláveis na horizontal no celular; `.blog-sumario__link[aria-current="true"]` destacado.
- `.blog-sr-only` já existe em `blog.css`. Sem rolagem horizontal da página em 375 px.

## 5. JS (`frontend/blog/campanha.js`, M3) — módulo ES, carregado só em posts de campanha

- `const REDUZIR = matchMedia('(prefers-reduced-motion: reduce)').matches;` Sem `innerHTML`; nós com `createElement`/`textContent`;
  estilo só por `el.style.setProperty('--v', …)`.
- **Deck** (`[data-deck]`): remove `hidden` de `.blog-deck__filtros` e `.blog-deck__placar`; filtro por `data-veredito`
  (cartas fora do filtro recebem `hidden`; `aria-pressed` nos chips); placar em `aria-live`: "Você abriu X de N cartas"
  (conta `toggle` de `<details>` abertos ao menos uma vez) e, ao filtrar, "Mostrando N cartas".
- **KPIs** (`.blog-kpi__num`): ao entrar na tela (IntersectionObserver, `threshold: 0.4`, uma vez), conta de 0 até `data-valor`
  em ~900 ms com `requestAnimationFrame` e easing de saída, formatando com `Intl.NumberFormat('pt-BR', casas)`; no fim,
  o texto é exatamente o do servidor. Movimento reduzido ou sem IntersectionObserver: não anima (fica o valor do servidor).
- **Barras** (`.blog-grafico__barra`): sem movimento reduzido, no carregamento põe `--v: 0` via CSSOM e, ao entrar na tela,
  `--v: data-v` (o CSS faz a transição). Com movimento reduzido: `--v: data-v` direto.
- **Sumário**: IntersectionObserver nos `h2[id^="s-"]` → `aria-current="true"` no link da seção visível (só um por vez).
- Erros não quebram a página: cada parte roda em `try/catch` próprio e, na falha, deixa o estado final visível.

## 6. `HOSTS_FONTES` (hosts aceitos em `referencias[].href`; comparação exata do hostname)
`www.gov.br`, `www.inca.gov.br`, `www.planalto.gov.br`, `www.in.gov.br`, `legis.senado.leg.br`, `www12.senado.leg.br`,
`www25.senado.leg.br`, `www.camara.leg.br`, `bvsms.saude.gov.br`, `datasus.saude.gov.br`, `tabnet.datasus.gov.br`,
`www.sei.ba.gov.br`, `doi.org`, `pubmed.ncbi.nlm.nih.gov`, `pmc.ncbi.nlm.nih.gov`, `www.ncbi.nlm.nih.gov`, `www.who.int`,
`iris.who.int`, `gco.iarc.who.int`, `gco.iarc.fr`, `www.iarc.who.int`, `publications.iarc.who.int`, `monographs.iarc.who.int`,
`www.scielo.br`, `www.thelancet.com`, `www.nejm.org`, `jamanetwork.com`, `ascopubs.org`, `www.nature.com`, `www.bmj.com`,
`acsjournals.onlinelibrary.wiley.com`, `www.cancer.gov`, `seer.cancer.gov`, `www.cancer.org`, `www.wcrf.org`, `www.paho.org`,
`www.ibge.gov.br`, `biblioteca.ibge.gov.br`, `www.saude.ba.gov.br`, `agenciabrasil.ebc.com.br`, `agenciagov.ebc.com.br`,
`www1.folha.uol.com.br`, `g1.globo.com`, `oglobo.globo.com`, `www.estadao.com.br`, `www.bbc.com`.
Fonte fora da lista: use o DOI (`doi.org`) ou a página equivalente em gov.br; se não houver, a afirmação é DESCARTADA.

## 7. Feed (`blog.html` + `feed.js`, F1; estilo em `blog-campanha.css`, M2)

- `blog.html` carrega `/blog-campanha.css` depois de `/blog.css`. Chip novo, depois de "Plataforma":
  `<button class="blog-chip" type="button" aria-pressed="false" data-filtro="campanhas">Publicações</button>`.
- Destaque, logo depois de `section.blog-hero` e antes de `#mapa`:
```html
<section class="blog-campanha-destaque" id="campanha" aria-labelledby="t-campanha" hidden>
  <svg class="blog-icone blog-campanha-destaque__icone" aria-hidden="true" focusable="false"><use href="/blog/icones.svg#laco"></use></svg>
  <p class="blog-campanha-destaque__selo">Campanha do mês</p>
  <h2 id="t-campanha" class="blog-campanha-destaque__titulo"></h2>
  <p class="blog-campanha-destaque__resumo"></p>
  <a class="blog-botao blog-campanha-destaque__link" href="/blog.html#filtro=campanhas">Ler a publicação</a>
</section>
```
- `feed.js`: `FILTROS` e `SERIE_ROTULO` ganham `campanhas: 'Publicações'`; depois de carregar o índice, o 1º post com
  `serie === 'campanhas' && fixado` preenche título/resumo (`textContent`) e `href = '/' + post.href`, e tira o `hidden`.
  Sem campanha fixada, a seção fica escondida. Falha do índice: continua escondida.

## 8. Armadilhas do gerador (o build recusa ou o teste quebra)

- Proibido em qualquer texto do JSON: `garantido/garantida(s)` (use "previsto em lei", "assegurado"), "100% seguro",
  "revisado por", `N vagas`, `Dr./Dra./Prof./Profa. Nome`, `<` ou `>` (escreva "menos de", "mais de"), e-mail, `@` que não seja `@laift.liga`.
- Datas: nada no formato `d/m` ou `dd/mm` (inclui frações como "1/8" e "24/7": escreva "1 em cada 8"); nada de
  "19 de outubro" (escreva "em outubro"). Leis e portarias sempre com ano de 4 dígitos: "Lei nº 9.797/1999".
- O teste do build recusa nas páginas: "em revisão", "planejad…", "em estudo", "aguardando ativação" (ex.: escreva "em pesquisa"
  em vez de "em estudo"; evite "gravidez planejada").
- `leitura_min` ≤ 20; `fontes` (campo do post) com itens ≤ 160 caracteres; `titulo` ≤ 90; `resumo` ≤ 200.
- Links internos só: caminhos `/…`, `*.html` e âncoras `#…`. Link externo só no bloco `referencias`.

## 9. Regras editoriais das campanhas

- Tom do `ESTILO.md` (você, frases curtas, sem superlativo, sem promessa), mas o público é **geral** (não só estudante):
  linguagem simples, direta e leve; termo técnico explicado na primeira vez.
- Toda afirmação numérica ou legal tem `ref` (ou link `#ref-…` no texto) para uma fonte primária confirmada em
  `docs/blog/campanhas/outubro-rosa/fatos-*.md` com status CONFIRMADO ou CORRIGIDO. **Fato fora desses arquivos não entra.**
- Aviso de saúde obrigatório no topo e no fim (`destaque` tom `atencao`):
  "Conteúdo educativo. Não substitui consulta com profissional de saúde. Notou alguma alteração nas mamas? Procure uma Unidade Básica de Saúde."
- Sem nome de pessoa (inclusive autores de artigos: cite título, periódico/órgão e DOI), sem foto, sem e-mail pessoal.
- Homens também têm câncer de mama: mencionar com o número confirmado.
- Emoji só no bloco `habitos`.
