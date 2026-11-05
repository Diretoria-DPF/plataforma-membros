/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Descoberta de moléculas no Estúdio 3D (O7): portão de segurança, análogos por
// reação estrutural e comparação com a original. Os testes com RDKit real são
// PULADOS (com aviso) se o espelho do npm não estiver disponível; os de regra
// pura sempre rodam. RDKIT_DIST=<pasta dist> aponta para um RDKit já instalado.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = path.join(frontend, 'modulos/laboratorio');
const core = require(path.join(lab, 'studio/chem-core.js'));
const desc = require(path.join(lab, 'studio/descoberta-core.js'));
const seed = require(path.join(lab, 'data/lab-seed.js'));
const { checkSafety } = await import(pathToFileURL(path.resolve(frontend, '../worker/src/ai/safetyBlocklist.js')).href);

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
    console.warn('[estudio-descoberta] RDKit indisponível: testes com WASM pulados (rodar npm i em scripts/e2e/cdn-mirror ou definir RDKIT_DIST).');
    return;
  }
  const init = require(path.join(dist, 'RDKit_minimal.js'));
  R = await init({ locateFile: (f) => path.join(dist, f) });
});
const comRDKit = (nome, fn) => test(nome, async (t) => {
  if (!R) { t.skip('RDKit WASM indisponível'); return; }
  await fn(t);
});

