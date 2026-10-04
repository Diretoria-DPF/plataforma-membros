# Riscos residuais

Riscos que **não** foram eliminados, com a mitigação em vigor e a decisão tomada. Origem: Plano v2.0, reverificado contra o código em 03/10/2026. Revisar a cada trimestre e a cada fase concluída.

Legenda de decisão: **Aceito** (convivemos com ele), **A mitigar** (há ação planejada, com fase), **Resolvido**.

## Segurança da aplicação
| # | Risco | Impacto | Prob. | Mitigação em vigor | Decisão |
|---|---|---|---|---|---|
| S1 | XSS | Alto | Média | CSP por página (`<meta>`), `frame-ancestors 'self'` por cabeçalho, `innerHTML` real só em `modulos/shared/safe-dom.js`, `LaiftDom.safeUrl` | Aceito |
| S2 | `style-src 'unsafe-inline'` | Baixo | Baixa | Necessário para CSS dinâmico dos módulos | Aceito |
| S3 | `unsafe-eval` no Estúdio de laboratório e `wasm-unsafe-eval` no Atlas 3D | Médio | Baixa | Confinados às próprias páginas; a plataforma e os demais módulos não os têm | Aceito |
| S4 | Módulos em iframe **same-origin** (`window.top.App`, mesmo `localStorage`) | Alto | Média | CSP e `innerHTML` zerado; o token de sessão só é anexado pelo host (`callLearningApi`) | Aceito; subdomínio no backlog com gatilho (ver `backlog-futuro.md`) |
| S5 | Clickjacking | Baixo | Baixa | `Content-Security-Policy: frame-ancestors 'self'` em `frontend/_headers` (não se usa `X-Frame-Options: DENY` porque os módulos são iframes próprios) | Resolvido |
| S6 | Enumeração de e-mail por tempo de resposta no login | Médio | Baixa | `crypt()` contra hash fixo quando o e-mail não existe (`authService.js:243`) | Aceito |
| S7 | Rate limit | Médio | Média | Tabela `rate_limit_buckets` com UPSERT atômico; por IP **só no login** | A mitigar: cotas por conta, IP e global em cadastro/reset/IA (Fase 2) |
| S8 | QR de presença estático | Médio | Média | HMAC no servidor + conferência na portaria | Aceito; QR rotativo opcional na Fase 1 |
| S9 | Mensageria E2EE perde a identidade ao trocar de origem | Médio | Certa (uma vez) | Documentado em `docs/MIGRACAO_CLOUDFLARE.md`; chave privada não extraível | Aceito |
| S10 | Repositório foi público: clones e forks anteriores continuam existindo | Baixo | Certa | Código proprietário sob `LICENSE`; sem segredos no repositório | Aceito |

## IA
| # | Risco | Impacto | Prob. | Mitigação em vigor | Decisão |
|---|---|---|---|---|---|
| I1 | Prompt injection | Médio | Alta | Prompts só no servidor, dados do usuário em blocos rotulados, papel das mensagens decidido pelo servidor, saída JSON validada (`ai/validators.js`) | Aceito; corpus de testes na Fase 3 |
| I2 | A IA errar clinicamente | Médio | Média | Aviso na interface; casos gerados entram como `pending` e só vão à biblioteca após aprovação de admin | Aceito |
| I3 | Disjuntor de IA esgotável de propósito | Médio | Baixa | Cota por perfil e `AI_GLOBAL_DAILY_MAX=3000` requisições/24 h | A mitigar: disjuntor em **tokens/dia** e cota por IP (Fases 2–3) |
| I4 | Cache compartilhado envenenado por termo estranho | Baixo | Baixa | `normalizeSynthTerm` reduz o termo a um nome de composto; prompt montado só com ele | A mitigar: TTL de 7 dias para termos não verificados |
| I5 | Teto do Groq: limite é **por organização** (200 mil tokens/dia por modelo no plano gratuito), então várias chaves da mesma organização não multiplicam a cota | Médio | Média | Cotas por perfil; ver `docs/AI_KEYS.md` | A mitigar: orçamento de tokens, cache semântico e NVIDIA como fallback (Fase 3) |
| I6 | Termos de uso do nível gratuito da NVIDIA para produção e de múltiplas contas no Groq não confirmados | Médio | Desconhecida | NVIDIA ficará atrás de flag desligada | A mitigar: confirmar antes de ligar |

