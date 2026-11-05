/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O6 (Laboratório v2): Controlados e regulação (balcão simulado, Portaria SVS/MS 344/98) + casos da Clínica.
// - regras puras (conferência de receita, livro, balanço, enchimento, controle de qualidade, progresso no aparelho);
// - dados em JSON: toda regra regulatória tem fonte e marca de conferência; nada de rota de síntese;
// - nenhum campo procedimental para substância 'educacional' do seed unificado;
// - módulo atrás de flag local ligada por padrão; CSP sem inline; sem texto público de revisão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lab = path.join(raiz, 'frontend', 'modulos', 'laboratorio');
const reg = path.join(lab, 'regulacao');
const ler = (p) => fs.readFileSync(p, 'utf8');
const json = (rel) => JSON.parse(ler(path.join(reg, 'data', rel)));

const R = require(path.join(reg, 'regulacao-core.js'));
const norma = json('portaria-344.json');
const receitas = json('receitas.json');
const livros = json('escrituracao.json');
const producao = json('producao.json');
const seed = require(path.join(lab, 'data', 'lab-seed.js'));
const { NOMES_GUERRA, NOMES_ILICITAS } = await import(pathToFileURL(path.join(raiz, 'tools/lab/validar-seed.mjs')).href);

// ---------- flag local ----------
test('flag labRegulacao vem ligada e desliga por ?flags=-labRegulacao ou __labFlags', () => {
  assert.equal(R.flagLigada('labRegulacao', '', null), true);
  assert.equal(R.flagLigada('labRegulacao', '?flags=-labRegulacao', null), false);
  assert.equal(R.flagLigada('labRegulacao', '?flags=outra,-labRegulacao', null), false);
  assert.equal(R.flagLigada('labRegulacao', '?flags=-labRegulacao', { labRegulacao: true }), false);
  assert.equal(R.flagLigada('labRegulacao', '', { labRegulacao: false }), false);
  assert.equal(R.flagLigada('labRegulacao', '?flags=-labRegulacaoX', null), true);
});

// ---------- conferência de receita ----------
const CASO = {
  id: 't', receituario: 'NRB', decisao_correta: 'recusar',
  campos: [
    { id: 'a', rotulo: 'A', valor: 'ok' },
    { id: 'b', rotulo: 'B', valor: 'x', problema: 'p1' },
    { id: 'c', rotulo: 'C', valor: 'y', problema: 'p2' },
  ],
};

test('conferirReceita: aprova só com problemas exatos e decisão certa', () => {
  const ok = R.conferirReceita(CASO, { problemas: ['c', 'b'], decisao: 'recusar' });
  assert.equal(ok.aprovado, true);
  assert.deepEqual(ok.faltaram, []);
  assert.deepEqual(ok.excedentes, []);
  assert.equal(ok.decisaoCorreta, true);
  assert.equal(ok.nota, 1);
});

test('conferirReceita: aponta faltas, excessos e decisão errada, sem mutar a entrada', () => {
  const resp = { problemas: ['a', 'b'], decisao: 'dispensar' };
  const copia = JSON.stringify(resp);
  const r = R.conferirReceita(CASO, resp);
  assert.equal(r.aprovado, false);
  assert.deepEqual(r.faltaram, ['c']);
  assert.deepEqual(r.excedentes, ['a']);
  assert.equal(r.decisaoCorreta, false);
  assert.ok(r.nota >= 0 && r.nota < 1);
  assert.equal(JSON.stringify(resp), copia);
});

test('conferirReceita: entrada inválida não quebra', () => {
  assert.equal(R.conferirReceita(CASO, null).aprovado, false);
  assert.equal(R.conferirReceita(CASO, { problemas: 'x' }).aprovado, false);
  assert.equal(R.conferirReceita(null, {}).aprovado, false);
});

// ---------- livro e balanço ----------
test('calcularSaldo: entradas somam, saídas e perdas subtraem, ajuste tem sinal', () => {
  const r = R.calcularSaldo(10, [
    { tipo: 'entrada', qtd: 20 }, { tipo: 'saida', qtd: 5 }, { tipo: 'perda', qtd: 1 }, { tipo: 'ajuste', qtd: -2 },
  ]);
  assert.equal(r.final, 22);
  assert.deepEqual(r.linhas.map((l) => l.saldo), [30, 25, 24, 22]);
  assert.equal(r.primeiroNegativo, -1);
});

test('calcularSaldo: acusa a primeira linha que deixa o saldo negativo', () => {
  const r = R.calcularSaldo(3, [{ tipo: 'saida', qtd: 2 }, { tipo: 'saida', qtd: 2 }, { tipo: 'entrada', qtd: 10 }]);
  assert.equal(r.primeiroNegativo, 1);
  assert.equal(r.final, 9);
});

