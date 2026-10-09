# H3 (blog-conteudo): verificacao da plataforma e do futuro

Checagem: 2026-10-09 | base origin/main 3bb5909 | HEAD 3bb5909 (base do checkout; este relatorio entra no commit seguinte)

Leitura do repositorio. Producao: 1 chamada de flags (2026-10-09 03:37:35 UTC) e 2 GET publicos. Sem acesso ao banco: o status das migracoes vem dos docs. Sem npm install, sem testes, sem .env. Todo fato traz arquivo:linha. Deducao leva (inferencia).

## 1. Worker

- Contagem: `grep -cE '^  api[A-Za-z0-9]+:' worker/src/handlers.js` = 117 actions (chaves nas linhas 90 a 270; bloco fecha em :271).
- openapi: `grep -oE 'api[A-Z][A-Za-z0-9]+' worker/openapi.yaml | sort -u | wc -l` = 117. `comm` entre as duas listas nao mostra diferenca. Sem chave duplicada. Sem divergencia.
- Grupos do API_REGISTRY (14 cabecalhos, worker/src/handlers.js:89, 97, 107, 114, 134, 159, 167, 174, 181, 200, 205, 215, 221, 226): autenticacao (publico); verificacao em duas etapas; sessao; perfil (requer sessao); feature flags; eventos; propostas e votacao; tarefas; administracao; perfil de outro membro e fluxograma; conexoes entre membros; denuncias (moderacao); mensageria E2EE (chaves); mensageria E2EE (conversas e mensagens).

### Migracoes sql/001 a 024

| Num | Arquivo | 1 linha (comentario de topo) | Producao (fonte) |
|---|---|---|---|
| 001 | sql/001_schema.sql:8 | Regra de migracoes numeradas e idempotentes (esquema-base) | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 002 | sql/002_functions_and_triggers.sql:8 | Funcoes e gatilhos; pre-requisito: 001 | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 003 | sql/003_rate_limits.sql:9 | Rate limit em tabela, com UPSERT atomico | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 004 | sql/004_event_visibility_guard.sql:9 | Guarda de visibilidade na inscricao em evento (achado de auditoria) | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 005 | sql/005_fase2_schema.sql:7 | Esquema da Fase 2 (status de evento, tarefas por membro) | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 006 | sql/006_event_location.sql:5 | Local do evento (texto livre) | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 007 | sql/007_connections_moderation.sql:9 | Conexoes entre membros e fila de denuncias | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 008 | sql/008_league_org_chart.sql:5 | Cargo e diretoria para o fluxograma da liga | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 009 | sql/009_messaging.sql:5 | Mensageria: chaves X25519, conversas e mensagens cifradas | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 010 | sql/010_messaging_simplify.sql:5 | Remove a frase-secreta da mensageria | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 011 | sql/011_messaging_clear_and_delete.sql:5 | Apagar so para si ou para os dois lados (tabela message_hides) | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 012 | sql/012_learning.sql:7 | Aprendizagem e presenca no banco (antes na planilha) | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 013 | sql/013_clinical_ai.sql:5 | IA da clinica e do laboratorio na Worker; casos clinicos | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 014 | sql/014_atlas_telemetry.sql:4 | Telemetria anonima do Atlas 3D (sem profile_id; retencao de 90 dias) | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 015 | sql/015_ai_usage_provider.sql:4 | Provedor de IA por chamada | APLICADA (docs/ANDAMENTO.md:14; docs/AMBIENTES.md:46) |
| 016 | sql/016_feature_flags.sql:4 | Chaves liga/desliga (feature_flags) | APLICADA em 2026-10-07 (docs/ANDAMENTO.md:26, :179) |
| 017 | sql/017_mfa.sql:4 | Verificacao em duas etapas (TOTP) | APLICADA em 2026-10-07 (docs/ANDAMENTO.md:26) |
| 018 | sql/018_ai_orchestrator.sql:4 | Metricas diarias da IA e cache semantico | APLICADA em 2026-10-07 (docs/ANDAMENTO.md:26) |
| 019 | sql/019_assistant.sql:4 | Lia, guia da plataforma | APLICADA em 2026-10-07 (docs/ANDAMENTO.md:26) |
| 020 | sql/020_rag.sql:4 | Base de conhecimento da Lia (busca hibrida) | PENDENTE (docs/CHANGELOG.md:57; docs/ANDAMENTO.md:6, :69) |
| 021 | sql/021_assistant_feedback.sql:4 | Respostas da Lia e feedback | PENDENTE (docs/CHANGELOG.md:57; docs/ANDAMENTO.md:6, :69) |
| 022 | sql/022_assistant_moderation.sql:4 | Moderacao da Lia (niveis, decaimento e redencao) | PENDENTE (docs/CHANGELOG.md:57; docs/ANDAMENTO.md:6, :69) |
| 023 | sql/023_flags_v2.sql:4 | Flags da renovacao (UX v2, Lia, RAG, feedback, moderacao) | PENDENTE, por ultimo (docs/ANDAMENTO.md:6, :71; docs/AMBIENTES.md:212) |
| 024 | sql/024_indices.sql:4 | Indices da faxina diaria e das series do Inicio | PENDENTE (docs/CHANGELOG.md:57; docs/ANDAMENTO.md:6, :69) |

