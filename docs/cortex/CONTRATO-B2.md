# Contrato B2 · Biblioteca LAIFT: telas e comportamento (v1, 2026-10-10)

Dados e actions: `CONTRATO-B1.md` (formatos `PublicItem`, `ListItem`, `ArticleDetail`, `AdminArticle` no §4). Tarefas: `fichas/ORDEM.md`.
Regras de front que valem aqui: `docs/TIME_CONTRATO.md:12-21` (CSP, a11y, movimento, tokens) e as regras fixas 5-8 de `docs/ux-progresso/fichas/ORDEM.md`
(sem `innerHTML`, sem `style=""`, sem `@media (prefers-reduced-motion)` próprio, alvo ≥ 44 px, `:hover` só em `@media (hover: hover)`, cor só por token).
Linhas citadas conferidas no HEAD `2ad549c`. Caminhos relativos a `frontend/`, salvo indicação.

## 1. Decisões de interface (e o porquê)
| Tema | Decisão | Motivo |
|---|---|---|
| Página pública | **Uma página `/biblioteca`** (lista pré-renderizada no build + filtro no navegador). **Sem página por artigo.** | O público só pode ver título, autores, revista, ano e link (decisão 9): uma página por artigo seria conteúdo raso, repetindo a página oficial do DOI. As metas `citation_*` do Google Acadêmico (sugeridas no mapa 04 §3) são para quem hospeda o texto do artigo; usá-las num catálogo de terceiros seria indevido. Uma página só também tem um ponto de falha no build, não 100. Âncora por artigo: `/biblioteca#a-<id>`. |
| Item do menu | Grupo novo **"Estudo"** (`data-grupo="estudo"`) no fim de `#app-menu`, com um item "Biblioteca"; `data-scope="all"` | Conta `visitor` também vê o catálogo (é público); o resto é só de membro e o servidor decide. Barra inferior intocada. |
| Gate por flag | CSS no **contêiner do grupo**: `:root:not([data-flag-library-enabled]) #app-menu [data-grupo="estudo"] { display: none; }` em `app-menu.css` | `atualizar()` só olha a classe `hidden` (`app-menu.js:86-90`) e `setupNavigationForRole` reescreve `hidden` por papel (`app.js:1041-1047`). O atributo vem de `ux-v2.js:21-24`. Se um dia "Estudo" ganhar outro item, rever o gate. |
| Deslizar entre painéis | `panel-library` **fica fora** de `MEMBER_PANEL_ORDER` (`app.js:1157`) | Diverge do mapa 03 (item 3): a ordem usa só a classe `hidden` dos botões (`app.js:1159-1167`), então com a flag desligada o deslizar chegaria ao painel escondido por CSS. Além disso, filtros e citação têm rolagem horizontal. A Biblioteca abre pelo menu. |
| Aba admin | `panel-admin-library` **não** depende de `library_enabled` | A curadoria carrega 50 a 100 artigos antes do lançamento. |
| Citação | Gerada **no navegador** (`library-cite.js`, função pura), ABNT e Vancouver | Sem ida ao servidor; testável em `node --test`. |
| Dados do painel | Sempre da API (`apiLearnLibrary*`); sem cópia local | Resumo e favoritos são de membro; o instantâneo público não tem esses campos. |

