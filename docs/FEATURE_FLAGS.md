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
- `UPDATE` de SQL: não grava `updated_by` nem auditoria, mas o gatilho `trg_feature_flags_updated_at` (criado na 023) marca `updated_at`, então a reaplicação da 023 NÃO religa uma flag desligada por SQL (ver "Regra de nascimento"). Serve para emergência; antes da 023 existir no banco, desligue só pela API.

`mfa_required` é reservada (`RESERVED_FLAGS`): não aceita percentual nem condições, e exige reautenticação.

## Quais flags vão ao navegador

`PUBLIC_FLAGS` em `featureFlagService.js`: `ux_v2_enabled`, `chatbot_enabled`, `feedback_enabled`, as da Biblioteca e `lia_visitor_ai_enabled` (ver as tabelas abaixo). As demais só aparecem para admin (`apiAdminListFeatureFlags`).

## Flags da renovação (UX v2, Lia, RAG, feedback e moderação)

| Flag | Fase | Pública | Criada em | Estado depois da 023 | Onde é lida |
|---|---|---|---|---|---|
| `ux_v2_enabled` | A, B | sim | 016, `FALSE` | ligada, se nunca alterada por admin | `frontend/ux-v2.js` (vira o atributo `data-flag-ux-v2-enabled` no `<html>`) |
| `chatbot_enabled` | C (Lia) | sim | 019, `FALSE` | ligada, se nunca alterada por admin | `worker/src/services/assistantService.js` (`FLAG_CHATBOT`, falha fechada) |
| `rag_enabled` | D1 | não | 023, `TRUE` | ligada | `worker/src/services/assistantService.js` (`FLAG_RAG`); reindexação diária em `worker/src/maintenance.js` |
| `feedback_enabled` | D2 | sim | 023, `TRUE` | ligada | `worker/src/services/assistantFeedbackService.js` (`FLAG_FEEDBACK`) |
| `moderation_enabled` | D3 | não | 023, `TRUE` | ligada | `worker/src/services/moderationService.js` (`FLAG_MODERATION`) |

Outras flags semeadas na 016: `use_orchestrator` (`FALSE`), `nvidia_fallback` (`FALSE`) e `mfa_required` (`FALSE`, reservada).

## Flags da Biblioteca

Criadas pela 029 (`sql/029_library.sql`), todas **desligadas**. A 029 insere com `ON CONFLICT (key) DO NOTHING` e `FALSE`; não copia o `TRUE` da 023.

| Flag | Fase | Pública | Estado depois da 029 | Onde é lida |
|---|---|---|---|---|
| `library_enabled` | B1 | sim | `FALSE` | Menu "Estudo", painel do membro e catálogo público (`docs/cortex/CONTRATO-B1.md` §4) |
| `library_member_suggest` | B1 | sim | `FALSE` | Botão "Sugerir artigo" |
| `library_ai_summary` | B3 | não | `FALSE` | Resumo por IA (ainda sem efeito) |
| `lia_library_enabled` | B4 | não | `FALSE` | Lia cita artigos publicados (ainda sem efeito) |

Ligação por etapas, desligamento e volta: `docs/cortex/RUNBOOK-BIBLIOTECA.md`. Com condição de papel (`conditions.role`), a página pública fica fora, porque a leitura sem sessão não casa a condição.

## Flags da Lia híbrida

Criadas pela 033 (`sql/033_lia_hibrida_flag.sql`), as duas **desligadas** (`INSERT ... ON CONFLICT (key) DO NOTHING`). Ordem de ativação em `docs/lia/PLANO.md` §7.

| Flag | Pública | Estado depois da 033 | Onde é lida |
|---|---|---|---|
| `lia_hibrida_enabled` | não | `FALSE` | `assistantService.js` (`FLAG_HIBRIDA`; exige também `rag_enabled`): guarda de intenção, resposta clínica segura, escolha de seções e resposta extrativa |
| `lia_visitor_ai_enabled` | sim (o front só carrega o Turnstile com ela ligada) | `FALSE` | `assistantService.js` (`FLAG_VISITOR_AI`): prévia de IA do visitante; exige `lia_hibrida_enabled`, o secret `TURNSTILE_SECRET` e o KV |

## Regra de nascimento

- Toda flag nova nasce desligada (`FALSE`). Só entra em `PUBLIC_FLAGS` se for de interface.
- Exceção decidida pelo dono: as cinco da renovação nascem **ligadas**, pela 023. Ela insere com `ON CONFLICT (key) DO NOTHING`, então uma linha que já existe não é alterada pelas três de RAG, feedback e moderação.
- A 023 nunca religa o que um admin desligou. `ux_v2_enabled` e `chatbot_enabled` só são ligadas se `updated_by IS NULL` e não houver `SET_FEATURE_FLAG` para a chave em `audit_logs`. A regra completa está em `sql/023_flags_v2.sql`.
- Desligamento por `UPDATE` de SQL: o gatilho `trg_feature_flags_updated_at` grava `updated_at` em qualquer UPDATE da tabela (inclusive só `description`, `rollout_pct` ou `conditions`), e a 023 só liga `ux_v2_enabled`/`chatbot_enabled` em linha intocada (`updated_at = created_at`). Logo, reaplicar a 023 não religa uma flag desligada à mão depois de a 023 existir no banco. Limite: um `UPDATE` feito antes de a 023 existir no banco não deixa marca; nesse caso, desligue pela API. A API continua o caminho recomendado, porque grava `updated_by` e auditoria.

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
