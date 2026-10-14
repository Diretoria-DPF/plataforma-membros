/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * confirmationService.js
 * Saídas do cadastro (SEC-02): reenvio do link de confirmação, recadastro de e-mail já existente e teto
 * diário de e-mails transacionais. Regras:
 *  - resposta UNIFORME: e-mail inexistente, já confirmado ou aguardando confirmação recebem a mesma mensagem
 *    e passam pelas mesmas consultas; o e-mail sai pelo env.waitUntil (depois da resposta), então o tempo de
 *    resposta não revela se houve envio;
 *  - o reenvio só vale para conta existente, ativa e NÃO confirmada; o token anterior é apagado e o novo
 *    (48 h) é guardado só como hash, igual ao do cadastro;
 *  - recadastro de conta não confirmada vira reenvio e NÃO altera a conta existente;
 *  - teto diário (EMAIL_DAILY_MAX, ~80% do plano da Brevo): acima dele, "tente mais tarde" para todo mundo
 *    e uma auditoria por janela; falha de envio vai a error_logs só com o status HTTP (sem e-mail, sem corpo).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { sendEmail } from '../mailer.js';

export const REGISTER_SUCCESS_MESSAGE =
  'Enviamos um e-mail de confirmação se o endereço puder ser cadastrado. Confira a caixa de entrada e o spam.';
export const RESEND_GENERIC_MESSAGE =
  'Se houver um cadastro aguardando confirmação para este e-mail, enviamos um novo link. Confira a caixa de entrada e o spam.';
export const EMAIL_QUOTA_MESSAGE = 'O envio de e-mails atingiu o limite de hoje. Tente novamente mais tarde.';
export const RESEND_COOLDOWN_MESSAGE = 'Aguarde 2 minutos antes de pedir um novo e-mail de confirmação.';

const BCRYPT_COST = 10;
const L = C.RESEND_RATE_LIMITS;
const Q = C.EMAIL_QUOTA;

/** Teto diário efetivo: a variável EMAIL_DAILY_MAX do Worker, se for um inteiro positivo; senão a constante. */
export function emailDailyMax(env) {
  const configured = Number(env && env.EMAIL_DAILY_MAX);
  return Number.isInteger(configured) && configured > 0 ? configured : C.EMAIL_DAILY_MAX;
}

/** Barra ANTES de qualquer consulta por e-mail (assim o aviso é igual para qualquer endereço). Só lê o contador. */
export async function assertEmailQuotaAvailable(sql, env) {
  const used = await S.peekRateLimit(sql, Q.BUCKET, Q.ID, Q.WINDOW_SECONDS);
  if (used >= emailDailyMax(env)) throw E.RateLimitError(EMAIL_QUOTA_MESSAGE);
}

/** Conta um e-mail no balde diário; ao atingir o teto, grava UMA auditoria por janela. Devolve se ainda cabe. */
async function consumeEmailQuota(sql, env, correlationId) {
  const max = emailDailyMax(env);
  const used = await S.countRateLimitAttempt(sql, Q.BUCKET, Q.ID, Q.WINDOW_SECONDS);
  if (used === max) {
    await Logging.logAudit(sql, correlationId, null, 'EMAIL_QUOTA_REACHED', 'rate_limit', null, 'failure', { max, windowSeconds: Q.WINDOW_SECONDS });
  }
  return used <= max;
}

/**
 * Envia um e-mail transacional respeitando o teto diário. `kind` é o código do erro em error_logs. Com
 * env.waitUntil (requisição real) o envio sai depois da resposta; sem ele (testes, scripts), espera aqui.
 */
