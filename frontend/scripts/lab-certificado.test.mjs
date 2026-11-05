/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O8: certificado de conclusão por nível da trilha, gerado no cliente (impressão/PDF do navegador).
// DECISÃO D-5 (valor do certificado, carga horária, validade para horas complementares) É DO DONO: o texto é
// neutro de propósito e não promete horas. O texto público nunca diz "revisado", "IA" ou "rascunho".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../modulos/laboratorio');
const Ce = require('../modulos/laboratorio/js/lab-certificado.js');
const TRILHA = JSON.parse(fs.readFileSync(path.join(LAB, 'data/trilha/trilha_v1.json'), 'utf8'));

const prog = (ids, conforme = true) => ({ v: 1, missoes: Object.fromEntries(ids.map((id) => [id, { vezes: 1, conforme, menorDesvios: 0 }])) });
const jogaveis = (nivel) => TRILHA.missoes.filter((m) => m.nivel === nivel && m.processoRef).map((m) => m.id);

test('elegíveis: nível só com todas as missões jogáveis concluídas com lote conforme', () => {
  assert.deepEqual(Ce.elegiveis(TRILHA, prog([])), []);
  assert.deepEqual(Ce.elegiveis(TRILHA, prog(['m1_nacl_09'])).map((x) => x.nivel), [0]);
  assert.deepEqual(Ce.elegiveis(TRILHA, prog(['m1_nacl_09'], false)), [], 'não conforme não certifica');
  const seis = jogaveis(6);
  assert.ok(seis.length > 1);
  assert.deepEqual(Ce.elegiveis(TRILHA, prog(seis.slice(1))).map((x) => x.nivel), [], 'falta uma missão do nível 6');
  const todas = Ce.elegiveis(TRILHA, prog(seis));
  assert.deepEqual(todas.map((x) => x.nivel), [6]);
  assert.equal(todas[0].missoes.length, seis.length);
  assert.ok(todas[0].nome && todas[0].missoes.every((t) => typeof t === 'string' && t.length > 3));
});

test('nível 8 (investigação) certifica quando a causa foi encontrada', () => {
  assert.deepEqual(Ce.elegiveis(TRILHA, prog(['m8_desvio_nacl'])).map((x) => x.nivel), [8]);
});

test('texto: nome, nível, missões e data; neutro, sem selo de revisão/IA e sem promessa de horas', () => {
  const nivel = Ce.elegiveis(TRILHA, prog(['m1_nacl_09']))[0];
  const c = Ce.montar({ nome: '  Maria da Silva ', nivel, data: new Date(2026, 10, 5) });
  const todo = [c.titulo, c.corpo, ...c.linhas].join('\n');
  assert.match(todo, /Maria da Silva/);
  assert.match(todo, /Nível 0/);
  assert.match(todo, /Primeiros passos na bancada/);
  assert.match(todo, /05\/11\/2026/);
  for (const t of nivel.missoes) assert.ok(todo.includes(t));
  assert.doesNotMatch(todo, /revisad|rascunho|\bIA\b|intelig[eê]ncia artificial|\[NV\]|\bhoras?\b|carga hor/i);
  assert.doesNotMatch(todo, /\w+(inho|inha|inhos|inhas)\b/i, 'sem diminutivos');
  assert.equal(Ce.montar({ nome: '', nivel, data: new Date(2026, 10, 5) }), null, 'sem nome não emite');
});

test('nome vem só da identidade local; sem identidade, vazio', () => {
  assert.equal(Ce.nomeDaIdentidade({ LaiftIdentity: { get: () => ({ name: ' Ana Souza ' }) } }), 'Ana Souza');
  assert.equal(Ce.nomeDaIdentidade({ LaiftIdentity: { get: () => null } }), '');
  assert.equal(Ce.nomeDaIdentidade({ LaiftIdentity: { get: () => { throw new Error('x'); } } }), '');
  assert.equal(Ce.nomeDaIdentidade({}), '');
  assert.equal(Ce.nomeDaIdentidade({ LaiftIdentity: { get: () => ({ name: 'A'.repeat(300) }) } }).length, 80);
});

test('o certificado não envia nada: sem rede, sem innerHTML', () => {
  const src = fs.readFileSync(path.join(LAB, 'js/lab-certificado.js'), 'utf8');
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|innerHTML|insertAdjacentHTML/);
});
