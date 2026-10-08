/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ragService.js
 * Base de conhecimento da Lia (sql/020): embedding por Workers AI
 * (@cf/baai/bge-m3, 1024 dimensões) e busca HÍBRIDA, vetor (pgvector, cosseno)
 * + trigramas (pg_trgm), fundida por posição (Reciprocal Rank Fusion).
 *
 * Degradação por construção: se o embedding falhar (binding ausente, modelo
 * fora do ar, vetor de tamanho errado ou consulta vetorial com erro), a busca
 * segue só com trigramas e o resultado traz `embeddingError`. Se a própria
 * consulta de trigramas falhar (ex.: tabela ausente), `retrieve` lança e o
 * assistantService cai para o próximo degrau (LLM sem recuperação).
 *
 * Nada aqui recebe dado de pessoa: a consulta é só o texto da pergunta e o
 * conteúdo da base é fixo (assistant/docs.js).
 */
import * as C from '../constants.js';
import { buildDocuments } from '../assistant/docs.js';

const EMBED_TIMEOUT_MS = 6000;
const QUERY_MAX = 300;

/** pgvector aceita o literal textual '[0.1,0.2,...]'. */
export function toVectorLiteral(values) {
  return '[' + values.join(',') + ']';
}

function validateVector(vec) {
  if (!Array.isArray(vec) || vec.length !== C.EMBEDDING_DIM || !vec.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error('embedding inválido (esperado ' + C.EMBEDDING_DIM + ' números)');
  }
  return vec;
}

/** Embeddings via Workers AI. Lança em qualquer falha; quem chama decide a degradação. */
export async function embedTexts(env, texts) {
  if (!env || !env.AI || typeof env.AI.run !== 'function') throw new Error('binding Workers AI ausente');
  let timer;
  const timeout = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('embedding: tempo esgotado')), EMBED_TIMEOUT_MS); });
  try {
    const out = await Promise.race([env.AI.run(C.EMBEDDING_MODEL, { text: texts }), timeout]);
    const data = out && out.data;
    if (!Array.isArray(data) || data.length !== texts.length) throw new Error('embedding: resposta inesperada do modelo');
    return data.map(validateVector);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Piso por lista, aplicado ANTES da fusão e sobre o score BRUTO da própria lista
 * (cosseno do vetor ou similaridade de trigramas). A fusão por posição ignora o
 * score: sem o piso, um trigrama de 0,13 empataria com um vetor de 0,9 na mesma posição.
 */
export function aboveFloor(rows, floor) {
  return rows.filter((row) => Number(row.score) >= floor);
}

/** Fusão por posição: cada lista contribui 1/(k + posição). Devolve os melhores, já ordenados; sem nada, []. */
export function fuse(lists, limit) {
  const merged = new Map();
  lists.forEach((rows) => {
    rows.forEach((row, index) => {
      const entry = merged.get(row.id) || { row, score: 0 };
      entry.score += 1 / (C.RAG.RRF_K + index + 1);
      merged.set(row.id, entry);
    });
  });
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, score }) => ({ id: row.id, source: row.source, section: row.section, content: row.content, score }));
}

async function trigramRows(sql, query) {
  return sql`
    SELECT id, source, section, content,
           GREATEST(similarity(lower(content), ${query}), word_similarity(${query}, lower(content))) AS score
    FROM kb_chunks
    WHERE GREATEST(similarity(lower(content), ${query}), word_similarity(${query}, lower(content))) >= ${C.RAG.MIN_TRIGRAM_SCORE}
    ORDER BY score DESC
    LIMIT ${C.RAG.CANDIDATES}`;
}

async function vectorRows(sql, literal) {
  return sql`
    SELECT id, source, section, content, 1 - (embedding <=> ${literal}::vector) AS score
    FROM kb_chunks
    WHERE embedding IS NOT NULL AND 1 - (embedding <=> ${literal}::vector) >= ${C.RAG.MIN_VECTOR_SCORE}
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${C.RAG.CANDIDATES}`;
}

/**
 * Busca híbrida. Devolve { chunks, mode: 'hybrid'|'trigram', embeddingError }.
 * Lança só se a busca por trigramas (a base de qualquer modo) falhar.
 */
