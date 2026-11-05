/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O2 (Laboratório v2): seed único com proveniência, nivel_conteudo e o validador que roda no CI.
// - o seed passa no validador e reproduz EXATAMENTE as fontes antigas (nenhum valor mudou de lugar);
// - o validador reprova processo 'completo' para espécie restrita (guerra, ilícitas, rota de espécie educacional);
// - o gerador é determinístico (quando o RDKit está disponível, senão o teste é pulado com aviso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lab = path.join(raiz, 'frontend', 'modulos', 'laboratorio');
const lerLab = (rel) => fs.readFileSync(path.join(lab, rel), 'utf8');

const { validarSeed, carregarSeed } = await import(pathToFileURL(path.join(raiz, 'tools/lab/validar-seed.mjs')).href);
const Leitor = require(path.join(lab, 'js', 'lab-seed-leitor.js'));
const corrigidos = require(path.join(lab, 'studio', 'smiles-corrigidos.js'));
const seed = carregarSeed();
const clone = () => JSON.parse(JSON.stringify(seed));

const LAB_DATABASE = new Function('window', `${lerLab('data/lab-database.js')}; return LAB_DATABASE;`)({});
const SINTESES = new Function('window', `${lerLab('data/sinteses-database.js')}; return BANCO_SINTESES_LAIFT;`)({});

