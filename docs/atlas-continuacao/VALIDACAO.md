# Como validar com o Claude Code

Depois que você aplicar uma tarefa, abra o Claude Code **na pasta do repositório** e cole o prompt abaixo (troque `Txx` pelo ID da tarefa). Ele só lê e confere; não altera nada.

## Prompt de validação (cole no Claude Code)
> Valide a tarefa **Txx** deste repositório. Não edite arquivos.
> 1. Leia `docs/atlas-continuacao/tarefas/Txx-*.md` e rode `git diff origin/main...HEAD --stat` (ou `git diff --stat` se ainda não houver commit).
> 2. Para **cada item de "Aceite"** do cartão, responda ✔ ou ✘ com a evidência (arquivo:linha ou saída do comando).
> 3. Rode `bash docs/atlas-continuacao/validar.sh` (e o `--e2e` indicado no cartão) e relate **só o que falhar**.
> 4. Confira que a mudança ficou **dentro dos arquivos do cartão**; liste qualquer arquivo fora da lista.
> 5. Procure: segredos ou tokens; `innerHTML` com dado externo; `unsafe-inline`/`unsafe-eval` na CSP; assinatura, nome de revisor ou data do conselho preenchidos por alguém que não seja o conselho; teste desligado ou `skip` para passar.
> 6. Responda em até 15 linhas: **Aprovado** ou **Reprovado** e, se reprovado, a lista curta de correções (arquivo e o que mudar).

## Validação final (depois de T00 a T11)
> Faça uma validação final do projeto de continuação. Não edite arquivos. Rode `bash docs/atlas-continuacao/checar-caminhos.sh` e `bash docs/atlas-continuacao/validar.sh --e2e atlas`. Confira em `docs/atlas-continuacao/STATUS.md` que cada tarefa marcada `[x]` tem commit correspondente (`git log --oneline`). Liste o que ainda falta (itens sem `[x]`) e qualquer divergência entre o `STATUS.md` e o código. Responda em até 20 linhas.

## Regras de bolso
- Vermelho em `validar.sh` = não avançar.
- E2E é lento: rode só os que o cartão manda; o conjunto completo (`cd frontend && node scripts/e2e/run.js`) uma vez por PR.
- Capturas de tela em `docs/atlas-v2-shots/` mudam sozinhas ao rodar os e2e; **não** commite essas mudanças (`git checkout -- docs/atlas-v2-shots`).
