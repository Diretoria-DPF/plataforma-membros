/**
 * revisao/review-core.js — núcleo da ferramenta de revisão do conselho
 * (PR 3.2, C1). Sem DOM: lê os lotes de uma onda, guarda as marcações e
 * gera o revisao-onda-NN.md no formato que
 * scripts/atlas/check-curated-signed.mjs (isSigned) aceita.
 *
 * As fichas vêm do computador do revisor (pasta das fichas pendentes,
 * onda-NN/lote-*.json, ou o pacote de scripts/atlas/pacote-onda.mjs);
 * nenhuma ficha pendente é publicada no site.
 */

/** Ordem das ondas (tools/atlas-content/fichas-lotes.mjs → ONDAS). */
export const ONDAS = Object.freeze(['cardiovascular', 'nervoso', 'respiratorio', 'digestorio', 'urinario',
  'endocrino', 'linfatico', 'esqueletico', 'muscular', 'articular']);

export const SISTEMA_LABEL = Object.freeze({
  cardiovascular: 'Cardiovascular', nervoso: 'Nervoso', respiratorio: 'Respiratório', digestorio: 'Digestório',
  urinario: 'Urinário', endocrino: 'Endócrino', linfatico: 'Linfático', esqueletico: 'Esquelético',
  muscular: 'Muscular', articular: 'Articular',
});

export const DECISIONS = Object.freeze(['aprovar', 'comentar', 'reprovar']);

