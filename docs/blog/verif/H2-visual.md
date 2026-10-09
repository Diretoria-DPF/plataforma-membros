# H2 (blog-visual): verificação de ativos, PWA, números, movimento e tokens

Checagem: 2026-10-09 | base origin/main 3bb5909 | HEAD 3bb5909

Escopo: leitura de arquivos. Sem npm install, build, teste, Lighthouse, axe nem chamada a produção. Caminhos relativos à raiz. Dimensões de PNG pelo cabeçalho IHDR; bytes por `wc -c`. Deduções levam "(inferencia)".

## 1. Ativos

| Arquivo | Tipo | Dimensão | Bytes | Onde é usado (arquivo:linha) |
|---|---|---|---|---|
| frontend/icons/apple-touch-icon.png | PNG | 180x180 | 31114 | frontend/index.html:15; frontend/scripts/pwa.test.mjs:55 |
| frontend/icons/favicon-32.png | PNG | 32x32 | 2937 | frontend/index.html:14 |
| frontend/icons/icon-192.png | PNG | 192x192 | 51063 | frontend/manifest.webmanifest:16; frontend/sw.js:24 |
| frontend/icons/icon-512.png | PNG | 512x512 | 275213 | frontend/manifest.webmanifest:17 |
| frontend/icons/icon-maskable-512.png | PNG | 512x512 | 103833 | frontend/manifest.webmanifest:18 (maskable) |
| frontend/modulos/cracha/laift-marca.png | PNG | 500x500 | 291829 | frontend/sw.js:28; frontend/splash.js:77; frontend/credential.js:19; frontend/index.html:927; frontend/liga.html:18; frontend/modulos/cracha/cracha.css:28. Como texto: frontend/index.html:27 e :40 (URL absoluta de produção, sem chamada) |
| frontend/modulos/shared/lia/lia.svg | SVG | viewBox 0 0 200 300; `<svg>` raiz sem width/height (lia.svg:1) | 8691 | Fonte: frontend/modulos/shared/lia/build-lia-art.mjs:160. Runtime usa lia-art.js gerado (frontend/index.html:993); build-lab.mjs:17 injeta no lab; preview.js:3 (só preview) |
| frontend/modulos/shared/lia/lia-estatica.svg | SVG | viewBox 0 0 200 300; width=200 height=300 (lia-estatica.svg:1) | 9639 | frontend/liga.html:25; frontend/scripts/e2e/liga.e2e.js:29 |
| frontend/modulos/shared/lia/lia-props.svg | SVG | viewBox 0 0 200 300; `<svg>` raiz sem width/height (lia-props.svg:8) | 3682 | Fonte: build-lia-art.mjs:161. Runtime: frontend/index.html:998 carrega lia-props.js, que busca lia-props-art.js sob demanda (lia-props.js:19) |

- Correção à primeira leitura: width=14/height=32 de lia.svg são do `<rect id="lia-neck">` (lia.svg:7); width=360/height=380 de lia-props.svg são do `<rect class="vu">` (lia-props.svg:10).
- Transparência do PNG não verificada (sem decodificação). docs/liga/IDENTIDADE_VISUAL.md:71 afirma que laift-marca.png tem transparência.
- (inferencia) lia-props-art.js está no PRECACHE (frontend/sw.js:24) e nenhum HTML o carrega com `<script>` direto.

## 2. PWA

### 2.1 Manifest (frontend/manifest.webmanifest)
- id "./" (linha 2); name "LAIFT – Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia" (3); short_name "LAIFT" (4); lang pt-BR (6); start_url "./" (8); scope "./" (9); display standalone (10); orientation portrait-primary (11); theme_color #0f6f62 (12); background_color #f4f6fb (13); categories education (14); icons: 192 any, 512 any, 512 maskable (15-19).
- index.html: manifest em :13; theme-color #0f6f62 em :16; metas iOS em :17-20.
- (inferencia) background_color #f4f6fb (manifest.webmanifest:13) difere de --layer-0 claro #fafaf7 (frontend/modulos/shared/laift-tokens.css:78).

### 2.2 Service worker (frontend/sw.js)
- Cache `laift-shell-v3` (sw.js:19-20). PRECACHE: 49 entradas (sw.js:23-29), contadas por script.

