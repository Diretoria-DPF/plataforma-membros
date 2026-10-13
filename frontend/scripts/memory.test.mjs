/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Memória de estudo no Perfil (frontend/memory.js, ADR 0007, etapa 7): cartão só quando a API deixa, consentimento com a
// purposeVersion do servidor, needsReconsent, confirmação para apagar/desligar, exportação local sem rede extra, texto
// sempre por textContent, troca de conta e erros por code. O DOM real e o axe ficam no e2e (e2e/memory.e2e.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Memory = require('../memory.js');
const Core = require('../memory-core.js');
const Tutor = require('../agents-tutor.js');
const settle = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------
// Documento falso: innerHTML & cia. LANÇAM (a regra é textContent).
// ---------------------------------------------------------------------------
function makeDoc() {
  const registry = new Map();
  const doc = { activeElement: null, body: null };
  function node(tag) {
    const n = {
      tag, className: '', id: '', type: '', hidden: false, value: '', disabled: false, textContent: '',
      attrs: {}, listeners: {}, children: [], parentNode: null, clicked: false,
      setAttribute(name, value) { n.attrs[name] = String(value); },
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(n.attrs, name) ? n.attrs[name] : null; },
      removeAttribute(name) { delete n.attrs[name]; },
      addEventListener(type, fn) { (n.listeners[type] = n.listeners[type] || []).push(fn); },
      appendChild(child) { child.parentNode = n; n.children.push(child); if (n === doc.body) doc.body.appended.push(child); return child; },
      removeChild(child) { n.children = n.children.filter((c) => c !== child); child.parentNode = null; return child; },
      focus() { doc.activeElement = n; },
      scrollIntoView() { n.scrolled = true; },
      click() { n.clicked = true; (n.listeners.click || []).forEach((fn) => fn()); },
      set innerHTML(value) { throw new Error('innerHTML é proibido: ' + value); },
      set outerHTML(value) { throw new Error('outerHTML é proibido: ' + value); },
      insertAdjacentHTML() { throw new Error('insertAdjacentHTML é proibido'); },
    };
    return n;
  }
  doc.createElement = node;
  doc.body = node('body');
  doc.body.appended = [];
  doc.activeElement = doc.body;
  const grid = node('div');
  grid.id = 'profile-grid';
  const mfa = node('div');
  mfa.id = 'mfa-card';
  grid.appendChild(mfa);
  registry.set('profile-grid', grid);
  doc.getElementById = (id) => registry.get(id) || null;
  return { doc, grid };
}

function find(n, pred) {
  if (pred(n)) return n;
  for (const child of n.children) {
    const hit = find(child, pred);
    if (hit) return hit;
  }
  return null;
}
function findAll(n, pred, acc = []) {
  if (pred(n)) acc.push(n);
  n.children.forEach((c) => findAll(c, pred, acc));
  return acc;
}
const byClass = (cls) => (n) => n.className.split(' ').includes(cls);
const byKey = (key) => (n) => n.attrs['data-key'] === key;
const byTag = (tag) => (n) => n.tag === tag;
const countTag = (n, tag) => findAll(n, byTag(tag)).length;
const textOf = (n) => n.textContent + n.children.map(textOf).join(' ');

const VERSION = 'memoria-2026-10-v1';
const VOCAB = {
  topics: [{ slug: 'farmacocinetica', label: 'Farmacocinética' }, { slug: 'antimicrobianos', label: 'Antimicrobianos' }],
  preferences: [{ slug: 'formato', values: ['exemplos', 'resumo'] }, { slug: 'ritmo', values: ['curto', 'detalhado'] }],
  goals: ['prova', 'revisao'],
};
const consent = (o) => Object.assign({ status: 'none', current: false, needsReconsent: false, purposeVersion: VERSION }, o);
const GET = (o) => Object.assign({
  success: true, alpha: true, apiVersion: 'agents/v1-alpha', available: true, consent: consent(), items: [], vocabulary: VOCAB,
  limits: { maxItems: 60, retentionUnusedDays: 180, retentionMaxMonths: 12 },
}, o || {});
const ACTIVE = consent({ status: 'granted', current: true });
const ITEM = (o) => Object.assign({
  id: '11111111-1111-4111-8111-111111111111', kind: 'topic_level', slug: 'farmacocinetica', label: 'Farmacocinética',
  level: 3, value: null, source: 'quiz', evidence: 2,
}, o || {});
const ITEM2 = ITEM({ id: '22222222-2222-4222-8222-222222222222', kind: 'difficulty', slug: 'antimicrobianos', label: 'Antimicrobianos', level: 2, source: 'tutor' });

/** Instala document e App falsos; `handlers` responde por ação. */
function setup(handlers) {
  const env = makeDoc();
  const calls = [];
  const confirms = [];
  const session = { sessionToken: '' };
  globalThis.document = env.doc;
  globalThis.App = {
    getState: () => session,
    callApi: (action, ...args) => {
      calls.push({ action, args });
      const handler = handlers[action];
      return Promise.resolve(typeof handler === 'function' ? handler(args, calls) : handler);
    },
    openConfirm: (msg, cb) => confirms.push({ msg, cb }),
  };
  const login = (token) => { session.sessionToken = token; Memory.syncSession(); };
  const cardOf = () => env.grid.children.find((c) => c.id === 'memory-card') || null;
  const status = () => find(cardOf(), byClass('memory-status'));
  const press = async (card, key) => { find(card, byKey(key)).listeners.click[0](); await settle(); };
  const confirmLast = async () => { confirms.pop().cb(); await settle(); };
  const teardown = () => { Memory.reset(); delete globalThis.document; delete globalThis.App; session.sessionToken = ''; };
  const count = (action) => calls.filter((c) => c.action === action).length;
  return { ...env, calls, confirms, login, cardOf, status, press, confirmLast, teardown, count };
}

