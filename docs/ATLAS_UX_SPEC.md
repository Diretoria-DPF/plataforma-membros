# Especificação de UX — Atlas Anatômico 3D v2

> Onda 0 · WP01. Este documento é o contrato de interface que os pacotes de
> UI (WP08 casca/layout, WP09 painéis) e de motor (WP04 câmera/controles,
> WP06 interação) implementam. Congelado depois desta onda: uma mudança de
> medida, regra ou nome aqui é mudança de contrato entre pacotes e passa
> pelo orquestrador. Números exatos (px/dvh/z-index) espelham
> `frontend/modulos/anatomia-3d/css/tokens-atlas.css` — se os dois
> divergirem, o CSS é o que está em produção e este documento está
> desatualizado (avise o orquestrador).
>
> Os nomes de evento entre crases (`structure:select`, `sheet:snap`...)
> vêm de `js/core/bus.js` (`EVENTS`); os nomes de estado (`store.layers`,
> `store.sheetState`...) vêm de `js/core/store.js`. Este documento descreve
> **comportamento e medida**; a forma dos dados está nesses dois arquivos e
> em `js/core/contracts.js`.
>
> Padrões de interação citados (Complete Anatomy, Zygote Body, BioDigital
> Human, Visible Body, painéis inferiores no estilo Google Maps) são
> referências de **comportamento** — como um painel arrasta, como uma
> árvore de sistema→região→órgão se expande, como um raio-X funde duas
> camadas. Nenhuma marca, paleta ou tipografia desses produtos é copiada.

---

## 0. Princípios (não negociáveis)

1. **O corpo 3D é a tela.** Ele ocupa 100% da viewport do módulo desde o
   primeiro frame; painéis são desenhados por cima ou ao lado, nunca a
   substituem.
2. **Nunca mais de 45% do canvas coberto** por UI própria do Atlas, com uma
   única exceção explícita: o painel no estado **cheio** (full). Todo
   número de layout deste documento foi escolhido para essa regra valer no
   estado *padrão* de cada breakpoint — a §1.6 mostra a conta.
3. **Uma tarefa por vez.** Só os controles do modo e do passo atual
   aparecem; o resto fica atrás de "⋯" ou some.
4. **Nada rola a página.** `<body>` nunca tem scrollbar; só o painel
   arrastável, a lista do navegador e a ficha da estrutura rolam
   internamente, cada um na sua própria caixa `overflow: auto`.
5. **Selecionar desloca a câmera, nunca o layout.** Ver §3 (regra do
   view-offset). O painel não empurra o canvas para cima e para baixo —
   é a *câmera* que se afasta da área que o painel cobre.

---

## 1. Anatomia de tela por breakpoint

Cada breakpoint é descrito como uma pilha de camadas (z-order, de baixo
para cima) com medida exata e como as `env(safe-area-inset-*)` entram na
conta. Os valores de `--atlas-z-*` vêm de `tokens-atlas.css`.

### 1.1 Celular retrato (padrão; referência 390×844, mas fluido)

Camadas, de baixo para cima:

| # | Camada | z-index | Medida |
|---|---|---|---|
| 1 | Canvas 3D | `--atlas-z-canvas` (0) | 100% da viewport (`100vw` × `100dvh`) |
| 2 | Rótulos flutuantes (até 12) | `--atlas-z-labels` (10) | posicionados pelo motor, sem afetar layout |
| 3 | Mini barra de ferramentas | `--atlas-z-toolbar` (20) | coluna de botões de 44×44px, borda direita, `top: calc(var(--atlas-topbar-h) + env(safe-area-inset-top) + 12px)`, `right: max(12px, env(safe-area-inset-right))` |
| 4 | Barra superior | `--atlas-z-topbar` (30) | altura `--atlas-topbar-h` = **48px** + `env(safe-area-inset-top)` de respiro acima |
| 5 | Painel inferior arrastável | `--atlas-z-sheet` (40) | ver §2 |
| 6 | Menu de contexto / busca | `--atlas-z-context-menu`/`--atlas-z-search` (50/60) | flutuante, sob demanda |
| 7 | Modal (créditos, confirmações) | `--atlas-z-modal` (70) | tela cheia com fundo `--laift-overlay` |
| 8 | Toast (erro de carregamento etc.) | `--atlas-z-toast` (80) | topo, abaixo da topbar |

**Barra superior (48px):** três zonas numa linha —
`[← voltar/trilha] [nome do modo ▾] [🔍 busca]`. Em `Explorar` sem
seleção, a zona esquerda mostra "Atlas" (não uma trilha vazia). O botão de
voltar só aparece quando há uma seleção ativa ou o navegador está aberto
(volta um nível, não fecha o módulo — sair do módulo é a "Ponte" do host,
fora deste documento).

**Mini barra de ferramentas:** 6 botões de 44px, empilhados verticalmente,
espaçados por `--atlas-toolbar-gap` (8px): **Camadas, Isolar, Raio-X,
Corte, Reset, ⋯**. Ver §6 para o que cada um faz e o conteúdo do "⋯".

**Safe area:** a topbar soma `env(safe-area-inset-top)` ao seu `padding-top`
(o conteúdo de 48px começa depois do entalhe); a mini barra desloca-se de
`env(safe-area-inset-right)`; o painel inferior soma
`env(safe-area-inset-bottom)` como `padding-bottom` extra dentro do cartão
(a barra de gestos do iOS nunca cobre o último botão da ficha).

### 1.2 Celular paisagem (mesma largura de tela, altura curta)

`@media (orientation: landscape) and (max-height: 599px)`. O painel deixa
de ser inferior e vira **lateral direita**:

