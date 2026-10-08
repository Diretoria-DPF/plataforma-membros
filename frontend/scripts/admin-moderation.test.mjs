/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Seção "Moderação da Lia" do painel admin (frontend/admin-moderation.js, ADR 0004, O28):
// funções puras, estados carregando/erro com nova tentativa/vazio, aria-busy, respostas
// fora de ordem, logout, foco, data-action e higiene (sem innerHTML, sem handler inline).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const require = createRequire(import.meta.url);

/** DOM mínimo; innerHTML lança, como em admin-ai.test.mjs. */
function makeNode(tag) {
  const node = {
    tag,
    children: [],
    attrs: {},
    textContent: '',
    appendChild(child) { node.children.push(child); return child; },
    setAttribute(key, value) { node.attrs[key] = String(value); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(node.attrs, key) ? node.attrs[key] : null; },
    removeAttribute(key) { delete node.attrs[key]; },
    focus() { doc.activeElement = node; },
    contains(target) { return node === target || node.children.some((child) => child.contains && child.contains(target)); },
  };
  Object.defineProperty(node, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
  return node;
}

const elements = new Map();
const doc = {
  activeElement: null,
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeNode(id));
    return elements.get(id);
  },
};
const field = (id) => doc.getElementById(id);

/** Mesma regra de LaiftDom.h: string vira nó de texto, atributos por setAttribute. */
function h(tag, attrs, children) {
  const node = makeNode(tag);
  Object.keys(attrs || {}).forEach((key) => {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) return;
    if (key === 'className') node.attrs.class = value;
    else node.setAttribute(key, value);
  });
  [].concat(children === undefined ? [] : children).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (typeof child === 'object') node.appendChild(child);
    else { const t = makeNode('#text'); t.textContent = String(child); node.appendChild(t); }
  });
  return node;
}

const wiring = [];
const LaiftDom = {
  h,
  clear(node) { node.children = []; return node; },
  delegateActions(root, allowList) { wiring.push({ root, allowList }); },
};

const calls = [];
const pending = [];
const app = {
  getState() { return { sessionToken: 'tok-admin' }; },
  callApi(name, token, input) {
    calls.push({ name, token, input });
    return new Promise((resolve) => { pending.push({ name, resolve }); });
  },
  formatDate(iso) { return 'em ' + iso; },
};

globalThis.window = { LaiftDom };
globalThis.document = doc;
const Moderation = require('../admin-moderation.js');

const flush = () => new Promise((resolve) => setImmediate(resolve));

function textOf(node) {
  if (!node) return '';
  return node.textContent + node.children.map(textOf).join('');
}
function findAll(node, predicate, out = []) {
  if (predicate(node)) out.push(node);
  node.children.forEach((child) => findAll(child, predicate, out));
  return out;
}
const byClass = (node, cls) => findAll(node, (n) => (n.attrs.class || '').split(/\s+/).includes(cls));
const byTag = (node, tag) => findAll(node, (n) => n.tag === tag);

const UUID = '3f2b8c1a-9d4e-4f60-a7b5-123456789abc';
const IN_AN_HOUR = new Date(Date.now() + 3600 * 1000).toISOString();
const AN_HOUR_AGO = new Date(Date.now() - 3600 * 1000).toISOString();

function summary(extra = {}) {
  return Object.assign({
    success: true,
    windowDays: 90,
    incidents: { total: 5, byDetection: { terms: 3, llm: 2 }, byLevelAfter: { 1: 2, 2: 2, 3: 1 } },
    people: [
      {
        profileId: UUID, incidents: 3, maxLevel: 3, lastAt: '2026-10-08T10:00:00Z',
        currentLevel: 3, suspendedUntil: IN_AN_HOUR, lastDetection: 'llm', lastRedeemedAt: '2026-10-05T12:00:00Z',
        displayName: 'Ana Souza', // o servidor não manda mais; se mandar, a tela ignora
      },
      {
        profileId: '11111111-2222-4333-8444-555555555555', incidents: 1, maxLevel: 1, lastAt: '2026-10-01T09:00:00Z',
        currentLevel: 0, suspendedUntil: AN_HOUR_AGO, lastDetection: 'terms', lastRedeemedAt: null,
      },
    ],
    currentLevels: { 1: 1, 2: 0, 3: 1 },
    redemption: { accepted: 1, refused: 1, rate: 0.5 },
  }, extra);
}

