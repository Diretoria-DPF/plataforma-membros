# Contrato da identidade digital da Liga (v1, 2026-10-09)

Quem escreve HTML, CSS ou JS desta rodada segue este contrato **ao pé da letra**: nomes de arquivo, classes, ids e atributos são a
ponte entre fichas que rodam ao mesmo tempo sem se ver. Plano e decisões: `docs/identidade/PLANO.md`.
Caminhos de arquivo são relativos a `frontend/`.

## 0. Regras de marcação (todas as páginas)
- CSP sem `'unsafe-inline'`: nada de `<script>` sem `src` (só JSON-LD), nada de `style=""`, nada de `on*=`, nada de `innerHTML`.
  JS cria nós com `createElement`/`createElementNS`/`textContent`; estilo só por classe, atributo ou `el.style.setProperty('--x', v)`.
- Páginas da Liga (`liga.html`, `processo-seletivo.html`, `edital.html`) ficam na raiz e usam **caminhos relativos**
  (`modulos/...`, `icons/...`, `blog.html`). Páginas do blog usam **caminhos absolutos** (`/blog.css`, `/icons/...`), como hoje.
- Tema: segue o sistema; `laift-tokens.css` já troca `--layer-*`, `--elev-*` e `--laift-*` no escuro. Use só esses tokens,
  `--dur-*`, `--ease-*`, `--move-*`, `--laift-touch` (44 px), `--laift-radius-*`. Nenhuma cor nova (exceção: a paleta fixa do prédio, §6).
- Alvo de toque ≥ 44 px; `:active { transform: scale(.98) }` no que é clicável; `:hover` só em `@media (hover: hover)`.
- Movimento só em `transform` e `opacity`; com `prefers-reduced-motion: reduce`, estado final visível e nenhuma animação rodando.
- Emoji é decoração: sempre `<span class="lp-emoji" aria-hidden="true">✨</span>`; o texto ao lado carrega o sentido.
- Link externo: `target="_blank" rel="noopener noreferrer"` + `<span class="laift-sr-only"> (abre em nova aba)</span>`.
- Elementos com `hidden` precisam continuar escondidos mesmo com `display` próprio (regra em `publico.css`, §10).
- Tom: frases curtas, presente, como concluído. Proibido na interface: "em revisão", "planejado", "proposta", "pendente",
  "em breve" (exceto o 404 do blog, que já existe), "a definir pela diretoria". Dado sem fonte = "a divulgar".
- Nome: Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia (LAIFT). Instagram `https://www.instagram.com/laift.liga`,
  e-mail `laiftligauninassau@gmail.com`. Instituição: UNINASSAU – Centro Universitário Maurício de Nassau, Rua Direita da Piedade, 358,
  Salvador, Bahia, 40070-190, site `https://www.uninassau.edu.br`.

### 0.1 CSP (copie exatamente)
- `liga.html`: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://plataforma-membros-api.diretoria-dpf.workers.dev https://api.laift.com.br https://staging-api.laift.com.br; worker-src 'none'; frame-src https://www.openstreetmap.org; object-src 'none'; base-uri 'self'; form-action 'self'`
- `processo-seletivo.html`, `edital.html`: a mesma, com `frame-src 'none'`.
- Blog (`blog.html`, `blog/404.html` e a constante `CSP` de `scripts/build-blog.js`): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`

### 0.2 `<head>` das páginas da Liga (nesta ordem)
```html
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="(§0.1)">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#0f6f62">
<title>(§11)</title>
<meta name="description" content="(§11)">
<link rel="canonical" href="https://laift.com.br/liga">   <!-- /processo-seletivo, /edital -->
<meta property="og:type" content="website"> + og:title, og:description, og:url (= canonical), og:image = https://laift.com.br/blog/og-default.jpg
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="stylesheet" href="modulos/shared/laift-tokens.css">
<link rel="stylesheet" href="publico.css">
<link rel="stylesheet" href="liga.css">            <!-- processo e edital: processo.css -->
<link rel="stylesheet" href="blog-novidade.css">   <!-- só liga.html -->
```
Fim do `<body>`: `<script src="static-page.js" defer></script>` e `<script src="liga.js" defer></script>`; em `liga.html` também
`<script src="liga-mapa.js" defer></script>` e `<script src="blog-novidade.js" defer></script>`.

### 0.3 `<head>` do blog (acréscimos; `blog.html`, `blog/404.html` e o modelo dos posts em `build-blog.js`)
Depois de `theme-color`: os 3 `<link rel="icon|apple-touch-icon">` acima com `/icons/...`, mais
`<link rel="manifest" href="/blog/manifest.webmanifest">`, `<meta name="apple-mobile-web-app-capable" content="yes">`,
`<meta name="mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-title" content="Blog LAIFT">`.
Antes de `/blog.css`: `<link rel="stylesheet" href="/publico.css">`. Fim do `<body>`: `<script src="/static-page.js" defer></script>`
e `<script src="/blog/instalar.js" defer></script>` (os `type="module"` existentes continuam).

## 1. Barra superior pública (`publico.css`)
```html
<a class="pub-pular" href="#conteudo">Pular para o conteúdo</a>          <!-- no blog continua a.blog-skip -->
<header class="pub-barra">
  <div class="pub-barra__linha">
    <a class="pub-voltar" href="(reserva, PLANO §2.8)" data-history-back aria-label="Voltar à tela anterior">
      <svg class="pub-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6"/></svg>
      <span class="pub-voltar__rotulo">Voltar</span>
    </a>
    <a class="pub-barra__marca" href="liga.html"><img src="modulos/cracha/laift-marca.png" alt="" width="40" height="40"><span>LAIFT</span></a>
    <!-- só no blog: --> <button class="pub-instalar" type="button" data-instalar hidden>
      <svg class="pub-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg><span>Instalar</span></button>
  </div>
  <nav class="pub-barra__nav" aria-label="Plataforma">
    <a class="pub-barra__link" href="./"><svg class="pub-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9.5 20v-6h5v6"/></svg><span>Início</span></a>
    <a class="pub-barra__link" href="blog.html"><span>Blog</span></a>                     <!-- só nas páginas da Liga -->
    <a class="pub-barra__link" href="./#entrar"><span>Entrar</span></a>
    <a class="pub-barra__link pub-barra__link--destaque" href="./#cadastro"><span>Cadastrar</span></a>
  </nav>
