# Feature flags

## Mecanismo vigente

Tabela `feature_flags` (`sql/016_feature_flags.sql`): `key`, `enabled` (padrão `FALSE`), `rollout_pct` (padrão 100), `conditions` (JSON com `role` ou `profile_ids`), `description`, `updated_by` e `updated_at`. Lida por `worker/src/services/featureFlagService.js`.

Avaliação (`evaluateFlag`):
- `enabled = false`: desligada para todos.
- `conditions.role` ou `conditions.profile_ids`: só esses papéis ou pessoas.
- `rollout_pct < 100`: percentual decidido por hash estável de chave e pessoa. Sem identidade (visitante anônimo), só vale com 100.

Leitura com cache de 60 s por instância do Worker. Se a tabela ainda não existe, todas as flags ficam desligadas (`isMissingTable`). Um erro transitório de banco reaproveita o último valor conhecido; sem valor, o erro sobe, então uma falha nunca vira "desligado" por acidente.

Quem altera:
- `apiAdminSetFeatureFlag` (API): grava `updated_by` e a linha `SET_FEATURE_FLAG` em `audit_logs`. É o caminho recomendado.
- `UPDATE` de SQL: não grava nenhum dos dois. Serve para emergência, e não é protegido contra a reaplicação da 023 (ver "Regra de nascimento").

`mfa_required` é reservada (`RESERVED_FLAGS`): não aceita percentual nem condições, e exige reautenticação.

## Quais flags vão ao navegador

`PUBLIC_FLAGS` em `featureFlagService.js`: `ux_v2_enabled`, `chatbot_enabled` e `feedback_enabled`. As demais só aparecem para admin (`apiAdminListFeatureFlags`).

## Flags da renovação (UX v2, Lia, RAG, feedback e moderação)

| Flag | Fase | Pública | Criada em | Estado depois da 023 | Onde é lida |
|---|---|---|---|---|---|
| `ux_v2_enabled` | A, B | sim | 016, `FALSE` | ligada, se nunca alterada por admin | `frontend/ux-v2.js` (vira o atributo `data-flag-ux-v2-enabled` no `<html>`) |
| `chatbot_enabled` | C (Lia) | sim | 019, `FALSE` | ligada, se nunca alterada por admin | `worker/src/services/assistantService.js` (`FLAG_CHATBOT`, falha fechada) |
| `rag_enabled` | D1 | não | 023, `TRUE` | ligada | `worker/src/services/assistantService.js` (`FLAG_RAG`); reindexação diária em `worker/src/maintenance.js` |
| `feedback_enabled` | D2 | sim | 023, `TRUE` | ligada | `worker/src/services/assistantFeedbackService.js` (`FLAG_FEEDBACK`) |
| `moderation_enabled` | D3 | não | 023, `TRUE` | ligada | `worker/src/services/moderationService.js` (`FLAG_MODERATION`) |

Outras flags semeadas na 016: `use_orchestrator` (`FALSE`), `nvidia_fallback` (`FALSE`) e `mfa_required` (`FALSE`, reservada).

## Regra de nascimento

- Toda flag nova nasce desligada (`FALSE`). Só entra em `PUBLIC_FLAGS` se for de interface.
- Exceção decidida pelo dono: as cinco da renovação nascem **ligadas**, pela 023. Ela insere com `ON CONFLICT (key) DO NOTHING`, então uma linha que já existe não é alterada pelas três de RAG, feedback e moderação.
- A 023 nunca religa o que um admin desligou. `ux_v2_enabled` e `chatbot_enabled` só são ligadas se `updated_by IS NULL` e não houver `SET_FEATURE_FLAG` para a chave em `audit_logs`. A regra completa está em `sql/023_flags_v2.sql`.
- Limite conhecido: um desligamento feito por `UPDATE` de SQL não tem `updated_by` nem auditoria. Reaplicar a 023 num banco assim religaria essas duas flags. Por isso, decisões de desligar que devem durar passam pela API.

## Rollback

Pela API (recomendado; grava `updated_by` e auditoria; vale em até 60 s, sem deploy):

```json
{"action":"apiAdminSetFeatureFlag","args":["<token de sessão de admin>","rag_enabled",{"enabled":false}]}
```

Pelo SQL (emergência; sem auditoria e sem `updated_by`):

```sql
UPDATE feature_flags SET enabled = FALSE, updated_at = now() WHERE key = 'rag_enabled';
```

O runbook completo, com o passo a passo e a ordem das migrações, está em `docs/AMBIENTES.md` (seções 2, 5 e 6).

## Histórico de decisões

- **Mecanismo:** a tabela com rollout e auditoria é a fonte da verdade. Nenhuma variável de ambiente de flag foi criada: `featureFlagService.js` só lê a tabela.
- **Front:** `frontend/ux-v2.js` aplica as flags públicas como atributos `data-flag-<chave>` no `<html>`. O CSS novo se condiciona a `:root[data-flag-ux-v2-enabled]`. Nenhum script inline.
