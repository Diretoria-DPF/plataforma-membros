# Contrato visual e de marcação do blog LAIFT

Quem escreve `blog.css` (H2) e `blog.html`/`blog/feed.js` (H1) segue este contrato **ao pé da letra**: os nomes de classe,
ids e atributos abaixo são a ponte entre os arquivos. Páginas de post são geradas por `frontend/scripts/build-blog.js`
(não editar) e usam as classes `blog-*` que ele emite.

## Regras globais
- CSP de todas as páginas: `script-src 'self'; style-src 'self'` → **sem `<script>` inline, sem `style=""` no HTML, sem `innerHTML`**.
  O JS só altera estilo por CSSOM (`el.style.setProperty('--i', n)`) e cria nós com `createElement`/`textContent`.
- Módulos ES: `<script type="module" src="/blog/feed.js">`. Ícones: `<svg class="blog-icone" aria-hidden="true" focusable="false"><use href="/blog/icones.svg#ID"/></svg>`.
- Tokens: a página carrega `/modulos/shared/laift-tokens.css` antes de `/blog.css`. Usar `var(--...)` de lá (cores claro/escuro, `--dur-*`,
  `--ease-*`, `--laift-touch` = 44 px). Tema segue `prefers-color-scheme`; não há toggle.
- Movimento só em `transform` e `opacity`. `@media (prefers-reduced-motion: reduce)`: estado final visível (`opacity:1; transform:none`).
  Todo JS que anima checa `matchMedia('(prefers-reduced-motion: reduce)').matches` e pula.
- Toque: alvo ≥ 44 px; `:active` com `transform: scale(var(--press-scale, .98))` em tudo que é clicável; `:hover` só dentro de `@media (hover: hover)`.
- Vidro: véu quase opaco por padrão e `backdrop-filter` só dentro de `@supports (backdrop-filter: blur(1px))`.
- Sem fonte externa, sem imagem raster além de `/modulos/cracha/laift-marca.png` (logo, **sempre sobre placa clara**).
- Textos de interface em português do Brasil. Nenhuma palavra de status ("em revisão", "planejado" etc.) aparece na interface.
- Cabeçalho de copyright obrigatório em `.js` e `.css` (copiar de `frontend/scripts/build-blog.test.mjs:1-5`, em bloco `/* */`).

## Classes que o gerador já emite nos posts (H2 estiliza todas)
`blog-page blog-post blog-skip blog-topo blog-topo__marca blog-topo__contatos blog-topo__contato blog-icone blog-sr-only
blog-artigo blog-artigo__cabecalho blog-artigo__icone blog-artigo__resumo blog-artigo__meta blog-lista blog-destaque[data-tom=info|atencao]
blog-destaque__titulo blog-fatos(dl) blog-cta blog-botao blog-etapas blog-selo blog-cartoes blog-cartao blog-cartao__icone blog-cartao__foto
blog-cartao__nome blog-cartao__pendente blog-contato blog-contato__lista blog-contato__item[data-estado=pendente]`.
Post: `<header class="blog-topo">` colado no topo com marca à esquerda e `nav.blog-topo__contatos` à direita (cada `a.blog-topo__contato` = ícone + rótulo curto).
`.blog-artigo[data-serie=liga|modulos|plataforma]` pode ter um acento de cor por série. Texto de leitura: largura máx. ~68ch.

## Classes extras (post.js, welcome.js e blog.html)
- `.blog-progresso` (barra fixa no topo; `transform: scaleX(var(--p,0))`), `.blog-barra` (barra flutuante de vidro embaixo: contatos + `button.blog-topo-btn` "Voltar ao topo").
- `.blog-breadcrumbs` (`nav > ol > li`), `.blog-relacionados` (`ul > li > a.blog-card`), `.blog-nav-post` (`a.blog-nav-post__ant`, `a.blog-nav-post__prox`).
- `.blog-modal` (`<dialog>` de vidro), `.blog-modal__icone`, `.blog-modal__fechar`.
- `.blog-welcome` (overlay de vidro em tela cheia, z-index alto, `[hidden]` some, `.blog-welcome--saindo` faz fade-out 280 ms),
  `.blog-welcome__marca` (placa clara com o logo), `.blog-welcome__titulo` ("Bem-vindo à LAIFT"), `.blog-welcome__pular` (botão 44 px).

