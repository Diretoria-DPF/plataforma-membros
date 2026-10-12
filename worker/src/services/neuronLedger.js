/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * neuronLedger.js
 * Livro-caixa APROXIMADO dos neurons do Workers AI (plano gratuito: 10.000 por dia). UMA chave por dia UTC no
 * KV HOT_CACHE (`neurons:AAAA-MM-DD`), valor JSON { total, visitor }: `total` é tudo que gastou neurons
 * (prévia de IA do visitante e resumos da Biblioteca) e `visitor` é só a prévia, para o teto dela.
 *
 * O KV GRATUITO ACEITA SÓ 1.000 GRAVAÇÕES POR DIA e a plataforma já o usa (eventos, organograma, sync de
 * mensagens, séries da Home, cooldown das chaves de IA). Por isso:
 *   - as gravações são em LOTE: o isolate acumula em memória e só grava quando o pendente chega a
 *     FLUSH_MIN_NEURONS ou passou FLUSH_MAX_AGE_MS desde a última gravação (Workers não têm timer ocioso, então
 *     a idade só é conferida no próximo registro);
 *   - a leitura (o teto) usa um cache em memória de READ_CACHE_MS e soma o pendente deste isolate;
 *   - consulta de RAG e embedding NÃO registram nada aqui (custo de ~0,03 neuron, irrelevante).
 * Aproximado e sem atomicidade: isolates diferentes podem perder um ou outro registro, e tudo bem para um
 * teto de proteção. Sem KV (staging) ou com o KV falhando: registrar não faz nada, ler devolve null, e quem
 * decide a prévia de IA trata null como "sem prévia". Nada aqui lança.
 *
 * Taxas em constants.js (NEURON_RATES): gemma-4-26b 9.091 neurons por milhão de tokens de entrada e 27.273
 * por milhão de saída; bge-m3 1.075 por milhão de entrada.
 */
import * as C from '../constants.js';

const PER_MILLION = 1e6;
const TTL_SECONDS = 2 * 86400;
const FLUSH_MIN_NEURONS = 5;
const FLUSH_MAX_AGE_MS = 60 * 1000;
const READ_CACHE_MS = 30 * 1000;

const tokens = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** Neurons de uma chamada ao gemma, pelo campo `usage` da resposta (prompt_tokens/completion_tokens ou input/output). */
export function neuronsForGemma(usage) {
  const u = usage && typeof usage === 'object' ? usage : {};
  const input = tokens(u.prompt_tokens ?? u.input_tokens);
  const output = tokens(u.completion_tokens ?? u.output_tokens);
  return (input * C.NEURON_RATES.GEMMA_INPUT + output * C.NEURON_RATES.GEMMA_OUTPUT) / PER_MILLION;
}

/** Neurons de um embedding bge-m3 com `inputTokens` tokens de entrada (referência; o RAG não registra). */
export function neuronsForEmbedding(inputTokens) {
  return (tokens(inputTokens) * C.NEURON_RATES.EMBEDDING_INPUT) / PER_MILLION;
}

/** Dia UTC como AAAA-MM-DD. */
export function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

const keyOf = (now) => 'neurons:' + dayKey(now);
const empty = () => ({ total: 0, visitor: 0 });

// Estado do isolate. `kv` prende o estado ao KV em uso: outro KV (só em teste) começa do zero.
let state = null;

function freshState(kv) {
  return { kv, day: null, pending: empty(), lastWrite: 0, memo: null };
}

function stateFor(env, now) {
  if (state === null || state.kv !== env.HOT_CACHE) state = freshState(env.HOT_CACHE);
  const day = dayKey(now);
  if (state.day !== day) state = Object.assign(freshState(env.HOT_CACHE), { day });
  return state;
}

/** Só para testes: esquece o acúmulo e o cache de leitura. */
export function __resetNeuronLedgerForTests() {
  state = null;
}

function parse(raw) {
  try {
    const value = JSON.parse(raw);
    return { total: Number(value.total) || 0, visitor: Number(value.visitor) || 0 };
  } catch (err) {
    return null;
  }
}

async function readStored(env, now) {
  const raw = await env.HOT_CACHE.get(keyOf(now));
  return raw === null || raw === undefined ? empty() : parse(raw);
}

/** Grava o pendente somado ao que já está no KV (uma gravação). Falha: o pendente fica para a próxima. */
async function flush(env, now) {
  const s = stateFor(env, now);
  try {
    const stored = await readStored(env, now);
    if (stored === null) return;
    const merged = { total: stored.total + s.pending.total, visitor: stored.visitor + s.pending.visitor };
    await env.HOT_CACHE.put(keyOf(now), JSON.stringify(merged), { expirationTtl: TTL_SECONDS });
    s.pending = empty();
    s.lastWrite = now.getTime();
    s.memo = null;
  } catch (err) {
    // Livro-caixa é só proteção de custo: nunca derruba a resposta.
  }
}

/**
 * Registra `n` neurons (no escopo, se houver; o total sempre soma). Entra no acúmulo em memória e só vira
 * gravação no KV pelo debounce. Valor inválido, KV ausente ou falha: não faz nada e não lança.
 */
export async function recordNeurons(env, n, scope = null, now = new Date()) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || !env || !env.HOT_CACHE) return;
  const s = stateFor(env, now);
  s.pending = { total: s.pending.total + n, visitor: s.pending.visitor + (scope === 'visitor' ? n : 0) };
  const dueByAmount = s.pending.total >= FLUSH_MIN_NEURONS;
  const dueByAge = now.getTime() - s.lastWrite >= FLUSH_MAX_AGE_MS;
  if (dueByAmount || dueByAge) await flush(env, now);
}

/**
 * Neurons gastos hoje (UTC), no total ou no escopo 'visitor': o KV (lido no máximo a cada 30 s) mais o pendente
 * deste isolate. null = sem KV ou KV com erro (não há como saber).
 */
export async function neuronsToday(env, scope = null, now = new Date()) {
  if (!env || !env.HOT_CACHE) return null;
  try {
    const s = stateFor(env, now);
    if (s.memo === null || now.getTime() - s.memo.at >= READ_CACHE_MS) {
      const stored = await readStored(env, now);
      if (stored === null) return null;
      s.memo = { at: now.getTime(), value: stored };
    }
    const field = scope === 'visitor' ? 'visitor' : 'total';
    return s.memo.value[field] + s.pending[field];
  } catch (err) {
    return null;
  }
}
