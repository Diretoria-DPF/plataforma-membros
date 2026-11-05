/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Motor do Laboratório (O3): operações unitárias puras — valores esperados, erros simulados e propriedades.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../modulos/laboratorio/js/lab-motor-estado.js');
const F = require('../modulos/laboratorio/js/lab-motor-fisica.js');
const O = require('../modulos/laboratorio/js/lab-motor-operacoes.js');
const { ESPECIES, RF_ILUSTRATIVO } = require('../modulos/laboratorio/js/lab-motor-especies.js');

const ctx = { especies: ESPECIES, rf: RF_ILUSTRATIVO };
const aprox = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} obtido ${a}, esperado ${b} ±${tol}`);
const g = (s, rec, esp) => E.massaEspecie(s.recipientes[rec], esp, ESPECIES);

function bancada(semente, extras) {
  return E.criarEstado({
    semente: semente === undefined ? 1 : semente,
    recipientes: [
      { id: 'bequer1', tipo: 'bequer', capMl: 250 },
      { id: 'bequer2', tipo: 'bequer', capMl: 250 },
      { id: 'balao100', tipo: 'balao_volumetrico', capMl: 100 },
      { id: 'funil', tipo: 'funil_separacao', capMl: 250 }
    ].concat(extras || [])
  });
}

/** Encadeia operações: [[id, params], ...] → { estado, eventos }. */
function rodar(estado, passos) {
  let s = estado;
  const eventos = [];
  for (const [id, p] of passos) {
    const r = O.executar(s, id, p, ctx);
    s = r.estado;
    eventos.push(...r.eventos);
  }
  return { estado: s, eventos };
}

/** Balanço: tudo que entrou está nos recipientes ou em alguma parcela de saída. */
function fechaBalanco(s, tol) {
  const b = s.balanco;
  const saidas = E.massaTotal(s, ESPECIES) + b.perdas_g + b.evaporado_g + b.descartado_g + b.amostras_g + b.reacao_g;
  aprox(saidas, b.entradas_g, tol === undefined ? 1e-6 : tol, 'balanço de massa');
}

const temDesvio = (eventos, codigo) => eventos.some((e) => e.desvio && e.desvio.codigo === codigo);

test('registro: pelo menos 20 operações, cada uma com título e regras rotuladas', () => {
  const lista = O.listar();
  assert.ok(lista.length >= 20, `${lista.length} operações`);
  for (const op of ['pesar', 'dissolver', 'aquecer', 'refluxo', 'filtrar', 'recristalizar', 'extrair', 'destilar', 'titular', 'medirPH', 'pontoFusao', 'ccd', 'esterilizar', 'envasar', 'rotular', 'descartar']) {
    assert.ok(lista.some((x) => x.id === op), op);
  }
  for (const op of lista) {
    assert.ok(op.titulo.length > 3);
    for (const r of op.regras) assert.ok(F.NIVEIS.includes(r.nivel));
  }
});

test('executar: operação desconhecida, parâmetro inválido e contexto ausente são recusados', () => {
  assert.throws(() => O.executar(bancada(), 'teleportar', {}, ctx), /desconhecida/);
  assert.throws(() => O.executar(bancada(), 'pesar', { especie: 'NaCl_s', recipiente: 'bequer1', massaG: -1 }, ctx), /massaG/);
  assert.throws(() => O.executar(bancada(), 'pesar', { especie: 'NaCl_s', recipiente: 'nao_existe', massaG: 1 }, ctx), /recipiente/);
  assert.throws(() => O.executar(bancada(), 'pesar', { especie: 'Inventada', recipiente: 'bequer1', massaG: 1 }, ctx), /espécie/);
  assert.throws(() => O.executar(bancada(), 'pesar', {}, null), /contexto/);
  assert.throws(() => O.executar(bancada(), 'paramentar', { epi: ['capa_de_chuva'] }, ctx), /EPI/);
});

test('paramentar: registra EPI e capela no ambiente', () => {
  const { estado } = rodar(bancada(), [['paramentar', { epi: ['jaleco', 'oculos', 'luvas_nitrila'], capela: true }]]);
  assert.deepEqual(estado.ambiente.epi, ['jaleco', 'luvas_nitrila', 'oculos']);
  assert.equal(estado.ambiente.capelaLigada, true);
});

test('pesar com tara: leitura igual à massa pesada (±0,01 g); sem tara a leitura inclui o béquer e gera desvio', () => {
  const com = rodar(bancada(), [['tarar', { recipiente: 'bequer1' }], ['pesar', { especie: 'NaCl_s', recipiente: 'bequer1', massaG: 0.9 }]]);
  const ev = com.eventos.find((e) => e.tipo === 'pesagem');
  aprox(ev.leitura, 0.9, 0.0100001);
  aprox(g(com.estado, 'bequer1', 'NaCl_s'), ev.massaRealG, 1e-9);
  assert.equal(temDesvio(com.eventos, 'sem_tara'), false);
  const sem = rodar(bancada(), [['pesar', { especie: 'NaCl_s', recipiente: 'bequer1', massaG: 0.9 }]]);
  const ev2 = sem.eventos.find((e) => e.tipo === 'pesagem');
  assert.ok(ev2.leitura > 100, 'leitura bruta inclui a massa do béquer');
  assert.equal(temDesvio(sem.eventos, 'sem_tara'), true);
});

test('pesar: tara feita antes de outra adição deixa de valer (leitura acumulada)', () => {
  const r = rodar(bancada(), [
    ['tarar', { recipiente: 'bequer1' }],
    ['pesar', { especie: 'NaCl_s', recipiente: 'bequer1', massaG: 1 }],
    ['pesar', { especie: 'Sacarose_s', recipiente: 'bequer1', massaG: 2 }]
  ]);
  assert.equal(temDesvio(r.eventos, 'sem_tara'), true);
});

test('medirVolume: incerteza conforme a vidraria e líquido obrigatório', () => {
  for (let sem = 1; sem <= 20; sem++) {
    const r = rodar(bancada(sem), [['medirVolume', { especie: 'H2O_l', volumeMl: 10, vidraria: 'pipeta', recipiente: 'bequer1' }]]);
    const v = r.eventos[0].volumeRealMl;
    assert.ok(Math.abs(v - 10) <= 10 * 0.005 + 1e-9);
  }
  assert.throws(() => rodar(bancada(), [['medirVolume', { especie: 'NaCl_s', volumeMl: 10, vidraria: 'pipeta', recipiente: 'bequer1' }]]), /líquido/);
});

test('transbordo: passar da capacidade derrama e conta como perda', () => {
  const r = rodar(bancada(), [['medirVolume', { especie: 'H2O_l', volumeMl: 120, vidraria: 'proveta', recipiente: 'balao100' }]]);
  assert.equal(temDesvio(r.eventos, 'transbordou'), true);
  aprox(E.volumeLiquidoMl(r.estado.recipientes.balao100, ESPECIES), 100, 1e-6);
  assert.ok(r.estado.balanco.perdas_g > 15);
  fechaBalanco(r.estado);
});

test('transferir: sem enxágue fica 2 % na parede; com enxágue, 0,2 %', () => {
  const prep = rodar(bancada(), [['medirVolume', { especie: 'H2O_l', volumeMl: 50, vidraria: 'proveta', recipiente: 'bequer1' }], ['pesar', { especie: 'NaCl_s', recipiente: 'bequer1', massaG: 0.9 }], ['dissolver', { recipiente: 'bequer1' }]]).estado;
  const total = g(prep, 'bequer1', 'NaCl_s');
  const sem = rodar(prep, [['transferir', { origem: 'bequer1', destino: 'balao100' }]]);
  aprox(g(sem.estado, 'bequer1', 'NaCl_s') / total, 0.02, 1e-9);
  assert.equal(temDesvio(sem.eventos, 'sem_enxague'), true);
  const com = rodar(prep, [['transferir', { origem: 'bequer1', destino: 'balao100', enxague: true }]]);
  aprox(g(com.estado, 'bequer1', 'NaCl_s') / total, 0.002, 1e-9);
  fechaBalanco(com.estado);
});

test('dissolver: 0,9 g de NaCl em 70 mL de água dissolve tudo com agitação; sem agitação, 1 min dissolve só parte', () => {
  const base = rodar(bancada(), [['medirVolume', { especie: 'H2O_l', volumeMl: 70, vidraria: 'proveta', recipiente: 'bequer1' }], ['pesar', { especie: 'NaCl_s', recipiente: 'bequer1', massaG: 0.9 }]]).estado;
  const com = rodar(base, [['dissolver', { recipiente: 'bequer1', tempoMin: 5 }]]).estado;
  assert.equal(com.recipientes.bequer1.solido.NaCl_s, undefined);
  const sem = rodar(base, [['dissolver', { recipiente: 'bequer1', tempoMin: 1, agitacao: false }]]).estado;
  assert.ok(sem.recipientes.bequer1.solido.NaCl_s > 0);
  assert.ok(sem.recipientes.bequer1.liquido.NaCl_s > 0);
  assert.throws(() => rodar(bancada(), [['dissolver', { recipiente: 'bequer2' }]]), /líquido/);
});

test('aquecer em banho-maria: chega perto do alvo sem passar e conta tempo na faixa', () => {
  const r = rodar(bancada(), [
    ['medirVolume', { especie: 'H2O_l', volumeMl: 50, vidraria: 'proveta', recipiente: 'bequer1' }],
    ['aquecer', { recipiente: 'bequer1', fonte: 'banho_maria', alvoC: 55, tempoMin: 30, faixaC: [50, 60] }]
  ]);
  const ev = r.eventos.find((e) => e.tipo === 'aquecimento');
  assert.ok(ev.tMaxC <= 55 + 1e-9);
  assert.ok(ev.leitura > 50, `T final ${ev.leitura}`);
  assert.ok(ev.tempoNaFaixaMin > 10, `na faixa ${ev.tempoNaFaixaMin}`);
  assert.equal(r.estado.t, 30 * 60);
});

test('aquecer água em chapa muito quente: patamar a 100 °C, evapora e o balanço fecha', () => {
  const r = rodar(bancada(), [
    ['medirVolume', { especie: 'H2O_l', volumeMl: 50, vidraria: 'proveta', recipiente: 'bequer1' }],
    ['aquecer', { recipiente: 'bequer1', fonte: 'chapa', alvoC: 300, potenciaW: 800, tempoMin: 2 }]
  ]);
  assert.equal(r.estado.recipientes.bequer1.tempC, 100);
  assert.ok(r.estado.balanco.evaporado_g > 5);
  assert.ok(r.eventos.some((e) => e.tipo === 'ebulicao'));
  fechaBalanco(r.estado);
});

test('chama aberta com etanol gera incidente explicado', () => {
  const r = rodar(bancada(), [
    ['medirVolume', { especie: 'Etanol_l', volumeMl: 20, vidraria: 'proveta', recipiente: 'bequer1' }],
    ['aquecer', { recipiente: 'bequer1', fonte: 'chama', alvoC: 60, tempoMin: 1 }]
  ]);
  assert.equal(temDesvio(r.eventos, 'chama_com_inflamavel'), true);
});

test('refluxo de etanol: temperatura no patamar e nenhuma massa perdida', () => {
  const r = rodar(bancada(), [
    ['medirVolume', { especie: 'Etanol_l', volumeMl: 50, vidraria: 'proveta', recipiente: 'bequer1' }],
    ['refluxo', { recipiente: 'bequer1', alvoC: 120, tempoMin: 30 }]
  ]);
  assert.equal(r.estado.recipientes.bequer1.tempC, ESPECIES.Etanol_l.teb);
  assert.equal(r.estado.balanco.evaporado_g, 0);
  assert.ok(r.eventos.some((e) => e.tipo === 'refluxo'));
  fechaBalanco(r.estado);
});

test('resfriar em gelo: solução quente de ácido benzoico cristaliza', () => {
  const quente = rodar(bancada(), [
    ['medirVolume', { especie: 'H2O_l', volumeMl: 100, vidraria: 'proveta', recipiente: 'bequer1' }],
    ['pesar', { especie: 'AcidoBenzoico_s', recipiente: 'bequer1', massaG: 2 }],
    ['aquecer', { recipiente: 'bequer1', fonte: 'chapa', alvoC: 95, potenciaW: 600, tempoMin: 20, agitacao: true }]
  ]).estado;
  assert.equal(quente.recipientes.bequer1.solido.AcidoBenzoico_s, undefined, 'dissolvido a quente');
  const r = rodar(quente, [['resfriar', { recipiente: 'bequer1', banho: 'gelo', tempoMin: 30 }]]);
  assert.ok(r.estado.recipientes.bequer1.solido.AcidoBenzoico_s > 0);
  assert.ok(r.eventos.some((e) => e.tipo === 'cristalizacao'));
  fechaBalanco(r.estado);
});

test('avolumar: completa o balão a 100 mL (±0,1 %); recusa se já passou; avisa se quente', () => {
  const r = rodar(bancada(), [
    ['medirVolume', { especie: 'H2O_l', volumeMl: 70, vidraria: 'proveta', recipiente: 'balao100' }],
    ['avolumar', { recipiente: 'balao100' }]
  ]);
  aprox(E.volumeLiquidoMl(r.estado.recipientes.balao100, ESPECIES), 100, 0.1 + 1e-9);
  assert.throws(() => rodar(r.estado, [['avolumar', { recipiente: 'balao100', volumeFinalMl: 50 }]]), /passa/);
  const quente = E.comRecipiente(bancada(), 'balao100', (x) => ({ ...x, tempC: 60 }));
  assert.equal(temDesvio(rodar(quente, [['avolumar', { recipiente: 'balao100' }]]).eventos, 'avolumado_quente'), true);
});

const RX_AAS = {
  estequiometria: {
    reagentes: [{ id: 'AcidoSalicilico_s', coef: 1 }, { id: 'AnidridoAcetico_l', coef: 1 }],
    produto: { id: 'AAS_s', coef: 1 },
    coprodutos: [{ id: 'CH3COOH', coef: 1 }]
  },
  tempMinima: 50, tempMaxima: 90, tempoReacaoMin: 15, rendimentoPercentual: 100, tempRefC: 55
};

function preparoAAS(semente) {
  return rodar(bancada(semente), [
    ['pesar', { especie: 'AcidoSalicilico_s', recipiente: 'bequer1', massaG: 2 }],
    ['medirVolume', { especie: 'AnidridoAcetico_l', volumeMl: 5, vidraria: 'pipeta', recipiente: 'bequer1' }],
    ['aquecer', { recipiente: 'bequer1', fonte: 'banho_maria', alvoC: 55, tempoMin: 10 }]
  ]).estado;
}

test('reagir (núcleo lab-quimica): AAS com limitante ácido salicílico e massa conservada a 100 %', () => {
  const s0 = preparoAAS();
  const nSal = s0.recipientes.bequer1.solido.AcidoSalicilico_s;
  const r = rodar(s0, [['reagir', { recipiente: 'bequer1', reacao: RX_AAS, tempoMin: 60 }]]);
  const ev = r.eventos.find((e) => e.tipo === 'reacao');
  assert.equal(ev.limitante, 'AcidoSalicilico_s');
  const nAAS = (r.estado.recipientes.bequer1.solido.AAS_s || 0) + (r.estado.recipientes.bequer1.liquido.AAS_s || 0);
  aprox(nAAS, nSal, 1e-6);
  aprox(r.estado.balanco.reacao_g, 0, 1e-6);
  fechaBalanco(r.estado);
});

test('reagir: rendimento < 100 % registra a massa não contabilizada; abaixo da temperatura mínima não avança', () => {
  const s0 = preparoAAS();
  const r = rodar(s0, [['reagir', { recipiente: 'bequer1', reacao: { ...RX_AAS, rendimentoPercentual: 80 }, tempoMin: 60 }]]);
  assert.ok(r.estado.balanco.reacao_g > 0.4);
  fechaBalanco(r.estado);
  const frio = rodar(bancada(), [['pesar', { especie: 'AcidoSalicilico_s', recipiente: 'bequer1', massaG: 2 }], ['medirVolume', { especie: 'AnidridoAcetico_l', volumeMl: 5, vidraria: 'pipeta', recipiente: 'bequer1' }]]).estado;
  const parada = rodar(frio, [['reagir', { recipiente: 'bequer1', reacao: RX_AAS, tempoMin: 60 }]]);
  assert.equal(temDesvio(parada.eventos, 'condicao_reacao'), true);
  assert.equal(parada.estado.recipientes.bequer1.solido.AAS_s, undefined);
});

test('reagir: rendimento sorteado é reprodutível pela semente e varia entre sementes', () => {
  const rx = { ...RX_AAS, rendimentoPercentual: 75, desvioRendimento: 5 };
  const rend = (sem) => rodar(preparoAAS(sem), [['reagir', { recipiente: 'bequer1', reacao: rx, tempoMin: 60 }]]).eventos.find((e) => e.tipo === 'reacao').rendimentoPct;
  assert.equal(rend(11), rend(11));
  const valores = new Set([1, 2, 3, 4, 5, 6].map(rend));
  assert.ok(valores.size > 1);
  for (const v of valores) assert.ok(v >= 0 && v <= 85);
});

function suspensaoBenzoico() {
  return rodar(bancada(), [
    ['medirVolume', { especie: 'H2O_l', volumeMl: 100, vidraria: 'proveta', recipiente: 'bequer1' }],
    ['pesar', { especie: 'AcidoBenzoico_s', recipiente: 'bequer1', massaG: 2 }],
    ['dissolver', { recipiente: 'bequer1' }]
  ]).estado;
}

test('filtrar a vácuo: sólido retido, filtrado com 98 % do líquido e balanço fechado', () => {
  const s0 = suspensaoBenzoico();
  const agua = s0.recipientes.bequer1.liquido.H2O_l;
  const r = rodar(s0, [['filtrar', { origem: 'bequer1', destinoSolido: 'filtro', destinoFiltrado: 'filtrado', tipo: 'vacuo' }]]);
  aprox(r.estado.recipientes.filtrado.liquido.H2O_l / agua, 0.98, 1e-9);
  assert.ok(r.estado.recipientes.filtro.solido.AcidoBenzoico_s > 0);
  assert.deepEqual(r.estado.recipientes.bequer1.liquido, {});
  fechaBalanco(r.estado);
});

test('filtrar: lavar com água quente dissolve produto (desvio); com água gelada, perde menos', () => {
  const s0 = suspensaoBenzoico();
  const quente = rodar(s0, [['filtrar', { origem: 'bequer1', lavagem: { especie: 'H2O_l', volumeMl: 20, tempC: 90 } }]]);
  const fria = rodar(s0, [['filtrar', { origem: 'bequer1', lavagem: { especie: 'H2O_l', volumeMl: 20, tempC: 4 } }]]);
  assert.equal(temDesvio(quente.eventos, 'perda_por_dissolucao'), true);
  assert.ok(g(quente.estado, 'filtro', 'AcidoBenzoico_s') < g(fria.estado, 'filtro', 'AcidoBenzoico_s'));
  fechaBalanco(quente.estado);
  fechaBalanco(fria.estado);
});

test('recristalizar: impureza solúvel fica nas águas-mãe; excesso de solvente reduz o rendimento', () => {
  const sujo = () => rodar(bancada(), [
    ['pesar', { especie: 'AcidoBenzoico_s', recipiente: 'bequer1', massaG: 2 }],
    ['pesar', { especie: 'NaCl_s', recipiente: 'bequer1', massaG: 0.2 }]
  ]).estado;
  const certo = rodar(sujo(), [['recristalizar', { recipiente: 'bequer1', solvente: 'H2O_l', volumeMl: 50, tempQuenteC: 100, tempFrioC: 0 }]]);
  const fracNaClCristais = (s) => {
    const r = s.recipientes.cristais;
    const a = (r.solido.AcidoBenzoico_s || 0);
    const n = (r.solido.NaCl_s || 0) + (r.liquido.NaCl_s || 0);
    return n / (a + n);
  };
  assert.ok(fracNaClCristais(certo.estado) < 0.02, `NaCl nos cristais ${fracNaClCristais(certo.estado)}`);
  const excesso = rodar(sujo(), [['recristalizar', { recipiente: 'bequer1', solvente: 'H2O_l', volumeMl: 200, tempQuenteC: 100, tempFrioC: 0 }]]);
  assert.ok(g(excesso.estado, 'cristais', 'AcidoBenzoico_s') < g(certo.estado, 'cristais', 'AcidoBenzoico_s'));
  const pouco = rodar(sujo(), [['recristalizar', { recipiente: 'bequer1', solvente: 'H2O_l', volumeMl: 20, tempQuenteC: 100, tempFrioC: 0 }]]);
  assert.equal(temDesvio(pouco.eventos, 'solvente_insuficiente'), true);
  fechaBalanco(certo.estado);
});

test('extrair: ácido benzoico vai ao acetato de etila em pH 2 e fica na água em pH 9', () => {
  const base = rodar(bancada(), [
    ['medirVolume', { especie: 'H2O_l', volumeMl: 100, vidraria: 'proveta', recipiente: 'funil' }],
    ['pesar', { especie: 'AcidoBenzoico_s', recipiente: 'funil', massaG: 0.2 }],
    ['dissolver', { recipiente: 'funil' }]
  ]).estado;
  const acido = rodar(base, [['extrair', { recipiente: 'funil', solvente: 'AcetatoEtila_l', volumeMl: 50, pH: 2, destinoOrganica: 'org' }]]);
  assert.ok(g(acido.estado, 'org', 'AcidoBenzoico_s') > 0.18);
  const basico = rodar(base, [['extrair', { recipiente: 'funil', solvente: 'AcetatoEtila_l', volumeMl: 50, pH: 9, aliviarPressao: false }]]);
  assert.ok((basico.estado.recipientes.funil.organica.AcidoBenzoico_s || 0) < base.recipientes.funil.liquido.AcidoBenzoico_s * 0.01);
  assert.equal(temDesvio(basico.eventos, 'pressao_no_funil'), true);
  assert.throws(() => rodar(base, [['extrair', { recipiente: 'funil', solvente: 'Etanol_l', volumeMl: 10 }]]), /fase/);
  fechaBalanco(acido.estado);
});

test('destilar: de água + etanol, o etanol (menor Teb) vai primeiro ao destilado', () => {
  const r = rodar(bancada(), [
    ['medirVolume', { especie: 'H2O_l', volumeMl: 50, vidraria: 'proveta', recipiente: 'bequer1' }],
    ['medirVolume', { especie: 'Etanol_l', volumeMl: 20, vidraria: 'proveta', recipiente: 'bequer1' }],
    ['destilar', { origem: 'bequer1', destino: 'destilado', tempoMin: 1.5, potenciaW: 300 }]
  ]);
  const d = r.estado.recipientes.destilado.liquido;
  assert.ok(d.Etanol_l > 0);
  assert.equal(d.H2O_l, undefined);
  fechaBalanco(r.estado);
});

test('secar: tira o solvente até massa constante; perto do ponto de fusão o produto se decompõe', () => {
  const molhado = E.comRecipiente(bancada(), 'bequer1', (x) => ({ ...x, solido: { AAS_s: E.mmolDeMassa(ESPECIES.AAS_s, 2) }, liquido: { H2O_l: E.mmolDeMassa(ESPECIES.H2O_l, 0.5) } }));
  const ok = rodar(E.comBalanco(molhado, { entradas_g: 2.5 }), [['secar', { recipiente: 'bequer1', tempC: 60, tempoMin: 600 }]]);
  assert.equal(ok.eventos[0].massaConstante, true);
  aprox(ok.eventos[0].leitura, 2, 0.001);
  fechaBalanco(ok.estado);
  const quente = rodar(molhado, [['secar', { recipiente: 'bequer1', tempC: 130, tempoMin: 60 }]]);
  assert.equal(temDesvio(quente.eventos, 'fusao_decomposicao'), true);
  assert.ok(quente.estado.recipientes.bequer1.solido.AAS_s__degradado > 0);
});

test('titular HCl com NaOH 0,1 mol/L e fenolftaleína: incolor antes, rosa depois do ponto de equivalência', () => {
  const base = rodar(bancada(), [['medirVolume', { especie: 'H2O_l', volumeMl: 20, vidraria: 'pipeta', recipiente: 'bequer1' }]]).estado;
  const comHCl = E.comRecipiente(base, 'bequer1', (x) => ({ ...x, liquido: E.somarEspecie(x.liquido, 'HCl_aq', 1) }));
  const antes = rodar(comHCl, [['titular', { recipiente: 'bequer1', titulante: { especie: 'NaOH_s', concMolL: 0.1 }, volumeMl: 5 }]]);
  assert.equal(antes.eventos[0].cor, 'incolor');
  assert.ok(antes.eventos[0].pH < 3);
  const depois = rodar(antes.estado, [['titular', { recipiente: 'bequer1', titulante: { especie: 'NaOH_s', concMolL: 0.1 }, volumeMl: 5.5 }]]);
  assert.equal(depois.eventos[0].cor, 'rosa');
  assert.ok(depois.eventos[0].pH > 10);
});

test('medirPH: NaCl em água ≈ 7; pHmetro sem calibrar desvia; calibrado fica em ±0,02; fita em passos de 0,5', () => {
  const sol = rodar(bancada(), [['medirVolume', { especie: 'H2O_l', volumeMl: 50, vidraria: 'proveta', recipiente: 'bequer1' }], ['pesar', { especie: 'NaCl_s', recipiente: 'bequer1', massaG: 0.45 }], ['dissolver', { recipiente: 'bequer1' }]]).estado;
  const sem = rodar(sol, [['medirPH', { recipiente: 'bequer1' }]]);
  assert.equal(temDesvio(sem.eventos, 'phmetro_sem_calibrar'), true);
  aprox(sem.eventos[0].leitura, 7.3, 0.03);
  const cal = rodar(sol, [['calibrar', { tampoes: [4, 7] }], ['medirPH', { recipiente: 'bequer1' }]]);
  aprox(cal.eventos[1].leitura, 7, 0.03);
  const fita = rodar(sol, [['medirPH', { recipiente: 'bequer1', instrumento: 'fita' }]]);
  assert.equal(fita.eventos[0].leitura % 0.5, 0);
  assert.equal(temDesvio(rodar(sol, [['calibrar', { tampoes: [7] }]]).eventos, 'calibracao_incompleta'), true);
});

test('ponto de fusão, CCD e FeCl3 detectam ácido salicílico residual no AAS', () => {
  const puro = E.comRecipiente(bancada(), 'bequer1', (x) => ({ ...x, solido: { AAS_s: 10 } }));
  const sujo = E.comRecipiente(bancada(), 'bequer1', (x) => ({ ...x, solido: { AAS_s: 9.5, AcidoSalicilico_s: 0.5 } }));
  const pfP = rodar(puro, [['pontoFusao', { recipiente: 'bequer1', especie: 'AAS_s' }]]).eventos[0].leitura;
  const pfS = rodar(sujo, [['pontoFusao', { recipiente: 'bequer1', especie: 'AAS_s' }]]).eventos[0].leitura;
  assert.equal(pfP[1], 135);
  assert.ok(pfS[1] < pfP[1] && pfS[1] - pfS[0] > pfP[1] - pfP[0]);
  const rapido = rodar(puro, [['pontoFusao', { recipiente: 'bequer1', especie: 'AAS_s', taxaCMin: 10 }]]);
  assert.equal(temDesvio(rapido.eventos, 'aquecimento_rapido_pf'), true);
  assert.equal(rodar(puro, [['ccd', { recipiente: 'bequer1', eluente: 'hexano_acetato_7_3' }]]).eventos[0].manchas.length, 1);
  assert.equal(rodar(sujo, [['ccd', { recipiente: 'bequer1', eluente: 'hexano_acetato_7_3' }]]).eventos[0].manchas.length, 2);
  assert.equal(rodar(puro, [['ensaioFeCl3', { recipiente: 'bequer1' }]]).eventos[0].leitura, 'negativo');
  const f = rodar(sujo, [['ensaioFeCl3', { recipiente: 'bequer1' }]]);
  assert.equal(f.eventos[0].leitura, 'positivo');
  assert.equal(temDesvio(f.eventos, 'fecl3_positivo'), true);
});

test('esterilizar: autoclave 121 °C/15 min vale; 110 °C não; termolábil degrada; membrana 0,22 µm vale e 0,45 não', () => {
  const sol = rodar(bancada(), [['medirVolume', { especie: 'H2O_l', volumeMl: 50, vidraria: 'proveta', recipiente: 'bequer1' }], ['pesar', { especie: 'NaCl_s', recipiente: 'bequer1', massaG: 0.45 }], ['dissolver', { recipiente: 'bequer1' }]]).estado;
  assert.equal(rodar(sol, [['esterilizar', { recipiente: 'bequer1', metodo: 'autoclave', tempC: 121, tempoMin: 15 }]]).estado.recipientes.bequer1.esteril, true);
  const curto = rodar(sol, [['esterilizar', { recipiente: 'bequer1', metodo: 'autoclave', tempC: 110, tempoMin: 15 }]]);
  assert.equal(curto.estado.recipientes.bequer1.esteril, false);
  assert.equal(temDesvio(curto.eventos, 'ciclo_insuficiente'), true);
  const xarope = rodar(bancada(), [['medirVolume', { especie: 'H2O_l', volumeMl: 50, vidraria: 'proveta', recipiente: 'bequer1' }], ['pesar', { especie: 'Sacarose_s', recipiente: 'bequer1', massaG: 40 }], ['dissolver', { recipiente: 'bequer1' }]]).estado;
  const ax = rodar(xarope, [['esterilizar', { recipiente: 'bequer1', metodo: 'autoclave', tempC: 121, tempoMin: 15 }]]);
  assert.equal(temDesvio(ax.eventos, 'termolabil_autoclavado'), true);
  fechaBalanco(ax.estado);
  assert.equal(rodar(sol, [['esterilizar', { recipiente: 'bequer1', metodo: 'filtracao_022', membranaUm: 0.22 }]]).estado.recipientes.bequer1.esteril, true);
  assert.equal(rodar(sol, [['esterilizar', { recipiente: 'bequer1', metodo: 'filtracao_022', membranaUm: 0.45 }]]).estado.recipientes.bequer1.esteril, false);
});

test('envasar e rotular: frasco criado, esterilidade só com assepsia, rótulo incompleto é não conforme', () => {
  const sol = rodar(bancada(), [
    ['medirVolume', { especie: 'H2O_l', volumeMl: 100, vidraria: 'proveta', recipiente: 'bequer1' }],
    ['esterilizar', { recipiente: 'bequer1', metodo: 'filtracao_022' }]
  ]).estado;
  const sem = rodar(sol, [['envasar', { origem: 'bequer1', frasco: 'frasco1', volumeMl: 50 }]]);
  assert.equal(sem.estado.recipientes.frasco1.esteril, false);
  assert.equal(temDesvio(sem.eventos, 'perdeu_esterilidade'), true);
  const com = rodar(sol, [['envasar', { origem: 'bequer1', frasco: 'frasco1', volumeMl: 50, assepsia: true }]]);
  assert.equal(com.estado.recipientes.frasco1.esteril, true);
  aprox(E.volumeLiquidoMl(com.estado.recipientes.frasco1, ESPECIES), 50 * 0.995, 0.6);
  const rot = rodar(com.estado, [['rotular', { recipiente: 'frasco1', campos: { produto: 'Solução', lote: 'L1' } }]]);
  assert.equal(temDesvio(rot.eventos, 'rotulo_incompleto'), true);
  const completo = rodar(com.estado, [['rotular', { recipiente: 'frasco1', campos: { produto: 'Solução', concentracao: '0,9 %', lote: 'L1', fabricacao: '05/11/2026', validade: '05/12/2026', responsavel: 'Turma A' } }]]);
  assert.equal(completo.eventos[0].leitura, true);
  assert.equal(completo.estado.recipientes.frasco1.rotulo.lote, 'L1');
  fechaBalanco(com.estado);
});

test('descartar: solução salina na pia é conforme; metal pesado na pia não; massa vai ao balanço', () => {
  const sal = rodar(bancada(), [['medirVolume', { especie: 'H2O_l', volumeMl: 50, vidraria: 'proveta', recipiente: 'bequer1' }], ['pesar', { especie: 'NaCl_s', recipiente: 'bequer1', massaG: 0.45 }]]).estado;
  const ok = rodar(sal, [['descartar', { recipiente: 'bequer1', destino: 'pia' }]]);
  assert.equal(ok.estado.residuos[0].conforme, true);
  assert.deepEqual(ok.estado.recipientes.bequer1.liquido, {});
  fechaBalanco(ok.estado);
  const pb = E.comBalanco(E.comRecipiente(bancada(), 'bequer1', (x) => ({ ...x, solido: { PbI2_s: 1 } })), { entradas_g: E.massaDeMmol(ESPECIES.PbI2_s, 1) });
  const ruim = rodar(pb, [['descartar', { recipiente: 'bequer1', destino: 'pia' }]]);
  assert.equal(temDesvio(ruim.eventos, 'descarte_incorreto'), true);
  assert.equal(rodar(pb, [['descartar', { recipiente: 'bequer1', destino: 'metal_pesado' }]]).estado.residuos[0].conforme, true);
});

// ── Propriedades ─────────────────────────────────────────────────────────────

/** Gerador próprio do teste para sortear sequências de operações. */
function rngTeste(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const CARDAPIO = [
  (r) => ['pesar', { especie: ['NaCl_s', 'AcidoBenzoico_s', 'Sacarose_s'][Math.floor(r() * 3)], recipiente: ['bequer1', 'bequer2'][Math.floor(r() * 2)], massaG: 0.1 + r() * 5 }],
  (r) => ['medirVolume', { especie: ['H2O_l', 'Etanol_l'][Math.floor(r() * 2)], volumeMl: 1 + r() * 80, vidraria: 'proveta', recipiente: ['bequer1', 'bequer2'][Math.floor(r() * 2)] }],
  (r) => ['transferir', { origem: 'bequer1', destino: 'bequer2', fracao: r(), enxague: r() > 0.5 }],
  (r) => ['transferir', { origem: 'bequer2', destino: 'bequer1', fracao: r() }],
  () => ['dissolver', { recipiente: 'bequer1', tempoMin: 2 }],
  (r) => ['aquecer', { recipiente: 'bequer1', fonte: 'chapa', alvoC: 40 + r() * 80, potenciaW: 300, tempoMin: 1 + r() * 10 }],
  (r) => ['resfriar', { recipiente: ['bequer1', 'bequer2'][Math.floor(r() * 2)], banho: 'gelo', tempoMin: 1 + r() * 10 }],
  () => ['filtrar', { origem: 'bequer2', destinoSolido: 'filtro', destinoFiltrado: 'filtrado' }],
  (r) => ['secar', { recipiente: 'filtro', tempC: 50 + r() * 30, tempoMin: 10 + r() * 60 }],
  () => ['descartar', { recipiente: 'filtrado', destino: 'organico_nao_halogenado' }],
  (r) => ['destilar', { origem: 'bequer1', destino: 'destilado', tempoMin: 1 + r() * 5 }],
  () => ['medirPH', { recipiente: 'bequer1' }]
];

/** Sequência aleatória que ignora passos impossíveis (ex.: filtrar sem recipiente) como o aluno faria. */
function sequenciaAleatoria(semente, n) {
  const r = rngTeste(semente);
  let s = bancada(semente);
  const passos = [];
  for (let i = 0; i < n; i++) {
    const [id, p] = CARDAPIO[Math.floor(r() * CARDAPIO.length)](r);
    try { s = O.executar(s, id, p, ctx).estado; passos.push([id, p]); } catch (_) { /* passo recusado: o estado não muda */ }
  }
  return { estado: s, passos };
}

test('propriedade: conservação de massa em 60 sequências aleatórias de 25 operações', () => {
  for (let sem = 1; sem <= 60; sem++) {
    const { estado } = sequenciaAleatoria(sem, 25);
    fechaBalanco(estado, 1e-6);
    assert.equal(estado.balanco.reacao_g, 0);
    for (const rec of Object.values(estado.recipientes)) {
      for (const f of ['liquido', 'organica', 'solido']) for (const v of Object.values(rec[f])) assert.ok(v > 0, 'sem quantidade negativa ou nula guardada');
    }
  }
});

test('propriedade: determinismo — mesma semente e mesmas ações dão o mesmo estado, bit a bit', () => {
  for (let sem = 1; sem <= 15; sem++) {
    const a = sequenciaAleatoria(sem, 20);
    const b = rodar(bancada(sem), a.passos);
    assert.equal(E.serializar(b.estado), E.serializar(a.estado));
  }
});

test('propriedade: nenhuma operação altera o estado recebido (imutabilidade)', () => {
  for (let sem = 1; sem <= 10; sem++) {
    const r = rngTeste(sem * 7);
    let s = sequenciaAleatoria(sem, 8).estado;
    for (let i = 0; i < 10; i++) {
      const antes = E.serializar(s);
      const [id, p] = CARDAPIO[Math.floor(r() * CARDAPIO.length)](r);
      let novo = s;
      try { novo = O.executar(s, id, p, ctx).estado; } catch (_) { /* recusado */ }
      assert.equal(E.serializar(s), antes, `${id} alterou o estado de origem`);
      assert.ok(Object.isFrozen(novo));
      s = novo;
    }
  }
});

test('propriedade: o estado depois de qualquer sequência sobrevive à serialização', () => {
  const { estado } = sequenciaAleatoria(5, 30);
  assert.deepEqual(E.desserializar(E.serializar(estado)), estado);
});
