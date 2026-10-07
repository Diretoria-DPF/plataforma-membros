/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * migrate.mjs
 * Aplica as migrações de sql/NNN_*.sql num banco Postgres (Neon) e guarda o
 * que já foi aplicado na tabela schema_migrations(name, hash, applied_at).
 *
 *   - ordem numérica pelo prefixo (999 vem antes de 1000);
 *   - só aplica o que ainda não está registrado: rodar duas vezes não faz nada;
 *   - cada arquivo roda como veio (os 001–005 têm BEGIN/COMMIT próprios); se
 *     falhar, é desfeito (ROLLBACK) e o runner PARA, sem tocar nos seguintes;
 *   - drift: se um arquivo já aplicado mudou de conteúdo (SHA-256 diferente),
 *     aborta antes de aplicar qualquer coisa. Nunca reaplica nem edita o passado;
 *   - sql/down/ e sql/ops/ nunca são lidos (reversão e papéis são manuais).
 *
 * Uso (DATABASE_URL vem do ambiente; prefira a URL DIRETA do Neon, não a do pooler):
 *   DATABASE_URL=postgres://... node tools/db/migrate.mjs --dry-run
 *   DATABASE_URL=postgres://... node tools/db/migrate.mjs
 *   DATABASE_URL=postgres://... node tools/db/migrate.mjs --baseline-through 015
 *
 * --dry-run             só lista o que seria feito; não escreve nada
 * --baseline-through N  registra como já aplicadas (SEM executar) as migrações
 *                       com número <= N, para bancos migrados à mão; só registra
 * --dir CAMINHO         pasta das migrações (padrão: sql/ na raiz do repositório)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const DIR_PADRAO = path.resolve(aqui, '..', '..', 'sql');
const NOME_MIGRACAO = /^(\d{3,})_.+\.sql$/;

