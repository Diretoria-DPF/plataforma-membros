/**
 * ai/validators.js
 * Validação e normalização de tudo que entra no modelo vindo do cliente e de
 * tudo que sai do modelo com estrutura (avaliação e caso gerado).
 *
 * Por que normalizar a SAÍDA do modelo, e não só conferir: o caso gerado é
 * salvo no acervo e, depois de aprovado, exibido a outras pessoas. Guardamos
 * apenas os campos que o clinic-engine.js consome, com tipos e tamanhos
 * fixos — qualquer campo extra que o modelo invente é descartado, e um
 * campo obrigatório ausente torna o caso inteiro inválido (nada é salvo).
 *
 * O formato do caso é o de frontend/modulos/clinica/patients.js (lido pelo
 * clinic-engine.js): titulo, tipo, paciente{…}, queixaPrincipal,
 * historicoAdmissao, sinaisVitais{…}, contextoOculto{…}, guiaSemiologico{…},
 * perguntasSugeridas[], examesDisponiveis[{…}], gabaritoPreceptor{…}.
 */

// Caracteres de controle (exceto \n e \t) nunca têm uso legítimo aqui.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value, max) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const s = String(value).replace(CONTROL_CHARS, '').replace(/\r\n?/g, '\n').trim();
  return max && s.length > max ? s.slice(0, max).trim() : s;
}

function cleanList(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => cleanText(v, maxLen)).filter(Boolean).slice(0, maxItems);
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function byteLength(value) {
  return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value === undefined ? null : value)).length;
}

export function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function parseJsonObject(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim();
  // Alguns modelos embrulham o JSON em ```json … ``` mesmo em JSON mode.
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1];
  try {
    const parsed = JSON.parse(t);
    return isPlainObject(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Toxíndromes: lista FECHADA, para o filtro do acervo e o radar agregarem
// sempre pelos mesmos nomes (o modelo escreve "Síndrome colinérgica",
// "colinergica", "Colinérgica muscarínica"… e o radar viraria ruído).
// ---------------------------------------------------------------------------
export const TOXINDROMES = [
  'Colinérgica', 'Anticolinérgica', 'Simpatomimética', 'Opioide', 'Sedativo-hipnótica',
  'Serotoninérgica', 'Hemorrágica/Coagulopatia', 'Hepatotóxica/Metabólica', 'Outra',
];

export function normalizeToxindrome(value) {
  const s = stripAccents(cleanText(value, 120)).toLowerCase();
  if (!s) return 'Outra';
  if (s.includes('anticolinerg')) return 'Anticolinérgica';
  if (s.includes('colinerg') || s.includes('organofosf') || s.includes('carbamat')) return 'Colinérgica';
  if (s.includes('simpatomim') || s.includes('adrenerg') || s.includes('estimulante')) return 'Simpatomimética';
  if (s.includes('opio') || s.includes('opiac')) return 'Opioide';
  if (s.includes('sedativ') || s.includes('hipnot') || s.includes('benzodiaz')) return 'Sedativo-hipnótica';
  if (s.includes('serotonin')) return 'Serotoninérgica';
  if (s.includes('hemorr') || s.includes('coagul') || s.includes('botrop') || s.includes('anticoag')) return 'Hemorrágica/Coagulopatia';
  if (s.includes('hepat') || s.includes('metabol')) return 'Hepatotóxica/Metabólica';
  return 'Outra';
}

export const DIFFICULTIES = ['Básico', 'Intermediário', 'Avançado'];

export function normalizeDifficulty(value, fallback) {
  const s = stripAccents(cleanText(value, 40)).toLowerCase();
  if (s.startsWith('bas')) return 'Básico';
  if (s.startsWith('interm')) return 'Intermediário';
  if (s.startsWith('avan')) return 'Avançado';
  return fallback || 'Intermediário';
}

// ---------------------------------------------------------------------------
// Entradas do cliente
// ---------------------------------------------------------------------------

/**
 * Histórico de conversa: só os últimos `maxTurns` turnos, cada um com papel
 * da lista permitida e texto cortado. O papel vira user/assistant no
 * prompt — o cliente não consegue injetar uma mensagem "system".
 */
export function sanitizeHistory(value, allowedRoles, maxTurns, maxLen) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t) => isPlainObject(t) && allowedRoles.indexOf(t.role) !== -1)
    .map((t) => ({ role: t.role, text: cleanText(t.text, maxLen) }))
    .filter((t) => t.text)
    .slice(-maxTurns);
}

