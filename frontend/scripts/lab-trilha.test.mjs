/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O4: trilha de missões (nível 0 a 8) como dado, progresso no aparelho e trava de conteúdo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../modulos/laboratorio');
const Tr = require('../modulos/laboratorio/js/lab-trilha.js');
const V = require('../modulos/laboratorio/js/lab-motor-validador.js');
const Car = require('../modulos/laboratorio/js/lab-motor-carregador.js');
const { ESPECIES } = require('../modulos/laboratorio/js/lab-motor-especies-farmaco.js');
const TRILHA = JSON.parse(fs.readFileSync(path.join(LAB, 'data/trilha/trilha_v1.json'), 'utf8'));

function processos() {
  const dir = path.join(LAB, 'data/processos');
  const mapa = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    mapa[p.id] = p;
  }
  return mapa;
}

/** Valores dos campos do controle que reproduzem exatamente a ação do processo. */
function valoresPadrao(C, acao, ctx) {
  const def = C.controle(acao.alvoUI, ctx, acao);
  const p = acao.parametros || {};
  const v = {};
  for (const c of def ? def.campos : []) {
    const fonte = c.agrupar ? (p[c.agrupar] || {})[c.id] : p[c.id];
    if (fonte === undefined) continue;
    v[c.id] = c.tipo === 'numero' ? String(fonte) : (c.tipo === 'marcas' ? fonte.map(String) : fonte);
  }
  return v;
}

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('trilha: níveis 0 a 8 presentes, ids únicos, validador sem erro', () => {
  const niveis = new Set(TRILHA.missoes.map((m) => m.nivel));
  for (let n = 0; n <= 8; n++) assert.ok(niveis.has(n), `nível ${n}`);
  assert.equal(new Set(TRILHA.missoes.map((m) => m.id)).size, TRILHA.missoes.length);
  assert.deepEqual(Tr.validarTrilha(TRILHA, processos()), []);
  assert.equal(TRILHA.missoes[0].id, 'm1_nacl_09');
  assert.equal(TRILHA.missoes[0].nivel, 0);
  assert.equal(TRILHA.missoes[TRILHA.missoes.length - 1].tipo, 'investigacao');
});

test('trava de conteúdo: missão jogável só com processo existente, completo e válido; o carregador conhece o processo', () => {
  const mapa = processos();
  for (const m of TRILHA.missoes.filter((x) => x.processoRef)) {
    const p = mapa[m.processoRef];
    assert.ok(p, `${m.id}: processo ${m.processoRef} inexistente`);
    assert.equal(p.nivel_conteudo, 'completo');
    assert.equal(V.validarProcesso(p, { especies: ESPECIES }).ok, true, m.id);
    assert.ok(Object.prototype.hasOwnProperty.call(Car.PROCESSOS, m.processoRef), `${m.processoRef} fora da lista fechada do carregador`);
    const C = require('../modulos/laboratorio/js/lab-tutor-controles.js');
    if (m.tipo === 'processo') for (const e of p.etapas) assert.ok(TRILHA.competencias[C.competenciaDaEtapa(m, e)], `${m.id}: etapa ${e.id} sem competência`);
  }
  const ruim = { ...TRILHA, missoes: TRILHA.missoes.concat([{ id: 'x', nivel: 3, titulo: 'X', tipo: 'processo', processoRef: 'proc_inexistente_v1', objetivos: ['a'] }]) };
  assert.ok(Tr.validarTrilha(ruim, mapa).some((e) => /inexistente/.test(e)));
  const educ = { ...mapa, proc_edu_v1: { id: 'proc_edu_v1', nivel_conteudo: 'educacional', etapas: [] } };
  const comEdu = { ...TRILHA, missoes: TRILHA.missoes.concat([{ id: 'y', nivel: 3, titulo: 'Y', tipo: 'processo', processoRef: 'proc_edu_v1', objetivos: ['a'], etapas: {} }]) };
  assert.ok(Tr.validarTrilha(comEdu, educ).some((e) => /educacional/.test(e)));
});

