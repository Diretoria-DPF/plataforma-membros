/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Moderação da Lia (frontend/assistant-moderation.js): o controlador (createModeration)
// com um DOM falso mínimo, e as regras de fonte do módulo. As funções puras de formatação
// e validação são cobertas em assistant.test.mjs, que as importa deste módulo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Moderation = require('../assistant-moderation.js');

const BACK = 'O chat voltou ao normal. Pode perguntar à vontade.';
const inOneHour = () => Date.now() + 60 * 60 * 1000;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** Nó falso: classes, atributos, filhos, listeners e contagem de foco. Só para os testes. */
function fakeNode(tag) {
  let className = '';
  let classes = new Set();
  const node = {
    tag,
    attrs: {},
    children: [],
    listeners: {},
    focused: 0,
    value: '',
    textContent: '',
    disabled: false,
    get className() { return className; },
    set className(value) {
      className = String(value);
      classes = new Set(className.split(/\s+/).filter(Boolean));
    },
    classList: {
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : !!force;
        if (on) classes.add(name); else classes.delete(name);
        return on;
      },
      contains: (name) => classes.has(name),
    },
    setAttribute(key, value) { node.attrs[key] = String(value); },
    appendChild(child) { node.children.push(child); return child; },
    addEventListener(type, fn) { (node.listeners[type] = node.listeners[type] || []).push(fn); },
    dispatch(type, evt) { (node.listeners[type] || []).forEach((fn) => fn(evt || { preventDefault() {} })); },
    focus() { node.focused += 1; },
    contains: () => false,
  };
  return node;
}

function fakeDoc() {
  return { activeElement: null, createElement: (tag) => fakeNode(tag) };
}

/** Acha o primeiro nó com a classe, em profundidade. */
function find(node, className) {
  if (node.classList.contains(className)) return node;
  for (const child of node.children) {
    const hit = find(child, className);
    if (hit) return hit;
  }
  return null;
}

/** Contexto do chat: conta chamadas e responde à API pela função `api`. */
function fakeCtx(api = () => ({})) {
  const calls = { sync: 0, restLia: 0, lia: [], note: [], api: [] };
  const input = fakeNode('input');
  const panel = fakeNode('section');
  const app = {
    getState: () => ({ profile: { role: 'member' }, sessionToken: 'tok' }),
    callApi: (name, ...args) => {
      calls.api.push([name, ...args]);
      return Promise.resolve(api(name, ...args));
    },
  };
  const ctx = {
    doc: fakeDoc(),
    app,
    input,
    panel,
    token: () => 'tok',
    isOpen: () => true,
    sync: () => { calls.sync += 1; },
    restLia: () => { calls.restLia += 1; },
    lia: (method) => { calls.lia.push(method); },
    note: (text) => { calls.note.push(text); },
  };
  return { ctx, calls, input };
}

test('warningBand: faixa com papel de status, ícone escondido e texto "Aviso N de 3" (nunca só cor)', () => {
  const band = Moderation.warningBand(fakeDoc(), 2);
  assert.equal(band.classList.contains('lia-warning-2'), true);
  assert.equal(band.attrs.role, 'status');
  assert.equal(band.children[0].attrs['aria-hidden'], 'true');
  assert.equal(band.children[1].textContent, 'Aviso 2 de 3');
});

test('suspender: mostra o bloco com o horário de retorno, sincroniza os campos, repousa a Lia e foca "Pedir redenção"', () => {
  const { ctx, calls } = fakeCtx();
  const m = Moderation.createModeration(ctx);
  try {
    m.suspend(inOneHour(), 0);
    assert.equal(m.isSuspended(), true);
    assert.equal(m.root.classList.contains('hidden'), false);
    assert.match(find(m.root, 'lia-redeem-return').textContent, /suspenso até \d{2}\/\d{2} às \d{2}:\d{2} \(horário de Brasília\)/);
    assert.equal(calls.restLia, 1);
    assert.ok(calls.sync >= 1);
    assert.equal(m.openButton.focused, 1);
  } finally {
    m.stop();
  }
});

test('com o painel fechado, a suspensão só fica guardada: nada é pintado, a Lia não reage', () => {
  const { ctx, calls } = fakeCtx();
  ctx.isOpen = () => false;
  const m = Moderation.createModeration(ctx);
  m.suspend(inOneHour(), 0);
  assert.equal(m.isSuspended(), true);
  assert.equal(m.root.classList.contains('hidden'), true);
  assert.equal(calls.restLia, 0);
  assert.equal(calls.sync, 0);
});