async function openProfile(env, token) {
  env.login(token);
  await Memory.ensureMemory();
  return env.cardOf();
}

// ---------------------------------------------------------------------------
// Funções puras
// ---------------------------------------------------------------------------
test('classifyLoad: só MEMORY_DISABLED é "não aparece" definitivo; rede não entra no cache; RATE_LIMIT mostra aviso', () => {
  assert.deepEqual(Memory.classifyLoad({ success: false, code: 'MEMORY_DISABLED', reason: 'age' }), { kind: 'hidden', cache: true });
  assert.deepEqual(Memory.classifyLoad({ success: false, networkUnavailable: true }), { kind: 'hidden', cache: false });
  assert.deepEqual(Memory.classifyLoad({ success: false, message: 'Sessão expirada' }), { kind: 'hidden', cache: true }, 'resposta definitiva do servidor também vale pela sessão');
  assert.equal(Memory.classifyLoad({ success: false, code: 'RATE_LIMIT' }).kind, 'error');
  assert.equal(Memory.classifyLoad({ success: false, code: 'MEMORY_UNAVAILABLE' }).kind, 'error');
  assert.equal(Memory.classifyLoad(GET()).kind, 'ok');
  assert.deepEqual(Memory.classifyLoad({ success: true, events: [], items: [] }), { kind: 'hidden', cache: true }, 'resposta padrão sem consent: sem cartão');
  [null, undefined, 'x', 7, [], { success: true, items: 'x' }].forEach((bad) => {
    const out = Memory.classifyLoad(bad);
    assert.notEqual(out.kind, 'error');
  });
});

test('normalizeState: descarta item malformado, restringe slug/origem/nível e mantém o consentimento do servidor', () => {
  const data = Memory.normalizeState(GET({
    consent: consent({ status: 'granted', current: true }),
    items: [ITEM(), { id: 'nao-uuid', kind: 'topic_level', slug: 'farmacocinetica' }, ITEM({ id: '33333333-3333-4333-8333-333333333333', kind: 'texto_livre' }),
      ITEM({ id: '44444444-4444-4444-8444-444444444444', slug: 'Tem Espaço', level: 9, source: 'hacker' }), null, 'x'],
  }));
  assert.equal(data.items.length, 1);
  assert.equal(data.consent.current, true);
  assert.equal(data.consent.purposeVersion, VERSION);
  assert.equal(Memory.normalizeState(GET({ consent: consent({ purposeVersion: '<b>x</b>' }) })).consent.purposeVersion, '', 'versão fora do formato é descartada');
  assert.equal(Memory.normalizeState({ success: false }), null);
  assert.deepEqual(Memory.normalizeItem(ITEM({ level: 7 })).level, null);
});

test('consentSections: texto da finalidade com os números do servidor, sem chaves sobrando', () => {
  const sections = Memory.consentSections({ maxItems: 40, retentionUnusedDays: 90, retentionMaxMonths: 6 });
  const all = sections.map((s) => s.title + ' ' + s.text).join('\n');
  assert.match(all, /90 dias sem uso/);
  assert.match(all, /6 meses/);
  assert.match(all, /40 itens/);
  assert.doesNotMatch(all, /[{}]/);
  assert.ok(sections.some((s) => s.title === 'O que NÃO guardamos'));
  assert.match(Memory.consentSections(undefined).map((s) => s.text).join(' '), /180 dias/);
  assert.equal(Memory.CONSENT_SECTIONS.length, 9);
});

test('describeItem: rótulos em português; slug desconhecido aparece como texto, sem quebrar', () => {
  assert.deepEqual(Memory.describeItem(Memory.normalizeItem(ITEM())), { title: 'Farmacocinética', detail: 'Nível 3 de 5 (intermediário)', origin: 'Simulados' });
  assert.equal(Memory.describeItem(Memory.normalizeItem(ITEM2)).detail, 'Dúvida recorrente');
  const pref = Memory.normalizeItem(ITEM({ kind: 'study_pref', slug: 'formato', level: null, value: 'passo_a_passo', source: 'member' }));
  assert.deepEqual(Memory.describeItem(pref), { title: 'Formato das explicações', detail: 'Passo a passo', origin: 'Você escolheu' });
  assert.equal(Memory.describeItem(Memory.normalizeItem(ITEM({ kind: 'goal', slug: 'prova', level: null, value: 'ativo' }))).detail, 'Prova');
  assert.equal(Memory.describeItem(Memory.normalizeItem(ITEM({ kind: 'goal', slug: 'novo-objetivo', level: null }))).detail, 'novo-objetivo');
});

