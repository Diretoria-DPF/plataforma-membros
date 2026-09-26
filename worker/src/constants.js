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
  PRIVACY: '2026-09-25',
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
  LEARN_LIST_MAX_ITEMS: 20,       // topics / reagents
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
