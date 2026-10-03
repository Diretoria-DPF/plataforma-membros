/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * node-name.mjs — nome de nó normalizado para o `nodeToSid` do manifesto.
 * Alguns nós do Z-Anatomy têm espaço duplo ("Orbital part of  inferior
 * frontal gyrus"); o manifesto passa a guardar a forma com espaços simples
 * (A.9, Onda 3). O registry do atlas casa o nome do GLB ignorando
 * diferenças de espaço/"_"/"." (findByLooseName em js/engine/registry.js).
 * @param {string} name
 * @returns {string}
 */
export function normalizeNodeName(name) {
  return String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
}
