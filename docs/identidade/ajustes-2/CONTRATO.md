# Contrato — ajustes da tela de entrada, do blog e do endereço (ajustes-2, 2026-10-09)

Branch `feat/ajustes-login-blog` (de `origin/main` c132c0f). Caminhos a partir de `frontend/`, salvo `docs/`. Regras de execução:
`fichas/ORDEM.md`. Tudo aqui foi **ensaiado** numa cópia de `frontend/` (fora do repositório): com estes textos, os três
verificadores de `verificadores/` passam (H1 34/34; S1 e S2 em tudo, menos as checagens dos testes que as próprias fichas escrevem,
que no ensaio eram vazios) e `node --test scripts/*.test.mjs` só mantém as 2 falhas antigas de `_headers` (CRLF no Windows).
No código atual os verificadores ficam vermelhos onde devem (ex.: "nenhuma Lia dentro da tela de entrada (achou 3)").

## 0. Pedido do dono → decisão → ficha
| # | Pedido (resumo) | Decisão | Ficha |
|---|---|---|---|
| 1 | Tirar a cabeça da Lia de cima das opções de login; manter só a Lia de baixo | **Remover** o hero (`#hero-lia`, `hero.js`, regras `.hero`). O botão flutuante `#lia-launcher` (assistant.js) fica como está | S1 |
| 2 | Dividir a tela; links viram botões grandes; "Acessar blog" | Três blocos: cartão de login, cartão de atalhos (2 botões ≥ 56 px, largura total) e cartão da publicação | S1 |
| 3 | Prévia da publicação com imagem; laço rosa discreto (Outubro Rosa); trocar "Do blog" por imagem | Miniatura com o ícone do sprite do blog; série `campanhas` em rosa discreto; selo "Do blog" deixa de existir | S2 |
| 4 | Endereço da instituição | "UNINASSAU - Salvador, Rua dos Maçons, 364, Salvador-Bahia, 41810, Brasil"; coordenadas do OSM (§4) | H1 |
| 5 | Cartões "Do blog" do /liga sem imagem | A mesma miniatura, como capa larga no topo de cada cartão | S2 |
| 6 | Rodapé da /liga também no blog, abaixo de "Fale com a Liga" | `footer.pub-rodape` logo depois do `<main>` no feed, em todo post e na 404 do blog | S2 |

## 1. Tela de entrada (S1)

### 1.1 Por que remover o hero e não só escondê-lo
`#hero-lia` existe só em `#screen-welcome`. Esconder por CSS ainda montaria a Lia (SVG, estados e animação) para nada. Remover tira
código morto: `index.html` (o `<div>` e o `<script src="hero.js" defer>`), `hero.js`, `scripts/hero.test.mjs`,
`scripts/e2e/hero-ux2.e2e.js`, a entrada `'hero.js', ` de `scripts/build.js` e do `PRECACHE` de `sw.js`, e as regras `.hero` de `ux.css`.
O `sw.js` é "rede primeiro" e ignora item ausente: **não** sobe a versão do cache. A Lia de baixo (`#lia-launcher`) não muda.
Voltar atrás = `git revert` do commit.