const box = () => field('admin-moderation');
const lastPending = () => pending[pending.length - 1];

beforeEach(() => {
  Moderation.reset();
  calls.length = 0;
  pending.length = 0;
  doc.activeElement = null;
});

// ---------- Funções puras ----------

test('contadores em pt-BR: singular só para exatamente 1', () => {
  assert.equal(Moderation.plural(1, 'pessoa', 'pessoas'), '1 pessoa');
  assert.equal(Moderation.plural(0, 'pessoa', 'pessoas'), '0 pessoas');
  assert.equal(Moderation.plural(2, 'pessoa', 'pessoas'), '2 pessoas');
  assert.equal(Moderation.plural(undefined, 'pessoa', 'pessoas'), '0 pessoas');
  assert.equal(Moderation.plural(-4, 'pessoa', 'pessoas'), '0 pessoas');
});

test('nível sempre com nome (nunca só número ou cor) e traço quando não há taxa', () => {
  assert.equal(Moderation.levelLabel(1), 'Nível 1 — alerta');
  assert.equal(Moderation.levelLabel(2), 'Nível 2 — aviso sério');
  assert.equal(Moderation.levelLabel(3), 'Nível 3 — suspensão de 24 h');
  assert.equal(Moderation.levelLabel(0), 'Nível 0 — normal');
  assert.equal(Moderation.percentLabel(0.5), '50%');
  assert.equal(Moderation.percentLabel(0.333), '33%');
  assert.equal(Moderation.percentLabel(null), '—');
  assert.equal(Moderation.percentLabel(undefined), '—');
});

test('a conta aparece só pelo começo do identificador', () => {
  assert.equal(Moderation.shortId(UUID), '3f2b8c1a');
  assert.equal(Moderation.shortId(''), 'sem identificador');
  assert.equal(Moderation.shortId(null), 'sem identificador');
});

test('normalizeSummary: campos ausentes viram 0/vazio, nunca quebram', () => {
  const empty = Moderation.normalizeSummary(undefined);
  assert.equal(empty.total, 0);
  assert.equal(empty.windowDays, 90);
  assert.deepEqual(empty.people, []);
  assert.deepEqual(empty.currentLevels, { 1: 0, 2: 0, 3: 0 });
  assert.equal(empty.redemption.rate, null);
  assert.equal(Moderation.isEmptySummary(empty), true);
  const odd = Moderation.normalizeSummary({ success: true, people: 'x', incidents: { total: 'abc' }, redemption: { rate: 'x' } });
  assert.equal(odd.total, 0);
  assert.deepEqual(odd.people, []);
  assert.equal(odd.redemption.rate, null);
});

test('isEmptySummary: qualquer sinal de moderação tira o estado vazio', () => {
  assert.equal(Moderation.isEmptySummary(Moderation.normalizeSummary(summary())), false);
  assert.equal(Moderation.isEmptySummary(Moderation.normalizeSummary({ currentLevels: { 3: 1 } })), false);
  assert.equal(Moderation.isEmptySummary(Moderation.normalizeSummary({ redemption: { accepted: 0, refused: 2, rate: 0 } })), false);
});

// ---------- Estados ----------

test('carregando: aria-busy no contêiner e estado com role="status"; o pedido leva token e entrada vazia', () => {
  Moderation.load(app);
  assert.equal(box().getAttribute('aria-busy'), 'true');
  const loading = byClass(box(), 'state-loading')[0];
  assert.ok(loading);
  assert.equal(loading.getAttribute('role'), 'status');
  assert.equal(textOf(loading), 'Carregando…');
  assert.deepEqual(calls, [{ name: 'apiAdminAssistantModeration', token: 'tok-admin', input: {} }]);
});

