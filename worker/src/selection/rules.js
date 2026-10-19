/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * selection/rules.js
 * Regras PURAS do processo seletivo (sem banco, sem rede): ordem das etapas, validação de cada etapa e varredura do
 * texto livre. Tudo que o candidato manda é validado AQUI, no servidor; a tela só ajuda.
 *
 * Texto livre (análise de cenário, motivação, justificativas):
 *   - BLOQUEIA contato e documento (e-mail, telefone, CPF): não são necessários e não devem ficar guardados;
 *   - MARCA, sem bloquear, dado de saúde e tentativa de manipular a IA (injeção de prompt): vira "sinal" que a comissão
 *     vê. Sinal nunca penaliza; só chama uma pessoa para ler com atenção.
 */
import * as E from '../errors.js';
import * as B from './banco.js';
import { looksLikeInjection } from '../assistant/moderationRules.js';

export const STEPS = Object.freeze(['intro', 'profile', 'scenario', 'thinking', 'conduct', 'review']);
export const DATA_STEPS = Object.freeze(['intro', 'profile', 'scenario', 'thinking', 'conduct']);
export const MIN_FILL_MS = 5 * 60 * 1000;
export const RESTART_COOLDOWN_DAYS = 14;
export const LIMITS = Object.freeze({ institution: 120, motivation: 400, hoursMax: 40, areasMax: 4 });

const MSG = Object.freeze({
  step: 'Etapa inválida.',
  data: 'Os dados desta etapa estão incompletos ou inválidos. Confira e tente de novo.',
  intro: 'Para continuar, leia e aceite o edital e o aviso de privacidade e da triagem por IA.',
  contact: 'Retire e-mail, telefone ou documento do texto: não precisamos dessas informações aqui.',
  scenarioShort: 'A análise está curta. Escreva pelo menos {min} caracteres.',
  scenarioLong: 'A análise passou do limite de {max} caracteres.',
  thinkingAll: 'Responda todas as perguntas, com pelo menos {min} caracteres em cada uma.',
  conductAll: 'Conte em poucas linhas o que você faria em cada situação (pelo menos {min} caracteres).',
  tooLong: 'Uma das respostas passou do limite de caracteres.',
});

/** Texto limpo: sem caracteres de controle, quebras de linha normalizadas, no máximo 2 linhas vazias seguidas. */
export function cleanFree(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return text.slice(0, max);
}

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?55\s?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const HEALTH = /\b(diagnosticad[oa]|meu diagn[oó]stico|minha doen[cç]a|estou em tratamento|tenho (?:diabetes|depress[aã]o|ansiedade|c[aâ]ncer|hiv|epilepsia|hipertens[aã]o|asma)|meu paciente|minha paciente|prontu[aá]rio d[oea])\b/i;

/** { blocked: boolean, signals: string[] } para um texto livre. */
export function scanFreeText(text) {
  const value = typeof text === 'string' ? text : '';
  const signals = [];
  if (HEALTH.test(value)) signals.push('saude');
  if (looksLikeInjection(value)) signals.push('injecao');
  return { blocked: EMAIL.test(value) || CPF.test(value) || PHONE.test(value), signals };
}

/** Texto livre pronto para guardar: limpo, sem contato/documento; devolve também os sinais encontrados. */
export function freeField(value, max) {
  const text = cleanFree(value, max);
  const scan = scanFreeText(text);
  if (scan.blocked) throw E.ValidationError(MSG.contact);
  return { text, signals: scan.signals };
}

const pickFrom = (list, value) => (typeof value === 'string' && list.includes(value) ? value : null);
const subsetOf = (list, values, max) => {
  if (!Array.isArray(values)) return null;
  const unique = Array.from(new Set(values.filter((v) => typeof v === 'string')));
  if (!unique.length || unique.length > max || !unique.every((v) => list.includes(v))) return null;
  return list.filter((v) => unique.includes(v));
};