### 1.2 Marcação exata de `#screen-welcome` (index.html, hoje linhas 86-122)
- Linha 86: `class="auth-card"` → `class="auth-pilha"` (o `<section id="screen-welcome"` continua sendo o começo da tag: `headings.test.mjs` procura por ele).
- Apague a linha 87 (`<div class="hero hidden" id="hero-lia" aria-hidden="true"></div>`).
- Envolva da linha 88 (`<span class="brand-pill">`) até o fim de `<div class="auth-links">…</div>` (linha 115) em `<div class="auth-card">` … `</div>`.
- Troque o bloco `<div class="welcome-liga">…</div>` (linhas 116-121) por:
```html
        <nav class="auth-card welcome-liga" aria-label="Conheça a LAIFT e o blog">
          <p class="welcome-liga__aviso">Processo seletivo aberto</p>
          <a class="welcome-liga__botao welcome-liga__link" href="liga.html"><svg class="welcome-liga__icone" aria-hidden="true" focusable="false"><use href="blog/icones.svg#liga"></use></svg><span>Conheça a LAIFT</span></a>
          <a class="welcome-liga__botao welcome-liga__blog" href="blog.html"><svg class="welcome-liga__icone" aria-hidden="true" focusable="false"><use href="blog/icones.svg#novidades"></use></svg><span>Acessar blog</span></a>
        </nav>
        <div class="blog-novidade blog-novidade--faixa" data-blog-novidade="1" hidden></div>
```
- Apague `  <script src="hero.js" defer></script>` (hoje linha 1007). Os scripts da Lia (`modulos/shared/lia/*`) ficam: o botão flutuante usa.
- Ordem final dentro da `<section>`: `div.auth-card` (login) → `nav.auth-card.welcome-liga` → `div.blog-novidade--faixa`. Um só `h1` ("Entrar").
- Caminho do sprite **relativo** (`blog/icones.svg`), como o resto do `index.html`. Classes `welcome-liga__link`, `welcome-liga__blog` e
  `welcome-liga__aviso` ficam (os e2e `liga` e `campanha` usam). A classe `link-btn` sai desses dois links.

### 1.3 CSS exato (ux.css)
Apague a linha `  :root[data-flag-ux-v2-enabled] .hero,` (dentro do `@supports` de "Vidro ampliado") e o bloco inteiro que começa em
`/* Hero da entrada FORA do fluxo` e termina antes de `/* Módulos com canvas 3D` (hoje linhas 535-555). Acrescente, logo antes de
`/* ---------- Painel Início ---------- */`:
```css
/* ---------- Tela de entrada em cartões (index.html, #screen-welcome) ---------- */
/* Três blocos separados: login, atalhos (Liga e blog) e a publicação do blog. Celular: uma coluna.
   A partir de 960 px: login à esquerda; atalhos e publicação à direita. A margem de baixo deixa a
   Lia flutuante (#lia-launcher, fixa a 16 px do canto) longe dos botões no fim da rolagem. Sem flag.
   Movimento reduzido: o bloco único de laift-tokens.css zera as transições (ux.css não repete o @media). */
#screen-welcome.auth-pilha {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--move-md);
  width: min(100%, 460px);
  margin: 0 0 72px;
}
#screen-welcome.auth-pilha > .auth-card { width: auto; margin: 0; }
@media (max-width: 480px) {
  #screen-welcome.auth-pilha { box-sizing: border-box; padding: 12px 12px 0; }
}
@media (min-width: 960px) {
  #screen-welcome.auth-pilha {
    width: min(100%, 880px);
    grid-template-columns: minmax(0, 460px) minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    column-gap: var(--move-lg);
    align-items: start;
  }
  #screen-welcome.auth-pilha > .auth-card:first-child { grid-column: 1; grid-row: 1 / span 2; }
  #screen-welcome.auth-pilha > .welcome-liga { grid-column: 2; grid-row: 1; }
  #screen-welcome.auth-pilha > .blog-novidade--faixa { grid-column: 2; grid-row: 2; }
}
.auth-card.welcome-liga { display: grid; gap: var(--move-sm); padding: 20px; }
.welcome-liga__aviso { display: none; margin: 0; color: var(--primary-strong); font-weight: 700; }
:root[data-flag-selection-open] .welcome-liga__aviso { display: block; }
.welcome-liga__botao {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  box-sizing: border-box; width: 100%; min-height: 56px; padding: 12px 20px;
  border-radius: var(--laift-radius-lg);
  background: var(--primary-soft); color: var(--primary-strong);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--primary) 40%, transparent);
  font-size: 1.0625rem; font-weight: 700; line-height: 1.2; text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--dur-fast) var(--ease-out);
}
.welcome-liga__icone { flex: none; width: 24px; height: 24px; }
.welcome-liga__botao:active { transform: scale(var(--press-scale)); }
.welcome-liga__botao:focus-visible { outline: 3px solid var(--primary); outline-offset: 3px; }
@media (hover: hover) {
  .welcome-liga__botao:hover { background: color-mix(in srgb, var(--primary) 16%, var(--primary-soft)); }
}
```
- **Proibido** `prefers-reduced-motion: reduce` em `ux.css`/`styles.css` (`ux-v2.test.mjs:247` exige o bloco único em `laift-tokens.css`).
  Transição só com `var(--dur-*)`/`var(--ease-*)` (`ux-v2.test.mjs:254`).