const VITAL_KEYS = ['pa', 'fc', 'fr', 'temp', 'spo2', 'glasgow'];

function sanitizeVitals(value) {
  const v = isPlainObject(value) ? value : {};
  const out = {};
  VITAL_KEYS.forEach((k) => { out[k] = cleanText(v[k], 60); });
  return out;
}

/**
 * Contexto do paciente enviado pelo cliente (casos embutidos ou gerados na
 * própria sessão). Lista fechada de campos; tudo como texto curto. Casos do
 * ACERVO não usam isto: o contexto vem do banco (contextFromPayload).
 */
export function sanitizePatientContext(value) {
  const c = isPlainObject(value) ? value : {};
  return {
    nome: cleanText(c.nome, 80),
    idade: cleanText(c.idade, 10),
    profissao: cleanText(c.profissao || c.pacienteProfissao, 120),
    genero: cleanText(c.genero, 20),
    queixaPrincipal: cleanText(c.queixaPrincipal, 400),
    exposicaoReal: cleanText(c.exposicaoReal, 1200),
    sintomas: cleanText(c.sintomas, 600),
    temperamento: cleanText(c.temperamento, 200),
    comportamento: cleanText(c.comportamento, 400),
    regrasFala: cleanText(c.regrasFala, 600),
    nivelConsciencia: cleanText(c.nivelConsciencia, 100),
    sinaisVitais: sanitizeVitals(c.sinaisVitais),
    vitalidadeAtual: clampInt(c.vitalidadeAtual, 0, 100, 100),
    pacienciaAtual: clampInt(c.pacienciaAtual, 0, 100, 100),
    examesJaLiberados: cleanList(c.examesJaLiberados, 15, 120),
  };
}

/** Contexto do paciente a partir de um caso do acervo (payload já validado). */
export function contextFromPayload(payload, live) {
  const p = isPlainObject(payload) ? payload : {};
  const pac = isPlainObject(p.paciente) ? p.paciente : {};
  const oculto = isPlainObject(p.contextoOculto) ? p.contextoOculto : {};
  const l = isPlainObject(live) ? live : {};
  return sanitizePatientContext({
    nome: pac.nome, idade: pac.idade, profissao: pac.profissao, genero: pac.genero,
    queixaPrincipal: p.queixaPrincipal,
    exposicaoReal: oculto.exposicaoReal, sintomas: oculto.sintomas, temperamento: oculto.temperamento,
    comportamento: oculto.comportamento, regrasFala: oculto.regrasFala, nivelConsciencia: oculto.nivelConsciencia,
    sinaisVitais: p.sinaisVitais,
    // Estado da consulta (vitalidade/paciência/exames) é do cliente — não é segredo e muda a cada minuto.
    vitalidadeAtual: l.vitalidadeAtual, pacienciaAtual: l.pacienciaAtual, examesJaLiberados: l.examesJaLiberados,
  });
}

/** Gabarito: { diagnostico, conduta, palavrasChave[] } ou null se inutilizável. */
export function sanitizeAnswerKey(value) {
  if (!isPlainObject(value)) return null;
  const key = {
    diagnostico: cleanText(value.diagnostico, 800),
    conduta: cleanText(value.conduta, 1500),
    palavrasChave: cleanList(value.palavrasChave, 12, 40),
  };
  return key.diagnostico && key.conduta ? key : null;
}

export const OUTCOMES = ['concluido', 'obito', 'abandono'];

