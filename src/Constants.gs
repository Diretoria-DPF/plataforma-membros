/**
 * Constants.gs
 * Constantes compartilhadas por toda a aplicação. Os valores de enum aqui
 * DEVEM corresponder exatamente aos ENUMs definidos em sql/001_schema.sql.
 */
App.Constants = {
  ROLES: {
    VISITOR: 'visitor',
    MEMBER: 'member',
    ADMIN: 'admin',
  },
  ACCOUNT_STATUS: {
    ACTIVE: 'active',
    BANNED: 'banned',
  },
  EVENT_STATUS: {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    CLOSED: 'closed',
    COMPLETED: 'completed',
    ARCHIVED: 'archived',
  },
  EVENT_VISIBILITY: {
    PUBLIC: 'public',
    AUTHENTICATED: 'authenticated',
    MEMBERS: 'members',
  },
  PROPOSAL_STATUS: {
    SUBMITTED: 'submitted',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    VOTING_OPEN: 'voting_open',
    VOTING_CLOSED: 'voting_closed',
  },
  VOTE_CHOICE: {
    YES: 'yes',
    NO: 'no',
    COMPLEMENT: 'complement',
  },
  TASK_STATUS: {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    COMPLETED: 'completed',
    ARCHIVED: 'archived',
  },
  TOKEN_TYPE: {
    EMAIL_CONFIRMATION: 'email_confirmation',
    PASSWORD_RESET: 'password_reset',
  },
  THEME: {
    LIGHT: 'light',
    DARK: 'dark',
    SYSTEM: 'system',
  },
  DENSITY: {
    STANDARD: 'standard',
    COMPACT: 'compact',
  },
  LIMITS: {
    PASSWORD_MIN_LENGTH: 12,
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
    TASK_DESCRIPTION_MIN: 3,
    COMPLEMENT_MIN: 3,
    COMPLEMENT_MAX: 700,
    FEEDBACK_MIN: 3,
    FEEDBACK_MAX: 2000,
    SESSION_TTL_MINUTES: 30,
    EMAIL_TOKEN_TTL_HOURS: 48,
    RESET_TOKEN_TTL_MINUTES: 60,
    ADMIN_LIST_PAGE_SIZE: 25,
    AUDIT_LIST_PAGE_SIZE: 50,
  },
  // Atualize estas versões sempre que o texto de docs/TERMOS_DE_USO.md ou
  // docs/POLITICA_DE_PRIVACIDADE.md mudar de forma material.
  LEGAL_VERSIONS: {
    TERMS: '2026-09-24',
    PRIVACY: '2026-09-24',
  },
  RATE_LIMITS: {
    LOGIN: { MAX_ATTEMPTS: 8, WINDOW_SECONDS: 900 },
    REGISTER: { MAX_ATTEMPTS: 5, WINDOW_SECONDS: 3600 },
    CONFIRM_EMAIL: { MAX_ATTEMPTS: 10, WINDOW_SECONDS: 900 },
    RESET_REQUEST: { MAX_ATTEMPTS: 5, WINDOW_SECONDS: 3600 },
    RESET_CONFIRM: { MAX_ATTEMPTS: 10, WINDOW_SECONDS: 900 },
  },
  GENERIC_ERROR_MESSAGE: 'Não foi possível concluir a operação. Tente novamente em instantes.',
  GENERIC_AUTH_FAILURE_MESSAGE: 'E-mail ou senha inválidos, ou conta ainda não confirmada.',
};