- Resumo: aplicadas 19 (001 a 019); pendentes 5 (020 a 024). Fonte unica: docs; sem acesso ao banco.
- Nao existe sql/025 no repositorio. O rascunho 025_shared_assets esta na branch feat/v5-f4-acervo (docs/ANDAMENTO.md:127). A 025 e da inscricao nativa e a F4 vira 026 (docs/TIME_CONTRATO.md:65).
- Reversoes: sql/down/015 a 024 (git ls-files). Os down de 020 a 024 removem a linha de schema_migrations (docs/AMBIENTES.md:79).

## 2. Feature flags

| Flag | Publica? | Padrao | Arquivo:linha |
|---|---|---|---|
| ux_v2_enabled | sim (worker/src/services/featureFlagService.js:120) | FALSE na 016; TRUE na 023 se intocada | sql/016_feature_flags.sql:30; sql/023_flags_v2.sql:47, :56-63 |
| chatbot_enabled | sim (featureFlagService.js:120) | FALSE na 019; TRUE na 023 se intocada | sql/019_assistant.sql:21; sql/023_flags_v2.sql:48, :56-63 |
| feedback_enabled | sim (featureFlagService.js:120) | TRUE na 023 | sql/023_flags_v2.sql:50 |
| selection_open | sim (featureFlagService.js:120) | sem semente em sql/; ausente = fechada | featureFlagService.js:119; worker/test/featureFlagService.test.js:110-112 |
| rag_enabled | nao | TRUE na 023 | sql/023_flags_v2.sql:49 |
| moderation_enabled | nao | TRUE na 023 | sql/023_flags_v2.sql:51 |
| mfa_required | nao (reservada) | FALSE na 016 | sql/016_feature_flags.sql:27; featureFlagService.js:131 |
| use_orchestrator | nao (interna) | FALSE na 016 | sql/016_feature_flags.sql:28 |
| nvidia_fallback | nao (interna) | FALSE na 016 | sql/016_feature_flags.sql:29 |
| minors_enabled | nao se aplica | nao existe no codigo | docs/TIME_CONTRATO.md:67; worker/test/featureFlagService.test.js:118 |

- Producao, `apiGetFeatureFlags` (worker/src/handlers.js:135), 2026-10-09 03:37:35 UTC: `{"success":true,"flags":{"ux_v2_enabled":false,"chatbot_enabled":true}}`. A API devolve so flags publicas (featureFlagService.js:120). Flag ausente = desligada (docs/TIME_CONTRATO.md:65).
- minors_enabled: nao existe no codigo (sql/, worker/src/, frontend/). Aparece so em docs/liga/IDENTIDADE_VISUAL.md:94, docs/TIME_CONTRATO.md:67 e como chave de teste em worker/test/featureFlagService.test.js:118.
- docs/FEATURE_FLAGS.md:26-34 descreve os mesmos padroes da tabela.

