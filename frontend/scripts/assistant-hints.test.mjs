/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Dica contextual da Lia (frontend/assistant-hints.js, plano §3.4): mapa de painel e módulo para
// texto fixo, uma vez por módulo por sessão, condições de exibição, balão de 8 s e limpeza do timer.
// O DOM real é coberto pelo e2e (assistant.e2e.js); aqui um documento mínimo basta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Hints = require('../assistant-hints.js');
const States = require('../modulos/shared/lia/lia-states.js');

const ON = Object.freeze({ chatbot_enabled: true, panelOpen: false, moderated: false });
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Documento mínimo: createElement, textContent, atributos, eventos, appendChild e remove. */
function fakeDoc() {
  function node(tag) {
    const n = {
      tag, className: '', textContent: '', children: [], attrs: {}, listeners: {}, parent: null,
      setAttribute(name, value) { n.attrs[name] = String(value); },
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(n.attrs, name) ? n.attrs[name] : null; },
      addEventListener(type, fn) { (n.listeners[type] = n.listeners[type] || []).push(fn); },
      appendChild(child) { child.parent = n; n.children.push(child); return child; },
      remove() {
        if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n);
        n.parent = null;
      },
      click() { (n.listeners.click || []).forEach((fn) => fn({ type: 'click' })); },
    };
    return n;
  }
  const body = node('body');
  return { body, createElement: node };
}

/** Balões de dica presentes no corpo do documento falso. */
const bubbles = (doc) => doc.body.children.filter((c) => c.className.split(' ').includes('lia-hint'));

/** Primeiro descendente (ou o próprio nó) com a classe dada. */
function find(n, cls) {
  if (n.className.split(' ').includes(cls)) return n;
  for (const child of n.children) {
    const hit = find(child, cls);
    if (hit) return hit;
  }
  return null;
}

/** Timers controlados: set/clear ficam registrados; fire() dispara os que estiverem pendentes. */
function fakeTimers() {
  const pending = new Map();
  const log = { set: [], clear: [] };
  let next = 1;
  return {
    log,
    pending,
    set(fn, ms) {
      const id = next;
      next += 1;
      pending.set(id, fn);
      log.set.push(ms);
      return id;
    },
    clear(id) {
      log.clear.push(id);
      pending.delete(id);
    },
    fire() {
      [...pending.entries()].forEach(([id, fn]) => {
        pending.delete(id);
        fn();
      });
    },
  };
}

/** Controlador com documento, timers e flags falsos; as flags podem ser trocadas em tempo de teste. */
function makeHints() {
  const doc = fakeDoc();
  const timers = fakeTimers();
  const opened = [];
  let flags = { ...ON };
  const hints = Hints.createHints({
    doc, timers, flags: () => flags, onOpen: (text) => opened.push(text),
  });
  return { doc, timers, opened, hints, setFlags: (next) => { flags = next; } };
}

/** Regra CSS (corpo entre chaves) do seletor exato; vazio se não existir. */
function ruleOf(css, selector) {
  const escaped = selector.replace(/\./g, '\\.');
  const match = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  return match ? match[1] : '';
}

// ---------- Mapas e textos ----------

test('mapa de textos: os seis contextos com o texto exato do plano, congelado', () => {
  assert.deepEqual(Hints.HINT_TEXT, {
    events: 'Quer ajuda com sua inscrição?',
    proposals: 'Posso te levar para criar uma proposta.',
    learn: 'Quer sugestão por onde começar a estudar?',
    lab: 'Dúvida sobre vidraria ou preparo?',
    clinic: 'Quer revisar um caso antes?',
    atlas: 'Posso explicar alguma estrutura?',
  });
  assert.equal(Object.isFrozen(Hints.HINT_TEXT), true);
});

test('cada contexto de dica é um módulo da Lia (lia-states.js), para o react() aceitar', () => {
  for (const context of Object.keys(Hints.HINT_TEXT)) assert.equal(States.isModule(context), true, context);
});