</header>
```
- No blog: marca `href="/blog.html"` com `<img src="/modulos/cracha/laift-marca.png" ...>` e `<span>Blog LAIFT</span>`; links `/`, `/#entrar`,
  `/#cadastro`; sem o link "Blog"; com o botão `.pub-instalar`. A barra substitui o antigo `header.blog-topo` (os contatos continuam no
  bloco "Fale com a Liga" e na barra flutuante dos posts).
- Layout: celular = linha 1 (voltar, marca, instalar à direita) + linha 2 (nav em segmentos de largura igual, rolável se faltar
  espaço); a partir de 760 px, uma linha só (voltar, marca, nav à direita). Não fixa no celular; `position: sticky; top: 0` a partir
  de 760 px, com altura de 64 px, z-index 30, véu `color-mix(in srgb, var(--layer-0) 92%, transparent)` e `backdrop-filter` só em `@supports`.
- `.pub-voltar`: pílula ≥ 44 px, ícone + "Voltar", sempre o primeiro item à esquerda (x ≤ 24 px, y ≤ 24 px no topo da página).
- `.pub-icone`: 20 px, `fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round`.
- `.pub-barra__link--destaque`: fundo `--laift-primary`, texto `--laift-on-primary`.

## 2. `liga.html` (identidade da Liga) — esqueleto
`<body class="pub-pagina lp-pagina">` → `a.pub-pular` → `header.pub-barra` (voltar `href="./"`) → `nav.lp-secoes` → `main#conteudo.lp-conteudo` → `footer.pub-rodape`.
```html
<nav class="lp-secoes" aria-label="Nesta página"><ul class="lp-secoes__lista">
  <li><a class="lp-secoes__item" href="#quem-somos">Quem somos</a></li>  (#areas Áreas · #como-funciona Como funciona · #processo Processo seletivo
  · #edital Edital · #contato Contato · #instituicao Instituição · #blog Blog)
</ul></nav>
<main id="conteudo" class="lp-conteudo">
  <section id="topo" class="lp-hero" aria-labelledby="lp-titulo">
    <div class="lp-hero__texto">
      <h1 id="lp-titulo" class="lp-hero__titulo"><span class="lp-hero__sigla">LAIFT</span><span class="lp-hero__nome">Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia</span></h1>
      <p class="lp-hero__lema"><span class="lp-emoji" aria-hidden="true">✨</span> Nada se cria, nada se perde, tudo se transforma <span class="lp-emoji" aria-hidden="true">📚</span></p>
      <p class="lp-hero__oferta"><span class="lp-emoji" aria-hidden="true">🧬</span> conteúdo científico • projetos • capacitações</p>
      <p id="liga-status" class="pub-status lp-hero__status" data-estado="fechado" aria-live="polite">Inscrições fechadas no momento. Acompanhe @laift.liga.</p>
      <div class="lp-hero__acoes">
        <a id="liga-cta-processo" class="pub-botao pub-botao--primario" href="processo-seletivo.html" data-se-aberto hidden>Processo seletivo</a>
        <a class="pub-botao pub-botao--secundario" href="processo-seletivo.html" data-se-fechado>Conheça o processo seletivo</a>
        <a class="lp-hero__local" href="#instituicao"><span class="lp-emoji" aria-hidden="true">📍</span> UNINASSAU · Salvador, Bahia</a>
      </div>
    </div>
    <div class="lp-hero__marca"><img src="modulos/cracha/laift-marca.png" alt="Marca da LAIFT" width="168" height="168"></div>
  </section>
  <section id="quem-somos" class="pub-sec lp-quem" aria-labelledby="quem-somos-t">
    <h2 id="quem-somos-t">Quem somos</h2><p class="lp-lead">(§11)</p>
    <div class="lp-cards" role="region" aria-label="Quem somos, em cartões" tabindex="0">
      <article class="lp-card"><span class="lp-emoji lp-card__emoji" aria-hidden="true">🎓</span><h3 class="lp-card__titulo">…</h3><p class="lp-card__texto">…</p></article>
      (7 cartões, §11; o 7º termina com <a class="lp-card__link" href="#instituicao">Ver no mapa</a>)
    </div>
  </section>
  <section id="areas" class="pub-sec lp-areas" aria-labelledby="areas-t">
    <h2 id="areas-t">Áreas de interesse</h2><p class="lp-lead">(§11)</p>
    <ul class="lp-areas__lista"><li class="lp-area"><span class="lp-emoji lp-area__emoji" aria-hidden="true">💊</span><span class="lp-area__nome">…</span><span class="lp-area__texto">…</span></li> (8 itens)</ul>
  </section>
  <section id="como-funciona" class="pub-sec lp-funciona" aria-labelledby="como-funciona-t">
    <h2 id="como-funciona-t">Como funciona</h2><p class="lp-lead">(§11)</p>
    <div class="lp-funciona__grade">
      <div class="lp-compromissos"><h3>Seu compromisso</h3>
        <ul class="lp-compromissos__lista"><li class="lp-compromisso"><strong class="lp-compromisso__nome">…</strong><span class="lp-compromisso__texto">…</span></li> (5)</ul>
        <p class="lp-disponibilidade">Carga horária semanal mínima: a divulgar.</p></div>
      <div class="lp-beneficios"><h3>O que você ganha</h3>
        <ul class="lp-beneficios__lista"><li class="lp-beneficio"><span class="lp-emoji lp-beneficio__emoji" aria-hidden="true">🧠</span><strong class="lp-beneficio__nome">…</strong><span class="lp-beneficio__texto">…</span></li> (6)</ul></div>
    </div>
    <aside class="lp-diferencial" aria-labelledby="diferencial-t"><h3 id="diferencial-t">O diferencial da LAIFT</h3><p>…</p></aside>
  </section>
  <section id="processo" class="pub-sec lp-processo" aria-labelledby="processo-t">
    <div class="lp-processo__texto"><h2 id="processo-t">Processo seletivo</h2><p class="lp-lead">…</p>
      <ol class="lp-processo__passos"><li>Inscrição e ficha diagnóstica</li><li>Análise de perfil</li><li>Divulgação dos selecionados</li></ol>
      <a class="pub-botao pub-botao--primario" href="processo-seletivo.html">Ver as instruções</a></div>
    <img class="lp-processo__lia" src="modulos/shared/lia/lia-estatica.svg" alt="" width="120" height="180">
  </section>
  <section id="edital" class="pub-sec lp-edital" aria-labelledby="edital-t">
    <h2 id="edital-t">Edital 2026</h2><p class="lp-lead">…</p><a class="pub-botao pub-botao--secundario" href="edital.html">Abrir o edital</a>
  </section>
  <section id="contato" class="pub-sec lp-contato" aria-labelledby="contato-t">
    <h2 id="contato-t">Contato</h2><p class="lp-lead">Fale com a Liga pelos canais oficiais.</p>
    <ul class="lp-contato__lista">
      <li><a class="lp-contato__item" href="https://www.instagram.com/laift.liga" target="_blank" rel="noopener noreferrer"><svg class="pub-icone lp-contato__icone" aria-hidden="true" focusable="false"><use href="blog/icones.svg#ig"></use></svg><span class="lp-contato__rotulo">Instagram</span><span class="lp-contato__valor">@laift.liga</span><span class="laift-sr-only"> (abre em nova aba)</span></a></li>
      <li>(mesma estrutura, sem target e sem "abre em nova aba": href="mailto:laiftligauninassau@gmail.com", ícone #envelope, rótulo "E-mail", valor "laiftligauninassau@gmail.com")</li>
      <li>(mesma estrutura: href="#instituicao", ícone #inicio, rótulo "Onde estamos", valor "UNINASSAU, Salvador")</li>
    </ul>
  </section>
  (section#instituicao — §6)
  <section id="blog" class="pub-sec lp-blog" aria-labelledby="blog-t">
    <h2 id="blog-t">Do blog</h2><p class="lp-lead">Notícias da Liga, guias dos módulos e publicações.</p>
    <div class="blog-novidade blog-novidade--cartoes" data-blog-novidade="3" hidden></div>
    <a class="pub-botao pub-botao--secundario" href="blog.html">Ir para o blog</a>
  </section>
</main>
```
JSON-LD (um `<script type="application/ld+json">` no `<head>`): `Organization` com `name` "LAIFT", `alternateName` (nome completo),
`url` `https://laift.com.br/liga`, `email`, `sameAs` [Instagram], `location`: `Place` com `name` "UNINASSAU – Centro Universitário Maurício de Nassau",
`address` (`PostalAddress`: `streetAddress` "Rua Direita da Piedade, 358", `addressLocality` "Salvador", `addressRegion` "BA",
`postalCode` "40070-190", `addressCountry` "BR") e `geo` (`GeoCoordinates` -12.98658, -38.51689).