/** Dados do atendimento do estudante. Lança via `onError(msg)` se algo passar do limite. */
export function sanitizeAttendance(value, limits, onError) {
  const a = isPlainObject(value) ? value : {};
  const diagnosis = cleanText(a.diagnosis);
  const conduct = cleanText(a.conduct);
  if (diagnosis.length > limits.ATTENDANCE_TEXT_MAX) onError('O diagnóstico passou do limite de ' + limits.ATTENDANCE_TEXT_MAX + ' caracteres.');
  if (conduct.length > limits.ATTENDANCE_TEXT_MAX) onError('A conduta passou do limite de ' + limits.ATTENDANCE_TEXT_MAX + ' caracteres.');
  const outcomeRaw = stripAccents(cleanText(a.outcome, 20)).toLowerCase();
  const questions = Array.isArray(a.questionsAsked) ? cleanList(a.questionsAsked, limits.ATTENDANCE_LIST_MAX, 300) : [];
  return {
    diagnosis: diagnosis || 'Não informado pelo estudante.',
    conduct: conduct || 'Não informada pelo estudante.',
    examsRequested: cleanList(a.examsRequested, limits.ATTENDANCE_LIST_MAX, 120),
    questionsAsked: questions,
    questionsCount: Array.isArray(a.questionsAsked) ? questions.length : clampInt(a.questionsAsked, 0, 1000, 0),
    elapsedSeconds: clampInt(a.elapsedSeconds, 0, 86400, 0),
    vitality: clampInt(a.vitality, 0, 100, 100),
    outcome: OUTCOMES.indexOf(outcomeRaw) !== -1 ? outcomeRaw : 'concluido',
    toxindrome: cleanText(a.toxindrome, 80),
    agent: cleanText(a.agent, 120),
  };
}

/**
 * Termo de síntese do laboratório → chave do cache do servidor. Só letras
 * sem acento, dígitos, espaço e hífen: além de padronizar a chave, isso
 * reduz o termo a um nome de composto — ele entra num prompt montado pelo
 * SERVIDOR, e a resposta vai para um cache que outras pessoas leem.
 */
