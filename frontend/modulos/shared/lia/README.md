# Lia - arte SVG modular

Fonte da arte (ADR 0003). Sem script, sem fonte externa; cores por `--lia-*` (fallback hex). `preview.html` e `preview.js` sao so para revisao e nao entram no build. `lab.html`, `lab.js`, `lab.css` e `build-lab.mjs` formam o Lia Lab (secao abaixo).

## Grupos (ids preservados, `viewBox` 200x300)
Estrutura: `lia-body` (contêiner) > `lia-ground` (sombra), `lia-torso` (pescoco, pernas, sapatos, casaco) e `lia-head` (cabelo, mecha, rosto, olhos, boca). `lia-limbs` (bracos e props) fica fora do corpo e acompanha o tronco.
- `lia-head`: pivo no pescoco (escala e altura controladas por CSS).
- `lia-coat`: casaco (escala horizontal = ombros). `lia-legs` e `lia-feet`: pernas e sapatos.
- `lia-lock`: mecha lateral teal. `lia-glasses`: oculos (so com `data-accessory="glasses"`).
- `lia-eyes-{neutral,curious,happy,worried,focused,sad}` e `lia-brows-{mesmos}` (olhos com classes `el`/`er` e `ey`).
- `lia-mouth-{neutral,smile,open,flat,worried}`
- `lia-arm-{left,right}-{idle,wave,point,chin,heart}` (left = lado esquerdo de quem ve)
- `lia-prop-{none,calendar,pencil,flask,stethoscope,thermometer,book,skeleton,bone}`
- `lia-scene-{particles,glow,heart,bubble,sparkles}` (`glow` fica atras do corpo)

## Controle (atributos no host `.lia`, ancestral do `<svg class="lia-svg">`)
| Atributo | Valores |
|---|---|
| `data-state` | `idle` (padrao), `thinking`, `speaking`, `celebrating` |
| `data-emotion` | `neutral curious happy worried focused sad` (olhos + sobrancelhas; boca por mapa) |
| `data-mouth` | `neutral smile open flat worried` (vence estado e emocao) |
| `data-arm-left`, `data-arm-right` | `idle wave point chin heart` |
| `data-prop` | nome do prop |
| `data-scene` | lista: `particles glow heart bubble sparkles` (`none` desliga o cenario padrao) |
| `data-accessory` | `glasses` troca a mecha pelos oculos (ausente = mecha) |
| `data-tone="admin"` | acento laranja |

Estados-base: idle = neutro/bracos idle; thinking = curious + boca flat + braco direito `chin` + `bubble`; speaking = olhos neutros, sobrancelha happy, boca `open`, braco direito `point`; celebrating = happy + smile + bracos `heart` + `glow`, `heart`, `sparkles`. Atributos explicitos sempre vencem o padrao do estado (exceto: boca de speaking/thinking/celebrating vence `data-emotion`).

Emocao -> boca: neutral/curious = neutral, happy = smile, focused/sad = flat, worried = worried.

## Geometria (variaveis CSS em `.lia`, padrao = preset Estilizada 1:4)
| Variavel | Padrao | Efeito |
|---|---|---|
| `--lia-top` | `20` | topo do cabelo (y) |
| `--lia-head-scale` | `.544` | escala da cabeca, pivo no pescoco |
| `--lia-neck` | `10` | altura do pescoco visivel |
| `--lia-leg-len` | `93.81` | pernas abaixo do casaco (sapatos e sombra descem) |
| `--lia-shoulder` | `1` | largura dos ombros (escala X do casaco; bracos acompanham) |
| `--lia-arm-len` | `1` | comprimento dos bracos (escala a partir do ombro) |
| `--lia-eye-size` | `1` | tamanho dos olhos |
| `--lia-eye-gap` | `0` | variacao da distancia entre olhos e sobrancelhas |
| `--lia-stroke` | `1.5` | traco unico da arte (compensado nas partes escaladas) |
| `--lia-radius` | `4px` | cantos dos retangulos (pescoco, calendario, termometro) |
| `--lia-lock-x`, `--lia-lock-y` | `0` | posicao da mecha |
| `--lia-pants` | `= --lia-hair` | cor das pernas |