test('toda missão jogável vai do início ao fim pelo tutor usando os controles com os valores do processo', () => {
  const T = require('../modulos/laboratorio/js/lab-tutor.js');
  const C = require('../modulos/laboratorio/js/lab-tutor-controles.js');
  const ctx = { especies: ESPECIES };
  const mapa = processos();
  const jogaveis = TRILHA.missoes.filter((m) => m.tipo === 'processo' && m.processoRef);
  assert.ok(jogaveis.length >= 8, `missões jogáveis: ${jogaveis.length}`);
  for (const m of jogaveis) {
    const p = mapa[m.processoRef];
    let t = T.criar(p, m, ctx, { semente: 3, ajuda: { ligada: true, nivel: 'completa' } });
    let guarda = 200;
    while (!t.sessao.terminado && guarda-- > 0) {
      const v = T.vista(t, p, ctx);
      const et = p.etapas[t.sessao.indice];
      const acao = [].concat(et.acao).find((a) => a.alvoUI === v.alvo);
      assert.ok(acao, `${m.id}: alvo ${v.alvo} fora da etapa ${et.id}`);
      assert.ok(C.controle(acao.alvoUI, ctx, acao), `${m.id}: sem controle para ${acao.alvoUI}`);
      const resposta = et.calculoPrevio ? String(et.calculoPrevio.resposta) : undefined;
      const r = T.agir(t, p, ctx, { alvo: acao.alvoUI, valores: valoresPadrao(C, acao, ctx), resposta });
      assert.ok(!['erro', 'fora_de_ordem', 'repetido'].includes(r.retorno.tipo), `${m.id} ${et.id}: ${r.retorno.tipo} ${r.retorno.mensagens.join(' ')}`);
      if (r.retorno.tipo === 'bloqueada') assert.fail(`${m.id} ${et.id} bloqueada: ${r.retorno.mensagens.join(' ')}`);
      t = r.tutor;
      if (r.retorno.tipo === 'aguardar') t = T.pular(t, p, ctx).tutor;
    }
    assert.equal(t.sessao.terminado, true, m.id);
    assert.ok(t.competencias.every((e) => TRILHA.competencias[e.competencia]), `${m.id}: competência sem nome`);
  }
});

test('texto público da trilha: sem selo de revisão, sem bastidor e sem termo vetado', () => {
  const texto = JSON.stringify(TRILHA);
  assert.doesNotMatch(texto, /revisad|rascunho|\[NV\]|por IA|intelig[eê]ncia artificial/i);
  assert.doesNotMatch(texto, /sarin|\bVX\b|mostarda|tabun|soman|fentanil|metanfetamina|ricina/i);
  assert.doesNotMatch(texto, /\wzinh[oa]s?\b|\b(pouquinho|rapidinho|copinho|frasquinho)\b/i, 'sem diminutivos');
});

test('situação: no começo só a Missão 1 está disponível; a investigação abre depois dela', () => {
  const s0 = Tr.situacao(TRILHA, Tr.progressoVazio());
  const porId = Object.fromEntries(s0.map((x) => [x.missao.id, x]));
  assert.equal(porId.m1_nacl_09.estado, 'disponivel');
  const inv = s0.find((x) => x.missao.tipo === 'investigacao');
  assert.equal(inv.estado, 'bloqueada');
  assert.match(inv.motivo, /Missão 1/);
  assert.ok(s0.filter((x) => !x.missao.processoRef).every((x) => x.estado === 'em_preparacao'));
  const p1 = Tr.registrarConclusao(Tr.progressoVazio(), 'm1_nacl_09', { conforme: false, desvios: 2 });
  const p2 = Tr.registrarConclusao(p1, 'm1_nacl_09', { conforme: true, desvios: 0 });
  assert.equal(p1.missoes.m1_nacl_09.vezes, 1);
  assert.equal(p2.missoes.m1_nacl_09.vezes, 2);
  assert.equal(p2.missoes.m1_nacl_09.conforme, true, 'guarda o melhor resultado');
  assert.equal(p2.missoes.m1_nacl_09.menorDesvios, 0);
  const p3 = Tr.registrarConclusao(p2, 'm1_nacl_09', { conforme: false, desvios: 4 });
  assert.equal(p3.missoes.m1_nacl_09.conforme, true);
  assert.notEqual(p1, p2, 'imutável');
  const s1 = Tr.situacao(TRILHA, p2);
  assert.equal(s1.find((x) => x.missao.id === 'm1_nacl_09').estado, 'concluida');
  assert.equal(s1.find((x) => x.missao.tipo === 'investigacao').estado, 'disponivel');
  assert.ok(Tr.porNivel(TRILHA).length === 9);
});