## 2. Página pública `/biblioteca` (instantâneo estático)
### 2.1 Fluxo de dados
1. **Busca na CI** (`scripts/fetch-biblioteca.mjs`, só no job de deploy): `POST {BIBLIOTECA_API_URL}` com `{action:'apiLearnLibraryPublicCatalog', args:[]}`, timeout 15 s, valida o formato e grava `biblioteca/conteudo/recente.json` (fora do git: `.gitignore`). Falhou (rede, `success:false`, formato): avisa `::warning::` e sai com código 0. URL por ambiente no workflow: `main` → `https://api.laift.com.br/v1/`, `staging` → `https://staging-api.laift.com.br/v1/` (mesma regra de `liga.js:23-27`). Sem segredo: a action é pública.
2. **Reserva versionada** `biblioteca/conteudo/reserva.json` (commitada; nasce `{"versao":1,"enabled":false,"generatedAt":"2026-10-10T00:00:00Z","topics":[],"items":[]}`). Atualizar: `node scripts/fetch-biblioteca.mjs --out biblioteca/conteudo/reserva.json` + commit (runbook).
3. **Gerador** (`scripts/build-biblioteca.js`, chamado por `scripts/build.js` **depois** de `build-blog.js`, linha 111): usa `recente.json` se válido, senão `reserva.json`. Valida item a item (campo inválido → item descartado + aviso; **nunca** derruba o build do site, ao contrário do blog, `scripts/build-blog.js:429`). Só gera a página se `enabled === true` e houver ≥ 1 item válido; senão não emite nada (rota cai no 404) e tira a URL do sitemap.
4. **Saída** em `dist/`: `biblioteca.html` (responde em `/biblioteca`, padrão `auto-trailing-slash`, mapa 04 §2), `biblioteca/index.json`, `biblioteca/catalogo.js` (copiado), URL entre `<!-- biblioteca:inicio -->`/`<!-- biblioteca:fim -->` no `sitemap.xml` (mesmo padrão de `atualizarSitemap`, `scripts/build-blog.js:254-265`) e uma linha em `llms.txt` (entre marcadores iguais, em comentário HTML).
5. **Frescor**: `.github/workflows/deploy-frontend-cloudflare.yml` ganha `schedule` diário (`cron: '17 9 * * *'`, 06:17 em Brasília) além do `workflow_dispatch` (linha 29) e do `push`. Publicar no banco **não** redeploya o site; a tela do curador diz isso (§6). Se o ambiente `production` exigir aprovação manual (comentário nas linhas 14-15 do workflow), o agendamento espera aprovação: o dono confere em Settings → Environments.

`biblioteca/index.json` = `{ "versao":1, "generatedAt", "total", "topics":[{slug,name}], "items":[{ "id", "title", "authors" (texto pronto, "Silva A, Souza B, Lima C et al."), "journal", "year", "type", "topics", "openAccess", "license", "url", "doi", "n" }] }`. `n` = `searchNorm` (B1 §5) do item. Meta: ~400 B por item; teste com 150 itens fictícios ≤ 80 KB. `_headers`: `/biblioteca/index.json` com `max-age=300` e `/biblioteca/*` com `max-age=3600, stale-while-revalidate=86400` (mesmo bloco do blog, `_headers:42-53`).

