/**
 * mailer.js
 * Envio de e-mail via API HTTP da Brevo (https://brevo.com), no lugar do
 * MailApp do Apps Script. BREVO_API_KEY é um secret (wrangler secret put),
 * nunca fica no código nem em wrangler.toml. O remetente (MAIL_FROM_ADDRESS)
 * precisa estar cadastrado/verificado no painel da Brevo antes de funcionar
 * de verdade — ver docs/DEPLOYMENT.md.
 */
export async function sendEmail(env, { to, subject, text, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM_ADDRESS },
      to: [{ email: to }],
      subject: subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Falha ao enviar e-mail via Brevo (status ' + res.status + '): ' + detail);
  }
}
