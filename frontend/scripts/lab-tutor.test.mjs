/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O4: tutor sobre o executor de processos — Missão 1 (EPI e NaCl 0,9 %) jogável pelos controles da bancada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../modulos/laboratorio');
const P = require('../modulos/laboratorio/js/lab-motor-processo.js');
const T = require('../modulos/laboratorio/js/lab-tutor.js');
const C = require('../modulos/laboratorio/js/lab-tutor-controles.js');
const { ESPECIES } = require('../modulos/laboratorio/js/lab-motor-especies.js');
const NACL = JSON.parse(fs.readFileSync(path.join(LAB, 'data/processos/proc_nacl_09_v1.json'), 'utf8'));
const TRILHA = JSON.parse(fs.readFileSync(path.join(LAB, 'data/trilha/trilha_v1.json'), 'utf8'));
const M1 = TRILHA.missoes.find((m) => m.id === 'm1_nacl_09');
const M8 = TRILHA.missoes.find((m) => m.tipo === 'investigacao');
const ctx = { especies: ESPECIES };

const ROTULO = { produto: 'Solução de cloreto de sódio', concentracao: '0,9 % p/v', lote: 'L01', fabricacao: '05/11/2026', validade: '30 dias', responsavel: 'Turma A' };
// Sequência correta: [alvo, valores, resposta?]
const CERTA = [
  ['painelSeguranca', { epi: ['jaleco', 'luvas_nitrila', 'oculos'] }],
  ['balancaTara', {}],
  ['reagente:NaCl_s', { massaG: '0,90' }, '0,9'],
  ['reagente:H2O_l', { volumeMl: '70', vidraria: 'proveta' }],
  ['btnAgitar', { tempoMin: '3', agitacao: true }],
  ['btnTransferir', { enxague: true }],
  ['btnAvolumar', { volumeFinalMl: '100' }],
  ['btnAgitar', { tempoMin: '5', agitacao: true }],
  ['phmetroCalibrar', { tampoes: ['4', '7'] }],
  ['phmetro', {}, '308'],
  ['btnEnvasar', {}],
  ['painelRotulo', ROTULO],
  ['painelDescarte', { destino: 'pia' }]
];

function novo(nivel, semente) { return T.criar(NACL, M1, ctx, { semente: semente || 5, ajuda: { ligada: true, nivel: nivel || 'completa' } }); }
function agir(t, [alvo, valores, resposta]) { return T.agir(t, NACL, ctx, { alvo, valores, resposta }); }
function jogar(t, passos) {
  let atual = t;
  const retornos = [];
  for (const p of passos) { const r = agir(atual, p); atual = r.tutor; retornos.push(r.retorno); }
  return { tutor: atual, retornos };
}

test('executor: ação com {omitir: true} não roda e o erro comum aparece (pesar sem tarar)', () => {
  const s0 = P.executarEtapa(P.iniciarSessao(NACL, ctx, { semente: 2 }), NACL, ctx, {}).sessao;
  const r = P.executarEtapa(s0, NACL, ctx, { parametros: [{ omitir: true }, {}], resposta: '0,9' });
  assert.equal(r.resultado.status, 'concluida');
  assert.ok(r.resultado.mensagens.some((m) => /Sem tara/.test(m) && /Como fazer certo/.test(m)));
  assert.equal(r.sessao.estado.equipamentos.balanca.recipiente, null, 'tara não aconteceu');
});

test('tutor: a Missão 1 inteira, jogada pelos controles, termina com lote conforme', () => {
  const { tutor, retornos } = jogar(novo(), CERTA);
  assert.equal(tutor.sessao.terminado, true);
  assert.ok(retornos.every((r) => r.tipo !== 'erro' && r.tipo !== 'bloqueada' && r.tipo !== 'fora_de_ordem'), JSON.stringify(retornos.map((r) => r.tipo)));
  const res = T.resultado(tutor, NACL, ctx, M1);
  assert.equal(res.conforme, true, JSON.stringify(res));
  assert.ok(res.conferencias.every((c) => c.ok));
  assert.equal(res.desvios.length, 0);
  assert.equal(res.calculos.certos, 2);
  assert.match(res.resumo, /^Lote conforme/);
  assert.ok(res.conclusao && res.conclusao.length > 10);
  const comp = tutor.competencias.filter((e) => e.resultado === 'acerto' && e.competencia !== 'calculo');
  assert.equal(comp.length, NACL.etapas.length, 'um evento de acerto por etapa');
  assert.equal(tutor.competencias.filter((e) => e.competencia === 'calculo' && e.resultado === 'acerto').length, 2, 'as duas contas certas');
  assert.ok(comp.every((e) => e.tipo === 'competencia' && e.missao === 'm1_nacl_09' && TRILHA.competencias[e.competencia]));
});

