# Fichas da Lia: ordem, ondas e regras (2026-10-09)

Plano: `docs/lia/PLANO.md`. A sessão principal dispara os executores Haiku 5.5, no máximo 3 ao mesmo tempo, e dá a cada um o caminho da sua ficha. Subagente não cria subagente.

## Ondas
| Onda | Fichas (em paralelo) | Depende de | Haiku |
|---|---|---|---|
| 1. Pesquisa e QA | L01 pesquisa (web), L02 QA do hero, L03 conteúdo da base | nada | 3 |
| 2. Implementação A | L04 registro 026, L05 seleção (rerank), L06 golden set | L05 ← L01 (`SELECAO.md`); L06 ← L03 | 3 |
| 3. Implementação B | L07 pesquisa externa, L08 interação (frontend), L10 operação | L07 ← L01 (`BASES.md`) e L04; L10 ← L04 | 3 |
| 4. Integração | L09 `assistantService` (arquivo quente, dono único) | L04, L05, L07 | 1 |
| 5. Revisão | orquestrador (Opus): lê os relatórios e os diffs e roda a suíte afetada | todas | 0 |

Total: **10 Haiku**, pico de 3. Entre as ondas, a sessão principal integra o que chegou e roda as suítes afetadas.

## Donos (disjuntos)
| Ficha | Arquivos-donos |
|---|---|
| L01 | `docs/lia/pesquisa/BASES.md`, `docs/lia/pesquisa/SELECAO.md` (novos) |
| L02 | `frontend/scripts/e2e/hero-ux2.e2e.js` (novo) |
| L03 | `worker/src/assistant/docsConteudo.js` + `worker/test/docsConteudo.test.js` (novos), `worker/src/assistant/docs.js` |
| L04 | `sql/026_lia_pesquisas.sql` + `sql/down/026_lia_pesquisas.sql`, `worker/src/services/researchLogService.js` + `worker/test/researchLogService.test.js` (novos) |
| L05 | `worker/src/services/rerankService.js` + `worker/test/rerankService.test.js` (novos), `worker/src/services/ragService.js` |
| L06 | `worker/test/fixtures/rag-eval.json`, `worker/test/ragEval.test.js` |
| L07 | `worker/src/research/scholarlyClient.js`, `worker/src/services/researchService.js`, `worker/test/researchService.test.js` (novos) |
| L08 | `frontend/assistant-research.js` + `frontend/scripts/assistant-research.test.mjs` (novos), `frontend/assistant.js`, `frontend/assistant-feedback.css` |
| L09 | `worker/src/services/assistantService.js`, `worker/test/assistantService.test.js` |
| L10 | `worker/src/maintenance.js`, `worker/test/maintenance.test.js`, `docs/AMBIENTES.md` |

Um par **código + teste novo do mesmo módulo**, ou o par **up/down de uma migração**, conta como 1 dono. Ninguém edita arquivo de outra ficha. Se precisar, entregue o trecho exato no relatório (arquivo, linha, antes e depois).

## A cargo da sessão principal (não é de nenhuma ficha)
- Antes da onda 1: a ação urgente da §0 do PLANO (conferir `rag_enabled` e reindexar).
- Depois de L08: registrar `assistant-research.js` em `frontend/scripts/build.js`, no `PRECACHE` de `frontend/sw.js` e no `<script defer>` de `frontend/index.html`, logo depois de `assistant-feedback.js`.
- Commits, merge, suíte completa, migração 026 em produção e flags: só com o OK do dono.
- Depois da integração: atualizar `docs/ANDAMENTO.md` e `docs/riscos-residuais.md` (O21 e O36, e os riscos novos da §6 do PLANO) e corrigir a numeração de migrações no `docs/TIME_CONTRATO.md`.

## Regras comuns (repetidas em cada ficha)
- Sem git: a sessão principal integra e comita.
- Haiku não toca no banco de produção nem em flags e não grava segredo. Português do Brasil; LF; cabeçalho de copyright em `.js/.mjs/.css/.sql` (copie de um arquivo vizinho).
- Todo comportamento novo fica atrás de flag **desligada** por padrão. Com as flags desligadas, o comportamento é idêntico ao de hoje.
- LGPD: nada de dado pessoal em registro, cache ou chamada externa; só hash e texto geral. CSP: sem `innerHTML`, sem handler inline, sem CDN.
- Funções com menos de 50 linhas, arquivos com menos de 800 linhas, sem mutação de entrada.
- GateGuard: se um hook pedir fatos na primeira criação ou edição de um arquivo, escreva 2 linhas (quem usa o arquivo e a instrução do usuário) e **repita a mesma chamada**.
- Memória (3,9 GB): rode só as suítes da ficha, com `-i`, e no máximo 1 e2e.
- Relatório final com no máximo 12 linhas: arquivos, comando de aceite e resultado resumido, pendências e trechos para outros donos.