## Feed (`/blog.html`, `body.blog-page.blog-feed`)
```
a.blog-skip → #conteudo
div.blog-welcome#welcome[role=dialog][aria-modal=true][aria-label="Bem-vindo à LAIFT"][hidden]
  div.blog-welcome__marca > img[logo]   h2.blog-welcome__titulo   button.blog-welcome__pular "Pular"
header.blog-topo   (igual ao dos posts: marca + Instagram + E-mail; os dois como <a> com ícone e rótulo)
main#conteudo
  section.blog-hero > h1 "Conheça a LAIFT"  p.blog-hero__texto  div.blog-hero__acoes > a.blog-botao (Processo seletivo → /blog/processo-seletivo-2026.html)  a.blog-botao.blog-botao--secundario (Mapa da plataforma → #mapa)
  section.blog-mapa#mapa[aria-labelledby=t-mapa] > h2#t-mapa "Mapa da plataforma"  ul.blog-mapa__lista > li > button.blog-mapa__item[data-modulo=ID][type=button] (ícone grande + nome)
  section.blog-feed-area[aria-labelledby=t-feed]
    h2#t-feed "Todos os posts"
    div.blog-filtros[role=group][aria-label="Filtrar por assunto"] > button.blog-chip[type=button][aria-pressed=true|false][data-filtro=todos|liga|modulos|plataforma]
    div.blog-feed#feed[role=feed][aria-labelledby=t-feed][aria-busy=true]
      article.blog-card[aria-posinset][aria-setsize][data-serie] (--i definido via JS)
        a.blog-card__link[href=/blog/SLUG.html] > svg.blog-icone.blog-card__icone  h3.blog-card__titulo  p.blog-card__resumo  p.blog-card__meta (série · data · N min)
      div.blog-skeleton (3 a 6 cartões fantasma enquanto carrega; pulso só em opacity)
    p#feed-status.blog-sr-only[aria-live=polite]   ("6 de 18 posts")
    button#mais.blog-botao.blog-mais[type=button] "Carregar mais"   (some quando tudo está na tela)
    div#feed-sentinela[aria-hidden=true]   (IntersectionObserver; desligada quando tudo carregou)
  section.blog-contato-area > bloco de contato igual ao dos posts (h2 "Fale com a Liga" + ul.blog-contato__lista com 2 .blog-contato__item)
dialog.blog-modal#modal[aria-labelledby=modal-titulo]  (preenchido pelo feed.js; links só para posts do índice)
```
- Páginas de 6 cards. Filtro por série no cliente; com filtro ativo `aria-setsize` = tamanho da lista filtrada e o anúncio vira "4 de 4 posts".
- Falha ao carregar `/blog/index.json`: trocar o skeleton por "Não foi possível carregar os posts." + botão "Tentar novamente".
- `index.json`: `{ posts: [{ slug, titulo, resumo, data, tags, serie, icone, fixado, leitura_min, href }] }` (veja `indiceDe` em `scripts/build-blog.js`).
  `href` é relativo (`blog/SLUG.html`); no feed usar `'/' + href`.
- Contatos (cabeçalho, bloco e barra): Instagram `https://www.instagram.com/laift.liga` com `target="_blank" rel="noopener noreferrer"` e
  `aria-label="Instagram da LAIFT, abre em nova aba"`; e-mail `mailto:laiftligauninassau@gmail.com` com `aria-label="Enviar e-mail para a LAIFT"`.
  Ícones `#ig` e `#envelope` + rótulo de texto ("Instagram", "E-mail").

## Sprite `blog/icones.svg`
Arquivo externo, sem `style` inline. Raiz `<svg xmlns="http://www.w3.org/2000/svg">` com um `<symbol id="ID" viewBox="0 0 24 24">` por ícone, desenho próprio e simples,
traço (`fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"` em cada forma). IDs obrigatórios:
`inicio aprender eventos propostas tarefas equipe mensagens perfil quiz toxicologia clinica laboratorio anatomia cracha lia seguranca offline desempenho roteiro liga bemvindo novidades ig envelope`.
`ig` = quadrado arredondado + círculo + ponto; `envelope` = retângulo com aba em V. Base dos desenhos: `frontend/index.html:238-330`.
