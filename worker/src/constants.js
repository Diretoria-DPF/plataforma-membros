/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * constants.js
 * Espelha exatamente src/Constants.gs (Apps Script). Os valores de enum
 * DEVEM corresponder aos ENUMs definidos em sql/001_schema.sql.
 */
export const ROLES = {
  VISITOR: 'visitor',
  MEMBER: 'member',
  ADMIN: 'admin',
};

export const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  BANNED: 'banned',
};

export const EVENT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CLOSED: 'closed',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};

export const PROPOSAL_STATUS = {
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  VOTING_OPEN: 'voting_open',
  VOTING_CLOSED: 'voting_closed',
};

export const VOTE_CHOICE = {
  YES: 'yes',
  NO: 'no',
  COMPLEMENT: 'complement',
};

export const TASK_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};

export const TOKEN_TYPE = {
  EMAIL_CONFIRMATION: 'email_confirmation',
  PASSWORD_RESET: 'password_reset',
};

export const THEME = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
};

export const CONNECTION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
};

export const REPORT_CATEGORY = {
  HARASSMENT: 'harassment',
  SPAM: 'spam',
  IMPERSONATION: 'impersonation',
  INAPPROPRIATE_CONTENT: 'inappropriate_content',
  OTHER: 'other',
};

export const REPORT_STATUS = {
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
};

// Cargo de liderança da liga — independente de ROLES (permissão de
// plataforma). Só 'diretor' exige uma DIRECTORATE vinculada (ver
// sql/008_league_org_chart.sql).
export const LEAGUE_POSITION = {
  COORDENACAO_GERAL: 'coordenacao_geral',
  PRESIDENTE: 'presidente',
  VICE_PRESIDENTE: 'vice_presidente',
  COORDENADOR: 'coordenador',
  DIRETOR: 'diretor',
};

export const DIRECTORATE = {
  MARKETING: 'marketing',
  CIENTIFICO: 'cientifico',
  ADMINISTRATIVO: 'administrativo',
  FINANCEIRO: 'financeiro',
};

export const LIMITS = {
  PASSWORD_MIN_LENGTH: 8,
  NAME_MIN: 3,
  NAME_MAX: 150,
  PHONE_MIN: 8,
  PHONE_MAX: 30,
  CITY_MAX: 120,
  EDUCATION_MAX: 120,
  TITLE_MIN: 3,
  TITLE_MAX: 150,
  DESCRIPTION_MIN: 5,
  DESCRIPTION_MAX: 5000,
  LOCATION_MAX: 255,
  TASK_DESCRIPTION_MIN: 3,
  COMPLEMENT_MIN: 3,
  COMPLEMENT_MAX: 700,
  FEEDBACK_MIN: 3,
  FEEDBACK_MAX: 2000,
  SESSION_TTL_MINUTES: 30,
  SESSION_ABSOLUTE_MAX_HOURS: 12,
  EMAIL_TOKEN_TTL_HOURS: 48,
  RESET_TOKEN_TTL_MINUTES: 60,
  ADMIN_LIST_PAGE_SIZE: 25,
  AUDIT_LIST_PAGE_SIZE: 50,
  REPORT_DETAILS_MAX: 1000,
  REPORT_EVIDENCE_MAX: 4000,
  REPORT_LIST_PAGE_SIZE: 25,
  DECLINE_COOLDOWN_DAYS: 30,

  // ---- Mensageria E2EE (Fase 3d/3e — docs/PLANO_FASE3_MENSAGERIA.md,
  // seção "Requisito novo 1 e 2" acrescentada em 2026-09-25) ----
  // Texto puro só existe DECIFRADO no navegador — o servidor nunca vê o
  // corpo da mensagem. MESSAGE_MAX_LENGTH é o limite de caracteres do
  // texto claro, aplicado só no cliente antes de cifrar (documentado
  // aqui para existir uma única fonte da verdade do número, igual ao
  // resto do arquivo). MESSAGE_CIPHERTEXT_MAX é o limite que o SERVIDOR
  // de fato aplica (bytes base64url do resultado do AES-GCM, incluindo a
  // tag de 16 bytes) e também é o CHECK de sql/009_messaging.sql.
  MESSAGE_MAX_LENGTH: 2000,
  MESSAGE_CIPHERTEXT_MAX: 12000,
  MESSAGE_PAGE_SIZE: 30,
  KDF_MIN_ITERATIONS: 600000,
  MESSAGING_PUBLIC_KEY_MIN_LEN: 40,
  MESSAGING_PUBLIC_KEY_MAX_LEN: 200,
  MESSAGING_SALT_MIN_LEN: 16,
  MESSAGING_SALT_MAX_LEN: 64,

  // Silenciamento progressivo (Requisito novo 2): até MESSAGE_BURST_MAX
  // mensagens dentro de MESSAGE_BURST_WINDOW_SECONDS são permitidas; ao
  // ultrapassar, o remetente é silenciado por MESSAGE_MUTE_BASE_MINUTES,
  // e cada reincidência (voltar a estourar o limite depois de já ter
  // sido silenciado) multiplica a duração por MESSAGE_MUTE_MULTIPLIER —
  // ver a função apply_message_penalty em sql/009_messaging.sql, que é a
  // autoridade real (estado persistido no servidor, nunca no cliente).
  MESSAGE_BURST_MAX: 10,
  MESSAGE_BURST_WINDOW_SECONDS: 60,
  MESSAGE_MUTE_BASE_MINUTES: 30,
  MESSAGE_MUTE_MULTIPLIER: 3,
};

