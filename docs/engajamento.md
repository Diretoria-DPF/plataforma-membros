# Engajamento pessoal (ENG-01, ENG-02, ENG-03, ENG-04, ENG-05, ENG-07)

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

## Novidades, primeiro quiz e microinteração (ENG-07, ENG-04, ENG-05)

Tudo no cliente; nenhum dado novo no servidor, nenhuma migração.

- **Novidades (ENG-07).** `whats-new.js` (pacote sob demanda `novidades`, com `laift-dialog.js`) abre um `LaiftDialog.alert` uma vez por versão para quem entrou. O conteúdo é a constante `ENTRIES` e a versão é `VERSION`; para anunciar algo novo, troque `VERSION` e acrescente a entrada. A entrada com `flag` (destaques da Liga, `highlights_enabled`) só aparece com a flag ligada. "Visto" fica em `localStorage` (`laift_whats_new_seen`, a versão vista), com `try/catch`. Quem acabou de ver o onboarding recebe a versão como vista, sem segundo diálogo. Perfil tem "Ver novidades" para reabrir. O `app.js` espera até 2 s pelas flags antes de abrir. Os e2e marcam a versão atual como vista por padrão (`harness.js`; `whatsNew: true` liga o aviso).
- **Primeiro quiz (ENG-04).** "Fazer o primeiro quiz" aparece no último passo do onboarding e na Início de quem nunca fez quiz (sem último módulo, sem recorde de sequência e sem questão hoje); nesse caso o quiz do dia vira botão secundário. Abre o simulado de Farmacologia já na questão 1 de 5 (`LaiftLearning.openFirstQuiz` → iframe com `#primeiro-quiz` → `quickStart()` do motor: modo estudo, a primeira questão de cada tópico em rodízio). Medido no e2e (`onboarding.e2e.js`): 1 toque a partir do último passo; 2 toques com "Pular" no onboarding + botão da Início. A Início de quem tem histórico não muda.
- **Microinteração (ENG-05).** `modulos/shared/quiz-feedback.js`: ao responder (só resposta nova, em modo estudo), a alternativa faz uma escala curta (CSS `.feedback-pop`, 280 ms) e o aparelho vibra `navigator.vibrate(10)` quando existe. Nada anima nem vibra com `prefers-reduced-motion: reduce`. Preferência "Vibração" em Perfil → Preferências (`localStorage` `laift_vibration`; `0` desliga; padrão ligada). Sem som.

## Limites conhecidos

- As Novidades só abrem com rede ou com o pacote em cache: sem ele, o aviso não aparece (nada é bloqueado).
- A preferência "Vibração" vale por aparelho e não é sincronizada com a conta.
- Quem já abriu o módulo de Farmacologia nesta sessão e tem simulado em andamento continua nele; "Fazer o primeiro quiz" não interrompe.

- O quiz do dia usa só o banco de Farmacologia; se o banco mudar, o conjunto do dia muda.
- O fim dos simulados dentro dos módulos (iframes) não foi alterado: a sequência e a meta aparecem ao voltar ao hub Aprender.