`footer.pub-rodape` (as três páginas da Liga):
```html
<footer class="pub-rodape">
  <p class="pub-rodape__marca">LAIFT · Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia</p>
  <p class="pub-rodape__local">UNINASSAU – Centro Universitário Maurício de Nassau · Salvador, Bahia</p>
  <ul class="pub-rodape__links"><li><a href="liga.html">Conheça a LAIFT</a></li><li><a href="processo-seletivo.html">Processo seletivo</a></li>
    <li><a href="edital.html">Edital</a></li><li><a href="blog.html">Blog</a></li><li><a href="termos.html">Termos de Uso</a></li><li><a href="privacidade.html">Privacidade</a></li></ul>
  <p class="pub-rodape__copy">© 2026 LAIFT</p>
</footer>
```

## 3. `processo-seletivo.html` (aba de instruções) — esqueleto
`<body class="pub-pagina ps-pagina">` → `a.pub-pular` → `header.pub-barra` (voltar `href="liga.html"`) → `main#conteudo.ps-conteudo` → `nav.ps-cta` → `footer.pub-rodape`.
```html
<main id="conteudo" class="ps-conteudo">
  <section class="pub-sec ps-topo" aria-labelledby="ps-titulo">
    <p class="ps-topo__selo">Processo seletivo 2026</p>
    <h1 id="ps-titulo">Instruções do processo seletivo</h1>
    <p class="ps-topo__texto">Leia os passos, confira as datas e, com as inscrições abertas, participe pelo formulário oficial.</p>
    <p id="liga-status" class="pub-status" data-estado="fechado" aria-live="polite">Inscrições fechadas no momento. Acompanhe @laift.liga.</p>
  </section>
  <section id="antes" class="pub-sec" aria-labelledby="antes-t"><h2 id="antes-t">Antes de começar</h2>
    <ol class="ps-passos"><li class="ps-passo">…</li> (5, §11; o 1º com <a href="edital.html">edital</a>)</ol></section>
  <section id="etapas" class="pub-sec" aria-labelledby="etapas-t"><h2 id="etapas-t">Etapas</h2>
    <ol class="ps-linha">
      <li class="ps-etapa" data-carater="eliminatoria"><span class="ps-etapa__tag">Eliminatória</span><h3 class="ps-etapa__titulo">Inscrição e ficha diagnóstica</h3>
        <p class="ps-etapa__texto">…</p><p class="ps-etapa__data">Datas: <span data-ciclo-data="inscricoes">a divulgar</span></p></li>
      (2ª: eliminatoria, "Análise de perfil e filtro crítico", data-ciclo-data="analise"; 3ª: data-carater="classificatoria", tag "Classificatória",
      "Divulgação dos selecionados", data-ciclo-data="resultado")
    </ol></section>
  <section id="duvidas" class="pub-sec" aria-labelledby="duvidas-t"><h2 id="duvidas-t">Dúvidas frequentes</h2>
    <div class="ps-faq">
      <details class="ps-faq__item" id="faq-inscricao"><summary class="ps-faq__pergunta">Como se inscrever</summary><div class="ps-faq__resposta"><p>…</p></div></details>
      (ids: faq-inscricao, faq-quem, faq-quando, faq-vagas, faq-resultado; perguntas exatamente: "Como se inscrever", "Quem pode participar?",
      "Quando são as inscrições?", "Quantas vagas há?", "Como acompanho o resultado?")
    </div></section>
  <section id="edital-resumo" class="pub-sec ps-edital" aria-labelledby="edital-resumo-t"><h2 id="edital-resumo-t">Edital 2026</h2>
    <p>…</p><ul class="ps-edital__lista"><li>…</li>(3)</ul><a class="pub-botao pub-botao--secundario" href="edital.html">Abrir o edital</a></section>
</main>
<nav class="ps-cta" aria-label="Inscrição">
  <a id="liga-cta-inscricao" class="pub-botao pub-botao--primario ps-cta__principal" data-formulario data-se-aberto hidden target="_blank" rel="noopener noreferrer">Participar do processo seletivo<span class="laift-sr-only"> (abre em nova aba)</span></a>
  <p class="ps-cta__fechado" data-se-fechado>Inscrições fechadas no momento.</p>
  <a class="pub-botao pub-botao--secundario ps-cta__edital" href="edital.html">Abrir o edital</a>
</nav>
```
`main` tem espaço no fim para a barra fixa: `padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px))`.

