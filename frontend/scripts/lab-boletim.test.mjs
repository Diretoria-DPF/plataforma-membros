/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O8: boletim pessoal por competência (aparelho), a partir dos eventos 'lab:competencia' do tutor.
// A rubrica (D-4) é DADO em trilha_v1.json (`boletim`) e é proposta: a decisão final é do dono.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB = path.join(RAIZ, 'modulos/laboratorio');
const B = require('../modulos/laboratorio/js/lab-boletim.js');
const T = require('../modulos/laboratorio/js/lab-tutor.js');
const { ESPECIES } = require('../modulos/laboratorio/js/lab-motor-especies.js');
const TRILHA = JSON.parse(fs.readFileSync(path.join(LAB, 'data/trilha/trilha_v1.json'), 'utf8'));
const NACL = JSON.parse(fs.readFileSync(path.join(LAB, 'data/processos/proc_nacl_09_v1.json'), 'utf8'));
const M1 = TRILHA.missoes.find((m) => m.id === 'm1_nacl_09');
const R = TRILHA.boletim;
const ctx = { especies: ESPECIES };

const ev = (competencia, resultado, ajuda = 'completa') => ({ tipo: 'competencia', missao: 'm1_nacl_09', competencia, resultado, ajuda });
const varios = (b, lista) => lista.reduce((acc, e) => B.registrar(acc, e, R), b);
const nivelDe = (b, g) => B.resumo(b, R).find((x) => x.id === g).nivel;

test('rubrica em dados: todo grupo tem nome e fontes, e cada competência da trilha cai em exatamente um grupo', () => {
  assert.deepEqual(B.validarRubrica(TRILHA), []);
  assert.deepEqual(Object.keys(R.grupos).sort(), ['calculo', 'desvio', 'qualidade', 'registro', 'seguranca', 'tecnica']);
  const erros = B.validarRubrica({ ...TRILHA, boletim: { ...R, grupos: { ...R.grupos, extra: { nome: 'x', fontes: ['pesagem'], minimo: 1 } } } });
  assert.ok(erros.some((e) => /pesagem/.test(e)), 'competência em dois grupos é recusada');
  assert.ok(B.validarRubrica({ competencias: { a: 'A' }, boletim: R }).length > 0, 'competência sem grupo é recusada');
});

test('registrar: imutável, soma por grupo, ignora evento inválido e competência desconhecida', () => {
  const b0 = B.vazio();
  const b1 = B.registrar(b0, ev('biosseguranca', 'acerto'), R);
  assert.notEqual(b1, b0);
  assert.deepEqual(b0, B.vazio(), 'o original não muda');
  assert.equal(b1.c.seguranca.acertos, 1);
  const b2 = varios(b1, [ev('residuos', 'erro'), ev('pesagem', 'dica'), ev('volumetria', 'pulado'), ev('cq', 'fora_de_ordem')]);
  assert.equal(b2.c.seguranca.erros, 1);
  assert.equal(b2.c.tecnica.dicas, 1);
  assert.equal(b2.c.tecnica.pulos, 1);
  assert.equal(b2.c.qualidade.foraDeOrdem, 1);
  for (const ruim of [null, {}, ev('inexistente', 'acerto'), ev('cq', 'qualquer'), { ...ev('cq', 'acerto'), tipo: 'outro' }, 'texto']) {
    assert.deepEqual(B.registrar(b2, ruim, R), b2);
  }
});

test('acerto na Prova conta como "sem apoio"; com ajuda, não', () => {
  const b = varios(B.vazio(), [ev('pesagem', 'acerto', 'prova'), ev('pesagem', 'acerto', 'completa'), ev('pesagem', 'acerto', 'dica')]);
  assert.equal(b.c.tecnica.acertos, 3);
  assert.equal(b.c.tecnica.semApoio, 1);
});

test('proficiência: sem registro, iniciando, em desenvolvimento, proficiente; domínio exige acertos sem apoio', () => {
  assert.equal(nivelDe(B.vazio(), 'tecnica'), 'sem_registro');
  assert.equal(nivelDe(varios(B.vazio(), [ev('pesagem', 'acerto')]), 'tecnica'), 'iniciando', 'abaixo do mínimo de tentativas');
  const meio = varios(B.vazio(), [ev('pesagem', 'acerto'), ev('pesagem', 'erro'), ev('pesagem', 'acerto'), ev('pesagem', 'erro')]);
  assert.equal(nivelDe(meio, 'tecnica'), 'em_desenvolvimento');
  const bom = varios(B.vazio(), Array(5).fill(ev('pesagem', 'acerto')).concat(ev('pesagem', 'erro')));
  assert.equal(nivelDe(bom, 'tecnica'), 'proficiente');
  const tudo = varios(B.vazio(), Array(10).fill(ev('pesagem', 'acerto')));
  assert.equal(nivelDe(tudo, 'tecnica'), 'proficiente', 'sem acertos na Prova não passa de proficiente');
  assert.equal(nivelDe(varios(tudo, Array(2).fill(ev('pesagem', 'acerto', 'prova'))), 'tecnica'), 'dominio');
  const comDicas = varios(B.vazio(), Array(4).fill(ev('pesagem', 'acerto', 'prova')).concat(Array(4).fill(ev('pesagem', 'dica'))));
  assert.notEqual(nivelDe(comDicas, 'tecnica'), 'dominio', 'dicas pesam');
});

