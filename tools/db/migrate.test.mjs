/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { listMigrations, parseArgs, runMigrations } from './migrate.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SQL_REAL = path.resolve(aqui, '..', '..', 'sql');

/** Adaptador PGlite com a mesma forma do `pg`: query(texto, params?) → { rows }. */
function clientePglite(db) {
  return {
    async query(texto, params) {
      if (params) return db.query(texto, params);
      const resultados = await db.exec(texto);
      return resultados.length ? resultados[resultados.length - 1] : { rows: [] };
    },
  };
}

async function novoBanco() {
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp, pg_trgm } });
  return { db, client: clientePglite(db) };
}

/** Cria uma pasta temporária com os arquivos dados ({ nome: conteúdo }). */
function pasta(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laift-migrate-'));
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const alvo = path.join(dir, nome);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, conteudo);
  }
  return dir;
}

const tabelaExiste = async (client, nome) =>
  (await client.query('SELECT to_regclass($1) AS t', [`public.${nome}`])).rows[0].t !== null;
const ledger = async (client) =>
  (await client.query('SELECT name, hash FROM schema_migrations ORDER BY name')).rows;

const silencioso = () => {};
const MIGRACOES = {
  '001_a.sql': 'CREATE TABLE IF NOT EXISTS t_a (id int);',
  '002_b.sql': 'CREATE TABLE IF NOT EXISTS t_b (id int);',
  '003_c.sql': 'CREATE TABLE IF NOT EXISTS t_c (id int);',
};

test('listMigrations: ordem numérica (não lexical), ignora down/, ops/ e arquivos fora do padrão', () => {
  const dir = pasta({
    '999_y.sql': 'SELECT 1;',
    '1000_z.sql': 'SELECT 1;',
    '010_c.sql': 'SELECT 1;',
    '002_b.sql': 'SELECT 1;',
    'down/002_b.sql': 'SELECT 1;',
    'ops/readonly_role.sql': 'SELECT 1;',
    'LEIAME.md': 'x',
    'notas.sql': 'SELECT 1;',
  });
  const nomes = listMigrations(dir).map((m) => m.name);
  assert.deepEqual(nomes, ['002_b.sql', '010_c.sql', '999_y.sql', '1000_z.sql']);
});

test('listMigrations: calcula o SHA-256 do conteúdo e recusa número repetido', () => {
  const dir = pasta({ '001_a.sql': 'SELECT 1;' });
  const [m] = listMigrations(dir);
  assert.match(m.hash, /^[0-9a-f]{64}$/);
  const repetido = pasta({ '001_a.sql': 'SELECT 1;', '001_b.sql': 'SELECT 2;' });
  assert.throws(() => listMigrations(repetido), /001/);
});

test('banco vazio: aplica tudo em ordem e registra no ledger', async () => {
  const { client } = await novoBanco();
  const dir = pasta(MIGRACOES);
  const r = await runMigrations(client, { dir, log: silencioso });
  assert.deepEqual(r.applied, ['001_a.sql', '002_b.sql', '003_c.sql']);
  for (const t of ['t_a', 't_b', 't_c']) assert.equal(await tabelaExiste(client, t), true);
  assert.deepEqual((await ledger(client)).map((l) => l.name), ['001_a.sql', '002_b.sql', '003_c.sql']);
});

test('idempotente: a segunda execução não aplica nada', async () => {
  const { client } = await novoBanco();
  const dir = pasta(MIGRACOES);
  await runMigrations(client, { dir, log: silencioso });
  const r = await runMigrations(client, { dir, log: silencioso });
  assert.deepEqual(r.applied, []);
  assert.equal((await ledger(client)).length, 3);
});

test('aplica só as novas quando chega uma migração', async () => {
  const { client } = await novoBanco();
  const dir = pasta(MIGRACOES);
  await runMigrations(client, { dir, log: silencioso });
  fs.writeFileSync(path.join(dir, '004_d.sql'), 'CREATE TABLE IF NOT EXISTS t_d (id int);');
  const r = await runMigrations(client, { dir, log: silencioso });
  assert.deepEqual(r.applied, ['004_d.sql']);
  assert.equal(await tabelaExiste(client, 't_d'), true);
});