test('progresso no aparelho: lê e grava com tolerância a falhas e a dado inválido', () => {
  const mem = memoria();
  assert.deepEqual(Tr.lerProgresso(mem), Tr.progressoVazio());
  const p = Tr.registrarConclusao(Tr.progressoVazio(), 'm1_nacl_09', { conforme: true, desvios: 0 });
  assert.equal(Tr.salvarProgresso(mem, p), true);
  assert.deepEqual(Tr.lerProgresso(mem), p);
  mem.setItem(Tr.CHAVE, '{quebrado');
  assert.deepEqual(Tr.lerProgresso(mem), Tr.progressoVazio());
  mem.setItem(Tr.CHAVE, JSON.stringify({ v: 1, missoes: { m1_nacl_09: { vezes: 'x' }, '<script>': { vezes: 1 } } }));
  const lido = Tr.lerProgresso(mem);
  assert.equal(lido.missoes['<script>'], undefined, 'id inválido descartado');
  assert.equal(lido.missoes.m1_nacl_09.vezes, 0);
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('cheio'); } };
  assert.deepEqual(Tr.lerProgresso(quebrado), Tr.progressoVazio());
  assert.equal(Tr.salvarProgresso(quebrado, p), false);
  assert.equal(Tr.salvarProgresso(null, p), false);
});

test('carregador (O4): tutor depois do motor, trilha e processos só da lista fechada; botão da trilha só com a chave', async () => {
  for (const f of Car.ARQUIVOS_TUTOR) assert.ok(fs.existsSync(path.join(LAB, f)), f);
  assert.equal(Car.ARQUIVOS_TUTOR[Car.ARQUIVOS_TUTOR.length - 1], 'js/lab-tutor-ui.js');
  const pedidos = [];
  const buscar = async (url) => {
    pedidos.push(url);
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(LAB, url), 'utf8')) };
  };
  const d = await Car.carregarTrilha(buscar);
  assert.equal(d.trilha.id, 'trilha_v1');
  assert.deepEqual(pedidos, [Car.TRILHA], 'abrir a trilha não baixa nenhum processo');
  assert.equal((await d.buscarProcesso('proc_nacl_09_v1')).id, 'proc_nacl_09_v1');
  await d.buscarProcesso('proc_nacl_09_v1');
  assert.deepEqual(pedidos, [Car.TRILHA, 'data/processos/proc_nacl_09_v1.json'], 'o processo é buscado só ao jogar, uma vez');
  await assert.rejects(() => d.buscarProcesso('../segredo'), /desconhecido/);
  await assert.rejects(() => Car.carregarTrilha(async () => ({ ok: false, status: 500 })), /500/);
  for (const m of TRILHA.missoes.filter((x) => x.processoRef)) assert.ok(fs.existsSync(path.join(LAB, `data/processos/${m.processoRef}.json`)), m.processoRef);
  const html = fs.readFileSync(path.join(LAB, 'index.html'), 'utf8');
  assert.ok(!/lab-tutor|lab-trilha/.test(html), 'o tutor não vem com a página');
  const G = require('../modulos/laboratorio/js/lab-guia.js');
  const cab = { filhos: [], appendChild(n) { this.filhos.push(n); } };
  const doc = { querySelector: () => cab, getElementById: (id) => cab.filhos.find((n) => n.id === id) || null, createElement: () => ({ dataset: {}, addEventListener() {} }) };
  assert.equal(Car.iniciar({ document: doc, LabGuia: G, location: { search: '' } }), false);
  assert.equal(cab.filhos.length, 0);
  assert.equal(Car.iniciar({ document: doc, LabGuia: G, location: { search: '?flags=labMotor' } }), true);
  assert.deepEqual(cab.filhos.map((n) => n.id), ['btnProcessoGuiado', 'btnTrilha']);
});
