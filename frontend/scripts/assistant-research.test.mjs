/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Pesquisa externa e registro da Lia (frontend/assistant-research.js): rótulos das fontes,
// sanitização de links e tamanhos, bloco de referências com DOM mínimo e aviso de privacidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const R = require('../assistant-research.js');

/** DOM mínimo: só o que o módulo usa. innerHTML lança, para provar que nada vira HTML. */
class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attrs = {};
    this.className = '';
    this.textContent = '';
    this.listeners = {};
  }

  set innerHTML(value) { throw new Error('innerHTML não pode ser usado: ' + value); }

  get innerHTML() { throw new Error('innerHTML não pode ser lido'); }

  appendChild(child) { this.children.push(child); return child; }

  setAttribute(name, value) { this.attrs[name] = String(value); }

  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }

  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }

  click() { (this.listeners.click || []).forEach((fn) => fn()); }
}

const fakeDoc = { createElement: (tag) => new FakeNode(tag) };

function findAll(node, pred) {
  const out = [];
  const visit = (n) => {
    if (pred(n)) out.push(n);
    n.children.forEach(visit);
  };
  visit(node);
  return out;
}

const textOf = (node) => node.textContent + node.children.map(textOf).join('');

const OK_URL = 'https://europepmc.org/article/MED/123';

test('sourceLabel: rótulo legível para cada fonte; id desconhecido volta como veio', () => {
  assert.equal(Object.keys(R.SOURCE_LABELS).length, 12);
  assert.equal(R.sourceLabel('kb'), 'Guia da plataforma');
  assert.equal(R.sourceLabel('destinos'), 'Telas e módulos');
  assert.equal(R.sourceLabel('guia'), 'Guia da Lia');
  assert.equal(R.sourceLabel('privacidade'), 'Privacidade');
  assert.equal(R.sourceLabel('convivencia'), 'Convivência');
  assert.equal(R.sourceLabel('liga'), 'A Liga');
  assert.equal(R.sourceLabel('plataforma'), 'Plataforma');
  assert.equal(R.sourceLabel('modulos'), 'Módulos de estudo');
  assert.equal(R.sourceLabel('publicacoes'), 'Blog e publicações');
  assert.equal(R.sourceLabel('processo'), 'Processo seletivo');
  assert.equal(R.sourceLabel('faq'), 'Perguntas frequentes');
  assert.equal(R.sourceLabel('saude'), 'Avisos de saúde');
  assert.equal(R.sourceLabel('fonte-nova'), 'fonte-nova');
  assert.equal(R.sourceLabel('constructor'), 'constructor', 'não pode pegar propriedade herdada');
  assert.equal(R.sourceLabel('__proto__'), '__proto__');
});

test('sanitizeResearch: até 10 itens, título até 300 e revista até 200 caracteres, ano inteiro', () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ title: 'Artigo ' + i, journal: 'J', year: 2020, url: OK_URL }));
  assert.equal(R.sanitizeResearch({ items: many }).items.length, 10);

  const long = R.sanitizeResearch({ items: [{ title: 'a'.repeat(400), journal: 'b'.repeat(300) }] }).items[0];
  assert.equal(long.title.length, 300);
  assert.equal(long.journal.length, 200);

  // conta pontos de código: 300 emojis continuam inteiros
  const emoji = R.sanitizeResearch({ items: [{ title: '😀'.repeat(400) }] }).items[0];
  assert.equal(Array.from(emoji.title).length, 300);

  const year = (value) => R.sanitizeResearch({ items: [{ title: 'T', year: value }] }).items[0].year;
  assert.equal(year(2021), 2021);
  assert.equal(year('2021'), 2021);
  assert.equal(year('abc'), null);
  assert.equal(year(99999), null);
  assert.equal(year(20.5), null);
  assert.equal(year(undefined), null);
});

test('sanitizeResearch: url só https, de domínio da lista, sem usuário, senha ou porta', () => {
  const urlOf = (url) => R.sanitizeResearch({ items: [{ title: 'T', url }] }).items[0].url;
  assert.deepEqual(R.RESEARCH_HOSTS, ['europepmc.org', 'pubmed.ncbi.nlm.nih.gov', 'doi.org']);
  assert.equal(urlOf(OK_URL), OK_URL);
  assert.equal(urlOf('https://DOI.org/10.1/x'), 'https://doi.org/10.1/x');
  R.RESEARCH_HOSTS.forEach((host) => assert.equal(urlOf('https://' + host + '/a'), 'https://' + host + '/a', host));
  ['www.ebi.ac.uk', 'www.scielo.br', 'scielo.org', 'openalex.org'].forEach((host) => {
    assert.equal(urlOf('https://' + host + '/a'), null, 'fora da lista enxuta: ' + host);
  });
  assert.equal(urlOf('http://europepmc.org/a'), null, 'http não');
  assert.equal(urlOf('javascript:alert(1)'), null);
  assert.equal(urlOf('data:text/html,<b>x</b>'), null);
  assert.equal(urlOf('https://evil.example.com/a'), null, 'fora da lista');
  assert.equal(urlOf('https://europepmc.org.evil.com/a'), null, 'domínio que só começa igual');
  assert.equal(urlOf('https://user:pw@europepmc.org/a'), null, 'com credencial');
  assert.equal(urlOf('https://europepmc.org:8443/a'), null, 'com porta');
  assert.equal(urlOf('não é url'), null);
  assert.equal(urlOf(42), null);
  assert.equal(urlOf('https://europepmc.org/' + 'a'.repeat(600)), null, 'longa demais');
});

