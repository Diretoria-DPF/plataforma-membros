# T00 — Fechar o PR #14 (Onda 3.5)
**Quem faz:** você (humano) · **Depende de:** nada · **Estimativa:** 15 min

## Objetivo
Mesclar a Onda 3.5 na `main` para que as próximas tarefas partam de um código único.

## Arquivos
Nenhum. É conferência no GitHub.

## Como fazer
1. Abra o PR #14 do repositório `Diretoria-DPF/plataforma-membros`.
2. Confira que o check `atlas-e2e` está verde e que o PR está "mergeable".
3. Se estiver vermelho: abra o log do job, copie só o trecho do erro e cole num chat com o `PROMPT-BASE.md`, pedindo a correção mínima. Rode `bash docs/atlas-continuacao/validar.sh` antes de enviar a correção.
4. Tire o PR de rascunho e mescle com **merge commit** (não use squash, para manter o histórico por tarefa).
5. Atualize o seu clone: `git fetch origin && git checkout -B atlas/proxima origin/main`.

## Não fazer
- Não mescle com CI vermelho. Não apague o branch `claude/optimistic-babbage-3pm2em` antes de confirmar o merge.

## Aceite
- [ ] `main` contém `frontend/modulos/anatomia-3d/sw.js` e a pasta `docs/atlas-continuacao/`.
- [ ] `bash docs/atlas-continuacao/validar.sh` passa na `main`.

## Prompt pronto
(Não precisa de chat de código.)