test('errorMessage: cada code vira português amigável; code estranho e texto cru do servidor não passam', () => {
  const msg = (code) => Memory.errorMessage({ success: false, code, message: 'texto cru do servidor' });
  assert.match(msg('RATE_LIMIT'), /muitas operações/);
  assert.match(msg('MEMORY_UNAVAILABLE'), /indisponível agora/);
  assert.match(msg('CONSENT_REQUIRED'), /Ative a memória/);
  assert.match(msg('MEMORY_FULL'), /limite de itens/);
  assert.match(msg('VALIDATION'), /lista/);
  assert.match(msg('NOT_FOUND'), /não existe mais/);
  assert.match(msg('MEMORY_DISABLED'), /não está disponível/);
  assert.equal(msg('CODIGO_NOVO'), Memory.TEXT.generic);
  assert.equal(msg('__proto__'), Memory.TEXT.generic);
  assert.equal(msg('constructor'), Memory.TEXT.generic);
  assert.equal(Memory.errorMessage({ success: false, networkUnavailable: true }), Memory.TEXT.network);
  assert.equal(Memory.errorMessage(null), Memory.TEXT.generic);
  assert.ok(!['RATE_LIMIT', 'MEMORY_FULL', 'NOT_FOUND'].some((c) => msg(c).includes('texto cru')));
});

test('exportText: só campos conhecidos, sem identificadores; resposta inválida vira vazio', () => {
  const text = Memory.exportText({
    success: true, alpha: true, apiVersion: 'x', format: 'laift-memory/v1', exportedAt: '2026-10-12T10:00:00.000Z',
    consent: { status: 'granted', current: true, acceptedVersion: VERSION, grantedAt: '2026-10-01T00:00:00.000Z', revokedAt: null },
    items: [{ id: 'segredo', subject_id: 'x', kind: 'topic_level', slug: 'farmacocinetica', label: 'Farmacocinética', level: 3, value: null, source: 'quiz', evidence: 2, createdAt: 'a', extra: { a: 1 } }],
  });
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, 'laift-memory/v1');
  assert.deepEqual(Object.keys(parsed.items[0]).sort(), ['createdAt', 'evidence', 'kind', 'label', 'level', 'slug', 'source', 'value']);
  assert.doesNotMatch(text, /segredo|subject_id|extra|apiVersion/);
  assert.equal(Memory.exportText({ success: false }), '');
  assert.equal(Memory.exportText({ success: true, items: 'x' }), '');
  assert.equal(Memory.exportFileName(new Date('2026-10-12T15:00:00Z')), 'laift-memoria-de-estudo-2026-10-12.json');
});

// ---------------------------------------------------------------------------
// Quando o cartão aparece
// ---------------------------------------------------------------------------
test('MEMORY_DISABLED esconde o cartão e fica em cache; rede não: a próxima abertura tenta de novo', async () => {
  const off = setup({ apiMemoryGet: { success: false, code: 'MEMORY_DISABLED', reason: 'flag', message: 'x' } });
  try {
    assert.equal(await openProfile(off, 'off-1'), null);
    await Memory.ensureMemory();
    await Memory.ensureMemory();
    assert.equal(off.count('apiMemoryGet'), 1, 'pedido uma vez só na sessão');
    assert.equal(off.grid.children.length, 1, 'só o cartão da verificação em duas etapas fica no grid');
  } finally {
    off.teardown();
  }
  let attempt = 0;
  const flaky = setup({ apiMemoryGet: () => { attempt += 1; return attempt === 1 ? { success: false, networkUnavailable: true } : GET(); } });
  try {
    assert.equal(await openProfile(flaky, 'net-1'), null);
    await Memory.ensureMemory();
    assert.ok(flaky.cardOf(), 'na segunda abertura o cartão aparece');
    assert.equal(flaky.count('apiMemoryGet'), 2);
  } finally {
    flaky.teardown();
  }
});

test('sem sessão ou sem App nada é pedido; o GET vale a sessão inteira (cache em memória)', async () => {
  const env = setup({ apiMemoryGet: GET() });
  try {
    await Memory.ensureMemory();
    assert.equal(env.calls.length, 0);
    await openProfile(env, 'cache-1');
    await Promise.all([Memory.ensureMemory(), Memory.ensureMemory()]);
    await Memory.ensureMemory();
    assert.equal(env.count('apiMemoryGet'), 1);
    assert.deepEqual(env.calls[0].args, ['cache-1']);
    assert.equal(env.grid.children.filter((c) => c.id === 'memory-card').length, 1, 'nunca duplica');
    delete globalThis.App;
    env.login('cache-2');
    await Memory.ensureMemory();
    assert.equal(env.cardOf(), null);
  } finally {
    env.teardown();
  }
});

test('RATE_LIMIT na primeira carga mostra o cartão com aviso e "Tentar de novo" (que busca de novo)', async () => {
  let attempt = 0;
  const env = setup({ apiMemoryGet: () => { attempt += 1; return attempt === 1 ? { success: false, code: 'RATE_LIMIT', message: 'x' } : GET(); } });
  try {
    const card = await openProfile(env, 'rate-1');
    assert.match(textOf(card), /muitas operações/);
    await env.press(card, 'retry');
    assert.match(textOf(env.cardOf()), /Ativar memória de estudo/);
    assert.equal(env.count('apiMemoryGet'), 2);
  } finally {
    env.teardown();
  }
});

test('banco indisponível (available false): avisa, sem botão de ativar', async () => {
  const env = setup({ apiMemoryGet: GET({ available: false }) });
  try {
    const card = await openProfile(env, 'un-1');
    assert.match(textOf(card), /indisponível agora/);
    assert.equal(find(card, byKey('activate')), null);
  } finally {
    env.teardown();
  }
});

