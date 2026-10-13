/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * liaExtractive.test.js — peças puras da resposta extrativa do visitante: o trecho (até 600 caracteres,
 * cortado em fim de frase) e o mapa fixo de páginas públicas (só caminhos relativos da allowlist).
 */
import { snippetOf, extractiveAnswer, NO_MATCH_REPLY, NO_MATCH_SUGGESTIONS } from '../src/assistant/extractive.js';
import { publicPathFor, isPublicPath, PUBLIC_PATHS } from '../src/assistant/publicLinks.js';
import { getTree } from '../src/assistant/tree.js';
import { TREE } from '../src/constants.js';

const MAX = TREE.VISITOR_SNIPPET_MAX;

describe('snippetOf — trecho de até 600 caracteres, em fim de frase', () => {
  test('texto curto vem inteiro, sem o prefixo "Título — Seção."', () => {
    expect(snippetOf('Guia — Seção A. Texto um. Texto dois.', 'Seção A')).toBe('Texto um. Texto dois.');
  });

  test('texto longo é cortado na última frase que cabe', () => {
    const sentence = 'Esta é uma frase de tamanho razoável para o teste de corte.';
    const content = 'Sec. ' + Array.from({ length: 30 }, () => sentence).join(' ');
    const out = snippetOf(content, 'Sec');
    expect(out.length).toBeLessThanOrEqual(MAX);
    expect(out.endsWith('.')).toBe(true);
    expect(out.length).toBeGreaterThan(MAX - sentence.length - 2);
  });

  test('frase única maior que o teto: corte duro numa palavra, com reticências', () => {
    const out = snippetOf('Sec. ' + 'palavra '.repeat(200), 'Sec');
    expect(out.length).toBeLessThanOrEqual(MAX);
    expect(out.endsWith('…')).toBe(true);
  });

  test('"1." de lista não conta como fim de frase', () => {
    const content = 'Sec. Para criar a conta:\n1. Na tela inicial, toque em Criar conta.\n2. ' + 'x'.repeat(700);
    const out = snippetOf(content, 'Sec');
    expect(out).toContain('1. Na tela inicial, toque em Criar conta.');
    expect(out).not.toMatch(/\n2\.\s*$/);
  });

  test('todo trecho real do acervo cabe no teto', () => {
    getTree().forEach((n) => {
      const out = snippetOf(n.content, n.section);
      expect(out.length).toBeGreaterThan(0);
      expect(out.length).toBeLessThanOrEqual(MAX);
    });
  });
});

describe('publicPathFor — mapa fixo e allowlist', () => {
  test('páginas públicas conhecidas por fonte e seção', () => {
    expect(publicPathFor('liga', 'O que é a LAIFT')).toBe('/liga.html');
    expect(publicPathFor('modulos', 'Biblioteca LAIFT: o que é')).toBe('/biblioteca'); // visitante só a vê com a Biblioteca ligada
    expect(publicPathFor('liga', 'Áreas')).toBe('/liga.html');
    expect(publicPathFor('publicacoes', 'Blog da LAIFT: as séries')).toBe('/blog.html');
    expect(publicPathFor('processo', 'Edital 2026: onde conferir as regras')).toBe('/edital.html');
    expect(publicPathFor('processo', 'Etapas do processo seletivo 2026')).toBe('/edital.html');
    expect(publicPathFor('processo', 'Ficha diagnóstica e análise de cenário')).toBe('/processo-seletivo.html');
    expect(publicPathFor('kb', 'Processo seletivo da LAIFT')).toBe('/processo-seletivo.html');
    expect(publicPathFor('kb', 'Biblioteca: como buscar artigos')).toBe('/biblioteca');
    expect(publicPathFor('guia-plataforma', 'Biblioteca: buscar e abrir artigos')).toBe('/biblioteca');
    expect(publicPathFor('faq', 'Onde leio os Termos e a Política de Privacidade?')).toBe('/termos.html');
  });

  test('sem página pública: null (nunca um caminho inventado)', () => {
    expect(publicPathFor('saude', 'A Lia pode errar em temas clínicos')).toBeNull();
    expect(publicPathFor('modulos', 'Início: resumo e atalhos do membro')).toBeNull();
    expect(publicPathFor('__proto__', 'x')).toBeNull();
    expect(publicPathFor(undefined, undefined)).toBeNull();
    expect(publicPathFor('javascript:alert(1)', 'x')).toBeNull();
  });

  test('toda url devolvida para o acervo real está na allowlist, é relativa e sem protocolo', () => {
    const urls = getTree().map((n) => publicPathFor(n.source, n.section)).filter(Boolean);
    expect(urls.length).toBeGreaterThan(10);
    urls.forEach((u) => {
      expect(PUBLIC_PATHS).toContain(u);
      expect(u).toMatch(/^\/[a-z0-9.-]+$/);
    });
  });

  test('isPublicPath: só caminho da lista', () => {
    PUBLIC_PATHS.forEach((p) => expect(isPublicPath(p)).toBe(true));
    ['//evil.example', 'https://evil.example', 'javascript:alert(1)', '/liga.html?x=1', '/admin', '', null, undefined, 42].forEach((p) => expect(isPublicPath(p)).toBe(false));
  });
});

describe('extractiveAnswer', () => {
  const chunk = { source: 'liga', section: 'O que é a LAIFT', content: 'O que é a LAIFT. A LAIFT é uma liga acadêmica. Funciona em Salvador.' };

  test('trecho + fonte no texto; sources com url da allowlist e sem o conteúdo', () => {
    const out = extractiveAnswer(chunk);
    expect(out.reply).toBe('A LAIFT é uma liga acadêmica. Funciona em Salvador.\n\n(Fonte: seção O que é a LAIFT)');
    expect(out.sources).toEqual([{ source: 'liga', section: 'O que é a LAIFT', url: '/liga.html' }]);
  });

  test('sem página pública, a fonte sai sem a chave url', () => {
    const out = extractiveAnswer({ source: 'saude', section: 'A Lia pode errar em temas clínicos', content: 'x. A Lia pode errar.' });
    expect(out.sources).toEqual([{ source: 'saude', section: 'A Lia pode errar em temas clínicos' }]);
    expect('url' in out.sources[0]).toBe(false);
  });

  test('mensagem de "nada passou do piso" é amigável e lista de 3 a 4 temas, sem "Ainda não sei"', () => {
    expect(NO_MATCH_REPLY).not.toMatch(/Ainda não sei/);
    expect(NO_MATCH_REPLY).toMatch(/processo seletivo/);
    expect(NO_MATCH_SUGGESTIONS.length).toBeGreaterThanOrEqual(3);
    expect(NO_MATCH_SUGGESTIONS.length).toBeLessThanOrEqual(4);
  });
});
