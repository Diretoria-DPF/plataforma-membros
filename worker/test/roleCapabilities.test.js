/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Matriz dos cargos funcionais (worker/src/roles/capabilities.js, ADR 0010): o que cada cargo libera, o acúmulo, o
 * admin com tudo, o visitante sem nada e quem precisa de verificação em duas etapas.
 */
import {
  CAPABILITIES, ROLE_CAPS, ADMIN_ONLY_CAPABILITIES, FUNCTIONAL_ROLES, PRIVILEGED_ROLES,
  capabilitiesFor, requiresMfa, normalizeFunctionalRoles, capabilityCheck, PRIVILEGED_CAPABILITIES,
} from '../src/roles/capabilities.js';

const EXPECTED = {
  gestor: ['events.manage', 'tasks.manage', 'attendance.manage', 'proposals.review', 'orgchart.edit'],
  revisor_conteudo: ['content.review', 'sim.review'],
  moderador: ['reports.moderate', 'assistant.feedback.moderate'],
  curador: ['library.curate'],
  mentor: ['mentoring.offer'],
};
const ADMIN_ONLY = ['users.manage', 'flags', 'mfa.reset', 'audit.read', 'metrics.read', 'roles.grant', 'kb.reindex'];

describe('capacidades — tabela', () => {
  test('cada cargo tem exatamente o seu conjunto', () => {
    expect(Object.keys(ROLE_CAPS).sort()).toEqual(Object.keys(EXPECTED).sort());
    Object.entries(EXPECTED).forEach(([role, caps]) => expect([...ROLE_CAPS[role]].sort()).toEqual([...caps].sort()));
    expect([...FUNCTIONAL_ROLES].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  test('nenhum cargo recebe uma capacidade exclusiva do admin', () => {
    expect([...ADMIN_ONLY_CAPABILITIES].sort()).toEqual([...ADMIN_ONLY].sort());
    Object.values(ROLE_CAPS).forEach((caps) => caps.forEach((c) => expect(ADMIN_ONLY).not.toContain(c)));
  });

  test('CAPABILITIES lista tudo, sem repetição', () => {
    const all = [...Object.values(EXPECTED).flat(), ...ADMIN_ONLY];
    expect([...CAPABILITIES].sort()).toEqual([...new Set(all)].sort());
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
  });

  test('tudo é congelado (imutável)', () => {
    expect(Object.isFrozen(CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(ROLE_CAPS)).toBe(true);
    Object.values(ROLE_CAPS).forEach((caps) => expect(Object.isFrozen(caps)).toBe(true));
    expect(Object.isFrozen(PRIVILEGED_ROLES)).toBe(true);
    expect(() => { 'use strict'; ROLE_CAPS.gestor.push('flags'); }).toThrow();
  });

  test('cargos privilegiados (exigem MFA): gestor, revisor de conteúdo, moderador e curador', () => {
    expect([...PRIVILEGED_ROLES].sort()).toEqual(['curador', 'gestor', 'moderador', 'revisor_conteudo']);
  });
});

describe('capabilitiesFor', () => {
  test('admin tem todas, inclusive as exclusivas, com ou sem cargo', () => {
    expect([...capabilitiesFor({ baseRole: 'admin', functionalRoles: [] })].sort()).toEqual([...CAPABILITIES].sort());
    expect([...capabilitiesFor({ baseRole: 'admin', functionalRoles: ['mentor'] })].sort()).toEqual([...CAPABILITIES].sort());
  });

  test.each(Object.keys(EXPECTED))('membro com o cargo %s recebe só o conjunto dele', (role) => {
    expect([...capabilitiesFor({ baseRole: 'member', functionalRoles: [role] })].sort()).toEqual([...EXPECTED[role]].sort());
  });

  test('membro sem cargo: só o papel base (nenhuma capacidade funcional)', () => {
    expect(capabilitiesFor({ baseRole: 'member', functionalRoles: [] })).toEqual([]);
    expect(capabilitiesFor({ baseRole: 'member' })).toEqual([]);
  });

  test('cargos acumulam (união, sem repetição)', () => {
    const caps = capabilitiesFor({ baseRole: 'member', functionalRoles: ['gestor', 'moderador', 'gestor'] });
    expect([...caps].sort()).toEqual([...EXPECTED.gestor, ...EXPECTED.moderador].sort());
  });

  test('visitante com cargo é ignorado; sem papel ou entrada inválida também não recebe nada', () => {
    expect(capabilitiesFor({ baseRole: 'visitor', functionalRoles: ['gestor', 'curador'] })).toEqual([]);
    expect(capabilitiesFor({ baseRole: undefined, functionalRoles: ['gestor'] })).toEqual([]);
    expect(capabilitiesFor()).toEqual([]);
    expect(capabilitiesFor({ baseRole: 'member', functionalRoles: 'gestor' })).toEqual([]);
  });

  test('cargo desconhecido é descartado', () => {
    expect(capabilitiesFor({ baseRole: 'member', functionalRoles: ['admin', 'superuser', 'mentor'] })).toEqual(['mentoring.offer']);
    expect(normalizeFunctionalRoles(['admin', 'mentor', 'mentor', 7, null])).toEqual(['mentor']);
  });

  test('o resultado é uma lista nova e congelada', () => {
    const caps = capabilitiesFor({ baseRole: 'member', functionalRoles: ['curador'] });
    expect(Object.isFrozen(caps)).toBe(true);
  });
});

describe('requiresMfa', () => {
  test('admin sempre; membro com cargo privilegiado sim; mentor sozinho não; visitante nunca', () => {
    expect(requiresMfa({ baseRole: 'admin', functionalRoles: [] })).toBe(true);
    PRIVILEGED_ROLES.forEach((role) => expect(requiresMfa({ baseRole: 'member', functionalRoles: [role] })).toBe(true));
    expect(requiresMfa({ baseRole: 'member', functionalRoles: ['mentor'] })).toBe(false);
    expect(requiresMfa({ baseRole: 'member', functionalRoles: [] })).toBe(false);
    expect(requiresMfa({ baseRole: 'visitor', functionalRoles: ['gestor'] })).toBe(false);
    expect(requiresMfa()).toBe(false);
  });
});

describe('capabilityCheck (ROL-03)', () => {
  test('admin passa em tudo; sem a capacidade: missing', () => {
    expect(capabilityCheck({ role: 'admin', capabilities: [] }, 'roles.grant')).toBe('ok');
    expect(capabilityCheck({ role: 'member', capabilities: [] }, 'events.manage')).toBe('missing');
    expect(capabilityCheck(null, 'events.manage')).toBe('missing');
  });

  test('capacidade de cargo privilegiado exige MFA confirmado; a do mentor não', () => {
    const gestor = { role: 'member', capabilities: ['events.manage'] };
    expect(capabilityCheck(gestor, 'events.manage')).toBe('mfa');
    expect(capabilityCheck({ ...gestor, mfaConfirmed: true }, 'events.manage')).toBe('ok');
    expect(capabilityCheck({ role: 'member', capabilities: ['mentoring.offer'] }, 'mentoring.offer')).toBe('ok');
  });

  test('PRIVILEGED_CAPABILITIES = capacidades dos cargos privilegiados', () => {
    const expected = PRIVILEGED_ROLES.flatMap((r) => EXPECTED[r]);
    expect([...PRIVILEGED_CAPABILITIES].sort()).toEqual([...new Set(expected)].sort());
    expect(PRIVILEGED_CAPABILITIES).not.toContain('mentoring.offer');
  });
});