- Botões tonais (e não cheios) de propósito: "Entrar" continua sendo a ação principal. Contraste do texto: 7,84:1 (claro) e 8,29:1 (escuro).
- `styles.css`: apague as 5 linhas do fim que começam em `/* Faixa da Liga na tela de entrada` (`.welcome-liga`, `__aviso`,
  `:root[data-flag-selection-open] …`, `__link, __blog`). As regras passam a viver só em `ux.css`.

### 1.4 Testes da tela de entrada
- **Novo** `scripts/entrada.test.mjs` (node:test, só leitura de arquivos, cabeçalho de copyright). Testes, um por item:
  (a) `index.html` sem `hero-lia` e sem `src="hero.js"`; (b) o trecho de `<section id="screen-welcome" class="auth-pilha"` até o primeiro
  `</section>` tem, nesta ordem, `id="form-login"`, `<nav class="auth-card welcome-liga" aria-label="Conheça a LAIFT e o blog">` e
  `data-blog-novidade="1"`, e um só `<h1`; (c) `<span>Conheça a LAIFT</span>` dentro de `welcome-liga__link" href="liga.html"` e
  `<span>Acessar blog</span>` dentro de `welcome-liga__blog" href="blog.html"`; nenhum `/conheça a plataforma/i`; (d) `scripts/build.js` e
  `sw.js` sem `'hero.js'`, e `frontend/hero.js` não existe; (e) `ux.css` sem `.hero` e com `#screen-welcome.auth-pilha`; a regra
  `.welcome-liga__botao {` contém `min-height: 56px`; (f) `styles.css` sem `.welcome-liga`.
- **Novo** `scripts/e2e/entrada.e2e.js` (substitui `hero-ux2.e2e.js`; roda sobre o build, só a sessão principal executa). Modelo:
  `hero-ux2.e2e.js` (harness, `workerHandlers.apiGetFeatureFlags`, `axeGate` como aviso, fotos em `.shots/`). Flags ligadas
  `{ ux_v2_enabled, chatbot_enabled, feedback_enabled, selection_open }`, claro e escuro, 375x812 e 1280x800. Conferir: nenhum `#hero-lia`
  nem `.lia` dentro de `#screen-welcome`; 2 filhos `.auth-card` (div e `nav.welcome-liga`); botões com texto e `href` exatos, altura ≥ 56 e
  largura igual à útil do cartão; `#lia-launcher` visível; no fim da rolagem ele não cruza `#form-login button[type="submit"]`,
  `.welcome-liga__botao` nem `.blog-novidade__item`; sem rolagem horizontal; sem erro de JS. Flags desligadas (375 claro): sem
  `#lia-launcher`, aviso oculto, os mesmos cartões. Movimento reduzido (375 escuro): nenhuma animação rodando dentro de `#screen-welcome`.
  Base pronta para copiar a lógica: `docs/identidade/ajustes-2/verificadores/s1-entrada.js` (função `lerTela`).
- `scripts/e2e/campanha.e2e.js` (`linkDoLogin`, linhas 243-258 e o comentário da linha 8): o rótulo passa a "Acessar blog"; acrescente
  `check(((await blog.textContent()) || '').trim() === 'Acessar blog', …)`. Seletores e `href` não mudam.

## 2. Miniatura do aviso do blog (S2)