const AAS = { id: 'AAS', chaveOriginal: 'AAS_s', nome: 'Ácido Acetilsalicílico (Aspirina)', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O' };
const PARACETAMOL = { id: 'Paracetamol', nome: 'Paracetamol', smiles: 'CC(=O)NC1=CC=C(O)C=C1' };
const IBUPROFENO = { id: 'Ibuprofeno', nome: 'Ibuprofeno', smiles: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O' };
const CAFEINA = { id: 'Cafeina', nome: 'Cafeína', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C' };

// ─── Portão: seed e nomes (sem RDKit) ─────────────────────────────────────
test('portão: toda substância educacional, restrita ou controlada do seed é negada', () => {
  const restritas = seed.substancias.filter((s) => s.nivel_conteudo !== 'completo' || s.restricao || s.controlado_br);
  assert.ok(restritas.length >= 4, 'o seed deveria ter ao menos 4 substâncias restritas');
  for (const s of restritas) {
    const porId = desc.avaliarPermissao({ id: s.aliases[0].id, nome: s.nome_pt, smiles: s.smiles }, seed, null);
    assert.equal(porId.permitido, false, `${s.id} (por id) deveria ser negada`);
    const porSmiles = desc.avaliarPermissao({ id: 'deriv_1', nome: 'sem nome', smiles: s.smiles_canon || s.smiles }, seed, null);
    assert.equal(porSmiles.permitido, false, `${s.id} (por SMILES) deveria ser negada`);
    const porNome = desc.avaliarPermissao({ id: 'x', nome: s.nome_pt, smiles: 'C' }, seed, null);
    assert.equal(porNome.permitido, false, `${s.id} (por nome) deveria ser negada`);
  }
});

test('portão: o motivo é educativo e não revela rota', () => {
  const r = desc.avaliarPermissao({ id: 'C17H19NO3_s', nome: 'Morfina', smiles: 'CN1CCC23C4C1CC5=C2C(=C(C=C5)O)OC3C(C=C4)O' }, seed, null);
  assert.equal(r.permitido, false);
  assert.match(r.motivo, /não gera análogos/);
  assert.doesNotMatch(r.motivo, /rota|reagente|dose/i);
});

test('portão: substâncias comuns do catálogo seguem permitidas (sem RDKit)', () => {
  for (const c of [AAS, PARACETAMOL, IBUPROFENO, CAFEINA]) {
    assert.equal(desc.avaliarPermissao(c, seed, null).permitido, true, c.nome);
  }
});

test('portão: o derivado herda o bloqueio pelo nome do original', () => {
  const r = desc.avaliarPermissao({ id: 'deriv_1', nome: 'Sarin [Fluorização]', smiles: 'C' }, seed, null);
  assert.equal(r.permitido, false);
  assert.equal(r.codigo, 'nome_bloqueado');
});

test('portão: cada termo da lista do cliente também é bloqueado pelo Worker (agentes e ilícitos)', () => {
  const faltando = [];
  for (const t of desc.TERMOS_AGENTES) if (!checkSafety({ term: t }).blocked) faltando.push(t);
  for (const t of desc.TERMOS_ILICITOS) if (!checkSafety({ term: t }).blocked) faltando.push(t);
  assert.deepEqual(faltando, []);
});

test('portão: os termos de nome bloqueiam sem acento e em maiúsculas', () => {
  assert.equal(desc.termoBloqueado('FENTANIL citrato'), 'fentanil');
  assert.equal(desc.termoBloqueado('Heroína'), 'heroina');
  assert.equal(desc.termoBloqueado('Aspirina'), null);
  assert.equal(desc.termoBloqueado('Cocainamida'), null, 'palavra inteira, não trecho');
});

test('portão: sem composto selecionado, nega com mensagem', () => {
  assert.equal(desc.avaliarPermissao(null, seed, null).permitido, false);
});

// ─── Portão estrutural (RDKit) ────────────────────────────────────────────
comRDKit('portão estrutural: classes de agentes e opioides são bloqueadas por SMILES livre', () => {
  const bloqueadas = {
    organofosforado_guerra: 'CC(C)OP(C)(=O)F',
    mostarda_enxofre: 'ClCCSCCCl',
    mostarda_nitrogenada: 'ClCCN(C)CCCl',
    anilidopiperidina: 'CCC(=O)N(c1ccccc1)C1CCN(CC1)CCc1ccccc1',
    morfinano: 'CN1CCC23C4C1CC5=C2C(=C(C=C5)O)OC3C(C=C4)O',
    ergolina: 'CCN(CC)C(=O)C1C=C2c3cccc4[nH]cc(c34)CC2N(C)C1',
    feniletilamina_alfa_metil: 'CC(N)Cc1ccccc1',
    organoarsenico: 'Cl[As](Cl)C=CCl',
  };
  for (const [classe, smiles] of Object.entries(bloqueadas)) {
    const r = desc.avaliarPermissao({ id: 'livre', nome: 'estrutura livre', smiles }, seed, R);
    assert.equal(r.permitido, false, `${classe} (${smiles}) deveria ser bloqueada`);
  }
});

comRDKit('portão estrutural: fármacos comuns não são bloqueados por engano', () => {
  const ok = [AAS, PARACETAMOL, IBUPROFENO, CAFEINA,
    { id: 'a', nome: 'Salicilato', smiles: 'O=C(O)c1ccccc1O' },
    { id: 'b', nome: 'Glicose', smiles: 'OCC1OC(O)C(O)C(O)C1O' },
    { id: 'c', nome: 'Diazepam sem cadastro', smiles: 'CN1C(=O)CN=C(c2ccccc2)c2cc(Cl)ccc21' }];
  for (const c of ok) assert.equal(desc.avaliarPermissao(c, seed, R).permitido, true, c.nome);
});

// ─── Geração de análogos ─────────────────────────────────────────────────
comRDKit('análogos: a aspirina gera ideias válidas, distintas e sem o original', () => {
  const r = desc.gerarAnalogos(R, core, AAS, { seed });
  assert.equal(r.permitido, true);
  assert.ok(r.analogos.length >= 3, 'esperava ao menos 3 análogos');
  const smis = r.analogos.map((a) => a.smiles);
  assert.equal(new Set(smis).size, smis.length, 'sem duplicatas');
  const orig = R.get_mol(AAS.smiles); const origSmi = orig.get_smiles(); orig.delete();
  for (const a of r.analogos) {
    assert.notEqual(a.smiles, origSmi);
    const m = R.get_mol(a.smiles);
    assert.ok(m && m.is_valid(), `SMILES inválido: ${a.smiles}`);
    m.delete();
    assert.ok(a.nome && a.esquema && a.descricao && a.transformacaoId);
    assert.ok(a.massa > 0 && a.formula);
  }
});

comRDKit('análogos: moléculas com vários sítios aromáticos oferecem mais de um, com limite por transformação', () => {
  const r = desc.gerarAnalogos(R, core, IBUPROFENO, { seed, porTransformacao: 2, maximo: 20 });
  const fluor = r.analogos.filter((a) => a.transformacaoId === 'fluorizacao_aromatica');
  assert.equal(fluor.length, 2, 'limite por transformação respeitado');
  assert.deepEqual(fluor.map((a) => a.sitio), [1, 2]);
});

comRDKit('análogos: o máximo total é respeitado', () => {
  const r = desc.gerarAnalogos(R, core, IBUPROFENO, { seed, maximo: 5 });
  assert.ok(r.analogos.length <= 5);
});

comRDKit('análogos: nada é gerado para substância do seed negada nem para classe estrutural bloqueada', () => {
  const morfina = { id: 'C17H19NO3_s', nome: 'Morfina', smiles: 'CN1CCC23C4C1CC5=C2C(=C(C=C5)O)OC3C(C=C4)O' };
  const a = desc.gerarAnalogos(R, core, morfina, { seed });
  assert.equal(a.permitido, false);
  assert.deepEqual(a.analogos, []);
  const livre = desc.gerarAnalogos(R, core, { id: 'z', nome: 'livre', smiles: 'CCC(=O)N(c1ccccc1)C1CCN(CC1)CCc1ccccc1' }, { seed });
  assert.equal(livre.permitido, false);
  assert.deepEqual(livre.analogos, []);
});

comRDKit('análogos: produto que cai em classe bloqueada é descartado', () => {
  // Fenilacetona/benzilamina: a N-acetilação não pode produzir amida bloqueada nem o contrário; aqui só garantimos
  // que nenhum produto devolvido casa com as classes bloqueadas.
  const r = desc.gerarAnalogos(R, core, { id: 'q', nome: 'fenilpropilamina', smiles: 'NCCCc1ccccc1' }, { seed });
  for (const a of r.analogos) assert.equal(desc.estruturaBloqueada(R, a.smiles), null, a.smiles);
});

comRDKit('análogos: cada transformação nova funciona e é única por sítio', () => {
  const t = core.aplicarBioisosterismoTodos(R, 'Cc1ccc(Cl)cc1', 'cloro_fluor_aromatico', 3);
  assert.equal(t.ok, true);
  assert.equal(t.produtos.length, 1);
  assert.equal(t.produtos[0].smiles, 'Cc1ccc(F)cc1');
  const cf3 = core.aplicarBioisosterismoTodos(R, 'Cc1ccccc1', 'metila_trifluormetila', 3);
  assert.equal(cf3.produtos[0].smiles, 'FC(F)(F)c1ccccc1');
  const pir = core.aplicarBioisosterismoTodos(R, 'c1ccccc1C(C)=O', 'benzeno_piridina', 5);
  assert.ok(pir.produtos.length >= 3);
  for (const p of pir.produtos) assert.ok(/n/.test(p.smiles));
});

comRDKit('análogos: aplicarBioisosterismo (um sítio) segue igual', () => {
  assert.equal(core.aplicarBioisosterismo(R, 'CC(=O)O', 'amidacao_primaria').smiles, 'CC(N)=O');
  assert.equal(core.aplicarBioisosterismo(R, 'Cc1ccccc1', 'fluorizacao_aromatica').ok, false, 'vários sítios: sem escolha segura');
});

// ─── Comparação e perfil por regras (sem RDKit) ──────────────────────────
const PROPS_A = { mw: 180.16, logp: 1.31, tpsa: 63.6, hbd: 1, hba: 3, rotb: 3, alertasEstruturais: [] };

test('comparação: calcula deltas e leituras em texto', () => {
  const B = { mw: 198.15, logp: 1.58, tpsa: 63.6, hbd: 1, hba: 3, rotb: 3, alertasEstruturais: [] };
  const c = desc.compararMoleculas(PROPS_A, B);
  const mw = c.linhas.find((l) => l.chave === 'mw');
  assert.ok(Math.abs(mw.delta - 17.99) < 0.01);
  assert.equal(mw.leitura, 'mais pesado');
  assert.equal(c.linhas.find((l) => l.chave === 'logp').leitura, 'mais lipofílico');
  assert.equal(c.linhas.find((l) => l.chave === 'tpsa').leitura, 'quase igual');
  assert.equal(c.linhas.length, 6);
});

test('comparação: Lipinski e Veber por critério, sem estimar dado ausente', () => {
  const grande = { mw: 620, logp: 6.2, tpsa: 160, hbd: 2, hba: 12, rotb: 12, alertasEstruturais: [] };
  const c = desc.compararMoleculas(PROPS_A, grande);
  assert.equal(c.lipinski.original.violacoes, 0);
  assert.equal(c.lipinski.original.conforme, true);
  assert.equal(c.lipinski.analogo.violacoes, 3);
  assert.equal(c.lipinski.analogo.conforme, false);
  assert.equal(c.veber.analogo.violacoes, 2);
  assert.match(c.resumo.join(' '), /Lipinski: 0 ➔ 3/);
  const semDado = desc.perfilPorRegras({ mw: 300 });
  assert.equal(semDado.lipinski.disponivel, false);
  assert.equal(semDado.lipinski.conforme, null);
});

test('comparação: alertas estruturais novos, removidos e mantidos', () => {
  const a = { ...PROPS_A, alertasEstruturais: [{ nome: 'Catecol' }, { nome: 'Aldeído' }] };
  const b = { ...PROPS_A, alertasEstruturais: [{ nome: 'Aldeído' }, { nome: 'Nitroaromático' }] };
  const c = desc.compararMoleculas(a, b);
  assert.deepEqual(c.alertas.novos, ['Nitroaromático']);
  assert.deepEqual(c.alertas.removidos, ['Catecol']);
  assert.deepEqual(c.alertas.mantidos, ['Aldeído']);
  assert.match(c.resumo.join(' '), /Novo alerta estrutural: Nitroaromático/);
});

test('comparação: sem mudanças, o resumo diz isso', () => {
  const c = desc.compararMoleculas(PROPS_A, { ...PROPS_A });
  assert.deepEqual(c.resumo, ['Sem mudança nas regras de triagem nem nos alertas estruturais.']);
});

test('linguagem: alertas nunca são chamados de PAINS; o aviso é educacional e neutro', () => {
  const c = desc.compararMoleculas(PROPS_A, PROPS_A);
  const textos = JSON.stringify(c) + desc.AVISO_EDUCACIONAL;
  assert.doesNotMatch(textos, /PAINS/);
  assert.match(c.aviso, /sem rota de síntese e sem dose/);
  assert.doesNotMatch(textos, /rascunho|revisad|gerado por IA|\bIA\b/i);
});

// ─── Integração com a página ────────────────────────────────────────────
test('página: scripts carregam na ordem, sem script inline, e o seed só é buscado sob demanda', () => {
  const html = fs.readFileSync(path.join(lab, 'studio/index.html'), 'utf8');
  assert.match(html, /<script src="chem-core\.js"><\/script>[\s\S]*<script src="descoberta-core\.js"><\/script>[\s\S]*<script src="studio\.js">/);
  assert.match(html, /<script src="descoberta-ui\.js"><\/script>/);
  assert.doesNotMatch(html, /<script src="\.\.\/data\/lab-seed\.js"/, 'o seed (119 KB) não entra no carregamento inicial');
  const semComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(semComentarios, /<script(?![^>]*\bsrc=)[^>]*>\s*\S/, 'sem script inline');
  assert.match(html, /id="analogosModal"/);
  assert.match(html, /data-action="abrirPainelAnalogos"/);
});

test('página: o painel de análogos usa só ações da lista fechada de studio-ui.js', () => {
  const ui = fs.readFileSync(path.join(lab, 'studio/studio-ui.js'), 'utf8');
  const dui = fs.readFileSync(path.join(lab, 'studio/descoberta-ui.js'), 'utf8');
  const html = fs.readFileSync(path.join(lab, 'studio/index.html'), 'utf8');
  const usadas = new Set([...dui.matchAll(/data-action="([A-Za-z0-9_]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/data-action="([A-Za-z0-9_]+)"/g)) usadas.add(m[1]);
  for (const a of usadas) assert.ok(ui.includes(`'${a}'`), `ação ${a} ausente da lista de studio-ui.js`);
  assert.doesNotMatch(dui, /onclick=|innerHTML\s*=/, 'sem handlers inline nem innerHTML cru');
});

test('página: os portões do painel de bioisosterismo e das transformações existentes chamam o portão', () => {
  const js = fs.readFileSync(path.join(lab, 'studio/studio.js'), 'utf8');
  assert.match(js, /window\.LaiftDescobertaUI/);
  assert.equal((js.match(/await podeGerarDerivados\(\)/g) || []).length, 4, 'substituição, adição, painel e transformação');
});
