/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O1 (Laboratório v2): regras puras da "Ajuda no processo" (níveis, preferência no aparelho, passo atual, roteiro da aspirina).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'modulos', 'laboratorio');
const G = require(path.join(lab, 'js/lab-guia.js'));

const vazio = { selecionado: null, qtd: NaN, adicionado: {}, agitador: false, modoTermico: 'ambiente', tempAlvo: 25 };
const com = (extra) => Object.assign({}, vazio, extra);

function armazenamentoFalso(inicial) {
  const dados = new Map(inicial ? Object.entries(inicial) : []);
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => { dados.set(k, String(v)); },
    dados,
  };
}

test('níveis: Completa, Só dica e Prova', () => {
  assert.deepEqual(G.NIVEIS, ['completa', 'dica', 'prova']);
  assert.equal(G.ROTULOS_NIVEL.completa, 'Completa');
  assert.equal(G.ROTULOS_NIVEL.dica, 'Só dica');
  assert.equal(G.ROTULOS_NIVEL.prova, 'Prova');
});

test('apoio por nível: Completa mostra "!" e balão, Só dica só o balão, Prova nada, desligada nada', () => {
  assert.deepEqual(G.apoioDaPreferencia({ ligada: true, nivel: 'completa' }), { marca: true, balao: true });
  assert.deepEqual(G.apoioDaPreferencia({ ligada: true, nivel: 'dica' }), { marca: false, balao: true });
  assert.deepEqual(G.apoioDaPreferencia({ ligada: true, nivel: 'prova' }), { marca: false, balao: false });
  assert.deepEqual(G.apoioDaPreferencia({ ligada: false, nivel: 'completa' }), { marca: false, balao: false });
});

test('preferência: padrão ligada em Completa; lixo no armazenamento cai no padrão', () => {
  assert.deepEqual(G.lerPreferencia(armazenamentoFalso()), { ligada: true, nivel: 'completa' });
  assert.deepEqual(G.lerPreferencia(armazenamentoFalso({ [G.CHAVE_AJUDA]: '{nao json' })), { ligada: true, nivel: 'completa' });
  assert.deepEqual(G.lerPreferencia(armazenamentoFalso({ [G.CHAVE_AJUDA]: JSON.stringify({ ligada: 'sim', nivel: 'xyz' }) })), { ligada: true, nivel: 'completa' });
  assert.deepEqual(G.lerPreferencia(null), { ligada: true, nivel: 'completa' });
});

test('preferência sobrevive à recarga e o armazenamento que lança erro não derruba', () => {
  const arm = armazenamentoFalso();
  assert.equal(G.salvarPreferencia(arm, { ligada: false, nivel: 'prova' }), true);
  assert.deepEqual(G.lerPreferencia(arm), { ligada: false, nivel: 'prova' });
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.equal(G.salvarPreferencia(quebrado, { ligada: true, nivel: 'dica' }), false);
  assert.deepEqual(G.lerPreferencia(quebrado), { ligada: true, nivel: 'completa' });
});

test('roteiro da aspirina: passos com id único, alvo, texto, dica, porquê e competência', () => {
  const r = G.ROTEIROS.aspirina;
  assert.ok(r.passos.length >= 10);
  assert.equal(new Set(r.passos.map((p) => p.id)).size, r.passos.length);
  for (const p of r.passos) {
    assert.ok(p.alvo && p.texto && p.dica && p.porque && p.competencia, `passo ${p.id} completo`);
    assert.equal(typeof p.feito, 'function');
    assert.ok(!/inho\b|inha\b|inhos\b|inhas\b/.test(`${p.texto} ${p.dica} ${p.porque}`), `sem diminutivo em ${p.id}`);
  }
});

test('passoAtual: começa no primeiro passo e devolve alvo, texto e competência', () => {
  const r = G.passoAtual(G.ROTEIROS.aspirina, vazio);
  assert.equal(r.concluido, false);
  assert.equal(r.indice, 0);
  assert.equal(r.total, G.ROTEIROS.aspirina.passos.length);
  assert.equal(r.passo.alvo, 'reagente:AcidoSalicilico_s');
  assert.ok(r.passo.competencia);
});

