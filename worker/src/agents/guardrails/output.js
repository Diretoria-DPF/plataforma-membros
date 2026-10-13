/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agents/guardrails/output.js
 * Guardrail de SAÍDA dos agentes: PURO e linear. Decide entre
 *   allow    o texto sai como veio;
 *   rewrite  o texto sai corrigido (marcação removida, citação inventada ou frase com dose cortada, aviso);
 *   replace  o texto é trocado por uma resposta fixa (vazamento de prompt, dose demais, resposta vazia).
 * Ordem: O4 vazamento → O1 texto puro → O2 citação → O3 dose → O5 léxico (paciente) → O6 vazia/truncada.
 * Dose estrita (decisão do dono): qualquer número com unidade de medicamento, posologia ou verbo imperativo de
 * dose sai do texto. O texto do usuário nunca entra aqui nem em log: só o texto do modelo.
 */
import {
  REPLACEMENTS, CHECK_NOTICE, DOSE_NOTICE, fold, stripInvisible, filterSentences, withoutDoseConcepts,
} from './rules.js';

export const DEFAULT_OUTPUT_RULES = Object.freeze(['O1', 'O2', 'O3', 'O4', 'O6']);
const DEFAULT_REPLY_MAX = 2000;
const HARD_CAP_FACTOR = 2;
const DOSE_REPLACE_SHARE = 0.5;
const MIN_KEPT_CHARS = 40;
const SHINGLE_WORDS = 10;
const SHINGLE_HITS = 2;

// ---------------------------------------------------------------------------
// O4 — vazamento de prompt
// ---------------------------------------------------------------------------
const LEAK_PHRASES = [
  /\b(?:minhas|meu|meus)\s+(?:instrucoes|prompt|regras internas|regras de sistema|diretrizes internas)\b/,
  /\bprompt (?:do )?sistema\b/,
  /\bsystem prompt\b/,
  /\bfui instruid[oa] a\b/,
];

const wordsOf = (folded) => folded.replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);

function shingles(words) {
  const out = new Set();
  for (let i = 0; i + SHINGLE_WORDS <= words.length; i += 1) out.add(words.slice(i, i + SHINGLE_WORDS).join(' '));
  return out;
}

function copiesPrompt(folded, promptText) {
  if (!promptText) return false;
  const known = shingles(wordsOf(fold(promptText)));
  let hits = 0;
  for (const s of shingles(wordsOf(folded))) if (known.has(s) && (hits += 1) >= SHINGLE_HITS) return true;
  return false;
}

function leaksPrompt(text, ctx) {
  const folded = fold(text);
  if (ctx.canary && text.includes(ctx.canary)) return true;
  return LEAK_PHRASES.some((re) => re.test(folded)) || copiesPrompt(folded, ctx.promptText);
}

// ---------------------------------------------------------------------------
// O1 — texto puro
// ---------------------------------------------------------------------------
const MARKDOWN_LINK_RE = /\[([^\]\n]{1,200})\]\((https?:\/\/[^)\s]{1,300})\)/g;
const TAG_RE = /<\/?[a-zA-Z][^<>]{0,200}>/g;

function plainText(text) {
  return stripInvisible(text)
    .replace(MARKDOWN_LINK_RE, '$1 $2')
    .replace(TAG_RE, '')
    .replace(/```/g, '')
    .replace(/`/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)/g, '')
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// O2 — citação só da lista permitida
// ---------------------------------------------------------------------------
const CITE_MARK_RE = /\[(\d{1,3})\]/g;
const URL_RE = /https?:\/\/[^\s)\]>"']{1,300}/g;
const INVENTED_REF = [
  /\bet al\b\.?/i,
  /\(\s*\p{Lu}[\p{L}'-]{1,30}(?:\s+(?:e|&|and)\s+\p{Lu}[\p{L}'-]{1,30})?(?:\s+et al\.?)?,?\s+(?:19|20)\d{2}[a-z]?\s*\)/u,
  /\bdoi\s*:?\s*10\.\d{4,9}\/\S{1,100}/i,
  /\b10\.\d{4,9}\/[^\s]{2,100}/,
  /\bpmid\s*:?\s*\d{4,9}\b/i,
  /\bisbn\b/i,
];
const AUTHORITY_RE = /\b(?:segundo|conforme|de acordo com|baseado em)\s+(?:a |o |as |os )?(?:diretriz\w{0,4}|protocolo\w{0,2}|consenso|guideline\w{0,2}|bula|oms|anvisa|fda|ministerio da saude|sociedade)\b/;

function cleanCitations(text, ctx) {
  let changed = false;
  const marks = text.replace(CITE_MARK_RE, (m, n) => {
    if (Number(n) >= 1 && Number(n) <= ctx.sources.length) return m;
    changed = true;
    return '';
  });
  const urls = marks.replace(URL_RE, (u) => {
    const url = u.replace(/[.,;:]+$/, '');
    if (ctx.sources.some((s) => s.url && s.url === url)) return u;
    changed = true;
    return '';
  });
  const kept = filterSentences(urls, (s) => INVENTED_REF.some((re) => re.test(s)));
  return { text: (changed || kept.dropped ? kept.text.replace(/ {2,}/g, ' ') : kept.text).trim(), changed: changed || kept.dropped > 0 };
}

function needsCheckNotice(text, ctx) {
  const hasValidMark = [...text.matchAll(CITE_MARK_RE)].some((m) => Number(m[1]) >= 1 && Number(m[1]) <= ctx.sources.length);
  return !hasValidMark && AUTHORITY_RE.test(fold(text));
}

