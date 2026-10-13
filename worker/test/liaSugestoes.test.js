/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * liaSugestoes.test.js — sugestões da Lia por contexto (frontend/assistant-suggestions.js) e as do servidor
 * (kb.js, para quem não tem login). Regra de ouro: TODA sugestão tem resposta boa na base, ou por intenção
 * por regra (que responde aquele tipo de pergunta) ou por um trecho do acervo que a busca de fato devolve.
 */
import { createRequire } from 'node:module';
import * as Rag from '../src/services/ragService.js';
import * as Assistant from '../src/services/assistantService.js';
import { buildDocuments } from '../src/assistant/docs.js';
import { matchIntent, VISITOR_SUGGESTIONS, DEFAULT_SUGGESTIONS, suggestionsForVisitor } from '../src/assistant/kb.js';
import { questionKind, allowIntent } from '../src/assistant/questionKind.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { makeEnv } from './helpers/mockEnv.js';
import { routedSql } from './helpers/aiTestUtils.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const require = createRequire(import.meta.url);
const Front = require('../../frontend/assistant-suggestions.js');

// Pergunta de definição não é respondida por intenção de passo a passo: ela depende do acervo. Seção esperada no topo.
const RAG_ANSWERS = {
  'O que é a LAIFT?': 'O que é a LAIFT',
  'O que é o blog da LAIFT?': 'Blog da LAIFT: as séries',
  'O que é farmacocinética?': 'O que é farmacocinética?',
  'Qual a diferença entre farmacologia e toxicologia?': 'Farmacologia e Toxicologia: a diferença',
  'O que é a Biblioteca LAIFT?': 'Biblioteca LAIFT: o que é',
};

const ADMIN_PANELS = Object.keys(Front.BY_PANEL).filter((id) => id.startsWith('panel-admin'));
const LISTS = [
  ['visitante (sem sessão)', Front.VISITOR, null],
  ['membro: início', Front.HOME, 'member'],
  ['admin: padrão das telas Admin', Front.ADMIN, 'admin'],
  ...Object.entries(Front.BY_PANEL).map(([id, list]) => [id, list, ADMIN_PANELS.includes(id) ? 'admin' : 'member']),
];
const CASES = LISTS.flatMap(([name, list, role]) => list.map((question) => [name, question, role]));

describe('as listas', () => {
  test.each(LISTS)('%s: 2 a 4 perguntas curtas, sem repetição', (_name, list) => {
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.length).toBeLessThanOrEqual(4);
    expect(new Set(list).size).toBe(list.length);
    list.forEach((q) => { expect(typeof q).toBe('string'); expect(q.length).toBeLessThanOrEqual(60); });
  });

  test('a lista do visitante no front é IGUAL à do servidor e não tem nada de membro', () => {
    expect(Front.VISITOR).toEqual(VISITOR_SUGGESTIONS);
    expect(VISITOR_SUGGESTIONS.join(' ')).not.toMatch(/crachá|evento|tarefa|proposta/i);
  });

  test('suggestionsFor: sem sessão, visitante; logado, a tela; tela desconhecida, início; tela Admin sem lista, gestão', () => {
    expect(Front.suggestionsFor(false, 'panel-events')).toEqual(Front.VISITOR);
    expect(Front.suggestionsFor(true, 'panel-events')).toEqual(Front.BY_PANEL['panel-events']);
    expect(Front.suggestionsFor(true, '')).toEqual(Front.HOME);
    expect(Front.suggestionsFor(true, undefined)).toEqual(Front.HOME);
    expect(Front.suggestionsFor(true, '__proto__')).toEqual(Front.HOME);
    expect(Front.suggestionsFor(true, 'panel-admin-users')).toEqual(Front.ADMIN);
    expect(Front.suggestionsFor(true, 'panel-admin-library')).toEqual(Front.BY_PANEL['panel-admin-library']);
  });

  test('devolve cópia: mexer no resultado não muda a lista', () => {
    Front.suggestionsFor(false).push('x');
    Front.suggestionsFor(true, 'panel-events').push('x');
    expect(Front.VISITOR).not.toContain('x');
    expect(Front.BY_PANEL['panel-events']).not.toContain('x');
  });

  test('cada tela de módulo do app tem a sua lista (início, eventos, aprender, biblioteca, mensagens, perfil...)', () => {
    ['panel-home', 'panel-events', 'panel-learn', 'panel-library', 'panel-messages', 'panel-profile', 'panel-proposals', 'panel-tasks', 'panel-orgchart']
      .forEach((id) => expect(Front.BY_PANEL[id]).toBeDefined());
  });
});

