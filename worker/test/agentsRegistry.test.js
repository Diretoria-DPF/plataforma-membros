/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agentsRegistry.test.js — personas dos agentes, gerador do registro e travas de drift.
 *  - registry não está vazio (nasceu vermelho na etapa 0);
 *  - editar o .md sem regenerar falha; o hash só muda com aumento de versão (agents.lock.json);
 *  - parser estrito do frontmatter.
 */
import fs from 'node:fs';
import { AGENTS } from '../src/agents/registry.generated.js';
import { getAgent, listAgents, agentRef } from '../src/agents/registry.js';
import {
  PERSONAS_DIR, LOCK_PATH, REGISTRY_PATH, parseFrontmatter, validateMeta, buildAgent, loadPersonas, renderRegistry,
  checkLock, nextLock, renderLock,
} from '../scripts/gen-agent-registry.mjs';

const lf = (text) => text.replace(/\r\n?/g, '\n');
const readPersona = (id) => fs.readFileSync(PERSONAS_DIR + '/' + id + '.md', 'utf8');

describe('registro de agentes', () => {
  test('registry não está vazio', () => {
    expect(AGENTS.length).toBeGreaterThan(0);
  });

  test('traz as três personas, com ref no formato persona@versão#hash', () => {
    expect(listAgents().map((a) => a.id)).toEqual(['content-curator', 'paciente-virtual', 'tutor-clinico']);
    listAgents().forEach((a) => expect(agentRef(a)).toMatch(/^[a-z-]+@\d+\.\d+\.\d+#[0-9a-f]{12}$/));
  });

  test('só o tutor está ativo; paciente virtual e curador são rascunho', () => {
    expect(getAgent('tutor-clinico').status).toBe('active');
    expect(getAgent('paciente-virtual').status).toBe('draft');
    expect(getAgent('content-curator').status).toBe('draft');
    expect(getAgent('inexistente')).toBeNull();
  });

  test('nenhuma persona é aberta a visitante; todas usam dose_policy never', () => {
    listAgents().forEach((a) => {
      expect(a.roles).not.toContain('visitor');
      expect(a.dosePolicy).toBe('never');
    });
  });

  test('o registro é imutável', () => {
    const tutor = getAgent('tutor-clinico');
    expect(Object.isFrozen(tutor)).toBe(true);
    expect(Object.isFrozen(tutor.roles)).toBe(true);
    expect(() => { 'use strict'; tutor.roles.push('visitor'); }).toThrow();
  });

  test('o prompt do tutor proíbe dose, caso real e fonte inventada, e manda ao SAMU 192', () => {
    const { prompt } = getAgent('tutor-clinico');
    expect(prompt).toMatch(/Nunca cite dose/);
    expect(prompt).toMatch(/SAMU \(192\)/);
    expect(prompt).toMatch(/FONTES PERMITIDAS/);
    expect(prompt).toMatch(/Não invente referência/);
  });
});

describe('drift do registro gerado', () => {
  test('registry.generated.js é exatamente o que o gerador produz hoje dos .md (rode `npm run gen:agents` se falhar)', () => {
    expect(lf(fs.readFileSync(REGISTRY_PATH, 'utf8'))).toBe(lf(renderRegistry(loadPersonas())));
  });

  test('agents.lock.json está em dia com as personas', () => {
    const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    expect(lock).toEqual(nextLock(loadPersonas()));
    expect(lf(fs.readFileSync(LOCK_PATH, 'utf8'))).toBe(renderLock(lock));
    expect(checkLock(loadPersonas(), lock)).toEqual([]);
  });

  test('editar o .md SEM regenerar falha: o registro commitado difere e o lock acusa a falta de nova versão', () => {
    const edited = readPersona('tutor-clinico').replace('Explique com clareza', 'Explique com MUITA clareza');
    const agents = loadPersonas().filter((a) => a.id !== 'tutor-clinico').concat(buildAgent('tutor-clinico.md', edited));
    agents.sort((a, b) => a.id.localeCompare(b.id));
    expect(lf(renderRegistry(agents))).not.toBe(lf(fs.readFileSync(REGISTRY_PATH, 'utf8')));
    const problems = checkLock(agents, JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')));
    expect(problems).toEqual(['tutor-clinico: o conteúdo mudou sem aumentar a versão (1.0.0)']);
  });

  test('o hash só muda com aumento de versão', () => {
    const base = { id: 'x', version: '1.0.0', hash: 'aaaaaaaaaaaa' };
    const lock = { x: { version: '1.0.0', hash: 'aaaaaaaaaaaa' } };
    expect(checkLock([base], lock)).toEqual([]);
    expect(checkLock([{ ...base, hash: 'bbbbbbbbbbbb' }], lock)).toHaveLength(1);
    expect(checkLock([{ ...base, hash: 'bbbbbbbbbbbb', version: '1.0.1' }], lock)).toEqual([]);
    expect(checkLock([{ ...base, hash: 'bbbbbbbbbbbb', version: '0.9.0' }], lock)).toHaveLength(1);
    expect(checkLock([{ ...base, version: '1.2.0' }], lock)).toEqual([]);
    expect(checkLock([], lock)).toHaveLength(1);
    expect(checkLock([base, { id: 'novo', version: '0.1.0', hash: 'cccccccccccc' }], lock)).toEqual([]);
  });

  test('o hash depende do conteúdo, e não do fim de linha do arquivo', () => {
    const text = readPersona('tutor-clinico');
    expect(buildAgent('tutor-clinico.md', text.replace(/\n/g, '\r\n')).hash).toBe(buildAgent('tutor-clinico.md', text).hash);
    expect(buildAgent('tutor-clinico.md', text.replace('Tutor Clínico', 'Tutor Clinico')).hash).not.toBe(getAgent('tutor-clinico').hash);
  });
});

describe('frontmatter estrito', () => {
  const ok = readPersona('tutor-clinico');

  test('lê escalares, listas em linha, mapas de um nível e comentários', () => {
    const { meta, body } = parseFrontmatter('---\na: 1\nb: 0.5\nc: true\nd: [x, y]\ne: "texto: com dois pontos"\nm:\n  k: false # nota\n---\ncorpo\n');
    expect(meta).toEqual({ a: 1, b: 0.5, c: true, d: ['x', 'y'], e: 'texto: com dois pontos', m: { k: false } });
    expect(body).toBe('corpo');
  });

  test('versão semântica fica texto (não vira número)', () => {
    expect(parseFrontmatter('---\nv: 1.0.0\n---\nx').meta.v).toBe('1.0.0');
  });

  test.each([
    ['sem frontmatter', 'sem cabeçalho'],
    ['recuo sem mapa', '---\n  k: 1\n---\nx'],
    ['linha inválida', '---\nisso nao e chave\n---\nx'],
    ['chave repetida', '---\na: 1\na: 2\n---\nx'],
    ['dois níveis', '---\nm:\n  n:\n    k: 1\n---\nx'],
    ['recuo de 4', '---\nm:\n    k: 1\n---\nx'],
  ])('rejeita %s', (_nome, text) => {
    expect(() => parseFrontmatter(text)).toThrow();
  });

  test('o esquema derruba campo ausente, desconhecido, tipo errado e valor fora da faixa', () => {
    const meta = parseFrontmatter(ok).meta;
    expect(validateMeta(meta)).toEqual([]);
    const { flag, ...semFlag } = meta;
    expect(validateMeta(semFlag)).toEqual(['campo ausente: flag']);
    expect(validateMeta({ ...meta, extra: 1 })).toEqual(['campo desconhecido: extra']);
    expect(validateMeta({ ...meta, temperature: 3 })).toEqual(['valor inválido em temperature']);
    expect(validateMeta({ ...meta, tier: 'giant' })).toEqual(['valor inválido em tier']);
    expect(validateMeta({ ...meta, roles: ['visitor'] })).toEqual(['valor inválido em roles']);
    expect(validateMeta({ ...meta, dose_policy: 'sometimes' })).toEqual(['valor inválido em dose_policy']);
    expect(validateMeta({ ...meta, guardrails: { input: ['I9'], output: [] } })).toEqual(['valor inválido em guardrails']);
    expect(validateMeta({ ...meta, memory: { read: true } })).toEqual(['valor inválido em memory']);
  });

  test('o id precisa ser igual ao nome do arquivo e o prompt não pode ser vazio', () => {
    expect(() => buildAgent('outro.md', ok)).toThrow(/id difere do nome do arquivo/);
    expect(() => buildAgent('tutor-clinico.md', ok.split('\n---\n')[0] + '\n---\n')).toThrow(/prompt vazio/);
  });
});
