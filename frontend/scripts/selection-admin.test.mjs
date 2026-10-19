/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Painel da comissão do processo seletivo (frontend/selection-admin.js): funções puras e fiação no app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SA = require('../selection-admin.js');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8');

test('contadores somam os status certos', () => {
  const out = SA.counters({ counts: { submitted: 3, in_review: 2, interview: 1, waitlist: 4, approved: 5, not_selected: 6 }, appeals: 2 });
  assert.deepEqual(out.map((c) => [c.filter, c.value]), [['pending', 6], ['waitlist', 4], ['decided', 11], ['appeal', 2]]);
  assert.deepEqual(SA.counters(null).map((c) => c.value), [0, 0, 0, 0]);
});

test('textos de status, sinais, data e curso', () => {
  assert.equal(SA.statusLabel('waitlist'), 'Lista de espera');
  assert.deepEqual(SA.signalLabels(['saude', 'injecao', 'x']).length, 2);
  assert.match(SA.signalLabels(['saude'])[0], /ler com atenção/);
  assert.equal(SA.formatDate('2026-10-05T10:00:00Z'), '05/10/2026');
  assert.equal(SA.formatDate('lixo'), '');
  assert.equal(SA.courseLine({ course: 'Farmácia', semester: '5' }), 'Farmácia · 5º semestre');
  assert.equal(SA.courseLine({ course: 'Farmácia', semester: 'concluido' }), 'Farmácia · concluído');
  assert.equal(SA.listCountText(0), 'Nenhuma inscrição neste filtro.');
  assert.equal(SA.listCountText(1), '1 inscrição');
});

test('respostas ganham rótulos fixos e ignoram o que está vazio', () => {
  const sections = SA.answerSections({
    profile: { course: 'Farmácia', semester: '5', days: ['seg'], shifts: ['noite'], hoursPerWeek: 6 },
    scenario: { text: 'Minha análise' },
    thinking: { answers: { t01: 'Projeto X', t03: { text: 'Aprendo lendo' } } },
    conduct: { answers: { c01: 'Avisaria a coordenação.' } },
  });
  assert.deepEqual(sections.map((s) => s.id), ['profile', 'scenario', 'thinking', 'conduct']);
  const thinking = sections[2].rows;
  assert.deepEqual(thinking.map((r) => r.label), ['Seu projeto', 'Aprender sozinho(a)']);
  assert.equal(thinking[1].text, 'Aprendo lendo');
  assert.equal(sections[3].rows[0].label, 'Prazo em risco');
  assert.match(sections[3].rows[0].text, /Avisaria a coordenação/);
  assert.deepEqual(SA.answerSections({}), []);
});

test('resumo da IA: itens em texto ou objeto', () => {
  assert.deepEqual(SA.triageLines(['a', { label: 'Fonte', note: 'sem citação' }, null]), ['a', 'Fonte: sem citação']);
});

test('decisões: aprovar e não selecionar pedem confirmação', () => {
  assert.deepEqual(SA.DECISIONS.map((d) => d.id), ['in_review', 'interview', 'waitlist', 'approved', 'not_selected']);
  assert.ok(SA.decisionOption('approved').confirm);
  assert.ok(SA.decisionOption('not_selected').confirm);
  assert.equal(SA.decisionOption('interview').confirm, null);
  assert.equal(SA.decisionOption('x'), null);
});

test('configurações: valida números e data e monta a carga', () => {
  const ok = SA.settingsPayload({ isOpen: true, windowDays: '7', batchEveryDays: '15', nextReviewOn: '2026-11-05', vacanciesNote: ' 10 vagas ' });
  assert.deepEqual(ok, { ok: true, payload: { isOpen: true, windowDays: 7, batchEveryDays: 15, nextReviewOn: '2026-11-05', vacanciesNote: '10 vagas' } });
  assert.equal(SA.settingsPayload({ windowDays: '0', batchEveryDays: '15' }).ok, false);
  assert.equal(SA.settingsPayload({ windowDays: '7', batchEveryDays: '2.5' }).ok, false);
  assert.equal(SA.settingsPayload({ windowDays: '7', batchEveryDays: '15', nextReviewOn: '05/11/2026' }).ok, false);
  assert.equal(SA.settingsPayload({ windowDays: '7', batchEveryDays: '15', nextReviewOn: '' }).payload.nextReviewOn, null);
});

test('fiação: html, app, build, sw e sem innerHTML nem estilo inline', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="stylesheet" href="selection-admin\.css">/);
  assert.match(html, /<script src="selection-admin\.js" defer><\/script>/);
  assert.match(html, /<section id="panel-admin-selection" class="hidden">[\s\S]*?id="selection-admin-root"/);
  assert.match(html, /<button type="button" data-panel="panel-admin-selection" data-scope="admin">/);
  assert.match(read('app.js'), /'panel-admin-selection': function \(\) \{ if \(window\.LaiftSelectionAdmin\) window\.LaiftSelectionAdmin\.load\(/);
  for (const f of ['scripts/build.js', 'sw.js']) {
    assert.match(read(f), /'selection-admin\.js'/);
    assert.match(read(f), /'selection-admin\.css'/);
  }
  const js = read('selection-admin.js');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|\.style\.|setAttribute\('style'/.test(js));
  assert.ok(!/style=/.test(js));
});
