/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * gen-agent-registry.mjs — gera worker/src/agents/registry.generated.js e confere worker/agents/agents.lock.json
 * a partir de worker/agents/personas/*.md.
 *
 * - Cada persona é um .md com frontmatter ESTRITO (subconjunto de YAML: chaves simples, um nível de mapa, listas
 *   em linha, comentários com " #"). Chave desconhecida, tipo errado ou valor fora da faixa derruba a geração.
 * - O Worker não lê arquivo em execução: o registro gerado é um módulo JS com os dados e o prompt.
 * - agents.lock.json guarda versão + hash por persona. O hash só pode mudar junto com um aumento de versão:
 *   mexeu no prompt sem subir a versão, a geração falha (e o teste de drift também).
 * - Zero dependência: parser próprio (parseFrontmatter) e node:crypto só no build.
 *
 * Uso:  cd worker && npm run gen:agents
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PERSONAS_DIR = path.resolve(HERE, '..', 'agents', 'personas');
export const LOCK_PATH = path.resolve(HERE, '..', 'agents', 'agents.lock.json');
export const REGISTRY_PATH = path.resolve(HERE, '..', 'src', 'agents', 'registry.generated.js');
const HASH_LEN = 12;

// ---------------------------------------------------------------------------
// Parser do frontmatter
// ---------------------------------------------------------------------------
function parseScalar(raw) {
  const v = raw.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(',').map(parseScalar) : [];
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.length >= 2 && /^(["']).*\1$/.test(v)) return v.slice(1, -1);
  return v;
}

const withoutComment = (line) => (/["']/.test(line) ? line : line.replace(/\s+#.*$/, ''));

function readLine(raw, lineNo) {
  const line = withoutComment(raw).replace(/\s+$/, '');
  if (!line.trim()) return null;
  const indent = line.length - line.trimStart().length;
  const kv = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/.exec(line.trim());
  if ((indent !== 0 && indent !== 2) || !kv) throw new Error('frontmatter, linha ' + lineNo + ': formato inválido');
  return { indent, key: kv[1], rest: kv[2], lineNo };
}

/** @returns {{ meta: object, body: string }} */
export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(String(text).replace(/\r\n?/g, '\n'));
  if (!match) throw new Error('frontmatter ausente (o arquivo precisa começar com ---)');
  const meta = {};
  let open = null;
  match[1].split('\n').forEach((raw, i) => {
    const row = readLine(raw, i + 2);
    if (!row) return;
    const target = row.indent === 2 ? open : meta;
    if (!target) throw new Error('frontmatter, linha ' + row.lineNo + ': recuo sem mapa aberto');
    if (Object.prototype.hasOwnProperty.call(target, row.key)) throw new Error('frontmatter, linha ' + row.lineNo + ': chave repetida ' + row.key);
    if (row.rest === undefined) {
      if (row.indent === 2) throw new Error('frontmatter, linha ' + row.lineNo + ': só um nível de mapa');
      open = {};
      meta[row.key] = open;
      return;
    }
    target[row.key] = parseScalar(row.rest);
    if (row.indent === 0) open = null;
  });
  return { meta, body: match[2].trim() };
}

// ---------------------------------------------------------------------------
// Esquema estrito
// ---------------------------------------------------------------------------
const isStr = (re, max) => (v) => typeof v === 'string' && v.length <= max && re.test(v);
const isInt = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;
const isList = (item, min = 0) => (v) => Array.isArray(v) && v.length >= min && v.every(item);
const oneOf = (...values) => (v) => values.includes(v);
const isBool = (v) => typeof v === 'boolean';
const mapOf = (shape) => (v) => !!v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join() === Object.keys(shape).sort().join()
  && Object.keys(shape).every((k) => shape[k](v[k]));

const SCHEMA = {
  id: isStr(/^[a-z][a-z0-9-]{2,39}$/, 40),
  name: isStr(/^\S.*$/, 60),
  version: isStr(/^\d+\.\d+\.\d+$/, 20),
  status: oneOf('active', 'draft'),
  description: isStr(/^\S.*$/, 300),
  feature: isStr(/^[a-z][a-z0-9_]{1,39}$/, 40),
  tier: oneOf('fast', 'smart'),
  temperature: (v) => typeof v === 'number' && v >= 0 && v <= 1,
  maxTokens: isInt(50, 4000),
  roles: isList(oneOf('member', 'admin'), 1),
  flag: isStr(/^[a-z][a-z0-9_]{1,63}$/, 64),
  capabilities: isList(isStr(/^[a-z][a-z0-9_]*$/, 40), 1),
  memory: mapOf({ read: isBool, write: isBool }),
  context: mapOf({ module: isBool, topic: isBool, library: isInt(0, 3), history: isInt(0, 8) }),
  guardrails: mapOf({
    input: isList(isStr(/^I[1-7]$/, 2)),
    output: isList(isStr(/^O[1-6]$/, 2)),
  }),
  limits: mapOf({ messageMax: isInt(50, 2000), historyTurnMax: isInt(50, 1000), replyMax: isInt(100, 6000) }),
  citation: mapOf({ mode: oneOf('allowlist', 'none'), maxSources: isInt(0, 3) }),
  dose_policy: oneOf('never'),
};