### 2.1 Dados e ícone
`blog/index.json` (gerado por `scripts/build-blog.js:indiceDe`) já traz `serie` e `icone`. Ícone = `iconeDe(post)`: o `post.icone`
se estiver na lista `ICONES` (cópia exata de `scripts/build-blog.js:38-42`); senão o da série (`liga`→`liga`, `modulos`→`aprender`,
`plataforma`→`novidades`, `campanhas`→`laco`); senão `novidades`. Sprite **relativo**: `blog/icones.svg` (funciona em `/`, `/liga`,
`/liga.html` e em subpasta). Hoje a tela de entrada escolhe `outubro-rosa-2026` (`laco`) e o /liga mostra `outubro-rosa-2026` (`laco`),
`bem-vindo-a-laift` (`bemvindo`) e `processo-seletivo-2026` (`liga`).

### 2.2 DOM gerado por item (createElement/createElementNS/textContent; sem innerHTML)
```
a.blog-novidade__item[href="blog/<slug>.html"][data-serie="<serie>"]      (data-serie só se rotuloSerie(serie) != '')
  span.blog-novidade__capa[aria-hidden="true"]
    svg.blog-novidade__icone[focusable="false"] > use[href="blog/icones.svg#<icone>"]   (createElementNS(SVG_NS, …))
  span.blog-novidade__texto
    span.blog-novidade__selo   "Nova publicação no blog"   (só se ehNova; nunca mais "Do blog")
    span.blog-novidade__titulo
    span.blog-novidade__resumo (só com N > 1)
    span.blog-novidade__meta   "<rótulo da série> · <data por extenso>"
```
Código de referência (ensaiado): constantes `SVG_NS = 'http://www.w3.org/2000/svg'`, `SPRITE = 'blog/icones.svg'`, `ICONES`,
`ICONE_DA_SERIE`, `ICONE_PADRAO = 'novidades'`; funções `iconeDe(post)` e `criarCapa(doc, post)`; `textoSelo(nova)` devolve
`nova ? 'Nova publicação no blog' : ''`; `module.exports` ganha `iconeDe` e `ICONES`.

### 2.3 CSS (blog-novidade.css, arquivo inteiro reescrito; cabeçalho de copyright mantido)
Tokens por item: `--novidade-tom` (ícone e selo), `--novidade-tom-suave` (fundo da miniatura e do selo), `--novidade-contorno`.
| Série | Claro (tom / suave) | Escuro | Contraste ícone (claro / escuro) |
|---|---|---|---|
| liga (padrão) | `--laift-primary` / `--laift-primary-soft` | tokens mudam sozinhos | 5,30 / 6,88 |
| modulos | `--laift-info` / `--laift-info-soft` | idem | 5,35 / 6,78 |
| plataforma | `--laift-warning` / `--laift-warning-soft` | idem | 5,41 / 8,64 |
| campanhas | `#a61d56` / `#fce7f3` (de `blog-campanha.css`) | `#ff9ccb` / `#3a1a2b` | 6,09 / 7,98 |
Rosa **discreto**: só a miniatura, o selo e um contorno fino `inset 0 0 0 1.5px color-mix(in srgb, var(--novidade-tom) 30%, transparent)`;
o fundo do cartão e o título não mudam. Escuro da campanha com os mesmos seletores de `laift-tokens.css`:
`html[data-theme="dark"] X, html.laift-always-dark X` e `@media (prefers-color-scheme: dark) { html:not([data-theme="light"]):not([data-theme="dark"]) X }`.
Medidas: `.blog-novidade__capa` 64x64, raio 20px, ícone 36px; `--faixa`: o link é o cartão (`min-height: 88px`, `padding: var(--move-md)`,
raio `var(--laift-radius-xl)`, fundo `var(--layer-1)`, sombra `var(--novidade-contorno), var(--elev-2)`); `--cartoes`: capa com
`width: 100%`, `height: 112px`, ícone 56px, sombra `var(--novidade-contorno), var(--elev-1)`. `:hover` (só em `@media (hover: hover)`)
`translateY(-2px)`; `:active` `scale(0.98)`; `@media (prefers-reduced-motion: reduce)` sem transição e sem transform (este arquivo
pode ter o próprio bloco; a regra do bloco único vale só para `styles.css`/`ux.css`/`splash.css`). Sai a regra
`.welcome-liga .blog-novidade--faixa` (a faixa não fica mais dentro de `.welcome-liga`).