// ---------------------------------------------------------------------------
// Consentimento
// ---------------------------------------------------------------------------
test('sem consentimento: mostra o texto da finalidade e o botão; ativar pede confirmação e envia a purposeVersion do servidor', async () => {
  const NEXT = 'memoria-2099-01-v7';
  let granted = false;
  const env = setup({
    apiMemoryGet: () => GET({ consent: granted ? consent({ status: 'granted', current: true, purposeVersion: NEXT }) : consent({ purposeVersion: NEXT }) }),
    apiMemorySetConsent: () => { granted = true; return { success: true, consent: consent({ status: 'granted', current: true, purposeVersion: NEXT }) }; },
  });
  try {
    const card = await openProfile(env, 'consent-1');
    const text = textOf(card);
    ['Para que serve', 'O que guardamos', 'O que NÃO guardamos', 'Onde fica', 'Por quanto tempo', 'Quem pode ver', 'Seus controles', 'Quem pode usar', 'Base legal']
      .forEach((title) => assert.ok(text.includes(title), title));
    assert.match(text, /180 dias sem uso/);
    assert.equal(find(card, byClass('memory-items')), null);
    assert.equal(find(card, byKey('activate')).textContent, 'Ativar memória de estudo');
    await env.press(card, 'activate');
    assert.equal(env.count('apiMemorySetConsent'), 0, 'antes de confirmar nada vai ao servidor');
    assert.equal(env.confirms.length, 1);
    assert.match(env.confirms[0].msg, /nunca o texto das suas conversas/);
    env.calls.length = 0;
    await env.confirmLast();
    const set = env.calls.find((c) => c.action === 'apiMemorySetConsent');
    assert.deepEqual(set.args, ['consent-1', { granted: true, purposeVersion: NEXT }]);
    assert.ok(find(env.cardOf(), byKey('revoke')), 'agora a tela é a da memória ativa');
    assert.match(env.status().textContent, /ativada/);
    assert.equal(env.count('apiMemoryGet'), 1, 'recarrega os itens depois de ativar');
  } finally {
    env.teardown();
  }
});

test('texto mudou (needsReconsent): avisa, não mostra nada guardado e só lê depois do novo aceite', async () => {
  const env = setup({
    apiMemoryGet: GET({ consent: consent({ status: 'granted', current: false, needsReconsent: true }), items: [ITEM()] }),
    apiMemorySetConsent: { success: true, consent: ACTIVE },
  });
  try {
    const card = await openProfile(env, 'reconsent-1');
    assert.match(textOf(card), /O texto da memória de estudo mudou/);
    assert.equal(find(card, byClass('memory-items')), null, 'itens antigos não aparecem');
    assert.ok(!textOf(card).includes('Farmacocinética nível'), 'nada lido');
    assert.equal(find(card, byKey('activate')).textContent, 'Aceitar o novo texto');
    assert.ok(find(card, byKey('export')) && find(card, byKey('revoke')), 'dá para baixar ou apagar sem aceitar');
    assert.equal(find(card, byKey('delete-all')), null);
    await env.press(card, 'activate');
    await env.confirmLast();
    assert.deepEqual(env.calls.find((c) => c.action === 'apiMemorySetConsent').args, ['reconsent-1', { granted: true, purposeVersion: VERSION }]);
  } finally {
    env.teardown();
  }
});

test('termo atualizado durante o aceite (VALIDATION/version): avisa e recarrega o estado com a versão nova', async () => {
  let version = 'v1';
  const env = setup({
    apiMemoryGet: () => GET({ consent: consent({ purposeVersion: version }) }),
    apiMemorySetConsent: () => { version = 'v2'; return { success: false, code: 'VALIDATION', reason: 'version', purposeVersion: 'v2', message: 'x' }; },
  });
  try {
    const card = await openProfile(env, 'ver-1');
    await env.press(card, 'activate');
    await env.confirmLast();
    assert.match(env.status().textContent, /texto da memória foi atualizado/);
    assert.equal(env.count('apiMemoryGet'), 2);
    await env.press(env.cardOf(), 'activate');
    await env.confirmLast();
    assert.equal(env.calls.filter((c) => c.action === 'apiMemorySetConsent')[1].args[1].purposeVersion, 'v2');
  } finally {
    env.teardown();
  }
});

// ---------------------------------------------------------------------------
// Memória ativa: itens, apagar, desligar, exportar, preferências
// ---------------------------------------------------------------------------
const ACTIVE_GET = () => GET({ consent: ACTIVE, items: [ITEM(), ITEM2] });

test('ativa: lista tópico, nível e origem em texto puro; item com <img onerror> vira texto', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  const env = setup({ apiMemoryGet: GET({ consent: ACTIVE, items: [ITEM({ label: evil }), ITEM2] }) });
  try {
    const card = await openProfile(env, 'list-1');
    const rows = findAll(card, byClass('memory-item'));
    assert.equal(rows.length, 2);
    assert.equal(find(rows[0], byClass('memory-item-title')).textContent, evil);
    assert.equal(find(rows[0], byClass('memory-item-detail')).textContent, 'Nível 3 de 5 (intermediário)');
    assert.equal(find(rows[0], byClass('memory-item-origin')).textContent, 'Origem: Simulados');
    assert.equal(countTag(card, 'img'), 0);
    assert.equal(find(card, byClass('memory-item-delete')).getAttribute('aria-label').startsWith('Apagar da memória: '), true);
    assert.match(textOf(card), /2 de 60/);
  } finally {
    env.teardown();
  }
});

