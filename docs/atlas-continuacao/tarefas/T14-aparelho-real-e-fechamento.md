# T14 — Aparelho real, leitor de tela, alunos e post-mortem
**Quem faz:** você (humano) · **Depende de:** T00 e, de preferência, T05 a T08 · **Estimativa:** 1 dia

## Objetivo
Fechar a Onda 3.5 com o que só se prova fora do computador.

## Arquivos
- `docs/atlas-qa/` — guardar as anotações (um arquivo por teste).
- `docs/atlas-qa/post-mortem-onda-3-5.md` (novo) — post-mortem em até 7 dias.
- `docs/atlas-rollback.md` — consultar §6 se algo precisar ser desligado.

## Como fazer
1. **Aparelho real** (Moto G4 ou iPhone SE, ou o celular mais fraco que houver): abra o atlas, use a 1ª vez com rede, ative o modo avião e abra de novo. Anote: abriu? esqueleto apareceu? uma ficha já vista abre?
2. **Leitor de tela** (NVDA no Windows): tela de escolha do quiz, ficha com Fixar/Compartilhar, "Meu estudo". Anote o que o leitor falou e o que ficou sem nome.
3. **3 alunos** com um roteiro de 20 minutos: explorar, fixar 3 estruturas, fazer uma rodada do quiz, compartilhar um link, exportar o progresso. Anote onde travaram.
4. **Post-mortem** em `post-mortem-onda-3-5.md`: o que funcionou, o que quebrou, o que mudamos, o que fica para a próxima onda.
5. Problemas encontrados viram tarefas novas no `STATUS.md` (ID T15 em diante), cada uma com um cartão no mesmo modelo.

## Aceite
- [ ] Anotações dos 3 testes salvas em `docs/atlas-qa/`.
- [ ] Post-mortem escrito em até 7 dias depois do merge do PR #14.

## Prompt pronto
(Só para transformar achados em cartões.) Leia `docs/atlas-qa/post-mortem-onda-3-5.md` e, para cada problema listado, crie um cartão em `docs/atlas-continuacao/tarefas/` no mesmo modelo de `T05-acessibilidade-telas-novas.md` (objetivo, arquivos com caminho, como fazer, aceite, prompt pronto) e uma linha no `docs/atlas-continuacao/STATUS.md`.
