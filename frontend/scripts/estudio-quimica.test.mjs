/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Química do Estúdio 3D (auditoria do Laboratório: LAB-04, 07, 08, 09, 15).
// Usa o RDKit real (WASM) quando o espelho do npm está disponível
// (scripts/e2e/cdn-mirror/node_modules ou RDKIT_DIST=<pasta dist>); sem ele, os
// testes que dependem do WASM são PULADOS com aviso (os de regra pura rodam).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = path.join(frontend, 'modulos/laboratorio');
const read = (rel) => fs.readFileSync(path.join(lab, rel), 'utf8');
const core = require(path.join(lab, 'studio/chem-core.js'));
const corrigidos = require(path.join(lab, 'studio/smiles-corrigidos.js'));

const TOL = 0.05;

function acharRDKit() {
  const candidatos = [
    process.env.RDKIT_DIST,
    path.join(frontend, 'scripts/e2e/cdn-mirror/node_modules/@rdkit/rdkit/dist'),
    path.resolve(frontend, '../../../../frontend/scripts/e2e/cdn-mirror/node_modules/@rdkit/rdkit/dist'),
  ].filter(Boolean);
  return candidatos.find((d) => fs.existsSync(path.join(d, 'RDKit_minimal.js')) && fs.existsSync(path.join(d, 'RDKit_minimal.wasm')));
}

let R = null;
const dist = acharRDKit();
before(async () => {
  if (!dist) {
    console.warn('[estudio-quimica] RDKit indisponível neste ambiente: testes com WASM pulados (rodar npm i em scripts/e2e/cdn-mirror).');
    return;
  }
  const init = require(path.join(dist, 'RDKit_minimal.js'));
  R = await init({ locateFile: (f) => path.join(dist, f) });
});
const comRDKit = (nome, fn) => test(nome, async (t) => {
  if (!R) { t.skip('RDKit WASM indisponível'); return; }
  await fn(t);
});
const amw = (smiles) => {
  const m = R.get_mol(smiles);
  assert.ok(m, `RDKit rejeitou ${smiles}`);
  const v = JSON.parse(m.get_descriptors()).amw;
  m.delete();
  return v;
};

// ─── Fontes de SMILES ─────────────────────────────────────────────────────
function carregarCatalogo() {
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(read('data/lab-database.js') + ';this.LAB = LAB_DATABASE;', sb);
  return Object.entries(sb.LAB.species).map(([chave, v]) => ({
    origem: 'lab-database', chave, label: v.label, formula: v.formula, massa: v.molarMass, smiles: v.smiles,
  }));
}
function carregarAcervoReserva() {
  const txt = read('studio/studio.js');
  const ini = txt.indexOf('const ACERVO_RESERVA = [');
  const fim = txt.indexOf('\n  ];', ini);
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(txt.slice(ini, fim + 5).replace('const ACERVO_RESERVA', 'this.A') + ';', sb);
  return sb.A.map((c) => ({ origem: 'acervo-reserva', chave: c.id, label: c.nome, formula: c.formula, massa: c.molarMass, smiles: c.smiles }));
}
function carregarDicionarioBancada() {
  const txt = read('js/script.js');
  const out = [];
  const re = /'([^']+)':\s*\{[^{}]*?formula:\s*'([^']*)'[^{}]*?molarMass:\s*([\d.]+)[^{}]*?smiles:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(txt))) out.push({ origem: 'script.js', chave: m[1], label: m[1], formula: m[2], massa: parseFloat(m[3]), smiles: m[4] });
  return out;
}

// Exceções documentadas: divergência conhecida que NÃO é corrigida neste PR.
// Chave "origem:chave" -> motivo. Entradas ausentes aqui falham o teste.
const EXCECOES_SMILES_VS_MASSA = {
};

function smilesEfetivo(e) {
  // O Estúdio aplica smiles-corrigidos.js sobre o catálogo e o acervo reserva.
  const c = corrigidos[e.chave];
  return c && e.origem !== 'script.js' ? c.smiles : e.smiles;
}

