/**
 * frontend/msg-crypto.js
 * Primitivas de criptografia da mensageria E2EE (Fase 3d/3f de
 * docs/PLANO_FASE3_MENSAGERIA.md, seção 3, com a simplificação de
 * 2026-09-25: sem frase-secreta — feedback direto do dono da plataforma de
 * que a frase-secreta tornou o uso complicado demais para os membros).
 * Módulo ES puro: SEM acesso a `document`/`window` do DOM e SEM
 * `fetch`/rede — só `crypto.subtle` nativo (Web Crypto API), disponível
 * tanto no navegador quanto no Node 20+ (usado para validar este arquivo
 * fora do navegador — ver frontend/scripts/verify-msg-crypto.js).
 *
 * Nada aqui grava em localStorage/sessionStorage/IndexedDB (isso é
 * responsabilidade de frontend/messaging.js), nada faz console.log de
 * segredo, e a chave privada gerada é sempre um CryptoKey NÃO extraível —
 * a única forma de "ler" a privada de fora deste módulo seria via um bug
 * do próprio navegador. A semente aleatória e o PKCS8 intermediário são
 * sobrescritos com zeros assim que o par de chaves é montado.
 *
 * Ciclo de vida da chave (sem frase-secreta): `generateIdentityKeyPair()`
 * gera 32 bytes aleatórios (nunca derivados de nada digitado pelo
 * usuário), monta a chave X25519 e devolve `{publicKeyBase64url,
 * privateKey}`. Cabe a frontend/messaging.js guardar o `privateKey`
 * (CryptoKey não extraível) em IndexedDB deste navegador — a identidade de
 * mensageria fica ligada a ESTE aparelho/navegador, não a algo que o
 * usuário memoriza. Trade-off aceito explicitamente: limpar os dados do
 * navegador ou trocar de aparelho perde o acesso ao histórico antigo,
 * exatamente como acontecia com a frase-secreta esquecida — só que agora
 * não existe fricção nenhuma no dia a dia.
 */

// ===========================================================================
// Configuração (constantes que o front-end usa; os limites do SERVIDOR são
// independentes e vivem em worker/src/constants.js — ver comentário em
// MESSAGE_MAX_LENGTH abaixo).
// ===========================================================================
export const MSG_CRYPTO_CONFIG = Object.freeze({
  ALGORITHM: 'X25519',
  // 'NONE' (sql/010_messaging_simplify.sql): não existe mais KDF/frase —
  // a chave é gerada aleatoriamente e persistida em IndexedDB.
  KDF_ALGORITHM: 'NONE',
  IV_BYTES: 12,
  // Mesma fonte da verdade que worker/src/constants.js LIMITS.MESSAGE_MAX_LENGTH
  // (Requisito novo 1, seção 11.1 do plano): limite de CARACTERES do texto
  // claro, aplicado só aqui — o servidor nunca vê o texto e por isso não
  // pode aplicar esse limite diretamente (ele aplica MESSAGE_CIPHERTEXT_MAX
  // sobre o resultado já cifrado, que é outra coisa).
  MESSAGE_MAX_LENGTH: 2000,
  // Preenchimento do texto claro (seção 3.6): esconde o tamanho exato da
  // mensagem arredondando para o próximo múltiplo de 256 bytes UTF-8.
  PLAINTEXT_PAD_MULTIPLE: 256,
  PROTOCOL_LABEL: 'laift-msg/v1',
  // Prefixo fixo PKCS8 (RFC 8410) para X25519, 16 bytes, seguido dos 32
  // bytes da semente aleatória — é exatamente o formato que os navegadores
  // exportam nativamente, por isso importa sem biblioteca externa.
  X25519_PKCS8_PREFIX_HEX: '302e020100300506032b656e04220420',
});

// ===========================================================================
// Acesso ao Web Crypto (navegador ou Node 20+) com mensagem de erro clara
// quando indisponível (R10 do plano: navegador antigo demais).
// ===========================================================================
function getCrypto() {
  var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  if (!c || !c.subtle) {
    throw new Error('Seu navegador não suporta mensagens cifradas (Web Crypto API indisponível). Atualize o navegador para usar a mensageria.');
  }
  return c;
}

export function isCryptoSupported() {
  try {
    return !!getCrypto().subtle;
  } catch (err) {
    return false;
  }
}

