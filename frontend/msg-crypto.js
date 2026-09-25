/**
 * frontend/msg-crypto.js
 * Primitivas de criptografia da mensageria E2EE (Fase 3d/3f de
 * docs/PLANO_FASE3_MENSAGERIA.md, seção 3). Módulo ES puro: SEM acesso a
 * `document`/`window` do DOM e SEM `fetch`/rede — só `crypto.subtle`
 * nativo (Web Crypto API), disponível tanto no navegador quanto no Node
 * 20+ (usado para validar este arquivo fora do navegador — ver
 * frontend/scripts/verify-msg-crypto.js).
 *
 * Nada aqui grava em localStorage/sessionStorage, nada faz console.log de
 * segredo, e a chave privada derivada é sempre um CryptoKey NÃO
 * extraível — a única forma de "ler" a privada de fora deste módulo seria
 * via um bug do próprio navegador. A frase-secreta, a semente (seed) e o
 * PKCS8 intermediário são sobrescritos com zeros assim que o par de
 * chaves é montado (melhor esforço: strings JS não são mutáveis, só os
 * TypedArrays derivados delas).
 *
 * Desvio documentado em relação ao texto literal do plano (seção 3.3):
 * o plano usa `profileId` no `info` do HKDF de identidade para separar
 * contas. Hoje NENHUM endpoint do backend devolve o próprio profileId ao
 * cliente exceto `apiGetMyMessagingKey` (adicionado nesta mesma entrega,
 * ver worker/src/services/messagingKeyService.js) — por isso
 * `deriveIdentityKeyPair` recebe esse valor via `accountId` (o chamador,
 * frontend/messaging.js, passa `profileId` assim que o obtém de
 * `apiGetMyMessagingKey`). O nome do parâmetro é genérico de propósito
 * para deixar claro que qualquer identificador estável e único por conta
 * serve ao objetivo de separação de domínio — o valor real usado É o
 * profileId.
 */