test('--dry-run não escreve nada, nem a tabela de controle', async () => {
  const { client } = await novoBanco();
  const dir = pasta(MIGRACOES);
  const r = await runMigrations(client, { dir, dryRun: true, log: silencioso });
  assert.deepEqual(r.pending, ['001_a.sql', '002_b.sql', '003_c.sql']);
  assert.deepEqual(r.applied, []);
  assert.equal(await tabelaExiste(client, 't_a'), false);
  assert.equal(await tabelaExiste(client, 'schema_migrations'), false);
});

test('--dry-run depois de aplicar lista só o que falta', async () => {
  const { client } = await novoBanco();
  const dir = pasta(MIGRACOES);
  await runMigrations(client, { dir, log: silencioso });
  fs.writeFileSync(path.join(dir, '004_d.sql'), 'CREATE TABLE t_d (id int);');
  const r = await runMigrations(client, { dir, dryRun: true, log: silencioso });
  assert.deepEqual(r.pending, ['004_d.sql']);
  assert.equal(await tabelaExiste(client, 't_d'), false);
});

test('baseline: registra como aplicadas, sem executar, só até o número dado', async () => {
  const { client } = await novoBanco();
  const dir = pasta(MIGRACOES);
  const r = await runMigrations(client, { dir, baselineThrough: 2, log: silencioso });
  assert.deepEqual(r.baselined, ['001_a.sql', '002_b.sql']);
  assert.deepEqual(r.applied, [], 'baseline nunca executa SQL');
  assert.equal(await tabelaExiste(client, 't_a'), false);
  assert.deepEqual((await ledger(client)).map((l) => l.name), ['001_a.sql', '002_b.sql']);
  // depois do baseline, o modo normal aplica só o que sobrou
  const seguinte = await runMigrations(client, { dir, log: silencioso });
  assert.deepEqual(seguinte.applied, ['003_c.sql']);
});

test('baseline repetido é inofensivo e --dry-run não registra', async () => {
  const { client } = await novoBanco();
  const dir = pasta(MIGRACOES);
  const seco = await runMigrations(client, { dir, baselineThrough: 3, dryRun: true, log: silencioso });
  assert.deepEqual(seco.baselined, ['001_a.sql', '002_b.sql', '003_c.sql']);
  assert.equal(await tabelaExiste(client, 'schema_migrations'), false);
  await runMigrations(client, { dir, baselineThrough: 3, log: silencioso });
  const deNovo = await runMigrations(client, { dir, baselineThrough: 3, log: silencioso });
  assert.deepEqual(deNovo.baselined, []);
  assert.equal((await ledger(client)).length, 3);
});

test('falha no meio: faz rollback do arquivo, mantém os anteriores e para', async () => {
  const { client } = await novoBanco();
  const dir = pasta({
    '001_a.sql': 'CREATE TABLE t_a (id int);',
    '002_ruim.sql': 'CREATE TABLE t_ruim (id int); INSERT INTO tabela_que_nao_existe VALUES (1);',
    '003_c.sql': 'CREATE TABLE t_c (id int);',
  });
  await assert.rejects(() => runMigrations(client, { dir, log: silencioso }), /002_ruim\.sql/);
  assert.equal(await tabelaExiste(client, 't_a'), true, 'a anterior ficou');
  assert.equal(await tabelaExiste(client, 't_ruim'), false, 'a que falhou foi desfeita');
  assert.equal(await tabelaExiste(client, 't_c'), false, 'a seguinte não rodou');
  assert.deepEqual((await ledger(client)).map((l) => l.name), ['001_a.sql']);
});

test('falha dentro de BEGIN…COMMIT do próprio arquivo também é desfeita', async () => {
  const { client } = await novoBanco();
  const dir = pasta({
    '001_a.sql': 'BEGIN;\nCREATE TABLE t_a (id int);\nINSERT INTO nao_existe VALUES (1);\nCOMMIT;',
    '002_b.sql': 'CREATE TABLE t_b (id int);',
  });
  await assert.rejects(() => runMigrations(client, { dir, log: silencioso }), /001_a\.sql/);
  assert.equal(await tabelaExiste(client, 't_a'), false);
  // a sessão não ficou presa numa transação abortada
  const r = await client.query('SELECT 1 AS ok');
  assert.equal(r.rows[0].ok, 1);
});

