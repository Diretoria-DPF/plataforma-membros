/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memoryUnits.test.js — peças PURAS da memória: vocabulário controlado, política, pseudônimo (HMAC), cache do tutor,
 * execução em segundo plano e createMemoryDb (db.js).
 */
import { jest } from '@jest/globals';
import * as C from '../src/constants.js';
import { createMemoryDb } from '../src/db.js';
import {
  TOPICS, PREFERENCES, GOALS, matchTopics, normalizeText, levelFromAccuracy, moduleTopic, validateMemberItem, MemoryInputError,
  vocabularyView, promptItem, isTopic,
} from '../src/memory/vocabulary.js';
import { ineligibleReason, consentState, computeExpiry, isExpired, hasRoom, consentAllowsUse } from '../src/memory/policy.js';
import { subjectIdFor, memoryKeyConfigured } from '../src/memory/subject.js';
import { cacheGet, cacheSet, cacheInvalidate, __resetTutorCacheForTests } from '../src/memory/tutorCache.js';
import { runInBackground } from '../src/memory/background.js';

describe('vocabulário controlado', () => {
  test('todo tema tem slug no formato do banco e rótulo; poucos e claros', () => {
    const slugs = Object.keys(TOPICS);
    expect(slugs.length).toBeGreaterThanOrEqual(20);
    expect(slugs.length).toBeLessThanOrEqual(40);
    slugs.forEach((slug) => {
      expect(slug).toMatch(/^[a-z0-9_-]{2,40}$/);
      expect(TOPICS[slug].label.length).toBeGreaterThan(2);
      expect(isTopic(slug)).toBe(true);
    });
  });

  test('o vocabulário NÃO contém dado de saúde de pessoa: só conceitos e classes', () => {
    const all = JSON.stringify(vocabularyView()).toLowerCase();
    ['paciente', 'depress', 'câncer', 'hiv', 'gestante', 'meu ', 'minha '].forEach((w) => expect(all).not.toContain(w));
  });

  test.each([
    ['Como a atropina antagoniza a ação colinérgica?', ['sistema-nervoso-autonomo']],
    ['qual a meia-vida e a biodisponibilidade?', ['farmacocinetica']],
    ['Diferença entre toxicocinética e toxicodinâmica', ['toxicocinetica', 'toxicodinamica']],
    ['AINEs e inibição da COX-2', ['aines']],
    ['anticoagulantes: heparina e varfarina', ['coagulacao']],
    ['por que o paracetamol é hepatotóxico?', ['toxicologia-hepatica']],
    ['qual o antídoto da intoxicação por opioide? naloxona', ['antidotos']],
    ['me explica o ciclo de Krebs', []],
    ['', []],
  ])('mapeia %j para %j', (text, expected) => {
    expect(matchTopics(text)).toEqual(expected);
  });

  test('palavra exata não casa dentro de outra ("paine" não é AINEs); máximo de temas respeitado', () => {
    expect(matchTopics('a paine do caso')).toEqual([]);
    expect(matchTopics('farmacodinâmica farmacocinética diuréticos estatinas antibióticos coagulação', 3)).toHaveLength(3);
  });

  test('o texto mapeado nunca é devolvido: só slugs do vocabulário', () => {
    const out = matchTopics('minha mãe tem diabetes e toma insulina; farmacocinética da insulina');
    out.forEach((slug) => expect(isTopic(slug)).toBe(true));
    expect(JSON.stringify(out)).not.toMatch(/mãe|diabetes/);
  });

  test('normalizeText tira acento e caixa; aguenta valores estranhos', () => {
    expect(normalizeText('AÇÃO Colinérgica')).toBe('acao colinergica');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  test('levelFromAccuracy: faixas de 1 a 5 e entrada inválida', () => {
    expect([10, 9, 8, 6, 4, 2, 0].map((c) => levelFromAccuracy(c, 10))).toEqual([5, 5, 4, 3, 2, 1, 1]);
    [[-1, 10], [11, 10], [1.5, 10], [1, 0], ['3', '4'], [null, 3]].forEach(([c, t]) => expect(levelFromAccuracy(c, t)).toBeNull());
  });

  test('tema geral do módulo do simulado', () => {
    expect(moduleTopic('farmacologia')).toBe('farmacologia-geral');
    expect(moduleTopic('toxicologia')).toBe('toxicologia-geral');
    expect(moduleTopic('anatomia')).toBe('anatomia-geral');
    expect(moduleTopic('clinica')).toBeNull();
  });

  test('promptItem: forma enxuta (sem id, datas nem origem), com rótulo de tema', () => {
    expect(promptItem({ id: 'x', kind: 'topic_level', slug: 'aines', level: 4, value: null, source: 'quiz' })).toEqual({ tipo: 'nivel_no_tema', tema: 'AINEs', nivel: 4 });
    expect(promptItem({ kind: 'study_pref', slug: 'formato', level: null, value: 'resumo' })).toEqual({ tipo: 'preferencia', tema: 'formato', valor: 'resumo' });
    expect(promptItem({ kind: 'difficulty', slug: 'coagulacao', level: 2, value: 'duvida' })).toEqual({ tipo: 'duvida_recorrente', tema: 'Coagulação', nivel: 2 });
  });
});

describe('validateMemberItem — nunca texto livre', () => {
  test('aceita só as combinações da lista e marca source member', () => {
    expect(validateMemberItem({ kind: 'topic_level', slug: 'aines', level: 3 })).toEqual({ kind: 'topic_level', slug: 'aines', level: 3, value: null, source: 'member' });
    expect(validateMemberItem({ kind: 'study_pref', slug: 'ritmo', value: 'curto' })).toMatchObject({ level: null, value: 'curto' });
    expect(validateMemberItem({ kind: 'goal', slug: 'prova' })).toMatchObject({ value: 'ativo' });
    expect(validateMemberItem({ kind: 'goal', slug: 'prova', value: 'ativo' })).toMatchObject({ value: 'ativo' });
  });

  test('todos os valores de preferência e objetivos do vocabulário são aceitos', () => {
    Object.keys(PREFERENCES).forEach((slug) => PREFERENCES[slug].forEach((value) => expect(validateMemberItem({ kind: 'study_pref', slug, value }).value).toBe(value)));
    GOALS.forEach((slug) => expect(validateMemberItem({ kind: 'goal', slug }).slug).toBe(slug));
  });

  test.each([
    [{ kind: 'goal', slug: 'prova', comentario: 'x' }],
    [{ kind: 'goal', slug: 'prova', value: 'x'.repeat(500) }],
    [{ kind: 'topic_level', slug: 'aines', level: 3, texto: 'x' }],
    [{ kind: 'difficulty', slug: 'aines', level: 3, value: 'duvida' }],
    [{ kind: 'topic_level', slug: 'inexistente', level: 3 }],
    [{ kind: 'study_pref', slug: 'formato', value: 'poesia' }],
    [null], [[]], ['texto'], [42], [{}],
  ])('recusa %j', (input) => {
    expect(() => validateMemberItem(input)).toThrow(MemoryInputError);
  });
});

describe('política', () => {
  test('papéis: só membro e admin; menor é recusado pela mesma decisão do tutor', () => {
    expect(ineligibleReason({ role: 'member' })).toBeNull();
    expect(ineligibleReason({ role: 'admin' })).toBeNull();
    expect(ineligibleReason({ role: 'visitor' })).toBe('role');
    expect(ineligibleReason(null)).toBe('role');
    expect(ineligibleReason({ role: 'member', isMinor: true })).toBe('age');
    expect(ineligibleReason({ role: 'member' }, { minorsEnabled: true })).toBe('age');
    expect(ineligibleReason({ role: 'member', adultConfirmed: true }, { minorsEnabled: true })).toBeNull();
  });

  test('consentimento vigente só na versão atual da finalidade', () => {
    expect(consentState(null)).toMatchObject({ status: 'none', current: false, needsReconsent: false });
    const granted = { status: 'granted', purpose_version: C.MEMORY.PURPOSE_VERSION, granted_at: '2026-10-12T10:00:00Z', revoked_at: null };
    expect(consentState(granted)).toMatchObject({ status: 'granted', current: true, needsReconsent: false, grantedAt: '2026-10-12T10:00:00.000Z' });
    expect(consentAllowsUse(consentState(granted))).toBe(true);
    const old = consentState({ ...granted, purpose_version: 'memoria-antiga' });
    expect(old).toMatchObject({ current: false, needsReconsent: true, acceptedVersion: 'memoria-antiga' });
    expect(consentAllowsUse(old)).toBe(false);
    expect(consentState({ status: 'revoked', purpose_version: C.MEMORY.PURPOSE_VERSION, revoked_at: '2026-10-12T10:00:00Z' })).toMatchObject({ current: false, needsReconsent: false });
    expect(consentAllowsUse(null)).toBe(false);
  });

  test('retenção: o menor entre 180 dias sem uso e 12 meses desde a criação', () => {
    const created = '2026-01-10T00:00:00Z';
    expect(computeExpiry(created, '2026-01-10T00:00:00Z').toISOString()).toBe('2026-07-09T00:00:00.000Z');
    expect(computeExpiry(created, '2026-12-01T00:00:00Z').toISOString()).toBe('2027-01-10T00:00:00.000Z');
  });

  test('vencido e teto', () => {
    expect(isExpired({ expiresAt: '2026-10-01T00:00:00Z' }, new Date('2026-10-12'))).toBe(true);
    expect(isExpired({ expiresAt: '2026-11-01T00:00:00Z' }, new Date('2026-10-12'))).toBe(false);
    expect(isExpired({})).toBe(true);
    expect(hasRoom(59)).toBe(true);
    expect(hasRoom(60)).toBe(false);
    expect(hasRoom('3')).toBe(false);
  });
});

describe('pseudônimo da pessoa (HMAC-SHA256)', () => {
  const KEY = 'chave-de-teste-com-mais-de-32-caracteres!!';
  const ID = '11111111-1111-4111-8111-111111111111';

  test('é determinístico, hexadecimal de 64 caracteres e depende da chave', async () => {
    const a = await subjectIdFor({ MEMORY_SUBJECT_KEY: KEY }, ID);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await subjectIdFor({ MEMORY_SUBJECT_KEY: KEY }, ID)).toBe(a);
    expect(await subjectIdFor({ MEMORY_SUBJECT_KEY: KEY + 'x' }, ID)).not.toBe(a);
    expect(await subjectIdFor({ MEMORY_SUBJECT_KEY: KEY }, '22222222-2222-4222-8222-222222222222')).not.toBe(a);
  });

  test('confere com HMAC-SHA256 do Node', async () => {
    const { createHmac } = await import('node:crypto');
    expect(await subjectIdFor({ MEMORY_SUBJECT_KEY: KEY }, ID)).toBe(createHmac('sha256', KEY).update(ID).digest('hex'));
  });

  test.each([undefined, null, '', 'curta', 12345678901234567890123456789012])('chave ausente ou curta (%p): falha fechada', async (key) => {
    expect(memoryKeyConfigured({ MEMORY_SUBJECT_KEY: key })).toBe(false);
    await expect(subjectIdFor({ MEMORY_SUBJECT_KEY: key }, ID)).rejects.toThrow('MEMORY_KEY_MISSING');
  });

  test.each([undefined, '', 'x', '../../etc', 42])('id inválido (%p): recusa', async (id) => {
    await expect(subjectIdFor({ MEMORY_SUBJECT_KEY: KEY }, id)).rejects.toThrow('MEMORY_SUBJECT_INVALID');
  });
});

describe('cache do tutor (5 minutos, por pessoa, memória do isolate)', () => {
  beforeEach(__resetTutorCacheForTests);

  test('guarda, expira em 5 minutos e invalida', () => {
    cacheSet('p1', [{ tipo: 'x' }], 1000);
    expect(cacheGet('p1', 1000 + 299999)).toEqual([{ tipo: 'x' }]);
    expect(cacheGet('p1', 1000 + 300000)).toBeNull();
    cacheSet('p2', [], 5000);
    cacheInvalidate('p2');
    expect(cacheGet('p2', 5001)).toBeNull();
    expect(cacheGet('nunca', 1)).toBeNull();
  });

  test('lista vazia é um acerto válido (não consulta de novo) e o cache é limitado', () => {
    cacheSet('vazio', [], 1);
    expect(cacheGet('vazio', 2)).toEqual([]);
    for (let i = 0; i < C.MEMORY.CACHE_MAX_ENTRIES + 20; i++) cacheSet('p' + i, [], 10);
    expect(cacheGet('p0', 11)).toBeNull();
    expect(cacheGet('p' + (C.MEMORY.CACHE_MAX_ENTRIES + 19), 11)).toEqual([]);
  });

  test('o que está no cache não pode ser alterado por fora', () => {
    const items = [{ tipo: 'x' }];
    cacheSet('p', items, 1);
    items.push({ tipo: 'y' });
    expect(cacheGet('p', 2)).toHaveLength(1);
    expect(() => cacheGet('p', 2).push({})).toThrow();
  });
});

describe('segundo plano (waitUntil)', () => {
  test('entrega ao waitUntil e devolve undefined', async () => {
    const waitUntil = jest.fn();
    const ran = jest.fn(async () => 1);
    expect(runInBackground({ waitUntil }, ran)).toBeUndefined();
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(ran).toHaveBeenCalled();
  });

  test('sem waitUntil devolve a promessa; falha vira silêncio (nunca rejeita nem lança)', async () => {
    await expect(runInBackground({}, async () => { throw new Error('boom'); })).resolves.toBeUndefined();
    await expect(runInBackground(undefined, Promise.reject(new Error('boom')))).resolves.toBeUndefined();
    await expect(runInBackground({}, () => { throw new Error('síncrono'); })).resolves.toBeUndefined();
  });

  test('waitUntil que lança não derruba o chamador', async () => {
    const env = { waitUntil: () => { throw new Error('sem ctx'); } };
    await expect(runInBackground(env, async () => 1)).resolves.toBeUndefined();
  });
});

describe('createMemoryDb (db.js)', () => {
  test('sem DATABASE_URL_MEMORY devolve null (nada muda para quem não configurou)', () => {
    [undefined, null, {}, { DATABASE_URL_MEMORY: '' }, { DATABASE_URL_MEMORY: '   ' }, { DATABASE_URL_MEMORY: 42 }].forEach((env) => expect(createMemoryDb(env)).toBeNull());
  });

  test('env.memorySql (injeção de teste) tem prioridade', () => {
    const fake = () => null;
    expect(createMemoryDb({ memorySql: fake, DATABASE_URL_MEMORY: 'postgres://u:p@h/d' })).toBe(fake);
  });

  test('com URL cria o cliente do Neon e o memoiza por URL', () => {
    const url = 'postgres://laift_memory_worker:senha@ep-teste.neon.tech/laift_memory?sslmode=require';
    const a = createMemoryDb({ DATABASE_URL_MEMORY: url });
    expect(typeof a).toBe('function');
    expect(typeof a.transaction).toBe('function');
    expect(createMemoryDb({ DATABASE_URL_MEMORY: url })).toBe(a);
    expect(createMemoryDb({ DATABASE_URL_MEMORY: url.replace('laift_memory?', 'outro?') })).not.toBe(a);
  });
});