## 4. `edital.html` — esqueleto
`<body class="pub-pagina ed-pagina">` → `a.pub-pular` → `header.pub-barra` (voltar `href="processo-seletivo.html"`) → `main#conteudo.ed-doc` → `footer.pub-rodape`.
```html
<main id="conteudo" class="ed-doc">
  <header class="ed-cabecalho">
    <p class="ed-cabecalho__selo">Edital 2026</p>
    <h1>Edital do Processo Seletivo de Membros 2026</h1>
    <p class="ed-cabecalho__sub">LAIFT · Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia · UNINASSAU, Salvador, Bahia</p>
    <p id="liga-status" class="pub-status" data-estado="fechado" aria-live="polite">Inscrições fechadas no momento. Acompanhe @laift.liga.</p>
    <div class="ed-acoes">
      <button class="pub-botao pub-botao--secundario" type="button" data-imprimir hidden>Imprimir ou salvar em PDF</button>
      <a class="pub-botao pub-botao--primario" data-formulario data-se-aberto hidden target="_blank" rel="noopener noreferrer">Participar do processo seletivo<span class="laift-sr-only"> (abre em nova aba)</span></a>
    </div>
  </header>
  <nav class="ed-sumario" aria-labelledby="ed-sumario-t"><h2 id="ed-sumario-t">Sumário</h2><ol class="ed-sumario__lista"><li><a href="#ed-apresentacao">Apresentação</a></li> …(10)</ol></nav>
  <section class="ed-secao" id="ed-apresentacao" aria-labelledby="ed-apresentacao-t"><h2 id="ed-apresentacao-t">1. Apresentação</h2> … </section>
  (ids na ordem: ed-apresentacao, ed-requisitos, ed-vagas, ed-etapas, ed-inscricao, ed-avaliacao, ed-compromissos, ed-privacidade, ed-canais, ed-disposicoes)
  <footer class="ed-rodape"><p>Dúvidas: <a href="mailto:laiftligauninassau@gmail.com">laiftligauninassau@gmail.com</a></p>
    <a class="pub-botao pub-botao--secundario" href="processo-seletivo.html">Ver as instruções</a></footer>
</main>
```
Tabela de etapas: `<table class="ed-tabela"><caption>Etapas e datas</caption><thead><tr><th scope="col">Etapa</th><th scope="col">O que acontece</th>
<th scope="col">Quando</th><th scope="col">Caráter</th></tr></thead><tbody>…</tbody></table>`, com `data-ciclo-data` na coluna "Quando"
e cada `<td data-rotulo="Etapa|O que acontece|Quando|Caráter">` (rótulo da coluna, usado no celular).
Vagas: `<span data-ciclo-vagas>a divulgar</span>`. Conteúdo: ficha E1.

## 5. Estado do processo seletivo (`liga.js`, nas três páginas)
- Lê `liga-ciclo.json` (`{ ciclo, formularioUrl, vagas, datas: { inscricoes, analise, resultado }, atualizadoEm }`) e a flag pública
  `selection_open` (`apiGetFeatureFlags` com `args: ['']`, mesmo mapa de hosts de hoje, 5 s de limite). Regras de hoje mantidas:
  flag `null` = erro; `false` = fechado; `true` sem `formularioUrl` com prefixo `https://docs.google.com/forms/` ou `https://forms.gle/` = erro.
- Pinta: `<html data-processo="aberto|fechado|erro">`; `#liga-status` (`data-estado` + texto: aberto "Processo seletivo aberto",
  fechado "Inscrições fechadas no momento. Acompanhe @laift.liga.", erro "Não foi possível verificar agora.");
  `[data-se-aberto]` → `hidden` salvo se aberto; `[data-se-fechado]` → `hidden` só se aberto; `a[data-formulario]` → `href` = formularioUrl se aberto;
  `[data-ciclo-data="chave"]` e `[data-ciclo-vagas]` → texto do JSON quando for string não vazia.
- `[data-imprimir]`: tira o `hidden` e, no clique, `window.print()`.
- Exporta para teste no Node (padrão de `pwa.js`): `decidirEstado`, `isFormUrlValida`.

## 6. Instituição, prédio e mapa (`liga.html` + `liga-mapa.js` + `icons/predio-instituicao.svg`)
```html
<section id="instituicao" class="pub-sec lp-instituicao" aria-labelledby="instituicao-t">
  <h2 id="instituicao-t">Nossa instituição</h2><p class="lp-lead">A LAIFT atua na UNINASSAU, em Salvador, Bahia.</p>
  <div class="lp-instituicao__grade">
    <figure class="lp-instituicao__figura">
      <img class="lp-instituicao__predio" src="icons/predio-instituicao.svg" alt="Ilustração do prédio da UNINASSAU, de quatro andares, com o número 358 na entrada" width="320" height="360" decoding="async">
    </figure>
    <div class="lp-instituicao__dados">
      <p class="lp-instituicao__sigla">UNINASSAU</p>
      <h3 class="lp-instituicao__nome">Centro Universitário Maurício de Nassau</h3>
      <p class="lp-instituicao__endereco">Rua Direita da Piedade, 358<br>Salvador, Bahia<br>CEP 40070-190</p>
      <p class="lp-instituicao__site"><a href="https://www.uninassau.edu.br" target="_blank" rel="noopener noreferrer">www.uninassau.edu.br<span class="laift-sr-only"> (abre em nova aba)</span></a></p>
      <a class="pub-botao pub-botao--primario lp-mapa__app" data-mapa-app href="geo:-12.98658,-38.51689?q=-12.98658,-38.51689(UNINASSAU)">Abrir no app de mapas</a>
      <ul class="lp-mapa__links" aria-label="Abrir em outro serviço de mapas">
        <li><a class="lp-mapa__link" href="https://www.google.com/maps/search/?api=1&amp;query=-12.98658%2C-38.51689" target="_blank" rel="noopener noreferrer">Google Maps<span class="laift-sr-only"> (abre em nova aba)</span></a></li>
        <li><a class="lp-mapa__link" href="https://maps.apple.com/?ll=-12.98658,-38.51689&amp;q=UNINASSAU&amp;z=17" target="_blank" rel="noopener noreferrer">Apple Mapas<span class="laift-sr-only"> (abre em nova aba)</span></a></li>
        <li><a class="lp-mapa__link" href="https://www.openstreetmap.org/?mlat=-12.98658&amp;mlon=-38.51689#map=18/-12.98658/-38.51689" target="_blank" rel="noopener noreferrer">OpenStreetMap<span class="laift-sr-only"> (abre em nova aba)</span></a></li>
      </ul>
    </div>
  </div>
  <div class="lp-mapa" id="mapa-instituicao" data-lat="-12.98658" data-lon="-38.51689">
    <div class="lp-mapa__capa">
      <span class="lp-emoji lp-mapa__pino" aria-hidden="true">📍</span>
      <p class="lp-mapa__aviso">O mapa interativo é do OpenStreetMap e só carrega quando você pedir. Ao carregar, o OpenStreetMap recebe o endereço IP do seu aparelho.</p>
      <button class="pub-botao pub-botao--secundario lp-mapa__carregar" type="button" hidden>Ver o mapa aqui</button>
    </div>
    <p class="laift-sr-only" data-mapa-status aria-live="polite"></p>
  </div>
</section>
```
`liga-mapa.js`:
- Lê e valida `data-lat`/`data-lon` (número, -90..90 e -180..180); inválido = não faz nada. Tira o `hidden` de `.lp-mapa__carregar`.
- Clique: troca `.lp-mapa__capa` por `<iframe class="lp-mapa__frame">` com
  `src = https://www.openstreetmap.org/export/embed.html?bbox=-38.51939%2C-12.98818%2C-38.51439%2C-12.98498&layer=mapnik&marker=-12.98658%2C-38.51689`
  (bbox = lon−0,0025, lat−0,0016, lon+0,0025, lat+0,0016, calculado dos atributos), `title="Mapa do OpenStreetMap: UNINASSAU, Rua Direita da Piedade, 358, Salvador"`,
  `referrerpolicy="strict-origin-when-cross-origin"` (a política de tiles exige Referer), `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`,
  mais `<p class="lp-mapa__credito">© <a href="https://www.openstreetmap.org/copyright" ...>colaboradores do OpenStreetMap</a></p>`; status "Mapa carregado."
  Nenhuma requisição a terceiro antes do clique.
