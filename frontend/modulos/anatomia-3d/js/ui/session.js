/**
 * session.js — "continuar de onde parou" e link direto para uma estrutura.
 * ---------------------------------------------------------------------------
 * Funções puras (testáveis sem DOM): o orquestrador (js/main.js) decide
 * quando ler/gravar e como aplicar.
 *
 * Sessão salva em localStorage (`atlas.session.v1`):
 *   { schemaVersion: 1, savedAt, selectedSid, mode,
 *     layers: { <camada>: boolean },
 *     camera: { position: [x,y,z], target: [x,y,z] } }
 * Registro de outra versão é descartado (apagado) na leitura; um sid salvo
 * que não existe mais no corpo 3D é zerado junto com a câmera (ver
 * `dropUnknownSid`) — senão a câmera voltaria apontando para o vazio.
 *
 * Link direto (hash da página do atlas): `#sid=<sid>&view=<vista>`.
 */

export const SESSION_KEY = 'atlas.session.v1';
export const SESSION_SCHEMA_VERSION = 1;
/** Flag de sessionStorage: o "Continuar" é oferecido uma vez por aba. */
export const RESUME_OFFERED_KEY = 'atlas.resumeOffered';
/** Sessões mais velhas que isso não são oferecidas. */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const SID_RE = /^(fma:[0-9]+|za:[a-z0-9]+(-[a-z0-9]+)*)$/;
const VIEWS = new Set(['anterior', 'posterior', 'esquerda', 'direita', 'superior', 'inferior']);

const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

/**
 * Lê `#sid=…&view=…`. Valores fora do formato são ignorados.
 * @param {string} hash ex.: location.hash
 * @returns {{ sid: (string|null), view: (string|null) }}
 */
export function parseAtlasHash(hash) {
  const out = { sid: null, view: null };
  if (typeof hash !== 'string') return out;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const sid = params.get('sid');
  const view = params.get('view');
  if (sid && SID_RE.test(sid)) out.sid = sid;
  if (view && VIEWS.has(view)) out.view = view;
  return out;
}

/** Monta o hash do link direto. */
export function buildAtlasHash({ sid, view } = {}) {
  const params = new URLSearchParams();
  if (sid && SID_RE.test(sid)) params.set('sid', sid);
  if (view && VIEWS.has(view)) params.set('view', view);
  const s = params.toString();
  return s ? `#${s}` : '';
}

/**
 * Converte o estado do atlas no registro salvo.
 * @param {{ selectedSid?: string, mode?: string, layers?: Object }} state store.get()
 * @param {{ position: number[], target: number[] }} [camera]
 * @param {number} [now]
 */
export function snapshotSession(state, camera, now = Date.now()) {
  const layers = {};
  for (const [id, l] of Object.entries((state && state.layers) || {})) layers[id] = !!(l && l.visible);
  const snap = { schemaVersion: SESSION_SCHEMA_VERSION, savedAt: now, selectedSid: (state && state.selectedSid) || null, mode: (state && state.mode) || 'explorar', layers };
  if (camera && isVec3(camera.position) && isVec3(camera.target)) {
    snap.camera = { position: camera.position.slice(), target: camera.target.slice() };
  }
  return snap;
}

/**
 * Valida um registro salvo. Devolve null se inválido, velho ou sem nada que
 * valha retomar (sem seleção e no modo Explorar).
 */
export function validateSession(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== SESSION_SCHEMA_VERSION) return null;
  if (!Number.isFinite(raw.savedAt) || now - raw.savedAt > SESSION_MAX_AGE_MS) return null;
  const selectedSid = typeof raw.selectedSid === 'string' && SID_RE.test(raw.selectedSid) ? raw.selectedSid : null;
  const mode = typeof raw.mode === 'string' ? raw.mode : 'explorar';
  if (!selectedSid && mode === 'explorar') return null;
  const layers = {};
  if (raw.layers && typeof raw.layers === 'object') {
    for (const [id, visible] of Object.entries(raw.layers)) layers[id] = !!visible;
  }
  const camera = raw.camera && isVec3(raw.camera.position) && isVec3(raw.camera.target)
    ? { position: raw.camera.position.slice(), target: raw.camera.target.slice() } : null;
  return { schemaVersion: SESSION_SCHEMA_VERSION, savedAt: raw.savedAt, selectedSid, mode, layers, camera };
}

/**
 * Lê a sessão (try/catch: modo privado/armazenamento bloqueado → null).
 * Registro inválido ou de outra versão é apagado.
 */
export function readSession(storage, now = Date.now()) {
  try {
    const text = storage && storage.getItem(SESSION_KEY);
    if (!text) return null;
    const saved = validateSession(JSON.parse(text), now);
    if (!saved && typeof storage.removeItem === 'function') storage.removeItem(SESSION_KEY);
    return saved;
  } catch (e) {
    try { if (storage && typeof storage.removeItem === 'function') storage.removeItem(SESSION_KEY); } catch (e2) { /* bloqueado */ }
    return null;
  }
}

/**
 * Sid salvo que não existe mais (nomes trocados, GLB regerado): zera a
 * seleção e a câmera. Devolve null se não sobrou nada para retomar.
 * @param {Object} saved resultado de readSession
 * @param {(sid: string) => boolean} exists
 */
export function dropUnknownSid(saved, exists) {
  if (!saved) return null;
  if (!saved.selectedSid || exists(saved.selectedSid)) return saved;
  const next = { ...saved, selectedSid: null, camera: null };
  return next.mode === 'explorar' ? null : next;
}

/** O "Continuar" já foi oferecido nesta aba? (sessionStorage, com try/catch) */
export function resumeAlreadyOffered(session) {
  try { return !!(session && session.getItem(RESUME_OFFERED_KEY)); } catch (e) { return false; }
}
export function markResumeOffered(session) {
  try { if (session) session.setItem(RESUME_OFFERED_KEY, '1'); } catch (e) { /* bloqueado */ }
}

/** Grava a sessão; falha silenciosa é aceitável (conveniência, não dado). */
export function writeSession(storage, snap) {
  try {
    if (storage) storage.setItem(SESSION_KEY, JSON.stringify(snap));
    return true;
  } catch (e) {
    return false;
  }
}
