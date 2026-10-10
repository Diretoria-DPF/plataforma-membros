/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import {
  stripMarkup,
  searchNorm,
  normalizeLicense,
  mostRestrictive,
  normalizeOaStatus,
  normalizeType,
  normalizeAuthors,
  normalizeYear,
  normalizeLanguage,
  clip,
} from '../src/library/normalize.js';

const NOW = Date.parse('2026-10-10T00:00:00Z');
const PAST = { 'date-parts': [[2020, 1, 1]], 'date-time': '2020-01-01T00:00:00Z', timestamp: Date.parse('2020-01-01T00:00:00Z') };
const FUTURE = { 'date-parts': [[2030, 1, 1]], 'date-time': '2030-01-01T00:00:00Z', timestamp: Date.parse('2030-01-01T00:00:00Z') };
const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';

describe('stripMarkup', () => {
  test('remove tags JATS e mantém o texto', () => {
    expect(stripMarkup('<jats:p>Olá <jats:italic>mundo</jats:italic></jats:p>')).toBe('Olá mundo');
  });

  test('script vira só o texto de dentro, sem a tag', () => {
    expect(stripMarkup('antes <script>alert(1)</script> depois')).toBe('antes alert(1) depois');
  });

  test('decodifica as entidades XML e as numéricas', () => {
    expect(stripMarkup('A &amp; B &lt;x&gt; &quot;q&quot; &apos;a&apos; &#65;&#x42;')).toBe('A & B <x> "q" \'a\' AB');
  });

  test('decodifica uma só vez (&amp;lt; vira &lt;, não <)', () => {
    expect(stripMarkup('&amp;lt;')).toBe('&lt;');
  });

  test('tira caracteres de controle e colapsa espaços e quebras', () => {
    expect(stripMarkup('a\u0000b\tc\n\n  d')).toBe('ab c d');
  });

  test('entidade numérica inválida ou controle codificado some', () => {
    expect(stripMarkup('x&#0;y&#x110000;z')).toBe('xyz');
  });

  test('não-string devolve null', () => {
    expect(stripMarkup(null)).toBeNull();
    expect(stripMarkup(42)).toBeNull();
    expect(stripMarkup(undefined)).toBeNull();
  });
});

describe('searchNorm', () => {
  test('remove acentos, põe em minúsculas e junta os campos', () => {
    const text = searchNorm({
      title: 'Farmacocinética da Varfarina',
      authors: [{ family: 'Müller', given: 'A' }],
      journal: 'J. Clin. Pharm.',
      doi: '10.1000/XYZ',
      pmid: '123',
    });
    expect(text).toContain('farmacocinetica da varfarina');
    expect(text).toContain('muller');
    expect(text).toContain('10.1000/xyz');
    expect(text).toContain('123');
  });

  test('troca o que não é a-z, 0-9, ponto, barra ou hífen por espaço', () => {
    expect(searchNorm({ title: 'Ação: H2O (teste)!' })).toBe('acao h2o teste');
  });

  test('corta em 4000 caracteres', () => {
    expect(searchNorm({ title: 'a '.repeat(3000) }).length).toBeLessThanOrEqual(4000);
  });

  test('registro vazio devolve string vazia', () => {
    expect(searchNorm({})).toBe('');
  });
});

