# Cronograma (3 semanas)

A ordem respeita as dependências do [`STATUS.md`](STATUS.md). Se uma tarefa travar, passe para a próxima da mesma coluna e volte depois. O que depende do conselho tem prazo próprio (3 dias por lote).

| Quando | Você (humano) | Outro chat (código) | Claude Code (validação) |
|---|---|---|---|
| **Dia 1** | T00 (CI e merge do PR #14); enviar os 4 zips ao conselho | — | Rodar `validar.sh` na `main` |
| **Semana 1** | T01 (Neon, deploy, ligar telemetria) | T05 (a11y), T06 (celular), T08 (aviso de versão) | Validar cada tarefa ao terminar |
| **Semana 2** | T04 para cada lote que o conselho devolver | T02 e T03 (**antes** de o conselho devolver); depois T07 e T09 | Validar; revisar o PR de T02 com atenção (é o que põe conteúdo no ar) |
| **Semana 3** | T13 (teste de papel), T14 (aparelho real, NVDA, alunos) | T10, T11 | T12 se houver orçamento; validação final |

## O que bloqueia o quê
- **T04** só começa quando o conselho devolver um checklist assinado **e** T02 (ou T03) estiver pronto.
- **T01** depende de acesso ao Neon e ao deploy da Worker (só você).
- Nenhuma tarefa mescla na `main` sem a sua autorização; nenhuma preenche assinatura do conselho.
- Se o conselho passar de 6 semanas sem assinar o lote 3: pausar o lote 3 e publicar os lotes 1 e 2 (regra do plano v4.0).

## Ritmo sugerido
Uma tarefa por vez: pegar o cartão, colar `PROMPT-BASE.md` + "Prompt pronto" no chat de código, aplicar à mão, `validar.sh`, marcar no `STATUS.md`, pedir validação ao Claude Code (veja [`VALIDACAO.md`](VALIDACAO.md)) e só então começar a próxima.