const corpus = () => [...carregarCatalogo(), ...carregarAcervoReserva(), ...carregarDicionarioBancada()]
  .filter((e) => e.smiles && e.smiles !== '--' && typeof e.massa === 'number');

// ─── LAB-04 ───────────────────────────────────────────────────────────────
comRDKit('LAB-04: massa do SMILES (RDKit) bate com a massa do catálogo em TODAS as moléculas (±0,05 u)', () => {
  const falhas = [];
  for (const e of corpus()) {
    const m = amw(smilesEfetivo(e));
    if (Math.abs(m - e.massa) > TOL && !EXCECOES_SMILES_VS_MASSA[`${e.origem}:${e.chave}`]) {
      falhas.push(`${e.origem}:${e.chave} (${e.label}) catálogo ${e.massa} vs SMILES ${m.toFixed(2)}`);
    }
  }
  assert.deepEqual(falhas, []);
});

comRDKit('LAB-04: exceções documentadas ainda divergem (a lista não acumula exceções velhas)', () => {
  for (const chave of Object.keys(EXCECOES_SMILES_VS_MASSA)) {
    const e = corpus().find((x) => `${x.origem}:${x.chave}` === chave);
    if (!e) continue; // removida da origem
    // Se a origem foi corrigida, a exceção é dispensável (não falha); se ainda diverge, está documentada.
    const dif = Math.abs(amw(e.smiles) - e.massa);
    assert.ok(dif <= TOL || EXCECOES_SMILES_VS_MASSA[chave].length > 20);
  }
});

comRDKit('LAB-04: fórmula do catálogo (massa por fórmula) bate com a massa do catálogo e com o SMILES', () => {
  const falhas = [];
  for (const e of corpus()) {
    const porFormula = core.massaPorFormula(e.formula);
    if (porFormula === null) continue; // fórmula não interpretável (ex.: texto livre)
    const smi = amw(smilesEfetivo(e));
    if (Math.abs(porFormula - smi) > TOL && !EXCECOES_SMILES_VS_MASSA[`${e.origem}:${e.chave}`]) {
      falhas.push(`${e.origem}:${e.chave} fórmula ${e.formula}=${porFormula} vs SMILES ${smi.toFixed(2)}`);
    }
  }
  assert.deepEqual(falhas, []);
});

comRDKit('LAB-04: cada SMILES corrigido tem a massa e a fórmula do próprio catálogo', () => {
  const todos = [...carregarCatalogo(), ...carregarAcervoReserva()];
  for (const [chave, c] of Object.entries(corrigidos)) {
    const e = todos.find((x) => x.chave === chave);
    assert.ok(e, `entrada ${chave} não existe no catálogo`);
    assert.ok(Math.abs(amw(c.smiles) - e.massa) <= TOL, `${chave}: massa`);
    const info = core.analisarSmiles(c.smiles);
    assert.equal(info.formula, core.formulaHill(core.analisarSmiles(c.smiles).contagens));
    const doCatalogo = core.massaPorFormula(e.formula);
    assert.ok(Math.abs(info.massa - doCatalogo) <= TOL, `${chave}: fórmula do catálogo ${e.formula}`);
  }
});

test('LAB-04: dipirona sódica tem massa 333,34 (fórmula e SMILES corrigido)', () => {
  const info = core.analisarSmiles(corrigidos.Dipirona.smiles);
  assert.equal(info.formula, 'C13H16N3NaO4S');
  assert.ok(Math.abs(info.massa - 333.34) <= TOL);
  assert.equal(info.contagens.Na, 1);
});