| Grupo | Linha | Qtd | Entradas |
|---|---|---|---|
| Shell, estilos, gráficos | 24 | 9 | './', styles.css, ux.css, ux-glass.css, home-editorial.css, dashboardAdapter.js, charts.css, charts-core.js, charts.js |
| Lia | 24 | 9 | lia.css, lia-art.js, lia-props-art.js, lia-props.js, lia-scenes.js, lia-states.js, lia-mood.js, lia-anim.js, lia.js |
| Manifest e ícone | 24 | 2 | manifest.webmanifest, icons/icon-192.png |
| Scripts da página | 25-26 | 24 | app.js, shared-states.js, pwa.js, ..., assistant-typing.js, modulos/shared/safe-dom.js |
| Splash e tokens | 27 | 4 | ux-v2.js, splash.js, splash.css, laift-tokens.css |
| Crachá | 28 | 1 | laift-marca.png |

| Requisição | Tratamento | Linha |
|---|---|---|
| Não GET | não intercepta | sw.js:33 |
| Outra origem (API) | não intercepta | sw.js:36; comentário :9 |
| /modulos/anatomia-3d/ (Atlas) | não intercepta | sw.js:37 |
| /sw.js e Range | não intercepta | sw.js:38-39 |
| Mesma origem, GET | rede primeiro; guarda cópia se ok e type basic | sw.js:80-84; :43-45 |
| Falha de rede | cache; navegação sem cache devolve './' | sw.js:86-90 |

- Install: falha de um item não aborta (sw.js:63); skipWaiting (:64). Activate: apaga `laift-shell-*` antigos (:70-72).

### 2.3 Offline e registro

| Item | Offline | Base |
|---|---|---|
| Itens do PRECACHE | funcionam após instalação | sw.js:23-29, :63 |
| Navegação sem cache | devolve './' | sw.js:89 |
| Mesma origem já visitada | funciona (inferencia: cache de runtime) | sw.js:81-84 |
| API e POST | não funcionam (fora do SW) | sw.js:33, :36, :9 |
| CDN nas páginas de módulo (smiles-drawer, 3Dmol, openchemlib, RDKit, html5-qrcode) | não funciona (inferencia: cross-origin) | docs/riscos-residuais.md:76 (O31b, "A mitigar") |
| Atlas 3D | fora do SW; cache próprio por build | sw.js:37; frontend/scripts/build.js:133; atlas-offline.e2e.js:69 |
| Aviso de conexão | "Você está offline..." se navigator.onLine false | frontend/shared-states.js:28, :109-121 |

- Registro: frontend/pwa.js:14-17 exige serviceWorker, não webdriver e https ou localhost; registra 'sw.js' com scope './' no load (:28-29).
- Testes por nome: frontend/scripts/pwa.test.mjs (11 testes, linhas 27 a 119); frontend/scripts/e2e/atlas-offline.e2e.js (cache `atlas-<16 hex>` :69; escopo :72).

## 3. Números já registrados (cópia, sem cálculo)

### 3.1 Lighthouse em produção: docs/LIGHTHOUSE_2026-10-08b.md
Página: login `/` da URL pública (linhas 1 e 3). Data: 2026-10-08, 21:24:07 a 21:29:18 UTC (linha 67). Mobile e desktop, três rodadas cada.

| Métrica | Mobile R1 / R2 / R3 → mediana | Desktop R1 / R2 / R3 → mediana | Linha |
|---|---|---|---|
| Performance | 94 / 85 / 98 → 94 | 100 / 91 / 100 → 100 | 9; 39 |
| Acessibilidade | 100 / 100 / 100 → 100 | 100 / 100 / 100 → 100 | 10; 40 |
| Boas práticas | 100 / 100 / 100 → 100 | 100 / 100 / 100 → 100 | 11; 41 |
| SEO | 92 / 100 / 100 → 100 | 100 / 100 / 100 → 100 | 12; 42 |
| FCP | 1153 / 1279 / 1121 ms → 1153 ms (1,2 s) | 372 / 361 / 369 ms → 369 ms | 13; 43 |
| LCP | 1153 / 3926 / 1121 ms → 1153 ms (1,2 s) | 372 / 361 / 369 ms → 369 ms | 14; 44 |
| TBT | 246 / 96 / 124 ms → 124 ms | 14 / 1 / 8 ms → 8 ms | 15; 45 |
| CLS | 0,041 / 0,000 / 0,000 → 0,000 | 0,000 / 0,000 / 0,000 → 0,000 | 16; 46 |
| Speed Index | 3181 / 3909 / 3412 ms → 3412 ms (3,4 s) | 874 / 3963 / 913 ms → 913 ms | 17; 47 |