export function deliverEmail(sql, env, correlationId, kind, message, profileId) {
  const job = (async () => {
    if (!(await consumeEmailQuota(sql, env, correlationId))) {
      await Logging.logError(sql, correlationId, 'MAIL_QUOTA_EXCEEDED', 'E-mail não enviado: teto diário de envios atingido.', { kind });
      return;
    }
    try {
      await sendEmail(env, message);
    } catch (mailErr) {
      // Nunca o texto do erro: a resposta da Brevo pode repetir o endereço do destinatário.
      await Logging.logError(sql, correlationId, kind, 'Falha ao enviar e-mail.', {
        profileId: profileId || null,
        status: (mailErr && mailErr.status) || null,
      });
    }
  })();
  if (env && typeof env.waitUntil === 'function') {
    env.waitUntil(job.catch(() => undefined));
    return Promise.resolve();
  }
  return job;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HTML_OPEN = '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">';
const NOT_YOU = 'Se você não reconhece este cadastro, não clique no link: ele expira sozinho e o cadastro não confirmado é apagado em '
  + 'poucos dias. Se o e-mail é seu e alguém o usou, use "Esqueci minha senha" na tela de entrada para assumir a conta.';

/** E-mail com o link de confirmação. Mostra o nome de usuário, para a pessoa reconhecer (ou não) o cadastro. */
export function confirmationMessage(env, to, fullName, username, rawToken) {
  const link = env.APP_BASE_URL + '?mode=confirm&token=' + encodeURIComponent(rawToken);
  const hours = C.LIMITS.EMAIL_TOKEN_TTL_HOURS;
  const who = username ? ' (usuário @' + username + ')' : '';
  return {
    to,
    subject: 'Confirme sua conta — ' + env.MAIL_FROM_NAME,
    text: 'Olá, ' + fullName + who + '. Confirme sua conta acessando: ' + link + ' (o link expira em ' + hours + ' horas). ' + NOT_YOU,
    html: HTML_OPEN + '<h2>Confirme sua conta</h2>'
      + '<p>Olá, ' + escapeHtml(fullName) + escapeHtml(who) + '.</p>'
      + '<p><a href="' + link + '" target="_blank">Clique aqui para confirmar seu e-mail</a></p>'
      + '<p>Este link expira em ' + hours + ' horas.</p><p>' + escapeHtml(NOT_YOU) + '</p></div>',
  };
}

/** Aviso ao dono de uma conta JÁ confirmada: alguém tentou cadastrar o endereço dele. Sem link de ação. */
function registerNoticeMessage(env, to) {
  const text = 'Alguém tentou criar uma conta com este e-mail, que já está cadastrado e confirmado. Nada mudou na sua conta. '
    + 'Se foi você, entre normalmente ou use "Esqueci minha senha". Se não foi, pode ignorar este aviso.';
  return {
    to,
    subject: 'Tentativa de cadastro com seu e-mail — ' + env.MAIL_FROM_NAME,
    text,
    html: HTML_OPEN + '<h2>Tentativa de cadastro</h2><p>' + escapeHtml(text) + '</p></div>',
  };
}

/**
 * UM statement: acha a conta ativa e não confirmada do e-mail, apaga os links de confirmação pendentes e grava
 * o novo. Sem conta elegível, não mexe em nada e devolve null (mesmo número de consultas nos dois casos).
 */
async function reissueToken(sql, env, email) {
  const rawToken = S.generateRawToken();
  const tokenHash = await S.hashToken(rawToken, env.SESSION_TOKEN_PEPPER);
  const rows = await sql`
    WITH target AS (
      SELECT id, full_name, username FROM profiles
      WHERE email = ${email} AND email_confirmed_at IS NULL AND status = 'active'::account_status
      LIMIT 1
    ),
    dropped AS (
      DELETE FROM account_tokens
      WHERE profile_id IN (SELECT id FROM target)
        AND token_type = 'email_confirmation'::account_token_type AND used_at IS NULL
    ),
    issued AS (
      INSERT INTO account_tokens (profile_id, token_type, token_hash, expires_at)
      SELECT id, 'email_confirmation'::account_token_type, ${tokenHash}, now() + (${C.LIMITS.EMAIL_TOKEN_TTL_HOURS} || ' hours')::interval
      FROM target
      RETURNING profile_id
    )
    SELECT t.id, t.full_name, t.username FROM target t JOIN issued i ON i.profile_id = t.id
  `;
  return rows.length ? { id: rows[0].id, fullName: rows[0].full_name, username: rows[0].username, rawToken } : null;
}

async function sendNewConfirmation(sql, env, email, correlationId) {
  const target = await reissueToken(sql, env, email);
  if (target) {
    await deliverEmail(sql, env, correlationId, 'MAIL_CONFIRMATION_FAILED',
      confirmationMessage(env, email, target.fullName, target.username, target.rawToken), target.id);
  }
  return target;
}

/** Limites do reenvio: por IP, por e-mail (hora) e o intervalo mínimo por e-mail. Todos por UPSERT atômico. */
async function enforceResendLimits(sql, email, clientIp) {
  await S.enforceRateLimit(sql, 'RESEND_IP', clientIp || 'unknown', L.RESEND_IP.MAX_ATTEMPTS, L.RESEND_IP.WINDOW_SECONDS);
  await S.enforceRateLimit(sql, 'RESEND_EMAIL', email, L.RESEND_EMAIL.MAX_ATTEMPTS, L.RESEND_EMAIL.WINDOW_SECONDS);
  const recent = await S.countRateLimitAttempt(sql, 'RESEND_COOLDOWN', email, L.RESEND_COOLDOWN.WINDOW_SECONDS);
  if (recent > L.RESEND_COOLDOWN.MAX_ATTEMPTS) throw E.RateLimitError(RESEND_COOLDOWN_MESSAGE);
}

/** apiResendConfirmation: sempre a mesma resposta (ver cabeçalho). Erros só de formato, limite ou teto. */
export async function resendConfirmation(sql, env, email, correlationId) {
  const normalized = S.normalizeText(email).toLowerCase();
  if (!S.isValidEmail(normalized)) throw E.ValidationError('Informe um e-mail válido.');
  await enforceResendLimits(sql, normalized, env.clientIp);
  await assertEmailQuotaAvailable(sql, env);

  const target = await sendNewConfirmation(sql, env, normalized, correlationId);
  const actorId = target ? target.id : null;
  await Logging.logAudit(sql, correlationId, actorId, 'RESEND_CONFIRMATION', 'profile', actorId, 'success', null);
  return { success: true, message: RESEND_GENERIC_MESSAGE, cooldownSeconds: L.RESEND_COOLDOWN.WINDOW_SECONDS };
}

/**
 * Cadastro com e-mail que já existe: mesma resposta de um cadastro novo, nenhuma alteração na conta.
 * Não confirmada → reenvio (respeitando o intervalo mínimo, em silêncio). Confirmada → aviso ao dono (1/dia).
 * O crypt() iguala o custo do bcrypt do INSERT de um cadastro novo.
 */
export async function registerExistingEmail(sql, env, data, existing, correlationId) {
  await sql`SELECT crypt(${data.password}, gen_salt('bf', ${BCRYPT_COST})) AS ignored`;
  const confirmed = !!existing.email_confirmed_at;
  if (!confirmed) {
    const recent = await S.countRateLimitAttempt(sql, 'RESEND_COOLDOWN', data.email, L.RESEND_COOLDOWN.WINDOW_SECONDS);
    if (recent <= L.RESEND_COOLDOWN.MAX_ATTEMPTS) await sendNewConfirmation(sql, env, data.email, correlationId);
  } else {
    const notices = await S.countRateLimitAttempt(sql, 'REGISTER_NOTICE', data.email, L.REGISTER_NOTICE.WINDOW_SECONDS);
    if (notices <= L.REGISTER_NOTICE.MAX_ATTEMPTS) {
      await deliverEmail(sql, env, correlationId, 'MAIL_REGISTER_NOTICE_FAILED', registerNoticeMessage(env, data.email), existing.id);
    }
  }
  await Logging.logAudit(sql, correlationId, null, 'REGISTER', 'profile', existing.id, 'success', { existing: confirmed ? 'confirmed' : 'unconfirmed' });
  return { success: true, message: REGISTER_SUCCESS_MESSAGE };
}