test('tutor: cada etapa mostra o que está acontecendo, o porquê e o controle correto para o "!"', () => {
  let t = novo();
  for (const passo of CERTA) {
    const v = T.vista(t, NACL, ctx);
    assert.equal(v.terminado, false);
    assert.ok(v.acontecendo && v.porque && v.etapaTitulo);
    assert.equal(v.alvo, passo[0], `alvo da etapa ${v.progresso}`);
    assert.ok(v.rotuloAlvo && v.rotuloAlvo.length > 2);
    t = agir(t, passo).tutor;
  }
  assert.equal(T.vista(t, NACL, ctx).terminado, true);
});

test('dica gradual: 3 degraus (porquê, controle, resposta); só dica sem "!"; Prova sem nenhuma ajuda', () => {
  let t = novo('dica');
  const v0 = T.vista(t, NACL, ctx);
  assert.equal(v0.alvo, null, 'Só dica: sem "!"');
  assert.deepEqual(v0.dicas, []);
  assert.equal(v0.podePedirDica, true);
  const textos = [];
  for (let i = 0; i < 4; i++) { t = T.pedirDica(t, NACL).tutor; }
  const v3 = T.vista(t, NACL, ctx);
  assert.equal(v3.dicas.length, 3);
  assert.equal(v3.podePedirDica, false);
  textos.push(...v3.dicas);
  assert.equal(textos[0], NACL.etapas[0].porQue);
  assert.match(textos[1], /Painel de segurança/);
  assert.match(textos[2], /jaleco/i);
  assert.ok(t.competencias.some((e) => e.resultado === 'dica'), 'pedir dica gera evento de competência');

  let p = novo('prova');
  const vp = T.vista(p, NACL, ctx);
  assert.equal(vp.alvo, null);
  assert.equal(vp.porque, null, 'Prova não mostra o porquê');
  assert.equal(vp.podePedirDica, false);
  assert.equal(T.pedirDica(p, NACL).tutor, p, 'Prova ignora o pedido de dica');
  const r = agir(p, ['painelSeguranca', { epi: ['jaleco'] }]);
  assert.equal(r.retorno.tipo, 'bloqueada');
  assert.deepEqual(r.retorno.mensagens, ['Registrado no caderno.'], 'Prova não explica na hora');
});

test('EPI incompleto bloqueia a etapa 1 com o motivo; nada avança', () => {
  const r = agir(novo(), ['painelSeguranca', { epi: ['jaleco', 'oculos'] }]);
  assert.equal(r.retorno.tipo, 'bloqueada');
  assert.ok(r.retorno.mensagens.some((m) => /Falta EPI/.test(m)));
  assert.equal(r.tutor.sessao.indice, 0);
  assert.equal(r.retorno.competencia.resultado, 'erro');
  assert.equal(r.retorno.competencia.competencia, 'biosseguranca');
});

test('controle fora de ordem: aviso com a etapa atual, sem mudar o estado', () => {
  const t = novo();
  const r = agir(t, ['btnAvolumar', { volumeFinalMl: '100' }]);
  assert.equal(r.retorno.tipo, 'fora_de_ordem');
  assert.match(r.retorno.mensagens[0], /Paramentação/);
  assert.equal(r.tutor.sessao, t.sessao);
  const desconhecido = agir(t, ['nada:existe', {}]);
  assert.equal(desconhecido.retorno.tipo, 'erro');
});

test('erro comum com consequência: pesar sem tarar registra o desvio e ensina a correção', () => {
  const t1 = agir(novo(), CERTA[0]).tutor;
  const r = agir(t1, ['reagente:NaCl_s', { massaG: '0,90' }, '0,9']);
  assert.equal(r.retorno.tipo, 'concluida');
  assert.ok(r.retorno.mensagens.some((m) => /Sem tara/.test(m)));
  assert.equal(r.retorno.competencia.resultado, 'erro');
  const fim = jogar(r.tutor, CERTA.slice(3)).tutor;
  const res = T.resultado(fim, NACL, ctx, M1);
  assert.ok(res.desvios.some((d) => d.etapa === 'e2' && /Como fazer certo/.test(d.texto)));
});

test('sem agitação suficiente a etapa espera; agitar de novo conclui sem repetir a água', () => {
  let t = jogar(novo(), CERTA.slice(0, 4)).tutor;
  const r1 = agir(t, ['btnAgitar', { tempoMin: '1', agitacao: false }]);
  assert.equal(r1.retorno.tipo, 'aguardar');
  assert.ok(r1.retorno.mensagens.some((m) => /cristais/.test(m)));
  assert.ok(r1.retorno.mensagens.some((m) => /Sem agitação, a dissolução demora/.test(m)), 'erro comum explicado');
  t = r1.tutor;
  assert.equal(T.vista(t, NACL, ctx).alvo, 'btnAgitar');
  const r2 = agir(t, ['btnAgitar', { tempoMin: '3', agitacao: true }]);
  assert.equal(r2.retorno.tipo, 'concluida');
  const vol = T.vista(r2.tutor, NACL, ctx).leituras.find((l) => l.id === 'bequer_100');
  assert.ok(vol && /7\d,\d mL/.test(vol.texto), vol && vol.texto);
});