test('apagar item exige confirmação, chama apiMemoryDeleteItem com o id e tira só aquele item; NOT_FOUND também some', async () => {
  const env = setup({ apiMemoryGet: ACTIVE_GET(), apiMemoryDeleteItem: (args) => (args[1].id === ITEM2.id ? { success: false, code: 'NOT_FOUND', message: 'x' } : { success: true, deleted: 1 }) });
  try {
    const card = await openProfile(env, 'del-1');
    findAll(card, byClass('memory-item-delete'))[0].listeners.click[0]();
    await settle();
    assert.equal(env.count('apiMemoryDeleteItem'), 0, 'sem confirmar, nada é apagado');
    assert.match(env.confirms[0].msg, /Apagar este item/);
    env.confirms.length = 0;
    findAll(card, byClass('memory-item-delete'))[0].listeners.click[0]();
    await env.confirmLast();
    assert.deepEqual(env.calls.find((c) => c.action === 'apiMemoryDeleteItem').args, ['del-1', { id: ITEM().id }]);
    assert.equal(findAll(env.cardOf(), byClass('memory-item')).length, 1);
    findAll(env.cardOf(), byClass('memory-item-delete'))[0].listeners.click[0]();
    await env.confirmLast();
    assert.equal(findAll(env.cardOf(), byClass('memory-item')).length, 0, 'item que já não existe no servidor também sai da tela');
    assert.match(textOf(env.cardOf()), /Ainda não há nada guardado/);
  } finally {
    env.teardown();
  }
});

test('"Apagar tudo" exige confirmação, chama apiMemoryDeleteAll só com o token e mantém a memória ativa', async () => {
  const env = setup({ apiMemoryGet: ACTIVE_GET(), apiMemoryDeleteAll: { success: true, deleted: 2 } });
  try {
    const card = await openProfile(env, 'all-1');
    await env.press(card, 'delete-all');
    assert.equal(env.count('apiMemoryDeleteAll'), 0);
    assert.match(env.confirms[0].msg, /Apagar tudo/);
    await env.confirmLast();
    assert.deepEqual(env.calls.find((c) => c.action === 'apiMemoryDeleteAll').args, ['all-1']);
    assert.equal(findAll(env.cardOf(), byClass('memory-item')).length, 0);
    assert.ok(find(env.cardOf(), byKey('revoke')), 'continua ativa');
    assert.match(env.status().textContent, /apagado/);
  } finally {
    env.teardown();
  }
});

test('"Desligar memória" exige confirmação, revoga e volta ao texto de consentimento; apagamento pendente é dito', async () => {
  const revoked = (erased) => ({ success: true, consent: consent({ status: 'revoked' }), erased, queued: !erased });
  for (const erased of [true, false]) {
    const env = setup({ apiMemoryGet: ACTIVE_GET(), apiMemorySetConsent: revoked(erased) });
    try {
      const card = await openProfile(env, 'rev-' + erased);
      await env.press(card, 'revoke');
      assert.equal(env.count('apiMemorySetConsent'), 0);
      assert.match(env.confirms[0].msg, /Desligar a memória/);
      await env.confirmLast();
      assert.deepEqual(env.calls.find((c) => c.action === 'apiMemorySetConsent').args, ['rev-' + erased, { granted: false }]);
      assert.ok(find(env.cardOf(), byKey('activate')), 'volta a oferecer a ativação');
      assert.equal(find(env.cardOf(), byClass('memory-items')), null);
      assert.match(env.status().textContent, erased ? /desativada e apagada/ : /até 3 meses/);
    } finally {
      env.teardown();
    }
  }
});

test('cancelar a confirmação não chama a API (nem apagar, nem desligar, nem ativar)', async () => {
  const env = setup({ apiMemoryGet: ACTIVE_GET() });
  try {
    const card = await openProfile(env, 'cancel-1');
    await env.press(card, 'delete-all');
    await env.press(card, 'revoke');
    assert.equal(env.confirms.length, 2);
    assert.equal(env.calls.length, 1, 'só o GET inicial');
  } finally {
    env.teardown();
  }
});

test('exportação: gera o arquivo no aparelho (Blob + URL de objeto revogada) sem NENHUMA chamada além de apiMemoryExport', async () => {
  const exported = {
    success: true, format: 'laift-memory/v1', exportedAt: '2026-10-12T10:00:00.000Z', consent: { status: 'granted', acceptedVersion: VERSION },
    items: [{ kind: 'topic_level', slug: 'farmacocinetica', label: 'Farmacocinética', level: 3, value: null, source: 'quiz', evidence: 2 }],
  };
  const env = setup({ apiMemoryGet: ACTIVE_GET(), apiMemoryExport: exported });
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  const realFetch = globalThis.fetch;
  const realTimeout = globalThis.setTimeout;
  const blobs = [];
  const revoked = [];
  URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:laift/teste'; };
  URL.revokeObjectURL = (url) => { revoked.push(url); };
  globalThis.fetch = () => { throw new Error('exportação não pode usar rede'); };
  globalThis.setTimeout = (fn) => { fn(); return 0; };
  try {
    const card = await openProfile(env, 'exp-1');
    env.calls.length = 0;
    await env.press(card, 'export');
    assert.deepEqual(env.calls.map((c) => c.action), ['apiMemoryExport']);
    assert.deepEqual(env.calls[0].args, ['exp-1']);
    assert.equal(blobs.length, 1);
    assert.equal(blobs[0].type, 'application/json');
    assert.equal(JSON.parse(await blobs[0].text()).items[0].slug, 'farmacocinetica');
    const link = env.doc.body.appended[0];
    assert.equal(link.getAttribute('download'), Memory.exportFileName(new Date()));
    assert.equal(link.getAttribute('href'), 'blob:laift/teste');
    assert.equal(link.clicked, true);
    assert.equal(env.doc.body.children.length, 0, 'o link temporário sai do documento');
    assert.deepEqual(revoked, ['blob:laift/teste'], 'a URL de objeto é revogada');
    assert.match(env.status().textContent, /Nada foi enviado/);
  } finally {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realTimeout;
    env.teardown();
  }
});