// Atualize sempre que docs/TERMOS_DE_USO.md ou
// docs/POLITICA_DE_PRIVACIDADE.md mudar de forma material — e replique em
// frontend/index.html (texto fixo, sem template de servidor).
export const LEGAL_VERSIONS = {
  TERMS: '2026-09-25',
  PRIVACY: '2026-10-08',
};

export const RATE_LIMITS = {
  LOGIN: { MAX_ATTEMPTS: 8, WINDOW_SECONDS: 900 },
  // Achado M2 da auditoria de 2026-09-25: LOGIN acima só limita por e-mail,
  // sem teto agregado nem por IP — alguém pode rotacionar e-mails contra
  // uma única origem sem nunca bater o limite por-conta. LOGIN_GLOBAL cobre
  // toda a plataforma (generoso o bastante pro uso legítimo de uma liga
  // pequena); LOGIN_IP é por IP de origem (CF-Connecting-IP), mais folgado
  // que o por-e-mail porque um IP pode ser compartilhado (NAT/wifi de
  // campus) por vários membros reais.
  LOGIN_GLOBAL: { MAX_ATTEMPTS: 60, WINDOW_SECONDS: 900 },
  LOGIN_IP: { MAX_ATTEMPTS: 15, WINDOW_SECONDS: 900 },
  REGISTER: { MAX_ATTEMPTS: 5, WINDOW_SECONDS: 3600 },
  CONFIRM_EMAIL: { MAX_ATTEMPTS: 10, WINDOW_SECONDS: 900 },
  RESET_REQUEST: { MAX_ATTEMPTS: 5, WINDOW_SECONDS: 3600 },
  RESET_CONFIRM: { MAX_ATTEMPTS: 10, WINDOW_SECONDS: 900 },
  REGISTER_GLOBAL: { MAX_ATTEMPTS: 30, WINDOW_SECONDS: 3600 },
  RESET_REQUEST_GLOBAL: { MAX_ATTEMPTS: 30, WINDOW_SECONDS: 3600 },
  // Uso normal é um punhado de pedidos de conexão no total, não por dia —
  // limite dimensionado para uma liga pequena (revisão de segurança da
  // Fase 3, achado #4), não para uma rede social genérica.
  CONNECTION_REQUEST: { MAX_ATTEMPTS: 8, WINDOW_SECONDS: 604800 },
  REPORT: { MAX_ATTEMPTS: 10, WINDOW_SECONDS: 86400 },
  // Publicação/rotação de chave de mensageria — não é o rate limit de
  // ENVIO de mensagem (esse é o silenciamento progressivo, ver LIMITS
  // acima e apply_message_penalty).
  KEY_PUBLISH: { MAX_ATTEMPTS: 5, WINDOW_SECONDS: 86400 },
  // Fase 2 — camadas por IP além das por conta e globais já existentes.
  // IP compartilhado (NAT de campus) é comum, então os tetos são folgados
  // para uso legítimo e curtos para força bruta.
  // 40/h: uma turma ou evento atrás do mesmo NAT se cadastra junta sem barrar;
  // um script, que faz centenas, é barrado (e o teto global continua valendo).
  REGISTER_IP: { MAX_ATTEMPTS: 40, WINDOW_SECONDS: 3600 },
  RESET_REQUEST_IP: { MAX_ATTEMPTS: 40, WINDOW_SECONDS: 3600 },
  // Verificação em duas etapas (mfaService.js).
  MFA_VERIFY: { MAX_ATTEMPTS: 10, WINDOW_SECONDS: 900 },
  MFA_VERIFY_IP: { MAX_ATTEMPTS: 30, WINDOW_SECONDS: 900 },
  MFA_ENROLL: { MAX_ATTEMPTS: 5, WINDOW_SECONDS: 3600 },
  // Consultas ao cache semântico da IA (acerto não gasta cota, então tem teto próprio).
  AI_CACHE_LOOKUP: { MAX_ATTEMPTS: 120, WINDOW_SECONDS: 3600 },
  // Lia (guia da plataforma). Resposta por regra não gasta IA, então o teto é
  // por hora e não por cota: 60 mensagens/h por pessoa logada; sem login, por
  // IP (NAT de campus é comum, então 30/h dá para uma turma conversar).
  ASSISTANT_CHAT: { MAX_ATTEMPTS: 60, WINDOW_SECONDS: 3600 },
  ASSISTANT_CHAT_IP: { MAX_ATTEMPTS: 30, WINDOW_SECONDS: 3600 },
  ASSISTANT_FEEDBACK: { MAX_ATTEMPTS: 30, WINDOW_SECONDS: 3600 },
  ASSISTANT_REINDEX: { MAX_ATTEMPTS: 5, WINDOW_SECONDS: 3600 },
  // Gestão (confirmar cadastro, novos códigos, reautenticação): bucket separado
  // do MFA_VERIFY, para o login legítimo não ser travado por quem gerencia.
  MFA_MANAGE: { MAX_ATTEMPTS: 10, WINDOW_SECONDS: 900 },
  MFA_DISABLE: { MAX_ATTEMPTS: 5, WINDOW_SECONDS: 3600 },
  MFA_ADMIN_RESET: { MAX_ATTEMPTS: 10, WINDOW_SECONDS: 3600 },
};

