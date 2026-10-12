/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * treeSelectService.js
 * Lia híbrida (flag lia_hibrida_enabled): depois da busca (RAG, para o recall), UMA chamada curta ao modelo
 * rápido escolhe, na árvore de seções (assistant/tree.js), quais trechos a resposta deve ler, e diz se a base
 * cobre a pergunta (answerable). Quem lê e responde continua sendo o fluxo de sempre.
 *
 * A saída do modelo NUNCA é confiada: o JSON é validado, só entram ids que existem na árvore (no máximo
 * TREE.MAX_SECTIONS), e qualquer falha, tempo esgotado ou saída inválida devolve os candidatos do RRF (o
 * comportamento anterior), sem erro para a pessoa. O texto da pergunta não vai para log.
 *
 * Custo: a chamada passa pelo Orchestrator (orçamento, reserva, métricas e ai_usage_log). Ela NÃO consome
 * cota própria: quem chama (assistantService) a faz DENTRO da unidade de cota da pergunta, então uma
 * pergunta continua gastando uma unidade.
 */
import * as C from '../constants.js';
import * as Logging from '../logging.js';
import * as Orchestrator from '../ai/orchestrator.js';
import { buildTreeSelectMessages } from '../ai/prompts.js';
import { getTree, renderOutline, byId, byKey } from '../assistant/tree.js';

const REASON = { UNAVAILABLE: 'unavailable', TIMEOUT: 'timeout', INVALID: 'invalid' };
const FENCE = /```(?:json)?\s*([\s\S]*?)```/i;

class TimeoutError extends Error {}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return undefined;
  }
}

/** JSON do texto do modelo: puro, dentro de um bloco de código ou entre chaves no meio de outro texto. */
function extractObject(content) {
  if (typeof content !== 'string') return null;
  const text = content.trim();
  const fenced = FENCE.exec(text);
  const braces = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const candidates = [text, fenced ? fenced[1].trim() : '', braces];
  for (const candidate of candidates) {
    const value = candidate ? tryParse(candidate) : undefined;
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return null;
}

/**
 * Valida a saída do modelo contra a árvore (`index` = Map id -> nó). Devolve
 * { ok: true, answerable, ids } (ids válidos, sem repetir, até MAX_SECTIONS) ou { ok: false, reason }.
 * answerable false vale como está (sem ids); com answerable true, é preciso sobrar ao menos um id válido.
 */
export function parseSelection(content, index) {
  const data = extractObject(content);
  if (!data || !Array.isArray(data.sections) || typeof data.answerable !== 'boolean') return { ok: false, reason: REASON.INVALID };
  if (data.answerable === false) return { ok: true, answerable: false, ids: [] };
  const valid = data.sections.filter((id) => typeof id === 'string' && index.has(id));
  const ids = Array.from(new Set(valid)).slice(0, C.TREE.MAX_SECTIONS);
  return ids.length ? { ok: true, answerable: true, ids } : { ok: false, reason: REASON.INVALID };
}

/** Resumo para o prompt: as candidatas do RAG primeiro (com resumo), o resto da árvore só com os ids. */
function outlineFor(candidates, nodes) {
  const keyIndex = byKey(nodes);
  const picked = candidates.map((c) => keyIndex.get(c.source + '|' + c.section)).filter(Boolean);
  const pickedIds = new Set(picked.map((n) => n.id));
  const head = renderOutline(picked, C.TREE.OUTLINE_MAX_CHARS);
  const room = C.TREE.OUTLINE_MAX_CHARS - head.length - 1;
  const rest = renderOutline(nodes.filter((n) => !pickedIds.has(n.id)), room, { brief: true });
  return [head, rest].filter(Boolean).join('\n');
}

async function askModel(sql, env, identity, question, outline) {
  let timer;
  const timeout = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new TimeoutError()), C.TREE.TIMEOUT_MS); });
  const request = { feature: C.AI_FEATURE.ASSISTANT, messages: buildTreeSelectMessages({ question, outline }), profileId: identity.profileId };
  try {
    const out = await Promise.race([Orchestrator.complete(sql, env, identity, request, {}), timeout]);
    return out && out.content;
  } finally {
    clearTimeout(timer);
  }
}

async function logFailure(sql, correlationId, reason) {
  await Logging.logError(sql, correlationId, 'ASSISTANT_TREE_FAILED', 'Escolha de seções indisponível ou inválida: vale o resultado da busca.', { reason });
}

const toChunk = (source, section, content) => ({ source, section, content: String(content).slice(0, C.RAG.CONTEXT_CHARS) });

/**
 * @param {object} args  { question, candidates: [{source, section, content}], correlationId, nodes? }
 * @returns {Promise<{chunks: object[], answerable: boolean, usedTree: boolean}>}
 *   usedTree=false: a escolha falhou e `chunks` são os TOP_K primeiros candidatos (o RRF, como antes).
 *   answerable=false: o modelo diz que a base não cobre a pergunta (chunks vazio).
 */
export async function refineContext(sql, env, identity, args) {
  const { question, candidates, correlationId } = args;
  const nodes = args.nodes || getTree();
  const fallback = { chunks: candidates.slice(0, C.RAG.TOP_K), answerable: true, usedTree: false };
  if (!candidates.length) return fallback;

  let parsed;
  try {
    parsed = parseSelection(await askModel(sql, env, identity, question, outlineFor(candidates, nodes)), byId(nodes));
  } catch (err) {
    await logFailure(sql, correlationId, err instanceof TimeoutError ? REASON.TIMEOUT : REASON.UNAVAILABLE);
    return fallback;
  }
  if (!parsed.ok) {
    await logFailure(sql, correlationId, parsed.reason);
    return fallback;
  }
  if (!parsed.answerable) return { chunks: [], answerable: false, usedTree: true };

  const fromDb = new Map(candidates.map((c) => [c.source + '|' + c.section, c]));
  const index = byId(nodes);
  const chunks = parsed.ids.map((id) => {
    const node = index.get(id);
    const candidate = fromDb.get(node.source + '|' + node.section);
    return candidate ? toChunk(candidate.source, candidate.section, candidate.content) : toChunk(node.source, node.section, node.content);
  });
  return { chunks, answerable: true, usedTree: true };
}
