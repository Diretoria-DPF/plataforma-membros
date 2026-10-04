/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/alerts.js
 * Alertas da IA, avaliados pelo cron diário (maintenance.js). O Cloudflare não
 * enxerga estas métricas (consumo de tokens, taxa de acerto do cache, 429),
 * então quem avisa é o próprio Worker: e-mail aos administradores (Brevo) e
 * registro em audit_logs (ação AI_ALERT, details.kind). O mesmo tipo de
 * alerta não se repete em menos de 20 h.
 */
import { sendEmail } from '../mailer.js';
import * as Logging from '../logging.js';
import * as Metrics from './metrics.js';
import { isMissingTable } from '../services/featureFlagService.js';

const REPEAT_WINDOW_HOURS = 20;

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Devolve a lista de alertas NOVOS que foram enviados (vazia se nada a avisar). */
export async function runAiAlerts(sql, env, correlationId, now = new Date()) {
  let daily;
  try {
    daily = Metrics.totalsByDay(await Metrics.readDaily(sql, 3));
  } catch (err) {
    if (isMissingTable(err)) return []; // migração 018 ainda não aplicada
    throw err;
  }
  const budget = await Metrics.budgetStatus(sql, env, now.getTime());
  const alerts = Metrics.evaluateAlerts({
    daily, tokensUsed: budget.used, budget: budget.budget, today: now.toISOString().slice(0, 10),
  });
  if (!alerts.length) return [];

  const fresh = [];
  for (const alert of alerts) {
    const recent = await sql`
      SELECT 1 FROM audit_logs
      WHERE action = 'AI_ALERT' AND details->>'kind' = ${alert.kind}
        AND created_at > now() - make_interval(hours => ${REPEAT_WINDOW_HOURS})
      LIMIT 1
    `;
    if (!recent.length) fresh.push(alert);
  }
  if (!fresh.length) return [];

  const admins = await sql`
    SELECT email, full_name FROM profiles
    WHERE role = 'admin'::user_role AND status = 'active'::account_status AND email_confirmed_at IS NOT NULL
  `;
  const lines = fresh.map((a) => '- ' + a.message);
  for (const admin of admins) {
    try {
      await sendEmail(env, {
        to: admin.email,
        subject: 'Alerta da IA — ' + env.MAIL_FROM_NAME,
        text: 'Olá, ' + admin.full_name + '.\n\nO monitoramento da IA encontrou:\n' + lines.join('\n') + '\n\nVeja o painel de IA na administração.',
        html: '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h2>Alerta da IA</h2><ul>' +
          fresh.map((a) => '<li>' + escapeHtml(a.message) + '</li>').join('') + '</ul><p>Veja o painel de IA na administração.</p></div>',
      });
    } catch (mailErr) {
      await Logging.logError(sql, correlationId, 'AI_ALERT_MAIL_FAILED', 'Falha ao enviar o alerta da IA.', null);
    }
  }
  for (const alert of fresh) {
    await Logging.logAudit(sql, correlationId, null, 'AI_ALERT', 'ai', null, 'success', { kind: alert.kind });
  }
  return fresh;
}
