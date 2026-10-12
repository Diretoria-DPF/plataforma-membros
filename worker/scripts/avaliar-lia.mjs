/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * avaliar-lia.mjs — roda o golden set da Lia (worker/test/fixtures/lia-golden.json) contra a API e grava um
 * CSV para um revisor humano, mais um resumo no terminal (taxa de "não sei", de erro de intenção e de
 * respostas com fonte). Serve para o ensaio no staging ANTES de ligar lia_hibrida_enabled em produção.
 *
 * Uso:   cd worker && node scripts/avaliar-lia.mjs [urlDaApi] [--out=arquivo.csv] [--golden=arquivo.json]
 *                                                   [--delay=ms] [--perfil=visitante|membro]
 *   urlDaApi   padrão: o staging (https://staging-api.laift.com.br/v1/). Para produção passe a URL de propósito.
 *   LIA_SESSION_TOKEN (variável de ambiente, opcional): sessão de MEMBRO. Sem ela, as perguntas vão como
 *              VISITANTE (sem login). O token nunca é impresso nem gravado no CSV.
 *   O limite por hora do chat vale (30 por IP sem login, 60 com sessão): use --delay e, se preciso, rode em
 *   duas etapas. Quem estourar o limite aparece no CSV como erro.
 * Nenhum segredo mora neste arquivo. A resposta da Lia entra no CSV (para o revisor) mas a PERGUNTA do golden
 * é texto de teste, nunca de pessoa.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INTENTS, normalize } from '../src/assistant/kb.js';
import { nodeId } from '../src/assistant/tree.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_BASE = 'https://staging-api.laift.com.br/v1/';
const DEFAULT_GOLDEN = path.resolve(here, '..', 'test', 'fixtures', 'lia-golden.json');
const REPLY_MAX = 600;
const MAX_CONSECUTIVE_ERRORS = 5;

export const CSV_COLUMNS = [
  'pergunta', 'tipo', 'perfil', 'source', 'secoes_citadas', 'secao_esperada_ok', 'botoes', 'latencia_ms',
  'preview', 'degraded', 'nao_sei', 'erro_intencao', 'erro_http', 'resposta', 'revisor_nota_0a2', 'revisor_comentario',
];

const NAO_SEI = [/\bainda nao sei\b/, /\bnao encontrei\b/, /\bnao tenho essa informacao\b/, /\bnao consegui consultar\b/];
const intentById = new Map(INTENTS.map((i) => [i.id, i]));

/** Argumentos: [urlDaApi] e --chave=valor. */
export function parseArgs(argv) {
  const options = {};
  const rest = [];
  argv.forEach((arg) => {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (m) options[m[1]] = m[2]; else rest.push(arg);
  });
  return { base: rest[0] || DEFAULT_BASE, options };
}

/** Quais perguntas rodam: sem sessão, só as de visitante e as de ambos; com sessão, as de membro e as de ambos. */
export function selectCases(golden, perfil) {
  return golden.filter((g) => g.perfil === 'ambos' || g.perfil === perfil);
}

const sectionIds = (sources) => (Array.isArray(sources) ? sources : []).map((s) => nodeId(s.source, s.section));

/** Erro de intenção (automático): resposta de passo a passo para definição, conduta clínica sem aviso, intenção errada. */
export function intentError(entry, res) {
  const reply = String(res.reply || '');
  if (entry.tipo === 'definicao') {
    const wrong = INTENTS.find((i) => i.defines !== true && i.reply === reply);
    return wrong ? 'passo a passo (' + wrong.id + ') para pergunta de definição' : '';
  }
  if (entry.tipo === 'clinico') return /profissional de saúde/.test(reply) ? '' : 'pergunta clínica sem a resposta segura';
  if (entry.tipo === 'como-fazer' && entry.intencao) {
    const expected = intentById.get(entry.intencao);
    return expected && expected.reply === reply ? '' : 'intenção esperada (' + entry.intencao + ') não respondeu';
  }
  return '';
}

/** Linha de resultado de UMA pergunta (sem o texto de nenhuma sessão). */
export function evaluate(entry, res, latencyMs, perfil) {
  const ok = !!res && res.success === true;
  const cited = ok ? sectionIds(res.sources) : [];
  const text = ok ? String(res.reply || '') : '';
  const expected = entry.secoes || [];
  return {
    pergunta: entry.pergunta,
    tipo: entry.tipo,
    perfil,
    source: ok ? String(res.source || '') : '',
    secoes_citadas: cited.join(' | '),
    secao_esperada_ok: expected.length ? String(cited.some((id) => expected.includes(id))) : '',
    botoes: ok && Array.isArray(res.actions) ? res.actions.map((a) => a.type + ':' + a.target).join(' | ') : '',
    latencia_ms: String(Math.round(latencyMs)),
    preview: String(!!(ok && res.preview)),
    degraded: String(!!(ok && res.degraded)),
    nao_sei: String(ok && NAO_SEI.some((re) => re.test(normalize(text)))),
    erro_intencao: ok ? intentError(entry, res) : '',
    erro_http: ok ? '' : String((res && res.message) || 'sem resposta').slice(0, 120),
    resposta: text.slice(0, REPLY_MAX).replace(/\s+/g, ' '),
    revisor_nota_0a2: '',
    revisor_comentario: '',
    deve_responder: String(entry.deve_responder),
    tem_fonte: String(cited.length > 0),
  };
}

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\n\r;]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

