# Identidade da Liga: estado em 2026-10-09 (fim do dia)

Branch `feat/identidade-liga` (de `origin/main` b589fed). **Construída e verificada. Falta só o portão visual do dono e a PR.**
Plano: `PLANO.md`. Contrato: `CONTRATO.md`. Fichas e ondas: `fichas/ORDEM.md`. Capturas para aprovar: `capturas/` (`folha-claro.png`,
`folha-escuro.png` e as telas em 375 e 1280 px, claro e escuro).

## 1. O que está pronto
- `/liga` (identidade digital), `/processo-seletivo` (instruções + "Participar do processo seletivo"), `/edital` (novo, clicável, imprimível).
- Barra pública (Voltar, Início, Blog, Entrar, Cadastrar) em Liga, processo, edital, blog e posts; atalhos `/#cadastro` e `/#entrar` no `app.js`.
- Instituição UNINASSAU: prédio em SVG, endereço, site, mapa do OpenStreetMap **só por clique**, "abrir no app de mapas" (geo/Apple/Google).
- Tela inicial: botão "Acessar blog" e aviso "Nova publicação no blog" com miniatura e laço rosa discreto (`blog-novidade.js` lê `blog/index.json`).
- Botão Voltar no canto superior esquerdo em 17 painéis do app (`voltar-app.js`), no "← Voltar" do visualizador de módulos, no cadastro, no "Esqueci" e no 404.
- Favicon e ícones (`/favicon.ico` gerado no build) nas páginas públicas; blog instalável (`blog/manifest.webmanifest`, `blog-sw.js`, `blog/instalar.js`, botão "Instalar o blog" e passo a passo no iPhone).
- Posts do blog ajustados (8 áreas; processo seletivo aponta para as novas páginas); `llms.txt` e `sitemap.xml` com as páginas novas.

## 2. Verificação (2026-10-09)
- Build verde. Frontend unit: 1003 de 1005 (as 2 falhas são `_headers` por CRLF no Windows, já existiam).
- E2E das suítes desta entrega: `liga`, `navegacao`, `blog`, `campanha`, `home`, `smoke`, `visual-qa`, `onboarding`, `assistant`, `credential`, `hero-ux2`, `csp`: **901 verificações, 0 falhas**.
- Suíte completa: 1775 ✔ e 12 ✘. **10 ✘ já existiam sem estas mudanças** (rodadas no checkout sem a identidade, mesmo resultado): `apis` (estúdio SMILES via POST; anatomia PDB),
  `atlas-farmaco` (gráficos Cp(t)/E(t), 2), `atlas-feedback` (pulso), `atlas-ficha-nav`, `atlas-fisiologia`, `atlas-moleculas` (3). Os outros 2 (`csp` atlas WebGL, `atlas-pick`) só falham sob carga e passam sozinhos.
- Revisão Opus 5.5 (somente leitura): 2 bloqueios, ambos corrigidos (offline do blog com redirecionamento 307; barra fixa do processo cobrindo o rodapé) e a maior parte das recomendações aplicada.
- Revisão visual da sessão principal em recortes de 375 e 1280 px (topo, quem somos, áreas, como funciona, processo, instituição, tela inicial, Voltar no app): sem defeito aberto.

## 3. Ao mesclar
- **Conflito esperado com a PR #46 (Lia)**: `frontend/scripts/build.js` (lista de arquivos) e `frontend/sw.js` (PRECACHE) ganham itens nas mesmas linhas nas duas PRs. Resolver mantendo os itens das duas. Mesclar a #46 primeiro.
- O `sw.js` sobe para `laift-shell-v4`; o `blog-sw.js` usa `laift-blog-v1`.
- Depois do deploy, conferir: `curl -I https://laift.com.br/favicon.ico`, `/blog-sw.js` (cabeçalho de cache curto), `/blog/manifest.webmanifest` (tipo `application/manifest+json`), `/processo-seletivo` e `/edital` com 200.

## 4. Ainda aberto
**Do dono (PLANO §4):** texto do novo edital (a redação veio do edital antigo e de `CONTRATO §11`); endereço **resolvido**: Rua dos Maçons, 364, Salvador-Bahia, CEP 41810-205 (fonte: OpenStreetMap way 814860088 e ViaCEP; o Google Forms ainda diz "Campus Pituba", ver CONTINUIDADE §4); as 8 áreas (5 do dono + 3 propostas) e atualizar o Forms; a frase incompleta do botão do blog; benefícios; idade/menores (parecer jurídico); vagas, datas, carga horária e pesos (hoje "a divulgar" em `liga-ciclo.json`); citar o mapa do OpenStreetMap na Política de Privacidade; nome "Blog LAIFT" do app.
**Técnico (recomendações do Opus ainda não feitas):**
- `static-page.js`: no `/liga`, cada chip de atalho cria uma entrada de histórico; o Voltar passa por todas. Contar os `hashchange` e usar `history.go(-(n+1))`.
- `liga.css` tem 844 linhas (acima do teto suave de 800): dividir em `liga.css` + `liga-instituicao.css` na próxima mexida.
- `_headers`: explicitar `/blog-sw.js` com `Cache-Control: no-cache` (produção já devolve `max-age=0, must-revalidate`).
- Pós-merge: `modulos/shared/laift-tokens.css`, `styles.css` e `static-page.js` continuam com caminho relativo em `termos.html` e `privacidade.html` (só afeta URL profunda).
- Cartões de "Quem somos" ainda ficam altos no celular porque todos têm a altura do mais longo.
