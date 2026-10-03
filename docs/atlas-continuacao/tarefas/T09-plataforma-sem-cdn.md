# T09 — Plataforma: Chart.js sem CDN
**Quem faz:** outro chat · **Depende de:** T00 · **Estimativa:** 3 h

## Objetivo
O atlas já não usa o jsDelivr, mas a página principal da plataforma (`frontend/index.html`) ainda carrega Chart.js de lá para os próprios painéis. Servir do próprio site e apertar a CSP.

## Arquivos
- `frontend/index.html` — tag de script do Chart.js e a CSP (`script-src`, `connect-src`).
- `frontend/vendor/` — destino da biblioteca (ver o que já existe nesta pasta; o build copia `vendor/` inteiro).
- `frontend/modulos/anatomia-3d/vendor/chartjs/` — cópia pronta do Chart.js 4.5.1 (sem `sourceMappingURL`), com `LICENSE.md` e `VERSION`; **reaproveite os bytes** (copie para `frontend/vendor/chartjs/`).
- `frontend/scripts/e2e/csp.e2e.js` — regras de CSP por página e rota do espelho do CDN (outros módulos, como o Estúdio e o Laboratório, ainda usam o jsDelivr: não mexa neles).
- `frontend/scripts/e2e/qa-full.e2e.js` e `frontend/scripts/e2e/apis.e2e.js` — conferir que os painéis com gráfico seguem funcionando.

## Como fazer
1. `grep -n "jsdelivr\|chart.js" frontend/index.html frontend/app.js` para achar onde o Chart.js é pedido e com qual SRI.
2. Copie `frontend/modulos/anatomia-3d/vendor/chartjs/*` para `frontend/vendor/chartjs/`. Calcule o SRI: `openssl dgst -sha384 -binary frontend/vendor/chartjs/chart.umd.min.js | openssl base64 -A` e use `sha384-<valor>`.
3. Troque a URL do script para `vendor/chartjs/chart.umd.min.js` (relativa) com o novo `integrity`.
4. Na CSP de `frontend/index.html`: tire `https://cdn.jsdelivr.net` de `script-src` e de `connect-src` **somente se** nada mais da página o usar (confira com `grep`). Se outro uso existir, deixe e anote no commit.
5. Rode o e2e de CSP e os painéis.

## Não fazer
- Não troque a versão do Chart.js. Não remova o jsDelivr das páginas dos módulos Estúdio/Laboratório/Fiscal.

## Aceite
- [ ] Nenhuma requisição ao jsDelivr feita pela página principal (conferir em um e2e curto com `app.calls.external`).
- [ ] `bash docs/atlas-continuacao/validar.sh --e2e csp qa-full apis` passa.

## Prompt pronto
Siga `docs/atlas-continuacao/tarefas/T09-plataforma-sem-cdn.md`. Copie o Chart.js de `frontend/modulos/anatomia-3d/vendor/chartjs/` para `frontend/vendor/chartjs/`, ajuste `frontend/index.html` (script com novo SRI e CSP) e os e2e citados. Rode `bash docs/atlas-continuacao/validar.sh --e2e csp qa-full apis` e mostre o resumo.