- Largura: `--atlas-panel-w-landscape` = `min(40vw, 400px)`.
- Altura: 100% da viewport útil (abaixo da topbar).
- Estados **peek/half/full** continuam existindo, mas agora são larguras,
  não alturas: peek = 0 (painel fechado, só uma aba vertical de 32px na
  borda direita com o nome da estrutura em texto vertical), half =
  `--atlas-panel-w-landscape` completo, full = 100vw (o painel cobre a
  tela, com um botão "◀" para voltar ao canvas).
- A mini barra de ferramentas migra para a borda **inferior**, em linha
  horizontal, para não competir com o painel lateral.
- `env(safe-area-inset-right)` desloca o painel para dentro (câmeras
  frontais em cutout lateral); `env(safe-area-inset-bottom)` desloca a
  barra de ferramentas para cima.

### 1.3 Tablet (600–1023px)

Layout de duas regiões fixas + uma temporária:

- **Canvas**: preenche o que resta.
- **Inspetor** (direita, persistente): a ficha da estrutura, não um
  painel arrastável. Regra de largura (deriva da §1.6):
  - `width ≥ 756px` → **340px** (`--atlas-panel-w-tablet`), sempre visível
    quando há seleção; sem seleção, colapsa para uma aba de 32px.
  - `600px ≤ width < 756px` → colapsa por padrão para uma aba de **48px**
    (ícone + nome truncado verticalmente); o toque nela expande para
    340px como uma camada *temporária* sobre o canvas (some ao tocar fora
    ou ao trocar a seleção), a mesma exceção de "painel cheio" da §0.2.
- **Navegador** (esquerda, gaveta): fechado por padrão (não é uma coluna
  fixa). Abre como um `drawer` de 300px sobre o canvas ao tocar o botão
  de trilha na topbar; fecha ao selecionar um item, ao tocar fora, ou com
  `Esc`. Por ser temporário, não entra na conta dos 45%.
- Topbar sobe para **52px** (`--atlas-topbar-h` no breakpoint); mini barra
  de ferramentas permanece igual à do celular, ancorada à borda do canvas
  (não à borda da tela, já que agora há um inspetor à direita).

### 1.4 Desktop (≥1024px)

Três colunas, mas só duas são "fixas" por padrão — a conta da §1.6 exige
isso:

```
┌────────────┬──────────────────────────────────┬────────────────┐
│ Navegador  │            Canvas 3D              │   Inspetor     │
│  (rail     │      + topbar (56px) +            │  (0 ou 380px)  │
│  56px, ou  │      mini barra de ferramentas    │                │
│  280px se  │                                   │                │
│  afixado)  │                                   │                │
└────────────┴──────────────────────────────────┴────────────────┘
```

- **Navegador**: começa como *rail* de **56px** (só ícones de sistema,
  com tooltip). Passar o mouse ou focar por teclado expande para
  `--atlas-panel-w-desktop-nav` = **280px** como um *flutuante* sobre o
  canvas (não empurra colunas — some ao tirar o foco/mouse). Um alfinete
  (📌) no topo do painel expandido o **afixa**: a partir daí ele passa a
  ser uma coluna real de 280px que empurra o canvas. Ver §1.6 para quando
  o layout desafixa automaticamente.
- **Inspetor**: começa **fechado** (0px, só uma aba de 32px na borda
  direita). Ao selecionar uma estrutura, abre automaticamente como coluna
  real de `--atlas-panel-w-desktop-inspector` = **380px**. Fecha (volta a
  0px) ao limpar a seleção (`Esc`, clique fora, botão fechar).
- Topbar: **56px**. Mini barra de ferramentas ancorada à borda do canvas.

### 1.5 TV (≥1600px, sem hover — `(hover: none)`)

Mesmo esqueleto de três regiões do desktop, com três diferenças:

- Texto e ícones em **1,5×** (`--atlas-tv-text-scale`), aplicado no
  `font-size` da raiz do módulo dentro deste `@media`.
- Anel de foco de **4px** (`--atlas-tv-focus-width`) em vez de 2–3px —
  precisa ser visível a 3 metros de distância.
- Não há hover nem cursor fino: **tudo** que em desktop abre por
  `hover`/`focus` (o rail do navegador) passa a abrir só por **seleção
  explícita** (OK no controle). O rail do navegador fica sempre visível
  em 56px (nunca "flutua" por engano ao passar o foco de raspão); expandir
  é uma ação deliberada (botão "Navegador" com OK).
- Navegação por zonas de foco com `focus-nav.js` — ver §13.

### 1.6 A conta dos 45% (por que os números acima são estes)

A regra do §0.2 vale para a UI **sobreposta** ao retângulo do canvas
(painel, drawer, rail flutuante) — colunas fixas que dividem a tela em
regiões *lado a lado* com o canvas são alocação de layout, não
"cobertura"; ainda assim, o padrão de cada breakpoint foi escolhido para
que a soma das colunas fixas abertas por padrão nunca passe de 45% da
largura, para o canvas nunca virar a região menor da tela sem que o
usuário tenha pedido isso explicitly (afixando um painel).

