/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Desafio Turnstile da prévia de IA do visitante (frontend/assistant-turnstile.js): só para visitante com a
// flag pública ligada, script injetado sob demanda, widget explícito 'interaction-only' com a ação certa,
// token de uso único (reset depois de cada envio) e falhas que nunca atrapalham o chat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Turnstile = require('../assistant-turnstile.js');

/** Janela falsa: document.createElement/head.appendChild registram o que seria carregado. */
function fakeWindow() {
  const scripts = [];
  const win = {
    scripts,
    document: {
      head: { appendChild: (node) => { scripts.push(node); } },
      createElement: (tag) => ({ tag, className: '', parentNode: null, children: [] }),
    },
  };
  return win;
}
function fakeParent() {
  const parent = { children: [] };
  parent.appendChild = (node) => { node.parentNode = parent; parent.children.push(node); };
  parent.removeChild = (node) => { parent.children = parent.children.filter((n) => n !== node); node.parentNode = null; };
  return parent;
}
function fakeTurnstile(win) {
  const calls = { render: [], reset: [], remove: [] };
  win.turnstile = {
    render: (container, opts) => { calls.render.push({ container, opts }); return 'w-' + calls.render.length; },
    reset: (id) => { calls.reset.push(id); },
    remove: (id) => { calls.remove.push(id); },
  };
  return calls;
}

test('wanted: só visitante (sem sessão) com lia_visitor_ai_enabled exatamente verdadeira', () => {
  assert.equal(Turnstile.wanted({ lia_visitor_ai_enabled: true }, ''), true);
  assert.equal(Turnstile.wanted({ lia_visitor_ai_enabled: true }, 'sessao-de-membro'), false);
  assert.equal(Turnstile.wanted({ lia_visitor_ai_enabled: false }, ''), false);
  assert.equal(Turnstile.wanted({ lia_visitor_ai_enabled: 'true' }, ''), false);
  assert.equal(Turnstile.wanted({}, ''), false);
  assert.equal(Turnstile.wanted(null, ''), false);
});

test('a chave do site é a pública combinada e não há segredo no arquivo', () => {
  assert.equal(Turnstile.SITE_KEY, '0x4AAAAAAFU5o9zPQhbtV0yA');
  const src = fs.readFileSync(path.join(frontend, 'assistant-turnstile.js'), 'utf8');
  assert.doesNotMatch(src, /TURNSTILE_SECRET|secret\s*[:=]/i);
  assert.doesNotMatch(src, /innerHTML|eval\(|document\.write/);
});

test('ensure: injeta o script da Cloudflare (async, defer, render explícito) e só uma vez', () => {
  const win = fakeWindow();
  const challenge = Turnstile.create(win);
  const parent = fakeParent();
  challenge.ensure(parent);
  challenge.ensure(parent);
  assert.equal(win.scripts.length, 1);
  assert.equal(win.scripts[0].src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  assert.equal(win.scripts[0].async, true);
  assert.equal(win.scripts[0].defer, true);
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0].className, 'lia-turnstile');
});

test('quando o script carrega, renderiza o widget com sitekey, ação e interaction-only', () => {
  const win = fakeWindow();
  const challenge = Turnstile.create(win);
  challenge.ensure(fakeParent());
  const calls = fakeTurnstile(win);
  win.scripts[0].onload();
  assert.equal(calls.render.length, 1);
  const { opts } = calls.render[0];
  assert.equal(opts.sitekey, '0x4AAAAAAFU5o9zPQhbtV0yA');
  assert.equal(opts.action, 'lia_preview');
  assert.equal(opts.appearance, 'interaction-only');
  assert.equal(challenge.active(), true);
});

test('com o script já presente, ensure renderiza na hora e não injeta de novo', () => {
  const win = fakeWindow();
  const calls = fakeTurnstile(win);
  const challenge = Turnstile.create(win);
  challenge.ensure(fakeParent());
  challenge.ensure(fakeParent());
  assert.equal(win.scripts.length, 0);
  assert.equal(calls.render.length, 1);
});

test('o token vem do callback, expira e erra para null; token inválido é ignorado', () => {
  const win = fakeWindow();
  const calls = fakeTurnstile(win);
  const challenge = Turnstile.create(win);
  challenge.ensure(fakeParent());
  const { opts } = calls.render[0];
  assert.equal(challenge.token(), null);
  opts.callback('token-1');
  assert.equal(challenge.token(), 'token-1');
  opts['expired-callback']();
  assert.equal(challenge.token(), null);
  opts.callback('token-2');
  opts['error-callback']();
  assert.equal(challenge.token(), null);
  for (const bad of ['', 'x'.repeat(2049), 42, null, {}]) {
    opts.callback(bad);
    assert.equal(challenge.token(), null);
  }
});

