/**
 * study-io.js — exportar e importar o progresso de "Meu estudo" (Onda 3.5, A.3).
 * Funções puras (sem DOM nem banco): o store e a interface só chamam estas.
 * O arquivo é um JSON do próprio aluno (histórico, fixados, anotações); a
 * importação valida o formato e mescla sem duplicar nem apagar nada.
 */

export const EXPORT_VERSION = 1;
const SID_RE = /^[A-Za-z0-9:_.-]{1,120}$/;
const MAX_HISTORY = 200;
const MAX_TEXT = 2000;

export function buildExport({ history = [], pins = [], notes = [] }, now = Date.now()) {
  return { app: 'laift-atlas', v: EXPORT_VERSION, exportedAt: new Date(now).toISOString(), history, pins, notes };
}

const str = (v, max) => String(v == null ? '' : v).slice(0, max);

/** Valida e normaliza o arquivo; devolve { ok, data } ou { ok:false, error }. */
export function validateImport(raw) {
  if (!raw || typeof raw !== 'object' || raw.app !== 'laift-atlas') return { ok: false, error: 'Este arquivo não é um progresso do Atlas.' };
  if (raw.v !== EXPORT_VERSION) return { ok: false, error: 'Versão do arquivo não reconhecida.' };
  const okSid = (e) => e && typeof e.sid === 'string' && SID_RE.test(e.sid);
  const history = (Array.isArray(raw.history) ? raw.history : []).filter(okSid)
    .map((e) => ({ type: str(e.type || 'select', 20), sid: e.sid, label: str(e.label, 160), at: Number.isFinite(e.at) ? e.at : 0 })).slice(-MAX_HISTORY);
  const pins = (Array.isArray(raw.pins) ? raw.pins : []).filter(okSid).map((e) => ({ sid: e.sid, label: str(e.label, 160), at: Number.isFinite(e.at) ? e.at : 0 }));
  const notes = (Array.isArray(raw.notes) ? raw.notes : []).filter((e) => okSid(e) && typeof e.text === 'string').map((e) => ({ sid: e.sid, text: str(e.text, MAX_TEXT), at: Number.isFinite(e.at) ? e.at : 0 }));
  return { ok: true, data: { history, pins, notes } };
}

/**
 * O que falta gravar: histórico que ainda não existe (mesmo tipo, sid e hora),
 * fixados novos e anotações que não existem ou que são mais recentes.
 */
export function planMerge(existing, incoming) {
  const hKey = (e) => `${e.type}|${e.sid}|${e.at}`;
  const haveH = new Set((existing.history || []).map(hKey));
  const havePin = new Set((existing.pins || []).map((p) => p.sid));
  const noteAt = new Map((existing.notes || []).map((n) => [n.sid, n.at || 0]));
  return {
    history: incoming.history.filter((e) => !haveH.has(hKey(e))),
    pins: incoming.pins.filter((p) => !havePin.has(p.sid)),
    notes: incoming.notes.filter((n) => !noteAt.has(n.sid) || (n.at || 0) > noteAt.get(n.sid)),
  };
}

/** Resumo para o aluno depois de importar. */
export function summarize(plan) {
  const parts = [];
  if (plan.history.length) parts.push(`${plan.history.length} no histórico`);
  if (plan.pins.length) parts.push(`${plan.pins.length} fixada${plan.pins.length === 1 ? '' : 's'}`);
  if (plan.notes.length) parts.push(`${plan.notes.length} anotaç${plan.notes.length === 1 ? 'ão' : 'ões'}`);
  return parts.length ? `Importado: ${parts.join(', ')}.` : 'Nada novo para importar: tudo já estava aqui.';
}

/** Última estrutura estudada (para o botão "Continuar"): seleção mais recente do histórico. */
export function lastStudiedSid(history, exists = () => true) {
  const sorted = [...(history || [])].filter((e) => e && e.type === 'select' && e.sid).sort((a, b) => (b.at || 0) - (a.at || 0));
  const hit = sorted.find((e) => exists(e.sid));
  return hit ? hit.sid : null;
}