### 2.2 Página (HTML gerado de `biblioteca.html`, modelo com o marcador `<!-- biblioteca:itens -->`)
- `<head>`: CSP igual à de `blog.html:5` (`connect-src 'self'`, sem host da API); `title` "Biblioteca LAIFT · artigos de farmacologia e toxicologia"; `description` 70-160 caracteres; canonical `https://laift.com.br/biblioteca`; `og:*` e `twitter:card` (imagem `blog/og-default.jpg`); JSON-LD `@graph` com `CollectionPage`, `BreadcrumbList` e `ItemList` de `ScholarlyArticle` (`name`, `author[].name`, `datePublished` = ano, `isPartOf.name` = revista, `sameAs` = `url`). **No JSON-LD, trocar `<` por `<`** (um título com `</script>` não pode fechar o bloco). `<link rel="stylesheet" href="/publico.css">` e `/biblioteca.css`; `<script src="/biblioteca/catalogo.js" defer>`.
- Cabeçalho e rodapé: copiar a barra `pub-barra` de `blog.html:39-50` (marca "Biblioteca LAIFT", link para `/biblioteca`) e o rodapé `pub-rodape` (`scripts/build-blog.js:163`, acrescentando o item "Biblioteca").
- `<main>`: `<h1>Biblioteca LAIFT</h1>`; parágrafo "Artigos científicos escolhidos e conferidos pela Diretoria Científica da LAIFT. Resumo, coleções e favoritos ficam na área de membros." + link "Entrar na plataforma" (`/`); `<p class="bib-atualizado">Atualizado em 10/10/2026.</p>`.
- Busca e filtros num `<form class="bib-filtros" role="search" hidden>` (o script tira o `hidden`; sem JS a lista inteira aparece): `<label for="bib-q">Buscar por título, autor ou revista</label>` + `<input type="search" id="bib-q" maxlength="120">`; `<select id="bib-area">` (Todas as áreas + `topics`), `<select id="bib-tipo">` (Todos os tipos + rótulos de §4.3), anos `<input type="number" id="bib-ano-de">` e `bib-ano-ate` (1800-2100), `<input type="checkbox" id="bib-aberto">` "Só acesso aberto"; botão "Limpar filtros". Contagem `<p id="bib-status" role="status" aria-live="polite">48 artigos</p>`.
- Lista `<ol class="bib-lista">`; cada `<li id="a-<id>">` tem `<article>`: `<h2 class="bib-titulo">` com o título (texto), linha de autores, `<p class="bib-meta">` revista · ano, selos de texto (tipo, área, "Acesso aberto" quando houver; nada só por cor) e o link `<a href="<url>" rel="noopener noreferrer" target="_blank">Abrir no site oficial<span class="visually-hidden"> (abre em nova aba)</span></a>`. O `href` só entra se casar `^https://(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)/`; senão o item é descartado.
- Filtro (`biblioteca/catalogo.js`): carrega `/biblioteca/index.json` (mesma origem), mostra o formulário, filtra por `n` (termos em AND, normalização B1 §5), área, tipo, anos e acesso aberto, e esconde/mostra cada `<li>` com o atributo `hidden` (sem recriar nós). Digitação com espera de 250 ms. Sem resultado: `<p class="bib-vazio">Nenhum artigo com esses filtros.</p>` + "Limpar filtros". Falha ao carregar o JSON: o formulário continua escondido e a lista inteira fica visível.
- Escape: o gerador escapa `& < > " '` em todo texto e atributo (função própria, como `esc` de `scripts/build-blog.js:66`).

## 3. Painel do membro `panel-library` (`library.js`, `library.css`)
Estrutura (montada por `LaiftDom.h`, sem `innerHTML`; `modulos/shared/safe-dom.js:102,161`):
- `<section id="panel-library" class="hidden">` em `index.html` antes de `panel-profile` (linha 571), com `<h1 class="sr-only">Biblioteca</h1>` e `<div id="library-root"></div>` (`scripts/headings.test.mjs:48` varre todo `panel-*`: h1 → h2 → h3, sem pular).
- Cabeçalho (`.card`): `<h2>Biblioteca LAIFT</h2>`, "Artigos escolhidos pela Diretoria Científica." Conta `visitor`: aviso "Resumo, favoritos e coleções são para membros." Botão "Sugerir artigo" só com `data-flag-library-member-suggest` no `<html>` e papel membro/admin (`window.App.getProfile().role`).
- Abas: três botões com `aria-pressed` — "Catálogo", "Favoritos", "Coleções" (as duas últimas somem para `visitor`). Escolha guardada em memória (não em `localStorage`).
- Busca: `<form role="search">` com `<label for="library-q">Buscar artigos</label>`, `<input type="search" id="library-q" maxlength="120" autocomplete="off">`; dispara com ≥ 2 caracteres, 400 ms depois de parar de digitar, ou no Enter. Resposta fora de ordem é descartada (contador de pedido, como em `admin-moderation.js`).
- Filtros em `<details class="library-filtros"><summary>Filtros</summary>`: Área (`topics` da resposta), Tipo, Ano de/até, "Só acesso aberto"; "Limpar filtros". Filtro ativo aparece como texto no `summary` ("Filtros (2)").
- Resultado: `<p id="library-status" role="status" aria-live="polite">` ("12 artigos", "1 artigo"); `<ul class="library-lista">`, cada item um `.list-item` com `<h3>` contendo um `<button type="button" data-action="LaiftLibrary.open" data-id>` com o título; meta (autores curtos · revista · ano); selos de texto (tipo, área, "Acesso aberto", "Com resumo"); botão de favorito `aria-pressed` com rótulo "Salvar nos favoritos"/"Remover dos favoritos" (ícone `aria-hidden`), só para membro. 20 por página e "Carregar mais".
- Estados (`shared-states.js:48,72,95`): carregando = `createSkeleton(doc, 4)` + `aria-busy` no contêiner; vazio da busca = "Nenhum artigo encontrado." + ação "Limpar filtros"; vazio de favoritos = "Você ainda não salvou artigos."; vazio de coleções = "Ainda não há coleções."; erro = `createStateNode(doc,'error',{ actionLabel:'Tentar de novo' })` com a mensagem da API, e, em falha de rede (`networkUnavailable`, `app.js:408`), um link "Ver o catálogo público" (`/biblioteca`); `disabled:true` = "A Biblioteca ainda não está disponível." sem botão.
- Coleções: cartões (título, descrição, "N artigos"); ao abrir, lista da coleção (mesmo renderizador) com "← Voltar às coleções".
- Sugerir (flag): formulário em linha: "DOI, PMID ou link do doi.org ou do PubMed" (`maxlength 300`), "Por que este artigo? (opcional)" (`textarea maxlength 300`, contador), "Enviar sugestão". Sucesso: "Sugestão enviada. A Diretoria Científica vai avaliar." Erros: a mensagem do servidor.
- API: `window.App.callApi(nome, token, input)` com `token = app.getState().sessionToken` (`app.js:2600-2621`, modelo `admin-moderation.js:155-158`). Interface pública: `window.LaiftLibrary = { loadPanel, reset }` (+ `module.exports` das funções puras para teste, como `admin-moderation.js:334-337`). `reset()` limpa tudo no logout.