test('preferências: só opções do vocabulário do servidor; cada uma vai por apiMemorySetPreference; vazio não envia', async () => {
  const saved = (payload) => ({ success: true, item: ITEM({ id: payload.kind === 'goal' ? '55555555-5555-4555-8555-555555555555' : '66666666-6666-4666-8666-666666666666', kind: payload.kind, slug: payload.slug, label: null, level: payload.level || null, value: payload.value || 'ativo', source: 'member' }) });
  const env = setup({ apiMemoryGet: GET({ consent: ACTIVE }), apiMemorySetPreference: (args) => saved(args[1]) });
  try {
    const card = await openProfile(env, 'pref-1');
    const selects = findAll(card, byTag('select'));
    const options = (id) => find(card, (n) => n.id === id).children.map((o) => o.getAttribute('value'));
    assert.deepEqual(options('memory-topic-slug'), ['', 'farmacocinetica', 'antimicrobianos']);
    assert.deepEqual(options('memory-topic-level'), ['', '1', '2', '3', '4', '5']);
    assert.deepEqual(options('memory-pref-formato'), ['', 'exemplos', 'resumo']);
    assert.deepEqual(options('memory-goal-slug'), ['', 'prova', 'revisao']);
    assert.equal(selects.length, 5);
    assert.equal(countTag(card, 'textarea') + findAll(card, (n) => n.tag === 'input').length, 0, 'nenhum campo de texto livre');
    const submit = (formKey) => find(card, (n) => n.tag === 'form' && n.attrs['aria-labelledby'] === formKey + '-title').listeners.submit[0]({ preventDefault() {} });
    submit('memory-topic');
    await settle();
    assert.match(env.status().textContent, /Escolha um tema e um nível/);
    assert.equal(env.count('apiMemorySetPreference'), 0);
    find(card, (n) => n.id === 'memory-topic-slug').value = 'antimicrobianos';
    find(card, (n) => n.id === 'memory-topic-level').value = '4';
    submit('memory-topic');
    await settle();
    find(card, (n) => n.id === 'memory-pref-formato').value = 'resumo';
    find(card, (n) => n.id === 'memory-pref-ritmo').value = 'curto';
    submit('memory-style');
    await settle();
    find(card, (n) => n.id === 'memory-goal-slug').value = 'prova';
    submit('memory-goal');
    await settle();
    const payloads = env.calls.filter((c) => c.action === 'apiMemorySetPreference').map((c) => c.args[1]);
    assert.deepEqual(payloads, [
      { kind: 'topic_level', slug: 'antimicrobianos', level: 4 },
      { kind: 'study_pref', slug: 'formato', value: 'resumo' },
      { kind: 'study_pref', slug: 'ritmo', value: 'curto' },
      { kind: 'goal', slug: 'prova' },
    ]);
    assert.ok(findAll(env.cardOf(), byClass('memory-item')).length >= 3, 'os itens salvos aparecem na lista');
    assert.match(env.status().textContent, /Salvo/);
  } finally {
    env.teardown();
  }
});

// ---------------------------------------------------------------------------
// Erros por code, troca de conta e respostas atrasadas
// ---------------------------------------------------------------------------
test('erro de ação mostra mensagem por code e mantém a tela; MEMORY_DISABLED na ação esconde o cartão', async () => {
  const cases = [['RATE_LIMIT', /muitas operações/], ['MEMORY_UNAVAILABLE', /indisponível agora/], ['MEMORY_FULL', /limite de itens/], ['VALIDATION', /da lista/]];
  for (const [code, pattern] of cases) {
    const env = setup({ apiMemoryGet: ACTIVE_GET(), apiMemoryDeleteAll: { success: false, code, message: 'texto cru' } });
    try {
      const card = await openProfile(env, 'err-' + code);
      await env.press(card, 'delete-all');
      await env.confirmLast();
      assert.match(env.status().textContent, pattern, code);
      assert.equal(env.status().getAttribute('data-kind'), 'error');
      assert.ok(!env.status().textContent.includes('texto cru'));
      assert.equal(findAll(env.cardOf(), byClass('memory-item')).length, 2, 'a lista segue igual');
      assert.equal(find(env.cardOf(), byKey('delete-all')).disabled, false, 'os botões voltam a funcionar');
    } finally {
      env.teardown();
    }
  }
  const gone = setup({ apiMemoryGet: ACTIVE_GET(), apiMemoryDeleteAll: { success: false, code: 'MEMORY_DISABLED', reason: 'flag', message: 'x' } });
  try {
    const card = await openProfile(gone, 'gone-1');
    await gone.press(card, 'delete-all');
    await gone.confirmLast();
    assert.equal(gone.cardOf(), null, 'a memória foi desligada no servidor: o cartão some');
    await Memory.ensureMemory();
    assert.equal(gone.count('apiMemoryGet'), 1);
  } finally {
    gone.teardown();
  }
});