/** Nº da onda a partir de um caminho ("onda-01/lote-01.json", "pacote-onda-03.json"). */
export function ondaFromPath(p) {
  const m = /onda-(\d{1,2})/.exec(String(p || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Junta os arquivos carregados numa lista de fichas, na ordem dos arquivos.
 * Aceita lotes (objeto sid → ficha) e o pacote ({ onda, lotes: { nome: lote } }).
 * @param {Array<{ name: string, json: any }>} files
 * @returns {{ onda: number|null, fichas: Array<{ sid: string, file: string, data: Object }>, errors: string[] }}
 */
export function collectFichas(files) {
  const fichas = [];
  const errors = [];
  const seen = new Set();
  let onda = null;
  const lotes = [];
  for (const f of files || []) {
    const j = f && f.json;
    if (j && typeof j === 'object' && j.lotes && typeof j.lotes === 'object' && !Array.isArray(j.lotes)) {
      if (Number.isInteger(j.onda)) onda = j.onda;
      for (const [name, lote] of Object.entries(j.lotes)) lotes.push({ name, lote });
    } else {
      onda = onda || ondaFromPath(f && f.name);
      lotes.push({ name: (f && f.name) || '?', lote: j });
    }
  }
  lotes.sort((a, b) => a.name.localeCompare(b.name));
  for (const { name, lote } of lotes) {
    if (!lote || typeof lote !== 'object' || Array.isArray(lote)) { errors.push(`${name}: não é um lote de fichas (objeto sid → ficha)`); continue; }
    for (const [sid, data] of Object.entries(lote)) {
      if (!/^za:/.test(sid) || !data || typeof data !== 'object') { errors.push(`${name}: entrada inválida "${sid}"`); continue; }
      if (seen.has(sid)) { errors.push(`${name}: "${sid}" repetida`); continue; }
      seen.add(sid);
      fichas.push({ sid, file: name, data });
    }
  }
  return { onda, fichas, errors };
}

/** JSON estável (chaves ordenadas) — base do hash do conteúdo revisado. */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** SHA-256 hex do conteúdo das fichas (mesmo resultado no navegador e no Node ≥ 18). */
export async function contentHash(fichas) {
  const obj = Object.fromEntries((fichas || []).map((f) => [f.sid, f.data]));
  const bytes = new TextEncoder().encode(stableStringify(obj));
  const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Decisão da onda: alguma reprovada → "reprovado"; algum comentário →
 * "aprovado com ressalvas"; todas aprovadas → "aprovado"; falta marcar → null.
 * @param {Array<{sid: string}>} fichas
 * @param {Record<string, {decision: string, comment?: string}>} marks
 */
export function ondaDecision(fichas, marks) {
  const ms = (fichas || []).map((f) => (marks || {})[f.sid]);
  if (!ms.length || ms.some((m) => !m || !DECISIONS.includes(m.decision))) return null;
  if (ms.some((m) => m.decision === 'reprovar')) return 'reprovado';
  if (ms.some((m) => m.decision === 'comentar' || (m.comment && m.comment.trim()))) return 'aprovado com ressalvas';
  return 'aprovado';
}

/** Marcação válida: comentar/reprovar exigem comentário. */
export function markProblem(mark) {
  if (!mark || !DECISIONS.includes(mark.decision)) return 'sem decisão';
  if ((mark.decision === 'comentar' || mark.decision === 'reprovar') && !(mark.comment && mark.comment.trim().length >= 5)) return 'escreva o comentário (mín. 5 caracteres)';
  return null;
}

function oneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().replace(/\|/g, '/');
}

/**
 * revisao-onda-NN.md
 * @param {{ onda: number, fichas: Array<{sid: string, file: string}>, marks: Object,
 *   reviewer: string, registro: string, date: string, hash: string,
 *   nameOf?: (sid: string) => string, generatedAt?: string }} p
 * @returns {string}
 */
export function buildReviewMd({ onda, fichas, marks, reviewer, registro, date, hash, nameOf = (s) => s, generatedAt = '' }) {
  const decision = ondaDecision(fichas, marks);
  if (!decision) throw new Error('há fichas sem decisão');
  const bad = fichas.map((f) => [f.sid, markProblem(marks[f.sid])]).filter(([, p]) => p);
  if (bad.length) throw new Error(`marcação incompleta: ${bad.map(([s, p]) => `${s} (${p})`).join('; ')}`);
  if (!reviewer || reviewer.trim().length < 3) throw new Error('nome do revisor obrigatório');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('data no formato AAAA-MM-DD');
  const nn = String(onda).padStart(2, '0');
  const sistema = ONDAS[onda - 1] || '';
  const files = [...new Set(fichas.map((f) => f.file))];
  const count = (d) => fichas.filter((f) => marks[f.sid].decision === d).length;
  const withComment = fichas.filter((f) => marks[f.sid].decision === 'comentar' || (marks[f.sid].decision === 'aprovar' && (marks[f.sid].comment || '').trim()));
  const rejected = fichas.filter((f) => marks[f.sid].decision === 'reprovar');
  const next = decision === 'reprovado'
    ? 'Onda volta às fichas pendentes: curador aplica as reprovações e ressalvas, revisor técnico confere e a onda vem de novo ao conselho (guia-revisao.md).'
    : decision === 'aprovado com ressalvas'
      ? 'Aplicar as ressalvas e entrar em curated/ com review.status "reviewed" (guia-revisao.md).'
      : 'Entrar em curated/ com review.status "reviewed" (guia-revisao.md).';
  const L = [];
  L.push(`# Revisão — Onda ${nn} (${SISTEMA_LABEL[sistema] || sistema})`);
  L.push('');
  L.push(`<!-- Gerado pela ferramenta de revisão do conselho (modulos/anatomia-3d/revisao/)${generatedAt ? ` em ${generatedAt}` : ''}. O hash identifica o conteúdo exato que foi revisado. -->`);
  L.push('');
  L.push(`- **Sistema:** ${sistema}`);
  L.push(`- **Fichas:** ${fichas.length} (${files.join(', ')})`);
  L.push(`- **Conteúdo revisado (SHA-256):** ${hash}`);
  L.push(`- **Revisor:** ${reviewer.trim()} (registro profissional: ${(registro || '').trim() || '—'})`);
  L.push(`- **Data:** ${date}`);
  L.push(`- **Aprovação:** ${decision}`);
  L.push(`- **Resumo:** ${count('aprovar')} aprovadas, ${count('comentar')} com ressalva, ${count('reprovar')} reprovadas`);
  L.push('- **Ressalvas:**');
  if (withComment.length) for (const f of withComment) L.push(`  - Ficha \`${f.sid}\` (${oneLine(nameOf(f.sid))}): ${oneLine(marks[f.sid].comment)}`);
  else L.push('  - nenhuma');
  if (rejected.length) {
    L.push('- **Reprovadas:**');
    for (const f of rejected) L.push(`  - Ficha \`${f.sid}\` (${oneLine(nameOf(f.sid))}): ${oneLine(marks[f.sid].comment)}`);
  }
  L.push(`- **Próximo passo:** ${next}`);
  L.push('');
  L.push('## Decisão por ficha');
  L.push('| sid | estrutura | decisão | comentário |');
  L.push('|---|---|---|---|');
  for (const f of fichas) {
    const m = marks[f.sid];
    const label = m.decision === 'aprovar' ? 'aprovada' : m.decision === 'comentar' ? 'aprovada com ressalva' : 'reprovada';
    L.push(`| \`${f.sid}\` | ${oneLine(nameOf(f.sid))} | ${label} | ${oneLine(m.comment) || '—'} |`);
  }
  L.push('');
  return L.join('\n');
}
