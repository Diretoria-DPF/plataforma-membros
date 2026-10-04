# Chaves de IA

Como as chaves dos provedores de IA são guardadas, usadas e trocadas. **Este arquivo nunca contém valores de chave.**

## Onde ficam
| Segredo | Provedor | Como cadastrar | Quem lê |
|---|---|---|---|
| `GROQ_API_KEYS` | Groq | `npx wrangler secret put GROQ_API_KEYS` (várias chaves separadas por vírgula, espaço ou `;`) | `worker/src/ai/groqClient.js` (`parseKeys`) |
| `NVIDIA_API_KEY` | NVIDIA NIM | `npx wrangler secret put NVIDIA_API_KEY` — só quando a Fase 3 entregar o cliente | ainda não lido |

- Nunca no código, no `wrangler.toml`, em `.env` versionado, em log, em `error_logs` ou em conversa de chat.
- Desenvolvimento local: `worker/.dev.vars` (ignorado pelo git). Staging usa secrets próprios, separados de produção.
- Modelos e URLs não são segredo: `GROQ_MODEL_FAST` e `GROQ_MODEL_SMART` em `[vars]` do `wrangler.toml`. Confirmar o ID de cada modelo em `GET /openai/v1/models` (Groq) e `GET /v1/models` (NVIDIA) antes de trocá-lo.

## Limites que importam (plano gratuito)
- **O limite do Groq é por organização, não por chave.** Chaves da mesma organização compartilham a cota e estouram juntas. Por modelo: 30 req/min, 1.000 req/dia, 8 mil tokens/min, **200 mil tokens/dia**.
- Três modelos de chat dão um teto de ~600 mil tokens/dia. Com ~1,2 mil tokens por mensagem (estimativa), cabem cerca de 15 usuários ativos por dia com folga (~270 mil), 30 no limite (~540 mil) e 50 estouram (~900 mil).
- A NVIDIA gratuita tem cerca de 40 req/min e não há como aumentar; os termos para uso em produção precisam ser confirmados antes de ligar a flag.
- Chaves de organizações diferentes isolariam o problema, mas usar várias contas para multiplicar cota pode violar os termos do provedor: **não projetar a capacidade contando com isso**.

## Estratégia de uso das chaves
| Estratégia | Comportamento | Quando serve |
|---|---|---|
| Rodízio (estado atual de `rotationOrder`) | Começa em uma chave aleatória e segue em ordem | Espalha a carga entre chaves **de organizações diferentes** |
| **Failover ordenado (adotada, a implementar na Fase 0)** | Usa a chave 1 até receber 429/401/403/5xx; então a 2, e assim por diante. Cooldown da chave = `Retry-After` (teto de 1 h); sem o cabeçalho, 60 s | Chaves da mesma organização: um 429 diário não faz a plataforma insistir em chaves que vão falhar pelo mesmo motivo |
| Chave por modelo | Chaves fixas para cada modelo | Descartada: com limite por organização não adiciona capacidade |

O cooldown fica em memória e no KV (`ai:key-cooldown:<índice>`); cada chave gasta uma leitura de KV por chamada.

## Rotação
- **Trimestral** e imediatamente após qualquer suspeita de vazamento ou saída de quem tinha acesso ao painel.
- Passo a passo: criar a chave nova no console do provedor → `wrangler secret put` com a lista nova (nova primeiro) → painel **IA** → "Testar chaves" (`checkKeys`) → revogar a antiga no console → registrar a data em `audit_logs`/`docs/CHANGELOG.md`.
- O painel mostra só o índice e os 4 últimos caracteres da chave (`maskKey`).

## Alertas
- Chave acima de 80% do teto diário de tokens, taxa de acerto do cache abaixo de 30% por 3 dias e 429 acima de 5% serão avaliados pelo cron (`maintenance.js`) e avisados por e-mail aos admins — previstos para a Fase 3 (`ai_metrics_daily`).