## 4. Ficha do artigo (`library-detail.js`) e citação (`library-cite.js`)
### 4.1 Ficha
Abre **dentro do painel** (troca a lista pela ficha; nada de `<dialog>` com texto longo no celular). `window.LaiftLibraryDetail = { open(app, id, onBack), reset }`. Chama `apiLearnLibraryGetArticle`.
- Foco vai para o `<h2 tabindex="-1">` com o título; "← Voltar à lista" devolve o foco ao botão do item e a rolagem anterior.
- Conteúdo, nesta ordem: título (h2); autores completos (até 30, depois "e mais N"); revista, ano, volume, número, páginas; DOI e PMID como texto; selos (tipo, áreas); licença em texto ("Licença CC BY", "Licença não informada pelo editor"); acesso ("Acesso aberto" / "Acesso pelo site do editor").
- `<h3>Resumo da LAIFT</h3>` com o texto e a origem: `curador` → "Escrito pela curadoria."; `ia`/`ia_editado` (B3) → "Gerado por IA e revisado por {nome} em {data}."; com `clinicalReview` → "Revisão clínica: {nome}, {data}.". Sem resumo: "Este artigo ainda não tem resumo da LAIFT.". `membersOnly`: "O resumo é exclusivo para membros.".
- `<h3>Resumo original</h3>` só se `abstract` vier preenchido, com "Publicado sob licença {rótulo}.".
- Ações (`.actions-row`): "Abrir no site oficial" (`<a target="_blank" rel="noopener noreferrer">`, `href` validado como em §2.2); "Texto completo aberto (PMC)" se `pmcUrl` casar `^https://pmc\.ncbi\.nlm\.nih\.gov/articles/PMC\d+/$`; favorito (`aria-pressed`); "Citar".
- "Citar": grupo com dois botões `aria-pressed` "ABNT" e "Vancouver", o texto num `<p class="library-citacao">` e "Copiar citação" (`navigator.clipboard.writeText`; sem permissão, seleciona o texto e diz "Selecione e copie o texto acima."). Aviso em `role="status"`: "Citação copiada.".
- Coleções do artigo: "Faz parte de: {título}" (botão que abre a coleção).