### 2.4 Testes
`scripts/blog-novidade.test.mjs` (acrescentar): `iconeDe` (ícone válido mantido; `{ serie: 'campanhas', icone: 'x' }` → `laco`;
`{ serie: 'modulos', icone: 'x' }` → `aprender`; série e ícone desconhecidos → `novidades`; `null` → `novidades`); `ICONES` igual a
`require('./build-blog.js').ICONES` (`deepEqual`); fonte sem `innerHTML|outerHTML|insertAdjacentHTML|document.write`, com
`createElementNS(SVG_NS` e sem `'Do blog'`.

## 3. Rodapé público no blog (S2)
Texto exato (o mesmo de `liga.html:231-236`, caminhos absolutos porque os posts ficam em `/blog/`), numa linha:
```html
<footer class="pub-rodape"><p class="pub-rodape__marca">LAIFT · Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia</p><p class="pub-rodape__local">UNINASSAU – Centro Universitário Maurício de Nassau · Salvador, Bahia</p><ul class="pub-rodape__links"><li><a href="/liga.html">Conheça a LAIFT</a></li><li><a href="/processo-seletivo.html">Processo seletivo</a></li><li><a href="/edital.html">Edital</a></li><li><a href="/blog.html">Blog</a></li><li><a href="/termos.html">Termos de Uso</a></li><li><a href="/privacidade.html">Privacidade</a></li></ul><p class="pub-rodape__copy">© 2026 LAIFT</p></footer>
```
- Posição: **logo depois de `</main>`** (`main.nextElementSibling` é o footer) em `blog.html` (antes do `<dialog class="blog-modal">`),
  em `blog/404.html` e no modelo dos posts (`scripts/build-blog.js`: constante `RODAPE` no topo, perto de `renderCabecalho`; no template,
  `</main>\n${RODAPE}\n${scripts}`). No feed fica colado abaixo de "Fale com a Liga"; nos posts, o "Fale com a Liga" fecha o artigo e,
  depois de "Continue lendo" (quando há), vem o rodapé no fim da página.
- CSS: `publico.css` já é carregado nas três páginas (nada a importar). Em `blog.css`: `.blog-page main` passa de
  `padding: 0 16px calc(120px + env(safe-area-inset-bottom, 0px));` para `padding: 0 16px 24px;` e entra, logo abaixo,
  `.blog-post .pub-rodape { padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px)); }` (a barra flutuante dos posts não cobre os
  links); no `@media print`, `.pub-rodape` entra na lista de `display: none` junto de `.blog-filtros`.
- `blog/contato.js` clona `.blog-contato__lista`: o rodapé não usa essa classe, nada muda.
- Testes: `scripts/build-blog.test.mjs` (acrescentar): `renderPostPage(postBase(), { site: SITE_SEM_EMAIL }).html` contém
  `</main>\n<footer class="pub-rodape">` e os 6 `href` na ordem; `scripts/e2e/blog.e2e.js` (acrescentar `rodapePublico(caminho, largura)`
  e chamar para `blog.html` 375, um post 375 e `blog/404.html` 1280): 1 footer depois do `main`, 6 links absolutos na ordem, alvos ≥ 44 px,
  rodapé abaixo do último `.blog-contato`, e no post, rolado até o fim, a `.blog-barra--visivel` não cruza nenhum link do rodapé.