export const GENERIC_ERROR_MESSAGE = 'Não foi possível concluir a operação. Tente novamente em instantes.';
export const GENERIC_AUTH_FAILURE_MESSAGE = 'E-mail ou senha inválidos, ou conta ainda não confirmada.';

// Fase 2 — Dados & Presença (docs/PLANO_FASES_2_3_4.md, Contratos 1 e 2).
// Acrescentado por Object.assign num bloco próprio, no fim do arquivo, para
// não reformatar os objetos acima (arquivo compartilhado com a Equipe 3).
Object.assign(LIMITS, {
  // Simulados: 0 ≤ acertos ≤ total ≤ LEARN_QUIZ_MAX_TOTAL (mesmo teto do
  // CHECK learning_attempts_score_coherence em sql/012_learning.sql).
  LEARN_QUIZ_MAX_TOTAL: 500,
  // Duração de uma atividade: 24 h é folga de sobra para um simulado
  // deixado aberto; acima disso é dado corrompido/forjado (mesmo CHECK no banco).
  LEARN_DURATION_MAX_SECONDS: 86400,
  LEARN_LIST_MAX_ITEMS: 20,       // topics
  // Reagentes: a bancada do laboratório envia até 30 espécies por formulação
  // (chaves internas como AcidoSalicilico_s) — integração Fase 2 × Fase 4.
  LEARN_REAGENTS_MAX_ITEMS: 30,
  LEARN_LIST_ITEM_MAX: 80,        // caracteres por tópico/reagente
  LEARN_PRODUCT_MAX: 120,
  LEARN_OBSERVATION_MAX: 500,
  LEARN_DETAILS_MAX_BYTES: 8192,  // details serializado (CHECK no banco)
  ATTENDANCE_SEARCH_MIN: 2,
  ATTENDANCE_SEARCH_MAX: 100,
  ATTENDANCE_SEARCH_LIMIT: 50,
  ATTENDANCE_LIST_LIMIT: 500,     // inscritos de um evento de uma vez (lista/CSV)
  ATTENDANCE_EVENTS_LIMIT: 50,
  ATTENDANCE_BADGES_MAX: 200,     // crachás por impressão em lote
});