- Linha de base mobile (build local): Performance 81 (linha 23); o doc ressalva que são builds diferentes (linha 31).
- CLS mobile R1: elemento `section#screen-welcome` (linha 51).
- Oportunidades: imagens 280 KiB mobile e 283 KiB desktop (linha 56); JS não usado 47 KiB (57); JS sem minificação 30 KiB (58); CSS sem minificação 7 KiB (59); bloqueio de renderização 180 ms mobile e 80 ms desktop (60).

### 3.2 Lighthouse da build local: docs/LIGHTHOUSE_2026-10-08.md
Página `/` em http://127.0.0.1, não produção (linhas 3 e 17). Mobile (linha 5). Data: 2026-10-08 (título, linha 1); sem hora.
- Performance 81; Acessibilidade 100; Boas práticas 96; SEO 100 (linhas 9-12).
- FCP 1,2 s; LCP 1,2 s; TBT 460 ms; CLS 0,113; Speed Index 5,1 s (linha 15). CLS acima de 0,1 (linha 18).
- Oportunidades: cache 503 KiB; imagens 280 KiB; JS não usado 108 KiB; JS sem minificação 25 KiB; CSS sem minificação 4 KiB (linha 19). Desktop não medido (linha 46).

### 3.3 Acessibilidade automática: docs/qa/A11Y_EVIDENCIA_2026-10.md
Data: 2026-10-08 (linha 1); e2e 18:47 a 18:49 (-03) (linha 11). Viewport 375x812; axe-core 4.13.0; Chromium do Playwright 1.63.0 (linha 8).

| Página | critical | serious | moderate | minor | Erros | Linha |
|---|---|---|---|---|---|---|
| Login `/` | 0 | 0 | 0 | 0 | 0 | 19 |
| Termos `/termos.html` | 0 | 0 | 3 | 0 | 0 | 20 |
| Privacidade `/privacidade.html` | 0 | 0 | 2 | 0 | 0 | 21 |

- Telas logadas: 223 verificações ok e 2 avisos (linhas 10 e 37); axe serious e critical 32 de 32 ok (linha 37); oito telas em claro e escuro, 375x812 e 1280x800, todas ok (linhas 39-48).
- Aviso não bloqueante: "pref-email-notif" em Perfil, 13x44 px, abaixo de 44x44 (linha 50). Árvore de acessibilidade das telas logadas não coletada (linha 51).

### 3.4 Roteiros sem medição
- docs/QA_LEITORES_DE_TELA.md: JAWS, demonstração de 40 minutos (linha 8); "Aviso N de 3" (linha 105).
- docs/qa/LEITORES_LIGA.md: alvos de 44 px (linha 3); largura de 375 px (linha 7). Estado da flag selection_open: a definir pela diretoria (linha 6).

### 3.5 Limiares e geometria
- frontend/scripts/e2e/geometry-baseline.json:2: tolerancia_px = 2.
- Caixas copiadas (x, y, largura, altura): claro 1280x800 nav [0,744,1280,56] (:20); claro 375x812 nav [0,756,375,56] (:37); claro 1280x800 kpi-1 [60,236,278,48] (:14); claro 375x812 kpi-1 [14,218,166,32] (:31); claro 375x812 grafico-principal [14,492,347,220] (:30); claro 375x812 lia-launcher [311,676,48,48] (:35).
- Data do arquivo: NAO ENCONTRADO. Rota: NAO CONFIRMADO (inferencia: Início, pelas chaves kpi-1..4 e grafico-principal).
- frontend/scripts/e2e/axe-gate.js: tags wcag2a, wcag2aa, wcag21a, wcag21aa (:23); reprovam serious e critical (:24); enforce padrão true (:65).

## 4. Movimento

### 4.1 Tokens (frontend/modulos/shared/laift-tokens.css)

| Token | Valor | Linha |
|---|---|---|
| --dur-instant / -fast / -base / -slow / -lazy | 100ms / 180ms / 280ms / 480ms / 800ms | 91-95 |
| --ease-out | cubic-bezier(0.22, 1, 0.36, 1) | 96 |
| --ease-in-out | cubic-bezier(0.65, 0, 0.35, 1) | 97 |
| --ease-spring | cubic-bezier(0.34, 1.56, 0.64, 1) | 98 |
| --ease-anticipate | cubic-bezier(0.68, -0.55, 0.27, 1.55) | 99 |
| --press-scale | NAO ENCONTRADO em laift-tokens.css. Definido em frontend/styles.css:40 (0.98); usado em styles.css:180, ux.css:60, ux.css:500 | - |

