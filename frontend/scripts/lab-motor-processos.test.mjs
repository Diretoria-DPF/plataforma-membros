/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Motor do Laboratório (O3): executor de processo em JSON, condições sem eval e validador com trava de conteúdo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const P = require('../modulos/laboratorio/js/lab-motor-processo.js');
const V = require('../modulos/laboratorio/js/lab-motor-validador.js');
const Cd = require('../modulos/laboratorio/js/lab-motor-condicoes.js');
const E = require('../modulos/laboratorio/js/lab-motor-estado.js');
const K = require('../modulos/laboratorio/js/lab-motor-caderno.js');
const { ESPECIES } = require('../modulos/laboratorio/js/lab-motor-especies.js');

const O2 = await import('../../tools/lab/validar-seed.mjs');
const SEED = require('../modulos/laboratorio/data/lab-seed.js');
const OPCOES_O2 = { especies: ESPECIES, nomesVetados: [O2.NOMES_GUERRA, O2.NOMES_ILICITAS] };
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../modulos/laboratorio/data/processos');
const ctx = { especies: ESPECIES };
const carregar = (arq) => JSON.parse(fs.readFileSync(path.join(DIR, arq), 'utf8'));
const NACL = carregar('proc_nacl_09_v1.json');
const copia = (o) => JSON.parse(JSON.stringify(o));
const RESPOSTAS = { e2: '0,90', e7: '308' };
const aprox = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} obtido ${a}, esperado ${b} ±${tol}`);

function fechaBalanco(s) {
  const b = s.balanco;
  aprox(E.massaTotal(s, ESPECIES) + b.perdas_g + b.evaporado_g + b.descartado_g + b.amostras_g + b.reacao_g, b.entradas_g, 1e-6, 'balanço');
}

// ── Validador ────────────────────────────────────────────────────────────────

test('validador: todo processo em data/processos/*.json é válido (gate de CI)', () => {
  const arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
  assert.ok(arquivos.length >= 1);
  for (const f of arquivos) {
    const r = V.validarProcesso(carregar(f), OPCOES_O2);
    assert.deepEqual(r.erros, [], f);
    assert.equal(carregar(f).id + '.json', f, 'nome do arquivo = id');
  }
});

test('validador: forma — operação, espécie, recipiente, condição e cálculo inválidos são apontados', () => {
  const p = copia(NACL);
  p.etapas[0].acao = { operacao: 'teleportar', parametros: {} };
  p.etapas[1].acao[1].parametros.especie = 'Unobtainium';
  p.etapas[2].acao[0].parametros.recipiente = 'bequer_fantasma';
  p.etapas[2].verificacoes[0].grandeza = 'humor';
  p.etapas[1].preCondicoes[0].valor = 'e9';
  p.etapas[1].calculoPrevio.resposta = 'muito';
  delete p.etapas[3].oQueEstaAcontecendo;
  const { ok, erros } = V.validarProcesso(p, { especies: ESPECIES });
  assert.equal(ok, false);
  const t = erros.join('\n');
  for (const trecho of ['operação desconhecida teleportar', 'espécie desconhecida Unobtainium', 'bequer_fantasma', 'grandeza desconhecida: humor', 'etapa inexistente ou posterior (e9)', 'cálculo prévio incompleto', 'oQueEstaAcontecendo obrigatório']) {
    assert.ok(t.includes(trecho), `faltou: ${trecho}\n${t}`);
  }
});

test('validador: texto público sem HTML e sem marca de bastidor ([NV], rascunho, revisado)', () => {
  const p = copia(NACL);
  p.etapas[0].porQue = 'Use <b>EPI</b>.';
  p.etapas[1].oQueEstaAcontecendo = 'Valor [NV] da massa.';
  p.titulo = 'Rascunho: solução salina';
  const t = V.validarProcesso(p, { especies: ESPECIES }).erros.join('\n');
  assert.match(t, /marcação HTML/);
  assert.equal((t.match(/marca de bastidor/g) || []).length, 2);
  // [NV] é permitido nos campos internos de conferência e referências
  assert.match(NACL.conferencia.nota, /\[NV\]/);
});

test('validador: revisado_por é opcional e não bloqueia', () => {
  const p = copia(NACL);
  p.revisado_por = 'Farmacêutico responsável';
  assert.equal(V.validarProcesso(p, { especies: ESPECIES }).ok, true);
  delete p.revisado_por;
  assert.equal(V.validarProcesso(p, { especies: ESPECIES }).ok, true);
});

const ESPECIES_RESTRITAS = Object.assign({}, ESPECIES, {
  AgenteX_l: { nome: 'Agente restrito de teste', mm: 100, fase: 'liquido', densidade: 1, cp: 2, restricao: 'agente_guerra', nivel_conteudo: 'educacional' },
  DrogaY_s: { nome: 'Substância de teste', mm: 300, fase: 'solido', cp: 1, restricao: 'ilicita', nivel_conteudo: 'educacional' },
  OpioideZ_s: { nome: 'Opioide de teste', mm: 300, fase: 'solido', cp: 1, restricao: 'opioide_sintese', nivel_conteudo: 'educacional' }
});

function processoCom(especieId, categoria) {
  const p = copia(NACL);
  p.id = 'proc_teste_v1';
  p.categoria = categoria || 'farmacotecnica';
  p.materiais.especies.push({ id: especieId, papel: 'teste' });
  return p;
}

test('trava de conteúdo: espécie de agente de guerra ou droga ilícita reprova processo completo', () => {
  for (const id of ['AgenteX_l', 'DrogaY_s']) {
    const r = V.validarProcesso(processoCom(id), { especies: ESPECIES_RESTRITAS });
    assert.equal(r.ok, false, id);
    assert.match(r.erros.join('\n'), /espécie restrita/);
  }
});

test('trava de conteúdo: restrição vinda do seed da O2 (nivelDe) também reprova', () => {
  const nivelDe = (id) => (id === 'NaCl_s' ? { restricao: 'ilicita', nivel_conteudo: 'educacional' } : null);
  const r = V.validarProcesso(copia(NACL), { especies: ESPECIES, nivelDe });
  assert.equal(r.ok, false);
});

test('trava de conteúdo: rota de síntese completa de opioide é reprovada; produto acabado a partir do insumo, não', () => {
  const sintese = V.validarProcesso(processoCom('OpioideZ_s', 'sintese'), { especies: ESPECIES_RESTRITAS });
  assert.equal(sintese.ok, false);
  assert.match(sintese.erros.join('\n'), /síntese completa/);
  const produto = V.validarProcesso(processoCom('OpioideZ_s', 'farmacotecnica'), { especies: ESPECIES_RESTRITAS });
  assert.deepEqual(produto.erros, []);
});

test('trava de conteúdo: nomes vetados no título reprovam processo completo (com ou sem acento)', () => {
  for (const titulo of ['Preparo de sarin', 'Síntese de cocaína', 'Purificação de heroína', 'Gás mostarda didático', 'Extração de ricina']) {
    const p = copia(NACL);
    p.titulo = titulo;
    assert.equal(V.validarProcesso(p, { especies: ESPECIES }).ok, false, titulo);
  }
  const p = copia(NACL);
  p.categoria = 'sintese';
  p.titulo = 'Síntese de morfina';
  assert.match(V.validarProcesso(p, { especies: ESPECIES }).erros.join('\n'), /opioide ou psicoestimulante/);
});

test('trava de conteúdo: processo educacional só com ficha; etapas, quantidades e rendimento são recusados', () => {
  const ficha = {
    id: 'proc_ficha_agente_v1', versao: 1, titulo: 'Agentes de guerra química: ficha educacional', categoria: 'basico', nivel: 0,
    nivel_conteudo: 'educacional', restricao: 'agente_guerra',
    referencias: [{ titulo: 'Convenção sobre a Proibição de Armas Químicas (OPAQ)' }],
    materiais: { especies: [{ id: 'AgenteX_l', papel: 'ficha' }] },
    ficha: { mecanismo: 'Inibição da acetilcolinesterase.', antidoto: 'Atropina e oximas, em ambiente hospitalar.', legislacao: 'Proibidos pela Convenção de 1993.' },
    etapas: []
  };
  assert.deepEqual(V.validarProcesso(ficha, { especies: ESPECIES_RESTRITAS }).erros, []);
  const ruim = copia(ficha);
  ruim.etapas = [copia(NACL.etapas[1])];
  ruim.materiais.especies[0].quantidade = { valor: 1, unidade: 'g' };
  ruim.resultadoEsperado = { produto: 'AgenteX_l' };
  const t = V.validarProcesso(ruim, { especies: ESPECIES_RESTRITAS }).erros.join('\n');
  assert.match(t, /etapas executáveis/);
  assert.match(t, /quantidades/);
  assert.match(t, /rendimento/);
  assert.throws(() => P.iniciarSessao(ficha, { especies: ESPECIES_RESTRITAS }), /educacional/);
});

// ── Condições ────────────────────────────────────────────────────────────────

test('condições: lista fechada de operadores e grandezas; sem eval', () => {
  assert.equal(Cd.comparar(5, 'entre', [1, 10]), true);
  assert.equal(Cd.comparar(['a', 'b'], 'contem', ['a']), true);
  assert.equal(Cd.comparar(['a'], 'naoContem', 'b'), true);
  assert.equal(Cd.comparar('5', '>=', 1), false, 'texto não compara como número');
  assert.throws(() => Cd.comparar(1, 'eval', 1), /operador/);
  assert.deepEqual(Cd.validarCondicao({ grandeza: 'massa', op: '>=', valor: 1 }), ['massa exige recipiente']);
  assert.ok(Cd.validarCondicao({ grandeza: 'constructor', op: '==', valor: 1 }).length > 0);
  const fonte = fs.readFileSync(path.join(DIR, '../../js/lab-motor-condicoes.js'), 'utf8');
  assert.ok(!/\beval\s*\(|new Function/.test(fonte));
});

// ── Executor ─────────────────────────────────────────────────────────────────

test('executor: o processo NaCl 0,9 % roda inteiro, conforme, com cálculos certos e caderno completo', () => {
  const { sessao, resultados } = P.rodarProcesso(NACL, ctx, { semente: 7, respostas: RESPOSTAS });
  assert.equal(sessao.terminado, true, JSON.stringify(resultados.map((r) => [r.etapa, r.status, r.mensagens])));
  const rel = P.relatorio(sessao, NACL, ctx);
  assert.equal(rel.conforme, true, JSON.stringify(rel));
  assert.equal(rel.etapasConcluidas, NACL.etapas.length);
  assert.equal(rel.calculos.certos, 2);
  const conc = Cd.avaliar({ grandeza: 'concentracaoPV', recipiente: 'frasco_125', especie: 'NaCl_s', op: 'entre', valor: [0.88, 0.92] }, { estado: sessao.estado, especies: ESPECIES });
  assert.equal(conc, true);
  const etapasNoCaderno = new Set(sessao.caderno.entradas.map((e) => e.etapa));
  for (const e of NACL.etapas) assert.ok(etapasNoCaderno.has(e.id), `caderno sem ${e.id}`);
  assert.equal(sessao.caderno.entradas[sessao.caderno.entradas.length - 1].tipo, 'conclusao');
  assert.ok(K.paraTexto(sessao.caderno).includes('Paramentação'));
  fechaBalanco(sessao.estado);
});

test('executor: determinismo pela semente — mesmo caderno e mesmo estado; outra semente também é conforme', () => {
  const a = P.rodarProcesso(NACL, ctx, { semente: 42, respostas: RESPOSTAS }).sessao;
  const b = P.rodarProcesso(NACL, ctx, { semente: 42, respostas: RESPOSTAS }).sessao;
  assert.equal(E.serializar(a.estado), E.serializar(b.estado));
  assert.equal(K.paraTexto(a.caderno), K.paraTexto(b.caderno));
  for (let s = 1; s <= 25; s++) {
    const r = P.rodarProcesso(NACL, ctx, { semente: s, respostas: RESPOSTAS }).sessao;
    assert.equal(P.relatorio(r, NACL, ctx).conforme, true, `semente ${s}`);
    fechaBalanco(r.estado);
  }
});

test('executor: resposta errada no cálculo prévio mostra a conta e não bloqueia', () => {
  const { sessao, resultados } = P.rodarProcesso(NACL, ctx, { semente: 1, respostas: { e2: '9', e7: '154' } });
  assert.equal(sessao.terminado, true);
  const e2 = resultados.find((r) => r.etapa === 'e2');
  assert.equal(e2.calculo.ok, false);
  assert.match(e2.calculo.texto, /0,90 g/);
  assert.equal(P.relatorio(sessao, NACL, ctx).calculos.errados, 2);
});

test('executor: pré-condição ou verificação "bloqueia_etapa" não muda o estado nem avança', () => {
  const s0 = P.iniciarSessao(NACL, ctx, { semente: 1 });
  const r = P.executarEtapa(s0, NACL, ctx, { parametros: { epi: ['jaleco'] } });
  assert.equal(r.resultado.status, 'bloqueada');
  assert.equal(r.sessao.indice, 0);
  assert.equal(E.serializar(r.sessao.estado), E.serializar(s0.estado));
  assert.ok(r.resultado.mensagens.some((m) => /Falta EPI/.test(m)));
  // processo cuja etapa 2 exige a 1: pular a ordem é impossível pela API, mas a pré-condição também protege
  const p = copia(NACL);
  p.etapas = p.etapas.slice(1);
  p.etapas[0].preCondicoes = [{ grandeza: 'epi', op: 'contem', valor: ['jaleco'], mensagemSeFalhar: 'Paramente-se antes de pesar.' }];
  const r2 = P.executarEtapa(P.iniciarSessao(p, ctx), p, ctx, {});
  assert.equal(r2.resultado.status, 'bloqueada');
  assert.deepEqual(r2.resultado.mensagens, ['Paramente-se antes de pesar.']);
});

test('executor: "aguardar" mantém o efeito e espera; repetir conclui', () => {
  let s = P.executarEtapa(P.iniciarSessao(NACL, ctx), NACL, ctx, {}).sessao;
  s = P.executarEtapa(s, NACL, ctx, { resposta: '0,9' }).sessao;
  const r = P.executarEtapa(s, NACL, ctx, { parametros: { recipiente: 'bequer_100', agitacao: false, tempoMin: 1 } });
  assert.equal(r.resultado.status, 'aguardar');
  assert.equal(r.sessao.indice, 2);
  assert.ok(r.sessao.caderno.entradas.some((e) => e.desvio && e.desvio.codigo === 'dissolucao_lenta'));
  const r2 = P.executarEtapa(r.sessao, NACL, ctx, { parametros: { recipiente: 'bequer_100', agitacao: true, tempoMin: 3 } });
  assert.equal(r2.resultado.status, 'concluida');
  fechaBalanco(r2.sessao.estado);
});

test('executor: parâmetro inválido vira "erro" explicado, sem mudar o estado', () => {
  let s = P.executarEtapa(P.iniciarSessao(NACL, ctx), NACL, ctx, {}).sessao;
  const r = P.executarEtapa(s, NACL, ctx, { parametros: { especie: 'NaCl_s', recipiente: 'bequer_100', massaG: -2 } });
  assert.equal(r.resultado.status, 'erro');
  assert.match(r.resultado.mensagens.join(' '), /massaG/);
  assert.equal(E.serializar(r.sessao.estado), E.serializar(s.estado));
});

test('executor: erro comum dispara com explicação, consequência e correção (sem tara, sem enxágue)', () => {
  const p = copia(NACL);
  p.etapas[1].acao = [p.etapas[1].acao[1]]; // sem a tara
  const semTara = P.rodarProcesso(p, ctx, { semente: 3, respostas: RESPOSTAS }).sessao;
  const d = semTara.caderno.entradas.find((e) => e.desvio && e.desvio.codigo === 'massa_registrada_inclui_recipiente');
  assert.ok(d);
  assert.match(d.texto, /Como fazer certo: Coloque o béquer vazio/);
  const semEnx = P.rodarProcesso(NACL, ctx, { semente: 3, respostas: RESPOSTAS, parametros: { e4: { enxague: false } } }).sessao;
  const com = P.rodarProcesso(NACL, ctx, { semente: 3, respostas: RESPOSTAS }).sessao;
  assert.ok(semEnx.caderno.entradas.some((e) => e.desvio && e.desvio.codigo === 'concentracao_abaixo'));
  const c = (s) => 100 * E.massaEspecie(s.estado.recipientes.frasco_125, 'NaCl_s', ESPECIES) / E.volumeLiquidoMl(s.estado.recipientes.frasco_125, ESPECIES);
  assert.ok(c(semEnx) < c(com));
});

test('executor: voltar restaura o estado do início da etapa; pular aplica o efeito padrão e marca', () => {
  let s = P.iniciarSessao(NACL, ctx, { semente: 5 });
  s = P.executarEtapa(s, NACL, ctx, {}).sessao;
  const antesE2 = s.estado;
  s = P.executarEtapa(s, NACL, ctx, { resposta: '0,9' }).sessao;
  assert.equal(s.indice, 2);
  const v = P.voltarEtapa(s);
  assert.equal(v.indice, 1);
  assert.equal(v.estado, antesE2);
  assert.deepEqual(v.concluidas, ['e1']);
  assert.ok(v.caderno.entradas.some((e) => /Voltou para refazer a etapa e2/.test(e.texto)));
  assert.equal(P.voltarEtapa(P.iniciarSessao(NACL, ctx)).indice, 0);
  const pulado = P.pularEtapa(P.iniciarSessao(NACL, ctx), NACL, ctx).sessao;
  assert.deepEqual(pulado.puladas, ['e1']);
  assert.deepEqual(pulado.estado.ambiente.epi, ['jaleco', 'luvas_nitrila', 'oculos']);
});

test('executor: sessão imutável — executar não altera a sessão recebida', () => {
  const s0 = P.iniciarSessao(NACL, ctx);
  const antes = JSON.stringify(s0);
  P.executarEtapa(s0, NACL, ctx, {});
  assert.equal(JSON.stringify(s0), antes);
  assert.ok(Object.isFrozen(s0));
  const fim = P.rodarProcesso(NACL, ctx, { respostas: RESPOSTAS }).sessao;
  assert.equal(P.executarEtapa(fim, NACL, ctx, {}).resultado.status, 'terminado');
});

// ── Alinhamento com a O2 (seed único e validar-seed.mjs) ───────────────────

test('O2: vocabulário de restrição do motor é o mesmo do validador do seed', () => {
  assert.deepEqual(V.RESTRICOES, O2.RESTRICOES);
  assert.deepEqual(V.RESTRICOES_ABSOLUTAS, O2.RESTRICOES_ABSOLUTAS);
  assert.deepEqual(V.NIVEIS_CONTEUDO, O2.NIVEIS);
  assert.deepEqual(O2.validarSeed(SEED), [], 'o seed segue válido');
});

test('O2: espécies do motor vêm do seed (massa molar, nível e restrição) com o complemento só onde falta', () => {
  for (const sub of SEED.substancias) {
    for (const a of sub.aliases) {
      const e = ESPECIES[a.id];
      if (!e) continue;
      const ls = sub.props.massa_molar || [];
      const l = ls.find((x) => x.fases && x.fases.includes(a.fase)) || ls[0];
      const mm = l && l.v;
      if (mm) assert.equal(e.mm, mm, a.id);
      assert.equal(e.nivel_conteudo, sub.nivel_conteudo, a.id);
      assert.equal(e.restricao, sub.restricao || null, a.id);
    }
  }
  assert.ok(ESPECIES.Sacarose_s, 'fora do seed, fica no complemento');
});

test('O2: toda espécie restrita do seed reprova rota de síntese completa; as absolutas, qualquer processo completo', () => {
  const restritas = SEED.substancias.filter((s) => s.restricao);
  assert.ok(restritas.length >= 1);
  for (const sub of restritas) {
    const id = sub.aliases[0].id;
    const sint = processoCom(id, 'sintese');
    assert.equal(V.validarProcesso(sint, OPCOES_O2).ok, false, `síntese com ${id}`);
    if (O2.RESTRICOES_ABSOLUTAS.includes(sub.restricao)) assert.equal(V.validarProcesso(processoCom(id), OPCOES_O2).ok, false, id);
  }
});

test('O2: nomes vetados do validar-seed (guerra e ilícitas) também reprovam processo completo', () => {
  for (const titulo of ['Preparo com mustard agent', 'Purificação de fentanyl', 'Rota de nitazeno']) {
    const p = copia(NACL);
    p.titulo = titulo;
    assert.equal(V.validarProcesso(p, OPCOES_O2).ok, false, titulo);
  }
});