Object.assign(RATE_LIMITS, {
  // Gravações de aprendizagem, por perfil. Um simulado leva minutos; 120/h
  // cobre quem faz vários seguidos e ainda barra um script inflando o
  // próprio desempenho ou a tabela.
  LEARN_SUBMIT: { MAX_ATTEMPTS: 120, WINDOW_SECONDS: 3600 },
  LEARN_LAB: { MAX_ATTEMPTS: 120, WINDOW_SECONDS: 3600 },
  // Check-in pelo terminal fiscal, por admin: uma portaria cheia faz um
  // check-in a cada poucos segundos — 900/h fica bem acima disso e ainda
  // limita um token de admin vazado usado para varrer assinaturas de QR.
  ATTENDANCE_CHECKIN: { MAX_ATTEMPTS: 900, WINDOW_SECONDS: 3600 },
});

export const LEARNING_MODULES = ['farmacologia', 'toxicologia', 'clinica', 'laboratorio', 'anatomia'];
export const LEARNING_QUIZ_MODULES = ['farmacologia', 'toxicologia', 'anatomia'];
export const ATTENDANCE_CHECKIN_METHODS = ['qr', 'manual', 'lista'];
// Status em que o terminal fiscal aceita check-in (o gatilho do banco
// aplica a mesma regra à inscrição criada na porta).
export const ATTENDANCE_OPEN_STATUSES = ['published', 'in_progress'];

// Fase 3 — IA na Worker (Groq) e clínica virtual (docs/PLANO_FASES_2_3_4.md,
// Contrato 2, e docs/FASE_3_IA_CLINICA.md). Todo número de custo/abuso da IA
// mora aqui, numa fonte só, para o responsável ajustar sem caçar no código.
export const AI_FEATURE = {
  CHAT: 'chat',
  EVALUATE: 'evaluate',
  GENERATE_CASE: 'generate_case',
  LAB_PRECEPTOR: 'lab_preceptor',
  ASSISTANT: 'assistant',
  HEALTH: 'health',
};

// Cota diária POR PESSOA (janela de 24 h do rate_limit_buckets), por recurso
// e papel. Visitante tem cota menor (decisão do responsável: IA para todos os
// logados, com cota diária). Valores iniciais do plano.
// Recalibradas (Fase 3) pelo ORÇAMENTO DE TOKENS: o Groq gratuito dá ~200 mil
// tokens/dia por modelo (~600 mil nos três) para a ORGANIZAÇÃO, e uma troca de
// chat gasta ~1,2 mil. Com ~25 pessoas ativas por dia, 40 mensagens de chat
// por membro já fecham a conta; os valores antigos (150) estourariam o teto
// com 4 pessoas. O limite que vale para todos é AI_DAILY_TOKEN_BUDGET.
export const AI_QUOTAS = {
  chat: { visitor: 15, member: 40, admin: 100 },
  evaluate: { visitor: 5, member: 10, admin: 40 },
  generate_case: { visitor: 2, member: 4, admin: 20 },
  lab_preceptor: { visitor: 10, member: 30, admin: 100 },
  // Lia: só a pergunta SEM intenção conhecida chega à IA (o resto é regra, sem custo).
  // Visitante e quem não tem login recebem só a base fixa (cota 0).
  assistant: { visitor: 0, member: 25, admin: 100 },
};
export const AI_QUOTA_WINDOW_SECONDS = 86400;

// Disjuntor global de custo: teto de chamadas à IA somando TODA a
// plataforma em 24 h. Protege o pool de chaves (e a conta) de um abuso
// distribuído entre muitas contas que ficaria abaixo de cada cota individual.
export const AI_GLOBAL_DAILY_MAX = 3000;

// Orçamento de TOKENS por dia (janela móvel de 24 h, só o Groq): ~75% do teto
// gratuito (~600 mil nos três modelos), deixando folga para picos e para a
// janela móvel do provedor. Passou disso, o orquestrador não chama o provedor
// (usa o cache, ou avisa que a IA volta amanhã). Ajustável sem deploy pela
// variável AI_DAILY_TOKEN_BUDGET.
export const AI_DAILY_TOKEN_BUDGET = 450000;
export const AI_BUDGET_REFRESH_MS = 30000; // reconsulta o uso a cada 30 s por instância