test('sucesso: resumo, pessoas, taxa de redenção e regra; aria-busy sai', async () => {
  Moderation.load(app);
  lastPending().resolve(summary());
  await flush();
  assert.equal(box().getAttribute('aria-busy'), null);
  const all = textOf(box());
  assert.match(all, /5 incidentes nos últimos 90 dias/);
  assert.match(all, /3 detectados por termo ofensivo/);
  assert.match(all, /2 confirmados pela avaliação da IA/);
  assert.match(all, /Taxa de redenção: 50%/);
  assert.match(all, /1 aceita · 1 recusada \(2 tentativas\)/);
  assert.match(all, /Nível 3 — suspensão de 24 h/);
  assert.match(all, /1 pessoa/);
  assert.match(all, /30 dias corridos sem novo incidente/);
  assert.match(all, /não reinicia a contagem/);
});

test('pessoas: nível atual e maior nível, data do último incidente e quantidade; o nível 3 usa o selo de perigo e nome', async () => {
  Moderation.load(app);
  lastPending().resolve(summary());
  await flush();
  const rows = byClass(box(), 'list-item').filter((n) => /^Conta /.test(textOf(n.children[0])));
  assert.equal(rows.length, 2);
  assert.match(textOf(rows[0]), /Conta 3f2b8c1a/);
  assert.match(textOf(rows[0]), /Nível atual: Nível 3 — suspensão de 24 h/);
  assert.match(textOf(rows[0]), /Maior nível no período: Nível 3 — suspensão de 24 h/);
  assert.match(textOf(rows[0]), /3 incidentes/);
  assert.match(textOf(rows[0]), /Último incidente: em 2026-10-08T10:00:00Z/);
  assert.match(byClass(rows[0], 'badge')[0].attrs.class, /banned/);
  assert.doesNotMatch(byClass(rows[1], 'badge')[0].attrs.class, /banned/);
  assert.match(textOf(rows[1]), /Nível atual: Nível 0 — normal/);
  assert.match(textOf(rows[1]), /1 incidente(?!s)/, 'singular para exatamente 1');
});

test('pessoas: suspensão ativa, última detecção e última redenção só quando existem', async () => {
  Moderation.load(app);
  lastPending().resolve(summary());
  await flush();
  const rows = byClass(box(), 'list-item').filter((n) => /^Conta /.test(textOf(n.children[0])));
  assert.match(textOf(rows[0]), new RegExp(`Suspensa até em ${IN_AN_HOUR.replace(/[.+]/g, '\\$&')}`));
  assert.match(textOf(rows[0]), /Última detecção: pela análise automática/);
  assert.match(textOf(rows[0]), /Última redenção: em 2026-10-05T12:00:00Z/);
  assert.doesNotMatch(textOf(rows[1]), /Suspensa até/, 'suspensão que já passou não aparece');
  assert.match(textOf(rows[1]), /Última detecção: por termos/);
  assert.doesNotMatch(textOf(rows[1]), /Última redenção/);
});

test('pessoas sem os campos novos (servidor antigo) continuam aparecendo, sem inventar nada', async () => {
  Moderation.load(app);
  lastPending().resolve(summary({ people: [{ profileId: UUID, incidents: 2, maxLevel: 2, lastAt: '2026-10-08T10:00:00Z' }] }));
  await flush();
  const text = textOf(box());
  assert.match(text, /Conta 3f2b8c1a/);
  assert.match(text, /Nível atual: Nível 0 — normal/);
  assert.doesNotMatch(text, /Suspensa até|Última detecção|Última redenção/);
});

test('nenhum nome aparece: displayName não é lido nem mostrado, mesmo se vier no payload', async () => {
  Moderation.load(app);
  lastPending().resolve(summary());
  await flush();
  assert.doesNotMatch(textOf(box()), /Ana Souza/);
  const person = Moderation.normalizeSummary(summary()).people[0];
  assert.equal('displayName' in person, false);
  assert.deepEqual(Object.keys(person).sort(), ['currentLevel', 'id', 'incidents', 'lastAt', 'lastDetection', 'lastRedeemedAt', 'maxLevel', 'suspendedUntil']);
});

test('última detecção: só "terms" e "llm" valem; qualquer outro valor some', () => {
  const only = (detection) => Moderation.normalizeSummary({ people: [{ profileId: UUID, lastDetection: detection }] }).people[0].lastDetection;
  assert.equal(only('terms'), 'terms');
  assert.equal(only('llm'), 'llm');
  assert.equal(only('<b>x</b>'), null);
  assert.equal(only(undefined), null);
  assert.equal(Moderation.detectionLabel('terms'), 'por termos');
  assert.equal(Moderation.detectionLabel('llm'), 'pela análise automática');
  assert.equal(Moderation.detectionLabel('constructor'), '');
});

