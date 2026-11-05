/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O5: lista "Produtos" (ponto de extensão), página de Produtos e CQ (CSP, flag, sem DOM inseguro), dados de CQ,
// e as formulações no seed e no validador da O2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lab = path.join(raiz, 'frontend', 'modulos', 'laboratorio');
const ler = (rel) => fs.readFileSync(path.join(lab, rel), 'utf8');
const Reg = require(path.join(lab, 'js', 'lab-produtos-registro.js'));
const CQ = require(path.join(lab, 'js', 'lab-cq.js'));
const FC = require(path.join(lab, 'js', 'lab-farma-calculos.js'));
const { validarSeed, carregarSeed } = await import(pathToFileURL(path.join(raiz, 'tools/lab/validar-seed.mjs')).href);
const seed = carregarSeed();
const clone = () => JSON.parse(JSON.stringify(seed));
const procs = fs.readdirSync(path.join(lab, 'data/processos')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(ler('data/processos/' + f)));

// ── Lista Produtos ──────────────────────────────────────────────────────────
test('lista Produtos: cada item aponta para um processo existente e nenhum processo farmacotécnico ou de CQ fica de fora', () => {
  const ids = new Set(Reg.lista().map((p) => p.id));
  assert.equal(ids.size, Reg.lista().length, 'ids únicos');
  for (const item of Reg.lista()) {
    const p = procs.find((x) => x.id === item.id);
    assert.ok(p, item.id);
    assert.equal(p.titulo, item.titulo);
    assert.equal(p.forma || 'solucao', item.forma);
    assert.ok(Reg.SETORES[item.setor], item.setor);
  }
  for (const p of procs.filter((x) => x.categoria === 'farmacotecnica' || x.categoria === 'cq')) assert.ok(ids.has(p.id), `${p.id} fora da lista`);
  assert.equal(Reg.buscar('proc_xarope_simples_v1').setor, 'farmacotecnica');
  assert.equal(Reg.buscar('nao_existe'), null);
  assert.ok(Object.values(Reg.porSetor()).every((l) => Array.isArray(l)));
});

test('flag labProdutos: desligada por padrão; liga e desliga pela URL', () => {
  assert.equal(Reg.flagLigada(''), false);
  assert.equal(Reg.flagLigada('?flags=labProdutos'), true);
  assert.equal(Reg.flagLigada('?flags=outra,labProdutos'), true);
  assert.equal(Reg.flagLigada('?flags=labProdutos,-labProdutos'), false);
});

// ── Página ──────────────────────────────────────────────────────────────────
test('página de Produtos: CSP sem inline e rede externa, sem innerHTML nem eval, com cabeçalho de licença', () => {
  const html = ler('produtos/index.html');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /style-src 'self'/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(html));
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), 'sem script inline');
  assert.ok(!/\sstyle=|\son[a-z]+=/i.test(html), 'sem estilo ou evento inline');
  assert.ok(!/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'sem URL externa');
  const js = ler('produtos/produtos.js');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/.test(js));
  for (const f of ['produtos/produtos.js', 'produtos/produtos.css', 'js/lab-produtos-registro.js', 'js/lab-cq.js', 'js/lab-farma-calculos.js']) assert.match(ler(f), /© 2026 Daniel Pires Francisco/, f);
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (m[1].startsWith('../../shared/')) continue;
    assert.ok(fs.existsSync(path.join(lab, 'produtos', m[1])), `recurso inexistente: ${m[1]}`);
  }
});

test('página de Produtos: sem a flag mostra só o aviso; com a flag monta as abas (DOM simulado mínimo)', () => {
  function el(tag) {
    const e = { tag, children: [], attrs: {}, listeners: {}, className: '', _text: '' };
    e.appendChild = (c) => { e.children.push(c); return c; };
    e.removeChild = (c) => { e.children.splice(e.children.indexOf(c), 1); return c; };
    Object.defineProperty(e, 'firstChild', { get: () => e.children[0] || null });
    e.setAttribute = (k, v) => { e.attrs[k] = v; };
    e.addEventListener = (t, f) => { e.listeners[t] = f; };
    e.querySelector = () => null;
    e.scrollIntoView = () => {};
    Object.defineProperty(e, 'textContent', { get: () => e._text, set: (v) => { e._text = v; e.children = []; } });
    return e;
  }
  function rodar(search) {
    const raizEl = el('main');
    const janela = { location: { search }, LabProdutos: Reg, LabCq: CQ, LabFarmaCalculos: FC };
    const doc = { getElementById: (id) => (id === 'prRaiz' ? raizEl : null), createElement: el, createTextNode: (t) => ({ texto: t }) };
    vm.runInNewContext(ler('produtos/produtos.js'), { window: janela, document: doc, URLSearchParams, fetch: () => Promise.reject(new Error('sem rede')), console });
    return raizEl;
  }
  const desligada = rodar('');
  assert.equal(desligada.children.length, 1);
  assert.match(desligada.children[0].textContent, /ainda não está disponível/);
  const ligada = rodar('?flags=labProdutos');
  assert.ok(ligada.children.length >= 1);
  const abas = JSON.stringify(ligada);
  for (const t of ['Produtos', 'Controle de qualidade', 'Cálculos']) assert.ok(abas.includes(t), t);
});