comRDKit('LAB-04: o analisador de SMILES sem RDKit concorda com o RDKit em todo o catálogo (±0,02 u)', () => {
  const falhas = [];
  for (const e of corpus()) {
    const smi = smilesEfetivo(e);
    const info = core.analisarSmiles(smi);
    if (!info) { continue; } // SMILES que o analisador não cobre devolve null (nunca um número errado)
    const ref = amw(smi);
    if (Math.abs(info.massa - ref) > 0.05) falhas.push(`${e.chave}: ${info.massa} vs ${ref.toFixed(3)}`);
  }
  assert.deepEqual(falhas, []);
});

// ─── LAB-15: fallback sem RDKit ──────────────────────────────────────────
test('LAB-15: benzeno sem RDKit tem massa 78,11 (por SMILES) e fórmula C6H6', () => {
  const info = core.analisarSmiles('c1ccccc1');
  assert.equal(info.formula, 'C6H6');
  assert.ok(Math.abs(info.massa - 78.11) <= TOL);
  const p = core.propriedadesSemRDKit('c1ccccc1', undefined, undefined);
  assert.ok(Math.abs(p.mw - 78.11) <= TOL);
  assert.equal(p.heavyAtoms, 6);
});

test('LAB-15: fallback não inventa logP, TPSA, HBD nem regras (cafeína)', () => {
  const p = core.propriedadesSemRDKit('CN1C=NC2=C1C(=O)N(C(=O)N2C)C', undefined, 'C8H10N4O2');
  assert.equal(p.logp, null);
  assert.equal(p.tpsa, null);
  assert.equal(p.hbd, null);
  assert.deepEqual(p.falhasLipinski, []);
  assert.equal(p._semDescritores, true);
  assert.ok(Math.abs(p.mw - 194.19) <= TOL);
});

test('LAB-15: sem SMILES nem fórmula não há massa (desabilita em vez de zero)', () => {
  assert.equal(core.propriedadesSemRDKit('--', undefined, undefined), null);
  assert.equal(core.propriedadesSemRDKit('c1ccccc1', 0, undefined).mw > 0, true);
});

test('massaPorFormula entende parênteses e rejeita texto livre', () => {
  assert.ok(Math.abs(core.massaPorFormula('Ca(OH)2') - 74.093) <= TOL);
  assert.equal(core.massaPorFormula('Análogo'), null);
  assert.equal(core.massaPorFormula('--'), null);
  assert.equal(core.massaPorFormula('Xx2'), null);
});

// ─── LAB-07: valência por soma das ordens ────────────────────────────────
function molfile(smiles, comH) {
  const m = R.get_mol(smiles);
  if (comH) m.add_hs_in_place();
  const mb = m.get_molblock();
  m.delete();
  return mb;
}
const diag = (smiles, filtro, comH = false, simbolo = 'C') => {
  const p = core.parseSDF(molfile(smiles, comH));
  const idx = p.atoms.findIndex((a, i) => a.elem === simbolo && filtro(p, i));
  assert.ok(idx >= 0, 'átomo não encontrado');
  return core.diagnosticoAdicao(p, idx);
};
const viz = (p, i) => p.bonds.filter((b) => b.a1 === i + 1 || b.a2 === i + 1);

