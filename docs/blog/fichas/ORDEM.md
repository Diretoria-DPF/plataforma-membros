# Ordem de execução — Publicações do blog + Outubro Rosa 2026 (v1, 2026-10-09)

Disparo (sessão principal, um Haiku 5.5 por ficha): **"Leia docs/blog/fichas/<id>.md e execute."**
Todas as fichas começam por `docs/blog/fichas/_REGRAS.md`. Contrato: `docs/blog/CAMPANHAS.md`.
Comandos de aceite: a partir de `frontend/`, no Bash (Git Bash). Cada arquivo tem **um** dono; ninguém edita arquivo de outro.

## Segmentos (linhas de equipe)

| Segmento | Fichas | Haiku |
|---|---|---|
| Infra | I1, I2, I3 | 3 |
| Motor | M1, M2, M3 | 3 |
| Pesquisa (web) | P1–P6 | 6 |
| Feed | F1 | 1 |
| Conteúdo | C1–C4, C5 | 5 |
| Instagram | G1, G2 | 2 |
| QA | Q1 | 1 |
| **Total** | 21 fichas | **21 Haiku** (pico de 10 simultâneos) |

## Ondas

| Onda | id | Segmento | Haiku | Dono de (arquivos) | Depende de | Aceite (de `frontend/`) |
|---|---|---|---|---|---|---|
| 1 | I1 | Infra | 1 | `blog/404.html`, `blog.css`, `blog/icones.svg` | — | ver ficha (grep + `node --test scripts/build-blog.test.mjs`) |
| 1 | I2 | Infra | 1 | `_headers`, `llms.txt`, `scripts/blog-infra.test.mjs` | — | `node --test scripts/blog-infra.test.mjs scripts/seo.test.mjs scripts/staging.test.mjs` |
| 1 | I3 | Infra | 1 | `index.html`, `styles.css` | — | `node --test scripts/*.test.mjs` + `node scripts/build.js && node scripts/e2e/run.js liga` |
| 1 | M1 | Motor | 1 | `scripts/blog-blocos-campanha.js`, `scripts/blog-blocos-campanha.test.mjs`, `blog/conteudo/_EXEMPLO-campanha.json` | CAMPANHAS.md | `node --test scripts/blog-blocos-campanha.test.mjs` |
| 1 | P1 | Pesquisa | 1 | `docs/blog/campanhas/outubro-rosa/fatos-epidemiologia.md` | — | ver ficha (tabela + JSON de referências) |
| 1 | P2 | Pesquisa | 1 | `…/fatos-tecnologia.md` | — | idem |
| 1 | P3 | Pesquisa | 1 | `…/fatos-tratamento.md` | — | idem |
| 1 | P4 | Pesquisa | 1 | `…/fatos-rastreamento.md` | — | idem |
| 1 | P5 | Pesquisa | 1 | `…/fatos-direitos.md` | — | idem |
| 1 | P6 | Pesquisa | 1 | `…/fatos-mitos-habitos.md` | — | idem |
| 1→2 | **S1** | sessão principal | 0 | `scripts/build-blog.js`, `scripts/build.js` | M1, I1 (símbolo `laco`) | CAMPANHAS.md §1 item 7 |
| 2 | M2 | Motor | 1 | `blog-campanha.css` | M1, S1 | ver ficha (build do exemplo + checagens) |
| 2 | M3 | Motor | 1 | `blog/campanha.js` | M1, S1 | `node --check blog/campanha.js` + ver ficha |
| 2 | F1 | Feed | 1 | `blog.html`, `blog/feed.js` | S1 | ver ficha |
| 2 | C1 | Conteúdo | 1 | `docs/blog/campanhas/outubro-rosa/partes/parte-1.json` | P1, P4, P5, S1 | `node scripts/blog-blocos-campanha.js --checar-parte ../docs/blog/campanhas/outubro-rosa/partes/parte-1.json` |
| 2 | C2 | Conteúdo | 1 | `…/partes/parte-2.json` | P2, P3, S1 | idem com `parte-2.json` |
| 2 | C3 | Conteúdo | 1 | `…/partes/parte-3.json` | P4, P1, S1 | idem com `parte-3.json` |
| 2 | C4 | Conteúdo | 1 | `…/partes/parte-4.json` | P5, P6, S1 | idem com `parte-4.json` |
| 2 | G1 | Instagram | 1 | `docs/campanhas/outubro-rosa/instagram/roteiro.md`, `…/instagram/slides.json` | P1–P6 | ver ficha |
| 3 | C5 | Conteúdo | 1 | `blog/conteudo/campanhas.json`, `scripts/build-blog.test.mjs` (só a contagem 18→19) | C1–C4, S1 | `node --test scripts/build-blog.test.mjs scripts/blog-blocos-campanha.test.mjs && node scripts/build-blog.js --out ../.tmp-blog` |
| 3 | G2 | Instagram | 1 | `scripts/campanha-slides.mjs`, `docs/campanhas/outubro-rosa/instagram/slide-NN.png` | G1 | `node scripts/campanha-slides.mjs` (gera 8–10 PNG 1080x1350) |
| 4 | Q1 | QA | 1 | `scripts/e2e/blog.e2e.js`, `scripts/e2e/campanha.e2e.js` | todas acima | `node scripts/build.js && node scripts/e2e/run.js blog campanha liga` |
| 5 | R | orquestrador (Opus) | 0 | — (revisão) | Q1 | checklist do orquestrador; a sessão principal comita |

## Regras de disparo
- Onda 1: disparar as 10 de uma vez. **S1** começa assim que M1 e I1 terminarem (não precisa esperar as P).
- Onda 2: M2/M3/F1 assim que S1 estiver verde; C1–C4 assim que as P de que dependem terminarem **e** S1 estiver verde; G1 quando P1–P6 terminarem.
- Uma P com status DESCARTADO em massa (fonte primária inacessível) não bloqueia: as fichas C usam só o que está CONFIRMADO/CORRIGIDO.
- Falhou o aceite? Devolver a mesma ficha ao mesmo Haiku com a saída do erro (SendMessage), não abrir outra ficha para o mesmo arquivo.
- `dist/` é compartilhado: só I1, I2, I3, F1 e Q1 rodam `node scripts/build.js`. Ninguém gera `--incluir-exemplo` em `dist/` (M2/M3 usam
  `frontend/.tmp-m2`/`.tmp-m3`). Um e2e que falhar com arquivo ausente/truncado em `dist/` por build simultâneo: rodar de novo antes de investigar.
- Fora do plano (a sessão principal cuida): Lia, migrações de banco, commits, deploy.
