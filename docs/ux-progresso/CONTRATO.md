# Contrato — progresso de leitura e usabilidade da entrada (ux-progresso, v2, 2026-10-10)

Branch `feat/ajustes-login-blog` (worktree `.claude/worktrees/ajustes-2`). Caminhos a partir de `frontend/`, salvo `docs/`.
Regras de execução: `fichas/ORDEM.md`. Plano: `PLANO.md`. Achados: `AUDITORIA.md`.
**Tudo aqui foi ensaiado** numa sobreposição fora do repositório (scratchpad do orquestrador, `LAIFT_SOBREPOSICAO`):
`verificadores/a-progresso.js` → 67 ok, 0 falha; `verificadores/b-entrada.js` → 47 ok, 0 falha; `node --test` de
`laift-progress.test.mjs` (14), `build-blog.test.mjs` (18) e `entrada.test.mjs` (10) verdes. No código atual os dois
verificadores ficam vermelhos onde devem (A: 15 ok, 46 falhas; B: 4 ok, 19 falhas). Base de `node --test scripts/*.test.mjs`
hoje: 1022 testes, só as 2 falhas antigas de `_headers` (CRLF no Windows).
**v2 (respostas do dono, 2026-10-10):** a barra **começa em 0%** ("só conta depois de ler"); o 25 só é gravado e mostrado quando
o trecho de 25% passou pela tela; nota de privacidade sem mudar a versão; texto curto do login confirmado; telefone segue obrigatório no
Lote B (opcional só no Lote W, `fichas/W1.md`).

## 0. Pedido do dono → decisão → onde
| # | Pedido (resumo) | Decisão | Lote / ficha |
|---|---|---|---|
| 1 | Barra de progresso nas páginas de leitura; 25, 50, 75, 100%; "só conta depois de ler" (abre em 0%) | Camada única `LaiftProgress` (`modulos/shared/laift-progress.js` + `.css`); primeiro nos posts do blog | A · H1–H4 |
| 2 | Frases ao alcançar as marcas; ícone de meta no 50% e no 75% | Frases exatas §2.2; símbolo `#meta` (bandeira) no sprite do blog; o ícone surge (animação curta) | A · H1, H2 |
| 3 | Ao concluir: estrela + notificação do 100%; estrela fica registrada no lugar da barra | Aviso `role="status"` vira "100% Leitura concluída" com `#estrela`; ao voltar ao post, a barra já abre cheia com a estrela | A · H1, H2 |
| 4 | Gradiente de meta | Efeito de meta: 4 etapas visíveis desde o início, reforço a cada marco + preenchimento em gradiente da marca ao verde de sucesso, só com tokens | A · H2 |
| 5 | Neste aparelho agora, trocar pela conta depois sem mexer nas telas | `localStorage` `laift_progresso_v1`, adaptador trocável (`usarArmazenamento`); telas só usam a API §2.1 | A · H1 |
| 6 | Primeira tela: organizar login e cadastro; menos opções; hierarquia | Entrar > Criar conta (botão secundário) > links; "Mostrar senha"; cadastro em 2 grupos + opcional recolhido; sem SMS | B · sessão principal + H6 |
| 7 | App logado e módulos | Auditados (`AUDITORIA.md`); Lote C e D descritos no PLANO, sem ficha agora | C, D |

## 1. Leis aplicadas (como decidir dúvidas pequenas)
Fitts: alvo ≥ 44 px, ação principal larga e perto do polegar. Hick: uma ação principal por bloco; o opcional fica recolhido.
Jakob: padrões que todo mundo já usa (barra de leitura presa no topo, "Mostrar senha", "Esqueci minha senha" junto da senha,
`<details>` com a seta nativa). Gestalt/Miller: no máximo 4 ou 5 itens por grupo, grupos com título. Gradiente de meta: mostrar o
avanço desde o início e reforçar perto do fim. Hierarquia: tamanho e peso, não cor nova.