Altura da cabeca = 118 x `--lia-head-scale` (topo do cabelo ate a base do rosto). Razao cabeca:corpo = altura total (topo ate os sapatos) / altura da cabeca.

## Lia Lab
Pagina interativa para ajustar proporcao, traco, cores e estados, e para comparar a Lia lado a lado.

**Como abrir**
- Duplo clique em `lab.html` (funciona em `file://`, sem servidor).
- Ou pelo servidor local: `node frontend/dev-server.js` e abra `http://localhost:4174/modulos/shared/lia/lab.html`.

**Como regerar o lab depois de mudar `lia.svg`**
`node frontend/modulos/shared/lia/build-lab.mjs` (injeta o SVG no `<template id="lia-src">` de `lab.html`; `fetch` nao funciona em `file://`).

**Presets de proporcao** (cabeca:corpo = 1 : N, com topo em y=20 e sapatos em y=277; as pernas fecham a base)
- **Atual (sem ajuste)**: versao anterior, para comparacao. Cabeca com ~1/2 da altura (1 : 1,8), sem pernas.
- **Chibi suave (1:3)**: cabeca grande, corpo curto (escala 0,726, pernas 72,33).
- **Estilizada (1:4), recomendada**: cabeca proporcional e legivel em 48 px (escala 0,544, pernas 93,81). Este e o padrao do `lia.css`.
- **Equilibrada (1:5)**: corpo mais alongado; o rosto fica pequeno demais para bolhas de 48 px (escala 0,436, pernas 106,55).

**Como a escolha vira parametros**
Os sliders alteram as variaveis `--lia-*` do host do palco. O botao **Exportar parametros (JSON)** gera o JSON com a geometria e um bloco `css` pronto para colar no `.lia` do `lia.css`. **Restaurar atual** volta aos valores de `lia.css`. A paleta (4 opcoes, com variante clara e escura) define `--lia-accent` e `--lia-glow`.

## Mudancas do novo padrao e inconsistencias corrigidas
1. Proporcao: a cabeca tinha 88 de largura e ~118 de altura sobre um tronco de 40 no ombro (1 : 1,8), e as pernas nao existiam (sapatos colados no casaco). Agora o padrao e 1:4, com pernas visiveis.
2. Sobrancelhas com traco 2,5 (`.br path`) contra 1,5 no resto da arte. Unificado no `--lia-stroke`.
3. Estetoscopio com `stroke-width="3"` fixo. Removido; herda o traco unico.
4. Estrutura divergente do README: `lia-body` dizia conter cabelo e rosto, mas a cabeca era irma dele. Agora `lia-body` contem `lia-ground`, `lia-torso` e `lia-head`; bracos e props ficam em `lia-limbs`.
5. Olhos e sobrancelhas sem pivo por olho (impossivel ajustar a distancia) e cantos fixos nos retangulos. Agora `.el`/`.er` (distancia), `.ey` (tamanho) e `--lia-radius`.

Limitacoes conhecidas: ao mudar `--lia-shoulder`, a espessura das bordas horizontais do casaco varia um pouco (compensacao so no eixo vertical). `--lia-radius` afeta so os retangulos; as curvas dos paths sao fixas. Propriedades CSS individuais (`translate`, `scale`, `rx` em SVG) exigem Safari 14.1+ e navegadores atuais.

## Integracao
Dentro de `.lia`, monte a arte com `createElementNS` a partir de `window.LiaArt` (`lia-art.js`), nunca `innerHTML` (CSP). `fetch` nao serve (CSP e `file://`). Carregue `lia.css`. Ids se repetem se houver varias Lias na pagina; o CSS usa seletores de atributo e ids, entao funciona, mas remova os `id` dos clones se precisar de ids unicos. Tema: `[data-theme="dark"]` ou `.laift-always-dark`. Tamanho: `--lia-size` (padrao 120px). Animacoes JS (WAAPI) ficam para a onda de codigo; `lia.css` so tem respiracao 3s, piscada 6s e loops leves, desligados em `prefers-reduced-motion`.

