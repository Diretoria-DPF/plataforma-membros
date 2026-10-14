/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { HARDENING_BODY_LIMITS as L } from '../src/constants.js';
import { readLimitedBody, bodyFitsAction } from '../src/requestBody.js';

const post = (body, headers) => new Request('https://api.example.com/', { method: 'POST', headers: headers || {}, body });
const streamOf = (chunks) => new ReadableStream({
  start(controller) { chunks.forEach((c) => controller.enqueue(new TextEncoder().encode(c))); controller.close(); },
});
const json = (action, pad) => JSON.stringify({ action, args: ['x'.repeat(pad)] });

describe('readLimitedBody', () => {
  test('corpo pequeno é lido por inteiro', async () => {
    const res = await readLimitedBody(post(json('apiLogin', 10)), L);
    expect(res.tooLarge).toBe(false);
    expect(JSON.parse(res.text).action).toBe('apiLogin');
  });

  test('Content-Length acima do maior teto é recusado sem ler o corpo', async () => {
    const res = await readLimitedBody(post('{}', { 'Content-Length': String(100 * 1024 * 1024) }), L);
    expect(res.tooLarge).toBe(true);
  });

  test('corpo acima do padrão e de ação comum é recusado mesmo sem Content-Length (leitura em fluxo)', async () => {
    const big = json('apiLogin', L.DEFAULT_BYTES + 10);
    const request = new Request('https://api.example.com/', { method: 'POST', body: streamOf([big.slice(0, 1000), big.slice(1000)]), duplex: 'half' });
    expect(request.headers.get('content-length')).toBeNull();
    expect((await readLimitedBody(request, L)).tooLarge).toBe(true);
  });

  test('ação de imagem pode passar do padrão, até o seu teto', async () => {
    const ok = await readLimitedBody(post(json('apiUpdateMyAvatar', 2 * 1024 * 1024)), L);
    expect(ok.tooLarge).toBe(false);
    const over = await readLimitedBody(post(json('apiUpdateMyAvatar', L.UPLOAD_BYTES.apiUpdateMyAvatar + 10)), L);
    expect(over.tooLarge).toBe(true);
  });

  test('capa de evento aceita imagem de 5 MB em base64 (~6,7 MB)', async () => {
    const res = await readLimitedBody(post(json('apiAdminUploadEventImage', Math.ceil((5 * 1024 * 1024 * 4) / 3))), L);
    expect(res.tooLarge).toBe(false);
  });

  test('corpo vazio devolve texto vazio', async () => {
    const res = await readLimitedBody(new Request('https://api.example.com/', { method: 'POST' }), L);
    expect(res).toEqual({ tooLarge: false, text: '', bytes: 0 });
  });

  test('conta bytes, não caracteres', async () => {
    const res = await readLimitedBody(post('é'.repeat(100)), L);
    expect(res.bytes).toBe(200);
  });
});

describe('bodyFitsAction (checagem final com a ação já conhecida)', () => {
  test('ação comum respeita o padrão; ação de imagem, o seu teto', () => {
    expect(bodyFitsAction(L.DEFAULT_BYTES, 'apiLogin', L)).toBe(true);
    expect(bodyFitsAction(L.DEFAULT_BYTES + 1, 'apiLogin', L)).toBe(false);
    expect(bodyFitsAction(L.DEFAULT_BYTES + 1, 'apiUpdateMyAvatar', L)).toBe(true);
    expect(bodyFitsAction(L.UPLOAD_BYTES.apiUpdateMyAvatar + 1, 'apiUpdateMyAvatar', L)).toBe(false);
    expect(bodyFitsAction(L.DEFAULT_BYTES + 1, 'constructor', L)).toBe(false);
  });
});