| Breakpoint | UI persistente por padrão | Regra |
|---|---|---|
| Celular retrato | mini barra (44px, flutuante, não conta como coluna) + painel em `peek` (96px de altura) | 96px / 844px ≈ 11% |
| Celular paisagem | painel fechado (aba de 32px) | 32px / largura ≈ irrelevante |
| Tablet, 600–755px | inspetor colapsado (aba 48px) | 48/600 = 8% |
| Tablet, ≥756px | inspetor aberto (340px) | 340/W ≤ 45% ⟺ W ≥ 756px — **por isso o corte é 756px** |
| Desktop | rail do navegador (56px) + inspetor aberto só com seleção (380px) | (56+380)/W ≤ 45% ⟺ W ≥ 969px — sempre verdadeiro em `≥1024px` |
| Desktop, navegador **afixado** + inspetor aberto | 280 + 380 = 660px | 660/W ≤ 45% ⟺ **W ≥ 1467px** — abaixo disso, afixar o navegador com o inspetor aberto desafixa automaticamente o navegador (toast: "Navegador recolhido para dar espaço ao 3D") |

Essas duas larguras-limite (**756px** e **1467px**) são derivadas, não
arbitrárias — se um número de coluna mudar em `tokens-atlas.css`, recalcule
o limite com `largura_da_coluna / 0.45` e atualize esta tabela.

---

## 2. Painel arrastável (bottom sheet) — estados, física e encaixe

Existe em duas formas: **inferior** (retrato) e **lateral** (paisagem —
mesmos três estados, ver §1.2). Esta seção descreve a forma inferior; a
lateral é a mesma física com eixo trocado (X em vez de Y).

### 2.1 Os três estados

| Estado | Altura (`--atlas-sheet-*-h`) | Conteúdo visível |
|---|---|---|
| **peek** | **96px** | uma linha: nome da estrutura (ou dica, se nada selecionado) + sistema + até 3 ações rápidas (ícones de 32px: Isolar, Raio-X, Info) |
| **half** | **45dvh** | cabeçalho + as abas da ficha (§9) com a primeira aba visível, rolável |
| **full** | **90dvh** | mesmo conteúdo de `half`, mais espaço para a lista completa (histologia, referências) — única exceção à regra dos 45% |

`dvh` (dynamic viewport height) em vez de `vh` porque a barra de endereço
móvel some/aparece ao rolar e `vh` ficaria descalibrado — mas como nada
dentro do Atlas rola a página (princípio §0.4), isso só afeta o cálculo
inicial da altura, não gera "salto" de layout.

### 2.2 Estrutura visual do cartão

```
┌───────────────────────────────┐
│              ▬▬                │  alça (36×4px, --atlas-sheet-handle-*)
│  Coração              ⚠ Rascunho│  cabeçalho (título + selo, ver §15)
│  Cardiovascular · Órgão · D    │  subtítulo (sistema · tipo · lado)
├───────────────────────────────┤
│ [Resumo][Anatomia][Histo.][…]  │  abas (só em half/full)
│                                 │
│  conteúdo rolável da aba ativa  │
│                                 │
├───────────────────────────────┤
│ [Isolar] [Fantasma] [Info +]   │  ações rápidas (sempre visíveis, mesmo em peek)
└───────────────────────────────┘
```

Cantos superiores com `--atlas-sheet-radius` (`--laift-radius-lg`, 20px);
sombra `--laift-shadow`. Fundo `--laift-surface` do tema ativo (nunca um
branco fixo — segue o tema, ver `tokens-atlas.css`).

### 2.3 Física de arraste

- **Alça e cabeçalho são a área de arraste** (o corpo rolável do conteúdo
  não inicia arraste do cartão — arrastar ali rola a aba; um `pointerdown`
  que começa fora da área rolável, ou um `pointermove` vertical capturado
  antes que o scroll interno se mova, é que inicia o arraste do cartão).
- O cartão segue o dedo 1:1 (`translateY`) enquanto arrasta — sem atraso,
  sem física ainda.
- **Ao soltar**, decide o snap por dois critérios, nesta ordem:
  1. **Velocidade** — se a velocidade no momento de soltar for
     `> 800px/s`, ignora a posição e vai direto para o próximo estado na
     direção do gesto (um "flick" rápido pula direto de `peek` para
     `full`, por exemplo, mesmo tendo arrastado só 20px).
  2. **Posição** — senão, olha para o estado mais próximo por distância
     ao ponto em que soltou; empate (exatamente no meio) resolve para o
     estado *mais aberto* (comportamento "otimista", como os painéis do
     Google Maps).
- **Rubber-band** além dos limites: arrastar para baixo de `peek` ou para
  cima de `full` segue o dedo com resistência (fator 0,35×) e sempre volta
  ao limite ao soltar — nunca fecha o painel por completo (não há um
  quarto estado "escondido"; o painel mais recolhido ainda é `peek`).
- **Animação de encaixe**: `--atlas-motion-sheet` (280ms),
  `--atlas-easing` (`cubic-bezier(0.2, 0.7, 0.2, 1)`) — uma curva que
  desacelera suave, sem "quique" (relevante para não conflitar com
  `prefers-reduced-motion`, que zera a duração no token, não na curva).
- **Toda transição de estado** — por arraste, por toque num botão, ou
  programática (ex.: selecionar uma estrutura na busca abre `half`
  automaticamente) — emite `sheet:snap` com `{ state, heightPx }`, onde
  `heightPx` é o valor resolvido (o `dvh` já convertido em px pelo shell,
  para quem assina o evento não precisar recalcular `dvh`).

### 2.4 Regras de encaixe automático

- Selecionar uma estrutura (`structure:select` com `sid` não nulo) quando
  o painel está em `peek` sobe automaticamente para `half`. Já estando em
  `half` ou `full`, permanece no estado atual (só troca o conteúdo).
- Limpar a seleção (`sid: null`) desce automaticamente de `full`/`half`
  para `peek` (nunca fecha mais que isso).
- Abrir a busca (`search:open`) ou o navegador força o painel para `peek`
  primeiro (dá espaço para o overlay de busca/drawer), restaurando o
  estado anterior ao fechar.