### 4.2 Formatos (`window.LaiftLibraryCite = { abnt(article, { accessDate }), vancouver(article) }`, puro, sem DOM)
- **ABNT** (NBR 6023:2018, artigo de periódico online): `SOBRENOME, A. B.; SOBRENOME, C. Título do artigo. Nome da Revista, v. 12, n. 3, p. 45-67, 2021. DOI: 10.1000/xyz. Disponível em: https://doi.org/10.1000/xyz. Acesso em: 10 out. 2026.`
  Até 3 autores separados por `; `; 4 ou mais: o primeiro + ` et al.` (a norma permite). Sobrenome em maiúsculas (`toLocaleUpperCase('pt-BR')`), prenomes em iniciais com ponto; autor coletivo (sem `given`) todo em maiúsculas. Parte ausente some com sua vírgula (sem volume, sem "v."). Sem ano: `[s. d.]`. Sem DOI: só `Disponível em: <url do PubMed>`. Meses: `jan. fev. mar. abr. maio jun. jul. ago. set. out. nov. dez.`. Local de publicação omitido (não vem nos metadados). Na tela o nome da revista vai em `<strong>`; no texto copiado, sem marcação.
- **Vancouver** (ICMJE/NLM): `Sobrenome AB, Sobrenome C, Sobrenome D, Sobrenome E, Sobrenome F, Sobrenome G, et al. Título do artigo. Abrev Revista. 2021;12(3):45-67. doi: 10.1000/xyz`
  Até 6 autores; 7 ou mais: os 6 primeiros + `, et al.`. Iniciais sem ponto e sem espaço ("Ana Maria" → "AM"; "Jean-Paul" → "JP"). Título termina em ponto (mantém `?` ou `!`). Revista: `journalAbbrev`, senão `journal`. Sem número: `2021;12:45-67.`; sem páginas: `2021;12(3).`; sem volume: `2021.`. Sem DOI: `PMID: 12345.`.
- **Aceite:** a Diretoria Científica confere 3 exemplos reais (1, 4 e 8 autores) nos dois formatos; eles viram os casos fixos do teste.

### 4.3 Rótulos de tipo (mesma tabela no painel, na página pública e no admin)
`artigo` "Artigo original" · `revisao` "Revisão" · `revisao_sistematica` "Revisão sistemática" · `meta_analise` "Metanálise" · `ensaio_clinico` "Ensaio clínico" · `relato_caso` "Relato de caso" · `diretriz` "Diretriz" · `outro` "Outro". Licenças: `cc-by` "CC BY", `cc-by-sa` "CC BY-SA", `cc-by-nd` "CC BY-ND", `cc-by-nc` "CC BY-NC", `cc-by-nc-sa` "CC BY-NC-SA", `cc-by-nc-nd` "CC BY-NC-ND", `cc0` "CC0", `pd` "Domínio público", `outra` "Licença do editor", `desconhecida` "Licença não informada pelo editor". Ficam em `library-cite.js` (`LABELS`), único dono; a página pública recebe os rótulos já resolvidos pelo gerador (cópia da tabela em `build-biblioteca.js`, com teste que compara as duas).

## 5. Item do menu (`index.html` dentro de `#app-menu`, depois do grupo "Comunicação", antes de `</dialog>` na linha 394)
```html
<section class="app-menu__grupo" data-grupo="estudo" aria-labelledby="app-menu-g3">
  <h3 id="app-menu-g3">Estudo</h3>
  <ul>
    <li>
      <button type="button" class="app-menu__item" data-panel="panel-library" data-scope="all">
        <svg class="app-menu__icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/><path d="M8 7h6"/></svg>
        <span class="app-menu__texto"><span class="app-menu__titulo">Biblioteca</span><span class="app-menu__info">Artigos com curadoria</span></span>
      </button>
    </li>
  </ul>
</section>
```
Sem contador (`app-menu.js:13-25` não muda). Gate em `app-menu.css` (§1). Testes que mudam: `scripts/app-menu.test.mjs:146-147` (o `deepEqual` passa a terminar em `'panel-library'`) e `scripts/e2e/harness.js:254` (`MENU_PANELS` + `'panel-library'`; sem isso `showPanel()` procura na barra).

