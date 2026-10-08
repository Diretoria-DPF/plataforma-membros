/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * featureFlagService.js
 * Chaves liga/desliga (tabela feature_flags, sql/016). Cada funcionalidade
 * nova nasce atrás de uma flag, então desligar = rollback imediato, sem deploy.
 *
 * Avaliação (evaluateFlag, pura e testada):
 *   enabled=false                  → desligada para todos;
 *   conditions.role                → só esses papéis ("admin" ou ["admin","member"]);
 *   conditions.profile_ids         → só essas pessoas;
 *   rollout_pct < 100              → percentual decidido por hash estável de
 *                                    (chave + pessoa): a mesma pessoa cai
 *                                    sempre do mesmo lado. Sem identidade
 *                                    (visitante anônimo) só vale com 100.
 *
 * Leitura com cache de 60 s por instância do Worker (memória, sem gastar as
 * 1.000 escritas/dia do KV). Mudança feita pelo admin vale na hora na
 * instância que a gravou e em até 60 s nas demais. Se a tabela ainda não
 * existe (código implantado antes da migração 016), todas as flags ficam
 * desligadas — o comportamento anterior.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';

export const FLAG_CACHE_TTL_MS = 60 * 1000;
const FLAG_KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROFILE_IDS = 50;
const KNOWN_CONDITIONS = ['role', 'profile_ids'];

let cache = { at: 0, flags: null };

export function __resetFlagCacheForTests() {
  cache = { at: 0, flags: null };
}

/** FNV-1a de 32 bits → 0..99. Determinístico e sem custo (sem crypto assíncrono). */
export function rolloutBucket(key, profileId) {
  const text = key + ':' + profileId;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

function matchesConditions(conditions, identity) {
  const cond = conditions && typeof conditions === 'object' ? conditions : {};
  if (cond.role !== undefined) {
    const roles = [].concat(cond.role);
    if (!identity || roles.indexOf(identity.role) === -1) return false;
  }
  if (cond.profile_ids !== undefined) {
    const ids = Array.isArray(cond.profile_ids) ? cond.profile_ids : [];
    if (!identity || ids.indexOf(identity.profileId) === -1) return false;
  }
  return true;
}

export function evaluateFlag(flag, identity) {
  if (!flag || flag.enabled !== true) return false;
  if (!matchesConditions(flag.conditions, identity)) return false;
  const pct = flag.rollout_pct === undefined || flag.rollout_pct === null ? 100 : Number(flag.rollout_pct);
  if (pct >= 100) return true;
  if (pct <= 0 || !identity) return false;
  return rolloutBucket(flag.key, identity.profileId) < pct;
}

/** Tabela ainda não migrada (Postgres 42P01). Só este caso vale como "tudo desligado". */
export function isMissingTable(err) {
  return !!err && (err.code === '42P01' || /relation .* does not exist/i.test(String(err.message || '')));
}

async function loadFlags(sql, now) {
  if (cache.flags && now - cache.at < FLAG_CACHE_TTL_MS) return cache.flags;
  try {
    const rows = await sql`SELECT key, enabled, rollout_pct, conditions FROM feature_flags`;
    const flags = {};
    (rows || []).forEach((r) => { flags[r.key] = r; });
    cache = { at: now, flags };
    return flags;
  } catch (err) {
    // Migração 016 ainda não aplicada: tudo desligado (comportamento anterior).
    // Guardado no cache pelo mesmo prazo, para não repetir a consulta que falha a cada chamada.
    if (isMissingTable(err)) {
      cache = { at: now, flags: {} };
      return {};
    }
    // Banco instável: usa o último valor conhecido. Sem ele, o erro SOBE — uma
    // falha transitória nunca pode virar "flag desligada" (falha aberta), em
    // especial para mfa_required.
    if (cache.flags) return cache.flags;
    throw err;
  }
}

export async function isEnabled(sql, key, identity, now = Date.now()) {
  const flags = await loadFlags(sql, now);
  return evaluateFlag(flags[key], identity);
}

/** Mapa { chave: boolean } para o cliente decidir o que mostrar. `identity` pode ser null. */
export async function getFlagsFor(sql, identity, now = Date.now()) {
  const flags = await loadFlags(sql, now);
  const out = {};
  Object.keys(flags).forEach((key) => { out[key] = evaluateFlag(flags[key], identity); });
  return out;
}

// Só estas chaves vão ao navegador (inclusive de anônimos). As de segurança
// (mfa_required...) e as internas (use_orchestrator, nvidia_fallback) ficam no servidor.
// selection_open abre e fecha o processo seletivo; ausente = fechado.
export const PUBLIC_FLAGS = ['ux_v2_enabled', 'chatbot_enabled', 'feedback_enabled', 'selection_open'];

export async function getPublicFlagsFor(sql, identity, now = Date.now()) {
  const all = await getFlagsFor(sql, identity, now);
  const out = {};
  PUBLIC_FLAGS.forEach((key) => { if (key in all) out[key] = all[key]; });
  return out;
}

// Flags que protegem a conta de todos: só valem para todos (sem rollout nem
// condições) e mudá-las exige reautenticação do admin (senha + segundo fator).
export const RESERVED_FLAGS = ['mfa_required'];

// ---------------------------------------------------------------------------
// Administração
// ---------------------------------------------------------------------------
function rowToDto(r) {
  return {
    key: r.key,
    enabled: r.enabled === true,
    rolloutPct: Number(r.rollout_pct),
    conditions: r.conditions || {},
    description: r.description || '',
    updatedAt: r.updated_at,
  };
}

export async function adminList(sql, identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  const rows = await sql`SELECT key, enabled, rollout_pct, conditions, description, updated_at FROM feature_flags ORDER BY key`;
  return { success: true, flags: (rows || []).map(rowToDto) };
}

function parseConditions(raw) {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw E.ValidationError('As condições precisam ser um objeto.');
  }
  const out = {};
  Object.keys(raw).forEach((name) => {
    if (KNOWN_CONDITIONS.indexOf(name) === -1) throw E.ValidationError('Condição desconhecida: ' + name + '.');
  });
  if (raw.role !== undefined) {
    const roles = [].concat(raw.role);
    const valid = Object.values(C.ROLES);
    if (!roles.length || roles.some((r) => valid.indexOf(r) === -1)) throw E.ValidationError('Papel inválido nas condições.');
    out.role = roles.length === 1 ? roles[0] : roles;
  }
  if (raw.profile_ids !== undefined) {
    const ids = raw.profile_ids;
    if (!Array.isArray(ids) || ids.length > MAX_PROFILE_IDS || ids.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
      throw E.ValidationError('profile_ids precisa ser uma lista de até ' + MAX_PROFILE_IDS + ' identificadores válidos.');
    }
    out.profile_ids = ids;
  }
  return out;
}