const CRIAR_LEDGER = `CREATE TABLE IF NOT EXISTS schema_migrations (
  name       text PRIMARY KEY,
  hash       text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

const escreverLinha = (mensagem) => process.stdout.write(`${mensagem}\n`);

/** SHA-256 do texto com fim de linha normalizado (CRLF do Windows = LF do CI). */
const hashDe = (sql) => crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

/**
 * Lê as migrações de uma pasta, em ordem numérica.
 * @param {string} dir
 * @returns {{name: string, number: number, hash: string, sql: string}[]}
 */
export function listMigrations(dir) {
  const lista = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && NOME_MIGRACAO.test(entrada.name))
    .map((entrada) => {
      const sql = fs.readFileSync(path.join(dir, entrada.name), 'utf8');
      return { name: entrada.name, number: parseInt(NOME_MIGRACAO.exec(entrada.name)[1], 10), hash: hashDe(sql), sql };
    })
    .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));

  for (let i = 1; i < lista.length; i += 1) {
    if (lista[i].number === lista[i - 1].number) {
      const numero = String(lista[i].number).padStart(3, '0');
      throw new Error(`Número de migração repetido (${numero}): ${lista[i - 1].name} e ${lista[i].name}`);
    }
  }
  return lista;
}

/** Lê o ledger; sem a tabela (primeira execução) devolve vazio, sem criá-la. */
async function lerLedger(client) {
  const existe = await client.query("SELECT to_regclass('public.schema_migrations') AS t");
  if (existe.rows[0].t === null) return new Map();
  const { rows } = await client.query('SELECT name, hash FROM schema_migrations');
  return new Map(rows.map((linha) => [linha.name, linha.hash]));
}

const registrar = (client, migracao) =>
  client.query(
    'INSERT INTO schema_migrations (name, hash) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
    [migracao.name, migracao.hash],
  );

/** Desfaz a transação aberta por um arquivo que falhou (não esconde o erro original). */
async function desfazer(client) {
  try { await client.query('ROLLBACK'); } catch { /* já estava fora de transação */ }
}

/**
 * @param {{query: (text: string, params?: unknown[]) => Promise<{rows: any[]}>}} client conexão no estilo `pg`
 * @param {{dir?: string, dryRun?: boolean, baselineThrough?: number, log?: (m: string) => void}} opcoes
 * @returns {Promise<{applied: string[], baselined: string[], pending: string[], missingFiles: string[]}>}
 */
export async function runMigrations(client, { dir = DIR_PADRAO, dryRun = false, baselineThrough, log = escreverLinha } = {}) {
  const arquivos = listMigrations(dir);
  const registradas = await lerLedger(client);

  const alteradas = arquivos.filter((m) => registradas.has(m.name) && registradas.get(m.name) !== m.hash);
  if (alteradas.length) {
    throw new Error(
      `Drift: ${alteradas.map((m) => m.name).join(', ')} mudou depois de aplicado. `
      + 'Migração aplicada não se edita: crie uma nova (NNN+1) com a correção.',
    );
  }

  const nomesDosArquivos = new Set(arquivos.map((m) => m.name));
  const missingFiles = [...registradas.keys()].filter((nome) => !nomesDosArquivos.has(nome));
  for (const nome of missingFiles) log(`AVISO: ${nome} está registrada no banco, mas o arquivo não existe mais.`);

  const pendentes = arquivos.filter((m) => !registradas.has(m.name));
  const resultado = { applied: [], baselined: [], pending: [], missingFiles };

  if (baselineThrough !== undefined) {
    const paraRegistrar = pendentes.filter((m) => m.number <= baselineThrough);
    if (!dryRun && paraRegistrar.length) {
      await client.query(CRIAR_LEDGER);
      for (const m of paraRegistrar) await registrar(client, m);
    }
    for (const m of paraRegistrar) log(`${dryRun ? '[dry-run] registraria' : 'registrada'} (baseline): ${m.name}`);
    return { ...resultado, baselined: paraRegistrar.map((m) => m.name), pending: pendentes.filter((m) => m.number > baselineThrough).map((m) => m.name) };
  }

  if (dryRun) {
    for (const m of pendentes) log(`[dry-run] aplicaria: ${m.name}`);
    if (!pendentes.length) log('Nada pendente.');
    return { ...resultado, pending: pendentes.map((m) => m.name) };
  }

  await client.query(CRIAR_LEDGER);
  for (const m of pendentes) {
    try {
      await client.query(m.sql);
    } catch (err) {
      await desfazer(client);
      throw new Error(`Migração ${m.name} falhou e foi desfeita: ${(err && err.message) || err}`);
    }
    await registrar(client, m);
    resultado.applied.push(m.name);
    log(`aplicada: ${m.name}`);
  }
  if (!pendentes.length) log('Nada pendente.');
  return resultado;
}

/**
 * @param {string[]} argv
 * @returns {{dryRun: boolean, baselineThrough?: number, dir: string}}
 */
export function parseArgs(argv) {
  const opcoes = { dryRun: false, dir: DIR_PADRAO };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--dry-run') {
      opcoes.dryRun = true;
    } else if (flag === '--baseline-through') {
      const valor = argv[i + 1];
      const n = Number(valor);
      if (valor === undefined || valor.startsWith('--') || !Number.isInteger(n) || n < 0) {
        throw new Error(`--baseline-through precisa de um número inteiro (recebi "${valor ?? ''}")`);
      }
      opcoes.baselineThrough = n;
      i += 1;
    } else if (flag === '--dir') {
      if (!argv[i + 1]) throw new Error('--dir precisa de um caminho');
      opcoes.dir = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`Opção desconhecida: ${flag}`);
    }
  }
  return opcoes;
}

async function main() {
  const opcoes = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente (staging ou produção); nada foi feito.');

  const destino = new URL(url);
  escreverLinha(`Banco: ${destino.hostname}${destino.pathname}${opcoes.dryRun ? ' (dry-run)' : ''}`);

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await runMigrations(client, opcoes);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`${(err && err.message) || err}\n`);
    process.exitCode = 1;
  });
}
