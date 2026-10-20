/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// mailer.sendEmail: remetente do domínio da liga, Reply-To e retorno ao remetente de reserva quando a Brevo recusa o novo.
import { jest } from '@jest/globals';
import { sendEmail } from '../src/mailer.js';

const BASE = { BREVO_API_KEY: 'k', MAIL_FROM_NAME: 'Plataforma de Membros', MAIL_FROM_ADDRESS: 'nao-responda@laift.com.br' };
const MSG = { to: 'pessoa@exemplo.com', subject: 'Assunto', text: 'Olá' };

let realFetch;
beforeEach(() => { realFetch = globalThis.fetch; globalThis.fetch = jest.fn(); });
afterEach(() => { globalThis.fetch = realFetch; });

const ok = () => ({ ok: true, status: 201, text: async () => '' });
const fail = (status, body) => ({ ok: false, status, text: async () => body || '' });
const sent = (call) => JSON.parse(globalThis.fetch.mock.calls[call][1].body);

describe('sendEmail', () => {
  test('envia do remetente configurado, sem Reply-To quando não há', async () => {
    globalThis.fetch.mockResolvedValue(ok());
    await sendEmail(BASE, MSG);
    expect(sent(0).sender).toEqual({ name: 'Plataforma de Membros', email: 'nao-responda@laift.com.br' });
    expect(sent(0)).not.toHaveProperty('replyTo');
  });

  test('com MAIL_REPLY_TO, as respostas vão para o e-mail da liga', async () => {
    globalThis.fetch.mockResolvedValue(ok());
    await sendEmail({ ...BASE, MAIL_REPLY_TO: 'liga@exemplo.com' }, MSG);
    expect(sent(0).replyTo).toEqual({ email: 'liga@exemplo.com' });
  });

  test('se a Brevo recusar o remetente (400), tenta uma vez com o remetente de reserva', async () => {
    globalThis.fetch.mockResolvedValueOnce(fail(400, '{"message":"Sender is not valid"}')).mockResolvedValueOnce(ok());
    await sendEmail({ ...BASE, MAIL_FROM_FALLBACK: 'reserva@exemplo.com' }, MSG);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(sent(1).sender.email).toBe('reserva@exemplo.com');
  });

  test('sem remetente de reserva, o erro 400 sobe com o status', async () => {
    globalThis.fetch.mockResolvedValue(fail(400, 'x'));
    await expect(sendEmail(BASE, MSG)).rejects.toMatchObject({ status: 400 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('erro que não é do remetente (ex.: 500) não gera nova tentativa', async () => {
    globalThis.fetch.mockResolvedValue(fail(500, 'x'));
    await expect(sendEmail({ ...BASE, MAIL_FROM_FALLBACK: 'reserva@exemplo.com' }, MSG)).rejects.toMatchObject({ status: 500 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('a reserva igual ao remetente não repete a chamada', async () => {
    globalThis.fetch.mockResolvedValue(fail(400, 'x'));
    await expect(sendEmail({ ...BASE, MAIL_FROM_FALLBACK: BASE.MAIL_FROM_ADDRESS }, MSG)).rejects.toMatchObject({ status: 400 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