test('calcularSaldo: tipo desconhecido ou quantidade inválida gera erro claro', () => {
  assert.throws(() => R.calcularSaldo(0, [{ tipo: 'doacao', qtd: 1 }]), /tipo/);
  assert.throws(() => R.calcularSaldo(0, [{ tipo: 'entrada', qtd: -1 }]), /quantidade/);
  assert.throws(() => R.calcularSaldo(-1, []), /inicial/);
});

test('conferirBalanco: compara saldo escriturado, contagem e divergência', () => {
  const ex = { estoque_inicial: 10, movimentos: [{ tipo: 'entrada', qtd: 5 }, { tipo: 'saida', qtd: 3 }], contagem_fisica: 11 };
  const certo = R.conferirBalanco(ex, { saldo_escriturado: 12, divergencia: -1 });
  assert.equal(certo.aprovado, true);
  const errado = R.conferirBalanco(ex, { saldo_escriturado: 11, divergencia: 0 });
  assert.equal(errado.aprovado, false);
  assert.equal(errado.esperado.saldo_escriturado, 12);
  assert.equal(errado.esperado.divergencia, -1);
});

// ---------- enchimento e controle de qualidade ----------
test('calcularEnchimento: corrige pelo teor e completa com excipiente', () => {
  const r = R.calcularEnchimento({ n: 60, dose_mg: 10, teor_pc: 98, massa_cap_mg: 200 });
  assert.ok(Math.abs(r.insumo_mg - 612.2449) < 0.001);
  assert.ok(Math.abs(r.total_mg - 12000) < 1e-9);
  assert.ok(Math.abs(r.excipiente_mg - (12000 - r.insumo_mg)) < 1e-9);
});

test('calcularEnchimento: rejeita dados impossíveis', () => {
  assert.throws(() => R.calcularEnchimento({ n: 0, dose_mg: 1, teor_pc: 99, massa_cap_mg: 100 }), /n/);
  assert.throws(() => R.calcularEnchimento({ n: 1, dose_mg: 1, teor_pc: 0, massa_cap_mg: 100 }), /teor/);
  assert.throws(() => R.calcularEnchimento({ n: 1, dose_mg: 1, teor_pc: 101, massa_cap_mg: 100 }), /teor/);
  assert.throws(() => R.calcularEnchimento({ n: 1, dose_mg: 200, teor_pc: 99, massa_cap_mg: 100 }), /cabe/);
});

test('avaliarPesos: peso médio, desvios e unidades fora do limite', () => {
  const r = R.avaliarPesos([200, 198, 202, 230, 199], 200, 10);
  assert.equal(r.n, 5);
  assert.ok(Math.abs(r.media - 205.8) < 1e-9);
  assert.deepEqual(r.fora.map((x) => x.indice), [3]);
  assert.equal(r.aprovado, false);
  assert.equal(R.avaliarPesos([200, 201], 200, 10).aprovado, true);
  assert.throws(() => R.avaliarPesos([], 200, 10), /pesos/);
});

// ---------- progresso no aparelho ----------
function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('progresso: guarda a melhor nota e as tentativas no aparelho', () => {
  const st = memoria();
  const p = R.criarProgresso(st);
  p.registrar('rec_01', 0.5);
  p.registrar('rec_01', 1);
  p.registrar('rec_01', 0.2);
  const g = R.criarProgresso(st).obter();
  assert.equal(g.itens.rec_01.melhor, 1);
  assert.equal(g.itens.rec_01.tentativas, 3);
  assert.equal(R.criarProgresso(st).resumo(['rec_01', 'rec_02']).concluidos, 1);
});

test('progresso: sem storage, storage que falha ou JSON corrompido não quebram', () => {
  assert.doesNotThrow(() => R.criarProgresso(null).registrar('x', 1));
  const ruim = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.doesNotThrow(() => R.criarProgresso(ruim).registrar('x', 1));
  assert.deepEqual(R.criarProgresso({ getItem: () => '{nao e json', setItem() {} }).obter().itens, {});
  assert.equal(R.criarProgresso(memoria()).registrar('x', 7), false); // nota fora de 0..1
});

// ---------- dados: estrutura e proveniência ----------
const SECOES_NORMA = ['listas', 'receituarios', 'escrituracao', 'balancos', 'guarda_descarte', 'rotulagem'];

