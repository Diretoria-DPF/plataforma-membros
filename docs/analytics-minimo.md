<!--
Plataforma de Membros LAIFT
© 2026 Daniel Pires Francisco. Todos os direitos reservados.
Licença proprietária: ver LICENSE na raiz do repositório.
-->
# Analytics de produto mínimo (DAT-01)

Insumo para a futura Política de Privacidade (LGPD-03, a cargo do jurídico). Este arquivo descreve o que a plataforma mede
sobre o uso dela mesma. Não altera a Política.

## Finalidade

Saber se a plataforma está sendo usada e onde as pessoas desistem: quantas pessoas voltam por dia, semana e mês (DAU, WAU,
MAU), quantas das que se cadastram confirmam o e-mail, fazem o primeiro simulado e voltam depois (retenção D1, D7 e D30), e
quantas vezes algumas ações acontecem. Só quem administra vê os números, no painel do administrador.

## O que é coletado

Duas tabelas, ambas criadas pela migração `sql/040_usage_analytics.sql`:

| Tabela | Conteúdo | Identifica a pessoa? |
|---|---|---|
| `activity_days` | Um par (pessoa, dia): "esta conta esteve ativa neste dia". No máximo uma linha por pessoa por dia. | Sim, pelo identificador interno da conta. Sem nome, e-mail, hora, página, IP nem aparelho. |
| `usage_daily` | Um contador por (dia, métrica): `signup`, `email_confirmed`, `dau`, `quiz_completed`, `case_completed`, `lia_message`. | Não. São totais; não há identificador de pessoa. |

O "dia" é o dia civil de São Paulo (America/Sao_Paulo).

Os números de retenção e o funil cruzam `activity_days` com a data de cadastro e com a existência de um simulado na conta, que
já ficam no banco por outros motivos. O resultado mostrado ao administrador é sempre agregado.

## O que NÃO é coletado

- Conteúdo de mensagens, perguntas à Lia, respostas de simulados ou casos clínicos.
- Páginas visitadas, cliques, tempo de tela, rolagem ou qualquer rastro de navegação.
- Endereço IP, aparelho, navegador, localização ou identificadores de publicidade.
- Nada de quem não tem conta ou não está com sessão aberta.

## Sem cookies e sem terceiros

- Nenhum cookie e nenhum armazenamento no navegador é usado para isso. O registro acontece no servidor (Cloudflare Worker),
  quando a pessoa já está autenticada e faz uma requisição normal à plataforma.
- Nenhum serviço externo de analytics, pixel, SDK ou script de terceiros. Os dados ficam no mesmo banco da plataforma e não
  saem dele.

## Retenção e apagamento

- A faxina diária (`worker/src/maintenance.js`) apaga `usage_daily` e `activity_days` com mais de 400 dias.
- Ao excluir a conta, os dias de atividade dela somem junto (`ON DELETE CASCADE`). Os contadores agregados não têm pessoa
  associada e permanecem até os 400 dias.

## Como funciona (resumo técnico)

- A cada requisição com sessão válida e bem-sucedida, o Worker tenta registrar o dia da pessoa em segundo plano
  (`ctx.waitUntil`). Um cache em memória do processo evita repetir a escrita: no máximo uma por pessoa por dia por processo.
  Não há consulta extra no caminho da resposta.
- Se o registro falhar, a requisição segue normalmente e nada é escrito no log (o log não recebe dados pessoais).
- Os nomes de métrica aceitam só `[a-z0-9_.]` (até 40 caracteres), validados no Worker e no banco, para que nunca carreguem
  texto de pessoa.
- A leitura é a ação `apiAdminUsageStats`, que exige a capacidade `metrics.read` (somente administrador).