## 2. Camada `LaiftProgress` (`modulos/shared/laift-progress.js`, script clássico)
Script clássico (os módulos de estudo não usam ES modules), padrão UMD igual a `blog-sw.js`:
`(function (root) { 'use strict'; … if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; } root.LaiftProgress = api; })(typeof self !== 'undefined' ? self : this);`
Vai para o `dist` sozinho (`scripts/build.js` copia `modulos/` inteiro e o precache do Atlas inclui `../shared/*.js|css`): **nenhum
arquivo quente muda no Lote A**. Cabeçalho de copyright; sem `innerHTML`/estilo inline (só `style.setProperty('--laift-p', …)`).

### 2.1 Interface estável (é isto que as telas usam; nada mais)
| Nome | Contrato |
|---|---|
| `VERSAO` | `1` |
| `CHAVE` | `'laift_progresso_v1'` |
| `MARCOS` | `Object.freeze([25, 50, 75, 100])` (não existe `MARCO_INICIAL`: nada vem concluído) |
| `FRASE_INICIAL` | `'Boa leitura'` (barra vazia, antes do 25) |
| `FRASES` | `Object.freeze({ 25: 'Bom começo', 50: 'Metade do caminho', 75: 'Falta pouco', 100: 'Leitura concluída' })` |
| `ICONES` | `Object.freeze({ 25: '', 50: 'meta', 75: 'meta', 100: 'estrela' })` (ids do sprite `blog/icones.svg`) |
| `ler(id)` | registro normalizado (cópia). Ausente/ inválido → `{ id, marcos: [], concluidoEm: null }` |
| `gravar(registro)` | `true`/`false`. Id inválido, armazenamento bloqueado ou exceção → `false`, sem lançar |
| `marcos(id)` | cópia de `ler(id).marcos` |
| `marcar(id, novos, hoje?)` | `comMarcos(ler(id), novos, hoje \|\| dataLocal(new Date()))`, grava e **devolve o registro mesmo se gravar falhar** |
| `usarArmazenamento(a)` | troca o adaptador `{ ler(): string\|null, gravar(texto): boolean }`; sem as 2 funções → `false` |
| `montarLeitura(op)` | §2.4; devolve `{ atualizar, estado, destruir }` ou `null` |
Puras (exportadas para teste): `idValido`, `normalizar`, `comMarcos`, `cobrir`, `percentual`, `marcosDe`, `coberturaInicial`, `dataLocal`.
**Troca futura pela conta:** um adaptador "local primeiro" (grava no `localStorage` e envia à Worker em segundo plano) entra com
`usarArmazenamento`; a interface é síncrona de propósito e as telas não mudam.

### 2.2 Registro, chave e privacidade
- Uma chave só: `localStorage['laift_progresso_v1'] = JSON.stringify({ v: 1, itens: { "<id>": { id, marcos: [...], concluidoEm } } })`.
- `id` = `"<tipo>:<slug>"`, regex `^[a-z]+:[a-z0-9]+(?:-[a-z0-9]+)*$`, até 100 caracteres. Blog: `blog:<slug>`. Módulos (Lote D): `modulo:<id>`.
- `marcos`: subconjunto de `MARCOS`, sem repetição, em ordem. `concluidoEm`: `"AAAA-MM-DD"` (data local, sem hora), só se houver 100;
  fica a data da **primeira** conclusão. Nada de nome, e-mail, id de conta ou hora.
- Leitura defensiva: JSON quebrado, `v` diferente de 1, `itens` que não é objeto → começa vazio. No máximo **200** registros: ao passar,
  sai o mais antigo (ordem de inserção; regravar move o item para o fim). Todo acesso ao `localStorage` dentro de `try/catch`.
- Nota de privacidade: §5 (textos exatos).

