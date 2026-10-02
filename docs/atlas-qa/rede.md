# Rede e peso da abertura do Atlas 3D

## Presets usados nos testes (`frontend/scripts/e2e/atlas-perf.e2e.js`)
Iguais aos do Chrome DevTools:

| Preset | Descida | Subida | Latência | Meta |
|---|---|---|---|---|
| Fast 3G | 1,6 Mbit/s × 0,9 = 1,44 Mbit/s | 750 kbit/s × 0,9 | 562,5 ms | esqueleto tocável < 15 s no teste local (HTTP/1.1); **< 10 s em produção** (Onda 3, `atlas-prod-check`) |
| Slow 3G | 500 kbit/s × 0,8 = 400 kbit/s | 400 kbit/s | 2000 ms | só relatório |

O throttle do CDP não muda `navigator.connection.effectiveType`; o teste simula `3g` para exercitar o caminho "músculos só sob demanda".

## Medições (02/10/2026, servidor local, build de `frontend/dist`)
| Situação | Fast 3G | Slow 3G |
|---|---|---|
| PR #8 (sem preload) | 18,5 s ❌ | 63,2 s |
| Onda 2 (preload do GLB/manifest/JSON + modulepreload) | **11,0 s** ✅ | 38,2 s |
| PR 3.1 (nomes PT no boot, +12 KB; GLB em `.glb.gz`) — servidor local HTTP/1.1 | 11,7–11,8 s | — |
| PR 3.1 — mesmo build servido por **HTTP/2** (como o GitHub Pages) | **9,2–9,4 s** ✅ | — |

**Por que local ≠ produção:** o servidor de teste é HTTP/1.1, com 6 conexões por host; o `.glb.gz` e o three.js prendem conexões por segundos enquanto os ~45 módulos JS esperam na fila. Com HTTP/2 (GitHub Pages) tudo vai em paralelo.

O gargalo era sequencial: o GLB do esqueleto (987 KB, o maior item) só começava a baixar aos ~11,8 s, depois de toda a cadeia de módulos JS, three.js e JSONs. Com `<link rel="preload">` ele começa junto com o HTML.

## Peso da abertura
- Meta: **< 2 MB** transferidos até o esqueleto estar pronto (decisão do usuário, 02/10).
- O servidor local de teste já comprime JS/JSON com gzip. O GitHub Pages não comprime `.glb`, então **desde o PR 3.1 o build publica `.glb.gz`** (`scripts/build.js`) e o atlas descomprime no navegador (`DecompressionStream`, em `js/engine/assets.js`); sem suporte, baixa o `.glb`. Medido: 1,81 MB → **1,28 MB** transferidos (o esqueleto: 987 KB → 557 KB).

## Produção (GitHub Pages)
Esta sessão do Claude não alcança `*.github.io`. A conferência é feita pelo workflow **Atlas — conferência de produção** (`.github/workflows/atlas-prod-check.yml`, botão *Run workflow* em Actions), que:
1. roda `curl -sI -H "Accept-Encoding: gzip, br"` nos arquivos da abertura e mostra o `content-encoding` e o tamanho de cada um;
2. roda `scripts/e2e/atlas-prod-check.js` contra a URL publicada (tempo até o esqueleto, bytes transferidos por arquivo).

Resultado: colar aqui a tabela do resumo do workflow depois de cada onda.

Conferência manual (alternativa): DevTools → Network → "Disable cache" → recarregar o atlas → ver a coluna *Transferred* de `esqueletico.lod1.glb` e o cabeçalho `content-encoding`.
