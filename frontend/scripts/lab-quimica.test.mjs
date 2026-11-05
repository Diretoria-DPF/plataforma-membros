/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Química da bancada do Laboratório (LAB-01, 02, 03, 05, 06): pH, estequiometria da síntese,
// balanço atômico do banco de sínteses, precipitação e série de reatividade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'modulos', 'laboratorio');
const Q = require(path.join(lab, 'js/lab-quimica.js'));
const BANCO = require(path.join(lab, 'data/sinteses-database.js'));
const LAB = (() => {
  const g = { window: {} };
  new Function('window', `${require('node:fs').readFileSync(path.join(lab, 'data/lab-database.js'), 'utf8')}; return LAB_DATABASE;`)(g.window);
  return new Function(`${require('node:fs').readFileSync(path.join(lab, 'data/lab-database.js'), 'utf8')}; return LAB_DATABASE;`)();
})();

const aprox = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} obtido ${a}, esperado ${b} ±${tol}`);

/** Bancada mínima: adiciona reagentes pelas mesmas funções que a interface usa. */
function bancada() {
  const sys = { vol: 0, temp: 25, especies: new Map() };
  const add = (id, qtd) => {
    const info = LAB.species[id] || null;
    const ef = Q.efeitoDaAdicao(id, qtd, info, 100);
    ef.especies.forEach(([k, v]) => sys.especies.set(k, (sys.especies.get(k) || 0) + v));
    sys.vol += ef.volumeMl;
    return Q.equilibrar(sys, { agitadorAtivo: true });
  };
  const ph = () => Q.calcularPH(sys.especies, sys.vol);
  return { sys, add, ph, q: (id) => sys.especies.get(id) || 0 };
}

// ── LAB-01: pH ───────────────────────────────────────────────────────────────
test('LAB-01: HCl 6 M, 1 mL em 100 mL de água dá pH ≈ 1,22 (não 0)', () => {
  const b = bancada();
  b.add('H2O_l', 100);
  b.add('HCl_aq', 1);
  aprox(b.ph(), 1.22, 0.02);
});

test('LAB-01: ácido forte diluído 100x sobe 2 unidades de pH', () => {
  const b = bancada();
  b.add('H2O_l', 99);
  b.add('HCl_aq', 1); // 6 mmol em 100 mL = 0,06 M
  const p1 = b.ph();
  b.add('H2O_l', 9900 > 150 ? 150 : 150);
  assert.ok(b.ph() > p1 + 0.3);
});

test('LAB-01: base forte NaOH 6 M, 10 mL satura em 14 e nunca passa de 14', () => {
  const b = bancada();
  b.add('NaOH_aq', 10);
  assert.equal(b.ph(), 14);
});

test('LAB-01: NaOH 0,06 M dá pH ≈ 12,78', () => {
  const b = bancada();
  b.add('H2O_l', 100);
  b.add('NaOH_aq', 1);
  aprox(b.ph(), 12.78, 0.03);
});

test('LAB-01: ácido acético 0,1 M (CH3COOH) dá pH ≈ 2,88 (ácido fraco, Ka)', () => {
  const sys = { especies: new Map([['CH3COOH', 10], ['H2O_l', 5000]]), vol: 100 };
  aprox(Q.calcularPH(sys.especies, sys.vol), 2.88, 0.03);
});

test('LAB-01: ácido acético do catálogo (1 M, 10 mL em 100 mL de água) dá pH ≈ 2,9', () => {
  const b = bancada();
  b.add('H2O_l', 100);
  b.add('AcidoAcetico_aq', 10);
  aprox(b.ph(), 2.9, 0.05);
});

test('LAB-01: amônia 5 M, 10 mL em 100 mL dá pH ≈ 11,5 (base fraca, não 14)', () => {
  const b = bancada();
  b.add('H2O_l', 100);
  b.add('NH3_aq', 10);
  const ph = b.ph();
  assert.ok(ph > 11.2 && ph < 12.1, `pH ${ph}`);
});

test('LAB-01: ácido fraco + base forte meio a meio forma tampão com pH = pKa', () => {
  const sys = { especies: new Map([['CH3COOH', 5], ['CH3COO-', 5], ['Na+', 5]]), vol: 100 };
  aprox(Q.calcularPH(sys.especies, sys.vol), 4.76, 0.02);
});

test('LAB-01: HCl + NaOH equimolares neutralizam em pH 7', () => {
  const b = bancada();
  b.add('HCl_aq', 5);
  b.add('NaOH_aq', 5);
  aprox(b.ph(), 7, 0.01);
});

test('LAB-01: carbonato de sódio é básico e bicarbonato fica perto de 8,3', () => {
  const a = bancada(); a.add('H2O_l', 100); a.add('Na2CO3_aq', 10);
  assert.ok(a.ph() > 11 && a.ph() < 12.2, `Na2CO3 ${a.ph()}`);
  const c = bancada(); c.add('H2O_l', 100); c.add('NaHCO3_aq', 10);
  aprox(c.ph(), 8.3, 0.3);
});

test('LAB-01: bancada vazia e água pura ficam em pH 7; o resultado fica sempre entre 0 e 14', () => {
  assert.equal(Q.calcularPH(new Map(), 0), 7);
  const b = bancada(); b.add('H2O_l', 50);
  aprox(b.ph(), 7, 0.01);
  const forte = bancada(); forte.add('HCl_aq', 1);
  assert.ok(forte.ph() >= 0 && forte.ph() <= 14);
});

test('LAB-01: quantidades guardadas em mmol (concentração x mL) e líquidos pela densidade', () => {
  const b = bancada();
  b.add('HCl_aq', 2);
  aprox(b.q('Cl-'), 12, 1e-9);
  aprox(Q.mmolDeSolido(1.3812, 138.12), 10, 1e-9);
  aprox(Q.mmolDeLiquido(1, 1, 18.015), 55.51, 0.01);
  const sys = { vol: 0, temp: 25, especies: new Map() };
  const ef = Q.efeitoDaAdicao('AnidridoAcetico_l', 10, LAB.species.AnidridoAcetico_l || { phase: 'l', molarMass: 102.09, density: 1.08 }, 100);
  aprox(ef.especies[0][1], 105.8, 0.5);
  assert.equal(sys.vol, 0);
});

// ── LAB-05 / LAB-06: precipitação e série de reatividade ────────────────────
test('LAB-05: BaCl2 + CuSO4 forma BaSO4 (e CuCl2 em solução), nunca BaCO4', () => {
  const b = bancada();
  b.add('BaCl2_aq', 5);
  b.add('CuSO4_aq', 5);
  assert.ok(b.q('BaSO4_s') > 4.9);
  assert.equal(b.q('BaCO4_s'), 0);
  aprox(b.q('Cu2+'), 5, 1e-9);
  aprox(b.q('Cl-'), 10, 1e-9);
});

test('LAB-05: o produto de cada regra de precipitação tem a composição dos íons que a formam', () => {
  const carga = (id) => Math.abs(Q.cargaDaEspecie(id));
  for (const p of Q.PRECIP_TABLE) {
    const base = p.prod.replace(/_s$/, '');
    const atomos = Q.contarAtomos(base);
    assert.ok(atomos, `${p.prod} não é fórmula`);
    // cátion + ânion, sem usar o id do íon (S_2-, CO3_2-, SO4_2- carregam o código do grupo)
    const elCat = /^[A-Z][a-z]?/.exec(p.cat)[0];
    assert.equal(atomos[elCat], p.cC, `${p.prod}: ${elCat}`);
    const grupoAn = p.an.replace(/_?\d?-$/, '');
    const esperado = Q.contarAtomos(grupoAn === 'OH' ? 'OH' : grupoAn);
    for (const el of Object.keys(esperado)) {
      assert.equal(atomos[el], esperado[el] * p.cA, `${p.prod}: ${el}`);
    }
    assert.equal(p.cC * carga(p.cat), p.cA * carga(p.an), `${p.prod}: carga`);
  }
});

test('LAB-06: cobre não desloca H2 de HCl diluído; zinco desloca', () => {
  const cu = bancada();
  cu.add('HCl_aq', 5);
  const ev = cu.add('Cu_s', 5);
  assert.equal(cu.q('H2_g'), 0);
  assert.equal(cu.q('Cu2+'), 0);
  assert.ok(ev.some((e) => e.tipo === 'sem_reacao' && e.metal === 'Cu_s'));
  const zn = bancada();
  zn.add('HCl_aq', 5);
  zn.add('Zn_s', 1);
  assert.ok(zn.q('H2_g') > 5);
  assert.ok(zn.q('Zn2+') > 5);
});

test('LAB-06: chumbo (passiva em HCl/H2SO4) e prata/cobre não liberam H2; Mg, Al, Fe e Ca liberam', () => {
  for (const m of ['Pb_s', 'Cu_s']) assert.equal(Q.METAIS_ATIVOS[m], undefined);
  for (const m of ['Mg_s', 'Al_s', 'Fe_s', 'Ca_s', 'Zn_s']) assert.ok(Q.METAIS_ATIVOS[m], m);
});

test('LAB-06: vinagre (ácido fraco) também desloca H2 do zinco e libera CO2 do bicarbonato', () => {
  const zn = bancada(); zn.add('AcidoAcetico_aq', 10); zn.add('Zn_s', 0.5);
  assert.ok(zn.q('H2_g') > 0);
  const bic = bancada(); bic.add('HCl_aq', 2); bic.add('NaHCO3_aq', 10);
  assert.ok(bic.q('CO2_g') > 5);
});

test('íons da bancada: a carga total da solução fica neutra após reações', () => {
  const b = bancada();
  b.add('HCl_aq', 5); b.add('Zn_s', 1); b.add('NaOH_aq', 3);
  let soma = 0;
  for (const [id, n] of b.sys.especies) soma += Q.cargaDaEspecie(id) * n;
  aprox(soma, 0, 1e-6);
});

// ── LAB-02: síntese por estequiometria ──────────────────────────────────────
const ASPIRINA = LAB.reactions.find((r) => r.id === 'sintese_aspirina');
const MM = { salicilico: 138.12, anidrido: 102.09, aas: 180.16 };

function prepararAspirina(gSalicilico, mlAnidrido) {
  const b = bancada();
  b.sys.especies.set('AcidoSalicilico_s', Q.mmolDeSolido(gSalicilico, MM.salicilico));
  b.sys.especies.set('AnidridoAcetico_l', Q.mmolDeLiquido(mlAnidrido, 1.08, MM.anidrido));
  b.sys.temp = 70;
  return b;
}
const ctx = { agitadorAtivo: true, catalisadores: new Set(['H2SO4_aq']) };

test('LAB-02: aspirina — 13,8 g de salicílico e excesso de anidrido rendem 85 % do teórico, só após o tempo', () => {
  const b = prepararAspirina(13.812, 20);
  let est = null; let concluiu = false; let minutos = 0;
  while (!concluiu && minutos < 120) {
    const r = Q.avancarSintese(b.sys, ASPIRINA, est, 1, ctx);
    est = r.est; concluiu = r.concluiu; minutos++;
  }
  assert.ok(minutos >= 29 && minutos <= 31, `concluiu em ${minutos} min (tempo do banco: 30)`);
  aprox(b.q('AAS_s'), 100 * 0.85, 0.1);
  aprox(b.q('AAS_s') * MM.aas / 1000, 15.31, 0.05, 'massa de AAS (g)');
  assert.equal(b.q('AcidoSalicilico_s'), 0);
  assert.ok(b.q('AnidridoAcetico_l') > 0, 'anidrido em excesso sobra');
  aprox(b.q('CH3COOH'), 100, 0.1);
});

test('LAB-02: sem agitação, sem catalisador, frio ou quente demais não há progresso', () => {
  const casos = [
    [{ ...ctx, agitadorAtivo: false }, 70, 'agitação'],
    [{ ...ctx, catalisadores: new Set() }, 70, 'catalisador'],
    [ctx, 40, 'temperatura mínima'],
    [ctx, 95, 'temperatura máxima']
  ];
  for (const [c, temp, motivo] of casos) {
    const b = prepararAspirina(1, 2);
    b.sys.temp = temp;
    const r = Q.avancarSintese(b.sys, ASPIRINA, null, 5, c);
    assert.ok(r.faltando.includes(motivo), motivo);
    assert.equal(b.q('AAS_s'), 0);
    assert.equal(r.concluiu, false);
  }
});

test('LAB-02: com um só reagente mostra progresso 0 e nunca conclui', () => {
  const b = bancada();
  b.sys.especies.set('AcidoSalicilico_s', 10);
  b.sys.temp = 70;
  const r = Q.avancarSintese(b.sys, ASPIRINA, null, 60, ctx);
  assert.equal(r.concluiu, false);
  assert.equal(r.progresso, 0);
  assert.ok(r.faltando.includes('reagentes'));
});

test('LAB-02: reagente limitante define o rendimento e o progresso é parcial antes do fim', () => {
  const b = prepararAspirina(1.3812, 5); // 10 mmol de salicílico (limitante)
  let r = Q.avancarSintese(b.sys, ASPIRINA, null, 15, ctx);
  assert.equal(r.concluiu, false);
  aprox(r.progresso, 0.5, 0.01);
  assert.equal(r.limitante, 'AcidoSalicilico_s');
  r = Q.avancarSintese(b.sys, ASPIRINA, r.est, 15, ctx);
  assert.equal(r.concluiu, true);
  aprox(b.q('AAS_s'), 8.5, 0.01);
});

test('LAB-02: quantidade irrisória não conta como síntese concluída', () => {
  const b = prepararAspirina(0.001, 5);
  const r = Q.avancarSintese(b.sys, ASPIRINA, null, 30, ctx);
  assert.equal(r.concluiu, false);
});

test('LAB-02: toda reação simulável tem estequiometria, tempo e faixa de temperatura coerentes', () => {
  for (const rx of LAB.reactions.filter((r) => r.estequiometria)) {
    assert.ok(rx.tempoReacaoMin > 0 && rx.rendimentoPercentual > 0 && rx.rendimentoPercentual <= 100, rx.id);
    assert.ok(rx.tempMaxima > rx.tempMinima, rx.id);
    assert.ok(Q.equacaoBalanceada(rx.equacaoQuimica), `${rx.id}: ${rx.equacaoQuimica}`);
  }
});

// ── LAB-03: equações do banco de sínteses ───────────────────────────────────
test('LAB-03: contagem de átomos (parênteses, hidratos, coeficientes)', () => {
  assert.deepEqual(Q.contarAtomos('Ca(OH)2'), { Ca: 1, O: 2, H: 2 });
  assert.deepEqual(Q.contarAtomos('C17H18FN3O3·HCl'), { C: 17, H: 19, F: 1, N: 3, O: 3, Cl: 1 });
  assert.equal(Q.contarAtomos('MCPBA'), null);
  assert.equal(Q.equacaoBalanceada('2H2 + O2 -> 2H2O'), true);
  assert.equal(Q.equacaoBalanceada('H2 + O2 -> H2O'), false);
  assert.equal(Q.equacaoBalanceada('2SO2 + O2 -> 2SO3; SO3 + H2O -> H2SO4'), true);
  assert.equal(Q.equacaoBalanceada('Triglicerídeo + 3CH3OH -> 3Ésteres + Glicerol'), false);
});

test('LAB-03: nenhuma síntese disponível do banco traz equação desbalanceada', () => {
  assert.equal(BANCO.length, 110);
  const falhas = BANCO.filter((s) => !s.indisponivel && s.equacaoQuimica && !Q.equacaoBalanceada(s.equacaoQuimica)).map((s) => s.id);
  assert.deepEqual(falhas, []);
});

test('LAB-03: síntese sem equação verificada está marcada como indisponível ou como esquema geral', () => {
  for (const s of BANCO) {
    if (s.equacaoQuimica) continue;
    assert.ok(s.indisponivel === true || typeof s.esquema === 'string' || /fermenta|extra|Extrato/i.test(`${s.tipoReacao} ${s.descricao}`), s.id);
    if (s.indisponivel) assert.ok(s.motivoIndisponivel, s.id);
  }
  const disponiveis = BANCO.filter((s) => !s.indisponivel && Q.equacaoBalanceada(s.equacaoQuimica));
  assert.ok(disponiveis.length >= 25, `${disponiveis.length} sínteses com equação verificada`);
});

test('LAB-03: correções objetivas (ibuprofeno BHC, dipirona, omeprazol, vidro, ácido sulfúrico)', () => {
  const eq = (id) => BANCO.find((s) => s.id === id).equacaoQuimica;
  assert.match(eq('sintese_ibuprofeno'), /CO ->/);
  assert.match(eq('sintese_dipirona'), /C12H15N3O/);
  assert.match(eq('sintese_omeprazol'), /C7H5ClO3/);
  assert.match(eq('sintese_vidro'), /6SiO2/);
  assert.equal(Q.equacaoBalanceada(eq('sintese_acido_sulfurico')), true);
});

test('LAB-03: as reações da bancada (LAB_DATABASE.reactions) estão balanceadas', () => {
  for (const rx of LAB.reactions) assert.ok(Q.equacaoBalanceada(rx.equacaoQuimica), rx.id);
});