test('CONSENT_REQUIRED ao salvar avisa e recarrega o estado', async () => {
  const env = setup({ apiMemoryGet: GET({ consent: ACTIVE }), apiMemorySetPreference: { success: false, code: 'CONSENT_REQUIRED', message: 'x' } });
  try {
    const card = await openProfile(env, 'req-1');
    find(card, (n) => n.id === 'memory-goal-slug').value = 'prova';
    find(card, (n) => n.tag === 'form' && n.attrs['aria-labelledby'] === 'memory-goal-title').listeners.submit[0]({ preventDefault() {} });
    await settle();
    assert.match(env.status().textContent, /Ative a memória/);
    assert.equal(env.count('apiMemoryGet'), 2);
  } finally {
    env.teardown();
  }
});

test('trocar de conta ou sair remove o cartão e o estado da anterior; nada fica guardado', async () => {
  const env = setup({ apiMemoryGet: ACTIVE_GET() });
  try {
    await openProfile(env, 'acct-a');
    assert.ok(env.cardOf());
    env.login('acct-b');
    assert.equal(env.cardOf(), null, 'o cartão da conta anterior some na hora');
    await Memory.ensureMemory();
    assert.ok(env.cardOf());
    Memory.reset();
    assert.equal(env.cardOf(), null, 'reset() (logout/expiração) limpa o cartão');
    env.login('acct-c');
    await Memory.ensureMemory();
    assert.equal(env.count('apiMemoryGet'), 3, 'conta nova pede de novo');
  } finally {
    env.teardown();
  }
});

test('resposta que chega depois de trocar de conta é descartada (carga e ação)', async () => {
  let release;
  const slow = setup({ apiMemoryGet: () => new Promise((resolve) => { release = resolve; }) });
  try {
    slow.login('late-a');
    const pending = Memory.ensureMemory();
    slow.login('late-b');
    release(ACTIVE_GET());
    await pending;
    await settle();
    assert.equal(slow.cardOf(), null, 'a carga da conta A não monta cartão na conta B');
  } finally {
    slow.teardown();
  }
  let releaseDelete;
  const env = setup({ apiMemoryGet: ACTIVE_GET(), apiMemoryDeleteAll: () => new Promise((resolve) => { releaseDelete = resolve; }) });
  try {
    const card = await openProfile(env, 'act-a');
    await env.press(card, 'delete-all');
    await env.confirmLast();
    env.login('act-b');
    releaseDelete({ success: true, deleted: 2 });
    await settle();
    assert.equal(env.cardOf(), null);
    assert.equal(findAll(card, byClass('memory-item')).length, 2, 'o cartão antigo não foi mexido pela resposta atrasada');
  } finally {
    env.teardown();
  }
});

test('enquanto uma chamada está em voo os botões ficam desligados e um segundo clique é ignorado', async () => {
  let release;
  const env = setup({ apiMemoryGet: ACTIVE_GET(), apiMemoryDeleteAll: () => new Promise((resolve) => { release = resolve; }) });
  try {
    const card = await openProfile(env, 'busy-1');
    await env.press(card, 'delete-all');
    await env.confirmLast();
    assert.equal(find(card, byKey('revoke')).disabled, true);
    assert.equal(card.getAttribute('aria-busy'), 'true');
    find(card, byKey('delete-all')).listeners.click[0]();
    await env.confirmLast().catch(() => {});
    assert.equal(env.calls.filter((c) => c.action === 'apiMemoryDeleteAll').length, 1);
    release({ success: true, deleted: 2 });
    await settle();
    assert.equal(env.cardOf().getAttribute('aria-busy'), 'false');
  } finally {
    env.teardown();
  }
});

test('reveal(): leva o foco ao título do cartão, agora ou assim que ele montar', async () => {
  const env = setup({ apiMemoryGet: GET() });
  try {
    env.login('reveal-1');
    Memory.reveal();
    await Memory.ensureMemory();
    const title = find(env.cardOf(), byKey('title'));
    assert.equal(env.doc.activeElement, title);
    assert.equal(title.scrolled, true);
    env.doc.activeElement = env.doc.body;
    Memory.reveal();
    assert.equal(env.doc.activeElement, title);
  } finally {
    env.teardown();
  }
});

