# ADR 0007 — Camada agêntica (personas, guardrails e orquestração)

Status: aceita em 2026-10-12 (alfa: `apiVersion: 'agents/v1-alpha'`, tudo atrás de flags desligadas). Origem: plano "Operação LAIFT Agêntica, trilha de produto (v1)".

## Contexto
A Lia (guia da plataforma) bloqueia dose e conduta de propósito (`assistant/questionKind.js`). Um tutor de estudo precisa fazer o contrário: explicar mecanismo, farmacocinética e toxicidade, sem nunca dar dose numérica nem opinar sobre caso real. O orquestrador de IA (`ai/orchestrator.js`) já cuida de orçamento global, cache e Groq; faltava uma camada que defina QUEM responde (persona versionada), O QUE pode entrar e sair (guardrails) e COMO fica registrado (trace sem texto do usuário).

## Decisão
- **Personas como código.** `worker/agents/personas/<id>.md` com frontmatter estrito (id, versão, status, feature, tier, papéis, flag, limites, política de dose). O gerador `worker/scripts/gen-agent-registry.mjs` produz `worker/src/agents/registry.generated.js` (sem `fs` em runtime, zero dependência) e `worker/agents/agents.lock.json` (versão + hash). Editar o `.md` sem regenerar falha no teste; o hash só muda com aumento de versão. Todo trace carrega `persona@versão#hash`.
- **Persona declara `tier`, não modelo.** O modelo vem de `GROQ_MODEL_FAST/SMART` (failover preservado). Agentes usam só o Groq: nunca Workers AI.
- **Guardrails puros** (`worker/src/agents/guardrails/`): regex lineares, sem I/O, IDs estáveis I1–I7 (entrada) e O1–O6 (saída). Recusa de entrada NÃO é erro (`refused: true, rule`) e não gasta cota nem modelo. `clinicalScope.js` é próprio do agente: não reutiliza `questionKind` (da Lia), cujo golden permanece intacto.
- **Dose estrita (decisão do dono, 2026-10-12).** O tutor nunca cita dose numérica: I6 na entrada e O3 na saída, sem exceção na v1.
- **Só maiores de 18 anos (decisão do dono).** A checagem mora num único ponto, `agents/eligibility.js` (`isEligibleAdult`). A plataforma hoje não guarda idade nem faixa etária e não admite menores (flag `minors_enabled` não existe no código; docs/riscos-residuais.md, J7); a premissa é "conta existente = maior", e a função fecha a porta para qualquer marcador futuro de menor.
- **Núcleo no Neon.** Migração 035: flags (todas FALSE), `agent_traces` (sem texto do usuário; retenção de 90 dias no cron), CHECK de formato em `ai_usage_log.feature` (novas features de agente não exigem nova migração).
- **Sem escrita no KV e ≤ ~20 subrequisições por chamada** (plano gratuito da Cloudflare): guardrails < 10 ms de CPU.
- **Fora desta decisão:** memória de longo prazo (opt-in, outro banco), front do tutor e simulação clínica (segue DESLIGADA até existir revisor clínico). Terão ADR próprio.

## Consequências
- Rollback é por flag (`agents_enabled`, `agents_tutor_enabled`): desligadas, a API responde `AGENT_DISABLED` sem custo.
- Mudar prompt de persona exige aumentar a versão e regenerar o registro (PR visível, hash no trace).
- O recall dos guardrails é medido no golden `worker/test/fixtures/agents-golden.json` (meta: ≥ 95% nos "deve recusar", ≤ 5% de falso positivo nos "deve passar"). O golden foi escrito junto com as regras: a avaliação independente com revisão humana (staging) continua necessária antes de ligar para membros.
- Documentação de API: `worker/openapi.yaml` (alfa).