export function normalizeSynthTerm(value, min, max) {
  const s = stripAccents(cleanText(value, 200)).toLowerCase()
    .replace(/[^a-z0-9 -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < min || s.length > max) return '';
  return s;
}

// ---------------------------------------------------------------------------
// Saídas do modelo
// ---------------------------------------------------------------------------

/** Avaliação do preceptor → { score, verdict, feedback, strengths, improvements } ou null. */
export function validateEvaluation(obj) {
  if (!isPlainObject(obj)) return null;
  const scoreNum = Number(obj.score);
  if (!Number.isFinite(scoreNum)) return null;
  const verdict = cleanText(obj.verdict, 200);
  const feedback = cleanText(obj.feedback, 3000);
  if (!verdict || !feedback) return null;
  return {
    score: Math.min(100, Math.max(0, Math.round(scoreNum))),
    verdict,
    feedback,
    strengths: cleanList(obj.strengths, 6, 400),
    improvements: cleanList(obj.improvements, 6, 400),
  };
}

function slugify(s, fallback) {
  const slug = stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return slug || fallback;
}

function validateExam(e, idx, usedIds) {
  if (!isPlainObject(e)) return null;
  const nome = cleanText(e.nome, 120);
  const resultado = cleanText(e.resultado, 600);
  if (!nome || !resultado) return null;
  let id = slugify(cleanText(e.id, 60) || nome, 'exame_' + (idx + 1));
  while (usedIds.has(id)) id = id.slice(0, 36) + '_' + (idx + 1);
  usedIds.add(id);
  return {
    id,
    nome,
    custoTempoMin: clampInt(e.custoTempoMin, 1, 120, 10),
    impactoVitalidade: clampInt(e.impactoVitalidade, -30, 10, 0),
    impactoPaciencia: clampInt(e.impactoPaciencia, -30, 10, 0),
    essencial: e.essencial === true || e.essencial === 'true',
    resultado,
  };
}

/**
 * Caso gerado pela IA → objeto no formato do clinic-engine ou null (com o
 * motivo em `out.reason`, útil nos testes). Não inclui `id`: quem salva
 * no acervo define o id (UUID da linha).
 */
export function validateGeneratedCase(obj, opts, out) {
  const fail = (reason) => { if (out) out.reason = reason; return null; };
  if (!isPlainObject(obj)) return fail('não é objeto');

  const titulo = cleanText(obj.titulo, 150);
  if (titulo.length < 5) return fail('titulo');
  const agentePrincipal = cleanText(obj.agentePrincipal || obj.agente, 120);
  if (!agentePrincipal) return fail('agentePrincipal');

  const pac = isPlainObject(obj.paciente) ? obj.paciente : null;
  if (!pac || !cleanText(pac.nome, 80)) return fail('paciente');

  const queixaPrincipal = cleanText(obj.queixaPrincipal, 400);
  const historicoAdmissao = cleanText(obj.historicoAdmissao, 1200);
  if (!queixaPrincipal || !historicoAdmissao) return fail('queixa/historico');

  if (!isPlainObject(obj.sinaisVitais)) return fail('sinaisVitais');
  const sinaisVitais = sanitizeVitals(obj.sinaisVitais);

  const oculto = isPlainObject(obj.contextoOculto) ? obj.contextoOculto : null;
  if (!oculto || !cleanText(oculto.exposicaoReal, 1200)) return fail('contextoOculto');

  const usedIds = new Set();
  const exames = (Array.isArray(obj.examesDisponiveis) ? obj.examesDisponiveis : [])
    .slice(0, 10)
    .map((e, i) => validateExam(e, i, usedIds))
    .filter(Boolean);
  if (exames.length < 2) return fail('examesDisponiveis');

  const gabaritoPreceptor = sanitizeAnswerKey(obj.gabaritoPreceptor);
  if (!gabaritoPreceptor || !gabaritoPreceptor.palavrasChave.length) return fail('gabaritoPreceptor');
  gabaritoPreceptor.palavrasChave = gabaritoPreceptor.palavrasChave.map((p) => stripAccents(p).toLowerCase());

  const guia = isPlainObject(obj.guiaSemiologico) ? obj.guiaSemiologico : {};
  const taxa = isPlainObject(obj.taxaDecaimento) ? obj.taxaDecaimento : {};
  const tipoRaw = stripAccents(cleanText(obj.tipo, 20)).toLowerCase();

  return {
    titulo,
    tipo: tipoRaw.startsWith('amb') ? 'ambulatorio' : 'emergencia',
    toxindrome: normalizeToxindrome(obj.toxindrome),
    agentePrincipal,
    dificuldade: normalizeDifficulty(obj.dificuldade, opts && opts.difficulty),
    vitalidadeInicial: clampInt(obj.vitalidadeInicial, 30, 100, 85),
    pacienciaInicial: clampInt(obj.pacienciaInicial, 30, 100, 85),
    taxaDecaimento: {
      vitalidadePorMinuto: clampNum(taxa.vitalidadePorMinuto, 0, 10, 2),
      pacienciaPorMinuto: clampNum(taxa.pacienciaPorMinuto, 0, 10, 1),
    },
    paciente: {
      nome: cleanText(pac.nome, 80),
      idade: clampInt(pac.idade, 0, 110, 40),
      peso: cleanText(pac.peso, 20),
      genero: cleanText(pac.genero, 20),
      profissao: cleanText(pac.profissao, 80),
      alergias: cleanText(pac.alergias, 150),
    },
    queixaPrincipal,
    historicoAdmissao,
    sinaisVitais,
    contextoOculto: {
      exposicaoReal: cleanText(oculto.exposicaoReal, 1200),
      sintomas: cleanText(oculto.sintomas, 600),
      temperamento: cleanText(oculto.temperamento, 200),
      comportamento: cleanText(oculto.comportamento, 400),
      regrasFala: cleanText(oculto.regrasFala, 600),
      nivelConsciencia: cleanText(oculto.nivelConsciencia, 100),
    },
    guiaSemiologico: {
      cronologia: cleanList(guia.cronologia, 6, 200),
      farmacoterapia: cleanList(guia.farmacoterapia, 6, 200),
      exposicao: cleanList(guia.exposicao, 6, 200),
      sinaisAlarme: cleanList(guia.sinaisAlarme, 6, 200),
    },
    perguntasSugeridas: cleanList(obj.perguntasSugeridas, 8, 200),
    examesDisponiveis: exames,
    gabaritoPreceptor,
  };
}

/** Texto livre devolvido ao cliente: sem controles, sem espaço sobrando, com teto. */
export function cleanReply(text, max) {
  return cleanText(text, max);
}
