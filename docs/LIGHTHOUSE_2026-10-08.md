# Lighthouse — build local (2026-10-08)

Medição somente leitura da build local `frontend/dist`, feita pelo H3 `laift-qa-a11y` na rodada 2 do fechamento v5. Nada foi alterado no produto.

## Resultado (formato mobile, padrão do Lighthouse)

| Categoria | Nota |
|---|---|
| Performance | 81 |
| Acessibilidade | 100 |
| Boas práticas | 96 |
| SEO | 100 |
| PWA / instalável | não pontuado pelo Lighthouse 13 (ver abaixo) |

Métricas de Performance: FCP 1,2 s; LCP 1,2 s; TBT 460 ms; CLS 0,113; Speed Index 5,1 s.

- **Boas práticas (96):** a única falha é `errors-in-console`. É artefato da medição: a página foi servida em `http://127.0.0.1`, e a Worker recusou a origem por CORS (a Worker libera a origem publicada, não `127.0.0.1`). Não foi testado com a origem de produção.
- **CLS 0,113 (acima de 0,1, faixa "precisa melhorar"):** o único elemento que desloca é `section#screen-welcome.auth-card` (tela de entrada), na posição vertical durante a carga. Achado para o dono da tela de entrada (`frontend/index.html` e o CSS/JS da tela inicial); não corrigido aqui.
- **Oportunidades reportadas pelo Lighthouse (não bloqueantes):** cache (estimativa de economia de 503 KiB), entrega de imagens (280 KiB), JavaScript não usado (108 KiB), JavaScript e CSS sem minificação (25 KiB e 4 KiB). Anotado para quem cuida do build e dos cabeçalhos de cache.

## PWA / instalável

O Lighthouse 13.5.0 não tem mais a categoria `pwa` (`--only-categories=pwa` é rejeitado). A instalabilidade foi conferida por checklist estático, não por nota:

- `manifest.webmanifest`: `name`, `short_name`, `start_url` (`./`), `display: standalone`, `theme_color`, `background_color`; ícones `icons/icon-192.png`, `icons/icon-512.png` e `icons/icon-maskable-512.png`, todos servidos com HTTP 200.
- `index.html` carrega `pwa.js` (defer), que registra `sw.js` com escopo `./`.
- `sw.js` tem um listener de `fetch`.

Em produção a publicação é em HTTPS, requisito de instalação que a medição local não cobre.

## Comando e ambiente

1. Build: `cd frontend && node scripts/build.js`
2. Servidor estático do `dist/` (porta livre, 127.0.0.1): `node -e "require('./scripts/e2e/harness').startStaticServer().then(s => console.log(s.address().port))"`. O processo fica vivo e imprime a porta.
3. Lighthouse:
   ```
   CHROME_PATH="<caminho do chrome>" npx -y lighthouse@13.5.0 http://127.0.0.1:<porta>/ --chrome-flags="--headless --no-sandbox --disable-gpu" --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=./lh.json
   ```
4. Ler `categories` e `audits` do `lh.json`.

Chrome usado: Chrome for Testing 153.0.8010.12, o headless shell do Playwright (`%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe`). O Chromium completo do mesmo cache (`chromium-1243\chrome-win64\chrome.exe`) falha no Windows com "configuração lado a lado incorreta", por isso não foi usado.

## Pendências

- Medir a URL pública de produção (com HTTPS e origem liberada pela Worker) e comparar. Essa é a medição que vale para o público.
- Medir também o preset desktop (`--preset=desktop`); esta rodada ficou só no mobile, que é o caminho principal do produto.
- Quem for dono do build deve decidir se as oportunidades de cache, minificação e JavaScript não usado entram nesta onda.