function validateIntro(input) {
  if (input.acceptedEdital !== true || input.acceptedAiNotice !== true || input.acceptedPrivacy !== true) throw E.ValidationError(MSG.intro);
  return { value: { acceptedEdital: true, acceptedAiNotice: true, acceptedPrivacy: true }, signals: [] };
}

function validateProfile(input) {
  const course = pickFrom(B.COURSES, input.course);
  const semester = pickFrom(B.SEMESTERS, typeof input.semester === 'number' ? String(input.semester) : input.semester);
  const areas = subsetOf(B.AREAS, input.areas, LIMITS.areasMax);
  const days = subsetOf(B.DAYS, input.days, B.DAYS.length);
  const shifts = subsetOf(B.SHIFTS, input.shifts, B.SHIFTS.length);
  const hours = Number(input.hoursPerWeek);
  const institution = cleanFree(input.institution, LIMITS.institution);
  if (!course || !semester || !areas || !days || !shifts || institution.length < 2) throw E.ValidationError(MSG.data);
  if (!Number.isInteger(hours) || hours < 1 || hours > LIMITS.hoursMax) throw E.ValidationError(MSG.data);
  const motivation = freeField(input.motivation, LIMITS.motivation);
  return { value: { course, institution, semester, areas, hoursPerWeek: hours, days, shifts, motivation: motivation.text }, signals: motivation.signals };
}

function validateScenario(input) {
  const { text, signals } = freeField(input.text, B.SCENARIO.maxChars + 1);
  if (text.length < B.SCENARIO.minChars) throw E.ValidationError(MSG.scenarioShort.replace('{min}', String(B.SCENARIO.minChars)));
  if (text.length > B.SCENARIO.maxChars) throw E.ValidationError(MSG.scenarioLong.replace('{max}', String(B.SCENARIO.maxChars)));
  return { value: { text }, signals };
}

function validateOpen(list, input, shortMsg) {
  const given = input.answers && typeof input.answers === 'object' && !Array.isArray(input.answers) ? input.answers : {};
  const answers = {};
  const signals = new Set();
  for (const q of list) {
    const field = freeField(given[q.id], q.max + 1);
    if (field.text.length < q.min) throw E.ValidationError(shortMsg.replace('{min}', String(q.min)));
    if (field.text.length > q.max) throw E.ValidationError(MSG.tooLong);
    field.signals.forEach((x) => signals.add(x));
    answers[q.id] = field.text;
  }
  return { value: { answers }, signals: Array.from(signals) };
}

const validateThinking = (input) => validateOpen(B.THINKING, input, MSG.thinkingAll);
const validateConduct = (input) => validateOpen(B.CONDUCT, input, MSG.conductAll);

/** Valida e limpa os dados de UMA etapa. Devolve { value, signals }; lança ValidationError com mensagem para a pessoa. */
export function validateStep(step, input) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  switch (step) {
    case 'intro': return validateIntro(data);
    case 'profile': return validateProfile(data);
    case 'scenario': return validateScenario(data);
    case 'thinking': return validateThinking(data);
    case 'conduct': return validateConduct(data);
    default: throw E.ValidationError(MSG.step);
  }
}

/** A etapa `step` pode ser salva agora? Todas as anteriores (que guardam dados) já estão preenchidas. */
export function canSaveStep(step, data) {
  const index = DATA_STEPS.indexOf(step);
  if (index < 0) return false;
  return DATA_STEPS.slice(0, index).every((s) => data && data[s]);
}

/** Próxima etapa depois de salvar `step`. */
export function nextStep(step) {
  const index = STEPS.indexOf(step);
  return STEPS[Math.min(index + 1, STEPS.length - 1)];
}

/** Todas as etapas com dados estão preenchidas? */
export function isComplete(data) {
  return DATA_STEPS.every((s) => data && data[s]);
}

/** Código do comprovante: LAIFT-XXXXXXXX (sem 0, 1, I, O para não confundir). */
export function newReceiptCode(randomBytes) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes || crypto.getRandomValues(new Uint8Array(8));
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return 'LAIFT-' + out;
}