### 2.3 Regra de contagem da leitura (puras; testadas em `anexos/laift-progress.test.mjs`)
Coordenadas em px **dentro do artigo** (`.blog-artigo`): `topo = -rect.top`, `base = innerHeight - rect.top`, `altura = rect.height`.
- `inicio` = o que já aparece ao abrir: `rect.top >= 0 ? min(altura, max(0, innerHeight - rect.top)) : 0`. Esse trecho **não** conta como lido (a barra abre em 0%).
- `cobrir(coberto, topo, base, altura)`: se `!(altura > 0)` ou `topo > coberto` → `coberto` (**salto**: End, âncora, rolagem restaurada
  não contam); senão `min(altura, max(coberto, base))`. Voltar para cima não reduz.
- `percentual(coberto, altura, inicio = 0)`: sem altura → 0; `coberto >= altura - 2` → **100** (fim do artigo); `inicio >= altura` → 0;
  senão `floor(100 * max(0, coberto - inicio) / (altura - inicio))`. O 25 chega quando 1/4 do que faltava ver ao abrir passou pela
  base da tela (em post longo é praticamente o trecho de 25% do artigo: na campanha, 29.451 px de artigo e `inicio` ≈ 580 px).
- `marcosDe(p)` = marcos ≤ p. `coberturaInicial(marcos, altura, inicio = 0)`: maior marco 100 → `altura`; nenhum marco → `inicio`;
  senão `inicio + m / 100 * (altura - inicio)` (inversa de `percentual`, para retomar a leitura).
- Marco novo **só com rolagem** (evento `scroll`/`resize`), nunca ao abrir. Um passo que cruza 2 marcos grava os 2 e mostra só o maior.

### 2.4 `montarLeitura({ alvo, conteudo, id, sprite = '/blog/icones.svg', janela = root, documento = janela.document })`
1. Sem `alvo`, sem `conteudo` ou `!idValido(id)` → `null` (não toca na tela).
2. `registro = ler(id)`. **Nada é gravado ao abrir**: o primeiro registro nasce no marco 25.
3. Esvazia `alvo` (`removeChild` em laço), `alvo.classList.add('laift-progresso')` e monta, só com `createElement`/`createElementNS`/`textContent`:
```
div.laift-progresso__trilho[aria-hidden="true"]
  div.laift-progresso__preenchido
  span.laift-progresso__marca[data-marco="25"]  · [data-marco="50"]  · [data-marco="75"]
p.laift-progresso__aviso[role="status"][aria-live="polite"][aria-atomic="true"]
  svg.laift-progresso__icone[aria-hidden="true"][focusable="false"] > use      (SVG_NS = 'http://www.w3.org/2000/svg')
  span.laift-progresso__pct     "50%"
  " "                           (nó de texto)
  span.laift-progresso__frase   "Metade do caminho"
```
   e só então `alvo.removeAttribute('hidden')`.
4. `caixa0 = conteudo.getBoundingClientRect()`; `inicio` (§2.3); `coberto = coberturaInicial(registro.marcos, caixa0.height, inicio)`.
5. `mostrarMarco(m)` com o maior marco do registro (**0** se não há nenhum): `data-marco="m"`, `data-estado` = `concluido` (m = 100) ou `lendo`;
   `use.href` = `ICONES[m] ? sprite + '#' + ICONES[m] : ''`; `pct` = `m + '%'`; `frase` = `FRASES[m] || FRASE_INICIAL` (0 → "0% Boa leitura", sem ícone).
   `pintar(p)` = `alvo.style.setProperty('--laift-p', (p / 100).toFixed(3))`, com p = 100 se concluído, senão `percentual(coberto, caixa0.height, inicio)`.
6. `scroll` e `resize` (`{ passive: true }`) → um `requestAnimationFrame` por quadro → `atualizar()`: concluído → `pintar(100)` e sai;
   senão `coberto = cobrir(coberto, -r.top, innerHeight - r.top, r.height)`, `p = percentual(coberto, r.height, min(inicio, r.height))`,
   `pintar(p)`; `novos = marcosDe(p)` sem os do registro; havendo: `registro = marcar(id, novos)`, `mostrarMarco(último de novos)` e
   `celebrar()` = tira a classe `laift-progresso--celebra`, lê `alvo.offsetWidth`, põe a classe e a tira após **1600 ms** (`setTimeout`).