/** CSV com BOM (abre direto no Excel com acentos), separado por vírgula. */
export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')].concat(rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(',')));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + '%' : 'n/d');

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** Números do resumo: taxa de "não sei", de erro de intenção, de respostas com fonte, recall de seção e latência. */
export function summarize(rows) {
  const answered = rows.filter((r) => !r.erro_http);
  const shouldAnswer = answered.filter((r) => r.deve_responder === 'true');
  const withExpected = answered.filter((r) => r.secao_esperada_ok !== '');
  const judged = answered.filter((r) => ['definicao', 'clinico', 'como-fazer'].includes(r.tipo));
  const latencies = answered.map((r) => Number(r.latencia_ms));
  return {
    total: rows.length,
    erros_http: rows.length - answered.length,
    nao_sei: { n: shouldAnswer.filter((r) => r.nao_sei === 'true').length, de: shouldAnswer.length },
    erro_intencao: { n: judged.filter((r) => r.erro_intencao).length, de: judged.length },
    com_fonte: { n: shouldAnswer.filter((r) => r.tem_fonte === 'true').length, de: shouldAnswer.length },
    secao_esperada: { n: withExpected.filter((r) => r.secao_esperada_ok === 'true').length, de: withExpected.length },
    previa_de_ia: answered.filter((r) => r.preview === 'true').length,
    degradadas: answered.filter((r) => r.degraded === 'true').length,
    latencia_ms: { mediana: percentile(latencies, 50), p95: percentile(latencies, 95) },
  };
}

export function formatSummary(s) {
  return [
    'Perguntas avaliadas: ' + s.total + ' (erros de rede/HTTP: ' + s.erros_http + ')',
    'Taxa de "não sei" (entre as que deviam responder): ' + pct(s.nao_sei.n, s.nao_sei.de) + ' (' + s.nao_sei.n + '/' + s.nao_sei.de + ')',
    'Taxa de erro de intenção: ' + pct(s.erro_intencao.n, s.erro_intencao.de) + ' (' + s.erro_intencao.n + '/' + s.erro_intencao.de + ')',
    'Respostas com fonte (entre as que deviam responder): ' + pct(s.com_fonte.n, s.com_fonte.de) + ' (' + s.com_fonte.n + '/' + s.com_fonte.de + ')',
    'Citou a seção esperada: ' + pct(s.secao_esperada.n, s.secao_esperada.de) + ' (' + s.secao_esperada.n + '/' + s.secao_esperada.de + ')',
    'Prévias de IA: ' + s.previa_de_ia + ' | respostas degradadas: ' + s.degradadas,
    'Latência: mediana ' + s.latencia_ms.mediana + ' ms, p95 ' + s.latencia_ms.p95 + ' ms',
  ].join('\n');
}

async function ask(base, sessionToken, message) {
  const started = performance.now();
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'apiAssistantChat', args: [sessionToken, { message }] }),
    });
    return { res: await res.json(), ms: performance.now() - started };
  } catch (err) {
    return { res: { success: false, message: 'falha de rede' }, ms: performance.now() - started };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function main(argv, env) {
  const { base, options } = parseArgs(argv);
  const sessionToken = env.LIA_SESSION_TOKEN || ''; // nunca impresso
  const perfil = options.perfil || (sessionToken ? 'membro' : 'visitante');
  const golden = JSON.parse(fs.readFileSync(options.golden || DEFAULT_GOLDEN, 'utf8'));
  const cases = selectCases(golden, perfil);
  const delay = Number(options.delay) || 0;
  const rows = [];
  let consecutive = 0;
  console.error('Avaliando ' + cases.length + ' perguntas como ' + perfil + ' em ' + base);
  for (const entry of cases) {
    const { res, ms } = await ask(base, perfil === 'membro' ? sessionToken : '', entry.pergunta);
    const row = evaluate(entry, res, ms, perfil);
    rows.push(row);
    consecutive = row.erro_http ? consecutive + 1 : 0;
    if (consecutive >= MAX_CONSECUTIVE_ERRORS) { console.error('Muitos erros seguidos (limite por hora?): parando com o que já foi coletado.'); break; }
    if (delay) await sleep(delay);
  }
  const out = options.out || path.resolve(here, '..', 'avaliacao-lia-' + new Date().toISOString().slice(0, 10) + '.csv');
  fs.writeFileSync(out, toCsv(rows), 'utf8');
  console.error('CSV gravado em ' + out);
  console.error(formatSummary(summarize(rows)));
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).catch((err) => { console.error('Falha: ' + (err && err.message ? err.message : 'erro inesperado')); process.exitCode = 1; });
}