test('painel → contexto: Eventos, Propostas e Aprender; os demais painéis não têm dica', () => {
  assert.equal(Hints.contextForPanel('panel-events'), 'events');
  assert.equal(Hints.contextForPanel('panel-proposals'), 'proposals');
  assert.equal(Hints.contextForPanel('panel-learn'), 'learn');
  for (const panel of ['panel-home', 'panel-messages', 'panel-admin-users', '__proto__', 'constructor', '', undefined, null]) {
    assert.equal(Hints.contextForPanel(panel), '', String(panel));
  }
});

test('módulo → contexto: Laboratório, Clínica e Atlas; Farmacologia e Toxicologia caem em Aprender', () => {
  assert.equal(Hints.contextForModule('lab'), 'lab');
  assert.equal(Hints.contextForModule('clinica'), 'clinic');
  assert.equal(Hints.contextForModule('anatomia'), 'atlas');
  assert.equal(Hints.contextForModule('farmaco'), 'learn');
  assert.equal(Hints.contextForModule('toxico'), 'learn');
  for (const mod of ['', 'nao-existe', '__proto__', undefined, null]) {
    assert.equal(Hints.contextForModule(mod), '', String(mod));
  }
});

test('hintFor: contexto com dica devolve contexto e texto; sem dica devolve null', () => {
  assert.deepEqual(Hints.hintFor('lab'), { context: 'lab', text: 'Dúvida sobre vidraria ou preparo?' });
  assert.equal(Hints.hintFor('home'), null);
  assert.equal(Hints.hintFor('__proto__'), null);
  assert.equal(Hints.hintFor(undefined), null);
});

test('os painéis e os módulos do mapa existem de verdade (index.html e learning.js)', () => {
  const html = read('frontend/index.html');
  for (const panel of ['panel-events', 'panel-proposals', 'panel-learn']) {
    assert.match(html, new RegExp('id="' + panel + '"'));
  }
  const learning = read('frontend/learning.js');
  for (const mod of ['farmaco', 'toxico', 'clinica', 'lab', 'anatomia']) {
    assert.match(learning, new RegExp("id: '" + mod + "'"));
  }
});

// ---------- Condições de exibição ----------

test('shouldShow: só com a Lia ligada, painel da Lia fechado, sem suspensão e contexto ainda não mostrado', () => {
  const seen = new Set();
  assert.equal(Hints.shouldShow('lab', seen, { chatbot_enabled: true }), true);
  assert.equal(Hints.shouldShow('lab', seen, { chatbot_enabled: false, panelOpen: false, moderated: false }), false, 'flag desligada');
  assert.equal(Hints.shouldShow('lab', seen, { chatbot_enabled: 'true' }), false, 'flag que não é booleana não liga');
  assert.equal(Hints.shouldShow('lab', seen, { chatbot_enabled: true, panelOpen: true }), false, 'painel da Lia aberto');
  assert.equal(Hints.shouldShow('lab', seen, { chatbot_enabled: true, moderated: true }), false, 'suspensão ativa');
  assert.equal(Hints.shouldShow('home', seen, { chatbot_enabled: true }), false, 'contexto sem dica');
  assert.equal(Hints.shouldShow('lab', seen, undefined), false, 'sem flags');
  assert.equal(Hints.shouldShow('lab', new Set(['lab']), { chatbot_enabled: true }), false, 'já mostrada nesta sessão');
});

test('1 vez por módulo por sessão: Aprender, Farmacologia e Toxicologia dividem o contexto learn', () => {
  const seen = new Set(['learn']);
  assert.equal(Hints.shouldShow('learn', seen, { chatbot_enabled: true }), false);
  assert.equal(Hints.shouldShow('lab', seen, { chatbot_enabled: true }), true);
});

// ---------- Balão e controlador ----------