7. Devolve `{ atualizar, estado: () => ({ id, marcos: cópia, concluidoEm }), destruir }` (`destruir` tira ouvintes e timer).

## 3. Visual (`modulos/shared/laift-progress.css` = **cópia exata** de `fichas/anexos/laift-progress.css`)
- Faixa **presa no topo durante a leitura** (`position: sticky; top: var(--laift-progresso-topo, 0px)`), dentro do artigo: some junto com
  o fim do artigo. **Abre vazia** (`--laift-p: 0`, `data-marco="0"`, "0% Boa leitura", sem ícone). Fundo sólido `--laift-bg`, contorno `--hairline`, `--elev-1`, raio pílula; trilho de 8 px com 3 fendas (4 etapas);
  aviso à direita (`0.875rem`/700; `0.8125rem` até 400 px). Concluída: contorno e estrela em `--laift-progresso-estrela`.
- Tokens (só aliases de `laift-tokens.css`, claro e escuro mudam sozinhos): `--laift-progresso-de: var(--laift-primary)`,
  `--laift-progresso-ate: var(--laift-success)`, `--laift-progresso-trilho: var(--laift-surface-deep)`, `--laift-progresso-estrela: var(--laift-warning)`.
- Contraste medido (ensaio): texto 15,01 (claro) e 15,85 (escuro); estrela 5,67 e 12,31; preenchimento sobre o trilho: primary 4,63/7,66,
  success 4,98/9,45 (≥ 3:1, WCAG 1.4.11).
- Movimento: só `transform`/`opacity` (`laift-progresso-surge` no ícone com `--ease-spring`, `laift-progresso-entra` na frase). Sem
  `@media (prefers-reduced-motion)` próprio: o bloco único de `laift-tokens.css` (carregado em posts e módulos) zera as animações; o
  `blog.css` também zera transições. Impressão: a faixa some. Não há alvo interativo na faixa (nada para tocar por engano).
- Ícones novos no sprite `blog/icones.svg` (24x24, traço `currentColor` 1.8, pontas redondas, preenchimento 18% como `#laco`):
  texto exato em `fichas/anexos/icones-novos.svg.txt` (`#meta` = bandeira de chegada; `#estrela` = estrela de 5 pontas), antes de `</svg>`.
  **Não** entram em `ICONES` de `build-blog.js` (não são ícones de post; `blog-novidade.test.mjs` compara as duas listas).

## 4. Blog (Lote A)
- **Gerador** (`scripts/build-blog.js`, `renderPostPage`), 3 trocas, cada texto aparece uma vez:
  1. `<link rel="stylesheet" href="/blog.css">${` → `<link rel="stylesheet" href="/blog.css">\n<link rel="stylesheet" href="/modulos/shared/laift-progress.css">${`
  2. `</header>\n${corpo}` → `</header>\n<div class="laift-progresso" data-laift-progresso="blog:${esc(post.slug)}" hidden></div>\n${corpo}`
  3. `${RODAPE}\n${scripts}` → `${RODAPE}\n<script src="/modulos/shared/laift-progress.js" defer></script>\n${scripts}`
  (o `defer` clássico vem antes do `type="module"` do `post.js` e executa antes dele). Teste: `fichas/anexos/build-blog.test.acrescimo.txt`.
- **`blog/post.js`**: sai `criarProgresso` e o `--p`; entra `iniciarProgresso(artigo)` (busca `[data-laift-progresso]` e
  `window.LaiftProgress`; sem um dos dois, sai quieto; `montarLeitura({ alvo, conteudo: artigo, id: alvo.getAttribute('data-laift-progresso'), sprite: '/blog/icones.svg' })`)
  e `medirTopo(alvo)` (se `.pub-barra` tiver `position: sticky` — a partir de 760 px, 64 px medidos —, `--laift-progresso-topo` = a altura
  dela em px; senão `0px`; de novo em `resize`). A barra flutuante não muda.