test('arquivos com BEGIN…COMMIT próprios (como 001–005) aplicam normalmente', async () => {
  const { client } = await novoBanco();
  const dir = pasta({ '001_a.sql': 'BEGIN;\nCREATE TABLE t_a (id int);\nCOMMIT;' });
  const r = await runMigrations(client, { dir, log: silencioso });
  assert.deepEqual(r.applied, ['001_a.sql']);
  assert.equal(await tabelaExiste(client, 't_a'), true);
});

test('drift: arquivo já aplicado que mudou aborta antes de aplicar qualquer coisa', async () => {
  const { client } = await novoBanco();
  const dir = pasta(MIGRACOES);
  await runMigrations(client, { dir, log: silencioso });
  fs.writeFileSync(path.join(dir, '001_a.sql'), 'CREATE TABLE IF NOT EXISTS t_a (id int, extra int);');
  fs.writeFileSync(path.join(dir, '004_d.sql'), 'CREATE TABLE t_d (id int);');
  await assert.rejects(() => runMigrations(client, { dir, log: silencioso }), /drift.*001_a\.sql/is);
  assert.equal(await tabelaExiste(client, 't_d'), false, 'nada novo foi aplicado');
});

test('migração registrada que não tem mais arquivo é só avisada', async () => {
  const { client } = await novoBanco();
  const dir = pasta(MIGRACOES);
  await runMigrations(client, { dir, log: silencioso });
  fs.rmSync(path.join(dir, '003_c.sql'));
  const mensagens = [];
  const r = await runMigrations(client, { dir, log: (m) => mensagens.push(m) });
  assert.deepEqual(r.applied, []);
  assert.deepEqual(r.missingFiles, ['003_c.sql']);
  assert.ok(mensagens.some((m) => m.includes('003_c.sql')));
});

test('integração: as migrações reais de sql/ aplicam em banco vazio e a repetição não faz nada', async () => {
  const { client } = await novoBanco();
  const primeira = await runMigrations(client, { dir: SQL_REAL, log: silencioso });
  const arquivos = listMigrations(SQL_REAL).map((m) => m.name);
  assert.deepEqual(primeira.applied, arquivos);
  assert.ok(arquivos.length >= 18, 'esperava ao menos as migrações 001–018');
  const segunda = await runMigrations(client, { dir: SQL_REAL, log: silencioso });
  assert.deepEqual(segunda.applied, []);
  assert.equal(await tabelaExiste(client, 'feature_flags'), true);
});

test('integração: baseline até 015 + aplicação das demais (o caso de produção hoje)', async () => {
  const { client } = await novoBanco();
  // simula "001–015 já aplicadas à mão"
  const todas = listMigrations(SQL_REAL);
  for (const m of todas.filter((x) => x.number <= 15)) await client.query(m.sql);
  await runMigrations(client, { dir: SQL_REAL, baselineThrough: 15, log: silencioso });
  const r = await runMigrations(client, { dir: SQL_REAL, log: silencioso });
  assert.deepEqual(r.applied, todas.filter((x) => x.number > 15).map((x) => x.name));
  assert.equal(await tabelaExiste(client, 'mfa_credentials'), true);
});

test('parseArgs: opções e padrão do diretório', () => {
  const o = parseArgs(['--dry-run', '--baseline-through', '015', '--dir', 'x/sql']);
  assert.deepEqual(o, { dryRun: true, baselineThrough: 15, dir: 'x/sql' });
  const padrao = parseArgs([]);
  assert.equal(padrao.dryRun, false);
  assert.equal(padrao.baselineThrough, undefined);
  assert.match(padrao.dir, /sql$/);
});

test('parseArgs: rejeita opção desconhecida e número inválido', () => {
  assert.throws(() => parseArgs(['--apagar-tudo']), /desconhecida/i);
  assert.throws(() => parseArgs(['--baseline-through', 'abc']), /--baseline-through/);
  assert.throws(() => parseArgs(['--baseline-through']), /--baseline-through/);
});