- Trocar de modo (`mode:change`) reseta o painel para `peek` — cada modo
  decide seu próprio conteúdo (§5) a partir daí.

### 2.5 Teclado e leitor de tela

- O painel tem `role="region"` com `aria-label` "Painel de {estrutura}"
  em `peek`/`half`; em `full`, ganha `aria-modal="false"` mesmo assim (não
  é modal — o canvas continua operável por teclado por trás, diferente de
  um modal de verdade em `--atlas-z-modal`).
- Três botões de estado ocultos visualmente mas focáveis
  (`.laift-sr-only`) antes da alça: "Recolher", "Meio", "Expandir" — para
  quem usa teclado sem mouse/touch trocar de estado sem arrastar.
- `aria-live="polite"` num nó dedicado dentro do cabeçalho anuncia o nome
  da estrutura ao selecionar (mesmo nó descrito em §17).

---

## 3. Regra do view-offset da câmera

Selecionar uma estrutura nunca move o painel para "abrir espaço" — é a
**câmera** que se desloca para que a estrutura fique centralizada na área
do canvas que sobra, livre de UI. Mecanismo:

1. O shell (WP08) observa toda mudança de layout que cobre parte do canvas
   — `sheet:snap`, abertura do inspetor no tablet/desktop, abertura do
   drawer do navegador — e calcula o **retângulo livre** (`freeRect`):
   o retângulo do canvas menos a área coberta, em pixels de tela relativos
   ao próprio canvas (`{ x, y, width, height }`).
2. O shell chama `engine.setViewOffset(freeRect)` (contrato `Engine` em
   `js/core/contracts.js`). Por dentro (WP04), isso é
   `camera.setViewOffset(canvasW, canvasH, offsetX, offsetY, freeRect.width, freeRect.height)`
   do three.js — a câmera passa a *renderizar* como se `freeRect` fosse a
   janela cheia, deslocando o centro óptico para o meio de `freeRect` sem
   mudar o FOV nem distorcer a perspectiva.
3. `engine.focusSid(sid)` e `engine.viewPreset(name)` sempre calculam a
   posição da câmera **depois** de aplicar o offset atual — centralizar
   "no que se vê" já leva em conta a área coberta, sem o chamador
   precisar saber nada sobre painéis.
4. Quando nada cobre o canvas (painel em `peek`, dentro do orçamento de
   45%, ou inspetor/drawer fechados), o shell chama
   `engine.setViewOffset(null)`, limpando o deslocamento.

**Quem cobre o quê, na prática:**

| Situação | `freeRect` (retrato) | `freeRect` (desktop) |
|---|---|---|
| Painel em `peek` / inspetor fechado | canvas inteiro (offset `null`) | canvas inteiro (offset `null`) |
| Painel em `half` | topo do canvas, até `100dvh − 45dvh` | — |
| Painel em `full` | faixa fina no topo (`100dvh − 90dvh`) — a câmera some visualmente atrás do painel; ver nota | — |
| Inspetor aberto (380px) | — | canvas menos a faixa direita de 380px |

> Nota sobre `full`: como o painel cobre 90% da altura, não há espaço útil
> para "centralizar" nada — o shell nem chama `focusSid` nesse estado
> (a ficha em `full` é para *ler*, não para continuar olhando o corpo).
> A câmera mantém o último offset de `half` congelado até o painel
> recolher.

Este é o único lugar do Atlas em que layout e câmera se comunicam
diretamente — nenhum outro pacote precisa reimplementar essa conta.

---

## 4. Seletor de modos

Uma linha de "chips"/abas na zona central da topbar (celular: um menu
suspenso a partir do rótulo do modo atual, para caber ao lado da busca;
tablet/desktop: os 6 nomes cabem em linha). Trocar de modo:

1. emite `mode:change` com `{ mode }`;
2. o modo anterior tem `exit()` chamado (contrato `Mode`);
3. o novo modo tem `enter(ctx)` chamado — é aqui que bibliotecas pesadas
   (Chart.js, 3Dmol) carregam, sob demanda, só se aquele modo precisar;
4. o painel reseta para `peek` (§2.4) e troca de conteúdo (`sheetContent()`).

O corpo 3D **nunca desaparece** ao trocar de modo — só o que os painéis e
a mini barra mostram muda.

| Modo | Toolbar (mini barra) | Conteúdo do painel | 3D |
|---|---|---|---|
| **Explorar** | Camadas, Isolar, Raio-X, Corte, Reset, ⋯ (completa — §6) | Ficha da estrutura selecionada (§9); em `peek` sem seleção, dica "Toque numa estrutura" | Corpo completo, camadas conforme o painel de camadas |
| **Fisiologia & Vias** | Reproduzir/Pausar, Velocidade, Reiniciar, Camadas, Reset | Lista de processos/vias (acordeão) com o item ativo expandido e uma barra de progresso da animação | Corpo com a via/processo animado sobreposto (partículas/fluxo); demais estruturas em opacidade reduzida |
| **Farmacologia** | Reset, Camadas (só para contexto visual) | Painel compacto do gráfico de PK/PD (Chart.js) + controles de dose/via; aba "Compostos" com os protocolos antigos de biohacking, com o selo do §15 | Órgão-alvo do fármaco atual acende (`setColor`/destaque); resto em raio-X leve automático |
| **Moléculas** | Estilo da molécula (bastão/esfera/fita), Reset | Visualizador 3Dmol embutido (carregado sob demanda) — no celular ocupa o painel em `full`; em tablet/desktop é uma coluna extra dividindo o canvas 50/50 com o corpo | Órgão relacionado à proteína-alvo destacado |
| **Quiz** | só Reset e Sair do quiz (as demais ações somem — "uma tarefa por vez") | Enunciado do caso, placar, feedback da última resposta | Corpo no estado exigido pelo caso; toque na estrutura correta dispara `quiz:answer` |
| **Meu estudo** | Reset | Histórico de sessões, fixações salvas (IndexedDB), botão "Gerar dossiê em PDF" | Última estrutura vista, ou vista padrão |

