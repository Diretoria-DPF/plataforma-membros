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