- `a[data-mapa-app]`: `destinoDoApp({ ua, platform, maxTouchPoints })` → `ios` (iPhone/iPad/iPod, ou `MacIntel` com toque) usa a URL do Apple
  Mapas; `android` mantém `geo:`; `outro` usa a do Google Maps com `target="_blank" rel="noopener noreferrer"`.
- Exporta para o Node: `destinoDoApp`, `urlsDoMapa(lat, lon, rotulo)` → `{ geo, apple, google, osm, embed }`.

Prédio (`icons/predio-instituicao.svg`, ficha S1): `viewBox="0 0 320 360"`, estilo emoji (formas cheias, cantos arredondados, contorno
`#1c2333` de 3 a 4 px), placa circular `#e1f4f0` atrás (lê bem no claro e no escuro, como a placa da marca), 4 andares (térreo com porta
dupla e plaqueta "358" + 3 andares de janelas), faixa com o texto "UNINASSAU", árvores, calçada e um pino de mapa sobre o telhado.
Paleta fixa (valores dos tokens): `#0f6f62 #0b5349 #e1f4f0 #3fcfb6 #fafaf7 #edebe5 #e4e1d8 #1c2333 #5b6478 #ffc857 #e5effc #7be3a0 #1e6b3c #8f6b09 #ca545d #ffffff`.
Sem `style`, `<style>`, `<script>`, `<image>`, `href` externo; `<title>` e `<desc>` em português; até 12 KB; logo da UNINASSAU não é copiado.

## 7. Aviso do blog (`blog-novidade.js` + `blog-novidade.css`)
- Contêiner: `<div class="blog-novidade blog-novidade--faixa|--cartoes" data-blog-novidade="N" hidden>` (N = 1 na tela inicial, 3 em `/liga`).
  Opcional `data-blog-indice` (padrão `blog/index.json`, relativo à página).
- Escolha (`escolherNovidades(posts, n)`): ordena por `data` decrescente; empate → `serie === 'campanhas'` primeiro; depois a ordem do índice.
  Ignora item sem `titulo`/`data` string ou com `href` fora de `^blog\/[a-z0-9-]+\.html$`.
- `ehNova(post, agoraMs, vistoSlug)`: `true` se `agoraMs − data` ≤ 14 dias e `post.slug !== vistoSlug`. Clique num item grava
  `localStorage.laift_blog_visto = slug` (try/catch).
- Item (N = 1 e N > 1): `<a class="blog-novidade__item" href="blog/<slug>.html"><span class="blog-novidade__selo">Nova publicação no blog</span>
  <span class="blog-novidade__titulo">…</span><span class="blog-novidade__resumo">…</span><span class="blog-novidade__meta">Publicações · 9 de outubro de 2026</span></a>`.
  Selo: "Nova publicação no blog" se `ehNova`; senão, com N = 1, "Do blog"; com N > 1, sem selo. Resumo só com N > 1.
  N > 1: `<ul class="blog-novidade__lista"><li>(item)</li>…</ul>`. Série: liga "A Liga", modulos "Módulos", plataforma "Plataforma",
  campanhas "Publicações". Data: `toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })`.
- Sucesso: tira o `hidden`. Qualquer falha: continua escondido, sem `console.error` e sem exceção.
- Exporta para o Node: `escolherNovidades`, `ehNova`, `hrefValido`, `rotuloSerie`.