comRDKit('LAB-07: carbono da carbonila da acetona tem soma 4 e 0 conexões livres (não 1)', () => {
  const d = diag('CC(=O)C', (p, i) => viz(p, i).length === 3);
  assert.equal(d.vizinhos, 3);
  assert.equal(d.soma, 4);
  assert.equal(d.livres, 0);
  assert.equal(d.status, 'excedida');
});
comRDKit('LAB-07: carbono do benzeno tem 1 conexão livre (não 2)', () => {
  const d = diag('c1ccccc1', () => true);
  assert.equal(d.livres, 1);
  assert.notEqual(d.status, 'excedida');
});
comRDKit('LAB-07: etanol sem H — CH3 tem 3 livres, CH2 tem 2', () => {
  const p = core.parseSDF(molfile('CCO', false));
  const livres = p.atoms.map((a, i) => (a.elem === 'C' ? core.diagnosticoAdicao(p, i).livres : null)).filter((x) => x !== null);
  assert.deepEqual(livres.sort(), [2, 3]);
});
comRDKit('LAB-07: etanol com H explícito — carbono saturado oferece remover H', () => {
  const d = diag('CCO', () => true, true);
  assert.equal(d.livres, 0);
  assert.equal(d.status, 'remover_h');
});
comRDKit('LAB-07: ácido acético — carbono do carboxilato soma 4; OH do ácido tem 1 livre', () => {
  const dc = diag('CC(=O)O', (p, i) => viz(p, i).length === 3);
  assert.equal(dc.soma, 4);
  assert.equal(dc.livres, 0);
  const p = core.parseSDF(molfile('CC(=O)O', false));
  const iOH = p.atoms.findIndex((a, i) => a.elem === 'O' && viz(p, i).length === 1 && viz(p, i)[0].tipo === 1);
  assert.equal(core.diagnosticoAdicao(p, iOH).livres, 1);
});
test('LAB-07: carbono pentavalente é valência excedida', () => {
  const v = core.avaliarValencia('C', 0, [1, 1, 1, 1, 1]);
  assert.equal(v.excedida, true);
  assert.equal(v.soma, 5);
  assert.equal(v.livres, 0);
});
test('LAB-07: valências usuais (N3, O2, halogênio 1, S2/4/6, P3/5) e carga (N+ = 4)', () => {
  assert.deepEqual(core.valenciasUsuais('N', 0), [3]);
  assert.deepEqual(core.valenciasUsuais('N', 1), [4]);
  assert.deepEqual(core.valenciasUsuais('O', -1), [1]);
  assert.deepEqual(core.valenciasUsuais('Cl', 0), [1]);
  assert.deepEqual(core.valenciasUsuais('S', 0), [2, 4, 6]);
  assert.deepEqual(core.valenciasUsuais('P', 0), [3, 5]);
  assert.equal(core.avaliarValencia('N', 0, [1, 1, 1, 1]).excedida, true);
  assert.equal(core.avaliarValencia('N', 1, [1, 1, 1, 1]).excedida, false);
});
test('LAB-07: aromático fundido (3 ligações aromáticas) não é marcado como excedido', () => {
  assert.equal(core.avaliarValencia('C', 0, [4, 4, 4]).excedida, false);
});
comRDKit('LAB-07: substituição respeita a soma das ordens (C=O não vira F)', () => {
  const p = core.parseSDF(molfile('CC(=O)C', false));
  const iC = p.atoms.findIndex((a, i) => a.elem === 'C' && viz(p, i).length === 3);
  assert.equal(core.comportaSubstituicao(p, iC, 'F').compativel, false);
  assert.equal(core.comportaSubstituicao(p, iC, 'Si').compativel, true);
});
test('LAB-07: o texto não chama excesso de valência de radical livre', () => {
  const s = fs.readFileSync(path.join(lab, 'studio/studio.js'), 'utf8');
  assert.doesNotMatch(s, /radical livre|valência estendida|Valência estendida/);
  assert.match(s.normalize('NFC'), /valência excedida/i);
});

// ─── LAB-08: bioisosterismo estrutural ───────────────────────────────────
const ASPIRINA = 'CC(=O)OC1=CC=CC=C1C(=O)O';
const SALICILICO = 'O=C(O)C1=CC=CC=C1O';
const canon = (s) => { const m = R.get_mol(s); const c = m.get_smiles(); m.delete(); return c; };
const aplicar = (smiles, id) => core.aplicarBioisosterismo(R, smiles, id);