test('o balão tem o texto exato, papel de status e o botão de fechar com rótulo', async () => {
  const { doc, hints } = makeHints();
  hints.panelChanged('panel-events');
  await settle();
  const [box] = bubbles(doc);
  assert.ok(box, 'o balão aparece ao entrar em Eventos');
  assert.equal(box.getAttribute('role'), 'status');
  assert.equal(find(box, 'lia-hint-open').textContent, 'Quer ajuda com sua inscrição?');
  assert.equal(find(box, 'lia-hint-close').getAttribute('aria-label'), 'Fechar a dica');
  assert.equal(hints.isShowing(), true);
});

test('1 vez por módulo: voltar ao Laboratório na mesma sessão não mostra a dica outra vez', async () => {
  const { doc, hints } = makeHints();
  hints.moduleChanged('lab');
  await settle();
  assert.equal(bubbles(doc).length, 1);
  hints.hide();
  hints.moduleChanged('');
  hints.moduleChanged('lab');
  await settle();
  assert.equal(bubbles(doc).length, 0);
});

test('uma dica de passagem não aparece: só o último contexto decidido na mesma ação vale', async () => {
  const { doc, hints } = makeHints();
  hints.moduleChanged('lab');
  hints.moduleChanged('anatomia');
  await settle();
  assert.equal(bubbles(doc).length, 1);
  assert.equal(find(bubbles(doc)[0], 'lia-hint-open').textContent, 'Posso explicar alguma estrutura?');
  hints.moduleChanged('lab');
  await settle();
  assert.equal(bubbles(doc).length, 1, 'trocar de contexto troca o balão');
  assert.equal(find(bubbles(doc)[0], 'lia-hint-open').textContent, 'Dúvida sobre vidraria ou preparo?');
});

test('um contexto sem dica esconde o balão que estava na tela', async () => {
  const { doc, hints } = makeHints();
  hints.moduleChanged('lab');
  await settle();
  hints.panelChanged('panel-home');
  await settle();
  assert.equal(bubbles(doc).length, 0);
});

test('some sozinho em 8 s, com um único timer agendado', async () => {
  const { doc, timers, hints } = makeHints();
  hints.panelChanged('panel-proposals');
  await settle();
  assert.deepEqual(timers.log.set, [8000]);
  timers.fire();
  assert.equal(bubbles(doc).length, 0);
  assert.equal(hints.isShowing(), false);
});

test('o timer é limpo ao fechar pelo ×', async () => {
  const { doc, timers, hints } = makeHints();
  hints.moduleChanged('lab');
  await settle();
  find(bubbles(doc)[0], 'lia-hint-close').click();
  assert.equal(bubbles(doc).length, 0);
  assert.equal(timers.pending.size, 0, 'nenhum timer pendente');
  assert.equal(timers.log.clear.length, 1);
});

test('tocar na dica abre o painel com o texto (uma vez), some o balão e limpa o timer; nada é enviado', async () => {
  const { doc, timers, hints, opened } = makeHints();
  hints.panelChanged('panel-learn');
  await settle();
  find(bubbles(doc)[0], 'lia-hint-open').click();
  assert.deepEqual(opened, ['Quer sugestão por onde começar a estudar?']);
  assert.equal(bubbles(doc).length, 0);
  assert.equal(timers.pending.size, 0);
});

test('sair da conta (reset) limpa o timer e zera o que já foi mostrado: a dica volta na conta seguinte', async () => {
  const { doc, timers, hints } = makeHints();
  hints.moduleChanged('anatomia');
  await settle();
  assert.equal(bubbles(doc).length, 1);
  hints.reset();
  assert.equal(bubbles(doc).length, 0);
  assert.equal(timers.pending.size, 0);
  hints.moduleChanged('anatomia');
  await settle();
  assert.equal(bubbles(doc).length, 1);
});