export function validateMeta(meta) {
  const problems = [];
  Object.keys(meta).forEach((k) => { if (!(k in SCHEMA)) problems.push('campo desconhecido: ' + k); });
  Object.keys(SCHEMA).forEach((k) => {
    if (!(k in meta)) problems.push('campo ausente: ' + k);
    else if (!SCHEMA[k](meta[k])) problems.push('valor inválido em ' + k);
  });
  return problems;
}

// ---------------------------------------------------------------------------
// Persona -> agente do registro
// ---------------------------------------------------------------------------
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => Object.assign(acc, { [k]: canonical(value[k]) }), {});
  }
  return value;
}

export function hashPersona(meta, prompt) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical({ meta, prompt }))).digest('hex').slice(0, HASH_LEN);
}

export function buildAgent(fileName, text) {
  const { meta, body } = parseFrontmatter(text);
  const problems = validateMeta(meta);
  if (meta.id && fileName.replace(/\.md$/, '') !== meta.id) problems.push('id difere do nome do arquivo');
  if (!body) problems.push('prompt vazio');
  if (problems.length) throw new Error(fileName + ': ' + problems.join('; '));
  const { dose_policy: dosePolicy, ...rest } = meta;
  const hash = hashPersona(meta, body);
  return { ...rest, dosePolicy, prompt: body, hash, ref: meta.id + '@' + meta.version + '#' + hash };
}

export function loadPersonas(dir = PERSONAS_DIR) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const agents = files.map((f) => buildAgent(f, fs.readFileSync(path.join(dir, f), 'utf8')));
  const ids = new Set(agents.map((a) => a.id));
  if (ids.size !== agents.length) throw new Error('id de persona repetido');
  return agents;
}

export function renderRegistry(agents) {
  return [
    '/*',
    ' * Plataforma de Membros LAIFT',
    ' * © 2026 Daniel Pires Francisco. Todos os direitos reservados.',
    ' * Licença proprietária: ver LICENSE na raiz do repositório.',
    ' */',
    '// GERADO por worker/scripts/gen-agent-registry.mjs a partir de worker/agents/personas/*.md. NÃO edite à mão.',
    '// Para mudar uma persona: edite o .md, aumente a version e rode `npm run gen:agents`.',
    'export const AGENTS = Object.freeze(' + JSON.stringify(agents, null, 2) + ');',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// agents.lock.json: versão + hash; o hash só muda com aumento de versão
// ---------------------------------------------------------------------------
const versionParts = (v) => v.split('.').map(Number);

function isNewer(a, b) {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

export function checkLock(agents, lock) {
  const problems = [];
  agents.forEach((a) => {
    const entry = lock[a.id];
    if (!entry) return;
    if (isNewer(entry.version, a.version)) problems.push(a.id + ': a versão diminuiu (' + entry.version + ' -> ' + a.version + ')');
    else if (entry.version === a.version && entry.hash !== a.hash) problems.push(a.id + ': o conteúdo mudou sem aumentar a versão (' + a.version + ')');
  });
  Object.keys(lock).forEach((id) => {
    if (!agents.some((a) => a.id === id)) problems.push(id + ': persona removida; apague a entrada de agents.lock.json de propósito');
  });
  return problems;
}

export function nextLock(agents) {
  return agents.reduce((acc, a) => Object.assign(acc, { [a.id]: { version: a.version, hash: a.hash } }), {});
}

export const renderLock = (lock) => JSON.stringify(lock, null, 2) + '\n';

function readLock() {
  return fs.existsSync(LOCK_PATH) ? JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')) : {};
}

function main() {
  const agents = loadPersonas();
  const problems = checkLock(agents, readLock());
  if (problems.length) {
    problems.forEach((p) => console.error('ERRO ' + p));
    process.exit(1);
  }
  fs.writeFileSync(REGISTRY_PATH, renderRegistry(agents));
  fs.writeFileSync(LOCK_PATH, renderLock(nextLock(agents)));
  console.log('registry.generated.js e agents.lock.json atualizados (' + agents.length + ' personas).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
