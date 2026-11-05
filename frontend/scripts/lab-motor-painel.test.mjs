/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O3: integração do motor à bancada — carregamento sob demanda, chave labMotor e vista do painel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../modulos/laboratorio');
const Car = require('../modulos/laboratorio/js/lab-motor-carregador.js');
const Pai = require('../modulos/laboratorio/js/lab-motor-painel.js');
const P = require('../modulos/laboratorio/js/lab-motor-processo.js');
const G = require('../modulos/laboratorio/js/lab-guia.js');
const { ESPECIES } = require('../modulos/laboratorio/js/lab-motor-especies.js');
const NACL = JSON.parse(fs.readFileSync(path.join(LAB, 'data/processos/proc_nacl_09_v1.json'), 'utf8'));
const ctx = { especies: ESPECIES };

test('chave labMotor: desligada por padrão, liga com ?flags=labMotor; labGuiado segue ligado', () => {
  assert.equal(G.flagLigada('labMotor', '', null), false);
  assert.equal(G.flagLigada('labMotor', '?flags=labMotor', null), true);
  assert.equal(G.flagLigada('labGuiado', '', null), true);
  const janela = (search, flags) => ({ LabGuia: G, location: { search }, __labFlags: flags });
  assert.equal(Car.flagLigada(janela('', null)), false);
  assert.equal(Car.flagLigada(janela('?flags=labMotor', null)), true);
  assert.equal(Car.flagLigada(janela('', { labMotor: true })), true);
  assert.equal(Car.flagLigada({}), false);
});

function docFalso() {
  const head = [];
  const cab = { filhos: [], appendChild(n) { this.filhos.push(n); } };
  return {
    head: { appendChild(s) { head.push(s); setTimeout(() => s.onload()); } },
    scripts: head,
    cab,
    querySelector: (sel) => (sel === '#tabMissao .panel-section-header' ? cab : null),
    getElementById: (id) => cab.filhos.find((n) => n.id === id) || null,
    createElement: () => ({ dataset: {}, addEventListener(ev, fn) { this.ouvinte = fn; } })
  };
}

test('carregador: só insere o botão com a chave ligada; o motor não é baixado até o toque', () => {
  const desligado = docFalso();
  assert.equal(Car.iniciar({ document: desligado, LabGuia: G, location: { search: '' } }), false);
  assert.equal(desligado.cab.filhos.length, 0);
  const ligado = docFalso();
  assert.equal(Car.iniciar({ document: ligado, LabGuia: G, location: { search: '?flags=labMotor' } }), true);
  assert.equal(ligado.cab.filhos[0].id, 'btnProcessoGuiado');
  assert.equal(ligado.cab.filhos[0].textContent, 'Processo guiado');
  assert.equal(ligado.scripts.length, 0, 'nenhum script do motor antes do toque');
});

test('carregador: baixa os scripts do motor na ordem certa, uma vez só', async () => {
  const doc = docFalso();
  await Car.carregarMotor(doc);
  await Car.carregarMotor(doc);
  assert.deepEqual(doc.scripts.map((s) => s.src), Car.ARQUIVOS);
  assert.ok(doc.scripts.every((s) => s.async === false));
  assert.equal(Car.ARQUIVOS[Car.ARQUIVOS.length - 1], 'js/lab-motor-painel.js');
  for (const f of Car.ARQUIVOS) assert.ok(fs.existsSync(path.join(LAB, f)), f);
});

test('carregador: só busca processo da lista fechada, no mesmo domínio', async () => {
  const pedidos = [];
  const buscar = async (url) => { pedidos.push(url); return { ok: true, json: async () => NACL }; };
  assert.equal((await Car.carregarProcesso(buscar, 'proc_nacl_09_v1')).id, 'proc_nacl_09_v1');
  assert.deepEqual(pedidos, ['data/processos/proc_nacl_09_v1.json']);
  await assert.rejects(() => Car.carregarProcesso(buscar, '../../segredo'), /desconhecido/);
  await assert.rejects(() => Car.carregarProcesso(buscar, 'proc_outro_v1'), /desconhecido/);
  await assert.rejects(() => Car.carregarProcesso(async () => ({ ok: false, status: 404 }), 'proc_nacl_09_v1'), /404/);
  for (const id of Object.keys(Car.PROCESSOS)) assert.ok(fs.existsSync(path.join(LAB, `data/processos/${id}.json`)), id);
});

test('painel: vista mostra etapa, o que está acontecendo, porquê e cálculo; ao fim, o relatório do lote', () => {
  const s0 = P.iniciarSessao(NACL, ctx, { semente: 3 });
  const v0 = Pai.vistaDaEtapa(s0, NACL, ctx);
  assert.equal(v0.progresso, 'Etapa 1 de 10: Paramentação');
  assert.ok(v0.acontecendo && v0.porque);
  assert.equal(v0.calculo, null);
  assert.equal(v0.podeVoltar, false);
  const s1 = P.executarEtapa(s0, NACL, ctx, {}).sessao;
  const v1 = Pai.vistaDaEtapa(s1, NACL, ctx);
  assert.match(v1.progresso, /^Etapa 2 de 10/);
  assert.equal(v1.calculo.unidade, 'g');
  assert.equal(v1.podeVoltar, true);
  assert.ok(v1.caderno.length > 0 && v1.caderno.length <= 12);
  const fim = P.rodarProcesso(NACL, ctx, { semente: 3, respostas: { e2: '0,9', e7: '308' } }).sessao;
  const vf = Pai.vistaDaEtapa(fim, NACL, ctx);
  assert.equal(vf.terminado, true);
  assert.match(vf.resumo, /^Lote conforme/);
  assert.ok(vf.conferencias.every((c) => c.startsWith('Conforme')));
});

test('painel e carregador: sem innerHTML, sem handler inline, sem eval; carregador vem depois do script.js', () => {
  for (const f of ['js/lab-motor-painel.js', 'js/lab-motor-carregador.js']) {
    const src = fs.readFileSync(path.join(LAB, f), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function|\bonclick\s*=|setAttribute\(\s*['"]on/i.test(src), f);
    assert.match(src, /© 2026 Daniel Pires Francisco/);
  }
  const html = fs.readFileSync(path.join(LAB, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/lab-motor-carregador.js') > html.indexOf('js/script.js'));
  assert.ok(!/lab-motor-(estado|processo|painel)\.js/.test(html), 'o motor não é carregado com a página');
});