test('norma: toda regra tem id, fonte citada e marca de conferência; revisado_por é opcional', () => {
  assert.match(norma.fonte_geral, /344/);
  for (const sec of SECOES_NORMA) {
    assert.ok(Array.isArray(norma[sec]) && norma[sec].length > 0, `seção ${sec} vazia`);
    const ids = new Set();
    for (const it of norma[sec]) {
      assert.ok(it.id && !ids.has(it.id), `${sec}: id ausente ou repetido (${it.id})`);
      ids.add(it.id);
      assert.ok(typeof it.fonte === 'string' && it.fonte.length > 10, `${sec}/${it.id}: sem fonte`);
      assert.equal(typeof it.nv, 'boolean', `${sec}/${it.id}: sem marca nv`);
      if ('revisado_por' in it) assert.equal(typeof it.revisado_por, 'string');
    }
  }
});

test('norma: todo valor regulatório numérico (prazo, quantidade) está marcado nv enquanto não houver conferência', () => {
  for (const sec of SECOES_NORMA) {
    for (const it of norma[sec]) {
      const numerico = Object.entries(it).some(([k, v]) => typeof v === 'number' && !/^(ordem|nivel)$/.test(k));
      if (numerico) assert.equal(it.nv, true, `${sec}/${it.id}: número sem nv`);
    }
  }
});