## Props e poses da Onda 2 (lia-props-art.js)
Fonte: `lia-props.svg`. `build-lia-art.mjs` gera `lia-props-art.js` com o mesmo gerador do `lia-art.js` e expoe `window.LIA_PROPS_ART = { viewBox, tree }` (UMD, com `module.exports`). Carregue por `<script>` sob demanda (a CSP nao permite `fetch`). Orcamento: 16 KB (hoje 4,9 KB).
Regras do arquivo: cada no de topo e um `<g id="lia-pv-*">`. `data-cena` (1-7); `data-pai` = `svg` (raiz do `.lia-svg`, coordenadas do viewBox 200x300) ou um id existente de `lia.svg` (coordenadas do proprio grupo); `data-posicao="primeiro"` = inserir antes de `#lia-body` (atras da Lia). So as tags `g path rect circle ellipse`; sem `style`, `on*`, `xmlns` nem `use`.
Para o `build-lia-art.mjs` falhar: id fora de `lia-pv-*`, id repetido (de topo ou aninhado), id ja existente em `lia.svg`, `data-cena` fora de 1-7 ou `data-pai` invalido.

### Contrato de ids
| id | o que e | cena | pai | como aparece |
|---|---|---|---|---|
| `lia-pv-veu` | veu escuro atras do corpo (opacity 0 ate 0,35) | 5 | svg, primeiro | com o balao; recortado pelo cartao da Lia (`.lia[data-extras~="veu"]` em `lia.css`), nao pelo palco inteiro (desvio aceito pelo dono) |
| `lia-pv-liquido-b` | liquido 2 (ambar) do frasco | 1 | `#lia-prop-flask` | com `data-prop="flask"`; troca de cor por opacity; acompanha o chacoalhar do frasco |
| `lia-pv-bolha-1`, `-2`, `-3` | bolhas no liquido | 1 | `#lia-prop-flask` | sobem e somem (translateY + opacity) |
| `lia-pv-monitor` | moldura do monitor; filhos `lia-pv-ecg` (traco) e `lia-pv-coracao` (ponto) | 2 | svg | com `data-prop="none"` e `data-arm-right="point"` |
| `lia-pv-osso` | osso que encaixa na mao do esqueleto | 3 | svg | desliza e encaixa (ease-spring); com `data-prop="skeleton"` |
| `lia-pv-estrela` | estrela da conexao | 3 | svg | pulso (scale + opacity) |
| `lia-pv-folha` | pagina que vira (sobre o livro) | 4 | svg | scaleX 1 a 0 a -1, origem na lombada (x=100) |
| `lia-pv-interrogacao` | "?" sobre a cabeca | 4 | svg | sobe com opacity, depois fica |
| `lia-pv-tela` | tela com suporte apontada pela mao | 4 | svg | aparece ao apontar (`data-arm-right="point"`) |
| `lia-pv-cruzados` | bracos cruzados (no lugar dos bracos ociosos) | 5 | svg | some os bracos ociosos (`#lia-arm-left-idle`, `#lia-arm-right-idle`) |
| `lia-pv-aviso` | balao vermelho com "!" | 5 | svg | scale 0,4 a 1,08 a 1 |
| `lia-pv-costas-cabeca` | cabeca de costas (cobre o rosto com a cor do cabelo) | 6 | `#lia-head` | pose costas |
| `lia-pv-costas-costura` | costura do casaco de costas | 6 | `#lia-coat` | pose costas |

Ja existem em `lia.svg` (sem id novo): `#lia-prop-flask`, `#lia-prop-stethoscope`, `#lia-prop-thermometer` (o mercurio e `path.g`), `#lia-prop-skeleton`, `#lia-prop-book`, `#lia-arm-right-point`, `#lia-eyes-focused > *`, `#lia-head`, `#lia-coat`, `#lia-limbs`, `#lia-scene-heart`, `#lia-scene-glow`.

### Classes novas (ja estao em lia.css, blocos "Ondas 2-4")
As pecas usam as classes da paleta que ja existem (`p k c h a t s n rd`) e quatro novas, definidas em `lia.css` (`ln`, `al`, `gi`, `vu`). Referencia:
```
.lia-svg .ln { fill: none; stroke: var(--lia-accent); }
.lia-svg .al { fill: var(--lia-alert, var(--laift-danger, #b3261e)); }
.lia-svg .gi { fill: var(--lia-alert-ink, var(--laift-on-danger, #ffffff)); }
.lia-svg .vu { fill: var(--lia-shadow); }
```
`--laift-danger` ja muda no escuro (tokens). A copia de referencia usada na prova esta em `preview-props.css`.