// ===========================================================================
// Configuração (constantes que o front-end usa; os limites do SERVIDOR são
// independentes e vivem em worker/src/constants.js — ver comentário em
// MESSAGE_MAX_LENGTH abaixo).
// ===========================================================================
export const MSG_CRYPTO_CONFIG = Object.freeze({
  ALGORITHM: 'X25519',
  KDF_ALGORITHM: 'PBKDF2-SHA256',
  // Piso mínimo aceito pelo CLIENTE, independente do que um servidor
  // malicioso possa tentar devolver em `kdf.iterations` — mesmo valor de
  // worker/src/constants.js LIMITS.KDF_MIN_ITERATIONS (piso da OWASP para
  // PBKDF2-HMAC-SHA256). O cliente nunca deriva com menos que isto.
  KDF_MIN_ITERATIONS: 600000,
  // Achado MEDIUM #2 da revisão de segurança (seção 10 do plano): 600 mil é
  // o PISO, não o alvo. Na primeira publicação/rotação o cliente calibra o
  // número real de iterações para este tempo-alvo (~0,9s), nunca abaixo do
  // piso acima.
  KDF_CALIBRATION_TARGET_MS: 900,
  KDF_CALIBRATION_SAMPLE_ITERATIONS: 100000,
  KDF_CALIBRATION_MAX_ITERATIONS: 4000000,
  SALT_BYTES: 16,
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
  // DP-10: política mínima de frase-secreta.
  PASSPHRASE_MIN_LENGTH: 12,
  // Quantidade de palavras sugeridas pelo gerador (ver generatePassphrase).
  PASSPHRASE_WORD_COUNT: 7,
  PROTOCOL_LABEL: 'laift-msg/v1',
  // Prefixo fixo PKCS8 (RFC 8410) para X25519, 16 bytes, seguido dos 32
  // bytes da semente derivada — é exatamente o formato que os navegadores
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

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
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

export function generateSaltBase64url() {
  return bytesToBase64url(getRandomBytes(MSG_CRYPTO_CONFIG.SALT_BYTES));
}

// ===========================================================================
// Normalização e política mínima da frase-secreta (seção 3.3 e DP-10)
// ===========================================================================

/** NFKC: a mesma frase digitada em teclados/IMEs diferentes produz os mesmos bytes. */
export function normalizePassphrase(passphrase) {
  return String(passphrase == null ? '' : passphrase).normalize('NFKC').trim();
}

/**
 * Política mínima (DP-10): 12+ caracteres, recusa frases triviais óbvias
 * (um único caractere repetido, ou sequências simples de teclado/alfabeto
 * com 6+ caracteres seguidos). Não é (nem tenta ser) um verificador de
 * força completo — é uma rede de segurança contra os casos mais óbvios,
 * como o próprio plano pede.
 */
export function checkPassphraseStrength(passphrase) {
  var normalized = normalizePassphrase(passphrase);
  if (normalized.length < MSG_CRYPTO_CONFIG.PASSPHRASE_MIN_LENGTH) {
    return { ok: false, reason: 'A frase secreta precisa ter pelo menos ' + MSG_CRYPTO_CONFIG.PASSPHRASE_MIN_LENGTH + ' caracteres.' };
  }
  var compact = normalized.replace(/\s+/g, '');
  if (/^(.)\1+$/.test(compact)) {
    return { ok: false, reason: 'A frase secreta não pode ser um único caractere repetido.' };
  }
  var lower = compact.toLowerCase();
  var sequences = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  for (var i = 0; i < sequences.length; i++) {
    var seq = sequences[i];
    var seqRev = seq.split('').reverse().join('');
    for (var start = 0; start + 6 <= lower.length; start++) {
      var chunk = lower.slice(start, start + 6);
      if (seq.indexOf(chunk) !== -1 || seqRev.indexOf(chunk) !== -1) {
        return { ok: false, reason: 'A frase secreta não pode conter sequências óbvias de teclado ou alfabeto.' };
      }
    }
  }
  return { ok: true };
}

// ===========================================================================
// Gerador de frase-secreta: lista embutida de palavras comuns em
// português (sem acentuação, de propósito — evita ambiguidade de
// composição de teclado entre dispositivos na hora de o usuário digitar a
// mesma frase de volta; NFKC já cobre o caso de acentos, mas digitar sem
// acento é uma fonte de erro a menos). ~300 palavras: com
// PASSPHRASE_WORD_COUNT=7, a entropia é log2(N)*7 — ver
// estimatePassphraseEntropyBits(). É menor que a lista de 2048 palavras
// citada no plano (que daria ~55 bits com 5 palavras); esta lista mais
// enxuta, com 7 palavras, entrega uma entropia comparável ou maior (ver
// cálculo real no teste de Node), mantendo o arquivo bem menor e mais
// fácil de auditar/revisar à mão.
// ===========================================================================
var PASSPHRASE_WORDS = [
  // animais
  'gato', 'cachorro', 'elefante', 'girafa', 'leao', 'tigre', 'urso', 'lobo', 'raposa', 'coelho',
  'cavalo', 'vaca', 'porco', 'galinha', 'pato', 'peixe', 'tubarao', 'golfinho', 'baleia', 'polvo',
  'aranha', 'formiga', 'abelha', 'borboleta', 'coruja', 'aguia', 'falcao', 'pinguim', 'cisne', 'pavao',
  'macaco', 'panda', 'coala', 'canguru', 'zebra', 'rinoceronte', 'hipopotamo', 'crocodilo', 'tartaruga', 'camaleao',
  'esquilo', 'ourico', 'morcego', 'cobra', 'lagarto', 'sapo', 'caramujo', 'caranguejo', 'lagosta', 'camarao',
  'foca', 'lontra', 'javali', 'bisao', 'alce', 'veado', 'cervo', 'gaivota', 'pelicano', 'flamingo',
  // cores
  'vermelho', 'azul', 'verde', 'amarelo', 'roxo', 'laranja', 'rosa', 'branco', 'preto', 'cinza',
  'dourado', 'prateado', 'turquesa', 'bege', 'bronze',
  // natureza
  'montanha', 'floresta', 'rio', 'oceano', 'cachoeira', 'deserto', 'vulcao', 'ilha', 'praia', 'caverna',
  'nevasca', 'tempestade', 'arcoiris', 'estrela', 'planeta', 'cometa', 'nebulosa', 'galaxia', 'vento', 'trovao',
  'relampago', 'nuvem', 'orvalho', 'geleira', 'vale', 'penhasco', 'duna', 'recife', 'pantano', 'savana',
  'lagoa', 'cascata', 'gruta', 'falesia', 'tundra', 'pradaria', 'oasis', 'atol', 'istmo', 'peninsula',
  // objetos e casa
  'mesa', 'cadeira', 'porta', 'janela', 'espelho', 'lampada', 'relogio', 'tapete', 'cortina', 'almofada',
  'vaso', 'quadro', 'estante', 'prateleira', 'gaveta', 'chave', 'fechadura', 'vassoura', 'balde', 'panela',
  'frigideira', 'colher', 'garfo', 'faca', 'prato', 'xicara', 'caneca', 'bule', 'jarra', 'caixa',
  'mala', 'mochila', 'sombrinha', 'lanterna', 'vela', 'fosforo', 'corda', 'escada', 'martelo', 'parafuso',
  // comida
  'arroz', 'feijao', 'macarrao', 'batata', 'cenoura', 'tomate', 'alface', 'cebola', 'alho', 'pimenta',
  'acucar', 'mel', 'manteiga', 'queijo', 'presunto', 'pao', 'bolo', 'biscoito', 'chocolate', 'sorvete',
  'banana', 'maca', 'uva', 'melancia', 'abacaxi', 'manga', 'morango', 'pera', 'pessego', 'ameixa',
  'coco', 'castanha', 'amendoim', 'canela', 'baunilha', 'limao', 'goiaba', 'tangerina', 'abacate', 'jaca',
  // profissões
  'medico', 'advogado', 'professor', 'engenheiro', 'enfermeiro', 'dentista', 'arquiteto', 'programador', 'designer', 'musico',
  'pintor', 'escritor', 'jornalista', 'cientista', 'astronauta', 'piloto', 'marinheiro', 'bombeiro', 'cozinheiro', 'padeiro',
  'alfaiate', 'carpinteiro', 'eletricista', 'mecanico', 'jardineiro',
  // adjetivos
  'forte', 'rapido', 'lento', 'alto', 'baixo', 'grande', 'pequeno', 'claro', 'escuro', 'leve',
  'pesado', 'macio', 'duro', 'doce', 'amargo', 'azedo', 'salgado', 'fresco', 'quente', 'frio',
  'seco', 'molhado', 'limpo', 'novo', 'velho', 'jovem', 'sabio', 'corajoso', 'gentil', 'alegre',
  'calmo', 'curioso', 'criativo', 'paciente', 'sereno', 'honesto', 'generoso', 'humilde', 'tranquilo', 'radiante',
  'luminoso', 'valente',
  // lugares
  'cidade', 'vila', 'aldeia', 'bairro', 'avenida', 'praca', 'parque', 'jardim', 'biblioteca', 'museu',
  'teatro', 'estadio', 'ponte', 'tunel', 'farol', 'castelo', 'palacio', 'torre', 'muralha', 'fortaleza',
  'mercado', 'feira', 'porto', 'aeroporto', 'estacao',
  // diversos
  'livro', 'caderno', 'lapis', 'caneta', 'papel', 'carta', 'selo', 'envelope', 'presente', 'surpresa',
  'aventura', 'viagem', 'jornada', 'mapa', 'bussola', 'tesouro', 'moeda', 'anel', 'coroa', 'espada',
  'escudo', 'bandeira', 'sino', 'tambor', 'flauta', 'violao', 'guitarra', 'piano', 'trombeta', 'harpa',
];

/** log2(tamanho da lista) * quantidade de palavras — calculado a partir da lista real, nunca um número fixo em comentário que possa ficar desatualizado. */
export function estimatePassphraseEntropyBits(wordCount) {
  var n = Number.isInteger(wordCount) && wordCount > 0 ? wordCount : MSG_CRYPTO_CONFIG.PASSPHRASE_WORD_COUNT;
  return Math.log2(PASSPHRASE_WORDS.length) * n;
}

/**
 * Sorteio sem viés de módulo (rejection sampling), generalizado para
 * qualquer `max` — não só até 256. Um único byte (0-255) NUNCA cobre um
 * `max` maior que 256 (a lista de palavras tem mais de 256 entradas), o
 * que faria `byte < range` nunca ser verdadeiro e o sorteio girar para
 * sempre; por isso o número de bytes lidos escala com `max`.
 */
function randomIndex(max) {
  if (!Number.isInteger(max) || max <= 0) throw new Error('randomIndex: max inválido.');
  var byteLength = Math.max(1, Math.ceil(Math.log2(max) / 8));
  var spaceSize = Math.pow(256, byteLength);
  var range = spaceSize - (spaceSize % max);
  while (true) {
    var bytes = getRandomBytes(byteLength);
    var value = 0;
    for (var i = 0; i < byteLength; i++) value = value * 256 + bytes[i];
    if (value < range) return value % max;
  }
}

export function generatePassphrase(wordCount) {
  var n = Number.isInteger(wordCount) && wordCount > 0 ? wordCount : MSG_CRYPTO_CONFIG.PASSPHRASE_WORD_COUNT;
  var words = [];
  for (var i = 0; i < n; i++) words.push(PASSPHRASE_WORDS[randomIndex(PASSPHRASE_WORDS.length)]);
  return { passphrase: words.join(' '), entropyBits: estimatePassphraseEntropyBits(n) };
}

// ===========================================================================
// KDF: PBKDF2-SHA256 → HKDF → semente de 32 bytes (seção 3.2/3.3)
// ===========================================================================

async function pbkdf2Bits(passphraseBytes, saltBytes, iterations) {
  var subtle = getCrypto().subtle;
  var baseKey = await subtle.importKey('raw', passphraseBytes, 'PBKDF2', false, ['deriveBits']);
  var bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: iterations }, baseKey, 256);
  return new Uint8Array(bits);
}

