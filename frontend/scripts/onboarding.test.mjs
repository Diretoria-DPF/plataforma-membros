/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Onboarding por papel (frontend/onboarding.js): <dialog> com showModal() na primeira entrada
// autenticada; 3 a 4 passos por papel; "visto" por perfil em localStorage (conveniência).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Onboarding = require('../onboarding.js');

const HTML = read('frontend/index.html');
const SOURCE = read('frontend/onboarding.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ---------- DOM mínimo ----------
function fakeNode(tag, doc) {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attrs: {},
    listeners: {},
    classes: new Set(),
    style: {},
    text: '',
    id: '',
    type: '',
    disabled: false,
    ownerDocument: doc,
  };
  node.classList = {
    add: (c) => node.classes.add(c),
    remove: (c) => node.classes.delete(c),
    contains: (c) => node.classes.has(c),
  };
  node.setAttribute = (k, v) => { node.attrs[k] = String(v); };
  node.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(node.attrs, k) ? node.attrs[k] : null);
  node.removeAttribute = (k) => { delete node.attrs[k]; };
  node.appendChild = (child) => { node.children.push(child); return child; };
  node.addEventListener = (type, fn) => { (node.listeners[type] ||= []).push(fn); };
  node.fire = (type, evt) => (node.listeners[type] || []).forEach((fn) => fn(evt || { type, target: node, preventDefault() {} }));
  node.click = () => node.fire('click', { type: 'click', target: node, preventDefault() {} });
  node.focus = () => { doc.activeElement = node; };
  Object.defineProperty(node, 'textContent', {
    get() { return node.text + node.children.map((c) => c.textContent).join(''); },
    set(value) { node.text = String(value); node.children = []; },
  });
  if (tag === 'dialog') {
    node.open = false;
    node.showModal = () => { if (node.open) throw new Error('já aberto'); node.open = true; };
    node.close = () => {
      if (!node.open) return;
      node.open = false;
      node.fire('close');
    };
  }
  return node;
}

function fakeDocument({ dialogSupported = true, flags = [] } = {}) {
  const doc = { activeElement: null };
  doc.body = fakeNode('body', doc);
  doc.documentElement = { hasAttribute: (name) => flags.includes(name) };
  doc.createElement = (tag) => {
    if (tag === 'dialog' && !dialogSupported) return fakeNode('unknown', doc);
    return fakeNode(tag, doc);
  };
  return doc;
}

function allNodes(node, out = []) {
  out.push(node);
  node.children.forEach((c) => allNodes(c, out));
  return out;
}

function dialogOf(doc) {
  return doc.body.children.find((c) => c.tagName === 'DIALOG');
}

function buttonNamed(dialog, label) {
  const found = allNodes(dialog).find((n) => n.tagName === 'BUTTON' && n.textContent === label);
  assert.ok(found, `botão "${label}" não encontrado`);
  return found;
}

function progressOf(dialog) {
  return allNodes(dialog).find((n) => n.classes.has('onboarding-progress')).textContent;
}