- **`blog.css`**: apague o bloco `.blog-progresso { … }` (hoje 909-921) e troque o título `/* ---------- Barra de progresso e barra flutuante ---------- */`
  por `/* ---------- Barra flutuante ---------- */`; no `@media print`, apague a linha `  .blog-progresso,`.
- **`blog-sw.js`**: no `PRECACHE`, depois de `'/blog/instalar.js', ` entram `'/modulos/shared/laift-progress.js', '/modulos/shared/laift-progress.css', `.
  Não sobe `CACHE_NAME` (rede primeiro; item ausente é ignorado).
- **`scripts/e2e/blog.e2e.js`** (linha 227): `.blog-progresso` → `.laift-progresso[data-marco="0"]` e a mensagem
  `barra de progresso criada` → `barra de progresso criada (vazia ao abrir)`.

## 5. Privacidade (textos exatos; o dono decidiu: entra **sem** mudar a versão 2026-10-08)
- `privacidade.html`, logo depois do `<p>` da seção 6 que termina em `Ao fazer logout, esse token é apagado imediatamente.</p>`, numa linha nova:
  `    <p><strong>Progresso de leitura.</strong> Ao ler um post do blog, o navegador guarda neste aparelho as etapas de leitura alcançadas (25%, 50%, 75% e 100%) e a data em que você concluiu o post. Esse registro não tem nome, e-mail nem dado da sua conta e não é enviado à plataforma. Para apagá-lo, limpe os dados deste site no navegador.</p>`
- `docs/POLITICA_DE_PRIVACIDADE.md`, depois da linha `Ao fazer logout, esse token é apagado imediatamente.` (seção 6), uma linha em branco e:
```
**Progresso de leitura.** Ao ler um post do blog, o navegador guarda neste
aparelho (`localStorage`, chave `laift_progresso_v1`) as etapas de leitura
alcançadas (25%, 50%, 75% e 100%) e a data em que você concluiu o post.
Esse registro não tem nome, e-mail nem dado da sua conta e não é enviado à
plataforma. Para apagá-lo, limpe os dados deste site no navegador.
```

## 6. Entrada e cadastro (Lote B)
### 6.1 e 6.2 Marcação (arquivos quentes: só a sessão principal)
As 13 trocas exatas de `index.html`, `scripts/build.js` e `sw.js` estão em **`docs/ux-progresso/aplicar-quentes.js`** (cada trecho antigo
aparece 1 vez, senão nada é gravado; mantém CRLF/LF). Conferido no repositório atual: `node docs/ux-progresso/aplicar-quentes.js --conferir`
→ 11 + 1 + 1 trocas conferidas; aplicado numa cópia, o resultado é idêntico ao ensaio. Resumo do que muda:
- Login: o parágrafo fica só "LAIFT — Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia."; depois da senha,
  `div.auth-senha-linha` com o checkbox `#login-mostrar` ("Mostrar senha", `data-senha-visivel="login-password"`) e o botão de texto
  `.auth-esqueci` "Esqueci minha senha"; depois do `#msg-login`, `div.auth-criar` com `p` "Primeira vez aqui?" e `button.secondary.auth-criar__botao`
  "Criar conta". Sai a fila `.auth-links` do login (as outras telas mantêm a delas).
- Cadastro: parágrafo "Sua conta começa como visitante. Confirme o e-mail para entrar."; `fieldset.cadastro-grupo` "Seus dados" (nome,
  usuário, e-mail, telefone; a dica "O nome não pode ser alterado depois." ligada por `aria-describedby="reg-name-dica"`) e "Senha"
  (senha + `#reg-mostrar`); `details.cadastro-opcional` com `summary` "Completar perfil (opcional)" (foto, LinkedIn, Instagram, escolaridade,
  interesses); `<input type="hidden" id="reg-validation" value="email">` no lugar do select de SMS (o `app.js` continua lendo `.value`);
  sem `*` e sem "(opcional)" campo a campo; botão "Criar conta". Ids e `name` dos campos não mudam (o `app.js` não muda).