## 6. Aba admin `panel-admin-library` (`admin-library.js`, `admin-library-extras.js`)
- Botão `<button type="button" data-panel="panel-admin-library">` com `<span>Biblioteca</span>` em `#nav-group-admin` antes de `#btn-exit-admin-mode` (`index.html:338`); seção `<section id="panel-admin-library" class="hidden">` depois de `panel-admin-ai` (linha 821), com `<h1 class="sr-only">Curadoria da Biblioteca</h1>` e `<div id="admin-library-root">`.
- Subabas (`aria-pressed`): "Artigos" (`admin-library.js`), "Sugestões", "Coleções", "Áreas", "Equipe" (`admin-library-extras.js`, que expõe `window.LaiftAdminLibraryExtras = { render(tab, container, app), reset }`). "Equipe" só para `role = 'admin'`.
- **Artigos** (modelo de estados, foco e respostas fora de ordem: `admin-moderation.js:160-192`):
  - Cadastro: `<label for="adm-lib-id">DOI ou PMID</label>` + "Buscar dados". Carregando: "Consultando Crossref, Europe PMC e OpenAlex…". Duplicata: a mensagem + botão "Abrir o já cadastrado" (`payload.articleId`). `warnings` em lista abaixo.
  - Filtro de estado (botões `aria-pressed` com contagem): "Em triagem (n)", "Aprovados (n)", "Publicados (n)", "Rejeitados (n)", "Removidos (n)". Lista: título, DOI ou PMID, ano, licença, selos "Conflito de licença" e "Clínico: aguarda revisor".
  - Edição (ao abrir um item): campos de `UpdateArticle` com `<label>` visível; áreas em caixas de seleção; "Contém conduta, dose ou interação (exige revisor clínico)"; resumo `textarea maxlength="1200"` com contador; "Resumo original (só para a curadoria)" em leitura; fontes consultadas e data. Salvar envia `version`; conflito mostra a mensagem do servidor e "Recarregar".
  - Mudança de estado: só os botões de `allowedTransitions` ("Aprovar referência", "Publicar", "Rejeitar", "Remover do catálogo", "Voltar para triagem"). Rejeitar e Remover pedem o motivo num campo em linha (3-300) antes de `openConfirm` (`app.js:699`). Depois de publicar: "Publicado. O catálogo público é atualizado na próxima geração do site (uma vez por dia)."
  - Revisor clínico (sem papel de curador): vê a fila e a ficha; os botões dele ("Aprovar revisão clínica", "Devolver à curadoria") ficam para B3.
- **Sugestões**: lista (identificador, nota, data); "Aceitar e buscar dados" e "Recusar" (motivo). **Coleções**: lista com estado; editor (título, slug, descrição, estado, ordem, artigos publicados por busca e caixas de seleção). **Áreas**: lista + formulário slug/nome/ordem. **Equipe**: lista (nome, papel, desde) + e-mail, papel ("Curador" / "Revisor clínico") e "Dar acesso" / "Tirar acesso".
- Mesmas regras de `admin-moderation.js:12-20`: tudo por `LaiftDom.h`, ações por `data-action` + `delegateActions`, a autorização real é do servidor.
- `reset()` dos dois módulos ao sair da sessão, junto de `LaiftAdminModeration.reset()` (`app.js:143` e `:886`).

## 7. Registro dos arquivos (sessão principal; arquivos quentes)
| Arquivo novo | `index.html` | `scripts/build.js` | `sw.js` PRECACHE (`sw.js:23-29`) |
|---|---|---|---|
| `library-cite.js`, `library-detail.js`, `library.js` | `<script ... defer>` nessa ordem, depois de `modulos/shared/safe-dom.js` (linha 1063) e antes de `app.js` (1067) | lista de cópia (linha 56) | sim |
| `library.css` | `<link rel="stylesheet">` depois de `app-menu.css` (linha 75) | lista (56) | sim |
| `admin-library-extras.js`, `admin-library.js` | depois de `admin-moderation.js` (1064) | lista (56) | sim |
| `biblioteca.html` (modelo), `biblioteca.css`, `biblioteca/catalogo.js` | — (página própria) | `require('./build-biblioteca.js').build({ outDir: DIST })` depois da linha 111; `biblioteca.css` na lista (56); `biblioteca/catalogo.js` copiado pelo gerador; **não** copiar `biblioteca/conteudo/` | não (fora do app; sem service worker em `/biblioteca` na v1) |
`app.js`: `PANEL_LOADERS` (linha 1072) ganha `'panel-library': function () { if (window.LaiftLibrary) window.LaiftLibrary.loadPanel(); }` e `'panel-admin-library': function () { if (window.LaiftAdminLibrary) window.LaiftAdminLibrary.load(window.App); }`; os dois `reset()` nas linhas 143 e 886. `CACHE_NAME` (`sw.js:20`) sobe para `v5`. CSP do `index.html` (linha 6) **não** muda (tudo é `'self'` e a API já está no `connect-src`).