### Pose de costas (regra para lia.css e S2)
Ocultar `#lia-eyes-*`, `#lia-brows-*`, `#lia-mouth-*`, `#lia-lock`, `#lia-glasses`, `.bl` e `#lia-coat > path.a` (lapela). Inserir `lia-pv-costas-cabeca` e `lia-pv-costas-costura`. A Lia fica com `data-state="suspended"` (opacidade 0,55). Sobreposicoes e nao um corpo copiado: assim a pose segue os `--lia-*`.

### Animacao, CSP e carregamento
- Origem de transformacao: ajuste pelo CSSOM (nao use `style` no atributo, a CSP bloqueia). `transform-box: fill-box` com origem na base em `lia-pv-liquido-b` e `#lia-prop-thermometer path.g`; origem `0% 50%` (esquerda) em `lia-pv-ecg` e `lia-pv-folha`; centro em `lia-pv-aviso`, `lia-pv-estrela` e `#lia-prop-skeleton`.
- Inserir so quando a cena pedir e remover ao sair: as props nao tem regra `display` no `lia.css`.
- Offline: `lia-props-art.js` está no PRECACHE de `sw.js`. `lia-props.svg` é só a fonte.

### Build e prova
- `scripts/build.js` nao muda: copia `modulos` por inteiro, e `lia-props.svg` e `lia-props-art.js` vao ao dist como `lia.svg` (nao sao excluidos por `LIA_REVIEW_ONLY`).
- Regerar: `node frontend/modulos/shared/lia/build-lia-art.mjs` (gera `lia-art.js` e `lia-props-art.js`).
- Revisao: `preview-ondas.html` (cenas) e `preview-props.html` (prova de fidelidade: cada id isolado e as composicoes finais).

## Codigo das ondas 2-4 (S2)
Ordem dos scripts em `index.html`: `lia-art`, `lia-states`, `lia-mood`, `lia-anim`, `lia-props`, `lia-scenes`, `lia`. Tudo opcional para a Lia base: sem `LiaProps` ou `LiaScenes`, ou com a arte das props ainda carregando, a Lia segue como na onda 1.
- `lia-states.js`: `planFor(contexto)` devolve `{ extras, sceneExtras, scene, late }`. `extras` entram com o contexto e ficam; `sceneExtras` so existem durante a animacao; `late` = a cena comeca quando a arte chegar. O `aria-label` e o do contexto (um por estado; o e2e `assistant` confere "Lia emitiu um alerta", "Lia esta suspensa" e "Lia" depois da redencao). Contextos novos: `redeem` (pose final da cena 6) e `warning` (preocupada, cena 5). Plano: `warning` (veu, cruzados, aviso), `suspended` (costas), `redeem` (costas so na animacao), `confused`, `lab`, `clinic`, `atlas`, `learn`.
- `lia-props.js`: `load()` injeta UM `<script>` de `lia-props-art.js` (mesma origem), com cache; falha = Lia base, sem erro visivel (nova tentativa so apos 60 s). `createSet(svg)` monta as pecas nos pais de `data-pai` (`primeiro` = antes de `#lia-body`) e as tira do DOM ao sair. O host ganha `data-extras="nome nome"`: e o gancho do `lia.css` (costas, bracos cruzados, recorte do veu). A Lia da bolha (`crop: 'head'`) nunca recebe pecas nem cenas.
- `lia-scenes.js`: as 7 linhas do tempo de `preview-ondas.js` (`lab`, `clinic`, `atlas`, `learn`, `warning`, `redeem`, `confused`), em WAAPI com `fill: both`: a pose final dura ate o proximo estado. Passos trocam `data-*` do host e removem pecas. Movimento reduzido = animacoes terminadas na hora e todos os passos aplicados (pose final). Origens de transformacao por CSSOM, nunca `style` no atributo.
- Redencao: `Lia.redeem()` toca a cena 6 (de costas -> gira em escala X -> de frente, sorri, coracoes) se as costas e `LiaScenes` estiverem prontos; senao, o aceno da onda 1.
- `assistant-typing.js` (fora desta pasta): digitacao do balao; leitor de tela recebe o texto completo de uma vez.