---

## 5. Barra de ferramentas (toolbar)

Botões de 44px (56px na TV), sempre com rótulo acessível
(`aria-label`) mesmo quando só mostram ícone. Da lista completa (modo
Explorar — outros modos removem os que não usam, §4):

1. **Camadas** (`aria-pressed` = painel de camadas aberto/fechado) — abre
   o painel de camadas (§10) como um flutuante ancorado ao próprio botão
   (não o painel inferior — é uma superfície própria, para poder ficar
   aberto ao lado da ficha).
2. **Isolar** — desabilitado sem seleção; emite `visibility:isolate`.
3. **Raio-X** — alterna, emite `xray:set`; estado ligado marca o botão
   com o acento do módulo (`--module-accent`).
4. **Corte** — abre um submenu de 3 opções (Sagital, Coronal,
   Transversal) + uma alça de arraste que aparece sobre o canvas para
   mover o plano; emite `clip:set`. Selecionar "Nenhum" no submenu limpa
   (`{ plane: null, offset: null }`).
5. **Reset** — limpa isolar/ocultar/fantasma (`visibility:reset`), raio-X,
   corte, e chama `view:reset`. Um único botão para "eu me perdi, volta
   tudo".
6. **⋯ (Mais)** — abre um menu com: Rótulos (liga/desliga, `labels:set`),
   Vistas (Anterior/Posterior/Esquerda/Direita/Superior/Inferior,
   `view:preset`), Tela cheia, Trocar sexo (M/F), Qualidade gráfica
   (Automática/Baixa/Média/Alta, `quality:change`), Créditos (§16).

---

## 6. Busca

Campo de texto (mantém `#bio-search-input` como id de compatibilidade —
ver `LEGACY_COMPAT` em `contracts.js`) que abre como overlay
(`--atlas-z-search`) cobrindo a topbar, com teclado focado automaticamente.

**Comportamento:**
- Busca em PT, EN, latim e sinônimos simultaneamente; normaliza acento
  (`NFD` + remove diacríticos) antes de comparar.
- Tolerante a erro de digitação: distância de edição (Levenshtein) ≤ 2
  para termos de até 12 caracteres, ≤ 3 para termos maiores.
- Cada resultado mostra: nome em PT (trecho casado em negrito), sistema,
  e lado quando aplicável (`E`/`D`/`—`).
- **Ranking** (maior prioridade primeiro; dentro do mesmo nível, ordena
  por menor distância de edição e depois alfabético):
  1. Igualdade exata com o nome PT principal.
  2. Nome PT começa com o termo (prefixo).
  3. Igualdade exata com sinônimo, nome EN ou nome em latim.
  4. Substring do termo em qualquer nome/sinônimo.
  5. Casamento aproximado (dentro da tolerância de erro de digitação).
- Lista de até 8 resultados visíveis, rolável; `↑`/`↓` navega, `Enter`
  seleciona (emite `structure:select` com `source: 'search'` e fecha a
  busca), `Esc` fecha sem selecionar.
- Campo vazio mostra os 5 itens mais recentes de `store` (Meu estudo) em
  vez de nada.
- Sem resultados: "Nenhum resultado para “{termo}”. Tente outro termo ou
  confira a grafia." — nunca uma lista vazia muda.

---

## 7. Navegador em níveis, com trilha

Árvore **sistema → região → órgão → subestrutura** (tecido e célula não
entram aqui — aparecem só na ficha, aba Histologia & Células, §9). Cada
nível é uma lista, não uma árvore expansível infinita: tocar um item com
filhos *navega para dentro* (nova lista, trilha cresce); tocar um item sem
filhos *seleciona* (`structure:select`, `source: 'navigator'`).

```
Trilha:  Sistemas › Cardiovascular › Tórax
─────────────────────────────────────────
  Coração                              ›
  Aorta                                ›
  Veia cava superior                    (sem filhos → seleciona direto)
  Veia cava inferior                    (sem filhos → seleciona direto)
```

- A trilha (breadcrumb) fica fixa no topo do navegador; cada nome é
  clicável e volta para aquele nível (não é só "voltar 1"). O primeiro
  item, "Sistemas", volta para a lista dos 12 sistemas (`SYSTEMS` em
  `contracts.js`).
- Gesto de arrastar da borda esquerda para a direita (ou `Alt+←`) volta um
  nível, como "voltar" do navegador do sistema operacional.
- Um item já carregado (sistema presente em `store.loadedSystems`) mostra
  contagem de estruturas; um sistema ainda não carregado mostra um
  indicador de carregamento sutil ao ser aberto (dispara
  `system:load:start`/`AssetLoader.loadSystem`) e um selo "Indisponível"
  se estiver em `store.unavailableSystems` (§14).
- No celular/paisagem, o navegador é sempre uma camada temporária sobre o
  canvas (drawer, mesma regra do tablet — §1.3); em desktop/TV é o rail
  fixo da §1.4/1.5.

---

## 8. Ficha da estrutura (info card)

Cabeçalho (nome, sistema/tipo/lado, selo de revisão — §15) + 5 abas.
Todas as abas compartilham a mesma caixa rolável abaixo da barra de abas;
trocar de aba não perde a posição de rolagem da aba anterior (mantida em
memória enquanto a ficha está aberta).