test('sanitizeResearch: item sem título sai; sem objeto conta como falha; lixo vira lista vazia', () => {
  const out = R.sanitizeResearch({ cached: 'true', failed: 1, items: [{ journal: 'só revista' }, null, 'texto', { title: '   ' }] });
  assert.deepEqual(out, { cached: false, failed: false, items: [] });
  assert.deepEqual(R.sanitizeResearch(null), { cached: false, failed: true, items: [] });
  assert.deepEqual(R.sanitizeResearch({ cached: true, items: 'não é lista' }), { cached: true, failed: false, items: [] });
});

test('renderResearch: lista com rótulo, título em texto, "revista · ano" e link seguro', () => {
  const box = R.renderResearch(fakeDoc, { items: [{ title: 'Título do artigo', journal: 'Rev Teste', year: 2024, url: OK_URL }] });
  const list = findAll(box, (n) => n.tagName === 'UL')[0];
  assert.equal(list.getAttribute('aria-label'), 'Referências encontradas');
  assert.equal(findAll(box, (n) => n.className === 'lia-research-title')[0].textContent, 'Título do artigo');
  assert.equal(findAll(box, (n) => n.className === 'lia-research-meta')[0].textContent, 'Rev Teste · 2024');
  const link = findAll(box, (n) => n.tagName === 'A')[0];
  assert.equal(link.textContent, 'Abrir');
  assert.equal(link.getAttribute('href'), OK_URL);
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
});

test('renderResearch: item com url recusada fica sem link; metadados ausentes somem', () => {
  const box = R.renderResearch(fakeDoc, { items: [{ title: 'Sem link', url: 'javascript:alert(1)' }] });
  assert.equal(findAll(box, (n) => n.tagName === 'A').length, 0);
  assert.equal(findAll(box, (n) => n.className === 'lia-research-meta').length, 0);
});

test('renderResearch: estado vazio e estado de falha, cada um sem lista; rodapé sempre', () => {
  const empty = R.renderResearch(fakeDoc, { items: [] });
  assert.match(textOf(empty), /Nada encontrado para esses termos\./);
  assert.equal(findAll(empty, (n) => n.tagName === 'UL').length, 0);

  const failed = R.renderResearch(fakeDoc, { failed: true, items: [{ title: 'ignorado' }] });
  assert.match(textOf(failed), /A base externa não respondeu agora\. Tente mais tarde\./);
  assert.equal(findAll(failed, (n) => n.tagName === 'UL').length, 0);

  [empty, failed].forEach((box) => {
    assert.match(textOf(box), /Referências de base externa \(Europe PMC\)\. A Lia não resume artigos nem dá orientação de saúde\./);
  });
});

test('renderResearch: título com HTML vira texto, sem elemento novo e sem innerHTML', () => {
  const hostile = '<img src=x onerror=alert(1)><b>x</b>';
  const box = R.renderResearch(fakeDoc, { items: [{ title: hostile }] });
  assert.equal(findAll(box, (n) => n.tagName === 'IMG').length, 0);
  assert.equal(findAll(box, (n) => n.className === 'lia-research-title')[0].textContent, hostile);
});

test('cachedNote e researchButton: texto de "já pesquisada" e botão com clique, do tipo button', () => {
  const note = R.cachedNote(fakeDoc);
  assert.equal(note.tagName, 'P');
  assert.equal(note.textContent, 'Resposta já pesquisada antes, sem gastar IA.');

  let clicks = 0;
  const button = R.researchButton(fakeDoc, () => { clicks += 1; });
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.type, 'button');
  assert.equal(button.textContent, 'Pesquisar mais a fundo');
  assert.match(button.className, /lia-chip/);
  assert.match(button.className, /lia-research-btn/);
  button.click();
  assert.equal(clicks, 1);
  assert.doesNotThrow(() => R.researchButton(fakeDoc, null).click());
});

