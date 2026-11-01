# Engajamento pessoal (ENG-01, ENG-02, ENG-03)

Decisão do dono: gamificação **só pessoal**. Não há ranking, placar nem comparação entre pessoas. Mensagens sempre positivas; perder a sequência nunca gera culpa.

## O que existe

| Item | Onde | Como funciona |
|---|---|---|
| Continuar de onde parou (ENG-01) | Início, topo | Um cartão leva ao último módulo tocado. Fonte: última linha de `learning_attempts` (servidor) ou o último módulo aberto no aparelho (`localStorage`, `laift_last_module`); vale o mais recente. Sem nenhum dos dois, o cartão não aparece. |
| Sequência e meta diária (ENG-02) | Início, hub Aprender e fim do quiz do dia | Servidor (`apiLearnGetEngagement`): dias consecutivos com pelo menos 1 tentativa, no dia de `America/Sao_Paulo`. Quem ainda não estudou hoje mantém a sequência de ontem. Meta de 5, 10 ou 20 questões por dia (padrão 10), contadas dos simulados do dia. |
| Quiz do dia (ENG-03) | Botão no Início | 5 questões do banco de Farmacologia (`modulos/quiz/questions.js`), escolhidas pela data (hash FNV-1a + mulberry32 sobre `AAAA-MM-DD` de São Paulo, banco ordenado por id): mesmo conjunto para todos no dia. Ao terminar grava uma tentativa comum (`quiz_estudo`, tópico "Quiz diário"), que entra na sequência e na meta. Repetir no mesmo dia é só revisão e não grava de novo. |

## API (Worker)

- `apiLearnGetEngagement(token)` devolve `{ today, streak: {current, best, activeToday}, goal: {target, todayQuestions, reached, persisted}, dailyQuizDone, last }`.
- `apiLearnSetDailyGoal(token, { goal })` aceita 5, 10 ou 20.
- Código: `worker/src/services/engagementService.js`. Só lê as tentativas da própria sessão.

## Banco

`sql/047_daily_goal.sql` (reversão em `sql/down/`) adiciona `preferences.daily_goal`. **Não aplicada pelo código.** Sem a coluna tudo funciona: o servidor usa 10 e a escolha fica só no aparelho (`laift_daily_goal`).

## Frontend

`engagement.js` (painel, textos, escolha do quiz), `daily-quiz.js` (janela do quiz), `engagement.css`. A microinteração (`.eng-pop`) só roda com `prefers-reduced-motion: no-preference`. Alvos de toque de 44 px ou mais. Falha de rede nunca bloqueia a Início.

## Limites conhecidos

- O quiz do dia usa só o banco de Farmacologia; se o banco mudar, o conjunto do dia muda.
- O fim dos simulados dentro dos módulos (iframes) não foi alterado: a sequência e a meta aparecem ao voltar ao hub Aprender.