## 8. Blog instalável
`blog/manifest.webmanifest` (a sessão principal grava **exatamente** isto):
```json
{
  "id": "/blog",
  "name": "Blog LAIFT – Conheça a LAIFT",
  "short_name": "Blog LAIFT",
  "description": "O blog da LAIFT, Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia: a Liga, os módulos da plataforma e as publicações.",
  "lang": "pt-BR",
  "dir": "ltr",
  "start_url": "/blog",
  "scope": "/blog",
  "display": "standalone",
  "theme_color": "#0f6f62",
  "background_color": "#fafaf7",
  "categories": ["education", "news"],
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
- `blog-sw.js` (raiz): `CACHE_PREFIX = 'laift-blog-'`, `CACHE_NAME = 'laift-blog-v1'`. Rede primeiro; guarda só resposta `ok` e `basic`;
  chave normalizada `chaveDe(url)` = caminho sem `.html` no fim (`/blog.html` e `/blog` viram `/blog`); navegação offline sem cópia →
  `/blog/404.html`. Nunca trata: outra origem, não-GET, `Range`, o próprio `/blog-sw.js`. Na ativação apaga só `laift-blog-*` antigos
  (nunca `laift-shell-*` nem o cache do Atlas). Precache (item que falhar é ignorado): `/blog`, `/blog.css`, `/blog-campanha.css`,
  `/publico.css`, `/static-page.js`, `/modulos/shared/laift-tokens.css`, `/modulos/cracha/laift-marca.png`, `/blog/icones.svg`,
  `/blog/feed.js`, `/blog/welcome.js`, `/blog/post.js`, `/blog/contato.js`, `/blog/campanha.js`, `/blog/instalar.js`, `/blog/index.json`,
  `/blog/404.html`, `/blog/manifest.webmanifest`, `/icons/icon-192.png`, `/icons/favicon-32.png`. Exporta para o Node (padrão de `sw.js`):
  `CACHE_PREFIX`, `CACHE_NAME`, `PRECACHE`, `chaveDe`, `shouldHandle`, `shouldStore`, `isStaleCache`.
- `blog/instalar.js` (script clássico, sem `import`/`export`): registra `/blog-sw.js` com `{ scope: '/blog' }` só com suporte, em
  https ou localhost e fora de automação (`navigator.webdriver`), como `pwa.js`. Botões `[data-instalar]` nascem `hidden`.
  `beforeinstallprompt` → `preventDefault`, guarda o evento, mostra os botões; clique → `prompt()` e espera `userChoice`; `appinstalled` → esconde.
  iPhone/iPad sem modo app → mostra os botões; clique abre `<dialog class="pub-instalar-dialogo" aria-labelledby="pub-instalar-t">` criado
  pelo script: `h2#pub-instalar-t` "Instalar o blog no iPhone ou iPad", `ol` com "Toque em Compartilhar, o quadrado com a seta, na barra do
  Safari." / "Escolha Adicionar à Tela de Início." / "Toque em Adicionar.", e `button.pub-botao.pub-botao--primario` "Entendi" (fecha).
  Já instalado (`display-mode: standalone` ou `navigator.standalone`) → botões continuam escondidos. Exporta: `ehIos`, `estaInstalado`, `deveRegistrar`.
- `blog.html`, no `div.blog-hero__acoes`: o botão "Processo seletivo" passa a `href="/processo-seletivo.html"` e entra
  `<button class="blog-botao blog-botao--secundario" type="button" data-instalar hidden>Instalar o blog</button>`.

## 9. Voltar dentro do app (`voltar-app.js` + `voltar-app.css`)
- Na carga, insere como **primeiro filho** de cada `#app-root .app-main > section` (menos `#panel-home`):
  `<button type="button" class="app-voltar" data-voltar-app aria-label="Voltar para Início"><svg class="app-voltar__icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6"/></svg><span>Voltar</span></button>`.
- Pilha imutável (máx. 20) alimentada por `laift:panelchange` (`detail.panel`). Escopo = `admin` se o id começa com `panel-admin-`, senão `membro`;
  troca de escopo ou `panel-home` zera a pilha com o painel atual. Clique: destino = painel anterior da pilha; sem anterior → `panel-home`
  (membro) ou `panel-admin-dashboard` (admin); estando no `panel-admin-dashboard` sem anterior → clica `#btn-exit-admin-mode`.
  Navega com `window.App.showPanel(destino)` sem empilhar de novo. `aria-label` = "Voltar para " + nome do destino (texto do
  `#app-nav [data-panel="…"] span`; sem botão, "Início").
- Em `#panel-learn`, o `.app-voltar` fica `hidden` enquanto um módulo está aberto (`laift:modulechange` com `detail.module` não vazio);
  ali o voltar é o `#learn-back` "← Voltar".
- CSS: pílula ≥ 44 px, ícone 20 px, `--layer-2`/`--laift-text`, peso 700, margem inferior 12 px. Sobrescreve o estilo global de `button` de
  `styles.css` (largura 100 %, fundo da marca) com o seletor `.app-main > section > .app-voltar` (`width: auto`, `background`, `color`, `border: 0`, `box-shadow: none`).
- Exporta para o Node: `escopoDe`, `registrar(pilha, painel)` (devolve pilha nova), `destinoDoVoltar(pilha)` → `{ painel }` ou `{ sairDoAdmin: true }`.

## 10. CSS: arquivos, prefixos e medidas
- `publico.css` (D1): `.pub-pagina` (fundo `--layer-0`, texto `--laift-text`, `--laift-font`, 1rem/1,5), `main` com `max-width: 1120px`, margem
  lateral 16 px (24 px ≥ 760), `.pub-pular`, `.pub-barra*`, `.pub-voltar*`, `.pub-icone`, `.pub-instalar`, `.pub-instalar-dialogo` (+ `::backdrop`
  com `--laift-overlay`), `.pub-sec` (fundo `--layer-1`, raio 28 px, respiro 20 px / 32 px ≥ 760, `--elev-1`, gap 16 px entre seções; `h2`
  1,375rem, `h3` 1,0625rem), `.pub-botao` (pílula ≥ 44 px, `inline-flex`, gap 8, peso 700, sem sublinhado) `--primario` (marca) `--secundario`
  (`--layer-2`), `.pub-status[data-estado]` (fechado: `--layer-2`/`--laift-muted`; aberto: `--laift-primary-soft`/`--laift-primary`; erro:
  `--laift-danger-soft`/`--laift-danger`), `.pub-rodape` (links ≥ 44 px), e `.pub-pagina [hidden], .pub-barra [hidden], [data-instalar][hidden] { display: none !important; }`.
- `processo.css` (D1): `.ps-*` (topo, passos numerados por contador, linha do tempo em 3 colunas ≥ 760, tag "Eliminatória" em
  `--laift-danger-soft` e "Classificatória" em `--laift-primary-soft` via `[data-carater]`, FAQ com `summary` ≥ 44 px e seta que gira
  com `transform`, `.ps-cta` fixa embaixo com área segura) e `.ed-*` (documento com largura de leitura ~70ch, sumário, seções; abaixo de
  600 px a `.ed-tabela` vira lista empilhada: `thead` escondido visualmente, `tr`/`td` em `display: block` e o nome da coluna em
  `td::before { content: attr(data-rotulo) }`), e `@media print` (esconde barra, CTA, rodapé e botões; texto preto sobre branco;
  `a[href^="http"]::after { content: " (" attr(href) ")" }`).
