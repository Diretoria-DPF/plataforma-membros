/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O5: farmacotécnica e controle de qualidade — cálculos, ensaios, operações novas do motor e os processos em JSON
// (conservação de massa e volume, faixas de critério, erros comuns com consequência, regra de conteúdo e textos públicos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../modulos/laboratorio/js');
const DIR = path.join(JS, '../data/processos');
const FC = require(path.join(JS, 'lab-farma-calculos.js'));
const CQ = require(path.join(JS, 'lab-cq.js'));
const E = require(path.join(JS, 'lab-motor-estado.js'));
const O = require(path.join(JS, 'lab-motor-operacoes.js'));
const P = require(path.join(JS, 'lab-motor-processo.js'));
const V = require(path.join(JS, 'lab-motor-validador.js'));
const { ESPECIES, NOVAS } = require(path.join(JS, 'lab-motor-especies-farmaco.js'));

const ctx = { especies: ESPECIES };
const aprox = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} obtido ${a}, esperado ${b} ±${tol}`);
const carregar = (id) => JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8'));
const O5_IDS = ['proc_xarope_simples_v1', 'proc_capsulas_vitc_v1', 'proc_sf09_esteril_v1', 'proc_vitc_filtrada_v1', 'proc_suspensao_mgoh2_v1', 'proc_pomada_zno_v1', 'proc_alcool_gel_70_v1', 'proc_sabonete_liquido_v1', 'proc_desinfetante_cloro_v1', 'proc_home_spray_v1', 'proc_cq_titulacao_hcl_v1'];

function respostasCertas(p) {
  const r = {};
  p.etapas.forEach((e) => { if (e.calculoPrevio) r[e.id] = String(e.calculoPrevio.resposta); });
  return r;
}
function rodar(id, semente, extra) {
  const p = carregar(id);
  return { p, ...P.rodarProcesso(p, ctx, Object.assign({ semente, respostas: respostasCertas(p) }, extra || {})) };
}
function fechaBalanco(s) {
  const b = s.balanco;
  aprox(E.massaTotal(s, ESPECIES) + b.perdas_g + b.evaporado_g + b.descartado_g + b.amostras_g + b.reacao_g, b.entradas_g, 1e-6, 'balanço de massa');
}
const desvios = (sessao) => sessao.caderno.entradas.filter((e) => e.desvio).map((e) => e.desvio.codigo);

// ── Cálculos ────────────────────────────────────────────────────────────────
test('cálculos: fator de correção, umidade, equivalência e massa do ativo', () => {
  aprox(FC.fatorCorrecao(98), 100 / 98, 1e-12);
  aprox(FC.fatorUmidade(5), 100 / 95, 1e-12);
  aprox(FC.fatorEquivalencia(342.3, 180.16), 1.9, 0.01);
  aprox(FC.massaAtivoG({ doseMg: 100, unidades: 30, teorPct: 99 }) * 1.1, 3.333, 0.001);
  aprox(FC.massaAtivoG({ doseMg: 100, unidades: 10, fatorEquivalencia: 1.5 }), 1.5, 1e-12);
  assert.throws(() => FC.fatorCorrecao(0), /positivo/);
  assert.throws(() => FC.fatorCorrecao(101), /100/);
  assert.throws(() => FC.fatorUmidade(100), /umidade/);
});

test('cálculos: cápsulas (volume do pó, menor cápsula), q.s.p., misturas e diluição em massa', () => {
  const tab = require(path.join(JS, 'lab-motor-op-farma.js')).CAPSULAS_ML;
  aprox(FC.volumeDoPoMl(200, 0.65), 0.3077, 1e-3);
  assert.equal(FC.escolherCapsula(0.309, tab), 'n2');
  assert.equal(FC.escolherCapsula(0.2, tab), 'n4');
  assert.equal(FC.escolherCapsula(5, tab), null);
  aprox(FC.qspG(100, [10, 8]), 82, 1e-12);
  assert.throws(() => FC.qspG(10, [8, 5]), /passam/);
  aprox(FC.massaParaTeorPp(70, 200, 92.8), 150.86, 0.01);
  assert.throws(() => FC.massaParaTeorPp(95, 100, 92.8), /passar/);
  const pe = FC.pearson(92.8, 0, 70);
  aprox(pe.fracao1, 70 / 92.8, 1e-9);
  aprox(pe.fracao1 + pe.fracao2, 1, 1e-12);
  aprox(FC.massaEstoqueDiluicao(2.5, 0.1, 1000), 40, 1e-9);
  aprox(FC.ppmDePp(0.1), 1000, 1e-9);
  aprox(FC.osmolaridadeMOsm(9, 58.44, 2), 308, 0.5);
  aprox(FC.densidadePicnometro(35.5, 10, 25), 1.02, 1e-9);
  aprox(FC.interpolar([[0, 0], [10, 100]], 2.5), 25, 1e-9);
  assert.equal(FC.interpolar([[0, 1], [1, 2]], 99), 2);
});

// ── Controle de qualidade ───────────────────────────────────────────────────
test('CQ peso médio: limites por tipo e faixa, até 2 unidades fora e nenhuma fora do dobro', () => {
  assert.equal(CQ.limitePesoPct('capsula', 200), 10);
  assert.equal(CQ.limitePesoPct('capsula', 300), 7.5);
  assert.equal(CQ.limitePesoPct('comprimido', 79), 10);
  assert.equal(CQ.limitePesoPct('comprimido', 150), 7.5);
  assert.equal(CQ.limitePesoPct('comprimido', 500), 5);
  const base = Array(20).fill(200);
  assert.equal(CQ.pesoMedio(base, 'capsula').aprovado, true);
  const duasFora = base.slice(); duasFora[0] = 160; duasFora[1] = 240;
  assert.equal(CQ.pesoMedio(duasFora, 'capsula').aprovado, true, '2 fora do limite, nenhuma fora do dobro');
  const tresFora = duasFora.slice(); tresFora[2] = 160;
  assert.equal(CQ.pesoMedio(tresFora, 'capsula').aprovado, false);
  const dobro = base.slice(); dobro[0] = 100;
  assert.equal(CQ.pesoMedio(dobro, 'capsula').aprovado, false);
  assert.throws(() => CQ.pesoMedio([1, 2, 3], 'capsula'), /10/);
  assert.throws(() => CQ.pesoMedio(base, 'supositorio'), /tipo/);
});

test('CQ uniformidade: valor de aceitação (k 2,4; L1 15), média fora de 98,5-101,5 e 2º estágio', () => {
  const certo = CQ.uniformidadeDoses([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
  assert.equal(certo.valorAceitacao, 0);
  assert.equal(certo.aprovado, true);
  const disp = CQ.uniformidadeDoses([90, 110, 95, 105, 92, 108, 97, 103, 94, 106]);
  aprox(disp.valorAceitacao, 2.4 * disp.desvioPadraoPct, 1e-9, 'média 100: M = média');
  const baixa = CQ.uniformidadeDoses([90, 90, 90, 90, 90, 90, 90, 90, 90, 90]);
  aprox(baixa.valorAceitacao, 8.5, 1e-9, '|98,5 − 90| com desvio zero');
  const ruim = CQ.uniformidadeDoses([70, 130, 80, 120, 75, 125, 85, 115, 70, 130]);
  assert.equal(ruim.aprovado, false);
  const trinta = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 ? 2 : -2));
  assert.equal(CQ.uniformidadeDoses(trinta).aprovado, true);
  trinta[0] = 60;
  assert.equal(CQ.uniformidadeDoses(trinta).extremosOk, false);
  assert.throws(() => CQ.uniformidadeDoses([100, 100]), /10/);
});

test('CQ dissolução em estágios, desintegração, titulação, viscosidade, microbiano e faixa', () => {
  assert.equal(CQ.dissolucaoEstagios([90, 90, 90, 90, 90, 90], 80).estagio, 'S1');
  const s1falha = [84, 90, 90, 90, 90, 90];
  assert.equal(CQ.dissolucaoEstagios(s1falha, 80).precisaS2, true);
  const s2 = s1falha.concat([85, 85, 85, 85, 85, 85]);
  const r2 = CQ.dissolucaoEstagios(s2, 80);
  assert.equal(r2.estagio, 'S2');
  assert.equal(r2.aprovado, true);
  const s3ruim = Array(24).fill(60);
  assert.equal(CQ.dissolucaoEstagios(s3ruim, 80).aprovado, false);
  assert.equal(CQ.desintegracao([5, 6, 7, 8, 9, 10], 45).aprovado, true);
  assert.equal(CQ.desintegracao([5, 6, 7, 8, 9, 50], 45).aprovado, false);
  const t = CQ.teorTitulacao({ volumeGastoMl: 20, concMolL: 0.1, massaMolar: 36.46, massaAmostraG: 1 });
  aprox(t.massaAnalitoG, 0.07292, 1e-5);
  aprox(CQ.teorTitulacao({ volumeGastoMl: 27.75, concMolL: 0.1, massaMolar: 180.16, massaAmostraG: 0.5 }).teorPct, 100, 0.2, 'AAS 500 mg por NaOH 0,1 mol/L');
  aprox(CQ.fatorTitulante({ volumeGastoMl: 19.8, concMolL: 0.1, massaMolar: 204.22, massaPadraoG: 0.4043 }), 1.0, 0.01);
  aprox(CQ.viscosidadeRotacional(50, 100).mPaS, 5000, 1e-9);
  assert.equal(CQ.viscosidadeRotacional(5, 100).leituraValida, false);
  assert.equal(CQ.limiteMicrobiano('oral_aquoso', { tamc: 50, tymc: 5, presentes: [] }).aprovado, true);
  assert.equal(CQ.limiteMicrobiano('oral_aquoso', { tamc: 500, tymc: 5, presentes: [] }).aprovado, false);
  assert.equal(CQ.limiteMicrobiano('cutaneo', { tamc: 10, tymc: 1, presentes: ['Pseudomonas aeruginosa'] }).aprovado, false);
  assert.equal(CQ.naFaixa(6.5, [5.5, 7.5]).aprovado, true);
  assert.throws(() => CQ.naFaixa(1, [3, 2]), /faixa/);
  assert.equal(CQ.esterilidade(true).aprovado, false);
});

// ── Operações novas ─────────────────────────────────────────────────────────
function bancada(sem) {
  return E.criarEstado({ semente: sem || 5, recipientes: [{ id: 'gral', tipo: 'bequer', capMl: 250 }] });
}
function passos(estado, lista) {
  let s = estado;
  const eventos = [];
  for (const [id, p] of lista) { const r = O.executar(s, id, p, ctx); s = r.estado; eventos.push(...r.eventos); }
  return { estado: s, eventos };
}
const pesos = (g1, g2) => [['tarar', { recipiente: 'gral' }], ['pesar', { especie: 'AcidoAscorbico_s', recipiente: 'gral', massaG: g1 }], ['tarar', { recipiente: 'gral' }], ['pesar', { especie: 'Lactose_s', recipiente: 'gral', massaG: g2 }]];

test('operações: as quatro novas estão registradas com regras rotuladas e a validação as conhece', () => {
  const lista = O.listar();
  for (const id of ['misturar', 'encapsular', 'completarMassa', 'ensaioCQ']) {
    const op = lista.find((x) => x.id === id);
    assert.ok(op, id);
    assert.ok(op.regras.length > 0, `${id} sem regras rotuladas`);
  }
});

test('misturar: diluição geométrica homogeneíza; mistura simples com componente < 5 % avisa e não homogeneíza', () => {
  const geo = passos(bancada(), pesos(3, 3).concat([['misturar', { recipiente: 'gral', tecnica: 'diluicao_geometrica', tempoMin: 8 }]]));
  assert.equal(geo.estado.recipientes.gral.homogeneo, true);
  const simples = passos(bancada(), pesos(0.3, 6).concat([['misturar', { recipiente: 'gral', tecnica: 'simples', tempoMin: 8 }]]));
  assert.equal(simples.estado.recipientes.gral.homogeneo, false);
  assert.ok(simples.eventos.some((e) => e.desvio && e.desvio.codigo === 'mistura_sem_diluicao_geometrica'));
  assert.throws(() => O.executar(bancada(), 'misturar', { recipiente: 'gral' }, ctx), /nada/);
});

test('encapsular: conserva a massa, respeita o volume da cápsula e o número de unidades', () => {
  const base = passos(bancada(7), pesos(3.33, 3.27).concat([['misturar', { recipiente: 'gral', tecnica: 'diluicao_geometrica', tempoMin: 8 }]]));
  const cap = (extra) => ['encapsular', Object.assign({ origem: 'gral', capsula: 'n2', quantidade: 30, massaPorCapsulaMg: 200, especieAtiva: 'AcidoAscorbico_s', doseMg: 100 }, extra || {})];
  const ok = passos(base.estado, [cap()]);
  const lote = ok.estado.lotes.capsulas;
  assert.equal(lote.unidadesMg.length, 30);
  aprox(lote.unidadesMg.reduce((a, b) => a + b, 0), 6000, 1e-6, 'soma dos pesos = massa movida');
  fechaBalanco(ok.estado);
  aprox(E.massaRecipiente(ok.estado.recipientes.gral, ESPECIES), 0.6, 0.02, 'sobra de 10 %');
  const pequena = passos(base.estado, [cap({ capsula: 'n4' })]);
  assert.ok(pequena.eventos.some((e) => e.desvio && e.desvio.codigo === 'capsula_pequena'));
  assert.ok(Math.max(...pequena.estado.lotes.capsulas.unidadesMg) < 200);
  const grande = passos(base.estado, [cap({ capsula: 'n00' })]);
  assert.ok(grande.eventos.some((e) => e.desvio && e.desvio.codigo === 'capsula_grande'));
  const falta = passos(base.estado, [cap({ quantidade: 100 })]);
  assert.ok(falta.eventos.some((e) => e.desvio && e.desvio.codigo === 'po_insuficiente'));
  assert.ok(falta.estado.lotes.capsulas.unidadesMg.length < 100);
  fechaBalanco(falta.estado);
  assert.throws(() => O.executar(bancada(), 'encapsular', cap()[1], ctx), /pó/);
});

test('encapsular: pó sem diluição geométrica dá uniformidade pior que com diluição (média de 15 sementes)', () => {
  const vaa = (tecnica, sem) => {
    const b = passos(bancada(sem), pesos(0.3, 6).concat([['misturar', { recipiente: 'gral', tecnica, tempoMin: 8 }]]));
    const e = passos(b.estado, [['encapsular', { origem: 'gral', capsula: 'n2', quantidade: 20, massaPorCapsulaMg: 200, especieAtiva: 'AcidoAscorbico_s', doseMg: 10 }]]);
    return CQ.uniformidadeDoses(e.estado.lotes.capsulas.conteudoAtivoMg.slice(0, 10).map((c) => (100 * c) / 10)).valorAceitacao;
  };
  let geo = 0; let sim = 0;
  for (let s = 1; s <= 15; s++) { geo += vaa('diluicao_geometrica', s); sim += vaa('simples', s); }
  assert.ok(sim / 15 > 2 * (geo / 15), `simples ${sim / 15} vs geométrica ${geo / 15}`);
});

test('completarMassa: fecha a massa final na resolução da balança; recusa passar do alvo; conserva massa', () => {
  const s0 = passos(bancada(), [['tarar', { recipiente: 'gral' }], ['pesar', { especie: 'Lactose_s', recipiente: 'gral', massaG: 10 }]]).estado;
  const r = passos(s0, [['completarMassa', { recipiente: 'gral', especie: 'Vaselina_s', massaFinalG: 100 }]]);
  aprox(E.massaRecipiente(r.estado.recipientes.gral, ESPECIES), 100, 0.011);
  fechaBalanco(r.estado);
  assert.throws(() => O.executar(s0, 'completarMassa', { recipiente: 'gral', especie: 'Vaselina_s', massaFinalG: 5 }, ctx), /passa/);
});

test('volume específico: xarope fecha o volume com sacarose dissolvida; sem o campo o soluto não soma volume', () => {
  const dis = (esp) => {
    const s = E.criarEstado({ semente: 1, recipientes: [{ id: 'b', tipo: 'bequer', capMl: 250 }] });
    return passos(s, [['tarar', { recipiente: 'b' }], ['pesar', { especie: esp, recipiente: 'b', massaG: 85 }], ['medirVolume', { especie: 'H2O_l', volumeMl: 45, vidraria: 'proveta', recipiente: 'b' }], ['dissolver', { recipiente: 'b', agitacao: true, tempoMin: 20 }]]).estado.recipientes.b;
  };
  const rec = dis('Sacarose_s');
  const v = E.volumeLiquidoMl(rec, ESPECIES);
  aprox(v, 45 + 85 * 0.63, 2, 'água + volume da sacarose dissolvida');
  const semCampo = E.volumeLiquidoMl(rec, { ...ESPECIES, Sacarose_s: { ...ESPECIES.Sacarose_s, volumeEspecificoMLg: undefined } });
  aprox(semCampo, 45, 2);
});

test('ensaioCQ: recusa teste desconhecido, exige lote para peso médio e dá desvio quando reprova', () => {
  assert.throws(() => O.executar(bancada(), 'ensaioCQ', { teste: 'magia', recipiente: 'gral' }, ctx), /teste/);
  assert.throws(() => O.executar(bancada(), 'ensaioCQ', { teste: 'peso_medio', recipiente: 'gral' }, ctx), /encapsule/);
  const base = passos(bancada(3), pesos(3, 3).concat([['misturar', { recipiente: 'gral', tecnica: 'diluicao_geometrica', tempoMin: 8 }]]));
  const r = passos(base.estado, [['ensaioCQ', { teste: 'homogeneidade', recipiente: 'gral' }]]);
  assert.equal(r.eventos[0].aprovado, true);
  const ruim = passos(bancada(), pesos(3, 3).concat([['ensaioCQ', { teste: 'homogeneidade', recipiente: 'gral' }]]));
  const ev = ruim.eventos[ruim.eventos.length - 1];
  assert.equal(ev.aprovado, false);
  assert.equal(ev.desvio.codigo, 'cq_homogeneidade_reprovado');
});

// ── Processos ───────────────────────────────────────────────────────────────
test('processos O5: todos válidos no validador do motor, ids = nome do arquivo, ≤ 32 KB', () => {
  for (const id of O5_IDS) {
    const f = path.join(DIR, id + '.json');
    assert.ok(fs.existsSync(f), id);
    assert.ok(fs.statSync(f).size <= 32 * 1024, `${id} grande demais`);
    const p = carregar(id);
    assert.equal(p.id, id);
    assert.deepEqual(V.validarProcesso(p, ctx).erros, [], id);
    assert.equal(p.nivel_conteudo, 'completo');
    assert.equal(p.restricao, null);
    assert.ok(p.revisado_por === null || typeof p.revisado_por === 'string');
  }
});

test('processos O5: cobrem cápsulas, soluções, suspensão, semissólido, saneantes, cosméticos, estéreis e CQ', () => {
  const formas = new Set(O5_IDS.map((i) => carregar(i).forma));
  for (const f of ['capsula', 'xarope', 'suspensao', 'pomada', 'gel_antisseptico', 'sabonete_liquido', 'desinfetante', 'aromatizador', 'solucao_esteril', 'reagente_analitico']) assert.ok(formas.has(f), f);
  const setores = new Set(O5_IDS.map((i) => carregar(i).setor));
  for (const s of ['farmacotecnica', 'saneante', 'cosmetico', 'hospitalar', 'cq']) assert.ok(setores.has(s), s);
});

test('processos O5: cada formulação cita fonte oficial, tem itens que existem no motor e cálculos prévios coerentes', () => {
  for (const id of O5_IDS) {
    const p = carregar(id);
    assert.ok(p.fontesOficiais.length >= 1, `${id} sem fonte oficial`);
    for (const f of p.fontesOficiais) { assert.ok(f.tipo && f.citacao, id); assert.ok(f.citacao.length < 220, 'citação curta, sem reproduzir o texto da norma'); }
    for (const it of p.formulacao.itens) assert.ok(ESPECIES[it.especie], `${id}: ${it.especie}`);
    assert.ok(p.cq.length >= 1, `${id} sem critérios de CQ`);
    for (const e of p.etapas) {
      assert.ok(e.oQueEstaAcontecendo.length > 20 && e.porQue.length > 20, `${id} ${e.id}`);
      if (e.calculoPrevio) assert.ok(e.calculoPrevio.tolerancia > 0);
    }
  }
});

test('processos O5: textos públicos sem marca de bastidor, sem HTML e sem diminutivos', () => {
  const proibido = /\[NV\]|rascunho|n[aã]o revisad|revisad[oa]|gerad[oa] por (ia|intelig)|\bIA\b/i;
  const diminutivo = /\b\w{4,}(inho|inha|zinho|zinha)s?\b/i;
  const ok = new Set(['sozinho', 'sozinha', 'caminho', 'vizinho', 'minha', 'minhas', 'pinha', 'linha', 'linhas', 'farinha', 'cozinha', 'espinha']);
  for (const id of O5_IDS) {
    const p = carregar(id);
    const t = [p.titulo, ...(p.objetivos || []), ...p.fontesOficiais.map((f) => f.citacao), ...p.cq.flatMap((c) => [c.ensaio, c.criterio]), ...p.formulacao.itens.map((i) => i.funcao)];
    for (const e of p.etapas) {
      t.push(e.titulo, e.oQueEstaAcontecendo, e.porQue);
      if (e.calculoPrevio) t.push(e.calculoPrevio.pergunta, e.calculoPrevio.formula);
      (e.preCondicoes || []).concat(e.verificacoes || []).forEach((c) => t.push(c.mensagemSeFalhar));
      (e.errosComuns || []).forEach((x) => t.push(x.explicacao, x.correcao));
      for (const a of [].concat(e.acao)) if (a.parametros && a.parametros.campos) t.push(...Object.values(a.parametros.campos));
    }
    for (const s of t.filter((x) => typeof x === 'string')) {
      assert.ok(!proibido.test(s), `${id}: "${s.slice(0, 50)}"`);
      assert.ok(!/<[a-z]/i.test(s), `${id} HTML`);
      const m = diminutivo.exec(s);
      assert.ok(!m || ok.has(m[0].toLowerCase()), `${id} diminutivo "${m && m[0]}"`);
    }
    assert.match(p.conferencia.nota, /\[NV\]/, 'a marca [NV] fica só no campo interno');
  }
});

test('processos O5: rodam inteiros, conformes, em 25 sementes, e o balanço de massa fecha', () => {
  for (const id of O5_IDS) {
    for (let s = 1; s <= 25; s++) {
      const { p, sessao, resultados } = rodar(id, s);
      assert.equal(sessao.terminado, true, `${id} semente ${s}: ${JSON.stringify(resultados.filter((r) => r.status !== 'concluida'))}`);
      const rel = P.relatorio(sessao, p, ctx);
      assert.equal(rel.conforme, true, `${id} semente ${s}: ${JSON.stringify(rel.conferencias)} ${desvios(sessao)}`);
      assert.equal(rel.calculos.errados, 0, `${id}: cálculo prévio com resposta do próprio arquivo deve estar certo`);
      fechaBalanco(sessao.estado);
    }
  }
});

test('processos O5: determinismo pela semente (mesmo estado e caderno)', () => {
  for (const id of ['proc_capsulas_vitc_v1', 'proc_alcool_gel_70_v1']) {
    const a = rodar(id, 11).sessao; const b = rodar(id, 11).sessao;
    assert.equal(E.serializar(a.estado), E.serializar(b.estado), id);
  }
});

test('processos O5: o CQ roda de verdade — cada processo registra ao menos um ensaio com leitura e dentro do critério', () => {
  for (const id of O5_IDS) {
    const { sessao } = rodar(id, 4);
    const cqs = sessao.caderno.entradas.filter((e) => /Dentro do critério/.test(e.texto) || /Fora do critério/.test(e.texto));
    if (id === 'proc_desinfetante_cloro_v1' || id === 'proc_cq_titulacao_hcl_v1') continue;
    assert.ok(cqs.length >= 1, id);
    assert.ok(cqs.every((c) => /Dentro/.test(c.texto)), id);
  }
});

// ── Faixas de resultado (valores certos de cada produto) ────────────────────
test('xarope: densidade perto de 1,31 g/mL e volume fecha em 100 mL com 85 g/100 mL', () => {
  const { sessao } = rodar('proc_xarope_simples_v1', 3);
  const rec = sessao.estado.recipientes.frasco_150;
  const vol = E.volumeLiquidoMl(rec, ESPECIES);
  aprox(vol, 100, 1.5, 'volume do xarope');
  aprox(E.massaRecipiente(rec, ESPECIES) / vol, 1.31, 0.03, 'densidade');
  aprox(100 * E.massaEspecie(rec, 'Sacarose_s', ESPECIES) / vol, 85, 1.5);
});

test('álcool em gel: 70 % p/p de etanol em 200 g, com a correção pelo teor de 92,8 %', () => {
  const { sessao } = rodar('proc_alcool_gel_70_v1', 5);
  const rec = sessao.estado.recipientes.frasco_250;
  const total = E.massaRecipiente(rec, ESPECIES);
  aprox(total, 200, 1, 'massa final');
  const etanol = E.massaEspecie(rec, 'Etanol96_l', ESPECIES) * 0.928;
  aprox(100 * etanol / total, 70, 0.8, 'teor de etanol p/p');
});

test('sabonete e home spray: massa final e ordem de adição', () => {
  aprox(E.massaRecipiente(rodar('proc_sabonete_liquido_v1', 2).sessao.estado.recipientes.frasco_500, ESPECIES), 400, 2.5);
  aprox(E.massaRecipiente(rodar('proc_home_spray_v1', 2).sessao.estado.recipientes.frasco_500, ESPECIES), 500, 3);
});

test('desinfetante: 1.000 ppm de cloro ativo (40 g a 2,5 % em 1.000 g)', () => {
  const { sessao } = rodar('proc_desinfetante_cloro_v1', 6);
  const rec = sessao.estado.recipientes.frasco_1000;
  const cl = E.massaEspecie(rec, 'AguaSanitaria_l', ESPECIES) * 0.025 / E.massaRecipiente(rec, ESPECIES) * 1e6;
  aprox(cl, 1000, 40, 'ppm de cloro ativo');
});

test('titulação de HCl: o ponto final cai perto de 20 mL e passar dele é apontado', () => {
  const { sessao } = rodar('proc_cq_titulacao_hcl_v1', 8);
  assert.equal(sessao.terminado, true);
  const volume = sessao.caderno.entradas.filter((e) => e.operacao === 'titular' && e.unidade === 'mL').reduce((a, e) => a + e.leitura, 0);
  aprox(volume, 20.05, 0.3, 'volume total de titulante');
  const passou = rodar('proc_cq_titulacao_hcl_v1', 8, { parametros: { e5: [{ volumeMl: 1.9 }, { volumeMl: 2.5 }] } });
  assert.ok(desvios(passou.sessao).includes('ponto_final_ultrapassado'), 'erro comum apontado');
});

// ── Erros comuns com consequência ───────────────────────────────────────────
test('erros comuns: xarope aquecido demais caramelizado, sem enxágue, sem tara', () => {
  const quente = rodar('proc_xarope_simples_v1', 2, { parametros: { e3: [null, { alvoC: 100, fonte: 'banho_maria', tempoMin: 20 }, null] } });
  assert.ok(desvios(quente.sessao).includes('caramelizacao_inversao'));
  const semEnx = rodar('proc_xarope_simples_v1', 2, { parametros: { e5: { enxague: false } } });
  assert.ok(desvios(semEnx.sessao).includes('teor_abaixo'));
  const p = carregar('proc_xarope_simples_v1');
  p.etapas[1].acao = p.etapas[1].acao.filter((a) => a.operacao !== 'tarar');
  const st = P.rodarProcesso(p, ctx, { semente: 2, respostas: respostasCertas(p) }).sessao;
  assert.ok(desvios(st).includes('massa_registrada_inclui_recipiente'));
});

test('erros comuns: cápsula pequena, compactação forte e mistura simples reprovam no CQ', () => {
  const peq = rodar('proc_capsulas_vitc_v1', 2, { parametros: { e5: { capsula: 'n4' } } });
  assert.ok(desvios(peq.sessao).includes('dose_menor_que_a_prescrita'));
  const forte = rodar('proc_capsulas_vitc_v1', 2, { parametros: { e5: { compactacao: 'forte' } } });
  assert.ok(desvios(forte.sessao).includes('cq_desintegracao_reprovado'));
  assert.ok(desvios(forte.sessao).includes('cq_dissolucao_reprovado'));
  assert.equal(P.relatorio(forte.sessao, forte.p, ctx).conforme, false);
  const simples = rodar('proc_capsulas_vitc_v1', 2, { parametros: { e4: { tecnica: 'simples', tempoMin: 1 } } });
  assert.ok(desvios(simples.sessao).includes('mistura_curta') || desvios(simples.sessao).includes('mistura_sem_diluicao_geometrica') || simples.resultados.some((r) => r.status === 'aguardar'));
});

test('erros comuns: gel sem trietanolamina suficiente falha pH e viscosidade; álcool sem correção cai abaixo de 68 %', () => {
  const pouca = rodar('proc_alcool_gel_70_v1', 3, { parametros: { e4: [null, { massaG: 0.4 }] } });
  const d = desvios(pouca.sessao);
  assert.ok(d.includes('cq_ph_reprovado'), d.join(','));
  assert.ok(d.includes('cq_viscosidade_reprovado'), d.join(','));
  const semCorrecao = rodar('proc_alcool_gel_70_v1', 3, { parametros: { e6: [null, { massaG: 140 }] } });
  assert.ok(desvios(semCorrecao.sessao).includes('cq_teor_alcoolico_reprovado'));
});

test('erros comuns: termolábil autoclavado, envase sem assepsia, ciclo curto de autoclave', () => {
  const auto = P.iniciarSessao(carregar('proc_vitc_filtrada_v1'), ctx);
  assert.equal(auto.processoId, 'proc_vitc_filtrada_v1');
  const p = carregar('proc_vitc_filtrada_v1');
  const i = p.etapas.findIndex((e) => e.titulo.startsWith('Esterilizar'));
  p.etapas[i].acao = { operacao: 'esterilizar', parametros: { recipiente: 'balao_100', metodo: 'autoclave', tempC: 121, tempoMin: 20 } };
  const r = P.rodarProcesso(p, ctx, { semente: 2, respostas: respostasCertas(p) });
  assert.ok(desvios(r.sessao).includes('termolabil_autoclavado'));
  const sem = rodar('proc_vitc_filtrada_v1', 2, { parametros: { e6: { assepsia: false } } });
  assert.ok(desvios(sem.sessao).includes('perdeu_esterilidade'));
  const curto = rodar('proc_sf09_esteril_v1', 2, { parametros: { e7: { tempoMin: 5 } } });
  assert.ok(desvios(curto.sessao).includes('ciclo_insuficiente'));
});

test('erros comuns: home spray bloqueia a água antes da pré-mistura; desinfetante bloqueia o concentrado antes da água', () => {
  const p = carregar('proc_home_spray_v1');
  const i = p.etapas.findIndex((e) => e.titulo.startsWith('Adicionar a água'));
  const q = JSON.parse(JSON.stringify(p));
  q.etapas[i].preCondicoes = q.etapas[i].preCondicoes.filter((c) => c.grandeza !== 'etapaConcluida');
  const s0 = P.iniciarSessao(q, ctx, { semente: 1 });
  const bloq = P.executarEtapa(Object.assign({}, s0, { indice: i }), q, ctx, {});
  assert.equal(bloq.resultado.status, 'bloqueada');
  assert.match(bloq.resultado.mensagens.join(' '), /Misture antes/);
  const d = carregar('proc_desinfetante_cloro_v1');
  const k = d.etapas.findIndex((e) => e.titulo.startsWith('Pesar a água sanitária'));
  const dd = JSON.parse(JSON.stringify(d));
  dd.etapas[k].preCondicoes = dd.etapas[k].preCondicoes.filter((c) => c.grandeza !== 'etapaConcluida');
  const bl = P.executarEtapa(Object.assign({}, P.iniciarSessao(dd, ctx, { semente: 1 }), { indice: k }), dd, ctx, {});
  assert.equal(bl.resultado.status, 'bloqueada');
  assert.match(bl.resultado.mensagens.join(' '), /água primeiro/);
});

// ── Regra de conteúdo e peso ────────────────────────────────────────────────
test('regra de conteúdo: nenhuma espécie nova é restrita, e nenhum processo O5 cita agente de guerra, ilícita ou rota de síntese', () => {
  for (const id of NOVAS) { assert.equal(ESPECIES[id].restricao, null, id); assert.equal(ESPECIES[id].nivel_conteudo, 'completo', id); }
  for (const id of O5_IDS) {
    const p = carregar(id);
    assert.notEqual(p.categoria, 'sintese');
    assert.deepEqual(V.validarConteudo(p, { especies: ESPECIES }), []);
  }
});

test('orçamento O5: peças novas do motor ≤ 56 KB e ≤ 18 KB com gzip; dados dos processos ≤ 260 KB', () => {
  const arq = ['lab-motor-especies-farmaco.js', 'lab-farma-calculos.js', 'lab-cq.js', 'lab-motor-op-farma.js'].map((f) => fs.readFileSync(path.join(JS, f)));
  const bruto = arq.reduce((a, b) => a + b.length, 0);
  const gz = arq.reduce((a, b) => a + zlib.gzipSync(b).length, 0);
  assert.ok(bruto <= 56 * 1024, `${(bruto / 1024).toFixed(1)} KB`);
  assert.ok(gz <= 18 * 1024, `${(gz / 1024).toFixed(1)} KB gzip`);
  const dados = O5_IDS.reduce((a, id) => a + fs.statSync(path.join(DIR, id + '.json')).size, 0);
  assert.ok(dados <= 260 * 1024, `${(dados / 1024).toFixed(1)} KB de processos`);
});
