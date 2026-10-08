# Feature flags

## Mecanismo vigente
Tabela `feature_flags` (sql/016), lida por `worker/src/services/featureFlagService.js`: `key`, `enabled`, `rollout_pct`, `conditions` (role ou `profile_ids`). Admin altera por `apiAdminSetFeatureFlag`. O front lê as flags públicas por `apiGetFeatureFlags`; a lista pública é `PUBLIC_FLAGS` (hoje só `ux_v2_enabled`).

## Decisão proposta para as flags do plano visual
1. **Fonte da verdade em runtime: a tabela `feature_flags`.** Liga e desliga sem deploy e permite rollout por porcentagem. É o rollback de cada fase.
2. **Front:** ao carregar, `app.js` aplica as flags públicas como atributos no `<html>` (`data-flag-ux-v2-enabled="1"`). O CSS e o JS novos se condicionam a esse atributo (`:root[data-flag-ux-v2-enabled] …`). Nenhum script inline.
3. **Variável de ambiente no Worker:** só como padrão de emergência (kill-switch) quando a tabela não responde, nunca para ligar algo novo. Se não for necessário, não criar.
4. Toda flag nova entra com `enabled = FALSE`; só as de UI vão para `PUBLIC_FLAGS`.

## Flags do plano
| Flag | Fase | Pública |
|---|---|---|
| `ux_v2_enabled` | A, B | sim |
| `chatbot_enabled` | C (Lia) | sim |
| `rag_enabled` | D1 | não |
| `feedback_enabled` | D2 | sim |
| `moderation_enabled` | D3 | não |

## Aberto
O plano original citava "env var + `data-flag`". Como já existe a tabela com rollout e auditoria, a proposta acima a mantém e usa o atributo `data-flag-*` só para o front. Confirmar com o usuário antes da Fase A.
