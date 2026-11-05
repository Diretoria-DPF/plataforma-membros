/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O8: a Guia (assistente geral: próximo passo) e o Preceptor (tutor: porquê técnico) falam por passo, com texto
// determinístico vindo do processo/tutor, sem IA, sem cota e sem repetir o que já foi dito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../modulos/laboratorio');
const X = require('../modulos/laboratorio/js/lab-contexto.js');
const T = require('../modulos/laboratorio/js/lab-tutor.js');
const Tr = require('../modulos/laboratorio/js/lab-trilha.js');
const { ESPECIES } = require('../modulos/laboratorio/js/lab-motor-especies.js');
const TRILHA = JSON.parse(fs.readFileSync(path.join(LAB, 'data/trilha/trilha_v1.json'), 'utf8'));
const NACL = JSON.parse(fs.readFileSync(path.join(LAB, 'data/processos/proc_nacl_09_v1.json'), 'utf8'));
const M1 = TRILHA.missoes.find((m) => m.id === 'm1_nacl_09');
const ctx = { especies: ESPECIES };
const vistaDe = (nivel) => T.vista(T.criar(NACL, M1, ctx, { semente: 3, ajuda: { ligada: true, nivel } }), NACL, ctx);
const feita = { v: 1, missoes: { m1_nacl_09: { vezes: 1, conforme: true, menorDesvios: 0 } } };

test('Guia: no nível Completa nomeia o controle e o "!"; em Só dica nomeia a etapa e manda pedir dica; na Prova, silêncio', () => {
  const c = X.falaGuia(vistaDe('completa'));
  assert.match(c, /^A Guia/);
  assert.match(c, /próximo passo/i);
  assert.match(c, /marcado com "!"/);
  const v = vistaDe('dica');
  const d = X.falaGuia(v);
  assert.match(d, /peça uma dica/);
  assert.ok(d.includes(v.etapaTitulo));
  assert.doesNotMatch(d, /"!"/);
  assert.equal(X.falaGuia(vistaDe('prova')), '');
});

test('Guia no fim da missão: sugere a próxima missão disponível ou o boletim', () => {
  const fim = { terminado: true };
  const t = X.falaGuia(fim, Tr.situacao(TRILHA, feita));
  assert.match(t, /^A Guia/);
  assert.match(t, /desinfetante/i, 'a próxima disponível da trilha');
  const todas = Object.fromEntries(TRILHA.missoes.filter((m) => m.processoRef).map((m) => [m.id, { vezes: 1, conforme: true, menorDesvios: 0 }]));
  assert.match(X.falaGuia(fim, Tr.situacao(TRILHA, { v: 1, missoes: todas })), /boletim/i);
});

test('Guia na trilha: sugere a primeira missão ainda não concluída e disponível', () => {
  assert.match(X.sugestaoTrilha(Tr.situacao(TRILHA, Tr.progressoVazio())), /Missão 1/);
  assert.doesNotMatch(X.sugestaoTrilha(Tr.situacao(TRILHA, feita)), /Missão 1/);
  assert.match(X.sugestaoTrilha(Tr.situacao(TRILHA, feita)), /^A Guia/);
});

test('Preceptor: o porquê da etapa é "novo" uma vez; ao voltar à mesma etapa não é novo; texto é sempre o da etapa atual', () => {
  const v = vistaDe('completa');
  const a = X.falaPreceptor(v, []);
  assert.equal(a.texto, `Preceptor: ${v.porque}`);
  assert.equal(a.novo, true);
  assert.deepEqual(a.vistos, [v.etapaId]);
  const b = X.falaPreceptor(v, a.vistos);
  assert.equal(b.novo, false, 'não repete a dica antiga');
  assert.equal(b.texto, a.texto, 'o texto continua disponível a pedido');
  assert.deepEqual(b.vistos, a.vistos);
  const outra = X.falaPreceptor({ ...v, etapaId: 'e2', porque: 'Outro porquê.' }, a.vistos);
  assert.equal(outra.novo, true);
  assert.equal(outra.texto, 'Preceptor: Outro porquê.');
  assert.deepEqual(a.vistos, [v.etapaId], 'lista original não muda');
});

test('Preceptor: sem porquê (Prova) ou missão terminada, nada', () => {
  assert.deepEqual(X.falaPreceptor(vistaDe('prova'), []), { texto: '', novo: false, vistos: [] });
  assert.equal(X.falaPreceptor({ terminado: true }, ['e1']).texto, '');
});

test('cada etapa de cada processo completo tem o texto que a Guia e o Preceptor usam (dados completos)', () => {
  const dir = path.join(LAB, 'data/processos');
  for (const f of fs.readdirSync(dir)) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (p.nivel_conteudo !== 'completo') continue;
    for (const e of p.etapas) assert.ok(e.titulo && e.porQue && e.oQueEstaAcontecendo, `${f}:${e.id}`);
  }
});

test('o CSS dos textos contextuais não sobrepõe nada: sem position fixed/absolute/sticky nos blocos da Guia, do Preceptor, do boletim e do certificado', () => {
  const css = fs.readFileSync(path.join(LAB, 'lab-guia.css'), 'utf8');
  for (const seletor of ['lmt-instrucao', 'lmt-porque', 'lmt-boletim', 'lmt-certificado-tela']) {
    assert.match(css, new RegExp(`\\.${seletor}\\b`), `${seletor} existe no CSS`);
    const bloco = [...css.matchAll(new RegExp(`\\.${seletor}\\b[^{]*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(';');
    assert.doesNotMatch(bloco, /position\s*:\s*(fixed|absolute|sticky)/, seletor);
  }
});
