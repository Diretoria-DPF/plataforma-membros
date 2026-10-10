# Ordem de execução — ajustes da tela de entrada, do blog e do endereço (ajustes-2, v1, 2026-10-09)

Disparo (sessão principal): **"RAIZ = C:\Users\Administrador\Desktop\plataforma membro\.claude\worktrees\ajustes-2. Leia
`<RAIZ>/docs/identidade/ajustes-2/fichas/<id>.md` e execute."** — S1 e S2 em **Sonnet 5.5**, H1 em **Haiku 5.5**. Os três juntos.
Contrato: `docs/identidade/ajustes-2/CONTRATO.md`. Plano: `docs/identidade/ajustes-2/PLANO.md`.

## Regras fixas de toda ficha (leia antes de começar)
1. **Só edite (ou apague) os arquivos de que a sua ficha é DONA** (tabela abaixo). Precisa mudar outro? Não mude: relate o trecho e o porquê.
2. **Não use git** (nada de status/add/commit/stash/checkout/rm do git). Apagar arquivo dono da ficha: `rm` no Bash. A sessão principal comita.
3. **Não rode `node scripts/build.js`** nem escreva em `frontend/dist/`. Não mexa em `frontend/node_modules` (pode estar instalando).
4. CSP sem `'unsafe-inline'`: sem `<script>` inline (só JSON-LD), sem `style=""`, sem `on*=`, sem `innerHTML`/`outerHTML`/
   `insertAdjacentHTML`/`document.write`. JS cria nós com `createElement`/`createElementNS`/`textContent`; estilo só por classe, atributo
   ou `el.style.setProperty('--x', v)`.
5. Arquivo `.js`, `.css` ou `.mjs` **novo** começa com este cabeçalho (cópia de `frontend/scripts/blog-novidade.test.mjs:1-5`):
   ```
   /*
    * Plataforma de Membros LAIFT
    * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
    * Licença proprietária: ver LICENSE na raiz do repositório.
    */
   ```
6. Movimento só em `transform`/`opacity`; `prefers-reduced-motion: reduce` mostra o estado final (em `ux.css`/`styles.css` **não**
   escreva esse `@media`: o bloco único é o de `modulos/shared/laift-tokens.css`). Alvo de toque ≥ 44 px. `:hover` só em
   `@media (hover: hover)`. Tokens de `modulos/shared/laift-tokens.css` (claro e escuro). Celular (375 px) primeiro, depois 1280 px.
7. Textos em português do Brasil, frases curtas. Textos de interface: os **exatos** do CONTRATO. Proibido na interface: "em revisão",
   "planejado", "proposta", "pendente".
8. Sem biblioteca, sem CDN, sem fonte externa, sem imagem raster nova.
9. **GateGuard:** se um hook pedir fatos na primeira criação/edição de um arquivo, escreva 2 linhas — quem usa o arquivo e a instrução do
   usuário (a frase "Objetivo" da sua ficha) — e repita a MESMA chamada.
10. Economize tokens: não leia arquivo grande inteiro (Grep, `offset`/`limit`); leia só as seções do CONTRATO citadas na ficha.
11. Comandos de aceite no Bash (Git Bash). O caminho tem espaço: use aspas. Falhou? Corrija e rode de novo; não entregue vermelho.
    Se o verificador falhar **só** por arquivo de outra ficha (as três rodam juntas), espere 2 minutos, rode de novo e, se persistir, relate.
12. **Relatório final (≤ 10 linhas):** id · arquivos criados/alterados/apagados · cada comando de aceite e o resultado (1 linha) ·
    pendências para outros donos (trecho exato) · riscos. Nada de colar código.

## Donos (nenhum arquivo tem dois donos; caminhos a partir de `frontend/`)
| Ficha | Modelo | Dono de | Aceite (resumo) |
|---|---|---|---|
| S1 | Sonnet 5.5 | `index.html`, `ux.css`, `styles.css`, `scripts/build.js`, `sw.js`, `scripts/e2e/campanha.e2e.js`; **novos** `scripts/entrada.test.mjs`, `scripts/e2e/entrada.e2e.js`; **apagar** `hero.js`, `scripts/hero.test.mjs`, `scripts/e2e/hero-ux2.e2e.js` | `verificadores/s1-entrada.js` verde |
| S2 | Sonnet 5.5 | `blog-novidade.js`, `blog-novidade.css`, `scripts/blog-novidade.test.mjs`, `blog.html`, `blog/404.html`, `scripts/build-blog.js`, `scripts/build-blog.test.mjs`, `blog.css`, `scripts/e2e/blog.e2e.js` | `verificadores/s2-blog.js` verde |
| H1 | Haiku 5.5 | `liga.html`, `liga-mapa.js`, `icons/predio-instituicao.svg`, `edital.html`, `scripts/e2e/liga.e2e.js` | `verificadores/h1-endereco.js` verde |
| sessão principal | — | build, e2e, `docs/CONTINUIDADE.md`, `docs/riscos-residuais.md`, `docs/identidade/STATUS.md`, commits, PR | PLANO §5 |

Os verificadores (`docs/identidade/ajustes-2/verificadores/`) são do orquestrador: **não edite**. Eles escrevem só em
`docs/identidade/ajustes-2/capturas/` (fotos para o dono).

## Ondas
| Onda | Quem | O quê | Depende de | Aceite |
|---|---|---|---|---|
| 1 | S1, S2, H1 juntos | as três fichas | CONTRATO | o verificador de cada ficha + os comandos da ficha |
| 2 | sessão principal | rodar os 3 verificadores em série; `cd frontend && node scripts/build.js && node --test scripts/*.test.mjs` | onda 1 verde | só as 2 falhas antigas de `_headers` (seo, staging) |
| 3 | sessão principal | `node scripts/e2e/run.js entrada liga blog campanha csp navegacao smoke home assistant onboarding` | build | 0 ✘ |
| 4 | orquestrador (Opus) | revisão dos relatórios, do diff e das capturas | onda 3 | checklist do PLANO §4 |
| 5 | dono | portão visual: aprovar `capturas/` (antes em `capturas/antes/`) e responder PLANO §6 | revisão | só então a PR |

## Regras de disparo
- Falhou o aceite? Devolver a mesma ficha ao mesmo agente (SendMessage) com a saída do erro; não abrir ficha nova para o mesmo arquivo.
- Um e2e da onda 3 que achar defeito de produto: a sessão principal devolve a ficha do dono do arquivo, refaz o build e roda de novo.
- `npm run e2e` inteiro (inclui `visual-qa`) só a sessão principal, antes da PR. A geometria do `visual-qa` é do app logado: não muda.