test('redenção aceita: a explicação vai com a sessão da pessoa, a suspensão sai, a Lia reage e o foco volta à pergunta', async () => {
  const { ctx, calls, input } = fakeCtx((name) => (name === 'apiAssistantRedeem' ? { success: true, accepted: true, message: 'ok' } : {}));
  const m = Moderation.createModeration(ctx);
  try {
    m.suspend(inOneHour(), 0);
    const area = find(m.root, 'lia-redeem-text');
    area.value = 'Errei ao xingar a colega. Vou responder com respeito daqui em diante.';
    find(m.root, 'lia-redeem-form').dispatch('submit');
    await tick();
    const [name, token, body] = calls.api.find((c) => c[0] === 'apiAssistantRedeem');
    assert.equal(name, 'apiAssistantRedeem');
    assert.equal(token, 'tok');
    assert.match(body.message, /Errei ao xingar/);
    assert.equal(m.isSuspended(), false);
    assert.equal(m.root.classList.contains('hidden'), true);
    assert.deepEqual(calls.lia, ['redeem']);
    assert.deepEqual(calls.note, [BACK]);
    assert.equal(input.focused, 1);
    assert.equal(area.value, '');
  } finally {
    m.stop();
  }
});

test('recusa com espera: mostra a mensagem e a contagem, trava o envio e não reenvia sozinho', async () => {
  const { ctx } = fakeCtx((name) => (name === 'apiAssistantRedeem'
    ? { success: true, accepted: false, retryAfterSeconds: 3, message: 'Tente de novo.' }
    : {}));
  const m = Moderation.createModeration(ctx);
  try {
    m.suspend(inOneHour(), 0);
    find(m.root, 'lia-redeem-text').value = 'Peço desculpas e vou manter o respeito com a equipe.';
    find(m.root, 'lia-redeem-form').dispatch('submit');
    await tick();
    assert.equal(find(m.root, 'lia-redeem-status').textContent, 'Tente de novo.');
    assert.equal(find(m.root, 'lia-redeem-timer').textContent, 'Você poderá tentar de novo em 3 s.');
    assert.equal(find(m.root, 'lia-redeem-send').disabled, true);
    assert.equal(m.isSuspended(), true);
  } finally {
    m.stop();
  }
});

test('consulta ao abrir: uma vez por conta; restaura a suspensão; sair da conta zera e a próxima conta consulta de novo', async () => {
  const asked = [];
  const { ctx } = fakeCtx((name, token) => {
    asked.push(token);
    return { success: true, moderated: true, level: 3, suspended: true, until: new Date(inOneHour()).toISOString(), retryAfterSeconds: 0 };
  });
  const m = Moderation.createModeration(ctx);
  try {
    m.checkOnOpen();
    m.checkOnOpen();
    await tick();
    assert.deepEqual(asked, ['tok']);
    assert.equal(m.isSuspended(), true);
    m.reset();
    assert.equal(m.isSuspended(), false);
    m.checkOnOpen();
    await tick();
    assert.deepEqual(asked, ['tok', 'tok']);
  } finally {
    m.stop();
  }
});

test('relógio: com o painel aberto, a suspensão acaba no horário e o chat volta com a mensagem de retorno', async () => {
  const { ctx, calls } = fakeCtx();
  const m = Moderation.createModeration(ctx);
  try {
    m.suspend(Date.now() + 60, 0);
    await tick(150);
    assert.equal(m.isSuspended(), false);
    assert.deepEqual(calls.note, [BACK]);
  } finally {
    m.stop();
  }
});

test('assistant-moderation.js não converte texto em HTML, não guarda nada, não cria links e não usa intervalo', () => {
  const src = read('frontend/assistant-moderation.js');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(src, /el\(doc, 'a'|\.href\s*=/);
  assert.doesNotMatch(src, /setInterval/);
});

test('assistant-moderation.js segue o padrão dos módulos irmãos: window.AssistantModeration ou module.exports', () => {
  const src = read('frontend/assistant-moderation.js');
  assert.match(src, /root\.AssistantModeration = api;/);
  assert.match(src, /module\.exports = api;/);
});