| Aba | Conteúdo |
|---|---|
| **Resumo** | `summary_pt` (2–4 parágrafos), miniatura da posição no corpo |
| **Anatomia** | Relações anatômicas, vascularização, inervação, drenagem linfática — cada uma como uma lista com links internos (tocar um nome relacionado seleciona aquela estrutura, sem sair da ficha) |
| **Histologia & Células** | Tipos celulares (nome PT + id de Cell Ontology `CL:####`) e biomarcadores, vindos do HRA ASCT+B; célula em 3D é fase futura — aqui é só ficha |
| **Clínica** | Correlações clínicas (achados, condições associadas), sempre com fonte |
| **Referências** | Lista de `sources[]` (título, licença, link) e os identificadores externos: **FMA**, **Uberon**, **TA2**, **CID-10**, **MeSH** — cada um como um chip com o código e link externo |

O cabeçalho preserva os hooks de compatibilidade `#organ-hud` (o cartão
inteiro) e `#organ-name` (o nó de texto do nome) — ver `LEGACY_COMPAT`.

---

## 9. Painel de camadas

Flutuante ancorado ao botão "Camadas" da toolbar (não o painel inferior).
Uma linha por camada (`LAYERS` em `contracts.js`, 7 itens) — interruptor
liga/desliga + controle deslizante de opacidade (0–100%) + a cor da
camada (um quadradinho de 12px com `--atlas-color-*`, útil quando duas
camadas próximas se confundem):

```
┌─────────────────────────────┐
│ Superficial ●───○───○ Profundo│  preset (5 posições)
├─────────────────────────────┤
│ ■ Pele        [○off] ▬▬▬▬▬░  │
│ ■ Músculos    [●on ] ▬▬▬░░░  │
│ ■ Esqueleto   [●on ] ▬▬▬▬▬░  │
│ ■ Vísceras    [○off] ▬▬▬▬▬░  │
│ ■ Vasos       [○off] ▬▬▬▬▬░  │
│ ■ Nervos      [○off] ▬▬▬▬▬░  │
│ ■ Linfático   [○off] ▬▬▬▬▬░  │
└─────────────────────────────┘
```

Estado inicial (store.js): **Músculos + Esqueleto** ligados — é o que o
primeiro download já traz e o que o estudante espera ver ao abrir; Pele e
as camadas profundas entram sob demanda.

O preset **"Superficial ↔ Profundo"** é um controle de 5 posições que
aciona combinações coerentes sem o usuário precisar ligar camada por
camada: Pele → +Músculos → +Esqueleto → +Vísceras → +(Vasos, Nervos,
Linfático); mover o preset ainda emite um `layer:set` por camada que
mudou (nenhum evento novo — o preset é açúcar sintático sobre `layer:set`).
Ajustar uma camada individualmente depois do preset não "desliga" o
preset — ele só reflete a última combinação conhecida, sem tentar
adivinhar em qual posição o conjunto atual se encaixa melhor.

---

## 10. Menu de contexto

Aberto por toque longo (~500ms) no corpo ou clique direito (desktop) numa
estrutura. Opções, nesta ordem: **Isolar, Ocultar, Fantasma, Info**. Regras:

- Aparece ancorado ao ponto de toque/clique; se não houver espaço abaixo,
  abre para cima (nunca sai da viewport).
- Linhas de 44px mínimo, mesmo em desktop (o padrão de alvo de toque do
  Atlas não muda por dispositivo).
- Fecha ao escolher uma opção, ao tocar fora, ou com `Esc`.
- "Info" seleciona a estrutura E abre o painel em `half` direto na aba
  Resumo — atalho para não precisar tocar duas vezes.
- Isolar/Ocultar/Fantasma aqui chamam os mesmos eventos do botão
  equivalente na toolbar (§5) — o menu de contexto não é um conjunto de
  ações paralelo, é outro caminho para as mesmas três.

---

## 11. Gestos e atalhos de teclado

**Gestos (canvas):**

| Gesto | Ação |
|---|---|
| 1 dedo, arrastar | Gira a câmera em torno do corpo |
| 2 dedos, pinça | Zoom |
| 2 dedos, arrastar | Deslocamento (pan) lateral da câmera |
| Toque simples | Seleciona a estrutura sob o dedo (`structure:select`, `source: 'pick'`) |
| Toque duplo | Seleciona **e** foca (equivalente a selecionar + `focusSid`) |
| Toque longo (~500ms) | Abre o menu de contexto (§10) na estrutura sob o dedo |

**Teclado (com o canvas ou o módulo em foco, fora de um campo de texto):**

| Tecla | Ação |
|---|---|
| `/` | Abre a busca (`search:open`) |
| `H` | Oculta a estrutura selecionada |
| `I` | Isola a estrutura selecionada |
| `X` | Alterna raio-X |
| `Esc` | Limpa a seleção; se a busca/menu de contexto estiver aberto, fecha aquilo primeiro (um `Esc` = um nível, nunca fecha duas coisas de uma vez) |
| `Tab` / `Shift+Tab` | Ordem de foco padrão do navegador (topbar → toolbar → canvas → painel) |
| `Alt+←` | Volta um nível no navegador (mesmo gesto de arrastar da borda, §7) |

Atalhos de uma letra são desativados automaticamente enquanto qualquer
campo de texto (busca, futuras anotações) está focado, para não capturar
digitação normal.

---

## 12. Zonas de foco na TV

