/**
 * mailer.js
 * Envio de e-mail via API HTTP da Resend (https://resend.com), no lugar do
 * MailApp do Apps Script. RESEND_API_KEY é um secret (wrangler secret put),
 * nunca fica no código nem em wrangler.toml.
 */
export async function sendEmail(env, { to, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM_NAME + ' <' + env.MAIL_FROM_ADDRESS + '>',
      to: [to],
      subject: subject,
      text: text,
      html: html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Falha ao enviar e-mail via Resend (status ' + res.status + '): ' + detail);
  }
}
