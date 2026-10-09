/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * docsConteudo.test.js — conteúdo factual novo da base da Lia (assistant/docsConteudo.js).
 * Garante: fontes permitidas, títulos únicos, tamanho dos trechos, nada com cara de instrução,
 * nenhum e-mail fora do oficial, nenhuma sequência longa de dígitos e pelo menos 25 trechos novos.
 */
import { CONTENT_DOCS } from '../src/assistant/docsConteudo.js';
import { buildDocuments } from '../src/assistant/docs.js';
import { looksLikeInjection } from '../src/assistant/moderationRules.js';

const SOURCES_PERMITIDAS = ['plataforma', 'modulos', 'publicacoes', 'processo', 'faq', 'saude'];
const EMAIL_OFICIAL = 'laiftligauninassau@gmail.com';
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const DIGITOS_LONGOS_RE = /\d{8,}/g;
// Sequências de 8 ou mais dígitos aprovadas explicitamente (hoje, nenhuma).
const DIGITOS_LISTA_BRANCA = [];
// Repetição de título que já existia antes desta ficha: 'O que a Lia faz' é a seção 'ajuda' de kb.js
// e a seção '## O que a Lia faz' do guia em docs.js. Dívida registrada; remover quando um deles for renomeado.
const TITULOS_REPETIDOS_LEGADOS = ['O que a Lia faz'];
// Corpus antes desta ficha: 35 trechos (kb 23, destinos 1, guia 3, privacidade 2, convivencia 2, liga 4).
const BASELINE_SEM_CONTEUDO = 35;

const trechosNovos = () => buildDocuments().filter((d) => SOURCES_PERMITIDAS.includes(d.source));
const contarSecoes = (markdown) => (markdown.match(/^##\s/gm) || []).length;

describe('docsConteudo — conteúdo factual novo da Lia', () => {
  test('as fontes de CONTENT_DOCS estão na lista permitida, sem repetição', () => {
    const fontes = CONTENT_DOCS.map((d) => d.source);
    expect(fontes.slice().sort()).toEqual(SOURCES_PERMITIDAS.slice().sort());
  });

  test('há entre 25 e 40 seções novas, e cada uma vira um trecho do acervo', () => {
    const secoes = CONTENT_DOCS.reduce((total, d) => total + contarSecoes(d.markdown), 0);
    expect(secoes).toBeGreaterThanOrEqual(25);
    expect(secoes).toBeLessThanOrEqual(40);
    expect(trechosNovos()).toHaveLength(secoes);
  });

  test('buildDocuments() cresce em pelo menos 25 trechos', () => {
    expect(buildDocuments().length - BASELINE_SEM_CONTEUDO).toBeGreaterThanOrEqual(25);
  });

  test('os títulos de seção são únicos em buildDocuments(); a única repetição é a dívida conhecida', () => {
    const titulos = buildDocuments().map((d) => d.section);
    const repetidos = [...new Set(titulos.filter((t, i) => titulos.indexOf(t) !== i))];
    expect(repetidos).toEqual(TITULOS_REPETIDOS_LEGADOS);
  });

  test('cada trecho tem até 1200 caracteres e nenhum passa em looksLikeInjection', () => {
    trechosNovos().forEach((trecho) => {
      expect(trecho.content.length).toBeLessThanOrEqual(1200);
      expect(looksLikeInjection(trecho.content)).toBe(false);
    });
  });

  test('não há e-mail fora do oficial no acervo', () => {
    const emails = buildDocuments().flatMap((d) => d.content.match(EMAIL_RE) || []);
    expect(emails.filter((e) => e !== EMAIL_OFICIAL)).toEqual([]);
  });

  test('não há sequência de 8 ou mais dígitos fora da lista branca do teste', () => {
    const achados = buildDocuments()
      .flatMap((d) => d.content.match(DIGITOS_LONGOS_RE) || [])
      .filter((n) => !DIGITOS_LISTA_BRANCA.includes(n));
    expect(achados).toEqual([]);
  });
});