test('isActiveSuspension: só data válida no futuro', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  assert.equal(Moderation.isActiveSuspension('2026-10-08T12:00:01Z', now), true);
  assert.equal(Moderation.isActiveSuspension('2026-10-08T12:00:00Z', now), false);
  assert.equal(Moderation.isActiveSuspension('2026-10-07T00:00:00Z', now), false);
  assert.equal(Moderation.isActiveSuspension('não é data', now), false);
  assert.equal(Moderation.isActiveSuspension(null, now), false);
});

test('o identificador inteiro e nenhum texto de mensagem chegam à tela', async () => {
  Moderation.load(app);
  lastPending().resolve(summary({ message: 'você é uma idiota', text: 'desculpas' }));
  await flush();
  assert.doesNotMatch(textOf(box()), new RegExp(UUID));
  assert.doesNotMatch(textOf(box()), /idiota|desculpas/);
});

test('sem tentativa de redenção: taxa em traço, sem inventar porcentagem', async () => {
  Moderation.load(app);
  lastPending().resolve(summary({ redemption: { accepted: 0, refused: 0, rate: null } }));
  await flush();
  assert.match(textOf(box()), /Redenção: sem tentativas no período/);
  assert.match(textOf(box()), /Taxa de redenção: —/);
});

test('vazio: mensagem clara e a regra continua visível', async () => {
  Moderation.load(app);
  lastPending().resolve({ success: true, windowDays: 90, incidents: { total: 0 }, people: [], currentLevels: {}, redemption: { accepted: 0, refused: 0, rate: null } });
  await flush();
  const empty = byClass(box(), 'empty-state')[0];
  assert.match(textOf(empty), /Nenhum incidente de moderação nos últimos 90 dias/);
  assert.match(textOf(box()), /Como funciona/);
  assert.equal(byClass(box(), 'badge').length, 0);
  assert.equal(box().getAttribute('aria-busy'), null);
});

test('resposta de sucesso sem os campos esperados vira vazio, sem lançar erro', async () => {
  Moderation.load(app);
  lastPending().resolve({ success: true, events: [], proposals: [], items: [] });
  await flush();
  assert.match(textOf(box()), /Nenhum incidente de moderação/);
});

test('erro: role="alert", mensagem da API como texto puro e botão "Tentar de novo" por data-action', async () => {
  Moderation.load(app);
  lastPending().resolve({ success: false, message: 'Serviço <b>indisponível</b>' });
  await flush();
  const error = byClass(box(), 'state-error')[0];
  assert.ok(error);
  assert.equal(error.getAttribute('role'), 'alert');
  assert.equal(box().getAttribute('aria-busy'), null);
  assert.match(textOf(error), /Serviço <b>indisponível<\/b>/);
  const retry = byTag(error, 'button')[0];
  assert.equal(retry.getAttribute('type'), 'button');
  assert.equal(retry.getAttribute('data-action'), 'LaiftAdminModeration.reload');
  assert.equal(textOf(retry), 'Tentar de novo');
  assert.equal(byTag(box(), 'b').length, 0, 'a marcação da mensagem não vira elemento');
});

test('erro sem mensagem usa um texto padrão', async () => {
  Moderation.load(app);
  lastPending().resolve(undefined);
  await flush();
  assert.match(textOf(byClass(box(), 'state-error')[0]), /Tente novamente em instantes/);
});

test('nova tentativa (a ação do botão) repete o pedido e o foco acompanha o conteúdo', async () => {
  Moderation.load(app);
  lastPending().resolve({ success: false, message: 'Falha de rede.' });
  await flush();
  const retry = byTag(box(), 'button')[0];
  retry.focus();
  assert.equal(doc.activeElement, retry);
  Moderation.reload();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].name, 'apiAdminAssistantModeration');
  assert.equal(box().getAttribute('aria-busy'), 'true');
  const loading = byClass(box(), 'state-loading')[0];
  assert.equal(doc.activeElement, loading, 'o foco não se perde quando o botão sai da tela');
  lastPending().resolve(summary());
  await flush();
  assert.match(textOf(box()), /5 incidentes/);
  assert.ok(box().contains(doc.activeElement), 'o foco continua dentro da seção');
});

