# ADR 0005 — Retenção do feedback e dos registros da Lia (LGPD)

Status: aceita. Data: 2026-10-07 (atualizada em 2026-10-08).

## Contexto
`assistant_feedback` guarda polegar, categoria e comentário livre ligados a uma resposta da Lia. O comentário pode conter dado pessoal. `assistant_messages` (respostas registradas, sql/021) e `assistant_incidents` (incidentes de moderação, sem texto da mensagem, sql/022) também guardam registros ligados ao perfil.

## Decisão
- `assistant_feedback`, de 0 a 90 dias: registro bruto.
- Após 90 dias: `comment` é substituído pelo hash SHA-256 hex (pgcrypto) e recebe `comment_anonymized_at`. Rating e categoria permanecem para métricas. A limpeza só atua em linhas com comentário ainda não anonimizado.
- Após 365 dias: o registro de `assistant_feedback` é removido.
- `assistant_messages`: removida após 180 dias.
- `assistant_incidents`: removida após 365 dias.
- Execução: cron diário (`17 6 * * *`, somente em produção) no `worker/src/maintenance.js`, com as tarefas `assistantFeedbackAnonymize`, `assistantFeedbackPurge`, `assistantMessagesPurge` e `assistantIncidentsPurge`. Os prazos vêm de `FEEDBACK` e `ASSISTANT_RETENTION` em `worker/src/constants.js`. Cada tarefa roda isolada: uma falha (ex.: tabela ausente) vira `null` e é registrada em `error_logs`, sem derrubar as outras. Cada tarefa tem corte por `created_at` parametrizado e nunca um DELETE/UPDATE sem filtro de idade (há teste de varredura do SQL).
- Não haverá `tools/db/cleanup-feedback.mjs`: a limpeza é o cron acima.
- Política de Privacidade (seção 7) e página de Privacidade declaram estes prazos e a limpeza diária.

## Consequências
- **Efeito do CASCADE (sql/021).** `assistant_feedback.message_id` referencia `assistant_messages(id) ON DELETE CASCADE`. Ao remover a resposta aos 180 dias, sai também a avaliação dela. Como a avaliação sempre nasce depois da resposta, nenhum registro de avaliação chega aos 365 dias. A regra de 365 dias fica como limite de segurança. O prazo efetivo da avaliação é de 180 dias (mais até um dia, pela periodicidade do cron). A anonimização aos 90 dias é o único passo intermediário com efeito.
- **Exclusão de conta.** Não existe fluxo automatizado: a exclusão é feita pelo responsável a partir do pedido do titular (roteiro previsto em `docs/PLANO_FASE3_MENSAGERIA.md`, item R9). As FKs `ON DELETE CASCADE` de sql/021 e sql/022 removem avaliações, respostas, moderação e incidentes ligados ao perfil quando o cadastro é excluído.
- **Denúncias.** O ADR de origem pedia que o fluxo de denúncias cobrisse `assistant_feedback`. Hoje não há código de denúncia que faça isso: pendência.
- **Hash sem sal.** SHA-256 sem segredo é vulnerável a dicionário para comentários curtos e comuns. A decisão foi mantida, mas um HMAC com segredo do servidor seria mais forte. Pendência para revisão jurídica e de segurança.
- **Painel do admin.** Após a anonimização, o campo `comment` das listagens traz o hash no lugar do texto, com `comment_anonymized_at` preenchido. A apresentação deve tratar esse caso.
- **Versão da política.** A alteração de texto não mudou `LEGAL_VERSIONS.PRIVACY` (2026-10-08). Se a revisão jurídica considerar o texto materialmente alterado, a versão deve ser atualizada em `worker/src/constants.js`, na página e na política juntas, antes do merge de D2.