`focus-nav.js` divide a tela em **zonas** navegáveis por seta, e dentro de
uma zona as setas movem entre os itens daquela zona; `Enter`/OK ativa;
`Voltar` sai da zona para a anterior. Zonas, na ordem em que `Direita`
alterna entre elas a partir da topbar:

1. **Topbar** — trilha/voltar, seletor de modo, busca.
2. **Rail do navegador** — ícones de sistema (56px); OK expande a lista.
3. **Canvas** — uma **mira central** fixa (retículo, sempre visível na
   TV, diferente do mouse); as setas *giram a câmera* (não movem um
   cursor 2D); a estrutura sob a mira é destacada em tempo real
   (`structure:hover`); OK seleciona o que está sob a mira agora.
4. **Toolbar** — os mesmos botões da §5, em linha.
5. **Inspetor/painel** — quando aberto, suas abas e ações; setas
   navegam os itens da aba ativa, `Esc`/Voltar fecha o inspetor e devolve
   o foco ao canvas.

O anel de foco de 4px (§1.5) marca sempre qual zona e qual item têm o
foco — nunca há foco "invisível" na TV.

---

## 13. Estados vazio, carregando, erro e indisponível

- **Vazio (sem seleção)**: painel em `peek` mostra "Toque numa estrutura
  para começar" (ou "Aponte a mira e pressione OK" na TV) em vez de um
  cabeçalho vazio.
- **Busca sem resultado**: ver §6.
- **Carregando um sistema** (`system:load:start` → `...:done`): o botão
  daquele sistema no navegador mostra um indicador sutil (anel girando
  fino, 16px); o canvas não trava — outros sistemas já carregados
  continuam interativos. Ao concluir (`system:load:done`), o indicador
  some sem outro aviso (é uma operação esperada, não um evento que
  precise de confirmação).
- **Erro de carregamento** (`system:load:error`): toast de 4s no topo
  ("Não foi possível carregar {sistema}. Toque para tentar de novo.") +
  o item correspondente no navegador e no painel de camadas ganha o selo
  **"Indisponível"** (texto, não só cor — ver §17 sobre contraste/daltonismo).
  O corpo mostra o que existir em `js/engine/fallback.js` (forma
  procedural, "esquemática") no lugar, nunca um buraco.
- **Estrutura esquemática (fallback)**: a ficha daquela estrutura mostra
  uma faixa "Modelo esquemático — geometria de referência, não anatômica"
  antes do Resumo, para não ser confundida com um modelo fiel.
- **Biblioteca pesada carregando** (Chart.js/3Dmol ao entrar num modo):
  o painel daquele modo mostra um esqueleto de carregamento (placeholder
  cinza pulsante, respeitando `prefers-reduced-motion` — sem pulsar,
  estático) em vez de aparecer vazio até a lib terminar de baixar.

---

## 14. Selo "Rascunho — não revisado"

Pequeno rótulo (`role="status"`, não só decorativo) com o texto exato
**"Rascunho — não revisado"**, cor `--laift-warning` sobre
`--laift-warning-soft` (contraste AA validado em `tokens-atlas.css`),
ícone de alerta (▲! ou equivalente, nunca só a cor). Aparece:

- No cabeçalho da ficha, ao lado do nome, quando `content.review.status`
  daquela estrutura não é `"reviewed"`.
- Na aba "Compostos" do modo Farmacologia (protocolos antigos de
  biohacking, migrados como `legacy-unverified`).
- Um toque/clique no selo abre um tooltip curto: "Texto gerado
  automaticamente; ainda não revisado por profissional da área. Ver
  `docs/ATLAS_CONTENT_POLICY.md`."

O selo **desaparece** sozinho quando o conteúdo daquele `sid` for
revisado (o campo `review.status` muda para `"reviewed"` no pipeline de
conteúdo, WP11) — não há uma lista separada para "desmarcar" na UI.

---

## 15. Tela de créditos

Modal (`--atlas-z-modal`) acessível pelo "⋯" da toolbar (§5) e pelo modo
Meu estudo. Lista, por bloco:

- **Z-Anatomy** (corpo completo) — licença CC BY-SA 4.0, link do projeto.
- **HRA / HuBMAP** (órgãos de referência de alta fidelidade,
  masculino/feminino) — licença CC BY, link do Human Reference Atlas.
- **Wikidata / Wikipédia PT** (identificadores e introduções de conteúdo)
  — CC BY-SA, com a citação exigida pela licença.
- **HRA ASCT+B** (células, biomarcadores) — mesma licença do HRA.
- Nota fixa: "Os modelos 3D derivados destas fontes seguem abertos; o
  código deste módulo não." (mesma frase do plano, para não haver
  ambiguidade de licença entre o asset e o app).

Cada bloco é uma seção com heading próprio (navegável por leitor de tela),
não um parágrafo corrido — é a referência que qualquer revisão de
conformidade de licença vai procurar primeiro.

---

## 16. Acessibilidade

- **Alvos de toque**: 44px mínimo em qualquer controle interativo, em
  qualquer breakpoint (a TV usa 56px — é maior, nunca menor).
- **`aria-live="polite"`**: um único nó dedicado (fora da árvore visual
  do painel, `.laift-sr-only`) recebe o nome da estrutura a cada
  `structure:select` — "Selecionado: Coração, sistema cardiovascular."
  Seleção limpa anuncia "Seleção removida."
- **`prefers-reduced-motion`**: já zera transições/animações globais
  (`laift-tokens.css`) e os tokens de duração específicos do Atlas
  (`tokens-atlas.css`) — a física de arraste do painel (§2.3) e o tween
  de câmera (§3) leem esses tokens em vez de um valor fixo, então também
  ficam instantâneos.