// ===========================================================================
// Codificação — tudo em base64url SEM padding, conforme o contrato exato
// de worker/src/services/messagingKeyService.js e messageService.js.
// ===========================================================================
function bytesToBase64url(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  var b64 = (typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64'));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(str) {
  var raw = String(str || '');
  if (!/^[A-Za-z0-9_-]*$/.test(raw)) throw new Error('Valor base64url malformado.');
  var padLen = (4 - (raw.length % 4)) % 4;
  var padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  var binary = (typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary'));
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex) {
  var bytes = new Uint8Array(hex.length / 2);
  for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function bytesToHex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function concatBytes() {
  var total = 0;
  for (var i = 0; i < arguments.length; i++) total += arguments[i].length;
  var out = new Uint8Array(total);
  var offset = 0;
  for (var j = 0; j < arguments.length; j++) {
    out.set(arguments[j], offset);
    offset += arguments[j].length;
  }
  return out;
}

function utf8Encode(str) {
  return new TextEncoder().encode(str);
}

function utf8Decode(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function zeroFill(bytes) {
  if (bytes && typeof bytes.fill === 'function') bytes.fill(0);
}

export function getRandomBytes(length) {
  var bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return bytes;
}

function stripJwkPadding(b64) {
  return String(b64 || '').replace(/=+$/, '');
}

/**
 * Gera um novo par de chaves X25519 a partir de 32 bytes ALEATÓRIOS (nunca
 * derivados de senha/frase — essa é a simplificação de 2026-09-25). A
 * privada devolvida é um CryptoKey NÃO extraível — nunca existe como bytes
 * acessíveis fora deste módulo; cabe a quem chama persistir esse CryptoKey
 * (ex.: via IndexedDB, que suporta guardar CryptoKey diretamente) se
 * quiser reusá-lo depois de um reload, já que não há como re-derivá-lo.
 */
export async function generateIdentityKeyPair() {
  var subtle = getCrypto().subtle;
  var seed = null;
  var pkcs8 = null;
  try {
    seed = getRandomBytes(32);
    pkcs8 = concatBytes(hexToBytes(MSG_CRYPTO_CONFIG.X25519_PKCS8_PREFIX_HEX), seed);

    // extractable=true só para conseguir ler a coordenada pública via JWK
    // (Web Crypto não tem uma operação "getPublicKey" separada) — essa
    // instância nunca é devolvida nem guardada, só usada aqui dentro.
    var exportable = await subtle.importKey('pkcs8', pkcs8, { name: 'X25519' }, true, ['deriveBits']);
    var jwk = await subtle.exportKey('jwk', exportable);
    var publicKeyBase64url = stripJwkPadding(jwk.x).replace(/\+/g, '-').replace(/\//g, '_');

    var privateKey = await subtle.importKey('pkcs8', pkcs8, { name: 'X25519' }, false, ['deriveBits']);

    return { publicKeyBase64url: publicKeyBase64url, privateKey: privateKey };
  } finally {
    zeroFill(seed);
    zeroFill(pkcs8);
  }
}

// ===========================================================================
// Chave por conversa (seção 3.5): ECDH estático + HKDF → AES-GCM-256
// ===========================================================================
function lowerUuid(id) {
  return String(id || '').toLowerCase();
}

/**
 * Ordena os dois participantes exatamente como o CHECK
 * `conversations_ordered_pair` do banco (`participant_low < participant_high`)
 * — comparação lexicográfica de UUIDs canônicos minúsculos coincide com a
 * comparação por bytes que o Postgres usa, então isto reproduz do lado do
 * cliente a mesma ordem que o servidor usa para nomear as colunas.
 */
function orderParticipants(selfId, selfVersion, peerId, peerVersion) {
  var a = lowerUuid(selfId);
  var b = lowerUuid(peerId);
  if (a < b) return { lowId: a, lowVersion: selfVersion, highId: b, highVersion: peerVersion };
  return { lowId: b, lowVersion: peerVersion, highId: a, highVersion: selfVersion };
}

export async function deriveConversationKey(opts) {
  var options = opts || {};
  var subtle = getCrypto().subtle;
  var peerPubBytes = base64urlToBytes(options.peerPublicKeyBase64url);
  if (peerPubBytes.length !== 32) throw new Error('Chave pública do contato inválida.');

  var peerPublicKey = await subtle.importKey('raw', peerPubBytes, { name: 'X25519' }, false, []);

  var shared;
  try {
    shared = new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: peerPublicKey }, options.privateKey, 256));
  } catch (err) {
    // A especificação Secure Curves exige que o navegador lance erro se o
    // resultado for todo zero (ponto de ordem baixa) — ver seção 3.5.
    throw new Error('Não foi possível calcular a chave da conversa (chave pública do contato inválida).');
  }

  var ordered = orderParticipants(options.selfId, options.selfKeyVersion, options.peerId, options.peerKeyVersion);
  var info = utf8Encode(MSG_CRYPTO_CONFIG.PROTOCOL_LABEL + '/aesgcm|' + ordered.lowId + ':' + ordered.lowVersion + '|' + ordered.highId + ':' + ordered.highVersion);
  var salt = utf8Encode(String(options.conversationId || ''));

  var hk = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  var key = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salt, info: info }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  zeroFill(shared);
  return key;
}

// ===========================================================================
// AAD (seção 3.6): vincula a cifra à conversa, remetente, versões de
// chave e clientMessageId — se o servidor trocar qualquer um desses
// metadados, a decifragem falha.
// ===========================================================================
export function buildMessageAad(parts) {
  var p = parts || {};
  return utf8Encode([
    MSG_CRYPTO_CONFIG.PROTOCOL_LABEL,
    String(p.conversationId || ''),
    lowerUuid(p.senderId),
    String(p.senderKeyVersion || ''),
    String(p.recipientKeyVersion || ''),
    String(p.clientMessageId || ''),
  ].join('|'));
}

function computePadding(baseLen, multiple) {
  var remainder = baseLen % multiple;
  var extra = remainder === 0 ? 0 : multiple - remainder;
  return '0'.repeat(extra);
}

/**
 * Cifra uma mensagem. `opts.aad` são os metadados descritos em
 * buildMessageAad (o AAD em si é recalculado aqui, não recebido pronto,
 * para impedir uma chamada com AAD inconsistente com o payload real).
 * Devolve `{iv, ciphertext}` já em base64url sem padding, no formato
 * exato exigido por messageService.sendMessage (iv: 16 chars; ciphertext:
 * 24–12000 chars).
 */
export async function encryptMessage(opts) {
  var options = opts || {};
  var subtle = getCrypto().subtle;
  var plaintext = String(options.plaintext == null ? '' : options.plaintext);
  if (!plaintext.length) throw new Error('A mensagem não pode ficar vazia.');
  if (plaintext.length > MSG_CRYPTO_CONFIG.MESSAGE_MAX_LENGTH) {
    throw new Error('A mensagem excede o limite de ' + MSG_CRYPTO_CONFIG.MESSAGE_MAX_LENGTH + ' caracteres.');
  }

  var iso = new Date().toISOString();
  var baseJson = JSON.stringify({ b: plaintext, t: iso, p: '' });
  var baseLen = utf8Encode(baseJson).length;
  var padding = computePadding(baseLen, MSG_CRYPTO_CONFIG.PLAINTEXT_PAD_MULTIPLE);
  var finalJson = JSON.stringify({ b: plaintext, t: iso, p: padding });
  var plaintextBytes = utf8Encode(finalJson);

  var iv = getRandomBytes(MSG_CRYPTO_CONFIG.IV_BYTES);
  var aad = buildMessageAad(options.aad);

  var cipherBuffer = await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: aad, tagLength: 128 }, options.conversationKey, plaintextBytes);

  return { iv: bytesToBase64url(iv), ciphertext: bytesToBase64url(new Uint8Array(cipherBuffer)) };
}