## 4. Endereço da instituição (H1)
**Fonte e confiança (consultado em 2026-10-09):** OpenStreetMap Nominatim, way 814860088: `amenity=university`, "Faculdade Maurício de
Nassau" (`short_name` Uninassau, `website` uninassau.edu.br), endereço **364, Rua dos Maçons, Pituba, Salvador, 41810-205** — número
**exato**; centro **-12.9952957, -38.4520232**; caixa do prédio lat -12.9957288…-12.9948767, lon -38.4525312…-38.4515084 (~95 x 111 m).
ViaCEP 41810205: Rua dos Maçons, Pituba, Salvador/BA. Parecer CNE/CES 198/2025 (gov.br/mec): sede do Centro Universitário Maurício de
Nassau de Salvador (Uninassau Salvador, e-MEC 1055) na Rua dos Maçons, 364, Pituba. Distância do endereço antigo: 7,1 km.
- Coordenadas usadas (6 casas, sem zero final que o `Number()` cortaria): **lat -12.995296, lon -38.452023** (0,04 m do centro do OSM).
- URLs (geradas por `liga-mapa.js:urlsDoMapa`, conferidas): geo `geo:-12.995296,-38.452023?q=-12.995296,-38.452023(UNINASSAU)`;
  Google `https://www.google.com/maps/search/?api=1&query=-12.995296%2C-38.452023`; Apple
  `https://maps.apple.com/?ll=-12.995296,-38.452023&q=UNINASSAU&z=17`; OSM
  `https://www.openstreetmap.org/?mlat=-12.995296&mlon=-38.452023#map=18/-12.995296/-38.452023`; embed (formato de sempre, ±0,0025 lon,
  ±0,0016 lat) `https://www.openstreetmap.org/export/embed.html?bbox=-38.45452%2C-12.9969%2C-38.44952%2C-12.9937&layer=mapnik&marker=-12.995296%2C-38.452023`.
- Texto exibido = o do dono: sigla "UNINASSAU - Salvador"; endereço "Rua dos Maçons, 364 / Salvador-Bahia, 41810 / Brasil"; no edital,
  "Onde a Liga atua: UNINASSAU - Salvador, Rua dos Maçons, 364, Salvador-Bahia, 41810, Brasil." O `h3` "Centro Universitário Maurício de
  Nassau" fica (nome oficial confirmado no parecer). JSON-LD (dado de máquina): `name` "UNINASSAU - Salvador", `streetAddress`
  "Rua dos Maçons, 364", `postalCode` **"41810-205"** (CEP completo confirmado; "41810" sozinho não é CEP válido), geo acima.
- Prédio (`icons/predio-instituicao.svg`): o `<text>` da plaquinha (x 211, y 294) passa de `358` a `364`; o `<desc>` passa a
  "Ilustração de um prédio com a placa UNINASSAU e o número 364 na entrada." (sai "de quatro andares": o OSM não informa andares do
  prédio novo). O `alt` em `liga.html` acompanha: "Ilustração do prédio da UNINASSAU, com o número 364 na entrada".
- Sem mudança (continuam verdadeiros): "UNINASSAU · Salvador, Bahia" (hero), cartão "Onde estamos", contato "UNINASSAU, Salvador",
  rodapés "UNINASSAU – Centro Universitário Maurício de Nassau · Salvador, Bahia".

## 5. Verificadores e capturas
`docs/identidade/ajustes-2/verificadores/` (fora do deploy; servem `frontend/` **da fonte**, geram o blog numa pasta temporária, simulam a
Worker, não escrevem em `frontend/`): `s1-entrada.js`, `s2-blog.js`, `h1-endereco.js`. Rodar da RAIZ:
`node docs/identidade/ajustes-2/verificadores/<nome>.js` (sai com código 1 se algo falhar). Fotos em `capturas/` (as de antes, em
`capturas/antes/`): `entrada-{claro,escuro}-{375,1280}.png`, `entrada-claro-375-sem-flags.png`, `aviso-*.png`, `liga-blog-*.png`,
`rodape-*.png`, `instituicao-*.png`. São o material do portão visual do dono.
