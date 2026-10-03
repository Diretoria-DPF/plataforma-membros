# Atlas 3D — projeto de continuação (guia para seguir com outros chats)

Este guia existe para que **qualquer chat ou modelo** continue o trabalho de forma simples, em passos pequenos, sem precisar do histórico da conversa. Você aplica as mudanças uma por uma; o código vem de outro chat; o Claude Code valida no fim.

## Como usar (3 passos, sempre os mesmos)
1. **Escolha a próxima tarefa.** Abra [`STATUS.md`](STATUS.md) e pegue a primeira tarefa sem `[x]` cujas dependências já estejam marcadas. A ordem sugerida está em [`CRONOGRAMA.md`](CRONOGRAMA.md).
2. **Entregue ao chat de código.** Abra o cartão em [`tarefas/`](tarefas/). Cole no chat novo, nesta ordem: o conteúdo de [`PROMPT-BASE.md`](PROMPT-BASE.md) e depois o **"Prompt pronto"** do final do cartão. Cada cartão se entende sozinho.
3. **Valide e marque.** Rode `bash docs/atlas-continuacao/validar.sh` (se mexeu em tela, rode também `--e2e <nome>`; os nomes estão no cartão). Marque `[x]` no `STATUS.md`. Para a validação final, use o prompt de [`VALIDACAO.md`](VALIDACAO.md) no Claude Code.

> Uma tarefa por vez, um commit por tarefa. Se algo falhar, **não avance**: volte ao cartão e corrija.

## Regras fixas (valem para todas as tarefas)
- **Segredos:** nunca cole tokens, chaves ou senhas num chat. Segredos só entram nos campos de segredos do GitHub e da Cloudflare.
- **Neon (banco):** qualquer operação destrutiva ou em produção só com confirmação do dono do projeto. Teste primeiro num branch temporário.
- **Conselho editorial:** nenhuma ficha anatômica nem caso de quiz novo chega ao aluno sem checklist **assinado pelo conselho**. Ninguém preenche assinatura, revisor, registro ou data no lugar do conselho. A trava está em `frontend/scripts/atlas/check-curated-signed.mjs` e derruba o build.
- **Git:** um branch por PR (por exemplo `atlas/Txx-nome`), a partir da `main` atualizada. Nunca force-push, nunca reescrever histórico de branch compartilhado. Não crie PR sem o dono pedir.
- **Código:** módulos ES sem framework. Texto de tela em português do Brasil. Dado externo só entra no DOM por `textContent` ou pelo helper `LaiftDom` (`frontend/modulos/shared/safe-dom.js`), nunca por `innerHTML` solto. Sem `unsafe-inline` nem `unsafe-eval` na CSP do atlas.
- **Escopo:** mude só os arquivos do cartão. Se precisar de outro, diga por quê no commit.

## Mapa do repositório (o que importa para este guia)
| Caminho | O que é |
|---|---|
| `frontend/modulos/anatomia-3d/` | O atlas (JS, CSS, dados, modelos 3D) |
| `frontend/modulos/anatomia-3d/js/main.js` | Boot do atlas e ligação de tudo |
| `frontend/modulos/anatomia-3d/js/core/flags.js` | Chaves liga/desliga (offline, telemetry, quizSetup, systemic…) |
| `frontend/modulos/anatomia-3d/js/ui/` | Ficha (`infocard.js`), busca, navegador, selos |
| `frontend/modulos/anatomia-3d/js/modes/` | Modos: quiz, estudo, farmacologia, fisiologia, moléculas |
| `frontend/modulos/anatomia-3d/data/atlas/` | Dados: `curated/` (fichas aprovadas), `quiz-cases.json`, `fontes.json`, `schema/` |
| `frontend/modulos/anatomia-3d/sw.js` | Service Worker (offline) |
| `frontend/scripts/atlas/` | Scripts e testes unitários (`*.test.mjs`), trava de assinatura, pacotes |
| `frontend/scripts/e2e/` | Testes de ponta a ponta (Playwright), um arquivo `atlas-*.e2e.js` por assunto |
| `frontend/scripts/build.js` | Build do site (gera `frontend/dist/`) |
| `worker/` | API na Cloudflare (Jest em `worker/test/`) |
| `sql/` | Migrações do banco, aplicadas à mão no Neon |
| `docs/atlas-conteudo/` | Conteúdo para o conselho: fichas pendentes, checklists, guia de revisão |
| `docs/atlas-rollback.md` | Como desligar cada novidade |

## Comandos de verificação
| Comando (na raiz do repositório) | Para quê |
|---|---|
| `bash docs/atlas-continuacao/validar.sh` | Tudo que é rápido: unitários, validadores, trava, Worker, build |
| `bash docs/atlas-continuacao/validar.sh --e2e atlas-offline` | Idem, mais um (ou mais) e2e por prefixo de nome |
| `bash docs/atlas-continuacao/checar-caminhos.sh` | Confere se os caminhos citados nos cartões existem |
| `cd frontend && node scripts/e2e/run.js` | Todos os e2e (demora; rode uma vez por PR) |
