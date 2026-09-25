/**
 * frontend/scripts/verify-msg-crypto.js
 * Validação em Node de frontend/msg-crypto.js (que é servido ao navegador
 * como <script type="module">). frontend/package.json NÃO declara
 * "type": "module" (dev-server.js e scripts/build.js são CommonJS), então
 * o Node trataria um `import()` direto do arquivo .js como CommonJS e
 * falharia no `export` — por isso este script copia o CONTEÚDO do arquivo
 * fonte, sem modificá-lo, para um arquivo temporário .mjs (Node decide o
 * tipo de módulo pela extensão) e importa dali. O arquivo real publicado
 * nunca muda de extensão; isto é só um truque de carregamento para teste.
 *
 * Roda com: node frontend/scripts/verify-msg-crypto.js
 * Sai com código 0 em sucesso, 1 em qualquer falha (assert lança e o
 * processo termina com stack trace).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const SOURCE_PATH = path.join(__dirname, '..', 'msg-crypto.js');

function loadModule() {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');
  const tmpFile = path.join(os.tmpdir(), 'laift-msg-crypto-verify-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.mjs');
  fs.writeFileSync(tmpFile, source, 'utf8');
  return import(pathToFileURL(tmpFile).href).finally(() => {
    try { fs.unlinkSync(tmpFile); } catch (err) { /* ignora */ }
  });
}