describe('toda sugestão tem resposta boa na base', () => {
  let db;
  let sql;
  beforeAll(async () => {
    db = await createMigratedDb();
    sql = toSql(db);
    await Rag.reindex(sql, makeEnv(), buildDocuments());
  }, 120000);
  afterAll(async () => { if (db) await db.close(); });

  test.each(CASES)('%s · %s', async (_name, question, role) => {
    expect(questionKind(question)).not.toBe('clinico'); // nunca induz conduta clínica
    const hit = matchIntent(question, [], role);
    const byRule = !!hit && allowIntent(questionKind(question), hit);
    if (byRule) return; // responde a intenção por regra, texto fixo da base
    const expected = RAG_ANSWERS[question];
    expect(expected).toBeDefined(); // sem intenção que a responda, tem de estar mapeada ao trecho do acervo
    const { chunks } = await Rag.retrieve(sql, makeEnv(), question);
    expect(chunks[0].section).toBe(expected);
  });

  test('as perguntas de cancelamento são respondidas com o passo certo', () => {
    ['Como cancelo minha inscrição?'].forEach((q) => {
      const hit = matchIntent(q, [], 'member');
      expect(hit.id).toBe('eventos');
      expect(hit.intent.reply).toMatch(/Cancelar inscrição/);
    });
  });
});

describe('sugestões do servidor para quem não tem login', () => {
  test('a lista padrão vira a do visitante; a de intenção perde o que é só de membro', () => {
    expect(suggestionsForVisitor(DEFAULT_SUGGESTIONS.slice(0, 3))).toEqual(VISITOR_SUGGESTIONS.slice(0, 3));
    expect(suggestionsForVisitor(['Meu crachá', 'Processo seletivo'])).toEqual(['Processo seletivo']);
    expect(suggestionsForVisitor(['Equipe', 'Meu crachá'])).toEqual(VISITOR_SUGGESTIONS.slice(0, 3));
    expect(suggestionsForVisitor(['Processo seletivo', 'Blog e publicações'])).toEqual(['Processo seletivo', 'Blog e publicações']);
    expect(suggestionsForVisitor(undefined)).toEqual(VISITOR_SUGGESTIONS.slice(0, 3));
    expect(suggestionsForVisitor([])).toEqual(VISITOR_SUGGESTIONS.slice(0, 3));
  });

  const FLAGS = ['FROM feature_flags', [{ key: 'chatbot_enabled', enabled: true, rollout_pct: 100, conditions: {} }]];
  const chat = (identity, message) => {
    __resetFlagCacheForTests();
    return Assistant.chat(routedSql([FLAGS]), makeEnv(), identity, { message }, 'cid-00000000-0000-4000-8000-000000000000');
  };
  const MEMBER = { profileId: 'm-1', role: 'member', fullName: 'Maria', email: 'maria@exemplo.com' };

  test('visitante: resposta fixa de "não sei" e intenção sem "Meu crachá"', async () => {
    const fallback = await chat(null, 'qual a diferença entre agonista e antagonista?');
    expect(fallback.source).toBe('fallback');
    expect(fallback.suggestions).toEqual(VISITOR_SUGGESTIONS.slice(0, 3));
    const ajuda = await chat(null, 'o que posso fazer na plataforma?');
    expect(ajuda.source).toBe('kb');
    expect(ajuda.suggestions).not.toContain('Meu crachá');
    const eventos = await chat(null, 'como me inscrevo em um evento?');
    expect(eventos.suggestions).not.toContain('Meu crachá');
  });

  test('membro: nada muda (as sugestões da intenção e o padrão de sempre)', async () => {
    const fallback = await chat(MEMBER, 'qual a diferença entre agonista e antagonista?');
    expect(fallback.suggestions).toEqual(DEFAULT_SUGGESTIONS.slice(0, 3));
    const credencial = await chat(MEMBER, 'onde fica o meu crachá?');
    expect(credencial.suggestions.length).toBeGreaterThan(0);
  });

  test('a resposta "O que posso fazer na plataforma?" serve a qualquer pessoa: sem conta e com conta', async () => {
    const res = await chat(null, 'o que posso fazer na plataforma?');
    expect(res.reply).toMatch(/Sem conta:.*blog.*processo seletivo.*catálogo público da Biblioteca.*criar a sua conta/s);
    expect(res.reply).toMatch(/Com conta de membro:.*eventos.*cancelar a inscrição.*módulos.*crachá.*Biblioteca completa.*mensagens.*propostas.*tarefas/s);
    expect(res.reply.length).toBeLessThan(700); // tom curto
  });
});