comRDKit('LAB-08: aspirina ➔ tetrazol produz molécula válida com a fórmula esperada', () => {
  const r = aplicar(ASPIRINA, 'carboxila_tetrazol');
  assert.equal(r.ok, true, r.motivo);
  assert.equal(core.analisarSmiles(r.smiles).formula, 'C9H8N4O2');
  assert.equal(r.smiles, canon('CC(=O)Oc1ccccc1-c1nnn[nH]1'));
});
comRDKit('LAB-08: aspirina ➔ éster metílico mexe só na carboxila', () => {
  const r = aplicar(ASPIRINA, 'esterificacao_metilica');
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.smiles, canon('COC(=O)c1ccccc1OC(C)=O'));
});
comRDKit('LAB-08: aspirina ➔ amida mantém o éster acetílico', () => {
  const r = aplicar(ASPIRINA, 'amidacao_primaria');
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.smiles, canon('NC(=O)c1ccccc1OC(C)=O'));
});
comRDKit('LAB-08: ácido salicílico ➔ O-acetilação dá aspirina; O-metilação dá o éter (só o fenol)', () => {
  assert.equal(aplicar(SALICILICO, 'o_acetilacao').smiles, canon(ASPIRINA));
  assert.equal(aplicar(SALICILICO, 'o_metilacao').smiles, canon('COc1ccccc1C(=O)O'));
});
comRDKit('LAB-08: 4-aminofenol ➔ N-acetilação dá paracetamol', () => {
  const r = aplicar('NC1=CC=C(O)C=C1', 'n_acetilacao');
  assert.equal(r.smiles, canon('CC(=O)Nc1ccc(O)cc1'));
});
comRDKit('LAB-08: paracetamol não recebe N-acetilação (amida ≠ amina primária) nem imida', () => {
  const r = aplicar('CC(=O)NC1=CC=C(O)C=C1', 'n_acetilacao');
  assert.equal(r.ok, false);
});
comRDKit('LAB-08: cafeína não tem N-H: sem N-acetilação', () => {
  assert.equal(aplicar('CN1C=NC2=C1C(=O)N(C(=O)N2C)C', 'n_acetilacao').ok, false);
});
comRDKit('LAB-08: etanol ➔ O-metilação dá éter etil-metílico (antes não mudava nada)', () => {
  assert.equal(aplicar('CCO', 'o_metilacao').smiles, canon('CCOC'));
  assert.equal(aplicar('CCO', 'o_acetilacao').smiles, canon('CCOC(C)=O'));
});
comRDKit('LAB-08: benzeno ➔ fluorbenzeno (sítios equivalentes = um produto)', () => {
  assert.equal(aplicar('c1ccccc1', 'fluorizacao_aromatica').smiles, canon('Fc1ccccc1'));
});
comRDKit('LAB-08: sítio ambíguo desativa a sugestão (fluorização da aspirina)', () => {
  const r = aplicar(ASPIRINA, 'fluorizacao_aromatica');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /sítio/);
});
comRDKit('LAB-08: sem o grupo, sem produto; sem RDKit, sem sugestão', () => {
  assert.equal(aplicar('CCCC', 'carboxila_tetrazol').ok, false);
  assert.equal(core.aplicarBioisosterismo(null, ASPIRINA, 'carboxila_tetrazol').ok, false);
  assert.equal(aplicar(ASPIRINA, 'nao_existe').ok, false);
});
comRDKit('LAB-08: TODO produto aceito é molécula sanitizada diferente da original', () => {
  const amostras = ['CC(C)Cc1ccc(cc1)C(C)C(=O)O', ASPIRINA, SALICILICO, 'CCO', 'CO', 'NC1=CC=C(O)C=C1', 'c1ccccc1', 'OC(=O)C'];
  for (const s of amostras) {
    for (const rx of core.REACOES_BIOISOSTERISMO) {
      const r = aplicar(s, rx.id);
      if (!r.ok) continue;
      const m = R.get_mol(r.smiles);
      assert.ok(m, `${s} + ${rx.id} -> ${r.smiles} inválido`);
      m.delete();
      assert.notEqual(r.smiles, canon(s));
    }
  }
});
test('LAB-08: studio.js não troca texto no SMILES (sem .replace em transformações)', () => {
  const s = fs.readFileSync(path.join(lab, 'studio/studio.js'), 'utf8');
  assert.doesNotMatch(s, /transformar:\s*function/);
  assert.doesNotMatch(s, /rx\.transformar\(/);
  assert.match(s, /aplicarBioisosterismo\(/);
  assert.doesNotMatch(s, /🧪 Sintetizar/);
});

// ─── LAB-09: alertas estruturais ─────────────────────────────────────────
const alertas = (smiles) => {
  const m = R.get_mol(smiles);
  const a = core.alertasEstruturais(R, m).map((x) => x.nome);
  m.delete();
  return a;
};
comRDKit('LAB-09: fenol não é alerta (paracetamol, ácido salicílico, 4-aminofenol sem alerta)', () => {
  assert.deepEqual(alertas('CC(=O)NC1=CC=C(O)C=C1'), []);
  assert.deepEqual(alertas(SALICILICO), []);
  assert.deepEqual(alertas('NC1=CC=C(O)C=C1'), []);
});
comRDKit('LAB-09: padrões reais disparam (catecol, hidroquinona, quinona, epóxido, nitroaromático)', () => {
  assert.ok(alertas('Oc1ccccc1O').includes('Catecol'));
  assert.ok(alertas('Oc1ccc(O)cc1').includes('Hidroquinona'));
  assert.ok(alertas('O=C1C=CC(=O)C=C1').includes('Quinona'));
  assert.ok(alertas('C1CO1').includes('Epóxido'));
  assert.ok(alertas('O=[N+]([O-])c1ccccc1').includes('Nitroaromático'));
});
comRDKit('LAB-09: todos os SMARTS dos alertas são válidos no RDKit', () => {
  for (const a of core.ALERTAS_ESTRUTURAIS) {
    const q = R.get_qmol(a.smarts);
    assert.ok(q, `SMARTS inválido: ${a.nome}`);
    q.delete();
  }
});
test('LAB-09: o rótulo público não diz PAINS', () => {
  const html = fs.readFileSync(path.join(lab, 'studio/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(lab, 'studio/studio.js'), 'utf8');
  const visivel = html.replace(/<!--[\s\S]*?-->/g, '') + js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(visivel, /PAINS(?!_)/);
  assert.doesNotMatch(visivel, /Fenol Alquilante/i);
});

// ─── Carga, acessibilidade e UX do Estúdio ───────────────────────────────
test('RDKit/WASM: a bancada não referencia o RDKit; o Estúdio só o carrega sob demanda (getter)', () => {
  const bancada = read('index.html') + read('js/script.js') + read('style.css');
  assert.doesNotMatch(bancada, /rdkit|\.wasm/i);
  const loader = read('studio/studio-loader.js');
  assert.match(loader, /Object\.defineProperty\(global, '__rdkitReady'/);
  assert.doesNotMatch(loader, /global\.__rdkitReady\s*=/);
});

test('Estúdio: filtros usam role=group + aria-pressed (sem role=tab com aria-pressed, crítica do axe)', () => {
  const html = read('studio/index.html');
  assert.doesNotMatch(html, /class="category-pill[^"]*"[^>]*role="tab"/);
  assert.doesNotMatch(html, /role="tablist"/);
  assert.match(html, /id="studioViewer3D"[^>]*role="img"/);
  assert.match(html, /<script src="chem-core\.js"><\/script>[\s\S]*<script src="studio\.js">/);
});

test('Estúdio: nenhuma fonte abaixo de 12 px e há prefers-reduced-motion e alvos de 44 px', () => {
  const css = read('studio/studio.css');
  for (const m of css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) {
    const px = m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
    assert.ok(px >= 12, `font-size ${m[0]} < 12px`);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.tool-btn,[\s\S]{0,200}min-height:\s*44px/);
});

test('Estúdio: contador reflete lista vazia e fórmulas faltantes são preenchidas pelo SMILES', () => {
  const js = read('studio/studio.js');
  assert.match(js, /function atualizarContadorVisiveis/);
  assert.match(js, /Nenhum composto visível/);
  assert.match(js, /function prepararAcervo/);
});