// ── Dados de CQ ─────────────────────────────────────────────────────────────
test('dados de CQ: cada ensaio tem método, cálculo, critério, erro comum com consequência e fonte citada; funções existem', () => {
  const d = JSON.parse(ler('data/cq/ensaios.json'));
  assert.ok(d.ensaios.length >= 10);
  assert.match(d.conferencia.nota, /\[NV\]/);
  const ids = new Set();
  for (const e of d.ensaios) {
    assert.ok(!ids.has(e.id)); ids.add(e.id);
    for (const k of ['nome', 'oQueMede', 'calculo', 'criterio', 'referencia', 'funcao']) assert.ok(e[k] && e[k].length > 1, `${e.id}.${k}`);
    assert.ok(e.metodo.length >= 2 && e.errosComuns.length >= 1);
    e.errosComuns.forEach((x) => assert.ok(x.erro && x.consequencia));
    assert.ok(e.referencia.length < 220, 'citação curta, sem reproduzir o texto da norma');
    assert.ok(e.formas.length >= 1);
    const f = e.funcao;
    assert.ok(typeof CQ[f] === 'function' || typeof FC[f] === 'function', `função ${f}`);
    const publico = JSON.stringify({ ...e });
    assert.ok(!/\[NV\]|rascunho|revisad|\bIA\b/i.test(publico), e.id);
  }
  for (const necessario of ['peso_medio', 'uniformidade', 'ph', 'viscosidade', 'teor_titulacao', 'desintegracao', 'dissolucao', 'limite_microbiano']) assert.ok(ids.has(necessario), necessario);
});

// ── Seed e validador da O2 ──────────────────────────────────────────────────
test('seed: o seed com formulações passa no validador; cada processo O5 tem formulação e cada ingrediente resolve', () => {
  assert.deepEqual(validarSeed(seed), []);
  const forms = seed.formulacoes;
  const comFormulacao = procs.filter((p) => p.formulacao);
  assert.equal(forms.length, comFormulacao.length);
  const alias = new Set(seed.substancias.flatMap((s) => s.aliases.map((a) => a.id)));
  const excip = new Set(seed.excipientes.map((x) => x.id));
  for (const f of forms) {
    assert.ok(f.fontes_oficiais.length >= 1 && f.cq.length >= 1, f.id);
    for (const i of f.itens) assert.ok(alias.has(seed.mapa_ingredientes[i.ingrediente] || i.ingrediente) || excip.has(i.ingrediente), `${f.id}: ${i.ingrediente}`);
  }
  assert.ok(forms.every((f) => f.nivel_conteudo === 'completo' && f.restricao === null && f.revisado_por === null));
});

test('seed: o validador reprova formulação sem fonte oficial, com ingrediente restrito ou desconhecido, e excipiente restrito', () => {
  const com = (fn) => { const s = clone(); fn(s); return validarSeed(s); };
  assert.ok(com((s) => { s.formulacoes[0].fontes_oficiais = []; }).some((e) => /fonte oficial/.test(e)));
  assert.ok(com((s) => { s.formulacoes[0].itens.push({ ingrediente: 'Inexistente_s', funcao: 'x', quantidade: 1, unidade: 'g' }); }).some((e) => /fora do catálogo/.test(e)));
  assert.ok(com((s) => { s.formulacoes[0].nivel_conteudo = 'educacional'; }).some((e) => /precisa ser 'completo'/.test(e)));
  assert.ok(com((s) => { s.formulacoes[0].itens.push({ ingrediente: 'C17H19NO3_s', funcao: 'x', quantidade: 1, unidade: 'g' }); }).every((e) => !/ingrediente C17H19NO3_s fora/.test(e)));
  assert.ok(com((s) => { s.excipientes.push({ id: 'Sarin_l', nome_pt: 'Sarin', natureza: 'mistura', nivel_conteudo: 'completo', restricao: null, fonte: 'curadoria_laift' }); }).some((e) => /restrita/.test(e)));
  assert.ok(com((s) => { s.formulacoes[0].cq = []; }).some((e) => /controle de qualidade/.test(e)));
  assert.ok(com((s) => { s.formulacoes[0].itens[0].quantidade = 0; }).some((e) => /quantidade/.test(e)));
});

test('seed: valores de quantidade da formulação batem com o processo (fonte única)', () => {
  for (const f of seed.formulacoes) {
    const p = procs.find((x) => x.id === f.id);
    assert.equal(f.itens.length, p.formulacao.itens.length);
    f.itens.forEach((i, k) => assert.equal(i.quantidade, p.formulacao.itens[k].quantidade.valor));
    assert.equal(f.nome_pt, p.titulo);
  }
});
