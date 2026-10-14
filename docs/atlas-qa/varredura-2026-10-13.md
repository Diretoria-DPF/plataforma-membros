# Atlas 3D — varredura de funcionalidades (13/10/2026)

Rodada de verificação feita depois da correção do espelhamento, da camada Fáscias e da vista "Separar peças" (PR #68). Objetivo do dono: **visualizar bem cada parte e garantir que todas as funcionalidades funcionem; ao clicar em qualquer parte, sinalizar o clique (destaque visível) e abrir a interação, nos dois lados do corpo.**

## 1. Ambiente e método

- Windows 11, Node 24, Playwright com o Chromium 1243 (headless shell) e **WebGL por software (SwiftShader, ~1 s por quadro)**. A pasta `frontend/` não tem `node_modules`: para rodar usei dependências temporárias **fora do repositório** (`axe-core`, `ajv`, `jsqr`, `@gltf-transform/core`, uma junção `frontend/node_modules`, removida no fim) e um adaptador local do caminho do Chromium. Nada disso foi commitado.
- Sem o `import()` de caminho absoluto `C:\...` aceito pelo Node no Windows, as suítes `scripts/atlas/*.test.mjs` não rodam; usei um *loader* local (fora do repositório) que converte o caminho. É a portabilidade já citada na auditoria; não foi alterada.
- Suítes e2e: `node scripts/e2e/run.js atlas smoke csp` (27 suítes `atlas-*`, `smoke`, `csp`) sobre o `dist/` gerado por `scripts/build.js`. Verificação manual com scripts Playwright próprios: clique real do mouse em pontos de **cada metade da tela**, nas vistas anterior e posterior, conferindo estrutura selecionada, ficha aberta e cor de destaque na instância.
- Como separar ambiente de bug: cada falha foi repetida num **worktree de referência** (commit `3d987d1`, a base da PR) com o mesmo procedimento.

## 2. Resultado das suítes

| Grupo | Resultado |
|---|---|
| Unitários do Atlas (`scripts/atlas/*.test.mjs`, 89 testes) | 88 passam; 1 falha = `review-status.json` com fim de linha CRLF no Windows (ambiente, resolvido pelo `.gitattributes` após renormalização) |
| Unitários do front (`frontend/scripts/*.test.mjs`, 1399) | 1396 passam; 3 falham por CRLF (`entrada.js`, 2× `_headers`) — as mesmas 3 conhecidas, só de ambiente |
| e2e verdes | `atlas-a11y` (axe), `atlas-assets`, **`atlas-espelho`**, `atlas-estudo`, **`atlas-explode`**, **`atlas-fascias`**, `atlas-fundacao`, `atlas-hints`, `atlas-labels`, `atlas-layers-mobile`, `atlas-offline`, `atlas-onboarding`, `atlas-perf` (3G rápido e lento; 1,96 MB até pronto, limite 2 MB; 2–4 draw calls), `atlas-pick`, `atlas-quiz`, `atlas-responsive` (13 telas), `atlas-revisao`, `atlas-selos`, `atlas-slow`, `atlas-toolbar`, `atlas-webgl`, `atlas`, `csp`, `smoke` |
| e2e vermelhos só no Windows (ambiente) | `atlas-farmaco`, `atlas-moleculas`, `atlas-feedback`, `atlas-ficha-nav`, `atlas-fisiologia` — ver 3 |

## 3. O que é ambiente (não é bug do código)

| Suíte | Sintoma | Evidência |
|---|---|---|
| `atlas-farmaco`, `atlas-moleculas` | Chart.js / 3Dmol não carregam: "Failed to find a valid digest in the 'integrity' attribute" | A cópia de trabalho de `vendor/chartjs/chart.umd.min.js` estava com **CRLF** (autocrlf; 208 493 bytes contra 208 480 versionados), o que muda o hash SRI. Recriando os arquivos vendorizados em LF (como o `.gitattributes` faz num checkout novo), as duas suítes **passam**. Na referência (checkout novo, LF) já passavam |
| `atlas-feedback` ("pulso ao selecionar anima…"), `atlas-ficha-nav`, `atlas-fisiologia` | contagem de quadros do pulso e `locator.click` com limite de 5 s | **Falham igual na referência** (`3d987d1`, sem nenhuma das minhas mudanças). Com GL por software cada quadro leva ~1 s e o thread principal fica ocupado; no CI (Linux) passam (run 38439462457) |
| `atlas-pick` (celular) em uma das execuções | `femur-r` não selecionou | Intermitente: na referência falharam 3 outros alvos na mesma suíte; na bateria completa final passou inteira |

## 4. Falhas reais encontradas e correções

1. **Destaque do clique só em metade do corpo** (peças espelhadas desenhadas por dentro) — corrigido no commit 1. Antes: 3% e 9% de acerto "clique == peça visível" numa metade da tela; depois: 94–98%.
2. **O clique não atravessava estruturas transparentes (Raio-X, Fantasma).** Com o Raio-X ligado (pele 8%, músculos 12%) o raycast ignorava a opacidade: na referência, **0 pontos de órgão** acertados contra 298 de pele/músculo numa grade sobre o tronco; com a correção, **39 pontos de órgão** (pleura, pulmões, vísceras) e as mesmas regras de fallback quando só há transparentes. Correção segura e pequena em `registry-pick.js` (estruturas com opacidade < 25% passam para o fim da fila; a mais próxima ainda é escolhida se for a única). Teste: `registry-pick.test.mjs`.
3. Achado secundário do diagnóstico, corrigido: o campo `side` do registro nunca era preenchido (regex não casava `.l/.r`).

## 5. Verificação manual em navegador (clique real, desktop 1280×800)

Para cada sistema só a camada dele foi ligada, e foram clicados pontos reais de **cada metade da tela** (vistas anterior e posterior); passa quando a estrutura selecionada é a que o pick prevê naquele pixel, a ficha abre e a cor da instância é o destaque.

| Sistema / recurso | Resultado |
|---|---|
| Músculos + esqueleto (padrão) | 4/4 (anterior e posterior, esquerda e direita): oblíquo externo D/E, glúteo máximo D/E |
| Articular | 4/4 (ligamento sacroilíaco D/E, osso coxal D/E, rádio) |
| Vísceras (digestório, respiratório, urinário, endócrino) | 4/4 (colo transverso, estômago, rim esquerdo, pâncreas) |
| Vasos / cardiovascular + vísceras | 3/4; o 4º selecionou a tênia mesocólica no lugar do colo transverso (estrutura vizinha a 1 px; seleção e ficha corretas) |
| Linfático | baço nas duas vistas; os nódulos são pequenos demais para um alvo de 10 px na escala do corpo inteiro (pick por código acerta) |
| Nervoso | no corpo inteiro os giros são muito pequenos; com o cérebro ampliado **4/4** (giro temporal superior D, giros orbitais D, giro temporal médio E e D), ambos os lados |
| Órgãos HRA (variante `hra`) | 15 estruturas `za:vh-*` registradas; `za:vh-m-heart-left-ventricle` abre a ficha ("Coração"), fica no tórax (centro em y = 1,27 m), recebe o destaque e é acertada pelo raycast quando isolada |
| Fantasma | opacidade 0,12 e visível; alternar de novo devolve 1 |
| Isolar | só a estrutura fica visível, seleção e ficha mantidas, Centralizar devolve as camadas |
| Raio-X | liga/desliga restaurando as opacidades; clique atravessa (item 4.2) |
| Corte sagital | plano aplicado ao renderer (`clippingPlanes`), estruturas do lado que sobra continuam acertáveis |
| Rótulos | 6 rótulos visíveis, todos dentro do canvas |
| Busca | "fêmur" devolve 2 resultados; escolher o 1º seleciona `za:femur-r` e abre a ficha |
| Ficha | abriu em todos os cliques acima (nomes em PT-BR com lado) |
| Quiz | `atlas-quiz` verde (a resposta de todos os casos existe no corpo 3D, conferido em `atlas-pick`) |
| Fáscias / Separar peças | `atlas-fascias` e `atlas-explode` verdes (inclui o lado espelhado e o celular 390×844) |

## 6. O que NÃO foi verificado

- GPU real, Safari/iOS e Android; só SwiftShader no Chromium.
- Toque em aparelho real (os cenários de celular usam o emulador do Playwright).
- NVDA/leitores de tela (só `axe-core`, 0 violações no `atlas-a11y`).
- Aparelho fraco: o orçamento de desempenho foi medido só como dados do `atlas-perf` (bytes, draw calls, triângulos, heap), não como taxa de quadros.
- O workflow `atlas-e2e` no CI com esta PR (roda quando a PR for atualizada).
- HRA masculino × feminino além do coração masculino e do que o `atlas-pick` cobre; `aligned:false` não existe como campo — o alinhamento do HRA é o deslocamento fixo de `alignHraNode` (confirmado: o coração fica na altura do tórax).

## 7. Pendências e riscos

- **Fáscias ligadas escondem o destaque do músculo de baixo** se o usuário aumentar a opacidade da camada para 100%: o padrão (45%) deixa ver o músculo, mas o ajuste manual é livre. O Raio-X deixa as fáscias translúcidas (8%, junto com a pele) e restaura depois.
- O limiar de "transparente" para o clique (25%) é uma escolha de produto; está em `SEE_THROUGH_OPACITY` (`registry-pick.js`).
- Peso de boot: **+11 KB gzip** nos arquivos carregados no boot (a divisão de `registry.js`, `fascia-rules.js` e a entrada da vista explodida); o gate de 2 MB do `atlas-perf` segue verde (1,96 MB).
- Em telas muito pequenas (nervos, nódulos linfáticos), o clique no corpo inteiro acerta alvos de poucos pixels com facilidade menor; a busca e o navegador continuam sendo o caminho para essas estruturas.
- A vista "Separar peças" desloca as **estruturas em lote** (corpo); os detalhes de órgão do HRA (malhas soltas, fora da cena principal) não são deslocados.
