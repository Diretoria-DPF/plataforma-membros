/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ragEval.test.js — golden set da base da Lia (test/fixtures/rag-eval.json).
 *
 * Mede a recuperação (ragService.retrieve) sobre o corpus REAL de assistant/docs.js,
 * em Postgres de verdade (PGlite, migrações reais) e SEM binding AI: só a busca
 * por trigramas roda aqui. O PGlite 0.5.8 não traz pgvector (não existe o
 * subcaminho '@electric-sql/pglite/vector'), então a busca vetorial não é
 * executável neste teste; a fusão e o piso por lista ficam cobertos em
 * ragService.test.js com listas simuladas. O recall híbrido só se mede no Neon
 * de homologação (ver o relatório da calibração).
 *
 * Métricas:
 *  - recall@4: a seção esperada aparece entre os trechos devolvidos;
 *  - falso positivo: pergunta sem resposta na base (secao:null) que devolve trecho.
 * Piso de regressão: baseline calibrado menos RECALL_REGRESSION_TOLERANCE.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Rag from '../src/services/ragService.js';
import { buildDocuments } from '../src/assistant/docs.js';
import { makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'rag-eval.json');
const GOLD = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const POSITIVES = GOLD.filter((g) => g.secao !== null);
const NEGATIVES = GOLD.filter((g) => g.secao === null);

// Baseline medido DEPOIS da calibração de RAG.MIN_TRIGRAM_SCORE (constants.js) e com o golden set atual
// (24 positivas, sendo 10 de cobertura da Lia): 13 de 24 com o negativo rejeitado. Com as 14 positivas
// da calibração era 5 de 14; antes dela, 11 de 14, aceitando o negativo.
// 2026-10-09 (L06): golden set ampliado para 42 positivas (18 novas, 3 em cada fonte nova: plataforma,
// modulos, publicacoes, processo, faq, saude) e 14 negativas (12 novas, fora do domínio): 21 de 42 (0,500),
// com 0 falsos positivos. Atualizar a constante para 21/42 baixaria o piso para 0,430; por isso ela fica em
// 13/24 e o piso não cai. O novo baseline só entra com a calibração (O21/O36).
const BASELINE_RECALL_AT_4 = 13 / 24;
const RECALL_REGRESSION_TOLERANCE = 0.07;
const RECALL_FLOOR = BASELINE_RECALL_AT_4 - RECALL_REGRESSION_TOLERANCE;

describe('ragEval — golden set da Lia (trigramas, banco real)', () => {
  let db;
  let sql;
  let docs;

  beforeAll(async () => {
    db = await createMigratedDb();
    sql = toSql(db);
    docs = buildDocuments();
    await Rag.reindex(sql, makeEnv(), docs);
  }, 120000);

  afterAll(async () => { if (db) await db.close(); });

  test('todo título esperado do golden set existe no corpus real (divergência quebra aqui)', () => {
    const sections = new Set(docs.map((d) => d.section));
    expect(POSITIVES.filter((g) => !sections.has(g.secao)).map((g) => g.secao)).toEqual([]);
  });

  test('recall@4 sobe e o negativo não devolve nenhum trecho', async () => {
    let hits = 0;
    const misses = [];
    for (const g of POSITIVES) {
      const { chunks } = await Rag.retrieve(sql, makeEnv(), g.pergunta);
      if (chunks.some((c) => c.section === g.secao)) hits += 1;
      else misses.push(g.secao);
    }
    const falsePositives = [];
    for (const g of NEGATIVES) {
      const { chunks } = await Rag.retrieve(sql, makeEnv(), g.pergunta);
      chunks.forEach((c) => falsePositives.push(c.section));
    }
    const recall = hits / POSITIVES.length;
    console.log(
      '[ragEval] recall@4 = ' + hits + '/' + POSITIVES.length + ' (' + recall.toFixed(3) + ')'
      + ' | falsos positivos = ' + falsePositives.length + ' ' + JSON.stringify(falsePositives)
      + ' | sem a seção no top 4: ' + JSON.stringify(misses),
    );
    expect(falsePositives).toEqual([]);
    expect(recall).toBeGreaterThanOrEqual(RECALL_FLOOR);
  });
});