export async function retrieve(sql, env, question) {
  const query = String(question || '').toLowerCase().slice(0, QUERY_MAX);
  let vectorList = null;
  let embeddingError = null;
  try {
    const [vec] = await embedTexts(env, [query]);
    vectorList = aboveFloor(await vectorRows(sql, toVectorLiteral(vec)), C.RAG.MIN_VECTOR_SCORE);
  } catch (err) {
    embeddingError = String((err && err.message) || err).slice(0, 200);
  }
  const trigramList = aboveFloor(await trigramRows(sql, query), C.RAG.MIN_TRIGRAM_SCORE);
  const lists = vectorList ? [vectorList, trigramList] : [trigramList];
  return { chunks: fuse(lists, C.RAG.TOP_K), mode: vectorList ? 'hybrid' : 'trigram', embeddingError };
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash do trecho na reindexação: sha256(modelo + "\n" + conteúdo). O MODELO entra na conta,
 * então trocar o modelo de embedding reindexa tudo, mesmo com a mesma dimensão (vetores de
 * outro espaço não podem ficar misturados com os novos).
 */
export async function reindexHash(content, model = C.EMBEDDING_MODEL) {
  return sha256Hex(model + '\n' + content);
}

async function embedInBatches(env, texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += C.RAG.EMBED_BATCH) {
    out.push(...(await embedTexts(env, texts.slice(i, i + C.RAG.EMBED_BATCH))));
  }
  return out;
}

/**
 * Reindexação idempotente: ingere os documentos da base (kb.js, destinos e markdown embutido).
 * - trecho igual (hash) e já com embedding (ou sem embedding disponível): não toca;
 * - novo/alterado: grava e tenta embedding; se o embedding falhar, grava com NULL (busca por trigramas funciona);
 * - trecho que saiu da base: removido.
 * Devolve { total, upserted, unchanged, removed, embedded, embeddingAvailable, embeddingError }.
 */
export async function reindex(sql, env, documents) {
  const docs = documents || buildDocuments();
  const existing = await sql`SELECT id, source, section, content_hash, (embedding IS NOT NULL) AS has_embedding FROM kb_chunks`;
  const byKey = new Map(existing.map((r) => [r.source + '|' + r.section, r]));

  const hashed = await Promise.all(docs.map(async (d) => Object.assign({}, d, { hash: await reindexHash(d.content) })));
  const pending = hashed.filter((d) => {
    const row = byKey.get(d.source + '|' + d.section);
    return !row || row.content_hash !== d.hash || !row.has_embedding;
  });

  let vectors = null;
  let embeddingError = null;
  if (pending.length) {
    try {
      vectors = await embedInBatches(env, pending.map((d) => d.content));
    } catch (err) {
      embeddingError = String((err && err.message) || err).slice(0, 200);
    }
  }

  let embedded = 0;
  let written = 0;
  for (let i = 0; i < pending.length; i += 1) {
    const d = pending[i];
    const literal = vectors ? toVectorLiteral(vectors[i]) : null;
    if (literal) embedded += 1;
    const prior = byKey.get(d.source + '|' + d.section);
    // Sem embedding novo, não apaga o que já existia para o MESMO conteúdo.
    const keepOld = !literal && prior && prior.content_hash === d.hash;
    if (keepOld) continue;
    written += 1;
    await sql`
      INSERT INTO kb_chunks (source, section, content, content_hash, embedding, updated_at)
      VALUES (${d.source}, ${d.section}, ${d.content}, ${d.hash}, ${literal}, now())
      ON CONFLICT (source, section) DO UPDATE
        SET content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
            embedding = EXCLUDED.embedding, updated_at = now()`;
  }

  const wanted = new Set(docs.map((d) => d.source + '|' + d.section));
  const staleIds = existing.filter((r) => !wanted.has(r.source + '|' + r.section)).map((r) => r.id);
  for (const id of staleIds) await sql`DELETE FROM kb_chunks WHERE id = ${id}::uuid`;

  return {
    total: docs.length,
    upserted: written,
    unchanged: docs.length - written,
    removed: staleIds.length,
    embedded,
    embeddingAvailable: !!vectors || !pending.length,
    embeddingError,
  };
}

/** Fontes da base, para a tela de citações: [{ source, sections: [...], updatedAt }]. */
export async function listSources(sql) {
  const rows = await sql`SELECT source, section, updated_at FROM kb_chunks ORDER BY source, section`;
  const bySource = new Map();
  rows.forEach((r) => {
    const entry = bySource.get(r.source) || { source: r.source, sections: [], updatedAt: r.updated_at };
    entry.sections.push(r.section);
    if (r.updated_at > entry.updatedAt) entry.updatedAt = r.updated_at;
    bySource.set(r.source, entry);
  });
  return Array.from(bySource.values());
}