test('withToken: anexa turnstileToken quando há token, sem alterar o objeto original', () => {
  const win = fakeWindow();
  const calls = fakeTurnstile(win);
  const challenge = Turnstile.create(win);
  challenge.ensure(fakeParent());
  const payload = { message: 'oi', history: [] };
  assert.deepEqual(Turnstile.withToken(payload, challenge), payload);
  calls.render[0].opts.callback('t-9');
  const out = Turnstile.withToken(payload, challenge);
  assert.equal(out.turnstileToken, 't-9');
  assert.equal(out.message, 'oi');
  assert.equal('turnstileToken' in payload, false);
  assert.deepEqual(Turnstile.withToken(payload, null), payload);
});

test('reset: descarta o token e reinicia o widget (uso único)', () => {
  const win = fakeWindow();
  const calls = fakeTurnstile(win);
  const challenge = Turnstile.create(win);
  challenge.ensure(fakeParent());
  calls.render[0].opts.callback('t-1');
  challenge.reset();
  assert.equal(challenge.token(), null);
  assert.deepEqual(calls.reset, ['w-1']);
});

test('falha ao carregar o script: nada lança, o token fica nulo e dá para tentar de novo', () => {
  const win = fakeWindow();
  const challenge = Turnstile.create(win);
  challenge.ensure(fakeParent());
  win.scripts[0].onerror();
  assert.equal(challenge.token(), null);
  assert.equal(challenge.active(), false);
  challenge.ensure(fakeParent());
  assert.equal(win.scripts.length, 2);
  assert.doesNotThrow(() => challenge.reset());
});

test('turnstile.render que lança não derruba nada', () => {
  const win = fakeWindow();
  win.turnstile = { render: () => { throw new Error('x'); } };
  const challenge = Turnstile.create(win);
  assert.doesNotThrow(() => challenge.ensure(fakeParent()));
  assert.equal(challenge.active(), false);
  assert.equal(challenge.token(), null);
});

test('sync: cria quando passa a valer, mantém o mesmo controlador e remove o widget quando deixa de valer', () => {
  const win = fakeWindow();
  const calls = fakeTurnstile(win);
  const made = Turnstile.sync(null, win, true);
  assert.ok(made);
  assert.equal(Turnstile.sync(made, win, true), made);
  made.ensure(fakeParent());
  assert.equal(Turnstile.sync(made, win, false), null); // login ou flag desligada: o widget sai
  assert.deepEqual(calls.remove, ['w-1']);
  assert.equal(Turnstile.sync(null, win, false), null);
});

test('dispose: remove o widget e o contêiner', () => {
  const win = fakeWindow();
  const calls = fakeTurnstile(win);
  const parent = fakeParent();
  const challenge = Turnstile.create(win);
  challenge.ensure(parent);
  challenge.dispose();
  assert.deepEqual(calls.remove, ['w-1']);
  assert.equal(parent.children.length, 0);
  assert.equal(challenge.active(), false);
});

test('index.html: carrega o módulo antes de assistant.js, a CSP abre só a Cloudflare e o build/SW o conhecem', () => {
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  assert.ok(html.indexOf('<script src="assistant-turnstile.js" defer></script>') !== -1);
  assert.ok(html.indexOf('assistant-turnstile.js') < html.indexOf('<script src="assistant.js"'));
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)[1];
  const policy = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map((d) => [d[0], d.slice(1)]));
  const CF = 'https://challenges.cloudflare.com';
  assert.deepEqual(policy['script-src'], ["'self'", CF]);
  assert.deepEqual(policy['frame-src'], ["'self'", CF]);
  assert.ok(policy['connect-src'].includes(CF));
  assert.deepEqual(policy['default-src'], ["'self'"]);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.ok(!policy['script-src'].includes("'unsafe-inline'") && !policy['script-src'].includes("'unsafe-eval'"));
  assert.ok(!policy['img-src'].includes(CF) && !policy['style-src'].includes(CF) && !policy['form-action'].includes(CF));
  assert.ok(fs.readFileSync(path.join(frontend, 'scripts', 'build.js'), 'utf8').includes("'assistant-turnstile.js'"));
  assert.ok(fs.readFileSync(path.join(frontend, 'sw.js'), 'utf8').includes("'assistant-turnstile.js'"));
});

test('assistant.js: o desafio só é criado para visitante com a flag; membro nunca carrega o script', () => {
  const src = fs.readFileSync(path.join(frontend, 'assistant.js'), 'utf8');
  assert.match(src, /turnstileLib\(\)\.sync\(ui\.challenge, root, on && turnstileLib\(\)\.wanted\(res\.flags, token\(\)\)\)/);
  assert.match(src, /if \(ui\.challenge\) ui\.challenge\.ensure\(ui\.panel\)/);
  assert.match(src, /turnstileLib\(\)\.withToken\(/);
  assert.match(src, /if \(ui\.challenge\) ui\.challenge\.reset\(\)/);
  // O script só é injetado por ensure(), que só existe com ui.challenge (visitante + flag).
  assert.doesNotMatch(src, /challenges\.cloudflare\.com/);
});