describe('normalizeLicense', () => {
  test('crossref: URL CC by com vor e início passado vira cc-by', () => {
    expect(normalizeLicense('crossref', [{ URL: CC_BY, 'content-version': 'vor', start: PAST }], NOW)).toBe('cc-by');
  });

  test('crossref: by-nc-sa vira cc-by-nc-sa', () => {
    const url = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
    expect(normalizeLicense('crossref', [{ URL: url, 'content-version': 'vor' }], NOW)).toBe('cc-by-nc-sa');
  });

  test('crossref: publicdomain/zero vira cc0 e publicdomain/mark vira pd', () => {
    const zero = 'https://creativecommons.org/publicdomain/zero/1.0/';
    const mark = 'https://creativecommons.org/publicdomain/mark/1.0/';
    expect(normalizeLicense('crossref', [{ URL: zero, 'content-version': 'unspecified' }], NOW)).toBe('cc0');
    expect(normalizeLicense('crossref', [{ URL: mark, 'content-version': 'vor' }], NOW)).toBe('pd');
  });

  test('crossref: URL que não é CC vira outra', () => {
    expect(normalizeLicense('crossref', [{ URL: 'https://publisher.example/terms', 'content-version': 'vor' }], NOW)).toBe('outra');
  });

  test('crossref: só tdm não conta e vira desconhecida', () => {
    expect(normalizeLicense('crossref', [{ URL: CC_BY, 'content-version': 'tdm', start: PAST }], NOW)).toBe('desconhecida');
  });

  test('crossref: licença com início no futuro não conta', () => {
    expect(normalizeLicense('crossref', [{ URL: CC_BY, 'content-version': 'vor', start: FUTURE }], NOW)).toBe('desconhecida');
  });

  test('crossref: ausente ou sem lista vira desconhecida', () => {
    expect(normalizeLicense('crossref', [], NOW)).toBe('desconhecida');
    expect(normalizeLicense('crossref', undefined, NOW)).toBe('desconhecida');
  });

  test('crossref: várias licenças válidas devolvem a mais restritiva', () => {
    const byNc = 'https://creativecommons.org/licenses/by-nc/4.0/';
    const list = [
      { URL: CC_BY, 'content-version': 'vor' },
      { URL: byNc, 'content-version': 'vor' },
    ];
    expect(normalizeLicense('crossref', list, NOW)).toBe('cc-by-nc');
  });

  test('europepmc: "cc by" vira cc-by, "cc by-nc" vira cc-by-nc e "cc0" vira cc0', () => {
    expect(normalizeLicense('europepmc', 'cc by')).toBe('cc-by');
    expect(normalizeLicense('europepmc', 'cc by-nc')).toBe('cc-by-nc');
    expect(normalizeLicense('europepmc', 'cc0')).toBe('cc0');
  });

  test('europepmc: ausente vira desconhecida', () => {
    expect(normalizeLicense('europepmc', undefined)).toBe('desconhecida');
    expect(normalizeLicense('europepmc', '')).toBe('desconhecida');
  });

  test('openalex e unpaywall: cc-by, public-domain e publisher-specific-oa', () => {
    expect(normalizeLicense('openalex', 'cc-by')).toBe('cc-by');
    expect(normalizeLicense('unpaywall', 'cc-by-sa')).toBe('cc-by-sa');
    expect(normalizeLicense('openalex', 'public-domain')).toBe('pd');
    expect(normalizeLicense('unpaywall', 'publisher-specific-oa')).toBe('outra');
  });

  test('openalex: cc0 (valor fora do contrato, a verificar) vira cc0', () => {
    expect(normalizeLicense('openalex', 'cc0')).toBe('cc0');
  });

  test('openalex e unpaywall: null vira desconhecida', () => {
    expect(normalizeLicense('openalex', null)).toBe('desconhecida');
    expect(normalizeLicense('unpaywall', null)).toBe('desconhecida');
  });

  test('fonte desconhecida lança TypeError', () => {
    expect(() => normalizeLicense('scielo', 'cc-by')).toThrow(TypeError);
  });
});

