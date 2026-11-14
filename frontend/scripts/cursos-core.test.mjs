/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Núcleo da tela Cursos e da página pública do certificado (frontend/modulos/cursos/cursos-core.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('../modulos/cursos/cursos-core.js');

/** DOM mínimo: o suficiente para provar que o texto da aula vira só elementos e nós de texto. */
function fakeDoc() {
  const node = (tag) => ({
    tag, children: [], className: '', _text: '',
    appendChild(c) { this.children.push(c); return c; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
  });
  return {
    createElement: node,
    createDocumentFragment: () => node('#fragment'),
    createTextNode: (t) => ({ tag: '#text', children: [], textContent: String(t) }),
  };
}
const tags = (n) => [n.tag].concat(n.children.flatMap(tags));

test('carga horária por extenso', () => {
  assert.equal(Core.workloadText(30), '30 minutos');
  assert.equal(Core.workloadText(1), '1 minuto');
  assert.equal(Core.workloadText(60), '1 hora');
  assert.equal(Core.workloadText(150), '2 h 30 min');
  assert.equal(Core.workloadText(240), '4 horas');
  assert.equal(Core.workloadText('x'), '0 minutos');
});

test('datas no fuso de Brasília e entrada inválida vazia', () => {
  assert.equal(Core.dateText('2026-11-14T02:00:00Z'), '13/11/2026');
  assert.equal(Core.dateText(''), '');
  assert.equal(Core.dateText('nada'), '');
  assert.equal(Core.dateTimeText('nada'), '');
});

test('frases da prova e quando o botão aparece', () => {
  assert.match(Core.examText({ state: 'aulas_pendentes' }), /Leia todas as aulas/);
  assert.match(Core.examText({ state: 'tentativas_esgotadas', maxAttempts: 3 }), /3 tentativas/);
  assert.match(Core.examText({ state: 'aprovado', scorePct: 90 }), /90%/);
  assert.match(Core.examText({ state: 'aguardar', retryAt: '2026-11-15T12:00:00Z' }), /Nova tentativa/);
  assert.equal(Core.examText({ state: '???' }), '');
  assert.equal(Core.canStart({ state: 'disponivel' }), true);
  assert.equal(Core.canStart({ state: 'em_andamento' }), true);
  assert.equal(Core.canStart({ state: 'aguardar' }), false);
  assert.equal(Core.canStart(null), false);
});

test('situação do certificado, endereço de conferência e código lido do endereço', () => {
  assert.equal(Core.certStatusText('valido'), 'Válido');
  assert.equal(Core.certStatusText('revogado'), 'Revogado');
  assert.equal(Core.certStatusText('x'), 'Não encontrado');
  assert.equal(Core.verifyUrl('https://laift.com.br/', 'LAIFT-ABCDE-FGHJK'), 'https://laift.com.br/certificado/LAIFT-ABCDE-FGHJK');
  assert.equal(Core.codeFromLocation('/certificado/laift-abcde-fghjk', ''), 'LAIFT-ABCDE-FGHJK');
  assert.equal(Core.codeFromLocation('/certificado/', '?c=LAIFT-ABCDE-FGHJK'), 'LAIFT-ABCDE-FGHJK');
  assert.equal(Core.codeFromLocation('/certificado/<script>', ''), '');
});

test('texto da aula: títulos, listas, tabela, negrito e nada de HTML cru', () => {
  const md = [
    '## 1. Título', 'Parágrafo com **negrito** e *ênfase*.', '', '- item a', '- item b', '', '1. passo um', '2. passo dois', '',
    '| Item | Uso |', '|---|---|', '| Jaleco | Protege |', '', '<img src=x onerror=alert(1)>', '### Sub',
  ].join('\n');
  const frag = Core.renderMarkdown(fakeDoc(), md);
  const all = tags(frag);
  ['h3', 'h4', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'table', 'tr', 'th', 'td'].forEach((t) => assert.ok(all.includes(t), 'falta ' + t));
  assert.ok(!all.includes('img'));
  assert.match(frag.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(frag.children.filter((c) => c.tag === 'ul')[0].children.length, 2);
});