// Cache semântico (pg_trgm). Só pergunta genérica, sem dado pessoal.
// Perguntas CURTAS e conceituais: texto longo pode carregar dado pessoal ou
// instruções para a IA, e a resposta guardada é lida por outras pessoas.
export const AI_CACHE = {
  SIMILARITY: 0.85,        // acerto normal
  STALE_SIMILARITY: 0.8,   // aproximado, só quando o provedor está indisponível (mesmas guardas)
  LENGTH_RATIO_MIN: 0.75,  // pergunta parecida precisa ter tamanho parecido (cauda de instrução não passa)
  TTL_DAYS: 7,
  QUESTION_MIN: 8,
  QUESTION_MAX: 150,       // acima disso NÃO é cacheável (não é truncado)
  ANSWER_MAX: 8000,
  MAX_ROWS_PER_FEATURE: 2000,
};

// Alertas por e-mail aos administradores (cron diário, maintenance.js).
export const AI_ALERTS = {
  BUDGET_PCT: 80,           // tokens do dia acima de 80% do orçamento
  HIT_RATE_MIN_PCT: 30,     // taxa de acerto do cache abaixo disto por 3 dias
  HIT_RATE_DAYS: 3,
  RATE_LIMITED_MAX_PCT: 5,  // mais de 5% das chamadas com 429
  MIN_CALLS: 20,            // amostra mínima para um alerta fazer sentido
};

// Teste de saúde das chaves (painel admin): cada execução faz uma chamada
// por chave ao Groq, então também tem limite, mesmo sendo só para admin.
export const AI_HEALTH_RATE_LIMIT = { MAX_ATTEMPTS: 20, WINDOW_SECONDS: 3600 };

export const AI_LIMITS = {
  QUESTION_MAX: 500,          // pergunta ao paciente / ao preceptor do laboratório
  HISTORY_MAX_TURNS: 8,       // turnos de histórico enviados ao modelo
  HISTORY_TURN_MAX: 500,      // caracteres por turno de histórico (o excesso é cortado)
  CONTEXT_MAX_BYTES: 4096,    // contexto do caso (paciente) / da bancada (laboratório)
  ANSWER_KEY_MAX_BYTES: 4096, // gabarito enviado pelo cliente (casos embutidos/gerados)
  ATTENDANCE_TEXT_MAX: 2000,  // diagnóstico e conduta do estudante
  ATTENDANCE_LIST_MAX: 30,    // exames solicitados / perguntas feitas
  TOPIC_MIN: 3,
  TOPIC_MAX: 200,             // tema pedido para gerar um caso
  CASE_ID_MAX: 80,
  SYNTH_TERM_MIN: 3,
  SYNTH_TERM_MAX: 60,
  LIBRARY_MAX: 100,           // casos devolvidos pela biblioteca
  PENDING_MAX: 50,            // casos na fila de moderação
  REPLY_MAX: 2000,            // fala do paciente / resposta do preceptor (o excesso é cortado)
};

// Onda 3.5 (A.2) — telemetria anônima do Atlas 3D (sql/014_atlas_telemetry.sql).
// Cada evento só pode levar as chaves listadas aqui, com o tipo indicado
// ('n' número, 's' texto curto, 'b' booleano); o resto é descartado.
export const ATLAS_TELEMETRY = {
  BATCH_MAX: 50,
  SESSION_ID_RE: /^[A-Za-z0-9_-]{8,40}$/,
  SID_RE: /^[A-Za-z0-9:_.-]{1,120}$/,
  TEXT_MAX: 120,
  RETENTION_DAYS: 90,
  EVENTS: {
    app_open: { mode: 's', viewport: 's', offline: 'b' },
    structure_view: { source: 's' },
    quiz_finish: { correct: 'n', total: 'n', system: 's' },
    search: { len: 'n', results: 'n' },
    error_js: { code: 's', message: 's' },
    session_end: { durationS: 'n', views: 'n' },
  },
  STATS_DAYS: [7, 30],
};

Object.assign(RATE_LIMITS, {
  // Um lote a cada 30 s por aba aberta, mais o envio ao fechar: 240/h por perfil.
  ATLAS_TELEMETRY: { MAX_ATTEMPTS: 240, WINDOW_SECONDS: 3600 },
  ATLAS_TELEMETRY_STATS: { MAX_ATTEMPTS: 60, WINDOW_SECONDS: 3600 },
});