test('transferir sem enxágue e EPI parcial: avisos aparecem no resultado; pular e voltar funcionam', () => {
  let t = jogar(novo(), CERTA.slice(0, 5)).tutor;
  const r = agir(t, ['btnTransferir', { enxague: false }]);
  assert.ok(r.retorno.mensagens.some((m) => /enxágue/.test(m)));
  t = r.tutor;
  const antes = t.sessao.indice;
  t = T.pular(t, NACL, ctx).tutor;
  assert.equal(t.sessao.indice, antes + 1);
  assert.ok(t.competencias.some((e) => e.resultado === 'pulado'));
  t = T.voltar(t, NACL);
  assert.equal(t.sessao.indice, antes);
});

test('controle com campo inválido não executa e diz o que falta', () => {
  const t = jogar(novo(), CERTA.slice(0, 2)).tutor;
  const r = agir(t, ['reagente:NaCl_s', { massaG: 'abc' }]);
  assert.equal(r.retorno.tipo, 'erro');
  assert.match(r.retorno.mensagens[0], /Massa/);
  assert.equal(r.tutor.sessao, t.sessao);
});

test('determinismo: mesma semente e mesmas ações dão a mesma vista e o mesmo resultado', () => {
  const a = jogar(novo('completa', 9), CERTA).tutor;
  const b = jogar(novo('completa', 9), CERTA).tutor;
  assert.deepEqual(T.resultado(a, NACL, ctx, M1), T.resultado(b, NACL, ctx, M1));
  assert.deepEqual(a.sessao.caderno, b.sessao.caderno);
  assert.deepEqual(a.competencias, b.competencias);
  const c = jogar(novo('completa', 9), CERTA.slice(0, 6)).tutor;
  const d = jogar(novo('completa', 9), CERTA.slice(0, 6)).tutor;
  assert.deepEqual(T.vista(c, NACL, ctx), T.vista(d, NACL, ctx));
});

test('controles: todo alvo do processo tem controle, rótulo e descrição da ação', () => {
  for (const e of NACL.etapas) {
    for (const a of [].concat(e.acao)) {
      const def = C.controle(a.alvoUI, ctx);
      assert.ok(def, `sem controle para ${a.alvoUI}`);
      assert.ok(def.rotulo && def.botao, a.alvoUI);
      assert.ok(C.descreverAcao(a, ctx).length > 8, a.operacao);
    }
  }
  assert.deepEqual(C.alvosDoProcesso(NACL)[0], 'painelSeguranca');
  assert.equal(C.controle('reagente:NaoExiste', ctx), null);
  assert.equal(C.montarParametros('painelDescarte', { destino: '' }, ctx).ok, false);
  assert.equal(C.montarParametros('painelDescarte', { destino: 'em_qualquer_lugar' }, ctx).ok, false);
});

test('investigação de desvio (nível 8): o caderno não entrega a resposta; a causa é a etapa e5', () => {
  const inv = T.montarInvestigacao(M8, NACL, ctx);
  assert.ok(inv.registros.length > 10);
  assert.ok(inv.registros.every((r) => !/passou da marca|Como fazer certo/.test(r)), 'sem explicação pronta no caderno');
  assert.ok(inv.registros.some((r) => /105,0 mL/.test(r)));
  assert.ok(inv.conferencias.some((c) => /^Fora/.test(c)));
  assert.equal(inv.opcoes.length, NACL.etapas.length);
  const errado = T.responderInvestigacao(inv, M8, 'e2');
  assert.equal(errado.certo, false);
  const certo = T.responderInvestigacao(inv, M8, 'e5');
  assert.equal(certo.certo, true);
  assert.ok(certo.explicacao && certo.acaoCorretiva);
  assert.equal(certo.competencia.competencia, 'investigacao');
  assert.deepEqual(T.montarInvestigacao(M8, NACL, ctx), inv, 'determinístico');
});

test('arquivos do tutor: cabeçalho de licença, sem innerHTML, sem eval, sem handler inline, sem texto de bastidor', () => {
  for (const f of ['js/lab-tutor.js', 'js/lab-tutor-controles.js', 'js/lab-trilha.js', 'js/lab-tutor-ui.js']) {
    const src = fs.readFileSync(path.join(LAB, f), 'utf8');
    assert.match(src, /© 2026 Daniel Pires Francisco/, f);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function|\bonclick\s*=|setAttribute\(\s*['"]on/i.test(src), f);
    assert.ok(!/['"`][^'"`]*\b(revisad[oa]|rascunho|gerad[oa] por IA|\[NV\])[^'"`]*['"`]/i.test(src), `texto de bastidor em ${f}`);
  }
});