/**
 * Decifra e VALIDA que o AAD reconstruído a partir dos metadados da
 * mensagem recebida bate com o que foi usado para cifrar (o próprio
 * AES-GCM já falha a decifragem se não bater — não existe um passo
 * "separado" de checagem de AAD, ele é intrínseco ao algoritmo).
 */
export async function decryptMessage(opts) {
  var options = opts || {};
  var subtle = getCrypto().subtle;
  var ivBytes = base64urlToBytes(options.iv);
  if (ivBytes.length !== MSG_CRYPTO_CONFIG.IV_BYTES) throw new Error('IV da mensagem inválido.');
  var cipherBytes = base64urlToBytes(options.ciphertext);
  var aad = buildMessageAad(options.aad);

  var plainBuffer;
  try {
    plainBuffer = await subtle.decrypt({ name: 'AES-GCM', iv: ivBytes, additionalData: aad, tagLength: 128 }, options.conversationKey, cipherBytes);
  } catch (err) {
    throw new Error('Não foi possível decifrar esta mensagem (chave incorreta ou conteúdo adulterado).');
  }

  var parsed;
  try {
    parsed = JSON.parse(utf8Decode(new Uint8Array(plainBuffer)));
  } catch (err) {
    throw new Error('Conteúdo decifrado em formato inesperado.');
  }
  if (!parsed || typeof parsed.b !== 'string') throw new Error('Conteúdo decifrado em formato inesperado.');
  return { body: parsed.b, timestamp: parsed.t || null };
}

// ===========================================================================
// TOFU (seção 3.7): fingerprint de uma chave pública e "número de
// segurança" de uma conversa (duas chaves ordenadas), para conferência
// fora da plataforma. Nada disto é segredo — pode ir para localStorage.
// ===========================================================================
export async function computeFingerprint(publicKeyBase64url) {
  var subtle = getCrypto().subtle;
  var pubBytes = base64urlToBytes(publicKeyBase64url);
  var hashBuf = await subtle.digest('SHA-256', pubBytes);
  var hex = bytesToHex(new Uint8Array(hashBuf)).toUpperCase().slice(0, 24);
  return (hex.match(/.{1,4}/g) || []).join(' ');
}

export async function computeSecurityNumber(publicKeyA, publicKeyB) {
  var ordered = [String(publicKeyA || ''), String(publicKeyB || '')].sort();
  var subtle = getCrypto().subtle;
  var bytes = concatBytes(base64urlToBytes(ordered[0]), base64urlToBytes(ordered[1]));
  var hashBuf = await subtle.digest('SHA-256', bytes);
  var hex = bytesToHex(new Uint8Array(hashBuf)).toUpperCase().slice(0, 40);
  return (hex.match(/.{1,5}/g) || []).join(' ');
}

// Exportados só para o script de verificação em Node (frontend/scripts/verify-msg-crypto.js).
export var _internal = { bytesToBase64url: bytesToBase64url, base64urlToBytes: base64urlToBytes };