## 3. Seguranca e privacidade

### CSP por pagina

Paginas HTML rastreadas: 33. Com meta CSP: 31. Sem CSP: frontend/modulos/shared/lia/lab.html e frontend/modulos/anatomia-3d/dev/physiology-demo.html (grep -L).

| Pagina | Origem | script-src (resumo) | Arquivo:linha |
|---|---|---|---|
| frontend/index.html | meta | 'self' | frontend/index.html:6 |
| frontend/liga.html | meta | 'self' | frontend/liga.html:6 |
| 404, privacidade, termos | meta | 'self' | frontend/404.html:6; frontend/privacidade.html:6; frontend/termos.html:6 |
| modulos/clinica, cracha, toxicologia | meta | 'self' | modulos/clinica/index.html:6; modulos/cracha/index.html:6; modulos/toxicologia/index.html:6 |
| modulos/fiscal, modulos/quiz | meta | 'self' + cdn.jsdelivr.net | modulos/fiscal/index.html:6; modulos/quiz/index.html:6 |
| modulos/laboratorio | meta | 'self' + cdn.jsdelivr.net | modulos/laboratorio/index.html:6 |
| modulos/laboratorio/studio | meta | 'self' 'unsafe-eval' + cdn.jsdelivr.net | modulos/laboratorio/studio/index.html:17 |
| modulos/anatomia-3d | meta | 'self' 'wasm-unsafe-eval' | modulos/anatomia-3d/index.html:23 |
| modulos/anatomia-3d/revisao | meta | 'self' | modulos/anatomia-3d/revisao/index.html:9 |
| modulos/shared/lia/preview*.html | meta | 'self' | preview-ondas.html:5; preview-props.html:5; preview.html:5 |
| anatomia-3d/dev (14 paginas) | meta | 'self' na maioria; 'wasm-unsafe-eval' em 4; cdn.jsdelivr.net em molecules-demo e pharmacology-demo | dev/*.html:5-14 (molecules-demo.html:5; pharmacology-demo.html:6) |
| todas (cabecalho) | frontend/_headers | so frame-ancestors 'self'; HSTS max-age=300; nosniff | frontend/_headers:35-40 |

- GET publicos (2026-10-09): https://laift.com.br/ e https://laift.com.br/liga responderam HTTP 200 com `content-security-policy: frame-ancestors 'self'`. A politica de script esta so no meta de cada pagina.

### MFA, E2EE, rate limit, LGPD e backup

- MFA TOTP: RFC 6238 sobre HMAC-SHA1 (worker/src/mfa/totp.js:8, :58). Segredo cifrado com AES-256-GCM; chave derivada por HKDF-SHA256 (worker/src/mfa/secretBox.js:8-12, :43-48; sql/017_mfa.sql:6). Codigos de recuperacao so com hash SHA-256 e pepper, uso unico (sql/017_mfa.sql:10; worker/src/services/mfaService.js:68, :106). Tabelas: sql/017_mfa.sql:15, :23, :32. Testes: worker/test/mfaGate.test.js (7 casos), mfaService.test.js (46), mfaTotp.test.js (17). Front: frontend/mfa.js:6.
- E2EE: ALGORITHM X25519 (frontend/msg-crypto.js:42); PKCS8 com prefixo RFC 8410 (:57-60). Chave por conversa: ECDH X25519 + HKDF-SHA-256 para AES-GCM-256 (:184, :225-226). Cifra AES-GCM com tag de 128 bits (:281, :302). SHA-256 para digest (:325, :334). Chave privada importada como nao extraivel (:174). Tabelas: sql/009_messaging.sql:21, :48, :62, :177; sql/011_messaging_clear_and_delete.sql:45. Sem frase-secreta desde a 010: chave aleatoria no IndexedDB (sql/010_messaging_simplify.sql:7-8; kdf_algorithm 'NONE' em :18). Plano: docs/PLANO_FASE3_MENSAGERIA.md (citado em sql/009_messaging.sql:5).
- Rate limit: tabela rate_limit_buckets com UPSERT atomico (sql/003_rate_limits.sql:9-11, :26). Teste: worker/test/seriesRateLimit.test.js (8 casos; limites de 60/h e 30/h em :82). Por IP so no login (docs/riscos-residuais.md:16).
- LGPD: docs/POLITICA_DE_PRIVACIDADE.md cita base legal art. 7 (:69), transferencia internacional art. 33 (:163), direitos art. 18 (:253), art. 20 (:267) e ANPD (:292). docs/SECURITY.md e docs/TERMOS_DE_USO.md nao citam a LGPD (grep). Nenhum "encarregado" nos tres documentos. Termos e Privacidade sao minutas sem revisao de advogado (docs/riscos-residuais.md:35, J2). Prazos de retencao de audit_logs e error_logs nao declarados na Politica (docs/riscos-residuais.md:37, J4).
- Backup: docs/BACKUP_RESTORE.md:10-12 declara retencao de 7 dias (daily/ no R2), 400 dias (monthly/ no R2) e 90 dias (artefato mensal no GitHub). Workflow .github/workflows/backup.yml: cron diario 05:30 UTC (:26); disparo manual (:27); dump cifrado com age (:89-98); envio ao R2 com conferencia de tamanho (:109-121); copia mensal como artefato (:143); issue de status (:159). Restore drill: tools/backup/restore-drill.sh (existe; docs/BACKUP_RESTORE.md:5). Os segredos vem do GitHub; nomes e valores omitidos.
- Backup "funcionando desde 2026-10-09": NAO CONFIRMADO no repositorio. Nenhuma ocorrencia em docs/BACKUP_RESTORE.md, docs/ANDAMENTO.md, docs/AMBIENTES.md, docs/DEPLOYMENT.md ou backup.yml.

### Riscos abertos (docs/riscos-residuais.md; status diferente de mitigado, resolvido ou fechado)

Contagem: 56 riscos abertos (inclui os com status "Aceito"). Fora da lista: S5, O2, O4, O17, O20, O27, O28, O31, O35, O40, O43 (mitigados, resolvidos ou fechados).

| ID | Risco (1 linha) | Status | Linha |
|---|---|---|---|
| S1 | XSS, com CSP por pagina e innerHTML restrito a safe-dom.js | Aceito | docs/riscos-residuais.md:10 |
| S2 | style-src 'unsafe-inline' para CSS dinamico | Aceito | docs/riscos-residuais.md:11 |
| S3 | unsafe-eval (Estudio) e wasm-unsafe-eval (Atlas), confinados | Aceito | docs/riscos-residuais.md:12 |
| S4 | Modulos em iframe same-origin com acesso a window.top.App | Aceito; subdominio no backlog | docs/riscos-residuais.md:13 |
| S6 | Enumeracao de e-mail por tempo de resposta no login | Aceito | docs/riscos-residuais.md:15 |
| S7 | Rate limit so por IP no login; cotas por conta, IP e global pendentes | A mitigar | docs/riscos-residuais.md:16 |
| S8 | QR de presenca estatico | Aceito; QR rotativo opcional | docs/riscos-residuais.md:17 |
| S9 | Mensageria E2EE perde identidade ao trocar de origem | Aceito | docs/riscos-residuais.md:18 |
| S10 | Repositorio foi publico; clones e forks anteriores existem | Aceito | docs/riscos-residuais.md:19 |
| I1 | Prompt injection | Aceito; corpus de testes na Fase 3 | docs/riscos-residuais.md:24 |
| I2 | IA errar clinicamente | Aceito | docs/riscos-residuais.md:25 |
| I3 | Disjuntor de IA esgotavel de proposito | A mitigar (tokens/dia; cota por IP) | docs/riscos-residuais.md:26 |
| I4 | Cache compartilhado envenenado por termo estranho | A mitigar (TTL de 7 dias) | docs/riscos-residuais.md:27 |
| I5 | Teto do Groq por organizacao | A mitigar (orcamento de tokens) | docs/riscos-residuais.md:28 |
| I6 | Termos da NVIDIA e de multiplas contas Groq nao confirmados | A mitigar (confirmar antes de ligar) | docs/riscos-residuais.md:29 |
| J1 | Coautoria do Claude no historico (registro no INPI) | A mitigar (advogado) | docs/riscos-residuais.md:34 |
| J2 | Termos e Privacidade sao minutas, sem revisao de advogado | A mitigar (Fase J) | docs/riscos-residuais.md:35 |
| J3 | Casos clinicos com dado pessoal de paciente | A mitigar (Fase 4) | docs/riscos-residuais.md:36 |
| J4 | Politica sem prazos de retencao de audit_logs e error_logs | A mitigar (revisao juridica) | docs/riscos-residuais.md:37 |
| J5 | Politica nao cita todo o localStorage gravado pelo front | A mitigar (advogado) | docs/riscos-residuais.md:38 |
| J6 | Codigo de Conduta pede nome real; conflita com acervo de autoria anonima | A mitigar (dono e advogado) | docs/riscos-residuais.md:39 |
| J7 | Menores sem controle de idade; formulario aceita faixa de 12 a 17 | A mitigar (advogado), antes da Etapa 2 | docs/riscos-residuais.md:40 |
| O1 | Restauracao testada ausente | A mitigar (pg_dump cifrado e restore drill) | docs/riscos-residuais.md:45 |
| O3 | Escritas do KV (~1.000/dia no plano gratuito) | A mitigar (Cache API ou Neon) | docs/riscos-residuais.md:59 |
| O5 | Staging publica com o token de producao; escrita no repo altera o workflow | A mitigar (Environment) | docs/riscos-residuais.md:47 |
| O6 | Semgrep so como relatorio; gitleaks bloqueia | A mitigar (triagem da primeira rodada) | docs/riscos-residuais.md:48 |
| O7 | Strix envia trechos do codigo ao provedor (OpenRouter) | A mitigar (privar o repositorio) | docs/riscos-residuais.md:49 |
| O8 | Limite de tentativas de MFA pode atrasar o login legitimo | Aceito | docs/riscos-residuais.md:50 |
| O9 | Chave do OpenRouter acessivel ao Strix em PRs | A mitigar (limite de gasto) | docs/riscos-residuais.md:51 |
| O10 | Contas visitantes podem consumir o orcamento global de tokens | A mitigar (fatia reservada) | docs/riscos-residuais.md:52 |
| O11 | NVIDIA fora do orcamento de tokens (que e do Groq) | A mitigar (orcamento proprio) | docs/riscos-residuais.md:53 |
| O12 | Orquestrador faz ate 3 consultas extras por chamada de IA | Aceito; medir | docs/riscos-residuais.md:54 |
| O13 | Desligar chatbot_enabled em emergencia leva ate 60 s | Aceito | docs/riscos-residuais.md:55 |
| O14 | Cracha: a imagem PNG carrega o QR assinado, sem validade | A mitigar (QR com validade) | docs/riscos-residuais.md:56 |
| O15 | Filtro de injecao de prompt e contornavel por parafrase | Aceito | docs/riscos-residuais.md:57 |
| O16 | Lia anonima cria linha em rate_limit_buckets por IP novo | Aceito | docs/riscos-residuais.md:58 |
| O18 | Claim orfao de redencao (espera de 1 h) | Aceito; gatilho de revisao | docs/riscos-residuais.md:62 |
| O19 | Juiz LLM envia o texto ofensivo ao Groq (e a NVIDIA, se ligada) | Aceito; gatilho de revisao | docs/riscos-residuais.md:63 |
| O21 | Limiar de recuperacao conservador derruba o recall | A mitigar (calibrar) | docs/riscos-residuais.md:65 |
| O22 | assistant_incident em audit_logs, que guarda 730 dias | A mitigar (decisao do dono e do advogado) | docs/riscos-residuais.md:66 |
| O23 | Hash da pergunta reversivel por dicionario | Aceito; gatilho de revisao | docs/riscos-residuais.md:67 |
| O24 | Custo dos embeddings no reindex diario sem teto | A mitigar (teto e responsavel) | docs/riscos-residuais.md:68 |
| O25 | 11 arquivos de teste com PGlite, pesados em maquina de dev | Aceito | docs/riscos-residuais.md:69 |
| O26 | rag_enabled com rollout abaixo de 100% pula a reindexacao | Aceito; gatilho de revisao | docs/riscos-residuais.md:70 |
| O29 | Homologacao aplica todas as pendencias, inclusive a 023 | A mitigar (decidir sobre o segredo) | docs/riscos-residuais.md:73 |
| O30 | Desligamento por SQL sem updated_by nem auditoria | Aceito; antes da primeira 023 em producao | docs/riscos-residuais.md:74 |
| O31b | Modulos ainda carregam bibliotecas do jsDelivr (quiz, laboratorio, studio) | A mitigar (vendorizar) | docs/riscos-residuais.md:76 |
| O32 | Veu do vidro a 97% (efeito quase opaco) | Aceito por acessibilidade | docs/riscos-residuais.md:77 |
| O33 | frontend/app.js com 2.499 linhas (monolito) | A mitigar (extrair modulos) | docs/riscos-residuais.md:78 |
| O34 | Alvo de toque abaixo de 44x44 no Perfil a 375 px | Aceito (2026-10-08) | docs/riscos-residuais.md:79 |
| O36 | Recuperacao so por trigramas, com recall baixo | A mitigar (medir recall hibrido) | docs/riscos-residuais.md:81 |
| O37 | window.App.getState() expoe o sessionToken | Aceito nesta rodada | docs/riscos-residuais.md:82 |
| O38 | Sem noindex em / | Decidido: nao aplicar | docs/riscos-residuais.md:83 |
| O39 | Hero so aparece com duas flags ligadas | Aceito; gatilho de revisao | docs/riscos-residuais.md:84 |
| O41 | Baseline de geometria pode divergir no CI | A mitigar (se divergir) | docs/riscos-residuais.md:86 |
| O42 | lowend.e2e.js nao roda no deploy | Aceito por ora | docs/riscos-residuais.md:87 |

## 4. CI (.github/workflows, 11 arquivos)

| Workflow | Gatilho | O que roda | Arquivo:linha |
|---|---|---|---|
| atlas-assets.yml | manual; push em claude/optimistic-babbage-3pm2em com tools/atlas-pipeline/** | discover, Blender, GLBs, validacao, commit de assets | .github/workflows/atlas-assets.yml:27, :45-50, :205 |
| atlas-content.yml | manual; push na mesma branch com tools/atlas-content/** | Wikidata, Wikipedia, ASCT+B, build, validate-content, lint-pt | .github/workflows/atlas-content.yml:28, :44-49, :193, :210 |
| atlas-e2e.yml | pull_request; manual | node --test de scripts/atlas, build, e2e atlas smoke csp | .github/workflows/atlas-e2e.yml:2, :5-6, :20, :24 |
| atlas-prod-check.yml | manual | content-encoding e medicao no navegador | .github/workflows/atlas-prod-check.yml:6-7, :25, :43 |
| backup.yml | cron diario 05:30 UTC; manual | pg_dump, age, R2, retencao, copia mensal, issue | .github/workflows/backup.yml:24-27, :89, :109, :143, :159 |
| deploy-frontend.yml | push em main (frontend/**); manual | build e publicacao no GitHub Pages | .github/workflows/deploy-frontend.yml:3-9, :34, :37 |
| deploy-frontend-cloudflare.yml | push em main e staging (frontend/**); manual | testes unitarios, e2e csp e smoke, publicacao, smoke | .github/workflows/deploy-frontend-cloudflare.yml:23-29, :58, :73, :131, :142 |
| deploy-staging.yml | push em staging (worker/, sql/, tools/db/); manual | testes do Worker, migracao se houver segredo, publica API e site, smoke | .github/workflows/deploy-staging.yml:23-31, :66, :101, :112, :164, :186 |
| deploy-worker.yml | push em main (worker/**); manual | testes do Worker, publicacao com Cron Trigger, segredo de IA | .github/workflows/deploy-worker.yml:15-21, :48, :84, :90 |
| security.yml | pull_request; push em main, feat/v5-* e staging; cron seg. e qui. 03:00 UTC; manual | auditoria de dependencias, gitleaks, SAST, Trivy, Strix, issue, Slack | .github/workflows/security.yml:37-44, :83, :87, :110, :123, :139, :198, :227 |
| worker-test.yml | pull_request com paths (worker, sql, frontend etc.); manual | testes do Worker, validacao SQL, testes front e tools, copyright, runner de migracoes | .github/workflows/worker-test.yml:7-34, :59, :64, :79, :82, :102 |

Contagens de testes (escritas nos docs, com data):

- 2026-10-05: worker 856 testes (docs/ANDAMENTO.md:167).
- 2026-10-07: worker 997 testes; front 115 unitarios (docs/ANDAMENTO.md:23).
- 2026-10-08 (#38): worker 1424 testes; front 650, 648 verdes (docs/CHANGELOG.md:62; docs/ANDAMENTO.md:54, :56).
- 2026-10-08 (#40, rodada 2): worker 1506 testes; front 899, 897 verdes e 2 falhas so no Windows (docs/CHANGELOG.md:40; docs/ANDAMENTO.md:129).
- Suites do worker: 48 (docs/ANDAMENTO.md:54, :129).
- Arquivos de teste (contagem de arquivos, nao de testes): worker/test tem 50 entradas, das quais 48 *.test.js (ls); frontend/scripts tem 80 arquivos *.test.mjs; tools tem 13 arquivos de teste (git ls-files).

## 5. Divergencias registradas (nao resolvidas)

- F4 e migracao: docs/ANDAMENTO.md:127 chama o rascunho de 025_shared_assets; docs/TIME_CONTRATO.md:65 diz que a 025 e da inscricao nativa e a F4 vira 026. A branch feat/v5-f4-acervo ainda tem o commit ceeb467, "ajustes da migracao 025" (git log).
- PUBLIC_FLAGS: docs/TIME_CONTRATO.md:65 cita featureFlagService.js:119. A constante esta na :120; a :119 e o comentario.
- Ledger: docs/ANDAMENTO.md:14 (2026-10-05) diz que 016 a 018 estao pendentes; docs/ANDAMENTO.md:26 (2026-10-07) diz que estao aplicadas. Usei a segunda.
- chatbot_enabled: docs/ANDAMENTO.md:26 (2026-10-07) diz desligada em producao; a API devolve true as 03:37 UTC de 2026-10-09. Nenhum doc registra quando ou por quem foi ligada.
- Testes do worker: 1424 (docs/CHANGELOG.md:62, #38) e 1506 (docs/CHANGELOG.md:40, #40), ambos de 2026-10-08. docs/ANDAMENTO.md:188 ainda cita 1424 como execucao final. (inferencia: sao PRs diferentes, nao medicoes contraditorias.)
- Termo "relatorios": o item de roadmap "Lia e relatorios ativos" nao tem o termo em docs/ANDAMENTO.md nem em docs/TIME_CONTRATO.md. Usei os recursos das migracoes 020 a 024 (inferencia).

## 6. ROADMAP

Selos: EM PRODUCAO; PRONTO AGUARDANDO ATIVACAO; PLANEJADO; EM ESTUDO. Sem datas nesta secao.

| Item | Selo | Fonte | O que falta |
|---|---|---|---|
| Lia, guia da plataforma (migracao 019) | EM PRODUCAO | sql/019_assistant.sql:21; docs/ANDAMENTO.md:26 | nada no escopo; chatbot_enabled volta true na API (03:37 UTC) |
| RAG, feedback e moderacao da Lia (migracoes 020 a 024) | PRONTO AGUARDANDO ATIVACAO | docs/CHANGELOG.md:57; docs/ANDAMENTO.md:69-71 | aplicar 020 a 022 e 024, reindexar, por ultimo 023; as flags rag_enabled, moderation_enabled e feedback_enabled nascem na 023 (sql/023_flags_v2.sql:49-51) |
| Inscricao nativa na Liga (migracao 025, Etapa 2) | PLANEJADO | docs/TIME_CONTRATO.md:65; docs/liga/fontes/forms-processo-seletivo.md:3 | sem sql/025 no main; sem action de inscricao em worker/src/handlers.js; CTA externo em frontend/liga.js:6 |
| Acervo e busca global (F4) | EM ESTUDO | docs/F4_DECISOES_JURIDICAS.md:123, :145 | decisoes (a) a (e) do dono e do advogado; branches feat/v5-f4-acervo (ceeb467) e feat/v5-f4-arte (f106b86) fora do main; migracao 026 quando retomada |
| Contas de jovens com responsavel | EM ESTUDO | docs/riscos-residuais.md:40; docs/TIME_CONTRATO.md:67 | - |
| Revisao do Atlas (frontend/modulos/anatomia-3d/data/atlas/content) | EM ESTUDO | docs/ATLAS_CONTENT_POLICY.md:60 | 143 auto-draft e 72 legacy-unverified (igual a 143/72); 0 reviewed ou approved; revisao por profissional habilitado |
| Painel de flags (tela admin) | PLANEJADO (inferencia) | worker/src/handlers.js:157 | a action apiAdminSetFeatureFlag existe; nenhum arquivo em frontend/ a chama; nenhum doc planeja a tela |
| Grafico de Progresso | PLANEJADO (inferencia) | frontend/modulos/shared/charts.js:41, :628, :702 | componente radial sem chamador fora de charts.js; nenhuma tela; o termo nao aparece em docs |
| Funcionamento interno da Liga (pagina /liga) | PRONTO AGUARDANDO ATIVACAO | frontend/liga.html:128; frontend/liga.js:6 | flag selection_open ligada (ausente na API de producao); "em breve" nao aparece em frontend/liga.html, frontend/liga.js nem docs/liga |

## NAO CONFIRMADO / NAO ENCONTRADO

- NAO CONFIRMADO: valor em producao das flags nao publicas (rag_enabled, moderation_enabled, mfa_required, use_orchestrator, nvidia_fallback). A API so devolve flags publicas (featureFlagService.js:120; worker/src/handlers.js:135).
- NAO CONFIRMADO: estado real do banco de producao. Sem acesso; o status vem de docs/ANDAMENTO.md:6 e docs/CHANGELOG.md:57.
- NAO CONFIRMADO: quando e por quem chatbot_enabled foi ligada em producao (secao 5).
- NAO CONFIRMADO: backup funcionando desde 2026-10-09. Sem registro de execucao do workflow nem do restore drill no repositorio.
- NAO CONFIRMADO: revisao juridica de Termos e Privacidade (minutas; docs/riscos-residuais.md:35).
- NAO CONFIRMADO: prazo da inscricao nativa (Etapa 2): a definir pela diretoria.
- NAO CONFIRMADO: mitigacao declarada nos riscos (docs/riscos-residuais.md) nao foi verificada no codigo.
- NAO ENCONTRADO: "em breve" em frontend/liga.html, frontend/liga.js e docs/liga/.
- NAO ENCONTRADO: chamada a apiAdminSetFeatureFlag em frontend/ (painel de flags).
- NAO ENCONTRADO: tela ou chamador do componente radial "Progresso" fora de frontend/modulos/shared/charts.js.
- NAO ENCONTRADO: minors_enabled em sql/, worker/src/ ou frontend/.
- NAO ENCONTRADO: LGPD em docs/SECURITY.md e docs/TERMOS_DE_USO.md; "encarregado" nos tres documentos de privacidade e termos.
- NAO ENCONTRADO: semente da flag selection_open em sql/ (sem INSERT).
- NAO ENCONTRADO: action nativa de inscricao da Liga em worker/src/handlers.js.
- NAO ENCONTRADO: o termo "relatorios" como item de produto em docs/ANDAMENTO.md e docs/TIME_CONTRATO.md.
