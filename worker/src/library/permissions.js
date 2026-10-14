/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * permissions.js
 * Matriz de papéis da Biblioteca: quem pode o quê. Fonte ÚNICA para os serviços
 * (libraryCurationService, libraryWorkflowService, libraryRemovalService,
 * librarySummaryService, libraryAdminService) e para a tela "Quem pode o quê"
 * (a tabela vai ao front dentro de apiAdminLearnLibraryListQueue).
 * Pura: não toca no banco. Documentada por worker/test/libraryPermissions.test.js.
 *
 * Papéis: admin (profiles.role), curador, mentor e revisor_clinico (library_staff)
 * e membro (profiles.role member ou admin). O admin é também curador, mas NÃO
 * vira revisor clínico sozinho (decisão 12 do PLANO-CORTEX: professor orientador).
 * O cargo funcional curador (member_roles, ADR 0010) vale como 'curador' quando a capacidade library.curate
 * está liberada (com MFA ativo); a library_staff segue valendo por compatibilidade.
 */
import { capabilityCheck } from '../roles/capabilities.js';

export const ROLE_KEYS = Object.freeze(['admin', 'curador', 'mentor', 'revisor_clinico', 'membro']);

export const ROLE_LABELS = Object.freeze({
  admin: 'Administrador',
  curador: 'Curador',
  mentor: 'Mentor',
  revisor_clinico: 'Revisor clínico',
  membro: 'Membro',
});

/** Papéis guardados em library_staff (o CHECK da 030 aceita estes três). */
export const STAFF_ROLES = Object.freeze(['curador', 'revisor_clinico', 'mentor']);

const ALL_STAFF = ['admin', 'curador', 'mentor', 'revisor_clinico'];
const EDITORS = ['admin', 'curador'];
const IMPORTERS = ['admin', 'curador', 'mentor'];

const cap = (key, label, roles) => Object.freeze({ key, label, roles: Object.freeze(roles.slice()) });

// Ordem = ordem das linhas na tela "Quem pode o quê".
export const CAPABILITIES = Object.freeze([
  cap('readQueue', 'Ver os artigos para revisar e os que estão no ar', ALL_STAFF),
  cap('import', 'Importar artigos (DOI, PMID ou lista)', IMPORTERS),
  cap('editOwn', 'Editar os artigos que importou, enquanto estão para revisar', IMPORTERS),
  cap('edit', 'Editar qualquer artigo', EDITORS),
  cap('generateSummary', 'Gerar resumo com IA', EDITORS),
  cap('publish', 'Publicar (pôr no ar)', EDITORS),
  cap('reject', 'Recusar um artigo', EDITORS),
  cap('requestRemoval', 'Pedir a remoção de um artigo (o administrador decide)', IMPORTERS),
  cap('remove', 'Tirar do ar (remover) e restaurar', ['admin']),
  cap('decideRemoval', 'Aceitar ou recusar pedidos de remoção', ['admin']),
  cap('changeStatus', 'Mudar o artigo para qualquer situação', ['admin']),
  cap('clinicalReview', 'Fazer a revisão clínica (conduta, dose ou interação)', ['revisor_clinico']),
  cap('decideSuggestions', 'Aceitar ou recusar sugestões de membros', EDITORS),
  cap('manageCatalog', 'Cuidar das áreas e das coleções', EDITORS),
  cap('manageTeam', 'Dar e tirar papéis da equipe', ['admin']),
  cap('suggest', 'Sugerir um artigo pelo painel do membro', ROLE_KEYS),
]);

const BY_KEY = Object.freeze(Object.fromEntries(CAPABILITIES.map((c) => [c.key, c])));

/** A pessoa (com estes papéis) tem a capacidade? Capacidade desconhecida: não. */
export function can(roles, capability) {
  const entry = BY_KEY[capability];
  if (!entry || !Array.isArray(roles)) return false;
  return roles.some((role) => entry.roles.includes(role));
}

/** { capacidade: boolean } para todas as capacidades (objeto novo). */
export function capabilitiesOf(roles) {
  return Object.fromEntries(CAPABILITIES.map((c) => [c.key, can(roles, c.key)]));
}

/**
 * Papéis da pessoa na ordem de ROLE_KEYS: admin (e curador, que o admin também é),
 * os papéis da equipe (library_staff) e membro. Papel desconhecido da equipe é ignorado.
 */
export function rolesFor(identity, staffRoles) {
  const staff = new Set((Array.isArray(staffRoles) ? staffRoles : []).filter((r) => STAFF_ROLES.includes(r)));
  const isAdmin = identity?.role === 'admin';
  const isMember = isAdmin || identity?.role === 'member';
  if (isAdmin || (isMember && capabilityCheck(identity, 'library.curate') === 'ok')) staff.add('curador');
  return ROLE_KEYS.filter((role) => (role === 'admin' ? isAdmin : role === 'membro' ? isMember : staff.has(role)));
}

/** Tabela para a tela "Quem pode o quê" (cópia nova a cada chamada). */
export function permissionTable() {
  return {
    roles: ROLE_KEYS.map((key) => ({ key, label: ROLE_LABELS[key] })),
    rows: CAPABILITIES.map((c) => ({
      key: c.key,
      label: c.label,
      roles: Object.fromEntries(ROLE_KEYS.map((role) => [role, c.roles.includes(role)])),
    })),
  };
}