test('não aparece com o painel da Lia aberto, com a Lia desligada ou com suspensão ativa', async () => {
  const { doc, hints, setFlags } = makeHints();
  setFlags({ ...ON, panelOpen: true });
  hints.panelChanged('panel-events');
  await settle();
  assert.equal(bubbles(doc).length, 0, 'painel aberto');
  setFlags({ ...ON, chatbot_enabled: false });
  hints.moduleChanged('lab');
  await settle();
  assert.equal(bubbles(doc).length, 0, 'Lia desligada');
  setFlags({ ...ON, moderated: true });
  hints.moduleChanged('clinica');
  await settle();
  assert.equal(bubbles(doc).length, 0, 'suspensão ativa');
  setFlags({ ...ON });
  hints.moduleChanged('lab');
  await settle();
  assert.equal(bubbles(doc).length, 1, 'com tudo liberado, a dica aparece');
});

test('a dica que foi bloqueada não conta como mostrada: ela aparece quando a condição muda', async () => {
  const { doc, hints, setFlags } = makeHints();
  setFlags({ ...ON, chatbot_enabled: false });
  hints.moduleChanged('lab');
  await settle();
  setFlags({ ...ON });
  hints.moduleChanged('lab');
  await settle();
  assert.equal(bubbles(doc).length, 1);
});

test('context(): módulo aberto manda sobre o painel; ao fechar o módulo, volta ao painel', () => {
  const { hints } = makeHints();
  assert.equal(hints.context(), '');
  hints.panelChanged('panel-learn');
  assert.equal(hints.context(), 'learn');
  hints.moduleChanged('lab');
  assert.equal(hints.context(), 'lab');
  hints.moduleChanged('');
  assert.equal(hints.context(), 'learn');
  hints.panelChanged('panel-events');
  assert.equal(hints.context(), 'events');
});

// ---------- Fonte e CSS ----------

test('assistant-hints.js: texto por textContent, sem innerHTML, eval, armazenamento do navegador nem setInterval', () => {
  const src = read('frontend/assistant-hints.js');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(src, /window\.open|location\.(href|assign)|\.href\s*=/);
  assert.doesNotMatch(src, /setInterval/);
});

test('CSS: a animação só existe com movimento permitido; só transform e opacity; sem blur sobre o Atlas', () => {
  const css = read('frontend/assistant-hints.css');
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.equal((css.match(/animation\s*:/g) || []).length, 1, 'uma única animação');
  const motion = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'), css.indexOf('@keyframes'));
  assert.match(motion, /animation: lia-hint-in var\(--dur-base\) var\(--ease-out\) both/);
  const frames = css.slice(css.indexOf('@keyframes lia-hint-in'));
  assert.doesNotMatch(frames, /(left|top|right|bottom|width|height|margin)\s*:/);
  assert.doesNotMatch(css, /transition\s*:\s*all/);
});

test('CSS: alvos de toque de 44 px e o balão sobe junto com a Lia no modo app', () => {
  const css = read('frontend/assistant-hints.css');
  assert.match(ruleOf(css, '.lia-hint-open'), /min-height:\s*44px/);
  assert.match(ruleOf(css, '.lia-hint-close'), /width:\s*44px/);
  assert.match(ruleOf(css, '.lia-hint-close'), /height:\s*44px/);
  assert.match(css, /\.lia-launcher\.lia-in-app ~ \.lia-hint\s*\{[^}]*bottom:\s*144px/);
});

test('CSS: sem borda de card no balão e cores pelos tokens do tema', () => {
  const css = read('frontend/assistant-hints.css');
  assert.doesNotMatch(ruleOf(css, '.lia-hint'), /(^|;)\s*border\s*:\s*[1-9]/);
  assert.match(ruleOf(css, '.lia-hint'), /background:\s*var\(--layer-2\)/);
  assert.match(ruleOf(css, '.lia-hint'), /color:\s*var\(--text\)/);
});