- Contrato citado: docs/adr/0002-motion-tokens.md (existe; laift-tokens.css:89-90).

### 4.2 prefers-reduced-motion

| Arquivo | Ocorrência | Efeito |
|---|---|---|
| frontend/modulos/shared/laift-tokens.css | :323 `reduce` | zera duração e iterações (:324-331); gráficos e Lia sem animação (:334-336) |
| frontend/ux.css | :9 (comentário); :565 `no-preference` | animação só sem restrição (conteúdo não lido) |
| frontend/ux-glass.css | :103 `no-preference` | keyframe ux-glass-expand só sem restrição |

- NAO ENCONTRADO em frontend/styles.css e frontend/splash.css.
- (inferencia) Os keyframes do splash (splash.css:47, :55, :59) são afetados pela regra global de laift-tokens.css:323-327, com !important, carregada antes (index.html:63; splash.css em :72).

### 4.3 Splash (frontend/splash.js)

| Item | Valor | Linha |
|---|---|---|
| MIN_VISIBLE_MS | 900 | 17 |
| SAFETY_MS | 4000 (definição); uso em 121 | 18; 121 |
| LEAVE_MS | 280 (= --dur-base); uso em 113 | 19; 113 |
| sessionStorage | `win.sessionStorage` em 97; chave 'laift-splash-shown' em 15; gate 23-29; marca 31-33 e 99 | 15-99 |
| Movimento reduzido | matchMedia em 101; tempo mínimo zerado em 37; saída em 0 ms em 113 | 37; 101; 113 |
| Flag | NAO ENCONTRADO em splash.js; index.html:984 carrega sem condição | 984 |
| Texto exibido | 'LAIFT' (83); logo com alt vazio (78); container aria-hidden (72); ícones SVG aria-hidden (59) | 59-83 |
| Carregamento | CSS em frontend/index.html:72; JS com defer em index.html:984 | 72; 984 |
| Saída | evento 'laift:ready' (16); onReady (115-117); __laiftReady (120) | 16; 115-120 |
| Disparo | signalReady em frontend/app.js:498-501; chamado em app.js:480 e :905 | app.js:480; :498-501; :905 |
| Posição | .splash fixed (frontend/splash.css:12), z-index 90 (:14), pointer-events none (:17) | splash.css:12-17 |

- Testes: unitários em frontend/scripts/ux-v2.test.mjs:133-172 e :277-293. E2E: NAO ENCONTRADO (grep recursivo em frontend/scripts retorna só build.js e ux-v2.test.mjs). O plano diz que existe: confirmado só como unitário.

### 4.4 Qual `<main>` aparece durante o splash

| Estado | #public-shell (index.html:83) | #app-root (index.html:232) e .app-main (index.html:347) | Base |
|---|---|---|---|
| Markup, antes do JS | visível (sem class hidden) | app-root oculto | index.html:83, :232 |
| Deslogado | visível | oculto | app.js:2667 (inferencia para o caminho sem cache) |
| Logado, sessão em cache | visível até apiGetMyProfile responder; ocultado em app.js:902 | app-root exibido em app.js:903; .app-main dentro dele (inferencia: app-root fecha em index.html:867) | app.js:2653-2662; :901-905 |
| Login por senha | visível; ocultado no enterApp | exibido no enterApp | app.js:776; :901-905 |

- Inert: splash.js não define `inert`. O único `inert` do fluxo vai para #app-root, ao abrir modal (app.js:614, :620, bloco 602-621). (inferencia) Nenhum `<main>` recebe inert pelo splash.

## 5. Para o wireframe

### 5.1 Contagem
- frontend/modulos/shared/laift-tokens.css: 206 linhas `--nome:` e 119 nomes únicos (redefinições nos blocos escuros, :188-231 e :233-277).
- Nomes únicos por prefixo: --laift-* 43; --dk-* 38 (:33-70); --chart-* 8 (:106-113); --credential-* 6 (:116-121); --layer-* 4 (:78-81); --dur-* 5 (:91-95); --ease-* 4 (:96-99); --move-* 4 (:100-103); --elev-* 3 (:84-86); --module-* 3 (:180-182); --hairline 1 (:87).
- Vidro: frontend/ux-glass.css:21-24 (--glass-fill-0..2, --glass-hero-glow); frontend/ux.css:12 (--glass-blur 14px). --press-scale: frontend/styles.css:40.