test('aviso de privacidade: aparece uma vez e fica marcado no armazenamento', () => {
  const data = new Map();
  const storage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
  assert.equal(R.HINT_KEY, 'lia.research.hint.v1');
  assert.equal(R.shouldShowPrivacyHint(storage), true);
  R.markPrivacyHintSeen(storage);
  assert.equal(R.shouldShowPrivacyHint(storage), false);
  assert.equal(R.PRIVACY_HINT, 'Só os termos gerais da pergunta vão para a base externa. Não escreva dados pessoais.');
});

test('aviso de privacidade com o armazenamento lançando exceção: não quebra e mostra o aviso', () => {
  const broken = {
    getItem: () => { throw new Error('bloqueado'); },
    setItem: () => { throw new Error('cheio'); },
  };
  assert.equal(R.shouldShowPrivacyHint(broken), true);
  assert.doesNotThrow(() => R.markPrivacyHintSeen(broken));
});

test('aviso de privacidade sem armazenamento (null): mostra e não grava', () => {
  assert.equal(R.shouldShowPrivacyHint(null), true);
  assert.doesNotThrow(() => R.markPrivacyHintSeen(null));
});

test('browserStorage: propriedade que lança exceção (contexto bloqueado) devolve null', () => {
  const blocked = { get localStorage() { throw new Error('SecurityError'); } };
  assert.equal(R.browserStorage(blocked), null);
  assert.equal(R.browserStorage(null), null);
  const store = { getItem() {}, setItem() {} };
  assert.equal(R.browserStorage({ localStorage: store }), store);
});

test('assistant-research.js não converte texto em HTML, não navega e não guarda a conversa', () => {
  const src = read('frontend/assistant-research.js');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|outerHTML|document\.write|eval\(|new Function/);
  assert.doesNotMatch(src, /sessionStorage|indexedDB/);
  assert.doesNotMatch(src, /window\.open|location\.href|location\.assign|\.href\s*=/);
});

test('lastQuestion: a última pergunta da pessoa, sem o prefixo da pesquisa', () => {
  assert.equal(R.lastQuestion([]), '');
  assert.equal(R.lastQuestion(null), '');
  const messages = [
    { role: 'user', text: 'primeira' }, { role: 'lia', text: 'resposta' },
    { role: 'user', text: 'segunda' }, { role: 'lia', text: 'outra' },
  ];
  assert.equal(R.lastQuestion(messages), 'segunda');
  assert.equal(R.lastQuestion([{ role: 'user', text: R.PREFIX + 'termo' }]), 'termo');
  assert.equal(R.lastQuestion([{ role: 'user', text: 42 }, { role: 'lia', text: 'a' }]), '');
});

test('textos da pesquisa: prefixo da pergunta, indicador "em andamento" e título da resposta', () => {
  assert.equal(R.PREFIX, 'Pesquisar mais a fundo: ');
  assert.equal(R.BUSY_TEXT, 'Pesquisando em bases científicas…');
  assert.equal(R.REPLY_TEXT, 'Pesquisa em bases científicas:');
});

test('assistant.js: a cola da pesquisa usa o módulo opcional, não guarda nada e fica abaixo de 760 linhas', () => {
  const src = read('frontend/assistant.js');
  assert.ok(src.split('\n').length < 760, 'assistant.js com mais de 760 linhas');
  assert.match(src, /root\.LaiftAssistantResearch/);
  assert.match(src, /'apiAssistantChat', sentWith, \{ message: message, research: true \}/);
  assert.match(src, /lib\.PREFIX \+ message/);
  assert.match(src, /setBusy\(true, lib\.BUSY_TEXT\)/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(src, /el\(doc, 'a'/, 'fonte e referência nunca viram link na cola');
});

test('assistant.js: pesquisa desligada no servidor só mostra a frase, sem falha e sem esconder o lançador', () => {
  const src = read('frontend/assistant.js').replace(/\r/g, '');
  const sendBody = src.slice(src.indexOf('function sendResearch'), src.indexOf('function greet'));
  assert.doesNotMatch(sendBody, /hideLauncher/, 'a pesquisa nunca esconde o lançador');
  const branchAt = sendBody.indexOf('if (res.researchDisabled === true) { showOffReply(res); return; }');
  assert.ok(branchAt > 0, 'o ramo researchDisabled existe');
  assert.ok(branchAt < sendBody.indexOf('showResearch(lib, res);'), 'o ramo vem antes de showResearch');
  const offBody = src.slice(src.indexOf('function showOffReply'), src.indexOf('function showResearch'));
  assert.doesNotMatch(offBody, /failReply|hideLauncher/);
  assert.match(offBody, /speakThenRest\(\)/);
  assert.match(src, /if \(!lib \|\| !msg\.canResearch \|\| ui\.researchOff\) return;/, 'sem botão depois de researchDisabled');
});

test('o CSS novo da pesquisa usa só tokens, alvo de toque de 44 px e respeita movimento reduzido', () => {
  const css = read('frontend/assistant-feedback.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'cor hexadecimal fixa');
  assert.match(css, /\.lia-research-btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.lia-research-link\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
