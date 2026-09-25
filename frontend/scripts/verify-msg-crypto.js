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
  // 1. generateIdentityKeyPair produz chaves de 32 bytes (43 chars
  //    base64url) e NUNCA repete entre chamadas (aleatório de verdade,
  //    sem frase-secreta nem determinismo nenhum — ao contrário do fluxo
  //    antigo, aqui repetir a chamada TEM que dar uma chave diferente).
  // ---------------------------------------------------------------------
  const idA1 = await M.generateIdentityKeyPair();
  const idA2 = await M.generateIdentityKeyPair();
  assert.strictEqual(idA1.publicKeyBase64url.length, 43, 'chave pública X25519 deve ter 43 chars base64url (32 bytes sem padding)');
  assert.notStrictEqual(idA1.publicKeyBase64url, idA2.publicKeyBase64url, 'duas gerações produziram a MESMA chave — não está aleatório');
  ok('generateIdentityKeyPair produz chave de 32 bytes, diferente a cada chamada');

  // ---------------------------------------------------------------------
  // 2. Chave de conversa simétrica: A deriva com (privA, pubB) e B deriva
  //    com (privB, pubA) — devem chegar na MESMA chave AES-GCM (round
  //    trip: A cifra, B decifra).
  // ---------------------------------------------------------------------
  const accountA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const accountB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const identityA = await M.generateIdentityKeyPair();
  const identityB = await M.generateIdentityKeyPair();

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
  // 3. AAD adulterado, IV trocado ou chave errada => decifragem falha.
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

  const identityC = await M.generateIdentityKeyPair();
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
  // 4. IVs de chamadas sucessivas nunca são iguais (aleatório por
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
  // 5. Preenchimento do texto claro é sempre múltiplo de 256 bytes UTF-8.
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
  // 6. Limite de tamanho do texto claro é aplicado ANTES de cifrar.
  // ---------------------------------------------------------------------
  let rejectedTooLong = false;
  try {
    await M.encryptMessage({ conversationKey: keyA, plaintext: 'x'.repeat(M.MSG_CRYPTO_CONFIG.MESSAGE_MAX_LENGTH + 1), aad: Object.assign({}, aad, { clientMessageId: 'too-long' }) });
  } catch (err) { rejectedTooLong = true; }
  assert.ok(rejectedTooLong, 'cifrou um texto acima do limite de MESSAGE_MAX_LENGTH');
  ok('texto claro acima de MESSAGE_MAX_LENGTH (2000) é recusado antes de cifrar');

  // ---------------------------------------------------------------------
  // 7. Fingerprint e número de segurança: determinísticos e simétricos.
  // ---------------------------------------------------------------------
  const fp1 = await M.computeFingerprint(identityA.publicKeyBase64url);
  const fp2 = await M.computeFingerprint(identityA.publicKeyBase64url);
  assert.strictEqual(fp1, fp2, 'fingerprint não é determinístico');
  const secNumberAB = await M.computeSecurityNumber(identityA.publicKeyBase64url, identityB.publicKeyBase64url);
  const secNumberBA = await M.computeSecurityNumber(identityB.publicKeyBase64url, identityA.publicKeyBase64url);
  assert.strictEqual(secNumberAB, secNumberBA, 'número de segurança depende da ordem dos argumentos');
  ok('fingerprint determinístico; número de segurança simétrico (A,B) === (B,A)');

  // ---------------------------------------------------------------------
  // 8. isCryptoSupported reflete a disponibilidade real de subtle.
  // ---------------------------------------------------------------------
  assert.strictEqual(M.isCryptoSupported(), true, 'isCryptoSupported deveria ser true neste Node 20+');
  ok('isCryptoSupported() reflete a disponibilidade real do Web Crypto');

  console.log('\n' + passed + ' verificações passaram. msg-crypto.js OK.\n');
}

main().catch((err) => {
  console.error('\nFALHA na verificação de msg-crypto.js:\n');
  console.error(err);
  process.exit(1);
});