## Jurídico e dados
| # | Risco | Impacto | Prob. | Mitigação em vigor | Decisão |
|---|---|---|---|---|---|
| J1 | Coautoria do Claude no histórico (224 commits com autor Claude e 242 com trailer `Co-Authored-By`, de 653) pode afetar o registro de software no INPI | Alto | Média | Histórico **não** será reescrito; a pergunta vai ao advogado antes de qualquer depósito | A mitigar (advogado); INPI adiado |
| J2 | Termos e Privacidade são minutas, sem revisão de advogado | Alto | Média | Textos publicados com aviso de versão | A mitigar (Fase J) |
| J3 | Casos clínicos escritos por usuários podem conter dado pessoal de paciente | Alto | Baixa | Planejado: termo de anonimização, moderação, varredura de PII, RIPD | A mitigar (Fase 4) |
| J4 | Texto da Privacidade ainda não declara os prazos de retenção de `audit_logs` (2 anos) e `error_logs` (30 dias) | Baixo | Certa | Prazos em `worker/src/maintenance.js` e `docs/DEPLOYMENT.md` | A mitigar: incluir na revisão do advogado |

## Operação
| # | Risco | Impacto | Prob. | Mitigação em vigor | Decisão |
|---|---|---|---|---|---|
| O1 | Não há backup nem restauração testada | Alto | Baixa | Branching/PITR do Neon (a confirmar no plano) | A mitigar: `pg_dump` cifrado e teste de restauração (Fase 2) |
| O2 | Ambiente de homologação em `staging.laift.com.br` (código entregue; falta o responsável criar o banco vazio, os segredos e publicar) | Médio | Média | `docs/DEPLOYMENT.md` seção 10; testes de isolamento em `frontend/scripts/staging.test.mjs` | A mitigar: concluir os passos manuais |
| O5 | O workflow de staging publica qualquer branch com o token da Cloudflare de produção; quem tem escrita no repositório pode alterar o workflow ou o `wrangler.toml` numa branch | Médio | Baixa (hoje há um só dono) | Jobs usam o GitHub Environment `staging` (permite restringir branches e exigir aprovação) | A mitigar: configurar o Environment e, se possível, usar token próprio de staging |
| O6 | O Semgrep roda só como relatório (`continue-on-error`); o gitleaks já bloqueia (5 falsos positivos históricos em `.gitleaksignore`) | Baixo | Média | Relatório do Semgrep visível em cada execução | A mitigar: triar a primeira rodada do Semgrep e torná-lo bloqueante (Fase 2) |
| O7 | O Strix (pentest com IA no CI) envia trechos do código ao provedor do modelo (OpenRouter); modelos gratuitos podem registrar o conteúdo. Em repositório público os achados aparecem no log antes de corrigidos | Médio | Média | Código já é público hoje; relatório só vira artefato em repositório privado; modelo trocável por `STRIX_LLM`; sem chave o job é pulado | A mitigar: ao privar o repositório, passar a um modelo pago com política de não retenção |
| O3 | Escritas do KV (~1.000/dia no plano gratuito) | Médio | Média | `cache:sync:<profileId>` é a maior fonte; falha do KV vira no-op | A mitigar: caches novos em Cache API/Neon; medir |
| O4 | Retenção de `audit_logs`/`error_logs` | Baixo | — | Cron diário apaga >2 anos e >30 dias | Resolvido |