test('o foco só é movido quando já estava dentro da seção', async () => {
  Moderation.load(app);
  lastPending().resolve(summary());
  await flush();
  assert.equal(doc.activeElement, null);
});

// ---------- Ordem das respostas, logout e ligação ----------

test('resposta antiga (carga anterior) não sobrescreve a mais nova', async () => {
  Moderation.load(app);
  Moderation.load(app);
  assert.equal(pending.length, 2);
  pending[1].resolve(summary({ incidents: { total: 7, byDetection: { terms: 7, llm: 0 }, byLevelAfter: { 1: 7, 2: 0, 3: 0 } } }));
  await flush();
  pending[0].resolve(summary({ incidents: { total: 99, byDetection: { terms: 99, llm: 0 }, byLevelAfter: {} } }));
  await flush();
  assert.match(textOf(box()), /7 incidentes/);
  assert.doesNotMatch(textOf(box()), /99/);
});

test('logout (reset): resposta que chega depois não reaparece, a seção esvazia e aria-busy sai', async () => {
  Moderation.load(app);
  assert.equal(box().getAttribute('aria-busy'), 'true');
  Moderation.reset();
  assert.equal(box().children.length, 0);
  assert.equal(box().getAttribute('aria-busy'), null);
  lastPending().resolve(summary());
  await flush();
  assert.equal(box().children.length, 0, 'dados de uma sessão encerrada não aparecem');
});

test('depois do reset, "Atualizar" sem sessão não chama a API', () => {
  Moderation.load(app);
  Moderation.reset();
  calls.length = 0;
  Moderation.reload();
  assert.equal(calls.length, 0);
});

test('a delegação por data-action é ligada uma vez só, no cartão, com lista de ações permitidas', () => {
  Moderation.load(app);
  Moderation.load(app);
  const own = wiring.filter((w) => w.root === field('admin-moderation-card'));
  assert.equal(own.length, 1, 'não empilha ouvintes a cada abertura do painel');
  assert.deepEqual(own[0].allowList, ['LaiftAdminModeration.reload']);
});

// ---------- Higiene e fiação da página ----------

test('o arquivo nunca converte texto em HTML nem usa handler inline', () => {
  const src = read('admin-moderation.js');
  assert.doesNotMatch(src, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(src, /\bonclick\b|\bonerror\b|\.on[a-z]+\s*=\s*function/);
  assert.doesNotMatch(src, /console\.(log|warn|error)/);
  assert.match(src, /'data-action': ACTION_RELOAD/);
  assert.ok(src.split('\n').length < 800, 'arquivo abaixo do teto de 800 linhas');
});

test('index.html: cartão "Moderação da Lia" dentro do painel de IA, com botão por data-action e safe-dom antes do módulo', () => {
  const html = read('index.html');
  const panel = /<section id="panel-admin-ai"[\s\S]*?<\/section>/.exec(html);
  assert.ok(panel, 'painel de IA do admin existe');
  assert.match(panel[0], /<div class="card" id="admin-moderation-card">/);
  assert.match(panel[0], /<h2 id="h-admin-moderation">Moderação da Lia<\/h2>/);
  assert.match(panel[0], /<button type="button" class="secondary" data-action="LaiftAdminModeration\.reload">Atualizar<\/button>/);
  assert.match(panel[0], /<div id="admin-moderation"><\/div>/);
  const order = ['modulos/shared/safe-dom.js', 'admin-moderation.js', 'app.js'].map((f) => html.indexOf(`<script src="${f}" defer></script>`));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], 'safe-dom.js, admin-moderation.js e app.js, nesta ordem');
});

test('app.js liga a seção ao painel de IA e ao fim da sessão', () => {
  const app = read('app.js');
  assert.match(app, /'panel-admin-ai': function \(\) \{[\s\S]*?LaiftAdminModeration\.load\(window\.App\)/);
  const resets = app.match(/window\.LaiftAdminModeration\.reset\(\)/g) || [];
  assert.equal(resets.length, 2, 'logout e sessão expirada');
});
