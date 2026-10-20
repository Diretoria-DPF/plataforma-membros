/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * mailer.js
 * Envio de e-mail via API HTTP da Brevo (https://brevo.com), no lugar do
 * MailApp do Apps Script. BREVO_API_KEY é um secret (wrangler secret put),
 * nunca fica no código nem em wrangler.toml. O remetente (MAIL_FROM_ADDRESS)
 * precisa estar cadastrado/verificado no painel da Brevo antes de funcionar
 * de verdade — ver docs/DEPLOYMENT.md.
 */
async function post(env, { to, subject, text, html }, fromAddress) {
  const body = {
    sender: { name: env.MAIL_FROM_NAME, email: fromAddress },
    to: [{ email: to }],
    subject: subject,
    textContent: text,
    htmlContent: html,
  };
  // Respostas vão para o e-mail da liga (o remetente do domínio é de "não responda").
  if (env.MAIL_REPLY_TO) body.replyTo = { email: env.MAIL_REPLY_TO };
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Se a Brevo recusar o remetente (400), tenta UMA vez com MAIL_FROM_FALLBACK (o Gmail já cadastrado). Assim, um
 * detalhe de cadastro do remetente novo nunca derruba e-mails de confirmação de conta e de redefinição de senha.
 */
export async function sendEmail(env, message) {
  let res = await post(env, message, env.MAIL_FROM_ADDRESS);
  const fallback = env.MAIL_FROM_FALLBACK;
  if (!res.ok && res.status === 400 && fallback && fallback !== env.MAIL_FROM_ADDRESS) {
    res = await post(env, message, fallback);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error('Falha ao enviar e-mail via Brevo (status ' + res.status + '): ' + detail);
    // Só o código HTTP vai para os logs (confirmationService.deliverEmail): o corpo pode repetir o destinatário.
    err.status = res.status;
    throw err;
  }
}