test('resumo: sem nota, sem posição, sem comparação; texto neutro', () => {
  const lista = B.resumo(varios(B.vazio(), [ev('pesagem', 'acerto'), ev('pesagem', 'acerto', 'prova')]), R);
  assert.equal(lista.length, 6);
  for (const g of lista) {
    assert.deepEqual(Object.keys(g).sort(), ['acertos', 'erros', 'id', 'nivel', 'nome', 'rotulo', 'semApoio', 'tentativas', 'texto']);
    assert.match(g.texto, /\S/);
    assert.doesNotMatch(JSON.stringify(g), /nota|ranking|posi[cç][aã]o|revisad|rascunho|\bIA\b|\[NV\]/i);
  }
  const t = lista.find((g) => g.id === 'tecnica');
  assert.equal(t.acertos, 2);
  assert.equal(t.semApoio, 1);
});

test('guarda no aparelho: ida e volta, lixo normalizado, armazenamento quebrado não derruba', () => {
  const mem = new Map();
  const arm = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, v); }, removeItem: (k) => { mem.delete(k); } };
  const b = varios(B.vazio(), [ev('pesagem', 'acerto'), ev('cq', 'erro')]);
  assert.equal(B.salvar(arm, b), true);
  assert.deepEqual(B.ler(arm), b);
  mem.set(B.CHAVE, '{"v":1,"c":{"tecnica":{"acertos":-5,"erros":"x","dicas":1e99},"../x":{"acertos":1},"qualidade":7}}');
  const sujo = B.ler(arm);
  assert.deepEqual(Object.keys(sujo.c), ['tecnica']);
  assert.equal(sujo.c.tecnica.acertos, 0);
  assert.equal(sujo.c.tecnica.erros, 0);
  assert.ok(sujo.c.tecnica.dicas <= 100000);
  mem.set(B.CHAVE, 'não é json');
  assert.deepEqual(B.ler(arm), B.vazio());
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
  assert.deepEqual(B.ler(quebrado), B.vazio());
  assert.equal(B.salvar(quebrado, b), false);
  assert.deepEqual(B.ler(null), B.vazio());
  assert.equal(B.apagar(quebrado), false);
  B.salvar(arm, b);
  assert.equal(B.apagar(arm), true);
  assert.deepEqual(B.ler(arm), B.vazio());
});

test('integração: a Missão 1 jogada no tutor alimenta o boletim sem inventar competência', () => {
  const ROT = { produto: 'Solução de cloreto de sódio', concentracao: '0,9 % p/v', lote: 'L01', fabricacao: '05/11/2026', validade: '30 dias', responsavel: 'Turma A' };
  const passos = [
    ['painelSeguranca', { epi: ['jaleco', 'luvas_nitrila', 'oculos'] }], ['balancaTara', {}], ['reagente:NaCl_s', { massaG: '0,90' }, '0,9'],
    ['reagente:H2O_l', { volumeMl: '70', vidraria: 'proveta' }], ['btnAgitar', { tempoMin: '3', agitacao: true }], ['btnTransferir', { enxague: true }],
    ['btnAvolumar', { volumeFinalMl: '100' }], ['btnAgitar', { tempoMin: '5', agitacao: true }], ['phmetroCalibrar', { tampoes: ['4', '7'] }],
    ['phmetro', {}, '308'], ['btnEnvasar', {}], ['painelRotulo', ROT], ['painelDescarte', { destino: 'pia' }]
  ];
  let t = T.criar(NACL, M1, ctx, { semente: 5, ajuda: { ligada: true, nivel: 'prova' } });
  for (const [alvo, valores, resposta] of passos) t = T.agir(t, NACL, ctx, { alvo, valores, resposta }).tutor;
  const b = varios(B.vazio(), t.competencias);
  const r = Object.fromEntries(B.resumo(b, R).map((g) => [g.id, g]));
  assert.ok(r.seguranca.acertos >= 2 && r.calculo.acertos === 2 && r.tecnica.acertos > 0 && r.registro.acertos >= 1);
  assert.equal(r.desvio.tentativas, 0, 'sem investigação, sem registro de desvio');
  assert.ok(Object.values(r).every((g) => g.erros === 0));
  assert.equal(r.tecnica.semApoio, r.tecnica.acertos, 'tudo na Prova');
});

test('conta (só contrato): as colunas da migração 055 são os contadores do boletim, e a flag nasce desligada', () => {
  const up = fs.readFileSync(path.join(RAIZ, '../sql/055_lab_boletim.sql'), 'utf8');
  const down = fs.readFileSync(path.join(RAIZ, '../sql/down/055_lab_boletim.sql'), 'utf8');
  for (const col of B.COLUNAS_CONTA) assert.match(up, new RegExp(`\\b${col}\\b`), `coluna ${col}`);
  assert.match(up, /laift_enable_rls\('lab_boletim_competencia'::regclass\)/);
  assert.match(up, /lab_boletim_conta_enabled', FALSE/);
  assert.match(up, /ON DELETE CASCADE/);
  assert.match(down, /DROP TABLE IF EXISTS lab_boletim_competencia/);
  const linhas = B.paraConta(varios(B.vazio(), [ev('pesagem', 'acerto'), ev('cq', 'erro')]));
  assert.deepEqual(linhas.map((l) => l.competencia).sort(), ['qualidade', 'tecnica']);
  assert.deepEqual(Object.keys(linhas[0]).sort(), ['competencia'].concat(B.COLUNAS_CONTA).sort());
});

test('nenhum código do boletim envia dados: sem fetch, XHR, beacon, WebSocket nem innerHTML', () => {
  for (const f of ['lab-boletim.js', 'lab-boletim-ui.js']) {
    const src = fs.readFileSync(path.join(LAB, 'js', f), 'utf8');
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|innerHTML|insertAdjacentHTML|document\.write/, f);
  }
});