- **Contraste**: toda cor de camada (§ tokens `--atlas-color-*`) e o selo
  de rascunho foram escolhidos para ≥4,5:1 contra `--laift-surface` e
  `--atlas-canvas-bg` nos dois temas — nenhuma informação depende só de
  cor (o selo tem texto+ícone; "Indisponível" é texto, não só um X vermelho).
- **Foco visível**: herdado globalmente de `laift-tokens.css`
  (`:focus-visible`) e ampliado na TV (§1.5/§12).
- **Ordem de tabulação**: segue a ordem visual — topbar → toolbar →
  canvas (como um único elemento focável que captura teclado para os
  atalhos da §11, com `tabindex="0"` e `aria-label` descrevendo o que
  está selecionado) → painel/inspetor.
- **Sem `innerHTML`**: todo painel é construído com `document.createElement`
  ou `LaiftDom.html` (`modulos/shared/safe-dom.js`) — texto vindo do
  conteúdo (nomes, resumos) nunca é interpretado como HTML.

---

## 17. Orçamento de desempenho

Regras (ligadas a `store.quality` e ao evento `quality:change`):

- **Render sob demanda**: o motor só chama `renderer.render` quando algo
  muda (câmera, seleção, animação de um modo ativo) — nunca um loop de
  `requestAnimationFrame` incondicional. `Engine.requestRender()` é o
  único jeito de pedir um frame.
- **`pixelRatio`**: até 1,5 no celular; o `js/engine/quality.js` mede o
  tempo de frame e, se passar de 33ms por alguns frames seguidos, reduz
  o `pixelRatio` automaticamente (emite `quality:change` com o novo
  `tier`/`pixelRatio` para a UI refletir, se precisar).
- **Draw calls**: até 150 no celular (o `BatchedMesh` por sistema do WP04
  existe justamente para isto).
- **Triângulos**: até 1,5 milhão visíveis no celular.
- **Memória JS**: até 250MB.
- **1ª carga**: até 5MB (o manifesto + o sistema inicial em LOD1); os
  demais sistemas só entram ao serem ligados no painel de camadas ou
  abertos no navegador (`AssetLoader.loadSystem` sob demanda).
- **Bibliotecas de modo** (Chart.js, 3Dmol): zero bytes até o modo que as
  usa ser aberto pela primeira vez (§4/§13).

---

## 18. Wireframes ASCII

### 18.1 Celular retrato — painel em `half`, estrutura selecionada

```
┌───────────────────────────────────┐
│ Coração              [Explorar▾] 🔍│  topbar 48px
├───────────────────────────────────┤
│                                [▤]│  Camadas
│                                [◎]│  Isolar
│         corpo 3D em            [☠]│  Raio-X
│         tela cheia,            [✂]│  Corte
│         câmera deslocada       [⟲]│  Reset
│         para cima (§3)         [⋯]│  Mais
│                                    │
│                                    │
├───────────────────────────────────┤
│               ▬▬                  │  alça
│  Coração                ⚠Rascunho │
│  Cardiovascular · Órgão · —       │
│ [Resumo][Anatomia][Histo.][Clín.][Ref.]│
│                                    │
│  O coração é um órgão muscular... │  conteúdo rolável
│  (aba Resumo)                     │
│                                    │
├───────────────────────────────────┤
│  [Isolar]   [Fantasma]  [Info +]  │  ações rápidas
└───────────────────────────────────┘  45dvh
```

### 18.2 Desktop — três colunas, navegador em rail, inspetor aberto

```
┌───┬──────────────────────────────────────────┬────────────────┐
│ ▤ │ ← Sistemas › Cardiovascular   [Explorar▾]🔍│ Coração         │
│ ▤ ├──────────────────────────────────────────┤ ⚠ Rascunho      │
│ ▤ │                                          │ Cardiovascular  │
│ ▤ │                                          │ [Resumo][Anat.] │
│ ▤ │            corpo 3D                      │ [Histo.][Clín.] │
│ ▤ │      (câmera deslocada para a            │ [Ref.]          │
│ ▤ │       esquerda, longe do inspetor)       │                 │
│ ▤ │                                          │ O coração é...  │
│   │                                          │                 │
│   │  [Camadas][Isolar][Raio-X][Corte][Reset] │ FMA:7088        │
│   │                                    [⋯]   │ Uberon:UBERON…  │
│   │                                          │ [Isolar][Fant.] │
└───┴──────────────────────────────────────────┴────────────────┘
 56px                  resto                        380px
```

---

## 19. Referências de padrão de interação (comportamento, não marca)

- **Painéis inferiores no estilo Google Maps** — três estados com física
  de arraste por velocidade+posição (§2.3) e o princípio de "o conteúdo
  por trás nunca fica inacessível, só menos visível" (§0.5/§3).
- **Complete Anatomy / Visible Body** — navegador em árvore
  sistema→região→órgão com trilha persistente (§7) e ficha com abas
  fixas por tipo de informação (§8), em vez de texto corrido único.
- **BioDigital Human** — camadas independentes com opacidade contínua
  (não só liga/desliga) e um preset "superficial↔profundo" como atalho
  sobre as mesmas camadas (§9).
- **Zygote Body** — seleção por toque simples com destaque imediato e
  reset de um único botão que desfaz isolar/raio-X/corte de uma vez (§5,
  botão Reset) — importante em uma superfície com tantos modos
  independentes de "olhar" o corpo ao mesmo tempo.

Nenhuma paleta, tipografia, logotipo ou nome de produto desses
aplicativos é usado — só o *comportamento* de interação, adaptado às
medidas e ao tema (`laift-tokens.css`) da Plataforma de Membros.