### 5.2 Tokens principais (claro | escuro)

| Token | Claro | Escuro | Arquivo:linha |
|---|---|---|---|
| --layer-0 | #fafaf7 | #0e1114 | laift-tokens.css:78; escuro :33, :191 |
| --layer-1 | #f4f3ef | #14181c | :79; :34, :192 |
| --layer-2 | #edebe5 | #1a1f24 | :80; :35, :193 |
| --layer-3 | #e4e1d8 | #22282e | :81; :36, :194 |
| --laift-bg / --laift-surface | = --layer-0 / = --layer-1 | idem | :124-125 |
| --laift-text | #1c2333 | #e7ebf3 | :130; :208, :39 |
| --laift-muted | #5b6478 | #9aa5bb | :131; :209, :40 |
| --laift-border / -strong | #dde3ee / #b8c2d6 | #2b3345 / #3d4860 | :128-129; :206-207, :37-38 |
| --laift-primary | #0f6f62 | #3fcfb6 | :134; :210, :41 |
| --laift-danger / -success / -warning | #b3261e / #1e6b3c / #8a5a00 | #ff7a70 / #7be3a0 / #ffc857 | :138, :141, :143; :214, :217, :219 |
| --laift-focus-ring | 0 0 0 3px var(--laift-focus-color) | idem | :176-177 |
| --laift-shadow / -sm | 0 14px 34px rgba(20,30,50,0.08) / 0 2px 8px rgba(20,30,50,0.08) | = --dk-shadow (0 14px 34px rgba(0,0,0,0.4)) / = --dk-shadow-sm (0 2px 8px rgba(0,0,0,0.35)) | :153-154; :227-228, :58-59 |
| --elev-1 / -2 / -3 | inset 0 1px 0 rgba(255,255,255,0.7) + sombra de 1px 2px / 6px 18px / 18px 44px | = --dk-elev-1..3 | :84-86; :195-197 |
| --laift-radius-sm / -md / -lg / -xl / -pill | 8 / 14 / 20 / 28 / 999 px | sem redefinição | :155-159 |
| --glass-fill-0..2 | color-mix(--layer-N 97%, transparente) | idem sobre --layer-N escuro | ux-glass.css:21-23 |
| --glass-hero-glow | color-mix(--laift-primary 8%, transparente) | idem | ux-glass.css:24 |
| --glass-blur | 14px | 14px | ux.css:12 |
| --move-xs / -sm / -md / -lg | 4 / 8 / 16 / 32 px | sem redefinição | :100-103 |
| --dur-* / --ease-* | ver 4.1 | sem redefinição | :91-99 |

- Vidro e sombras de vidro só valem sob `:root[data-flag-ux-v2-enabled]` (ux-glass.css:14) e `@supports` (:51).

### 5.3 Classes e funções reutilizáveis

| Item | Arquivo:linha | Observação |
|---|---|---|
| .skeleton / .skeleton-line / -short / -card | frontend/ux.css:123; :124-130; :131; :132 | aria-hidden; altura 14px (:130); 60%; 88px |
| @keyframes ux-pulse | frontend/ux.css:133 | animação do skeleton |
| LaiftStates.createSkeleton(doc, rows) | frontend/shared-states.js:72-83 | padrão 3 (:27); máximo 8 (:26); aria-hidden (:78) |
| LaiftStates.createStateNode(doc, kind, opts) | frontend/shared-states.js:48-70 | kinds loading / empty / error (:15-17); textos padrão (:21-23); export em :136 (window.LaiftStates) |
| Estado vazio e erro (CSS) | frontend/ux.css:92 (.state); :106-107 (.state-error); :109 (loading); :219; :575-576 (sob flag) | |
| Vidro | frontend/ux-glass.css:14, :21-24, :51, :56-57, :83-84, :88, :93, :99, :103 | escopo com flag, @supports, fallback, hover, pointer coarse, keyframes, no-preference |
| Anel de foco | frontend/modulos/shared/laift-tokens.css:315-318; :176-177 | :focus-visible, outline 3px sólido, offset 2px |
| Keyframes do splash | frontend/splash.css:64 (splash-pop); :68 (splash-rise) | |

