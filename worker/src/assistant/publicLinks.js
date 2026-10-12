/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/publicLinks.js
 * Mapa FIXO das seções do acervo que têm página pública, para o `url` opcional das fontes (`sources`).
 * Só caminhos relativos da lista PUBLIC_PATHS: nunca URL absoluta, nunca protocolo, nunca montado a partir
 * de texto da IA ou do banco. frontend/assistant.js tem a mesma lista (um teste confere que são iguais).
 */
export const PUBLIC_PATHS = Object.freeze([
  '/liga.html',
  '/edital.html',
  '/processo-seletivo.html',
  '/blog.html',
  '/biblioteca',
  '/termos.html',
  '/privacidade.html',
]);

// Fonte inteira -> página.
const BY_SOURCE = new Map([
  ['liga', '/liga.html'],
  ['publicacoes', '/blog.html'],
]);

// Fonte do processo seletivo: o edital, exceto estas seções, que falam da inscrição (a página do processo).
const PROCESS_PAGE_SECTIONS = new Set([
  'Ficha diagnóstica e análise de cenário',
  'Quando o seletivo está aberto ou fechado',
]);

// "fonte|seção" exatos -> página.
const BY_SECTION = new Map([
  ['kb|Processo seletivo da LAIFT', '/processo-seletivo.html'],
  ['kb|Onde ficam o blog e o site da Liga', '/liga.html'],
  ['faq|Onde ficam o blog e as publicações?', '/blog.html'],
  ['faq|Como falo com a Liga?', '/liga.html'],
  ['faq|Onde leio os Termos e a Política de Privacidade?', '/termos.html'],
  ['guia-plataforma|Blog e site da Liga', '/blog.html'],
]);

const LIBRARY_SOURCES = new Set(['kb', 'guia-plataforma']);
const LIBRARY_PREFIX = 'Biblioteca';

const isPlainText = (value) => typeof value === 'string' && value.length > 0;

/** Página pública da seção, ou null. O resultado SEMPRE está em PUBLIC_PATHS. */
export function publicPathFor(source, section) {
  if (!isPlainText(source) || !isPlainText(section)) return null;
  if (source === 'processo') return PROCESS_PAGE_SECTIONS.has(section) ? '/processo-seletivo.html' : '/edital.html';
  if (LIBRARY_SOURCES.has(source) && section.startsWith(LIBRARY_PREFIX)) return '/biblioteca';
  return BY_SECTION.get(source + '|' + section) || BY_SOURCE.get(source) || null;
}

/** O caminho é exatamente um da lista? (Sem query, sem hash, sem protocolo.) */
export function isPublicPath(path) {
  return typeof path === 'string' && PUBLIC_PATHS.includes(path);
}