test('passoAtual: avança por evento (a pessoa age, o estado muda, o passo muda)', () => {
  const R = G.ROTEIROS.aspirina;
  let e = com({ selecionado: 'AcidoSalicilico_s' });
  assert.equal(G.passoAtual(R, e).passo.alvo, '#qtdInput');
  e = com({ selecionado: 'AcidoSalicilico_s', qtd: 2.76 });
  assert.equal(G.passoAtual(R, e).passo.alvo, '#btnStartAdd');
  e = com({ selecionado: 'AcidoSalicilico_s', qtd: 2.76, adicionado: { AcidoSalicilico_s: 2.76 } });
  assert.equal(G.passoAtual(R, e).passo.alvo, 'reagente:AnidridoAcetico_l');
  assert.equal(G.passoAtual(R, e).indice, 3);
});

test('passoAtual: concluído só quando agitador, 70 °C e termostato estão prontos', () => {
  const R = G.ROTEIROS.aspirina;
  const base = { selecionado: 'H2SO4_aq', qtd: 0.1, adicionado: { AcidoSalicilico_s: 2.76, AnidridoAcetico_l: 2, H2SO4_aq: 0.1 } };
  assert.equal(G.passoAtual(R, com(base)).passo.alvo, '#btnAgitador');
  assert.equal(G.passoAtual(R, com(Object.assign({}, base, { agitador: true }))).passo.alvo, '#tempAlvo');
  assert.equal(G.passoAtual(R, com(Object.assign({}, base, { agitador: true, tempAlvo: 70 }))).passo.alvo, '#btnThermostat');
  const fim = G.passoAtual(R, com(Object.assign({}, base, { agitador: true, tempAlvo: 70, modoTermico: 'termostato' })));
  assert.equal(fim.concluido, true);
  assert.equal(fim.passo, null);
});

test('passoAtual: pular um passo passa ao seguinte e voltar o recupera', () => {
  const R = G.ROTEIROS.aspirina;
  const primeiro = G.passoAtual(R, vazio).passo.id;
  const pulando = G.passoAtual(R, vazio, [primeiro]);
  assert.notEqual(pulando.passo.id, primeiro);
  assert.equal(pulando.indice, 1);
  assert.equal(G.passoAtual(R, vazio, []).passo.id, primeiro);
});

test('progresso: porcentagem de passos feitos ou pulados', () => {
  const R = G.ROTEIROS.aspirina;
  assert.equal(G.progressoPct(R, vazio), 0);
  const metade = G.progressoPct(R, com({ selecionado: 'AcidoSalicilico_s', qtd: 2.76, adicionado: { AcidoSalicilico_s: 2.76, AnidridoAcetico_l: 2 } }));
  assert.ok(metade > 30 && metade < 70, `progresso ${metade}`);
});

test('mensagem de etapa errada só para ações da bancada fora do passo', () => {
  const passo = G.ROTEIROS.aspirina.passos[0];
  assert.match(G.mensagemEtapaErrada(passo), /Ainda não é esta etapa/);
  assert.equal(G.acaoForaDeOrdem({ alvo: '#btnAgitador' }, 'btnHeat'), true);
  assert.equal(G.acaoForaDeOrdem({ alvo: '#btnAgitador' }, 'btnAgitador'), false);
  assert.equal(G.acaoForaDeOrdem({ alvo: '#qtdInput' }, 'btnManual'), false);
});

test('missões: a de síntese da aspirina usa o roteiro; as demais não', () => {
  assert.equal(G.roteiroDaMissao(4), 'aspirina');
  assert.equal(G.roteiroDaMissao(0), null);
});

test('chave "labGuiado": ligada por padrão, desligável por URL e por objeto', () => {
  assert.equal(G.flagLigada('labGuiado', '', null), true);
  assert.equal(G.flagLigada('labGuiado', '?flags=-labGuiado', null), false);
  assert.equal(G.flagLigada('labGuiado', '', { labGuiado: false }), false);
  assert.equal(G.flagLigada('desconhecida', '', null), false);
});

test('texto público sem selo de revisão, sem "IA" e sem "rascunho" no roteiro', () => {
  const tudo = JSON.stringify(G.ROTEIROS, (k, v) => (typeof v === 'function' ? undefined : v));
  assert.ok(!/rascunho|revisad|gerado por IA|\bIA\b/i.test(tudo));
  const fonte = fs.readFileSync(path.join(lab, 'js/lab-guia.js'), 'utf8');
  assert.ok(!/innerHTML/.test(fonte));
});