### 5.4 Testes por nome (nenhum executado)
- frontend/scripts/glass-contrast.test.mjs (citado em ux-glass.css:20 e laift-tokens.css:175); lia-contrast.test.mjs; learning-skeleton.test.mjs; shared-states.test.mjs; frontend/scripts/e2e/visual-qa.e2e.js.

## 6. Divergências e pontos de atenção

1. --press-scale: o pedido o situava em laift-tokens.css; está em frontend/styles.css:40.
2. "101 arquivos no precache" (docs/qa/A11Y_EVIDENCIA_2026-10.md:7) diverge das 49 entradas do sw.js. (inferencia) Combina com a linha impressa por frontend/scripts/build.js:143 para o precache do Atlas. NAO CONFIRMADO.
3. CLS: 0,113 na build local (docs/LIGHTHOUSE_2026-10-08.md:15, :18) × mediana 0,000 em produção (docs/LIGHTHOUSE_2026-10-08b.md:16). Ambientes diferentes (08b.md:31). A R1 mobile registra 0,041 (08b.md:16, :51); o doc diz que três rodadas não provam ausência de deslocamento (08b.md:74).
4. (inferencia) background_color #f4f6fb (manifest.webmanifest:13) difere de --layer-0 #fafaf7 (laift-tokens.css:78). Não é erro comprovado.
5. Splash: teste unitário, sem e2e; sem flag para desligar (splash.js; index.html:984). Movimento do splash depende da regra global (laift-tokens.css:323), pois splash.css não tem regra própria.
6. O31b (docs/riscos-residuais.md:76): quatro páginas de módulo carregam bibliotecas por CDN, status "A mitigar". (inferencia) Não funcionam offline.
7. Lighthouse desktop da build local não medido (docs/LIGHTHOUSE_2026-10-08.md:46).
8. docs/qa/A11Y_EVIDENCIA_2026-10.md:31: login mostra "Sistema temporariamente indisponível" em servidor estático sem API; o doc pede confirmação em produção.

## 7. NAO CONFIRMADO / NAO ENCONTRADO

- NAO CONFIRMADO (nao executado): frontend/scripts/pwa.test.mjs, 11 testes nas linhas 27, 36, 43, 54, 61, 74, 81, 87, 97, 111, 119.
- NAO CONFIRMADO (nao executado): frontend/scripts/ux-v2.test.mjs, testes de splash nas linhas 134, 141, 148, 154, 172.
- NAO CONFIRMADO (nao executado): glass-contrast.test.mjs, lia-contrast.test.mjs, learning-skeleton.test.mjs, shared-states.test.mjs, e2e/visual-qa.e2e.js, e2e/atlas-offline.e2e.js.
- NAO CONFIRMADO: "101 arquivos no precache" (A11Y:7) versus 49 entradas do sw.js.
- NAO CONFIRMADO: transparência de laift-marca.png e apple-touch-icon.png (PNG não decodificado).
- NAO CONFIRMADO (inferencia): comportamento offline real das CDN nas páginas de módulo.
- NAO CONFIRMADO (sem execução): splash sobre .app-main logado, em navegador real (splash.css:12; app.js:903).
- NAO CONFIRMADO (inferencia): nenhum modal aberto durante o splash, logo sem inert no `<main>` (app.js:614-620).
- NAO CONFIRMADO (produção não acessada): manifest, sw, splash e CSP em produção.
- NAO CONFIRMADO (inferencia): rota da geometry-baseline.json (geometry-baseline.json:14).
- NAO ENCONTRADO: data do geometry-baseline.json; árvore de acessibilidade das telas logadas (A11Y:51); Lighthouse de rotas públicas além do login (08b:76); Lighthouse desktop da build local (08.md:46).
- NAO ENCONTRADO: axe em cadastro, recuperação e redefinição de senha (A11Y:55); atalhos (A11Y:57); confirmações #modal-confirm (A11Y:58).
- NAO ENCONTRADO: flag que desliga o splash; e2e do splash (grep recursivo em frontend/scripts); redefinição de --laift-radius-* no tema escuro (laift-tokens.css:188-277).
- a definir pela diretoria: estado da flag selection_open (docs/qa/LEITORES_LIGA.md:6).
