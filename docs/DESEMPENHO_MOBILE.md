# Desempenho no celular: carga sob demanda, service worker e orçamento (MOB-04, MOB-07, MOB-09)

Data: 2026-11-01. Branch `perf/mob-04-07-09`. Fonte dos achados: `docs/AUDITORIA_GERAL_2026-10-14.md`.

## O que mudou

| Item | Antes | Depois |
|---|---|---|
| MOB-04 | Todo o JS do painel admin (~216 KB, 64 KB gzip) e o da Guia (~200 KB, 65 KB gzip) vinha no `index.html` para todo mundo | `frontend/lazy-bundles.js` injeta esses scripts sob demanda, em ordem (`async=false`), sem script inline (CSP intacta) |
| MOB-07 | `sw.js` pré-cacheava 94 itens (1.586 KB) | Pré-cacheia 66 itens (879 KB): só o que o `index.html` carrega de imediato. Admin, Guia e o PNG grande do crachá entram no cache ao serem usados (o `fetch` do SW, rede primeiro, já grava toda resposta 200 do próprio site). Atlas 3D/WASM continuam fora (têm SW e cache próprios). `CACHE_NAME` e `data-app-version` em v25 |
| MOB-09 (parte feita) | Orçamento só no Atlas | `frontend/scripts/perf-budget.test.mjs` (roda no `node --test` do CI) e `Cache-Control: public, max-age=31536000, immutable` nas pastas de vendor com versão no caminho (`smiles-drawer-2.1.7`, `smiles-drawer-2.3.0`) |

## Quando cada pacote carrega

- **admin**: ao abrir qualquer painel administrativo (`withBundle('admin', ...)` em `PANEL_LOADERS` de `app.js`). Quem não é admin nem cargo com acesso nunca baixa. Os `reset()` no logout já conferiam `if (window.X)`, então continuam seguros com o pacote ausente.
- **lia**: logo depois do login (antes do onboarding, que cita a Guia) e, para visitante ou sessão restaurada, quando o navegador fica ocioso após o evento `load` (`requestIdleCallback`, teto de 3 s). Ou seja, o visitante ainda baixa a Guia (ela atende visitantes quando a flag está ligada), mas fora do caminho crítico. O atalho de teclado que abre a Guia espera o pacote chegar.
- Ficaram no shell de propósito: `assistant-sources.js` (o `agents-tutor.js` o lê ao carregar), `safe-dom.js`, `library-cite.js`, `privacy.js`, `roles-ui.js`, `orgchart-edit.js` e os CSS (evita piscada sem estilo).

## Números (arquivos-fonte; `app.js` sai ofuscado e maior no build)

| Medida | Antes | Depois |
|---|---|---|
| HTML + scripts + estilos do carregamento inicial (gzip) | 401 KB | 273 KB (-32%) |
| JavaScript do carregamento inicial (bruto) | 1.059 KB | 649 KB (-39%) |
| JavaScript do carregamento inicial (gzip) | 332 KB | 204 KB (-38%) |
| Pré-cache do service worker (bruto) | 1.586 KB | 879 KB (-45%) |
| Recursos no carregamento inicial | 88 | 62 |

Ganho real em tempo (LCP/TBT) não foi medido aqui; precisa de Lighthouse logado (parte aberta do MOB-09).

## Orçamento (teto = medição + ~8%)

- Shell: 295 KB gzip. JS inicial: 706 KB (700 KB até a PR de robustez da casca). Pré-cache: 950 KB. Estourou? Primeiro tente carregar sob demanda; só suba o teto justificando na PR.
- O teste também falha se admin, Guia, Atlas ou `.wasm` voltarem para o `index.html`, e se `immutable` aparecer num caminho sem versão ou em HTML/`sw.js`.

## Por que NÃO foram feitos nomes de arquivo com hash no shell

Decisão de parar (o pedido previa isto se fosse arriscado):

1. O shell tem ~90 arquivos citados por nome em `index.html`, no `PRECACHE` do `sw.js`, nas listas do `build.js`, em `lazy-bundles.js` e em mais de 30 testes que leem os arquivos-fonte. Trocar por nomes com hash exige um passo de build que reescreva todas essas referências de forma consistente (inclusive `data-app-version`/`CACHE_NAME`, que o CI obriga a bater).
2. Os módulos em iframe (`modulos/*`) e o Atlas (SW próprio) referenciam arquivos compartilhados por caminho relativo; hash neles pede um mapa de nomes compartilhado entre páginas e SWs.
3. Um erro nesse mapa deixa o site sem JS em produção, e o `dist/` não é testado por e2e em todos os caminhos de módulo.
4. Sem hash, `immutable` seria perigoso: usuário ficaria com JS velho por um ano.

Próximo passo sugerido (PR própria): gerar `dist/` com nomes `nome.<hash>.js`, um `asset-manifest.json` lido pelo build para reescrever `index.html`, `sw.js` e `lazy-bundles.js`, e um teste que abre o `dist/` e confere que toda referência resolve. Só então aplicar `immutable` em `/assets/*`.

## Pendente

- Lighthouse logado (celular emulado) antes e depois, para registrar LCP/TBT: não rodado nesta PR.
- Offline: o crachá só renderiza o logo grande offline depois de aberto uma vez com rede (antes vinha pré-cacheado). O `laift-marca-80.png` da interface continua no precache.