// ---------------------------------------------------------------------------
// O3 — dose (estrita)
// ---------------------------------------------------------------------------
const UNIT_OUT = '(?:mg|mcg|ug|\\u00b5g|\\u03bcg|g|gramas?|miligramas?|microgramas?|ml|mililitros?|ui|meq|mmol|ng|comprimidos?|capsulas?|gotas?|ampolas?|sache|saches|colheres?)(?:\\s?/\\s?(?:kg|dl|ml|l|h|dia|min))?';
const DOSE_OUT = [
  new RegExp('\\b\\d+(?:[.,]\\d+)?(?:\\s?(?:a|ate|-|e)\\s?\\d+(?:[.,]\\d+)?)?\\s?' + UNIT_OUT + '(?![a-z])'),
  /\b(?:\d+|uma|duas|tres|quatro)\s+vezes\s+(?:ao|por)\s+dia\b/,
  /\ba cada\s+\d+\s*(?:horas|h)\b/,
  /\bde\s+\d+\s+em\s+\d+\s+horas\b/,
  /\b(?:tome|administre|ministre|aplique|injete|ingira|prescreva|receite|use)\b.{0,40}\b(?:dose|doses|posologia|comprimidos?|gotas?|ampolas?|capsulas?|sache|colher)\b/,
];

const hasDose = (sentence) => {
  const folded = withoutDoseConcepts(fold(sentence));
  return DOSE_OUT.some((re) => re.test(folded));
};

function dropDoses(text) {
  const { text: kept, dropped, total } = filterSentences(text, hasDose);
  const mostly = dropped > 0 && (dropped / total >= DOSE_REPLACE_SHARE || kept.length < MIN_KEPT_CHARS);
  return { text: kept, dropped, replace: mostly };
}

// ---------------------------------------------------------------------------
// O5 — léxico proibido (paciente virtual não entrega diagnóstico nem quebra o personagem)
// ---------------------------------------------------------------------------
const FORBIDDEN_LEXICON = [
  /\bdiagnostic\w{0,6}\b/,
  /\bintoxicacao por\b/,
  /\bsindrome (?:colinergica|anticolinergica|simpaticomimetica|opioide|serotoninergica)\b/,
  /\btoxindrome\b/,
  /\bantidoto\b/,
  /\binteligencia artificial\b|\bmodelo de linguagem\b|\bcomo (?:uma )?ia\b|\bsou (?:um|uma) (?:ia|assistente virtual)\b/,
  /\bvoce deveria (?:pedir|solicitar|tratar|dar|administrar)\b/,
];

// ---------------------------------------------------------------------------
// O6 — vazia ou truncada
// ---------------------------------------------------------------------------
const hasLetters = (text) => /\p{L}{2}/u.test(text);

function cutAtSentence(text) {
  const idx = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
  return idx >= 0 ? text.slice(0, idx + 1).trim() : '';
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------
function makeContext(opts) {
  const replyMax = opts.replyMax || DEFAULT_REPLY_MAX;
  return {
    on: ((set) => (id) => set.has(id))(new Set(opts.rules || DEFAULT_OUTPUT_RULES)),
    sources: Array.isArray(opts.sources) ? opts.sources : [],
    replyMax,
    hardCap: replyMax * HARD_CAP_FACTOR,
    truncatedByModel: opts.finishReason === 'length',
    promptText: opts.promptText || '',
    canary: opts.canary || '',
  };
}

const done = (action, reply, rules, notices) => ({ action, reply, rules, notices: notices || [] });
const replaced = (rule) => done('replace', REPLACEMENTS[rule], [rule]);

function finish(text, hits, notices) {
  const tail = notices.filter((n, i) => notices.indexOf(n) === i && !text.includes(n));
  return done(hits.length || tail.length ? 'rewrite' : 'allow', [text].concat(tail).join(' ').trim(), hits, tail);
}

/**
 * @param {string} reply  texto do modelo
 * @param {{ rules?: string[], sources?: Array<{url?: string}>, replyMax?: number, finishReason?: string,
 *           promptText?: string, canary?: string }} [opts]
 * @returns {{ action: 'allow'|'rewrite'|'replace', reply: string, rules: string[], notices: string[] }}
 */
export function checkOutput(reply, opts = {}) {
  const ctx = makeContext(opts);
  if (typeof reply !== 'string' || !reply.trim()) return replaced('O6');
  const capped = reply.slice(0, ctx.hardCap);
  if (ctx.on('O4') && leaksPrompt(capped, ctx)) return replaced('O4');
  if (ctx.on('O5') && FORBIDDEN_LEXICON.some((re) => re.test(fold(capped)))) return replaced('O5');

  const hits = [];
  const notices = [];
  let text = capped;
  if (ctx.on('O1')) {
    const plain = plainText(text);
    if (plain !== text.trim()) hits.push('O1');
    text = plain;
  }
  if (ctx.on('O2')) {
    const cited = cleanCitations(text, ctx);
    text = cited.text;
    if (cited.changed || needsCheckNotice(text, ctx)) { hits.push('O2'); notices.push(CHECK_NOTICE); }
  }
  if (ctx.on('O3')) {
    const stripped = dropDoses(text);
    if (stripped.replace) return replaced('O3');
    if (stripped.dropped) { hits.push('O3'); notices.push(DOSE_NOTICE); text = stripped.text; }
  }
  return closeOut(text, reply, ctx, hits, notices);
}

function closeOut(text, original, ctx, hits, notices) {
  if (!ctx.on('O6')) return finish(text, hits, notices);
  const tooLong = text.length > ctx.replyMax || original.length > ctx.hardCap;
  if (!ctx.truncatedByModel && !tooLong) return hasLetters(text) ? finish(text, hits, notices) : replaced('O6');
  const cut = cutAtSentence(text.slice(0, ctx.replyMax));
  return hasLetters(cut) ? finish(cut, hits.concat('O6'), notices) : replaced('O6');
}