function parseInput(input) {
  const out = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') throw E.ValidationError('"enabled" precisa ser verdadeiro ou falso.');
    out.enabled = input.enabled;
  }
  if (input.rolloutPct !== undefined) {
    const n = input.rolloutPct;
    if (!Number.isInteger(n) || n < 0 || n > 100) throw E.ValidationError('O percentual precisa ser um inteiro de 0 a 100.');
    out.rolloutPct = n;
  }
  const conditions = parseConditions(input.conditions);
  if (conditions !== undefined) out.conditions = conditions;
  if (input.description !== undefined) {
    const d = S.normalizeText(input.description);
    if (d.length > 300) throw E.ValidationError('A descrição passou de 300 caracteres.');
    out.description = d;
  }
  return out;
}

export async function adminSet(sql, identity, key, rawInput, correlationId, options) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  const flagKey = S.normalizeText(key);
  if (!FLAG_KEY_RE.test(flagKey)) throw E.ValidationError('Chave de flag inválida (minúsculas, números e "_").');
  const input = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput) ? rawInput : {};
  const patch = parseInput(input);
  if (!Object.keys(patch).length) throw E.ValidationError('Nada para alterar.');

  if (RESERVED_FLAGS.indexOf(flagKey) !== -1) {
    const hasConditions = patch.conditions !== undefined && Object.keys(patch.conditions).length > 0;
    if ((patch.rolloutPct !== undefined && patch.rolloutPct !== 100) || hasConditions) {
      throw E.ValidationError('Esta flag de segurança vale para todos: não aceita percentual nem condições.');
    }
    // Reautenticação (senha + segundo fator) fornecida pelo handler.
    if (!options || typeof options.stepUp !== 'function') throw E.ForbiddenError('Esta flag exige reautenticação.');
    await options.stepUp();
  }

  const existing = await sql`SELECT key, enabled, rollout_pct, conditions, description FROM feature_flags WHERE key = ${flagKey}`;
  const base = existing && existing.length
    ? existing[0]
    : { enabled: false, rollout_pct: 100, conditions: {}, description: '' };

  const next = {
    enabled: patch.enabled !== undefined ? patch.enabled : base.enabled === true,
    rolloutPct: patch.rolloutPct !== undefined ? patch.rolloutPct : Number(base.rollout_pct),
    conditions: patch.conditions !== undefined ? patch.conditions : (base.conditions || {}),
    description: patch.description !== undefined ? patch.description : (base.description || ''),
  };

  const rows = await sql`
    INSERT INTO feature_flags (key, enabled, rollout_pct, conditions, description, updated_by, updated_at)
    VALUES (${flagKey}, ${next.enabled}, ${next.rolloutPct}, ${JSON.stringify(next.conditions)}::jsonb, ${next.description || null}, ${identity.profileId}::uuid, now())
    ON CONFLICT (key) DO UPDATE SET
      enabled = EXCLUDED.enabled, rollout_pct = EXCLUDED.rollout_pct, conditions = EXCLUDED.conditions,
      description = EXCLUDED.description, updated_by = EXCLUDED.updated_by, updated_at = now()
    RETURNING key, enabled, rollout_pct, conditions, description, updated_at
  `;
  __resetFlagCacheForTests();
  await Logging.logAudit(sql, correlationId, identity.profileId, 'SET_FEATURE_FLAG', 'feature_flag', null, 'success', {
    key: flagKey, enabled: next.enabled, rolloutPct: next.rolloutPct, conditions: next.conditions,
  });
  return { success: true, message: 'Flag atualizada.', flag: rowToDto(rows[0]) };
}
