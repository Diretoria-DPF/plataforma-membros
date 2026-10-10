# Ordem de execução — progresso de leitura e entrada (ux-progresso, v2, 2026-10-10)

Disparo (sessão principal): **"RAIZ = C:\Users\Administrador\Desktop\plataforma membro\.claude\worktrees\ajustes-2. Leia
`<RAIZ>/docs/ux-progresso/fichas/<id>.md` e execute."** — H1 a H6 em **Haiku 5.5**. Contrato: `docs/ux-progresso/CONTRATO.md`.
Plano: `docs/ux-progresso/PLANO.md`. Anexos exatos (copiar, não reescrever): `docs/ux-progresso/fichas/anexos/`.

## Regras fixas de toda ficha (leia antes de começar)
1. **Só edite (ou crie) os arquivos de que a sua ficha é DONA** (tabela abaixo). Precisa mudar outro? Não mude: relate o trecho e o porquê.
2. **Não use git** (nada de status/add/commit/stash/checkout/rm do git). A sessão principal comita.
3. **Não rode `node scripts/build.js`** nem escreva em `frontend/dist/`. Não mexa em `frontend/node_modules`.
4. Arquivos quentes (`index.html`, `app.js`, `scripts/build.js`, `sw.js`, `styles.css`) **não têm ficha**: só a sessão principal
   mexe neles, com `docs/ux-progresso/aplicar-quentes.js` (Lote B). Nenhuma ficha toca em `modulos/shared/laift-tokens.css`.
5. CSP sem `'unsafe-inline'`: sem `<script>` inline (só JSON-LD), sem `style=""`, sem `on*=`, sem `innerHTML`/`outerHTML`/
   `insertAdjacentHTML`/`document.write`. JS cria nós com `createElement`/`createElementNS`/`textContent`; estilo só por classe,
   atributo ou `el.style.setProperty('--x', v)`.
6. Arquivo `.js`, `.css` ou `.mjs` **novo** começa com este cabeçalho (cópia de `frontend/scripts/blog-novidade.test.mjs:1-5`):
   ```
   /*
    * Plataforma de Membros LAIFT
    * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
    * Licença proprietária: ver LICENSE na raiz do repositório.
    */
   ```
7. Movimento só em `transform`/`opacity`; **não** escreva `@media (prefers-reduced-motion: reduce)` (o bloco único é o de
   `modulos/shared/laift-tokens.css`). Alvo de toque ≥ 44 px. `:hover` só em `@media (hover: hover)`. Cor só por token.
8. Textos em português do Brasil, frases curtas, **os exatos do CONTRATO**. Proibido na interface: "em revisão", "planejado",
   "proposta", "pendente". Sem biblioteca, sem CDN, sem fonte externa, sem imagem raster nova.
9. **GateGuard:** se um hook pedir fatos na primeira criação/edição de um arquivo, escreva 2 linhas — quem usa o arquivo e a instrução
   do usuário (a frase "Objetivo" da sua ficha) — e repita a MESMA chamada.
10. Economize tokens: não leia arquivo grande inteiro (Grep, `offset`/`limit`); leia só as seções do CONTRATO citadas na ficha.
11. Arquivos `.js`/`.css` do repositório podem ter fim de linha CRLF: use a ferramenta Edit (ela respeita) e confira com o comando de aceite.
12. Comandos de aceite no Bash (Git Bash). O caminho tem espaço: use aspas. Falhou? Corrija e rode de novo; não entregue vermelho.
    Se o verificador da onda falhar **só** por arquivo de outra ficha (rodam juntas), espere 2 minutos, rode de novo e, se persistir, relate.
13. **Relatório final (≤ 8 linhas):** id · arquivos criados/alterados · cada comando de aceite e o resultado (1 linha) · pendências para
    outros donos (trecho exato) · riscos. Nada de colar código.

## Donos (nenhum arquivo tem dois donos; caminhos a partir de `frontend/`, salvo `docs/`)
| Ficha | Lote | Dono de | Aceite (resumo) |
|---|---|---|---|
| H1 | A | **novos** `modulos/shared/laift-progress.js`, `scripts/laift-progress.test.mjs` | `node --test scripts/laift-progress.test.mjs` 14/14 |
| H2 | A | **novo** `modulos/shared/laift-progress.css`; `blog/icones.svg` | `cmp` com o anexo; 27 símbolos |
| H3 | A | `scripts/build-blog.js`, `scripts/build-blog.test.mjs`, `blog-sw.js` | testes do blog verdes |
| H4 | A | `blog/post.js`, `blog.css`, `scripts/e2e/blog.e2e.js` | sem `blog-progresso`; sintaxe ok |
| H5 | A | `privacidade.html`, `docs/POLITICA_DE_PRIVACIDADE.md` | nota "Progresso de leitura" nos dois |
| H6 | B | **novo** `entrada.js`; `ux.css`, `scripts/entrada.test.mjs` | `entrada.test.mjs` 10/10 |
| W1 | W | ver `fichas/W1.md` (1 **Sonnet**; **não disparar** sem o OK do dono; não roda junto com o Lote B) | testes do Worker + conferência da migração |
| sessão principal | — | `index.html`, `scripts/build.js`, `sw.js` (via `aplicar-quentes.js`), build, e2e, docs de estado, commits, PR | PLANO §5 |

Os verificadores (`docs/ux-progresso/verificadores/`), os anexos e `aplicar-quentes.js` são do orquestrador: **não edite**. Os
verificadores escrevem só em `docs/ux-progresso/capturas/` (fotos para o dono).

## Ondas
| Onda | Quem | O quê | Depende de | Aceite |
|---|---|---|---|---|
| A1 | H1, H2, H3, H4, H5 juntos | Lote A (barra nos posts) | CONTRATO §2-§5 | comandos de cada ficha |
| A2 | sessão principal | `node docs/ux-progresso/verificadores/a-progresso.js` | A1 verde | **67 ok, 0 falha** |
| B0 | sessão principal | `node docs/ux-progresso/aplicar-quentes.js --conferir` e, verde, sem `--conferir` | A2 (ou junto, arquivos disjuntos) | 13 trocas gravadas |
| B1 | H6 | Lote B (CSS, `entrada.js`, testes) | B0 | comandos da ficha |
| B2 | sessão principal | `node docs/ux-progresso/verificadores/b-entrada.js` | B1 verde | **47 ok, 0 falha** |
| 3 | sessão principal | `cd frontend && node scripts/build.js && node --test scripts/*.test.mjs` e depois `node scripts/e2e/run.js blog entrada navegacao csp smoke qa-full mfa campanha liga` | A2 e B2 | só as 2 falhas antigas de `_headers`; 0 ✘ nos e2e |
| 4 | orquestrador (Opus) | revisão dos relatórios, do diff e das capturas | onda 3 | PLANO §4 |
| 5 | dono | portão visual: `docs/ux-progresso/capturas/` e PLANO §6 | revisão | só então a PR |

## Regras de disparo
- Falhou o aceite? Devolver a mesma ficha ao mesmo agente (SendMessage) com a saída do erro; não abrir ficha nova para o mesmo arquivo.
- H1 falhou 2 vezes no verificador A2? Pare e avise o orquestrador (candidata a Sonnet: ver PLANO §3, risco R1). Não troque de modelo sem o dono.
- Um e2e da onda 3 que achar defeito: a sessão principal devolve a ficha do dono do arquivo, refaz o build e roda de novo.
