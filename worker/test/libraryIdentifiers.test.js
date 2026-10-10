/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import {
  parseIdentifier,
  doiLandingUrl,
  pubmedLandingUrl,
  pmcUrl,
  isUuid,
  DOI_RE,
  PMID_RE,
  UUID_RE,
} from '../src/library/identifiers.js';

const MSG = 'Informe um DOI (ex.: 10.1000/xyz) ou um PMID (só números).';

describe('parseIdentifier aceita', () => {
  test('DOI cru', () => {
    // Arrange
    const text = '10.1371/journal.pone.0000308';
    // Act
    const out = parseIdentifier(text);
    // Assert
    expect(out).toEqual({ kind: 'doi', value: '10.1371/journal.pone.0000308' });
  });

  test('prefixo doi: com espaços e caixa alta vira DOI minúsculo', () => {
    expect(parseIdentifier(' DOI:10.1038/Nature12373 ')).toEqual({
      kind: 'doi',
      value: '10.1038/nature12373',
    });
  });

  test('link https://doi.org com parênteses', () => {
    expect(parseIdentifier('https://doi.org/10.1000/a(b)c')).toEqual({
      kind: 'doi',
      value: '10.1000/a(b)c',
    });
  });

  test('link dx.doi.org decodifica %2F uma vez', () => {
    expect(parseIdentifier('https://dx.doi.org/10.1000%2Fxyz')).toEqual({
      kind: 'doi',
      value: '10.1000/xyz',
    });
  });

  test('PMID cru', () => {
    expect(parseIdentifier('12345678')).toEqual({ kind: 'pmid', value: '12345678' });
  });

  test('link do PubMed', () => {
    expect(parseIdentifier('https://pubmed.ncbi.nlm.nih.gov/12345678/')).toEqual({
      kind: 'pmid',
      value: '12345678',
    });
  });

  test('links do Europe PMC (article e abstract)', () => {
    expect(parseIdentifier('https://europepmc.org/article/MED/12345678')).toEqual({
      kind: 'pmid',
      value: '12345678',
    });
    expect(parseIdentifier('https://europepmc.org/abstract/MED/12345678')).toEqual({
      kind: 'pmid',
      value: '12345678',
    });
  });
});

describe('parseIdentifier recusa', () => {
  const rejects = (input) => {
    expect(() => parseIdentifier(input)).toThrow(MSG);
    try {
      parseIdentifier(input);
    } catch (err) {
      expect(err.name).toBe('ValidationError');
      expect(err.expected).toBe(true);
    }
  };

  test('vazio, não-string e só espaços', () => {
    rejects('');
    rejects('   ');
    rejects(null);
    rejects(undefined);
    rejects(12345678);
    rejects({ doi: '10.1000/x' });
  });

  test('texto com mais de 300 caracteres', () => {
    rejects('10.1000/' + 'a'.repeat(300));
  });

  test('http em vez de https', () => {
    rejects('http://doi.org/10.1000/x');
  });

  test('host que só começa com doi.org', () => {
    rejects('https://doi.org.evil.com/10.1/x');
  });

  test('host estranho com DOI na query', () => {
    rejects('https://evil.com/?u=https://doi.org/10.1000/x');
  });

  test('esquema javascript:', () => {
    rejects('javascript:alert(1)');
  });

  test('PMID com zero à esquerda', () => {
    rejects('0123');
  });

  test('prefixo de DOI curto demais', () => {
    rejects('10.12/x');
  });

  test('DOI com < ou espaço no meio', () => {
    rejects('10.1000/a<b');
    rejects('10.1000/a b');
  });

  test('DOI com mais de 200 caracteres', () => {
    rejects('10.1000/' + 'a'.repeat(200));
  });

  test('link da SciELO', () => {
    rejects('https://www.scielo.br/j/rbc/a/abc123/');
  });
});

describe('expressões regulares', () => {
  test('DOI_RE e PMID_RE', () => {
    expect(DOI_RE.test('10.1000/xyz')).toBe(true);
    expect(DOI_RE.test('10.12/x')).toBe(false);
    expect(PMID_RE.test('12345678')).toBe(true);
    expect(PMID_RE.test('0123')).toBe(false);
    expect(PMID_RE.test('12345678901')).toBe(false);
  });

  test('UUID_RE e isUuid', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(UUID_RE.test(id)).toBe(true);
    expect(isUuid(id)).toBe(true);
    expect(isUuid('nao-e-uuid')).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

describe('montadores de link', () => {
  test('doiLandingUrl codifica cada segmento', () => {
    expect(doiLandingUrl('10.1000/xyz')).toBe('https://doi.org/10.1000/xyz');
    expect(doiLandingUrl('10.1000/a:b')).toBe('https://doi.org/10.1000/a%3Ab');
  });

  test('doiLandingUrl retorna null para DOI inválido', () => {
    expect(doiLandingUrl('10.1000/a?b')).toBeNull();
    expect(doiLandingUrl(null)).toBeNull();
  });

  test('pubmedLandingUrl', () => {
    expect(pubmedLandingUrl('12345678')).toBe('https://pubmed.ncbi.nlm.nih.gov/12345678/');
  });

  test('pmcUrl só aceita PMC seguido de dígitos', () => {
    expect(pmcUrl('PMC1234567')).toBe('https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/');
    expect(pmcUrl('pmc1234')).toBeNull();
    expect(pmcUrl('PMC')).toBeNull();
    expect(pmcUrl(null)).toBeNull();
  });
});