async function hkdfBits(ikmBytes, saltBytes, infoBytes, lengthBits) {
  var subtle = getCrypto().subtle;
  var hk = await subtle.importKey('raw', ikmBytes, 'HKDF', false, ['deriveBits']);
  var bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: infoBytes }, hk, lengthBits);
  return new Uint8Array(bits);
}

/**
 * Achado MEDIUM #2 da revisão de segurança (seção 10 do plano): calibra o
 * número de iterações do PBKDF2 para um tempo-alvo neste aparelho, em vez
 * de usar sempre o piso de 600.000. Roda uma amostra pequena, mede quanto
 * tempo levou e extrapola — nunca abaixo do piso mínimo, nem acima de um
 * teto de sanidade (para não travar um aparelho muito lento por minutos).
 */
export async function calibrateKdfIterations() {
  var probe = MSG_CRYPTO_CONFIG.KDF_CALIBRATION_SAMPLE_ITERATIONS;
  var probeSalt = getRandomBytes(MSG_CRYPTO_CONFIG.SALT_BYTES);
  var probePass = utf8Encode('laift-msg-calibration-probe');
  var t0 = nowMs();
  await pbkdf2Bits(probePass, probeSalt, probe);
  var elapsedMs = nowMs() - t0;
  var msPerIteration = elapsedMs / probe;
  var target = Math.round(MSG_CRYPTO_CONFIG.KDF_CALIBRATION_TARGET_MS / Math.max(msPerIteration, 0.00001));
  target = Math.max(MSG_CRYPTO_CONFIG.KDF_MIN_ITERATIONS, Math.min(target, MSG_CRYPTO_CONFIG.KDF_CALIBRATION_MAX_ITERATIONS));
  return target;
}

