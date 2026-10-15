/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Matriz de papéis da Biblioteca (worker/src/library/permissions.js). Este teste É a documentação:
 * a tabela abaixo é a mesma que a tela "Quem pode o quê" mostra (ela vem do servidor, em ListQueue).
 * Quem usa: `npm test -- -i libraryPermissions`.
 */
import {
  ROLE_KEYS, ROLE_LABELS, CAPABILITIES, STAFF_ROLES, can, capabilitiesOf, rolesFor, permissionTable,
} from '../src/library/permissions.js';

// Capacidade → papéis que a têm (ordem: admin, curador, mentor, revisor_clinico, membro).
const EXPECTED = {
  readQueue: ['admin', 'curador', 'mentor', 'revisor_clinico'],
  import: ['admin', 'curador', 'mentor'],
  editOwn: ['admin', 'curador', 'mentor'],
  edit: ['admin', 'curador'],
  generateSummary: ['admin', 'curador'],
  publish: ['admin', 'curador'],
  reject: ['admin', 'curador'],
  requestRemoval: ['admin', 'curador', 'mentor'],
  remove: ['admin'],
  decideRemoval: ['admin'],
  changeStatus: ['admin'],
  clinicalReview: ['revisor_clinico'],
  decideSuggestions: ['admin', 'curador'],
  manageCatalog: ['admin', 'curador'],
  manageTeam: ['admin'],
  suggest: ['admin', 'curador', 'mentor', 'revisor_clinico', 'membro'],
};

describe('matriz de papéis', () => {
  test('papéis na ordem da tela, com rótulos em linguagem comum', () => {
    expect(ROLE_KEYS).toEqual(['admin', 'curador', 'mentor', 'revisor_clinico', 'membro']);
    expect(ROLE_LABELS).toEqual({
      admin: 'Administrador', curador: 'Curador', mentor: 'Mentor', revisor_clinico: 'Revisor clínico', membro: 'Membro',
    });
    expect(STAFF_ROLES).toEqual(['curador', 'revisor_clinico', 'mentor']);
  });

  test.each(Object.entries(EXPECTED))('%s: só os papéis da tabela', (cap, roles) => {
    ROLE_KEYS.forEach((role) => expect([role, can([role], cap)]).toEqual([role, roles.includes(role)]));
  });

  test('toda capacidade tem rótulo e está na tabela (nada fica sem documentação)', () => {
    expect(CAPABILITIES.map((c) => c.key).sort()).toEqual(Object.keys(EXPECTED).sort());
    CAPABILITIES.forEach((c) => expect(c.label.length).toBeGreaterThan(5));
  });

  test('só o admin remove; os demais da equipe pedem a remoção', () => {
    expect(can(['curador'], 'remove')).toBe(false);
    expect(can(['mentor'], 'remove')).toBe(false);
    expect(can(['curador'], 'requestRemoval')).toBe(true);
    expect(can(['mentor'], 'publish')).toBe(false);
    expect(can(['mentor'], 'reject')).toBe(false);
  });

  test('o admin não vira revisor clínico sozinho (decisão 12: professor orientador)', () => {
    expect(can(['admin', 'curador'], 'clinicalReview')).toBe(false);
    expect(can(['admin', 'revisor_clinico'], 'clinicalReview')).toBe(true);
  });

  test('capacidade desconhecida ou sem papel: não pode', () => {
    expect(can(['admin'], 'apagarTudo')).toBe(false);
    expect(can([], 'readQueue')).toBe(false);
    expect(can(null, 'readQueue')).toBe(false);
  });

  test('capabilitiesOf soma os papéis da pessoa (objeto novo, todas as chaves)', () => {
    const caps = capabilitiesOf(['mentor', 'revisor_clinico']);
    expect(Object.keys(caps).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(caps).toMatchObject({ import: true, clinicalReview: true, publish: false, remove: false });
  });
});

describe('rolesFor', () => {
  test('admin ganha admin e curador; equipe vem do library_staff; membro sugere', () => {
    expect(rolesFor({ role: 'admin' }, [])).toEqual(['admin', 'curador', 'membro']);
    expect(rolesFor({ role: 'member' }, ['mentor'])).toEqual(['mentor', 'membro']);
    expect(rolesFor({ role: 'member' }, ['revisor_clinico', 'curador'])).toEqual(['curador', 'revisor_clinico', 'membro']);
    expect(rolesFor({ role: 'member' }, [])).toEqual(['membro']);
    expect(rolesFor({ role: 'visitor' }, [])).toEqual([]);
    expect(rolesFor({ role: 'member' }, ['papel-inventado'])).toEqual(['membro']);
  });
});

describe('tabela "Quem pode o quê"', () => {
  test('uma linha por capacidade, com sim/não por papel', () => {
    const table = permissionTable();
    expect(table.roles).toEqual(ROLE_KEYS.map((key) => ({ key, label: ROLE_LABELS[key] })));
    expect(table.rows).toHaveLength(CAPABILITIES.length);
    table.rows.forEach((row) => {
      ROLE_KEYS.forEach((role) => expect(row.roles[role]).toBe(EXPECTED[row.key].includes(role)));
    });
  });

  test('a tabela é uma cópia: mexer nela não muda a matriz', () => {
    const table = permissionTable();
    table.rows[0].roles.membro = true;
    expect(permissionTable().rows[0].roles.membro).toBe(false);
  });
});

describe('rolesFor — cargo funcional curador (ADR 0010, ROL-03)', () => {
  test('capacidade library.curate com MFA ativo vale como curador; sem MFA, não', () => {
    const curador = { role: 'member', capabilities: ['library.curate'], mfaConfirmed: true };
    expect(rolesFor(curador, [])).toEqual(['curador', 'membro']);
    expect(rolesFor({ ...curador, mfaConfirmed: false }, [])).toEqual(['membro']);
    expect(rolesFor({ role: 'visitor', capabilities: ['library.curate'], mfaConfirmed: true }, [])).toEqual([]);
  });
});