function memoryStorage({ throws = false } = {}) {
  const data = {};
  return {
    data,
    getItem(key) { if (throws) throw new Error('bloqueado'); return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { if (throws) throw new Error('bloqueado'); data[key] = String(value); },
  };
}

function setup({ flags = [], chatbot = false, dialogSupported = true, storage = memoryStorage() } = {}) {
  const doc = fakeDocument({ dialogSupported, flags });
  let opened = 0;
  const win = chatbot ? { LaiftAssistant: { open() { opened += 1; } } } : {};
  const api = Onboarding.createOnboarding(doc, win, Onboarding.createSeenStore(storage));
  return { doc, api, storage, win, openedLia: () => opened };
}

const CHATBOT_FLAG = 'data-flag-chatbot-enabled';

// ---------- papéis e passos ----------
test('normalizeRole: papel desconhecido ou ausente cai em visitante', () => {
  assert.equal(Onboarding.normalizeRole('member'), 'member');
  assert.equal(Onboarding.normalizeRole('admin'), 'admin');
  assert.equal(Onboarding.normalizeRole('root'), 'visitor');
  assert.equal(Onboarding.normalizeRole(undefined), 'visitor');
});

test('cada papel tem 3 passos com a flag da Lia desligada e 4 com ela ligada', () => {
  for (const role of ['visitor', 'member', 'admin']) {
    assert.equal(Onboarding.stepsFor(role, { chatbotOn: false }).length, 3, `${role} sem Lia`);
    assert.equal(Onboarding.stepsFor(role, { chatbotOn: true }).length, 4, `${role} com Lia`);
  }
});

test('o passo da Lia só aparece com a flag ligada, e o último passo é sempre o crachá', () => {
  const off = Onboarding.stepsFor('member', { chatbotOn: false });
  assert.equal(off.some((s) => s.kind === 'lia'), false);
  const on = Onboarding.stepsFor('member', { chatbotOn: true });
  assert.equal(on.some((s) => s.kind === 'lia'), true);
  for (const role of ['visitor', 'member', 'admin']) {
    const steps = Onboarding.stepsFor(role, { chatbotOn: true });
    assert.equal(steps[steps.length - 1].kind, 'credential');
  }
});

test('os passos são diferentes por papel (título de entrada e conteúdo)', () => {
  const intros = ['visitor', 'member', 'admin'].map((r) => Onboarding.stepsFor(r, { chatbotOn: false })[0].title);
  assert.equal(new Set(intros).size, 3);
  const contents = ['visitor', 'member', 'admin'].map((r) => Onboarding.stepsFor(r, { chatbotOn: false })[1].body);
  assert.equal(new Set(contents).size, 3);
});

test('textos em PT-BR curtos e sem dado pessoal (nenhum e-mail, telefone ou número longo)', () => {
  for (const role of ['visitor', 'member', 'admin']) {
    for (const step of Onboarding.stepsFor(role, { chatbotOn: true })) {
      assert.ok(step.title.length > 0 && step.body.length > 0);
      assert.ok(step.body.length <= 220, `texto longo demais: ${step.body.length}`);
      assert.doesNotMatch(step.body, /@|\d{6,}/);
    }
  }
});

test('storage: chave por perfil e ids fora do formato não são aceitos', () => {
  assert.equal(Onboarding.storageKey('abc-123'), 'laift_onboarding_seen_abc-123');
  assert.equal(Onboarding.isUsableId(''), false);
  assert.equal(Onboarding.isUsableId('a b'), false);
  assert.equal(Onboarding.isUsableId(null), false);
  assert.equal(Onboarding.isUsableId({}), false);
  assert.equal(Onboarding.isUsableId('123e4567-e89b-12d3-a456-426614174000'), true);
});

// ---------- exibição ----------
test('primeira entrada: abre o diálogo com showModal, passo 1 de 3 para membro', () => {
  const { doc, api } = setup();
  assert.equal(api.maybeShow({ role: 'member', profileId: 'p1' }), true);
  const dialog = dialogOf(doc);
  assert.equal(dialog.open, true);
  assert.equal(progressOf(dialog), 'Passo 1 de 3');
  assert.equal(dialog.getAttribute('aria-labelledby'), 'onboarding-title');
});

test('perfil que já viu não é exibido de novo; o "visto" fica por perfil', () => {
  const { api, storage, doc } = setup();
  api.maybeShow({ role: 'visitor', profileId: 'p1' });
  buttonNamed(dialogOf(doc), 'Pular').click();
  assert.equal(storage.data['laift_onboarding_seen_p1'], '1');
  assert.equal(api.maybeShow({ role: 'visitor', profileId: 'p1' }), false);
  assert.equal(api.maybeShow({ role: 'visitor', profileId: 'p2' }), true, 'outro perfil ainda não viu');
});

test('"Pular" fecha e marca como visto', () => {
  const s = setup();
  const { api, doc } = s;
  api.maybeShow({ role: 'member', profileId: 'p1' });
  buttonNamed(dialogOf(doc), 'Pular').click();
  assert.equal(dialogOf(doc).open, false);
  assert.equal(s.storage.data['laift_onboarding_seen_p1'], '1');
});

test('Próximo avança até o último passo, que termina com "Concluir"', () => {
  const { api, doc } = setup();
  api.maybeShow({ role: 'admin', profileId: 'p1' });
  const dialog = dialogOf(doc);
  buttonNamed(dialog, 'Próximo').click();
  assert.equal(progressOf(dialog), 'Passo 2 de 3');
  buttonNamed(dialog, 'Próximo').click();
  assert.equal(progressOf(dialog), 'Passo 3 de 3');
  buttonNamed(dialog, 'Concluir').click();
  assert.equal(dialog.open, false);
});

test('"Voltar" volta um passo', () => {
  const { api, doc } = setup();
  api.maybeShow({ role: 'visitor', profileId: 'p1' });
  const dialog = dialogOf(doc);
  buttonNamed(dialog, 'Próximo').click();
  buttonNamed(dialog, 'Voltar').click();
  assert.equal(progressOf(dialog), 'Passo 1 de 3');
});

test('passo do crachá tem data-open-credential (delegação de credential.js) e fecha o diálogo', () => {
  const { api, doc, storage } = setup();
  api.maybeShow({ role: 'member', profileId: 'p1' });
  const dialog = dialogOf(doc);
  buttonNamed(dialog, 'Próximo').click();
  buttonNamed(dialog, 'Próximo').click();
  const action = buttonNamed(dialog, 'Abrir meu crachá');
  assert.equal(action.getAttribute('data-open-credential'), '');
  action.click();
  assert.equal(dialog.open, false);
  assert.equal(storage.data['laift_onboarding_seen_p1'], '1');
});

test('passo da Lia abre a Lia (LaiftAssistant.open) e fecha o diálogo, sem data-open-credential', () => {
  const { api, doc, openedLia } = setup({ flags: [CHATBOT_FLAG], chatbot: true });
  api.maybeShow({ role: 'member', profileId: 'p1' });
  const dialog = dialogOf(doc);
  buttonNamed(dialog, 'Próximo').click();
  buttonNamed(dialog, 'Próximo').click();
  buttonNamed(dialog, 'Abrir a Lia').click();
  assert.equal(openedLia(), 1);
  assert.equal(dialog.open, false);
});

test('Esc (fechamento nativo do dialog) também marca como visto', () => {
  const s = setup();
  s.api.maybeShow({ role: 'visitor', profileId: 'p1' });
  const dialog = dialogOf(s.doc);
  dialog.open = false;
  dialog.fire('close');
  assert.equal(s.storage.data['laift_onboarding_seen_p1'], '1');
});

test('reset() fecha o diálogo sem marcar como visto, e a próxima entrada volta a exibir', () => {
  const s = setup();
  s.api.maybeShow({ role: 'visitor', profileId: 'p1' });
  s.api.reset();
  assert.equal(dialogOf(s.doc).open, false);
  assert.equal(s.storage.data['laift_onboarding_seen_p1'], undefined);
  assert.equal(s.api.maybeShow({ role: 'visitor', profileId: 'p1' }), true);
});

test('não reabre enquanto já está aberto, e não exibe sem identificador de perfil', () => {
  const { api } = setup();
  assert.equal(api.maybeShow({ role: 'member', profileId: 'p1' }), true);
  assert.equal(api.maybeShow({ role: 'member', profileId: 'p1' }), false);
  assert.equal(api.maybeShow({ role: 'member' }), false);
});

test('sem flag do chatbot, o passo da Lia nunca aparece mesmo com a Lia carregada', () => {
  const { api, doc } = setup({ chatbot: true });
  api.maybeShow({ role: 'member', profileId: 'p1' });
  assert.equal(progressOf(dialogOf(doc)), 'Passo 1 de 3');
  const titles = allNodes(dialogOf(doc)).filter((n) => n.tagName === 'BUTTON').map((n) => n.textContent);
  assert.equal(titles.includes('Abrir a Lia'), false);
});

// ---------- degradação ----------
test('storage bloqueado (getItem/setItem lançam): exibe mesmo assim e não lança erro', () => {
  const { api, doc } = setup({ storage: memoryStorage({ throws: true }) });
  assert.equal(api.maybeShow({ role: 'member', profileId: 'p1' }), true);
  assert.doesNotThrow(() => buttonNamed(dialogOf(doc), 'Pular').click());
});

test('navegador sem <dialog> com showModal: não exibe e não lança erro', () => {
  const { api, doc } = setup({ dialogSupported: false });
  assert.equal(api.maybeShow({ role: 'member', profileId: 'p1' }), false);
  assert.equal(doc.body.children.length, 0);
});

// ---------- página ----------
test('index.html carrega onboarding.js com defer depois de assistant.js', () => {
  const idx = HTML.indexOf('src="onboarding.js"');
  assert.ok(idx > 0, 'script onboarding.js ausente em index.html');
  assert.match(HTML.slice(idx - 20, idx + 40), /defer/);
  assert.ok(HTML.indexOf('src="assistant.js"') < idx, 'onboarding.js precisa vir depois de assistant.js');
});

test('onboarding.js: sem innerHTML, eval ou handler inline; usa showModal e alvos de 44 px', () => {
  assert.doesNotMatch(SOURCE, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function/);
  assert.doesNotMatch(SOURCE, /\son[a-z]+\s*=/);
  assert.match(SOURCE, /showModal\(\)/);
  assert.match(SOURCE, /44px/);
  assert.doesNotMatch(SOURCE, /client_events/);
});
