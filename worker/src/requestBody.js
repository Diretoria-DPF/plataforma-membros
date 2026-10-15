/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * requestBody.js
 * Leitura do corpo da requisição com teto de bytes. Vale mesmo sem Content-Length (corpo em pedaços): lê em fluxo, conta
 * os bytes e aborta ao passar do limite, sem montar o corpo inteiro na memória. O limite padrão cobre toda ação comum;
 * só as ações que carregam imagem em base64 têm teto maior (constants.js, HARDENING_BODY_LIMITS).
 *
 * Como a ação só é conhecida depois do JSON, a leitura em fluxo usa a ação anunciada no começo do corpo para decidir
 * cedo; a checagem FINAL (bodyFitsAction), com a ação já lida, é a que vale.
 */

const ACTION_PREFIX_RE = /"action"\s*:\s*"([A-Za-z0-9_]{1,64})"/;
const PREFIX_SCAN_BYTES = 1024;

const uploadLimit = (action, limits) => (
  typeof action === 'string' && Object.prototype.hasOwnProperty.call(limits.UPLOAD_BYTES, action) ? limits.UPLOAD_BYTES[action] : null
);

/** O corpo de `bytes` cabe no teto da ação (padrão, ou o de imagem para as ações de upload)? */
export function bodyFitsAction(bytes, action, limits) {
  const cap = uploadLimit(action, limits);
  return bytes <= (cap === null ? limits.DEFAULT_BYTES : Math.max(cap, limits.DEFAULT_BYTES));
}

function concat(chunks, total) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Teto da leitura em fluxo, a partir do começo do corpo: o da ação anunciada, ou o padrão. */
function capFromPrefix(chunks, total, limits) {
  const head = new TextDecoder().decode(concat(chunks, total).subarray(0, PREFIX_SCAN_BYTES));
  const match = ACTION_PREFIX_RE.exec(head);
  const cap = match ? uploadLimit(match[1], limits) : null;
  return cap === null ? limits.DEFAULT_BYTES : Math.max(cap, limits.DEFAULT_BYTES);
}

/**
 * @returns {Promise<{ tooLarge: boolean, text?: string, bytes?: number }>}
 */
export async function readLimitedBody(request, limits) {
  const absoluteMax = Math.max(limits.DEFAULT_BYTES, ...Object.values(limits.UPLOAD_BYTES));
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > absoluteMax) return { tooLarge: true };
  if (!request.body) return { tooLarge: false, text: '', bytes: 0 };

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  let cap = limits.DEFAULT_BYTES;
  let capDecided = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total > cap && !capDecided) {
      cap = capFromPrefix(chunks, total, limits);
      capDecided = true;
    }
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return { tooLarge: true };
    }
  }
  return { tooLarge: false, text: new TextDecoder().decode(concat(chunks, total)), bytes: total };
}
