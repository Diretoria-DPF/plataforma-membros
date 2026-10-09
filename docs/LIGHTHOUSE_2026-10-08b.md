# Lighthouse: produção https://laift.com.br (2026-10-08)

Medição somente leitura da tela de login (`/`) da URL pública, feita pelo H3 `laift-qa-a11y` na rodada R1-F2. Seis execuções em série: três mobile e três desktop. Nada foi alterado no produto.

## Mobile

| Métrica | R1 | R2 | R3 | Mediana |
|---|---|---|---|---|
| Performance | 94 | 85 | 98 | 94 |
| Acessibilidade | 100 | 100 | 100 | 100 |
| Boas práticas | 100 | 100 | 100 | 100 |
| SEO | 92 | 100 | 100 | 100 |
| FCP | 1153 ms | 1279 ms | 1121 ms | 1153 ms (1,2 s) |
| LCP | 1153 ms | 3926 ms | 1121 ms | 1153 ms (1,2 s) |
| TBT | 246 ms | 96 ms | 124 ms | 124 ms |
| CLS | 0,041 | 0,000 | 0,000 | 0,000 |
| Speed Index | 3181 ms | 3909 ms | 3412 ms | 3412 ms (3,4 s) |

Comparação da mediana mobile com a linha de base (build local, mesma tela):

| Métrica | Linha de base | Mediana produção | Delta |
|---|---|---|---|
| Performance | 81 | 94 | +13 |
| Boas práticas | 96 | 100 | +4 |
| Acessibilidade / SEO | 100 / 100 | 100 / 100 | 0 |
| FCP / LCP | 1,2 s / 1,2 s | 1,2 s / 1,2 s | 0 |
| TBT | 460 ms | 124 ms | -336 ms |
| CLS | 0,113 | 0,000 | -0,113 |
| Speed Index | 5,1 s | 3,4 s | -1,7 s |

Ressalvas: a linha de base é a build local em 127.0.0.1, e a produção é outra build, em HTTPS. O delta mostra a direção, não um ganho medido na mesma build. O +4 de boas práticas vem do erro de CORS da linha de base, que não existe na produção.

## Desktop

Não há linha de base desktop, então não há delta.

| Métrica | R1 | R2 | R3 | Mediana |
|---|---|---|---|---|
| Performance | 100 | 91 | 100 | 100 |
| Acessibilidade | 100 | 100 | 100 | 100 |
| Boas práticas | 100 | 100 | 100 | 100 |
| SEO | 100 | 100 | 100 | 100 |
| FCP | 372 ms | 361 ms | 369 ms | 369 ms |
| LCP | 372 ms | 361 ms | 369 ms | 369 ms |
| TBT | 14 ms | 1 ms | 8 ms | 8 ms |
| CLS | 0,000 | 0,000 | 0,000 | 0,000 |
| Speed Index | 874 ms | 3963 ms | 913 ms | 913 ms |

## CLS do login

- Mobile: 0,041 na R1; 0,000 na R2 e na R3. O único elemento listado como deslocado na R1 foi `section#screen-welcome` (`body > div#app-shell > main#public-shell > section#screen-welcome`). É o mesmo elemento da linha de base, que era `section#screen-welcome.auth-card`.
- Desktop: 0,000 nas três rodadas, sem elemento listado.

## Oportunidades (Lighthouse)

- Entrega de imagens: 280 KiB no mobile e 283 KiB no desktop. Igual à linha de base.
- JavaScript não usado: 47 KiB (linha de base: 108 KiB).
- JavaScript sem minificação: 30 KiB (linha de base: 25 KiB).
- CSS sem minificação: 7 KiB (linha de base: 4 KiB).
- Bloqueio de renderização: 180 ms no mobile e 80 ms no desktop.
- Cache: passou nas seis rodadas (`cache-insight` com nota 1). A linha de base apontava 503 KiB.

## Comando e ambiente

- Lighthouse 13.5.0 (`npx -y lighthouse@13.5.0`), categorias performance, accessibility, best-practices e seo. Desktop com `--preset=desktop`.
- Chrome: Chrome for Testing 153.0.8010.12, headless shell do Playwright (`chromium_headless_shell-1243`), via `CHROME_PATH`.
- Data e hora: 2026-10-08, entre 21:24:07 e 21:29:18 UTC (`fetchTime` de cada rodada).
- Nenhuma rodada falhou, e nenhuma precisou ser repetida.
- JSON brutos fora do repositório, em `%LOCALAPPDATA%\Temp\laift-lh-r1`.

## Pendências

- Regra O43: CLS mediano mobile = 0,000 (≤ 0,1). Resultado: **pode fechar**.
- Ressalva para a decisão: na R1 mobile, o mesmo elemento deslocou 0,041. O QA já registrou 0,11 em cerca de 2 de 14 cargas frias. Três rodadas não provam ausência de deslocamento. Quem decide é a sessão principal.
- Fechadas as pendências das linhas 45 e 46 do doc de 2026-10-08: a URL pública foi medida, e o desktop também.
- Só a tela de login foi medida. Outras rotas públicas e a área logada não foram.
- `docs/riscos-residuais.md` não foi editado. Quem decide e edita é a sessão principal.
- Continuam abertas as oportunidades de JavaScript não usado, minificação e imagens (280 KiB). Quem for dono do build decide se entram na onda.