test('norma: listas e receituários se referenciam sem furo', () => {
  const listas = new Set(norma.listas.map((l) => l.id));
  const recs = new Set(norma.receituarios.map((r) => r.id));
  for (const l of norma.listas) assert.ok(recs.has(l.receituario), `lista ${l.id} aponta receituário inexistente`);
  for (const r of norma.receituarios) for (const l of r.listas) assert.ok(listas.has(l), `receituário ${r.id}: lista ${l}`);
  for (const t of norma.rotulagem) assert.ok(listas.has(t.lista), `rotulagem ${t.id}: lista ${t.lista}`);
  for (const id of ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C5']) assert.ok(listas.has(id), `falta lista ${id}`);
});

test('receitas: cada caso é coerente (problemas existem, decisão é válida, receituário existe)', () => {
  const recs = new Set(norma.receituarios.map((r) => r.id));
  assert.ok(receitas.casos.length >= 6);
  const ids = new Set();
  for (const c of receitas.casos) {
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    assert.ok(recs.has(c.receituario), `${c.id}: receituário`);
    assert.ok(['dispensar', 'recusar', 'contatar_prescritor'].includes(c.decisao_correta), `${c.id}: decisão`);
    assert.ok(c.explicacao && c.explicacao.length > 20 && c.fonte);
    const comProblema = c.campos.filter((x) => x.problema);
    if (c.decisao_correta === 'dispensar') assert.equal(comProblema.length, 0, `${c.id}: dispensar sem problema`);
    else assert.ok(comProblema.length >= 1, `${c.id}: recusa exige ao menos um problema`);
    for (const x of c.campos) assert.ok(x.id && x.rotulo && typeof x.valor === 'string');
    assert.ok(R.conferirReceita(c, { problemas: comProblema.map((x) => x.id), decisao: c.decisao_correta }).aprovado, `${c.id}: gabarito não se aprova`);
  }
  assert.ok(receitas.casos.some((c) => c.decisao_correta === 'dispensar'));
  assert.ok(receitas.casos.some((c) => c.decisao_correta === 'recusar'));
  assert.ok(receitas.casos.some((c) => c.decisao_correta === 'contatar_prescritor'));
});

test('escrituração: exercícios têm gabarito calculável e um com divergência a explicar', () => {
  assert.ok(livros.exercicios.length >= 2);
  for (const e of livros.exercicios) {
    const s = R.calcularSaldo(e.estoque_inicial, e.movimentos);
    assert.equal(s.primeiroNegativo, -1, `${e.id}: saldo negativo no gabarito`);
    assert.ok(Number.isInteger(e.contagem_fisica));
    assert.ok(e.explicacao && e.fonte);
  }
  assert.ok(livros.exercicios.some((e) => R.conferirBalanco(e, {}).esperado.divergencia !== 0));
  assert.ok(livros.exercicios.some((e) => R.conferirBalanco(e, {}).esperado.divergencia === 0));
});

test('produção: processo de farmacotécnica é produto acabado, com cálculo que fecha e etapas completas', () => {
  const p = producao.processo;
  assert.equal(p.tipo, 'forma_farmaceutica');
  assert.equal(p.nivel_conteudo, 'completo');
  const r = R.calcularEnchimento(p.exemplo);
  assert.ok(Math.abs(r.insumo_mg - p.exemplo.gabarito_insumo_mg) < 0.01);
  assert.ok(p.etapas.length >= 7);
  for (const e of p.etapas) {
    for (const campo of ['id', 'titulo', 'o_que_acontece', 'porque', 'verificacao', 'erro_comum']) assert.ok(e[campo], `${e.id}: falta ${campo}`);
  }
  assert.ok(p.etapas.some((e) => /escritura/i.test(e.titulo)), 'o processo termina na escrituração');
  assert.ok(p.etapas.some((e) => /rotula/i.test(e.titulo)));
});

// ---------- regra de conteúdo ----------
const arquivosRegulacao = () => fs.readdirSync(reg, { recursive: true }).map((f) => path.join(reg, String(f))).filter((f) => fs.statSync(f).isFile());

test('conteúdo: nenhuma rota de síntese, agente de guerra ou droga ilícita nos dados do módulo', () => {
  const proibido = /s[ií]ntese|sintetiz|rota de|reagente|catalisador|rendimento|refluxo|cristaliza|precursor|clandestin/i;
  for (const f of arquivosRegulacao().filter((x) => /\.json$/.test(x))) {
    const txt = ler(f);
    assert.ok(!proibido.test(txt), `${path.basename(f)}: termo de síntese`);
    assert.ok(!NOMES_GUERRA.test(txt), `${path.basename(f)}: agente de guerra`);
    assert.ok(!NOMES_ILICITAS.test(txt), `${path.basename(f)}: droga ilícita`);
  }
});

test('conteúdo: dados do módulo não citam substância nivel_conteudo educacional do seed', () => {
  const educ = seed.substancias.filter((s) => s.nivel_conteudo === 'educacional');
  assert.ok(educ.length > 0);
  const nomes = educ.flatMap((s) => [s.nome_pt, ...(s.aliases || [])]).filter((n) => typeof n === 'string' && n.length >= 5);
  for (const f of arquivosRegulacao().filter((x) => /\.json$/.test(x))) {
    const txt = ler(f).toLowerCase();
    for (const n of nomes) assert.ok(!txt.includes(n.toLowerCase()), `${path.basename(f)} cita ${n}`);
  }
});

test('conteúdo: referência opcional a espécie do seed só aceita nivel completo sem restrição', () => {
  const ref = producao.processo.substancia_inchikey;
  if (ref) {
    const s = seed.substancias.find((x) => x.inchikey === ref);
    assert.ok(s, 'InChIKey fora do seed');
    assert.equal(s.nivel_conteudo, 'completo');
    assert.equal(s.restricao, null);
  }
});

// ---------- página: CSP, flag, texto público ----------
const html = ler(path.join(reg, 'index.html'));
const ui = ler(path.join(reg, 'regulacao-ui.js'));

test('página: CSP estrita, sem script/estilo inline, cabeçalho de licença e scripts locais', () => {
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) assert.ok(!/^(https?:)?\/\//.test(m[1]), `script externo ${m[1]}`);
  for (const f of ['regulacao-core.js', 'regulacao-ui.js']) assert.match(ler(path.join(reg, f)), /Todos os direitos reservados/);
});

test('interface: sem innerHTML/eval, sem revisado_por, sem texto público de revisão, rascunho ou IA', () => {
  assert.doesNotMatch(ui, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  assert.doesNotMatch(ui, /revisado_por/);
  const publico = html + ui + ler(path.join(reg, 'regulacao-core.js'));
  assert.doesNotMatch(publico.replace(/revisado_por/g, ''), /n[aã]o revisad|revisado por|rascunho|gerado por IA|feito por IA|\[NV\]/i);
  assert.doesNotMatch(publico, /diminutiv|\bzinh[oa]s?\b|\binho\b|\binha\b/i);
});

test('interface: a página só funciona com a flag ligada e fala "a Guia" no feminino', () => {
  assert.match(ui, /flagLigada\('labRegulacao'/);
  assert.match(html, /<meta name="robots" content="noindex"/);
  assert.doesNotMatch(html + ui, /\bo Guia\b/);
});

test('orçamento: o módulo de regulação pesa menos de 160 KB (gzip somado menor que 45 KB)', () => {
  const arqs = arquivosRegulacao();
  const bruto = arqs.reduce((s, f) => s + fs.statSync(f).size, 0);
  const gz = arqs.reduce((s, f) => s + zlib.gzipSync(fs.readFileSync(f), { level: 9 }).length, 0);
  assert.ok(bruto <= 160 * 1024, `${(bruto / 1024).toFixed(1)} KB`);
  assert.ok(gz <= 45 * 1024, `${(gz / 1024).toFixed(1)} KB gzip`);
});

// ---------- Clínica: casos como dados no formato existente, atrás de flag local ----------
const CLI = path.join(raiz, 'frontend', 'modulos', 'clinica');
const PATIENTS_SRC = ler(path.join(CLI, 'patients.js'));
const CTRL_SRC = ler(path.join(CLI, 'patients-controlados.js'));
const TOXINDROMES = ['Colinérgica', 'Anticolinérgica', 'Simpatomimética', 'Opioide', 'Sedativo-hipnótica', 'Serotoninérgica', 'Hemorrágica/Coagulopatia', 'Hepatotóxica/Metabólica', 'Outra'];

function clinica(search, overrides) {
  const sandbox = { JSON, Math, Object, Array, String, Number, location: { search }, __labFlags: overrides || null };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(PATIENTS_SRC, sandbox, { filename: 'patients.js' });
  vm.runInContext(CTRL_SRC, sandbox, { filename: 'patients-controlados.js' });
  return { casos: vm.runInContext('clinicalCases', sandbox), jornadas: vm.runInContext('clinicalJourneys', sandbox), sandbox };
}

test('clínica: com ?flags=-clinControlados nada muda na lista de casos nem nas jornadas', () => {
  const base = clinica('?flags=-clinControlados', null);
  const sem = vm.runInNewContext(PATIENTS_SRC + '\n[clinicalCases.length, clinicalJourneys.length]', {});
  assert.deepEqual([base.casos.length, base.jornadas.length], Array.from(sem));
});

test('clínica: por padrão entram 4 casos no formato existente e a jornada nova', () => {
  const on = clinica('', null);
  const base = clinica('?flags=-clinControlados', null);
  const novos = on.casos.filter((c) => /^caso_ctrl_/.test(c.id));
  assert.equal(novos.length, 4);
  assert.equal(on.casos.length, base.casos.length + 4);
  assert.ok(on.jornadas.some((j) => j.id === 'jornada_controlados'));
  const modelo = base.casos[0];
  const ids = new Set();
  for (const c of novos) {
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    for (const k of Object.keys(modelo)) assert.ok(k in c, `${c.id}: falta o campo ${k}`);
    assert.equal(c.caseSource, 'builtin');
    assert.ok(TOXINDROMES.includes(c.toxindrome), `${c.id}: toxíndrome fora da lista fechada`);
    assert.ok(['Básico', 'Intermediário', 'Avançado'].includes(c.dificuldade));
    assert.ok(c.examesDisponiveis.length >= 3 && c.examesDisponiveis.every((e) => e.id && e.nome && e.resultado));
    assert.ok(c.gabaritoPreceptor.diagnostico && c.gabaritoPreceptor.conduta && c.gabaritoPreceptor.palavrasChave.length >= 4);
    assert.ok(on.jornadas.find((j) => j.id === 'jornada_controlados').casos.includes(c.id));
  }
  const temas = novos.map((c) => c.id).join(' ');
  for (const t of ['titulacao', 'rotacao', 'intoxicacao', 'naloxona']) assert.match(temas, new RegExp(t));
});

test('clínica: os casos não trazem rota de síntese nem agente de guerra, e valores numéricos de dose ficam fora do gabarito', () => {
  const on = clinica('', null);
  const txt = JSON.stringify(on.casos.filter((c) => /^caso_ctrl_/.test(c.id)));
  assert.doesNotMatch(txt, /s[ií]ntese|sintetiz|rota de|reagente|clandestin/i);
  assert.ok(!NOMES_GUERRA.test(txt));
  assert.doesNotMatch(CTRL_SRC, /clinical_sim_enabled/);
  for (const c of on.casos.filter((x) => /^caso_ctrl_/.test(x.id))) {
    assert.doesNotMatch(c.gabaritoPreceptor.conduta, /\b\d+([.,]\d+)?\s?(mg|mcg|µg|ug)\b/i, `${c.id}: dose numérica no gabarito`);
  }
});

test('clínica: a página carrega o arquivo novo logo depois de patients.js e a CSP segue sem inline de script', () => {
  const h = ler(path.join(CLI, 'index.html'));
  const a = h.indexOf('src="patients.js"');
  const b = h.indexOf('src="patients-controlados.js"');
  assert.ok(a > 0 && b > a);
  assert.match(CTRL_SRC, /Todos os direitos reservados/);
});

test('sintaxe: os scripts do navegador compilam', () => {
  for (const [nome, src] of [['regulacao-ui.js', ui], ['regulacao-core.js', ler(path.join(reg, 'regulacao-core.js'))], ['patients-controlados.js', CTRL_SRC]]) {
    assert.doesNotThrow(() => new vm.Script(src, { filename: nome }), nome);
  }
});