- `liga.css` (D2): só `.lp-*`. Medidas-chave: hero com 2 colunas ≥ 900 (texto | marca), fundo `--layer-1` com dois `radial-gradient` de
  `color-mix(in srgb, var(--laift-primary) 12%, transparent)`, raio 32 px; `.lp-hero__sigla` `clamp(3rem, 12vw, 5.5rem)` peso 800 cor
  `--laift-primary`; `.lp-hero__nome` `clamp(1.125rem, 3.6vw, 1.5rem)`; marca em placa circular fixa `#fafaf7` de 112 px (168 px ≥ 900).
  `.lp-secoes` fixa no topo (`position: sticky; top: 0`; ≥ 760 px, abaixo da barra: `top: 64px`), chips roláveis na horizontal.
  `.lp-cards`: celular = `display: flex; overflow-x: auto; scroll-snap-type: x mandatory`, cartão `flex: 0 0 min(78%, 280px)`, `min-height: 320px`,
  `scroll-snap-align: start`; ≥ 1024 = grade `repeat(4, minmax(0, 1fr))`. `.lp-areas__lista`: 1 coluna, 2 ≥ 600, 4 ≥ 1024; emoji num círculo de
  52 px. `.lp-funciona__grade`: 2 colunas ≥ 900. `.lp-diferencial`: `--laift-primary-soft`. `.lp-instituicao__grade`: 2 colunas ≥ 900;
  prédio `max-width: 320px` centralizado. `.lp-mapa`: `aspect-ratio: 4 / 3` (16 / 9 ≥ 760), `--layer-2`, raio 28 px; `.lp-mapa__frame`
  100 % × 100 %, `border: 0`. Entrada do hero: `@keyframes` só com `opacity`/`transform` (`--dur-slow`, `--ease-out`). Revelação ao rolar só em
  `@supports (animation-timeline: view())` dentro de `@media (prefers-reduced-motion: no-preference)`, em `.pub-sec`.
- `blog-novidade.css` (J3), `voltar-app.css` (V1): só os seus prefixos.
- Nada de rolagem horizontal da página em 375 px (`scrollWidth ≤ 375`). Contraste AA garantido pelos tokens; texto sobre emoji não existe.

## 11. Textos fixos (copie; não invente fatos)
- `liga.html` — título: "Conheça a LAIFT · Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia"; descrição: "LAIFT, Liga Acadêmica
  Interdisciplinar de Farmacologia e Toxicologia: quem somos, áreas de interesse, como funciona, processo seletivo, edital, contato e a nossa
  instituição, a UNINASSAU, em Salvador."
- Quem somos (lead): "Uma liga acadêmica que une estudantes da saúde para aprender, pesquisar e levar a ciência adiante." Cartões (emoji · título · texto):
  1. 🎓 Liga acadêmica · Somos a LAIFT, a Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia.
  2. 🔬 Ensino, pesquisa e extensão · Reunimos estudantes em atividades para o desenvolvimento técnico-científico das ciências farmacológicas.
  3. 🌟 Nossos valores · Excelência acadêmica, interdisciplinaridade e proatividade.
  4. 🧭 Como trabalhamos · Com compromisso ético, análise baseada em evidências e respeito aos cronogramas.
  5. 🤝 Interdisciplinar · Farmácia, Biomedicina, Medicina, Nutrição, Enfermagem e outros cursos da saúde aprendem juntos.
  6. 💻 Plataforma de membros · Quiz, casos clínicos, laboratório virtual e atlas 3D para estudar no seu ritmo.
  7. 🏛️ Onde estamos · UNINASSAU, Centro Universitário Maurício de Nassau, em Salvador, Bahia. (+ link "Ver no mapa")
- Áreas (lead): "Temas em que a Liga atua e que você pode escolher ao se inscrever." Itens (emoji · nome · texto):
  💊 Farmacologia e Toxicologia · Como os medicamentos agem no corpo e quando passam a fazer mal. — 🌎 Saúde coletiva e pessoal · Cuidado com a
  saúde da comunidade e de cada pessoa. — 🩺 Atenção farmacêutica e automedicação · Uso responsável de medicamentos, com orientação profissional. —
  ⚠️ Interação medicamentosa e farmacovigilância · Combinações de risco e acompanhamento de efeitos adversos. — 📝 Pesquisa, escrita e publicação
  científica · Do método ao artigo: pesquisar, escrever e publicar. — 🏥 Farmacologia clínica e terapêutica · Tratamentos baseados em evidências
  na prática clínica. — 🌿 Toxicologia ambiental e ocupacional · Substâncias do ambiente e do trabalho que afetam a saúde. — 📣 Comunicação
  científica e extensão · A ciência fora da sala de aula.
- Como funciona (lead): "Fazer parte da LAIFT é um compromisso. Em troca, você ganha experiência, conexões e novas formas de aprender."
  Compromissos: Responsabilidade organizacional · Cumprir os prazos e entregar as tarefas com qualidade. — Conduta ética e colaborativa · Respeitar a
  diversidade de ideias, com postura cordial e profissional. — Preservação institucional · Zelar pela imagem da Liga e da instituição, no digital e
  no presencial. — Confidencialidade · Proteger informações científicas, estratégicas e dados pessoais dos projetos. — Participação ativa · Estar
  presente nas atividades programadas. Faltas sem justificativa e o descumprimento contínuo das normas levam ao desligamento.
  Benefícios: 🧠 Novas formas de aprender · Casos clínicos, laboratório virtual, atlas 3D e quiz na plataforma da Liga. — 🤝 Networking · Conexões
  com estudantes de vários cursos da saúde e com quem participa das atividades da Liga. — 🚀 Projetos e capacitações · Atividades de ensino,
  pesquisa e extensão. — 📝 Escrita científica · Prática de pesquisa, escrita e publicação científica. — 🔓 Mais acesso na plataforma · Membros
  usam Tarefas, Equipe e Mensagens, além dos módulos de estudo. — ⭐ Destaque no currículo · A experiência em liga acadêmica soma à sua trajetória.
  Diferencial: "Uma liga interdisciplinar com plataforma digital própria: você estuda, fala com a equipe e acompanha a Liga em um só lugar."