- `<script src="entrada.js" defer></script>` logo depois de `<script src="app.js" defer></script>`; `'entrada.js'` no fim da lista de
  cópia de `scripts/build.js` e depois de `'voltar-app.css',` no `PRECACHE` de `sw.js`.
Medido no ensaio a 375 px: cadastro de 1541 → **1171 px** (−24%); foco vai ao `h1` da tela nova e a rolagem volta ao topo.

### 6.3 CSS (`ux.css`, dono H6)
Bloco exato de `fichas/anexos/ux-entrada.css.txt`, inserido logo antes de `/* ---------- Painel Início ---------- */`. Inclui
`#public-shell :is(input:not([type="checkbox"]):not([type="radio"]), select, textarea) { font-size: 1rem; }` (16 px: o iPhone deixa de
ampliar a tela ao focar). Sem `@media (prefers-reduced-motion)`, sem transição nova, sem cor nova.

### 6.4 `entrada.js` (novo, dono H6; script clássico, mesmo padrão UMD de §2)
- Para cada `input[type="checkbox"][data-senha-visivel]`: `change` → campo (`getElementById(valor do atributo)`) `type = checked ? 'text' : 'password'`;
  no `submit` do formulário dele, desmarca e volta a `password` (gerenciadores de senha só salvam campo `password`); no `reset`,
  idem dentro de `setTimeout(…, 0)` (o `reset` limpa o checkbox depois do evento).
- Para cada `#public-shell [data-nav]`: `click` → `scrollTo(0, 0)`; `h1` da tela de destino recebe `tabindex="-1"` e
  `focus({ preventScroll: true })`. Roda **depois** do ouvinte do `app.js` (script carregado depois). `/#entrar` continua com foco no e-mail.
- `module.exports = { aplicar, esconder, focarTitulo, iniciar }` no Node; no navegador, `iniciar(document, window)` (já no `defer`).
- Testes: `fichas/anexos/entrada.test.acrescimo.txt` (acrescentar no fim de `scripts/entrada.test.mjs`).

## 7. Padrão para replicar (Lotes C e D; sem ficha agora)
- **Módulo de estudo (iframe)**: no HTML do módulo, `<link rel="stylesheet" href="../shared/laift-progress.css">`, um
  `<div class="laift-progresso" data-laift-progresso="modulo:<id>" hidden></div>` no topo do conteúdo rolável e
  `<script src="../shared/laift-progress.js"></script>` antes do script do módulo; `LaiftProgress.montarLeitura({ alvo, conteudo, id, sprite: '/blog/icones.svg' })`.
  Módulo por questões (quiz, casos): **mesma camada**, nova função `montarEtapas({ alvo, id, total })` com `avancar(feitas)` usando
  `percentual = floor(100 * feitas / total)` (abre em 0%) e os mesmos marcos, frases e ícones (contrato a escrever no Lote D, com teste).
- **App logado (Lote C)**: o Início lê os registros (nova função pura `contarConcluidos()` a acrescentar na camada) para o cartão
  "Leituras concluídas"; o app só carrega a camada quando usar (então `build.js`/`sw.js` não mudam no Lote A).
- Frases fixas para qualquer tela de leitura: as de §2.1. Telas de outro tipo trocam só a frase do 100 (ex.: "Módulo concluído"),
  decidida no contrato do lote.

## 8. Verificadores e capturas
`docs/ux-progresso/verificadores/` (do orquestrador; ninguém edita): `a-progresso.js` (Lote A) e `b-entrada.js` (Lote B). Servem
`frontend/` da fonte, geram o blog numa pasta temporária, simulam a Worker e escrevem só em `docs/ux-progresso/capturas/`
(`progresso-{claro-375,escuro-1280}-{inicio,50,100}.png`, `entrada-*.png`, `cadastro-*.png`). Rodar da RAIZ:
`node docs/ux-progresso/verificadores/a-progresso.js` e `.../b-entrada.js` (código 1 se algo falhar).
As fotos do **ensaio** (como deve ficar) estão em `capturas/ensaio/`; as da implementação real caem em `capturas/` e são as do portão.