// ---------------------------------------------------------------------------
// Selo e atalho no Tutor
// ---------------------------------------------------------------------------
test('Tutor: o selo mostra a contagem quando há e o atalho "Gerenciar memória" leva ao Perfil e foca o cartão', () => {
  const env = makeDoc();
  const shown = [];
  globalThis.App = { showPanel: (id) => shown.push(id) };
  let revealed = 0;
  globalThis.LaiftMemory = { reveal: () => { revealed += 1; } };
  try {
    const answer = (memory) => Tutor.renderTutor(env.doc, Tutor.classify({ success: true, reply: 'ok', sources: [], memory }));
    const badge = (msg) => find(msg, byClass('agents-tutor-memory'));
    assert.equal(badge(answer({ available: true, used: true, count: 3 })).textContent, 'Usou sua memória de estudo (3 itens)');
    assert.equal(badge(answer({ available: true, used: true, count: 1 })).textContent, 'Usou sua memória de estudo (1 item)');
    assert.equal(badge(answer({ available: true, used: true })).textContent, 'Usou sua memória de estudo');
    assert.equal(badge(answer({ available: true, used: true, count: -2 })).textContent, 'Usou sua memória de estudo');
    assert.equal(badge(answer({ available: true, used: true, count: '<b>9</b>' })).textContent, 'Usou sua memória de estudo');
    assert.equal(badge(answer({ available: true, used: false, count: 3 })), null, 'sem uso, sem selo e sem atalho');
    assert.equal(find(answer({ available: true, used: false }), byClass('agents-tutor-memory-link')), null);
    const link = find(answer({ available: true, used: true, count: 2 }), byClass('agents-tutor-memory-link'));
    assert.equal(link.textContent, 'Gerenciar memória');
    assert.equal(link.type, 'button');
    link.listeners.click[0]();
    assert.deepEqual(shown, ['panel-profile']);
    assert.equal(revealed, 1);
    delete globalThis.LaiftMemory;
    link.listeners.click[0]();
    assert.equal(shown.length, 2, 'sem o módulo de memória, só navega');
  } finally {
    delete globalThis.App;
    delete globalThis.LaiftMemory;
  }
});

// ---------------------------------------------------------------------------
// Regras do arquivo e da integração
// ---------------------------------------------------------------------------
test('memory.js: sem innerHTML, sem armazenamento do navegador, sem eval, sem rede própria; só tokens no CSS', () => {
  const js = read('frontend/memory.js') + read('frontend/memory-core.js');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(js, /console\./);
  assert.doesNotMatch(js, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/, 'a exportação não é enviada a lugar nenhum');
  const css = read('frontend/memory.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, 'cores só pelos tokens do projeto');
  assert.match(css, /scroll-margin-bottom/, 'o foco não para atrás da barra inferior');
  ['frontend/memory.js', 'frontend/memory-core.js', 'frontend/memory.css'].forEach((file) => {
    const src = read(file);
    assert.ok(src.split('\n').length < 800, file);
    assert.match(src, /^\/\*\r?\n \* Plataforma de Membros LAIFT\r?\n \* © 2026 Daniel Pires Francisco/, file);
  });
  assert.equal(Core.CONSENT_SECTIONS, Memory.CONSENT_SECTIONS, 'o texto da finalidade existe em um único lugar');
  assert.doesNotMatch(read('frontend/memory.js'), /Para que serve|O que NÃO guardamos/, 'o texto não é copiado no controlador');
});

test('as ações de memória NÃO entram na ponte dos módulos nem na lista da Lia', () => {
  const app = read('frontend/app.js');
  assert.doesNotMatch(app, /apiMemory/);
  const allow = new RegExp(app.match(/LEARNING_API_ALLOWLIST = \/(.+)\/;/)[1]);
  ['apiMemoryGet', 'apiMemorySetConsent', 'apiMemoryDeleteItem', 'apiMemoryDeleteAll', 'apiMemorySetPreference', 'apiMemoryExport']
    .forEach((action) => assert.equal(allow.test(action), false, action));
  assert.doesNotMatch(read('frontend/assistant.js'), /apiMemory|memory\.js|LaiftMemory/);
  assert.doesNotMatch(read('frontend/modulos/shared/laift-identity.js'), /apiMemory/);
  const Lia = require('../assistant.js');
  assert.ok(Lia.ACTION_KEYS.every((key) => !/memor/i.test(key)));
});

test('app.js limpa o cartão e a conversa do Tutor no logout e na expiração', () => {
  const app = read('frontend/app.js');
  assert.equal((app.match(/\n\s+resetAgentCards\(\);/g) || []).length, 2, 'logout e sessão expirada');
  assert.match(app, /function resetAgentCards\(\) \{[\s\S]*?LaiftMemory\.reset\(\)[\s\S]*?LaiftAgentsTutor\.syncSession\(\)/);
});

test('memory.js/.css estão no index.html, no build e no precache; o grid do Perfil tem id; cache do SW subiu; CSP sem domínio novo', () => {
  const html = read('frontend/index.html');
  assert.ok(html.includes('<script src="memory.js" defer></script>'));
  assert.ok(html.includes('<link rel="stylesheet" href="memory.css">'));
  assert.ok(html.includes('<div class="grid-2" id="profile-grid">'));
  assert.ok(html.includes('<script src="memory-core.js" defer></script>'));
  assert.ok(html.indexOf('<script src="memory-core.js"') < html.indexOf('<script src="memory.js"'));
  assert.ok(html.indexOf('<script src="memory.js"') < html.indexOf('<script src="app.js"'));
  const build = read('frontend/scripts/build.js');
  assert.ok(build.includes("'memory-core.js'") && build.includes("'memory.js'") && build.includes("'memory.css'"));
  const sw = read('frontend/sw.js');
  assert.ok(sw.includes("'memory-core.js'") && sw.includes("'memory.js'") && sw.includes("'memory.css'"));
  assert.match(sw, /CACHE_NAME = CACHE_PREFIX \+ 'v9'/);
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.doesNotMatch(csp, /memory|neon|groq/i);
  assert.match(csp, /script-src 'self' https:\/\/challenges\.cloudflare\.com;/);
});