describe('mostRestrictive', () => {
  test('ignora desconhecida quando há outra licença', () => {
    expect(mostRestrictive(['desconhecida', 'cc-by'])).toEqual({ license: 'cc-by', conflict: false });
  });

  test('fontes discordam: devolve a mais restritiva e marca conflito', () => {
    expect(mostRestrictive(['cc-by', 'cc-by-nc'])).toEqual({ license: 'cc-by-nc', conflict: true });
    expect(mostRestrictive(['cc0', 'pd'])).toEqual({ license: 'pd', conflict: true });
  });

  test('outra é mais restritiva que qualquer CC', () => {
    expect(mostRestrictive(['outra', 'cc-by-nc-nd'])).toEqual({ license: 'outra', conflict: true });
  });

  test('mesma licença repetida não é conflito', () => {
    expect(mostRestrictive(['cc-by', 'cc-by'])).toEqual({ license: 'cc-by', conflict: false });
  });

  test('só desconhecida ou lista vazia devolve desconhecida sem conflito', () => {
    expect(mostRestrictive(['desconhecida'])).toEqual({ license: 'desconhecida', conflict: false });
    expect(mostRestrictive([])).toEqual({ license: 'desconhecida', conflict: false });
  });
});

describe('normalizeOaStatus', () => {
  test('aceita os seis valores do contrato, sem diferença de caixa', () => {
    expect(normalizeOaStatus('Gold')).toBe('gold');
    expect(normalizeOaStatus('diamond')).toBe('diamond');
    expect(normalizeOaStatus('closed')).toBe('closed');
  });

  test('valor estranho ou ausente vira desconhecido', () => {
    expect(normalizeOaStatus('xyz')).toBe('desconhecido');
    expect(normalizeOaStatus(null)).toBe('desconhecido');
  });
});

describe('normalizeType', () => {
  test('Europe PMC segue a ordem da tabela, não a ordem da lista', () => {
    expect(normalizeType({ europepmcPubTypes: ['Journal Article', 'Systematic Review'] })).toBe('revisao_sistematica');
    expect(normalizeType({ europepmcPubTypes: ['Journal Article', 'Meta-Analysis'] })).toBe('meta_analise');
    expect(normalizeType({ europepmcPubTypes: ['Journal Article', 'Review'] })).toBe('revisao');
  });

  test('ensaio clínico, relato, diretriz e artigo pelo Europe PMC', () => {
    expect(normalizeType({ europepmcPubTypes: ['Randomized Controlled Trial'] })).toBe('ensaio_clinico');
    expect(normalizeType({ europepmcPubTypes: ['Clinical Trial, Phase III'] })).toBe('ensaio_clinico');
    expect(normalizeType({ europepmcPubTypes: ['Case Reports'] })).toBe('relato_caso');
    expect(normalizeType({ europepmcPubTypes: ['Practice Guideline'] })).toBe('diretriz');
    expect(normalizeType({ europepmcPubTypes: ['Journal Article'] })).toBe('artigo');
  });

  test('Journal Article do Europe PMC vence o type do OpenAlex', () => {
    expect(normalizeType({ europepmcPubTypes: ['Journal Article'], openalexType: 'review' })).toBe('artigo');
  });

  test('sem Europe PMC usa o type do OpenAlex e depois o do Crossref', () => {
    expect(normalizeType({ openalexType: 'review' })).toBe('revisao');
    expect(normalizeType({ openalexType: 'article' })).toBe('artigo');
    expect(normalizeType({ openalexType: 'book-chapter', crossrefType: 'journal-article' })).toBe('artigo');
  });

  test('sem nenhuma pista devolve outro', () => {
    expect(normalizeType({})).toBe('outro');
    expect(normalizeType({ openalexType: 'book-chapter', crossrefType: 'book' })).toBe('outro');
  });

  test('aceita pubType como string única', () => {
    expect(normalizeType({ europepmcPubTypes: 'Review' })).toBe('revisao');
  });
});