function stripJwkPadding(b64) {
  return String(b64 || '').replace(/=+$/, '');
}

/**
 * Deriva o par de chaves X25519 a partir da frase-secreta (seção 3.3).
 * `opts.accountId` é o valor estável e único por conta usado para separar
 * domínios (ver nota no topo do arquivo sobre o desvio de `profileId`).
 * A privada devolvida é um CryptoKey NÃO extraível — nunca existe como
 * bytes acessíveis fora deste módulo.
 */
export async function deriveIdentityKeyPair(opts) {
  var options = opts || {};
  if (!Number.isInteger(options.iterations) || options.iterations < MSG_CRYPTO_CONFIG.KDF_MIN_ITERATIONS) {
    throw new Error('Parâmetros de derivação de chave abaixo do mínimo de segurança exigido.');
  }
  var accountId = String(options.accountId || '');
  if (!accountId) throw new Error('Identificador de conta ausente na derivação de chave.');
  if (!options.saltBase64url) throw new Error('Salt ausente na derivação de chave.');

  var subtle = getCrypto().subtle;
  var passphraseBytes = utf8Encode(normalizePassphrase(options.passphrase));
  var saltBytes = base64urlToBytes(options.saltBase64url);
  var ikm = null;
  var seed = null;
  var pkcs8 = null;
  try {
    ikm = await pbkdf2Bits(passphraseBytes, saltBytes, options.iterations);
    var info = utf8Encode(MSG_CRYPTO_CONFIG.PROTOCOL_LABEL + '/x25519-identity/' + accountId);
    seed = await hkdfBits(ikm, new Uint8Array(0), info, 256);
    pkcs8 = concatBytes(hexToBytes(MSG_CRYPTO_CONFIG.X25519_PKCS8_PREFIX_HEX), seed);

    var exportable = await subtle.importKey('pkcs8', pkcs8, { name: 'X25519' }, true, ['deriveBits']);
    var jwk = await subtle.exportKey('jwk', exportable);
    var publicKeyBase64url = stripJwkPadding(jwk.x).replace(/\+/g, '-').replace(/\//g, '_');

    var privateKey = await subtle.importKey('pkcs8', pkcs8, { name: 'X25519' }, false, ['deriveBits']);

    return { publicKeyBase64url: publicKeyBase64url, privateKey: privateKey };
  } finally {
    zeroFill(passphraseBytes);
    zeroFill(ikm);
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
export var _internal = { bytesToBase64url: bytesToBase64url, base64urlToBytes: base64urlToBytes, PASSPHRASE_WORDS_LENGTH: PASSPHRASE_WORDS.length };
