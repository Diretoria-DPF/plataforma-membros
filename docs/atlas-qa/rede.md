# Rede e peso da abertura do Atlas 3D

## Presets usados nos testes (`frontend/scripts/e2e/atlas-perf.e2e.js`)
Iguais aos do Chrome DevTools:

| Preset | Descida | Subida | Latência | Meta |
|---|---|---|---|---|
| Fast 3G | 1,6 Mbit/s × 0,9 = 1,44 Mbit/s | 750 kbit/s × 0,9 | 562,5 ms | esqueleto tocável < 15 s |
| Slow 3G | 500 kbit/s × 0,8 = 400 kbit/s | 400 kbit/s | 2000 ms | só relatório |

O throttle do CDP não muda `navigator.connection.effectiveType`; o teste simula `3g` para exercitar o caminho "músculos só sob demanda".

## Medições (02/10/2026, servidor local, build de `frontend/dist`)
| Situação | Fast 3G | Slow 3G |
|---|---|---|
| PR #8 (sem preload) | 18,5 s ❌ | 63,2 s |
| Onda 2 (preload do GLB/manifest/JSON + modulepreload) | **11,0 s** ✅ | 38,2 s |

O gargalo era sequencial: o GLB do esqueleto (987 KB, o maior item) só começava a baixar aos ~11,8 s, depois de toda a cadeia de módulos JS, three.js e JSONs. Com `<link rel="preload">` ele começa junto com o HTML.

## Peso da abertura
- Meta: **< 2 MB** transferidos até o esqueleto estar pronto (decisão do usuário, 02/10).
- O servidor local de teste já comprime JS/JSON com gzip; o GLB vai sem compressão. Medido: ≈ 1,77 MB, dos quais 0,99 MB é o GLB. Se o servidor também comprimisse o GLB com gzip, ele cairia para ≈ 0,56 MB.

## Produção (GitHub Pages)
Esta sessão do Claude não alcança `*.github.io`. A conferência é feita pelo workflow **Atlas — conferência de produção** (`.github/workflows/atlas-prod-check.yml`, botão *Run workflow* em Actions), que:
1. roda `curl -sI -H "Accept-Encoding: gzip, br"` nos arquivos da abertura e mostra o `content-encoding` e o tamanho de cada um;
2. roda `scripts/e2e/atlas-prod-check.js` contra a URL publicada (tempo até o esqueleto, bytes transferidos por arquivo).

Resultado: colar aqui a tabela do resumo do workflow depois de cada onda.

Conferência manual (alternativa): DevTools → Network → "Disable cache" → recarregar o atlas → ver a coluna *Transferred* de `esqueletico.lod1.glb` e o cabeçalho `content-encoding`.