// ---- Lia: RAG, feedback e moderação (sql/020-022; ADR 0004 e 0005) ----
// Embedding via Workers AI. A dimensão está no SQL (vector(1024)): trocar de modelo exige nova migração.
export const EMBEDDING_MODEL = '@cf/baai/bge-m3';
export const EMBEDDING_DIM = 1024;
export const RAG = {
  TOP_K: 4,                 // trechos que entram no prompt
  CANDIDATES: 8,            // candidatos de cada busca (vetor e trigramas) antes de fundir
  MIN_TRIGRAM_SCORE: 0.12,  // similaridade mínima de trigramas
  MIN_VECTOR_SCORE: 0.45,   // similaridade de cosseno mínima
  RRF_K: 60,                // constante da fusão por posição (Reciprocal Rank Fusion)
  EMBED_BATCH: 16,          // textos por chamada ao modelo na reindexação
  CONTEXT_CHARS: 900,       // máximo de caracteres de cada trecho no prompt
};

export const FEEDBACK = {
  COMMENT_MAX: 500,
  RATINGS: ['up', 'down'],
  CATEGORIES: ['incorreta', 'incompleta', 'confusa', 'ofensiva', 'outra'],
  STATUSES: ['new', 'reviewed', 'dismissed'],
  PAGE_SIZE: 25,
  ANONYMIZE_AFTER_DAYS: 90,   // comentário: hash irreversível + texto apagado
  PURGE_AFTER_DAYS: 365,      // registro removido
};

export const MODERATION = {
  MAX_LEVEL: 3,
  DECAY_DAYS: 30,             // -1 nível a cada 30 dias sem incidente
  SUSPENSION_HOURS: 24,
  REDEEM_RETRY_SECONDS: 3600, // nova tentativa de redenção após 1 h
  REDEEM_MIN_CHARS: 40,
  REDEEM_MAX_CHARS: 600,
  PAGE_SIZE: 25,
};

// Séries do Início (timeseriesService.js). 6m são 6 buckets mensais (mês corrente incluso).
// study_hours = soma de learning_attempts.duration_seconds em horas (2 casas).
export const TIMESERIES = {
  RANGES: {
    '30d': { granularity: 'day', count: 30 },
    '90d': { granularity: 'day', count: 90 },
    '6m': { granularity: 'month', count: 6 },
    '12m': { granularity: 'week', count: 52 },
  },
  DEFAULT_RANGE: '30d',
  METRICS: ['activity', 'events', 'learning', 'tasks', 'study_hours'],
  DEFAULT_METRIC: 'activity',
  CACHE_TTL_SECONDS: 300,
};

// ---- Lia: feedback (D2), painel de satisfação e reindexação da base (D1) ----
// Página e comentário usam FEEDBACK (acima). Aqui só o que o painel e a reindexação precisam.
export const FEEDBACK_STATS = {
  DAYS_DEFAULT: 30,   // janela padrão do painel de satisfação
  DAYS_MAX: 365,      // janela máxima aceita na consulta agregada
  LIST_MAX: 100,      // teto de itens por página na lista do admin
};

Object.assign(RATE_LIMITS, {
  // Reindexação reescreve kb_chunks e gasta embeddings: uma por minuto, na instância toda.
  // (ASSISTANT_REINDEX, de 5/h, continua valendo para o que já existia; não é usado aqui.)
  ASSISTANT_REINDEX_MINUTE: { MAX_ATTEMPTS: 1, WINDOW_SECONDS: 60 },
});

// ---- Lia: retenção de mensagens e incidentes (ADR 0005; limpeza em maintenance.js) ----
// Comentário e avaliação usam FEEDBACK (acima). Pelo CASCADE de sql/021, a avaliação sai junto
// com a resposta da Lia a que se refere (ASSISTANT_MESSAGES), antes dos 365 dias de FEEDBACK.
export const ASSISTANT_RETENTION = {
  MESSAGES_PURGE_AFTER_DAYS: 180,   // resposta registrada da Lia (assistant_messages)
  INCIDENTS_PURGE_AFTER_DAYS: 365,  // incidente de moderação, sem texto (assistant_incidents)
};

// ---- Séries do Início: rate limit por perfil (revisão de segurança, S2) ----
// Cada chamada conta, inclusive cache hit. Sem KV (staging) uma chamada faz 8
// consultas ao banco, e o plano gratuito do KV aceita 1.000 escritas por dia:
// um membro em loop esgotaria os dois. A chave é a sessão (profileId), nunca IP.
Object.assign(RATE_LIMITS, {
  TIMESERIES: { MAX_ATTEMPTS: 60, WINDOW_SECONDS: 3600 },
  DASHBOARD_SERIES: { MAX_ATTEMPTS: 30, WINDOW_SECONDS: 3600 },
});