## 8. Acessibilidade, tamanhos, temas
- Portão visual (sessão principal, navegador embutido): 375 px e 1280 px, claro e escuro, painel (lista, ficha, citar), aba admin (fila e edição) e página pública. Sem rolagem horizontal da página; filtros quebram linha.
- Alvo ≥ 44 px em botões, abas, favoritos e itens; foco visível; contraste ≥ 4,5:1 com os tokens (`modulos/shared/laift-tokens.css`, aliases em `styles.css:13-26`); nada só por cor (selos com texto); `aria-pressed` em abas e favoritos; `role="status"` nas contagens e mensagens; `aria-busy` ao carregar; links externos avisam "(abre em nova aba)".
- Movimento só `transform`/`opacity` com `--dur-*`/`--ease-*`; sem bordas de card sob `:root[data-flag-ux-v2-enabled]` (`docs/TIME_CONTRATO.md:17`). Reaproveitar `.card`, `.list-item`, `.meta-row`, `.actions-row`, `.badge` (`styles.css:301-313`) antes de criar classe.
- Lighthouse e axe sem regressão (`scripts/e2e/axe-gate.js`).

## 9. Testes e o que quebra
| Teste | Dono | Cobre |
|---|---|---|
| `scripts/library-cite.test.mjs` | B2-H1 | os exemplos de §4.2 (1, 4, 7 e 8 autores; sem volume, número, páginas, ano, DOI; autor coletivo; título com `?`) e os rótulos |
| `scripts/build-biblioteca.test.mjs` | B2-H2 | reserva desligada → nada gerado; item inválido descartado sem derrubar; escape (`<script>` no título, `</script>` no JSON-LD); canonical, description, um `<h1>`, CSP; sitemap e llms idempotentes; tamanho do `index.json`; rótulos iguais aos de `library-cite.js` |
| `scripts/biblioteca-catalogo.test.mjs` | B2-H3 | normalização igual à do B1, filtros combinados, JSON ausente mantém a lista |
| `scripts/fetch-biblioteca.test.mjs` | B2-H4 | sucesso grava; falha não grava e não lança; formato inválido recusado; nada de token no pedido |
| `scripts/library.test.mjs`, `scripts/library-detail.test.mjs`, `scripts/admin-library.test.mjs` (+ extras) | B2-H5..H8 | funções puras, estados, respostas fora de ordem, `reset`, higiene (sem `innerHTML`, `.style.`, `on*=`), uso só das actions do B1 |
| `scripts/e2e/library.e2e.js`, `scripts/e2e/biblioteca.e2e.js` | B2-H9 | flag desligada (grupo some), visitante sem favoritos, busca e ficha com `workerHandlers` (`scripts/e2e/harness.js:185`), fila admin com o formato real, página pública em 375/1280 com axe |
Quebra conhecida: `scripts/app-menu.test.mjs:146-147`, `scripts/e2e/harness.js:254`, `scripts/e2e/qa-full.e2e.js:951` (lista de painéis admin: incluir `panel-admin-library`). `scripts/e2e/csp.e2e.js:101` já varre todo `.html` do `dist/`. Comandos: `cd frontend && node --test scripts/*.test.mjs` (2 falhas conhecidas só no Windows, `docs/TIME_CONTRATO.md:26`) e `node scripts/build.js && node scripts/e2e/run.js csp smoke library biblioteca`.