- Processo (lead em `/liga`): "Três etapas, com instruções, datas e edital na página do processo."
- Edital (lead em `/liga`): "Regras, etapas, avaliação, compromissos e privacidade em um só documento."
- `processo-seletivo.html` — título: "Processo seletivo 2026 · LAIFT"; descrição: "Instruções do processo seletivo da LAIFT: antes de começar,
  etapas, dúvidas frequentes, edital e o formulário oficial de inscrição."
  Antes de começar: 1. Leia o edital. 2. Separe seus dados acadêmicos: instituição, curso e semestre. 3. Veja sua disponibilidade semanal: horas,
  dias e turnos. 4. Prepare a análise de cenário: um mecanismo, uma evidência ou uma notícia recente, com a sua escolha e o impacto.
  5. Nos campos de texto livre, não escreva dados de saúde, seus ou de terceiros.
  Etapas (texto): 1. Você preenche o formulário oficial com seus dados, seu perfil e a análise de cenário. 2. A comissão organizadora avalia cada
  inscrição. Os detalhes chegam por e-mail. 3. O resultado sai nos canais oficiais e por e-mail.
  FAQ: Como se inscrever → "Leia o edital e, com as inscrições abertas, toque em Participar do processo seletivo, no fim desta página. O formulário
  oficial abre em nova aba e tem quatro seções. A última pede a sua análise de cenário." — Quem pode participar? → "Estudantes matriculados ou que
  já concluíram um curso da área da saúde ou correlato, como Farmácia, Biomedicina, Medicina, Nutrição e Enfermagem. É preciso ter disponibilidade
  semanal para atividades, reuniões e projetos da Liga." — Quando são as inscrições? → "Período de inscrições: <span data-ciclo-data="inscricoes">a
  divulgar</span>. Com as inscrições abertas, o botão Participar do processo seletivo aparece nesta página e a Liga avisa no Instagram @laift.liga."
  — Quantas vagas há? → "Vagas: <span data-ciclo-vagas>a divulgar</span>. O número aparece aqui e no edital." — Como acompanho o resultado? → "A Liga
  divulga os selecionados pelos canais oficiais, como o Instagram @laift.liga, e por e-mail, no endereço que você informar na inscrição."
  Resumo do edital: "Regras, etapas, avaliação, compromissos e privacidade em um só documento." Lista: "Quem pode participar e como se inscrever" ·
  "Etapas, datas e avaliação" · "Compromissos do membro e privacidade dos dados".
- `edital.html` — título: "Edital do Processo Seletivo 2026 · LAIFT"; descrição: "Edital do Processo Seletivo de Membros 2026 da LAIFT: requisitos,
  vagas, etapas, inscrição, avaliação, compromissos, privacidade e canais oficiais." Conteúdo: ficha E1.

## 12. Integração da sessão principal (arquivos quentes; aplicar como está)
1. **`index.html` — faixa da tela de entrada** (hoje linhas 114-118): manter as classes e trocar por
```html
<div class="welcome-liga">
  <p class="welcome-liga__aviso">Processo seletivo aberto</p>
  <a class="link-btn welcome-liga__link" href="liga.html">Conheça a LAIFT</a>
  <a class="link-btn welcome-liga__blog" href="blog.html">Blog: conheça a plataforma</a>
  <div class="blog-novidade blog-novidade--faixa" data-blog-novidade="1" hidden></div>
</div>
```
2. **`index.html` — voltar no topo do cadastro e do "Esqueci"**: primeiro filho de `#screen-register` e de `#screen-forgot`:
   `<button type="button" class="link-btn auth-voltar" data-nav="screen-welcome">← Voltar</button>`.
   **`#learn-back`** (hoje linha 390): texto `← Voltar` e `aria-label="Voltar para os módulos"` (id e classes iguais).
3. **`index.html` — `<head>` e scripts**: depois de `splash.css`, `<link rel="stylesheet" href="blog-novidade.css">` e
   `<link rel="stylesheet" href="voltar-app.css">`; antes de `app.js`, `<script src="blog-novidade.js" defer></script>` e `<script src="voltar-app.js" defer></script>`.
4. **`app.js` — atalhos de URL** (antes de `(function init() {`, hoje linha 2621):
```js
  // Atalhos de URL das telas públicas (barras do blog e da Liga): /#cadastro abre o cadastro e
  // /#entrar o login com o foco no e-mail. O hash sai da URL depois de usado.
  var PUBLIC_HASH_SCREENS = { '#cadastro': 'screen-register', '#entrar': 'screen-welcome' };
  function openPublicScreenFromHash() {
    var hash = window.location.hash || '';
    var screenId = PUBLIC_HASH_SCREENS[hash] || 'screen-welcome';
    if (PUBLIC_HASH_SCREENS[hash]) {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* ignora */ }
    }
    showPublicScreen(screenId);
    if (hash === '#entrar') {
      var email = document.getElementById('login-email');
      if (email) email.focus();
    }
  }
  window.addEventListener('hashchange', function () {
    if (!state.sessionToken && PUBLIC_HASH_SCREENS[window.location.hash]) openPublicScreenFromHash();
  });
```
   e, no fim de `init()` (hoje linha 2667), `showPublicScreen('screen-welcome');` → `openPublicScreenFromHash();`.
5. **`scripts/build.js`**: na lista de cópia, acrescentar `'processo-seletivo.html', 'edital.html', 'publico.css', 'processo.css', 'liga-mapa.js',
   'blog-novidade.js', 'blog-novidade.css', 'voltar-app.js', 'voltar-app.css', 'blog-sw.js'` (`icons/` e `blog/` já vão inteiros). Depois da cópia de `_headers`:
```js
// /favicon.ico para quem pede o ícone sem ler o <head>: ICO com uma imagem PNG de 32x32 (icons/favicon-32.png).
{
  const png = fs.readFileSync(path.join(ROOT, 'icons', 'favicon-32.png'));
  const cabecalho = Buffer.alloc(22);
  cabecalho.writeUInt16LE(1, 2); cabecalho.writeUInt16LE(1, 4);
  cabecalho.writeUInt8(32, 6); cabecalho.writeUInt8(32, 7);
  cabecalho.writeUInt16LE(1, 10); cabecalho.writeUInt16LE(32, 12);
  cabecalho.writeUInt32LE(png.length, 14); cabecalho.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(DIST, 'favicon.ico'), Buffer.concat([cabecalho, png]));
}
```
6. **`sw.js`**: `CACHE_NAME` → `'laift-shell-v4'`; no `PRECACHE`, `'blog-novidade.js', 'blog-novidade.css', 'voltar-app.js', 'voltar-app.css'`.
7. **`termos.html`, `privacidade.html`, `404.html`**: depois do `<meta name="viewport">`, os 3 `<link>` de ícone de §0.2 (caminhos relativos).
   `404.html`: primeiro filho de `section.auth-card`: `<a class="back-link link-btn" href="./" data-history-back>&larr; Voltar</a>`.
8. **`blog/manifest.webmanifest`**: gravar o JSON de §8 (UTF-8, LF, sem BOM).