async function main() {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('Este Node não expõe globalThis.crypto.subtle — use Node 20+.');
  }

  const M = await loadModule();
  let passed = 0;
  function ok(label) {
    passed++;
    console.log('  OK - ' + label);
  }

  console.log('== msg-crypto.js — verificação em Node (' + process.version + ') ==\n');

  // ---------------------------------------------------------------------
  // 1. Vetor dourado / determinismo: mesma frase + salt + accountId +
  //    iterações => sempre a mesma chave pública. O valor abaixo foi
  //    capturado rodando este mesmo script (ver git log) e passa a
  //    congelar a derivação: qualquer mudança futura em
  //    deriveIdentityKeyPair que produza um valor diferente aqui é uma
  //    mudança BREAKING (trancaria contas já existentes do lado de fora)
  //    e precisa ser tratada como rotação de versão de protocolo, não
  //    como um ajuste normal.
  // ---------------------------------------------------------------------
  const GOLDEN_PASSPHRASE = 'correto cavalo bateria grampo laift teste vetor';
  const GOLDEN_SALT = 'AAAAAAAAAAAAAAAAAAAAAA'; // 16 bytes zerados, base64url sem padding
  const GOLDEN_ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
  const GOLDEN_ITERATIONS = M.MSG_CRYPTO_CONFIG.KDF_MIN_ITERATIONS;
  const GOLDEN_EXPECTED_PUBLIC_KEY = 'wHyRcMDtNb06LyWoFNrE22GhqCRe2yDdlnFDx0YD5XQ';

  const golden1 = await M.deriveIdentityKeyPair({
    passphrase: GOLDEN_PASSPHRASE, saltBase64url: GOLDEN_SALT, iterations: GOLDEN_ITERATIONS, accountId: GOLDEN_ACCOUNT_ID,
  });
  const golden2 = await M.deriveIdentityKeyPair({
    passphrase: GOLDEN_PASSPHRASE, saltBase64url: GOLDEN_SALT, iterations: GOLDEN_ITERATIONS, accountId: GOLDEN_ACCOUNT_ID,
  });
  assert.strictEqual(golden1.publicKeyBase64url, golden2.publicKeyBase64url, 'derivação não é determinística');
  assert.strictEqual(golden1.publicKeyBase64url.length, 43, 'chave pública X25519 deve ter 43 chars base64url (32 bytes sem padding)');
  if (GOLDEN_EXPECTED_PUBLIC_KEY !== '__PENDING__') {
    assert.strictEqual(golden1.publicKeyBase64url, GOLDEN_EXPECTED_PUBLIC_KEY, 'VETOR DOURADO QUEBROU — mudança na derivação trancaria contas existentes');
  } else {
    console.log('  [golden vector capturado nesta execução]: ' + golden1.publicKeyBase64url);
  }
  ok('derivação determinística (mesma entrada => mesma chave pública), 32 bytes');

  // ---------------------------------------------------------------------
  // 2. Separação de domínio: accountId diferente => chave diferente,
  //    mesmo com a mesma frase e o mesmo salt.
  // ---------------------------------------------------------------------
  const otherAccount = await M.deriveIdentityKeyPair({
    passphrase: GOLDEN_PASSPHRASE, saltBase64url: GOLDEN_SALT, iterations: GOLDEN_ITERATIONS, accountId: '22222222-2222-2222-2222-222222222222',
  });
  assert.notStrictEqual(golden1.publicKeyBase64url, otherAccount.publicKeyBase64url, 'accountId diferente produziu a MESMA chave — falha de separação de domínio');
  ok('accountId diferente => chave pública diferente (separação de domínio)');

  // ---------------------------------------------------------------------
  // 3. Frase diferente => chave diferente.
  // ---------------------------------------------------------------------
  const otherPassphrase = await M.deriveIdentityKeyPair({
    passphrase: 'outra frase completamente diferente aqui', saltBase64url: GOLDEN_SALT, iterations: GOLDEN_ITERATIONS, accountId: GOLDEN_ACCOUNT_ID,
  });
  assert.notStrictEqual(golden1.publicKeyBase64url, otherPassphrase.publicKeyBase64url, 'frase diferente produziu a MESMA chave');
  ok('frase-secreta diferente => chave pública diferente');

  // ---------------------------------------------------------------------
  // 4. NFKC: formas Unicode equivalentes (composta vs decomposta) do
  //    mesmo texto produzem a mesma chave.
  // ---------------------------------------------------------------------
  const composed = 'café com açúcar e pão dourado teste frase segura';
  const decomposed = composed.normalize('NFD'); // decompõe acentos em base + combining marks
  const fromComposed = await M.deriveIdentityKeyPair({ passphrase: composed, saltBase64url: GOLDEN_SALT, iterations: GOLDEN_ITERATIONS, accountId: GOLDEN_ACCOUNT_ID });
  const fromDecomposed = await M.deriveIdentityKeyPair({ passphrase: decomposed, saltBase64url: GOLDEN_SALT, iterations: GOLDEN_ITERATIONS, accountId: GOLDEN_ACCOUNT_ID });
  assert.strictEqual(fromComposed.publicKeyBase64url, fromDecomposed.publicKeyBase64url, 'NFKC não igualou formas Unicode equivalentes');
  ok('NFKC: formas Unicode compostas e decompostas geram a mesma chave');

  // ---------------------------------------------------------------------
  // 5. Iterações abaixo do piso são recusadas pelo CLIENTE, mesmo que um
  //    "servidor" malicioso tente entregar um valor baixo.
  // ---------------------------------------------------------------------
  let rejectedLowIterations = false;
  try {
    await M.deriveIdentityKeyPair({ passphrase: GOLDEN_PASSPHRASE, saltBase64url: GOLDEN_SALT, iterations: 1000, accountId: GOLDEN_ACCOUNT_ID });
  } catch (err) {
    rejectedLowIterations = true;
  }
  assert.ok(rejectedLowIterations, 'derivação aceitou iterações abaixo do piso mínimo');
  ok('iterações abaixo do piso mínimo são recusadas pelo cliente');

  // ---------------------------------------------------------------------
  // 6. Chave de conversa simétrica: A deriva com (privA, pubB) e B deriva
  //    com (privB, pubA) — devem chegar na MESMA chave AES-GCM (round
  //    trip: A cifra, B decifra).
  // ---------------------------------------------------------------------
  const saltA = M.generateSaltBase64url();
  const saltB = M.generateSaltBase64url();
  const iterations = M.MSG_CRYPTO_CONFIG.KDF_MIN_ITERATIONS;
  const accountA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const accountB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const identityA = await M.deriveIdentityKeyPair({ passphrase: 'frase da conta A bem longa o suficiente', saltBase64url: saltA, iterations, accountId: accountA });
  const identityB = await M.deriveIdentityKeyPair({ passphrase: 'frase da conta B tambem bem longa aqui', saltBase64url: saltB, iterations, accountId: accountB });

  const conversationId = 'c0ffee00-c0ff-eec0-ffee-c0ffeec0ffee';
  const keyA = await M.deriveConversationKey({
    privateKey: identityA.privateKey, peerPublicKeyBase64url: identityB.publicKeyBase64url,
    conversationId, selfId: accountA, selfKeyVersion: 1, peerId: accountB, peerKeyVersion: 1,
  });
  const keyB = await M.deriveConversationKey({
    privateKey: identityB.privateKey, peerPublicKeyBase64url: identityA.publicKeyBase64url,
    conversationId, selfId: accountB, selfKeyVersion: 1, peerId: accountA, peerKeyVersion: 1,
  });

  const aad = { conversationId, senderId: accountA, senderKeyVersion: 1, recipientKeyVersion: 1, clientMessageId: 'd6a6f6b0-0000-4000-8000-000000000001' };
  const plaintext = 'Mensagem de teste do round trip A -> B, com acentuação: ção, ã, é.';
  const encrypted = await M.encryptMessage({ conversationKey: keyA, plaintext, aad });
  const decrypted = await M.decryptMessage({ conversationKey: keyB, iv: encrypted.iv, ciphertext: encrypted.ciphertext, aad });
  assert.strictEqual(decrypted.body, plaintext, 'round trip A->B não devolveu o texto original');
  ok('chave de conversa simétrica (A->B) + round trip cifrar/decifrar');

  // Formato exigido pelo backend (messageService.js): iv exatamente 16
  // chars, ciphertext entre 24 e 12000 chars, alfabeto base64url.
  assert.strictEqual(encrypted.iv.length, 16, 'iv não tem 16 chars base64url (12 bytes)');
  assert.ok(/^[A-Za-z0-9_-]{16}$/.test(encrypted.iv), 'iv fora do alfabeto base64url esperado pelo servidor');
  assert.ok(encrypted.ciphertext.length >= 24 && encrypted.ciphertext.length <= 12000, 'ciphertext fora da faixa aceita pelo servidor (24-12000)');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(encrypted.ciphertext), 'ciphertext fora do alfabeto base64url esperado pelo servidor');
  ok('formato do payload (iv 16 chars, ciphertext 24-12000, base64url) compatível com messageService.js');

  // ---------------------------------------------------------------------
  // 7. AAD adulterado, IV trocado ou chave errada => decifragem falha.
  // ---------------------------------------------------------------------
  let failedTamperedAad = false;
  try {
    await M.decryptMessage({ conversationKey: keyB, iv: encrypted.iv, ciphertext: encrypted.ciphertext, aad: Object.assign({}, aad, { clientMessageId: 'outro-id-qualquer' }) });
  } catch (err) { failedTamperedAad = true; }
  assert.ok(failedTamperedAad, 'decifragem aceitou AAD adulterado (clientMessageId trocado)');

  let failedWrongKeyVersion = false;
  try {
    await M.decryptMessage({ conversationKey: keyB, iv: encrypted.iv, ciphertext: encrypted.ciphertext, aad: Object.assign({}, aad, { senderKeyVersion: 2 }) });
  } catch (err) { failedWrongKeyVersion = true; }
  assert.ok(failedWrongKeyVersion, 'decifragem aceitou AAD adulterado (senderKeyVersion trocado)');

  const otherIv = M.getRandomBytes(M.MSG_CRYPTO_CONFIG.IV_BYTES);
  const otherIvB64 = M._internal.bytesToBase64url(otherIv);
  let failedWrongIv = false;
  try {
    await M.decryptMessage({ conversationKey: keyB, iv: otherIvB64, ciphertext: encrypted.ciphertext, aad });
  } catch (err) { failedWrongIv = true; }
  assert.ok(failedWrongIv, 'decifragem aceitou um IV diferente do usado para cifrar');

  const identityC = await M.deriveIdentityKeyPair({ passphrase: 'frase de uma terceira conta C bem longa', saltBase64url: M.generateSaltBase64url(), iterations, accountId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' });
  const wrongKey = await M.deriveConversationKey({
    privateKey: identityC.privateKey, peerPublicKeyBase64url: identityA.publicKeyBase64url,
    conversationId, selfId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', selfKeyVersion: 1, peerId: accountA, peerKeyVersion: 1,
  });
  let failedWrongKey = false;
  try {
    await M.decryptMessage({ conversationKey: wrongKey, iv: encrypted.iv, ciphertext: encrypted.ciphertext, aad });
  } catch (err) { failedWrongKey = true; }
  assert.ok(failedWrongKey, 'decifragem aceitou uma chave de conversa errada');
  ok('AAD adulterado, IV trocado e chave errada são todos rejeitados na decifragem');

  // ---------------------------------------------------------------------
  // 8. IVs de chamadas sucessivas nunca são iguais (aleatório por
  //    mensagem, nunca reuso).
  // ---------------------------------------------------------------------
  const ivsSeen = new Set();
  for (let i = 0; i < 25; i++) {
    const enc = await M.encryptMessage({ conversationKey: keyA, plaintext: 'mensagem numero ' + i, aad: Object.assign({}, aad, { clientMessageId: 'msg-' + i }) });
    assert.ok(!ivsSeen.has(enc.iv), 'IV repetido detectado entre cifragens sucessivas: ' + enc.iv);
    ivsSeen.add(enc.iv);
  }
  ok('25 cifragens sucessivas produziram 25 IVs distintos (nunca reuso)');

  // ---------------------------------------------------------------------
  // 9. Preenchimento do texto claro é sempre múltiplo de 256 bytes UTF-8
  //    (mesmo verificando via decodificação do ciphertext — indiretamente,
  //    checamos que mensagens de tamanhos bem diferentes produzem
  //    ciphertexts cujo comprimento decodificado é sempre congruente
  //    entre si módulo o crescimento em múltiplos de 256).
  // ---------------------------------------------------------------------
  const shortMsg = await M.encryptMessage({ conversationKey: keyA, plaintext: 'oi', aad: Object.assign({}, aad, { clientMessageId: 'pad-1' }) });
  const longerMsg = await M.encryptMessage({ conversationKey: keyA, plaintext: 'oi' + 'x'.repeat(50), aad: Object.assign({}, aad, { clientMessageId: 'pad-2' }) });
  const shortBytes = M._internal.base64urlToBytes(shortMsg.ciphertext).length;
  const longerBytes = M._internal.base64urlToBytes(longerMsg.ciphertext).length;
  // Descontando os 16 bytes fixos da tag GCM, o corpo cifrado (= tamanho do
  // JSON com padding) deve ser múltiplo de 256 nos dois casos.
  assert.strictEqual((shortBytes - 16) % 256, 0, 'corpo cifrado curto não é múltiplo de 256 bytes após descontar a tag GCM');
  assert.strictEqual((longerBytes - 16) % 256, 0, 'corpo cifrado maior não é múltiplo de 256 bytes após descontar a tag GCM');
  ok('preenchimento do texto claro sempre arredonda para múltiplo de 256 bytes UTF-8');

  // ---------------------------------------------------------------------
  // 10. Limite de tamanho do texto claro é aplicado ANTES de cifrar.
  // ---------------------------------------------------------------------
  let rejectedTooLong = false;
  try {
    await M.encryptMessage({ conversationKey: keyA, plaintext: 'x'.repeat(M.MSG_CRYPTO_CONFIG.MESSAGE_MAX_LENGTH + 1), aad: Object.assign({}, aad, { clientMessageId: 'too-long' }) });
  } catch (err) { rejectedTooLong = true; }
  assert.ok(rejectedTooLong, 'cifrou um texto acima do limite de MESSAGE_MAX_LENGTH');
  ok('texto claro acima de MESSAGE_MAX_LENGTH (2000) é recusado antes de cifrar');

  // ---------------------------------------------------------------------
  // 11. Política mínima de frase-secreta (DP-10).
  // ---------------------------------------------------------------------
  assert.strictEqual(M.checkPassphraseStrength('curta').ok, false, 'aceitou frase curta demais');
  assert.strictEqual(M.checkPassphraseStrength('aaaaaaaaaaaaaaaa').ok, false, 'aceitou caractere único repetido');
  assert.strictEqual(M.checkPassphraseStrength('abcdefghijklmnop').ok, false, 'aceitou sequência alfabética óbvia');
  assert.strictEqual(M.checkPassphraseStrength('correto cavalo bateria grampo').ok, true, 'rejeitou uma frase razoável');
  ok('política mínima de frase-secreta (DP-10): tamanho, repetição e sequências óbvias');

  // ---------------------------------------------------------------------
  // 12. Gerador de frase: palavras dentro da lista, entropia coerente.
  // ---------------------------------------------------------------------
  const generated = M.generatePassphrase();
  const words = generated.passphrase.split(' ');
  assert.strictEqual(words.length, M.MSG_CRYPTO_CONFIG.PASSPHRASE_WORD_COUNT, 'gerador não produziu a quantidade de palavras configurada');
  assert.ok(generated.entropyBits > 40, 'entropia do gerador ficou baixa demais (' + generated.entropyBits.toFixed(1) + ' bits)');
  console.log('  [info] lista de ' + M._internal.PASSPHRASE_WORDS_LENGTH + ' palavras, entropia do gerador: ' + generated.entropyBits.toFixed(1) + ' bits');
  ok('gerador de frase-secreta produz N palavras com entropia > 40 bits');

  // ---------------------------------------------------------------------
  // 13. Fingerprint e número de segurança: determinísticos e simétricos.
  // ---------------------------------------------------------------------
  const fp1 = await M.computeFingerprint(identityA.publicKeyBase64url);
  const fp2 = await M.computeFingerprint(identityA.publicKeyBase64url);
  assert.strictEqual(fp1, fp2, 'fingerprint não é determinístico');
  const secNumberAB = await M.computeSecurityNumber(identityA.publicKeyBase64url, identityB.publicKeyBase64url);
  const secNumberBA = await M.computeSecurityNumber(identityB.publicKeyBase64url, identityA.publicKeyBase64url);
  assert.strictEqual(secNumberAB, secNumberBA, 'número de segurança depende da ordem dos argumentos');
  ok('fingerprint determinístico; número de segurança simétrico (A,B) === (B,A)');

  // ---------------------------------------------------------------------
  // 14. Calibração do KDF nunca fica abaixo do piso mínimo.
  // ---------------------------------------------------------------------
  const calibrated = await M.calibrateKdfIterations();
  assert.ok(calibrated >= M.MSG_CRYPTO_CONFIG.KDF_MIN_ITERATIONS, 'calibração devolveu um valor abaixo do piso mínimo');
  console.log('  [info] iterações calibradas neste ambiente: ' + calibrated);
  ok('calibração do PBKDF2 nunca fica abaixo do piso mínimo de 600000');

  console.log('\n' + passed + ' verificações passaram. msg-crypto.js OK.\n');
}

main().catch((err) => {
  console.error('\nFALHA na verificação de msg-crypto.js:\n');
  console.error(err);
  process.exit(1);
});