describe('normalizeAuthors', () => {
  test('crossref: family/given e grupo com name', () => {
    const result = normalizeAuthors('crossref', [{ family: 'Silva', given: 'Ana' }, { name: 'Consórcio X' }]);
    expect(result).toEqual({
      authors: [{ family: 'Silva', given: 'Ana' }, { family: 'Consórcio X', given: '' }],
      authorCount: 2,
    });
  });

  test('crossref: entrada sem family nem name não conta', () => {
    const result = normalizeAuthors('crossref', [{ given: 'Sem sobrenome' }, { family: 'Y' }]);
    expect(result.authorCount).toBe(1);
    expect(result.authors).toEqual([{ family: 'Y', given: '' }]);
  });

  test('europepmc: lastName/firstName e collectiveName', () => {
    const result = normalizeAuthors('europepmc', [{ lastName: 'Costa', firstName: 'João' }, { collectiveName: 'Grupo Y' }]);
    expect(result.authors).toEqual([{ family: 'Costa', given: 'João' }, { family: 'Grupo Y', given: '' }]);
  });

  test('openalex: o sobrenome é a última palavra do display_name', () => {
    const result = normalizeAuthors('openalex', [{ author: { display_name: 'Maria da Silva Costa' } }]);
    expect(result.authors).toEqual([{ family: 'Costa', given: 'Maria da Silva' }]);
  });

  test('openalex: nome de uma palavra vira sobrenome sem nome', () => {
    const result = normalizeAuthors('openalex', [{ author: { display_name: 'Hipócrates' } }]);
    expect(result.authors).toEqual([{ family: 'Hipócrates', given: '' }]);
  });

  test('corta em 30 e authorCount é a contagem real', () => {
    const raw = Array.from({ length: 35 }, (_, i) => ({ family: `Autor${i}`, given: 'X' }));
    const result = normalizeAuthors('crossref', raw);
    expect(result.authors).toHaveLength(30);
    expect(result.authorCount).toBe(35);
  });

  test('textos passam por stripMarkup e são limitados a 150 caracteres', () => {
    const tagged = normalizeAuthors('crossref', [{ family: '<jats:italic>X</jats:italic>', given: 'a'.repeat(200) }]);
    expect(tagged.authors[0].family).toBe('X');
    expect(tagged.authors[0].given).toHaveLength(150);
  });

  test('raw que não é lista devolve vazio', () => {
    expect(normalizeAuthors('europepmc', undefined)).toEqual({ authors: [], authorCount: 0 });
  });

  test('fonte desconhecida lança TypeError, mesmo com nome de propriedade do Object', () => {
    expect(() => normalizeAuthors('constructor', [])).toThrow(TypeError);
    expect(() => normalizeAuthors('scielo', [])).toThrow(TypeError);
  });
});

describe('normalizeYear', () => {
  test('aceita número e texto que começa com ano', () => {
    expect(normalizeYear(2020)).toBe(2020);
    expect(normalizeYear('2019')).toBe(2019);
    expect(normalizeYear('2019-05')).toBe(2019);
  });

  test('fora de 1800-2100, não inteiro ou inválido vira null', () => {
    expect(normalizeYear(1799)).toBeNull();
    expect(normalizeYear(2101)).toBeNull();
    expect(normalizeYear(2020.5)).toBeNull();
    expect(normalizeYear('abc')).toBeNull();
    expect(normalizeYear(null)).toBeNull();
  });
});

describe('normalizeLanguage', () => {
  test('códigos de duas letras e variantes regionais', () => {
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('pt')).toBe('pt');
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('PT-br')).toBe('pt');
  });

  test('ISO 639-2 de três letras vira duas letras', () => {
    expect(normalizeLanguage('eng')).toBe('en');
    expect(normalizeLanguage('por')).toBe('pt');
  });

  test('inválido, vazio ou não-string vira null', () => {
    expect(normalizeLanguage('x')).toBeNull();
    expect(normalizeLanguage('e1')).toBeNull();
    expect(normalizeLanguage('xyz')).toBeNull();
    expect(normalizeLanguage('constructor')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
    expect(normalizeLanguage(7)).toBeNull();
  });
});

describe('clip', () => {
  test('corta no máximo e preserva o que cabe', () => {
    expect(clip('abcdef', 3)).toBe('abc');
    expect(clip('ab', 3)).toBe('ab');
  });

  test('não-string devolve null', () => {
    expect(clip(null, 3)).toBeNull();
    expect(clip(5, 3)).toBeNull();
  });
});