function idsDoCatalogo() {
  const script = lerLab('js/script.js');
  const ini = script.indexOf('function construirCatalogo()');
  const fim = script.indexOf('// ====', ini);
  return [...script.slice(ini, fim).matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map((m) => m[1]);
}

// ---------- o seed e o validador ----------
test('o seed passa no validador', () => {
  assert.deepEqual(validarSeed(seed), []);
});

test('seed: fontes cadastradas com licença e todo valor com fonte, data, unidade e confiança', () => {
  assert.ok(seed.fontes.curadoria_laift && seed.fontes.pubchem);
  assert.equal(seed.fontes.pubchem.licenca, 'public-domain');
  let linhas = 0;
  for (const s of seed.substancias) {
    for (const lista of Object.values(s.props)) {
      for (const p of lista) {
        linhas++;
        assert.ok(seed.fontes[p.s], `${s.id}: fonte ${p.s}`);
        assert.match(p.d, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(p.u && Number.isInteger(p.c) && p.c >= 1 && p.c <= 5);
      }
    }
  }
  assert.ok(linhas > 200, 'seed carrega centenas de valores com proveniência');
});

test('seed: todo item do catálogo da bancada tem substância (as 19 espécies que não tinham dado agora têm)', () => {
  const faltando = idsDoCatalogo().filter((id) => !Leitor.acharAlias(seed, id));
  assert.deepEqual(faltando, []);
  for (const id of ['Na2CO3_aq', 'Zn_s', 'Fe_s', 'CuSO4_aq', 'BaCl2_aq', 'fenolftaleina']) assert.ok(Leitor.acharAlias(seed, id), id);
});

test('seed reproduz LAB_DATABASE.species campo a campo (a fachada não muda nenhum valor)', () => {
  const ids = Object.keys(LAB_DATABASE.species);
  assert.ok(ids.length >= 60);
  for (const id of ids) {
    const antigo = LAB_DATABASE.species[id];
    const novo = Leitor.especieLegada(seed, id);
    assert.ok(novo, `${id} ausente do seed`);
    for (const campo of ['label', 'phase', 'molarMass', 'density', 'bp', 'fp', 'formula', 'iupac', 'pubchemQuery', 'dissociation']) {
      assert.deepEqual(novo[campo], antigo[campo], `${id}.${campo}`);
    }
    if (corrigidos[id]) assert.equal(novo.smiles, corrigidos[id].smiles, `${id}: SMILES corrigido prevalece`);
    else assert.equal(novo.smiles, antigo.smiles, `${id}.smiles`);
  }
});

test('seed absorve o DICIONARIO_MOLECULAR, o ACERVO_RESERVA e os SMILES corrigidos', () => {
  const script = lerLab('js/script.js');
  const ids = [...script.matchAll(/^\s{4}'([A-Za-z0-9_]+)': \{ label:/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 25, 'dicionário lido');
  for (const id of ids) assert.ok(Leitor.acharAlias(seed, id), `dicionário: ${id}`);
  const estudio = lerLab('studio/studio.js');
  const chaves = [...estudio.matchAll(/chaveOriginal: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(chaves.length >= 16);
  for (const id of chaves) assert.ok(Leitor.acharAlias(seed, id), `acervo: ${id}`);
  for (const [id, c] of Object.entries(corrigidos)) {
    const achado = Leitor.acharAlias(seed, id === 'Dipirona' ? 'Dipirona_s' : id);
    assert.ok(achado, `corrigido: ${id}`);
    assert.equal(achado.substancia.smiles, c.smiles);
    assert.equal(achado.substancia.smiles_fonte.s, 'pubchem');
    assert.equal(achado.substancia.pubchem_cid, c.cid);
  }
});

test('seed: ids que dividem a mesma estrutura viram aliases de uma só substância (InChIKey)', () => {
  const metanol = ['CH3OH_l', 'Metanol_l'].map((id) => Leitor.acharAlias(seed, id).substancia);
  assert.equal(metanol[0], metanol[1]);
  const chaves = seed.substancias.map((s) => s.inchikey);
  assert.equal(new Set(chaves).size, chaves.length);
});

test('proveniência por valor: fonte, licença, data, unidade e confiança', () => {
  const p = Leitor.proveniencia(seed, 'AAS_s', 'massa_molar');
  assert.equal(p.length, 1);
  assert.deepEqual({ ...p[0], valor: undefined }, { valor: undefined, unidade: 'g/mol', fonte: 'curadoria_laift', licenca: 'proprietaria-laift', data: '2026-11-05', confianca: 2 });
  assert.equal(p[0].valor, 180.16);
  assert.deepEqual(Leitor.proveniencia(seed, 'inexistente', 'bp'), []);
  // massa calculada da fórmula tem confiança 3
  assert.equal(Leitor.proveniencia(seed, 'Zn_s', 'massa_molar')[0].confianca, 3);
});

test('aplicar(): só corrige SMILES de espécies já existentes; não cria nem altera outros campos', () => {
  const db = { species: { C17H19NO3_s: { label: 'Morfina', smiles: 'ERRADO', molarMass: 285.34 }, H2O_l: { smiles: 'O' } } };
  const n = Leitor.aplicar(db, seed);
  assert.equal(n, 1);
  assert.equal(db.species.C17H19NO3_s.smiles, corrigidos.C17H19NO3_s.smiles);
  assert.equal(db.species.C17H19NO3_s.molarMass, 285.34);
  assert.deepEqual(Object.keys(db.species).sort(), ['C17H19NO3_s', 'H2O_l']);
  assert.equal(Leitor.aplicar(null, seed), 0);
});

// ---------- regra de conteúdo ----------
test('controlados de uso médico permanecem no catálogo, com os mesmos campos (morfina e fenobarbital)', () => {
  assert.equal(Leitor.especieLegada(seed, 'C17H19NO3_s').label, 'Morfina');
  assert.equal(Leitor.especieLegada(seed, 'C17H19NO3_s').molarMass, 285.34);
  assert.equal(Leitor.especieLegada(seed, 'C14H14N2O3_s').label, 'Fenobarbital');
  assert.equal(Leitor.acharAlias(seed, 'C17H19NO3_s').substancia.controlado_br, 'A1');
});

test('nivel_conteudo: opioides por rota e toxinas potentes são educacionais; fármacos comuns, completos', () => {
  for (const id of ['C17H19NO3_s', 'C20H22N2O2_s', 'C11H17N3O8_s', 'C31H42N2O6_s']) assert.equal(Leitor.nivelConteudo(seed, id), 'educacional', id);
  for (const id of ['AAS_s', 'Paracetamol_s', 'H2O_l', 'C14H14N2O3_s']) assert.equal(Leitor.nivelConteudo(seed, id), 'completo', id);
  assert.equal(Leitor.nivelConteudo(seed, 'nao_existe'), null);
});

test('processos: 110 sínteses; os 34 disponíveis completos mantêm exatamente os valores do acervo', () => {
  assert.equal(seed.processos.length, SINTESES.length);
  const porId = new Map(seed.processos.map((p) => [p.id, p]));
  let conferidos = 0;
  for (const x of SINTESES) {
    const p = porId.get(x.id);
    assert.ok(p, x.id);
    assert.equal(p.estado, x.indisponivel ? 'indisponivel' : 'disponivel');
    if (p.estado === 'disponivel' && p.nivel_conteudo === 'completo') {
      conferidos++;
      assert.deepEqual(p.reagentes, x.reagentesObrigatorios);
      assert.equal(p.temp_min_c, x.tempMinima ?? null);
      assert.equal(p.temp_max_c, x.tempMaxima ?? null);
      assert.equal(p.rendimento_pc, x.rendimentoPercentual ?? null);
      assert.equal(p.equacao, x.equacaoQuimica ?? null);
    }
  }
  assert.ok(conferidos >= 30, `processos completos conferidos: ${conferidos}`);
});

test('processos indisponíveis e educacionais saem do seed sem nenhum campo procedimental', () => {
  const PROC = ['reagentes', 'catalisador', 'solvente', 'temp_min_c', 'temp_max_c', 'tempo', 'rendimento_pc', 'agitacao', 'perigos'];
  const sem = seed.processos.filter((p) => p.estado === 'indisponivel' || p.nivel_conteudo === 'educacional');
  assert.ok(sem.length >= 76);
  for (const p of sem) for (const c of PROC) assert.equal(p[c], undefined, `${p.id}.${c}`);
  for (const id of ['sintese_codeina', 'sintese_oxicodona', 'sintese_tramadol', 'sintese_dextrometorfano']) {
    const p = seed.processos.find((x) => x.id === id);
    assert.equal(p.nivel_conteudo, 'educacional', id);
    assert.equal(p.equacao, null, `${id}: sem equação`);
  }
});

test('reações simuláveis: as 6 do catálogo, com os mesmos números', () => {
  assert.equal(seed.reacoes.length, LAB_DATABASE.reactions.length);
  for (const x of LAB_DATABASE.reactions) {
    const r = seed.reacoes.find((y) => y.id === x.id);
    assert.ok(r, x.id);
    assert.equal(r.produto_id, x.produtoId);
    assert.equal(r.rendimento_pc, x.rendimentoPercentual ?? null);
    assert.equal(r.equacao, x.equacaoQuimica);
    assert.equal(r.estado, 'simulavel');
  }
});

// ---------- o validador reprova (testes negativos) ----------
function errosCom(mutar) {
  const s = clone();
  mutar(s);
  return validarSeed(s);
}

test('validador reprova processo "completo" para espécie restrita (metadado)', () => {
  const erros = errosCom((s) => { const p = s.processos.find((x) => x.id === 'sintese_codeina'); p.nivel_conteudo = 'completo'; });
  assert.ok(erros.some((e) => /completo.*restrita|restrita.*completo/i.test(e)), erros.join('\n'));
});

test('validador reprova rota de síntese "completo" que toca espécie educacional do catálogo', () => {
  const erros = errosCom((s) => {
    const p = s.processos.find((x) => x.id === 'sintese_aspirina');
    p.reagentes = ['AcidoSalicilico_s', 'C17H19NO3_s'];
  });
  assert.ok(erros.some((e) => /educacional/.test(e) && /C17H19NO3_s/.test(e)), erros.join('\n'));
});

test('validador reprova processo "completo" de agente de guerra ou droga ilícita, mesmo sem metadado', () => {
  for (const nome of ['Sarin', 'Gás mostarda', 'Metanfetamina', 'Heroína', 'Fentanil', 'MDMA']) {
    const erros = errosCom((s) => {
      const p = clone().processos[0];
      s.processos.push({ ...p, id: 'proc_x', nome_pt: nome, produto_id: 'AAS_s' });
    });
    assert.ok(erros.some((e) => /espécie restrita/.test(e)), `${nome}: ${erros.join('\n')}`);
  }
});

test('validador reprova restrição absoluta (guerra/ilícita) com processo completo de qualquer tipo', () => {
  for (const restricao of ['agente_guerra', 'ilicita']) {
    const erros = errosCom((s) => {
      const p = s.processos.find((x) => x.id === 'sintese_aspirina');
      p.restricao = restricao;
    });
    assert.ok(erros.some((e) => /espécie restrita/.test(e)), `${restricao}: ${erros.join('\n')}`);
  }
  const erros = errosCom((s) => {
    const base = s.substancias.find((x) => x.id === 'AAS_s');
    base.restricao = 'agente_guerra';
  });
  assert.ok(erros.some((e) => /AAS_s/.test(e) && /educacional/.test(e)), erros.join('\n'));
});

test('validador reprova substância de guerra no catálogo e droga ilícita marcada como completa', () => {
  const guerra = errosCom((s) => { s.substancias.find((x) => x.id === 'H2O_l').nome_pt = 'Sarin'; });
  assert.ok(guerra.some((e) => /agente de guerra/.test(e)), guerra.join('\n'));
  const smiles = errosCom((s) => { s.substancias.find((x) => x.id === 'H2O_l').smiles = 'ClCCSCCCl'; });
  assert.ok(smiles.some((e) => /agente de guerra/.test(e)));
  const ilicita = errosCom((s) => { s.substancias.find((x) => x.id === 'H2O_l').nome_pt = 'Cocaína'; });
  assert.ok(ilicita.some((e) => /ilícita/.test(e)), ilicita.join('\n'));
});

test('validador reprova processo educacional ou indisponível com campo procedimental', () => {
  const edu = errosCom((s) => { s.processos.find((x) => x.id === 'sintese_tramadol').temp_max_c = 80; });
  assert.ok(edu.some((e) => /temp_max_c/.test(e)), edu.join('\n'));
  const ind = errosCom((s) => { s.processos.find((x) => x.id === 'sintese_losartana').rendimento_pc = 70; });
  assert.ok(ind.some((e) => /rendimento_pc/.test(e)), ind.join('\n'));
});

test('validador reprova nivel_conteudo inválido e espécie restrita marcada como completa', () => {
  assert.ok(errosCom((s) => { s.substancias[0].nivel_conteudo = 'livre'; }).some((e) => /nivel_conteudo/.test(e)));
  assert.ok(errosCom((s) => { const m = s.substancias.find((x) => x.id === 'C17H19NO3_s'); m.nivel_conteudo = 'completo'; }).some((e) => /educacional/.test(e)));
});

test('validador reprova proveniência incompleta, fonte não redistribuível e InChIKey ruim', () => {
  assert.ok(errosCom((s) => { delete s.substancias[0].props.massa_molar[0].s; }).some((e) => /fonte desconhecida/.test(e)));
  assert.ok(errosCom((s) => { s.substancias[0].props.massa_molar[0].c = 9; }).some((e) => /confiança/.test(e)));
  assert.ok(errosCom((s) => { s.substancias[0].props.massa_molar[0].d = 'ontem'; }).some((e) => /data/.test(e)));
  assert.ok(errosCom((s) => { s.substancias[0].props.massa_molar[0].u = ''; }).some((e) => /unidade/.test(e)));
  assert.ok(errosCom((s) => { s.fontes.curadoria_laift.redistribuivel = false; }).some((e) => /redistribuível/.test(e)));
  assert.ok(errosCom((s) => { s.substancias[0].inchikey = 'abc'; }).some((e) => /InChIKey/.test(e)));
  assert.ok(errosCom((s) => { s.substancias[1].inchikey = s.substancias[0].inchikey; }).some((e) => /repetido/.test(e)));
  assert.ok(errosCom((s) => { s.substancias[1].aliases.push({ id: s.substancias[0].aliases[0].id, fase: 's', label: 'x' }); }).some((e) => /id legado repetido/.test(e)));
});

test('validador reprova massa molar que não confere com a fórmula', () => {
  const erros = errosCom((s) => { s.substancias.find((x) => x.id === 'H2O_l').props.massa_molar[0].v = 99; });
  assert.ok(erros.some((e) => /não confere com a fórmula/.test(e)), erros.join('\n'));
});

// ---------- gerador determinístico (precisa do RDKit) ----------
function rdkitDisponivel() {
  const candidatos = [
    process.env.RDKIT_DIST,
    path.join(raiz, 'frontend/scripts/e2e/cdn-mirror/node_modules/@rdkit/rdkit/dist'),
    path.resolve(raiz, '../../../frontend/scripts/e2e/cdn-mirror/node_modules/@rdkit/rdkit/dist'),
  ].filter(Boolean);
  return candidatos.some((d) => fs.existsSync(path.join(d, 'RDKit_minimal.js')) && fs.existsSync(path.join(d, 'RDKit_minimal.wasm')));
}

test('gerador: reproduz o arquivo gravado (seed em dia com as fontes)', { skip: rdkitDisponivel() ? false : 'RDKit indisponível neste ambiente (defina RDKIT_DIST)' }, async () => {
  const { gerarSeed, serializar } = await import(pathToFileURL(path.join(raiz, 'tools/lab/gerar-seed.mjs')).href);
  const { seed: gerado } = await gerarSeed();
  assert.equal(serializar(gerado), lerLab('data/lab-seed.js'));
});
