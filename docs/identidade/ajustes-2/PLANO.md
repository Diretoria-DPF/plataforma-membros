# Plano — ajustes da tela de entrada, do blog e do endereço (ajustes-2, 2026-10-09)

Branch `feat/ajustes-login-blog` (de `origin/main` c132c0f, com a identidade da Liga já mesclada na #47). Contrato: `CONTRATO.md`.
Fichas e ondas: `fichas/ORDEM.md`. Verificadores: `verificadores/` (ensaiados: vermelhos no código atual, verdes numa cópia com o contrato).

## 1. Diagnóstico (onde está cada coisa hoje)
| Pedido | Onde (arquivo:linha) | O que acontece |
|---|---|---|
| 1 Lia no login | `frontend/index.html:87` (`#hero-lia`), `:1007` (`hero.js`); `hero.js`; `ux.css:518`, `:535-555`; `scripts/build.js:56`; `sw.js:26` | A cabeça da Lia "espia" sobre o cartão (top -92 px). O botão de baixo é `#lia-launcher` (`assistant.js:592`), fixo a 16 px |
| 2 Tela num cartão só | `index.html:86-122`; `styles.css:844-848` | Login, "Conheça a LAIFT", "Blog: conheça a plataforma" (`index.html:119`) e o aviso no mesmo cartão; links de texto |
| 3 Prévia só com letras | `blog-novidade.js:91-111`; `blog-novidade.css` | Selo "Nova publicação no blog"/"Do blog" (`:93`), título e data; nenhuma imagem. Na foto atual a Lia flutuante cobre o aviso |
| 4 Endereço errado | ver lista abaixo | "Rua Direita da Piedade, 358 · 40070-190" (prédio do Centro, -12.98658/-38.51689) |
| 5 Cartões "Do blog" sem imagem | `liga.html:223-228` (contêiner) + `blog-novidade.js` | Mesmo componente do item 3, em 3 cartões |
| 6 Rodapé no blog | `liga.html:231-236` (origem); `publico.css:368-413` (estilo) | `blog.html`, posts (`scripts/build-blog.js:275-319`) e `blog/404.html` não têm rodapé |

**Endereço antigo — todas as ocorrências.** Código: `frontend/liga.html:35,38,41,46,47` (JSON-LD), `:198` (alt "358"), `:203` (texto),
`:205,207,208,209` (links de mapa), `:213` (`data-lat/lon`); `frontend/liga-mapa.js:14`; `frontend/edital.html:75`;
`frontend/icons/predio-instituicao.svg:4,53`; `frontend/scripts/e2e/liga.e2e.js:274-275`. Documentos (histórico; a sessão principal
atualiza só os vivos): `docs/CONTINUIDADE.md:41`; `docs/identidade/STATUS.md:30`; `docs/identidade/CONTRATO.md:22-23,161-162,259-283`;
`docs/identidade/PLANO.md:14,29,82`; `docs/identidade/fichas/E1.md:23`, `J1.md:43-48`, `Q1.md:27`. "Campus Pituba / 41810-205" em
`docs/liga/fontes/forms-processo-seletivo.md:9` (o Forms) agora **bate** com o endereço novo. Sem menção: `processo-seletivo.html`,
`termos.html`, `privacidade.html`, `llms.txt`, `blog/conteudo/*.json`, `worker/`.
**"Blog: conheça a plataforma" / "Conheça a plataforma".** Código: `frontend/index.html:119`; `frontend/scripts/e2e/campanha.e2e.js:8,243,252,253`.
Documentos: `docs/identidade/CONTRATO.md:449`, `docs/identidade/STATUS.md:11`, `docs/identidade/PLANO.md:15`, `docs/CONTINUIDADE.md:42`,
`docs/blog/fichas/I3.md:1,4,18` (histórico). **Selo "Do blog":** `frontend/blog-novidade.js:93`, `frontend/scripts/e2e/liga.e2e.js:54,394`
(o título de seção "Do blog" em `liga.html:224` fica).

## 2. Decisões (detalhe e textos exatos no CONTRATO)
1. **Remover** o hero da Lia (não só esconder): ele só existe em `#screen-welcome`; esconder ainda montaria a Lia. Saem `hero.js`, o teste
   e o e2e dele; entram `scripts/entrada.test.mjs` e `scripts/e2e/entrada.e2e.js`. A Lia flutuante de baixo fica, e a tela ganha 72 px de
   folga para ela não cobrir os botões no fim da rolagem.
2. Tela de entrada em **três cartões**: login (formulário, Criar conta, Esqueci minha senha); atalhos com dois botões tonais de 56 px e
   largura total, "Conheça a LAIFT" e "Acessar blog" (ícones do sprite do blog); e o cartão da publicação. Celular em coluna; ≥ 960 px em
   duas colunas (login à esquerda). "Entrar" continua sendo a única ação cheia.
3. Aviso da publicação com **miniatura**: quadrado de 64 px com o ícone da publicação (`blog/icones.svg`), no tom da série; a campanha
   (Outubro Rosa) usa o laço em rosa discreto (os mesmos tons de `blog-campanha.css`, AA no claro e no escuro). Some o selo "Do blog";
   "Nova publicação no blog" fica pequeno, só quando é nova. No /liga, a mesma imagem vira capa larga (112 px) de cada cartão.
4. Endereço exibido = o texto do dono; coordenadas do OSM com número exato (CONTRATO §4); JSON-LD com o CEP completo 41810-205.
5. Rodapé da /liga copiado para o blog (feed, 19 posts e 404), logo depois do `<main>`; nos posts, folga para a barra flutuante.

## 3. Divisão (arquivos disjuntos; detalhe em `fichas/ORDEM.md`)
| Ficha | Modelo | Arquivos (a partir de `frontend/`) |
|---|---|---|
| S1 | Sonnet 5.5 | `index.html`, `ux.css`, `styles.css`, `scripts/build.js`, `sw.js`, `scripts/e2e/campanha.e2e.js`; novos `scripts/entrada.test.mjs`, `scripts/e2e/entrada.e2e.js`; apaga `hero.js`, `scripts/hero.test.mjs`, `scripts/e2e/hero-ux2.e2e.js` |
| S2 | Sonnet 5.5 | `blog-novidade.js`, `blog-novidade.css`, `scripts/blog-novidade.test.mjs`, `blog.html`, `blog/404.html`, `scripts/build-blog.js`, `scripts/build-blog.test.mjs`, `blog.css`, `scripts/e2e/blog.e2e.js` |
| H1 | Haiku 5.5 | `liga.html`, `liga-mapa.js`, `icons/predio-instituicao.svg`, `edital.html`, `scripts/e2e/liga.e2e.js` |

## 4. Revisão do orquestrador (onda 4) — checklist
- Diff só nos arquivos da tabela (+ docs da sessão principal); nenhum `style=""`, `on*=`, `innerHTML`; cabeçalho nos arquivos novos.
- Os 3 verificadores verdes em série; `node --test scripts/*.test.mjs` só com as 2 falhas antigas de `_headers`; e2e da onda 3 com 0 ✘.
- Capturas: login sem Lia no topo; três blocos; botões grandes; laço rosa discreto (claro e escuro); capas no /liga; rodapé no blog;
  endereço e placa 364. Comparar com `capturas/antes/`.

## 5. Sessão principal (depois das fichas)
1. Rodar `verificadores/s1-entrada.js`, `s2-blog.js` e `h1-endereco.js` em série (da RAIZ).
2. `cd frontend && node scripts/build.js && node --test scripts/*.test.mjs`; depois
   `node scripts/e2e/run.js entrada liga blog campanha csp navegacao smoke home assistant onboarding`.
3. Docs vivos: `docs/CONTINUIDADE.md` §3 (linhas 41-42: endereço novo e "Acessar blog") e §7 (`hero-ux2` → `entrada` no comando de e2e);
   `docs/riscos-residuais.md:84` (O39: o hero saiu); `docs/identidade/STATUS.md` (§1 linha 11 e §4 "endereço" resolvido).
4. Portão visual (dono) → commit único (`feat: tela de entrada em cartões, miniatura do blog, rodapé no blog e endereço da UNINASSAU`,
   sem linhas de atribuição) → PR para `main`.

## 6. Para o dono decidir (não bloqueia as fichas)
1. **CEP na tela:** hoje sai "Salvador-Bahia, 41810" (o seu texto). O CEP completo, confirmado no ViaCEP e no OpenStreetMap, é
   **41810-205**. Mostrar o completo? (troca de 1 linha em `liga.html` e `edital.html`; o JSON-LD já usa o completo.)
2. A ilustração do prédio é genérica (não é a fachada da Pituba); mudou só a placa para 364 e saiu "quatro andares" do texto alternativo.
3. Aprovar as capturas de `docs/identidade/ajustes-2/capturas/` (antes: `capturas/antes/`), principalmente o desktop em duas colunas.

## 7. Riscos
- `scripts/e2e/entrada.e2e.js` é escrito sem poder rodar (precisa do build): pode pedir uma volta de ajuste na onda 3.
- As três fichas rodam juntas; um verificador pode pegar um arquivo de outra ficha no meio da edição (regra 11 da ORDEM).
- Hífen e CEP curtos ("UNINASSAU - Salvador", "41810") seguem o texto literal do dono (ver §6.1).
- `blog.css` (1488 linhas) e `liga.css` (867) já passam do teto de 800; esta rodada não os aumenta de forma relevante.
- Falhas antigas fora do escopo: `_headers` por CRLF (seo, staging) e os 10 e2e do Atlas listados em `docs/CONTINUIDADE.md` §2.
