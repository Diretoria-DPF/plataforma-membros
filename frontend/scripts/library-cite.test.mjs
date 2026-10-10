/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Testes de frontend/library-cite.js (CONTRATO-B2 §4.2 e §4.3): citação ABNT e Vancouver,
// rótulos de tipo e licença. Casos com texto exato, montado à mão pelas regras do contrato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const require = createRequire(import.meta.url);
const cite = require('../library-cite.js');

const TITLE = 'Efeitos do treinamento';
const JOURNAL = 'Revista Brasileira de Teste';
const ABBR = 'Rev Bras Teste';
const ACCESS = { accessDate: '2026-10-10' };

const SILVA = { family: 'Silva', given: 'Ana Maria' };
const SOUZA = { family: 'Souza', given: 'Carlos' };
const LIMA = { family: 'Lima', given: 'Jean-Paul' };
const COSTA = { family: 'Costa', given: 'Marta' };
const ROCHA = { family: 'Rocha', given: 'Paulo' };
const ALVES = { family: 'Alves', given: 'Rita' };
const DIAS = { family: 'Dias', given: 'Tiago' };
const MOTA = { family: 'Mota', given: 'Lúcia' };

/** Artigo-base: 1 autor, volume, número, páginas, DOI e PMID. Não muta o original. */
function artigo(overrides = {}) {
  return {
    title: TITLE,
    authors: [SILVA],
    authorCount: 1,
    journal: JOURNAL,
    journalAbbrev: ABBR,
    year: 2021,
    volume: '12',
    issue: '3',
    pages: '45-67',
    doi: '10.1000/xyz',
    pmid: '12345',
    ...overrides,
  };
}

function comAutores(list, overrides = {}) {
  return artigo({ authors: list, authorCount: list.length, ...overrides });
}

const ABNT_TAIL = 'Revista Brasileira de Teste, v. 12, n. 3, p. 45-67, 2021. DOI: 10.1000/xyz. '
  + 'Disponível em: https://doi.org/10.1000/xyz. Acesso em: 10 out. 2026.';
const VANC_TAIL = 'Rev Bras Teste. 2021;12(3):45-67. doi: 10.1000/xyz';

test('ABNT: 1 autor, com volume, número, páginas e DOI', () => {
  assert.equal(
    cite.abnt(artigo(), ACCESS),
    `SILVA, A. M. Efeitos do treinamento. ${ABNT_TAIL}`,
  );
});

test('Vancouver: 1 autor, com volume, número, páginas e DOI', () => {
  assert.equal(
    cite.vancouver(artigo()),
    `Silva AM. Efeitos do treinamento. ${VANC_TAIL}`,
  );
});

test('3 autores: ABNT lista todos com ponto e vírgula; hifenizado vira J.-P. e JP', () => {
  const a = comAutores([SILVA, SOUZA, LIMA]);
  assert.equal(
    cite.abnt(a, ACCESS),
    `SILVA, A. M.; SOUZA, C.; LIMA, J.-P. Efeitos do treinamento. ${ABNT_TAIL}`,
  );
  assert.equal(
    cite.vancouver(a),
    `Silva AM, Souza C, Lima JP. Efeitos do treinamento. ${VANC_TAIL}`,
  );
});

test('4 autores: ABNT com et al. e Vancouver com os 4', () => {
  const a = comAutores([SILVA, SOUZA, LIMA, COSTA]);
  assert.equal(
    cite.abnt(a, ACCESS),
    `SILVA, A. M. et al. Efeitos do treinamento. ${ABNT_TAIL}`,
  );
  assert.equal(
    cite.vancouver(a),
    `Silva AM, Souza C, Lima JP, Costa M. Efeitos do treinamento. ${VANC_TAIL}`,
  );
});

test('7 autores: Vancouver com 6 e et al.; ABNT com o primeiro e et al.', () => {
  const a = comAutores([SILVA, SOUZA, LIMA, COSTA, ROCHA, ALVES, DIAS]);
  assert.equal(
    cite.abnt(a, ACCESS),
    `SILVA, A. M. et al. Efeitos do treinamento. ${ABNT_TAIL}`,
  );
  assert.equal(
    cite.vancouver(a),
    `Silva AM, Souza C, Lima JP, Costa M, Rocha P, Alves R, et al. Efeitos do treinamento. ${VANC_TAIL}`,
  );
});

test('8 autores: mesma regra de 7 (exemplo para a Diretoria Científica)', () => {
  const a = comAutores([SILVA, SOUZA, LIMA, COSTA, ROCHA, ALVES, DIAS, MOTA]);
  assert.equal(
    cite.abnt(a, ACCESS),
    `SILVA, A. M. et al. Efeitos do treinamento. ${ABNT_TAIL}`,
  );
  assert.equal(
    cite.vancouver(a),
    `Silva AM, Souza C, Lima JP, Costa M, Rocha P, Alves R, et al. Efeitos do treinamento. ${VANC_TAIL}`,
  );
});

test('autor coletivo (sem prenome) fica todo em maiúsculas no ABNT', () => {
  const a = comAutores([{ family: 'Grupo de Estudo LAIFT' }]);
  assert.equal(
    cite.abnt(a, ACCESS),
    `GRUPO DE ESTUDO LAIFT. Efeitos do treinamento. ${ABNT_TAIL}`,
  );
  assert.equal(
    cite.vancouver(a),
    `Grupo de Estudo LAIFT. Efeitos do treinamento. ${VANC_TAIL}`,
  );
});

test('sem volume: ABNT sem "v." e Vancouver só com o ano', () => {
  const a = artigo({ volume: null, issue: null, pages: null });
  assert.equal(
    cite.abnt(a, ACCESS),
    'SILVA, A. M. Efeitos do treinamento. Revista Brasileira de Teste, 2021. '
    + 'DOI: 10.1000/xyz. Disponível em: https://doi.org/10.1000/xyz. Acesso em: 10 out. 2026.',
  );
  assert.equal(
    cite.vancouver(a),
    'Silva AM. Efeitos do treinamento. Rev Bras Teste. 2021. doi: 10.1000/xyz',
  );
});

test('sem número: Vancouver sem parênteses', () => {
  const a = artigo({ issue: null });
  assert.equal(
    cite.abnt(a, ACCESS),
    'SILVA, A. M. Efeitos do treinamento. Revista Brasileira de Teste, v. 12, p. 45-67, 2021. '
    + 'DOI: 10.1000/xyz. Disponível em: https://doi.org/10.1000/xyz. Acesso em: 10 out. 2026.',
  );
  assert.equal(
    cite.vancouver(a),
    'Silva AM. Efeitos do treinamento. Rev Bras Teste. 2021;12:45-67. doi: 10.1000/xyz',
  );
});

test('sem páginas: Vancouver para no número', () => {
  const a = artigo({ pages: null });
  assert.equal(
    cite.vancouver(a),
    'Silva AM. Efeitos do treinamento. Rev Bras Teste. 2021;12(3). doi: 10.1000/xyz',
  );
});

test('sem ano: ABNT usa [s. d.]; Vancouver usa [s.d.]', () => {
  const a = artigo({ year: null });
  assert.equal(
    cite.abnt(a, ACCESS),
    'SILVA, A. M. Efeitos do treinamento. Revista Brasileira de Teste, v. 12, n. 3, p. 45-67, [s. d.]. '
    + 'DOI: 10.1000/xyz. Disponível em: https://doi.org/10.1000/xyz. Acesso em: 10 out. 2026.',
  );
  assert.equal(
    cite.vancouver(a),
    'Silva AM. Efeitos do treinamento. Rev Bras Teste. [s.d.];12(3):45-67. doi: 10.1000/xyz',
  );
});

test('sem DOI: ABNT aponta o PubMed; Vancouver usa PMID', () => {
  const a = artigo({ doi: null });
  assert.equal(
    cite.abnt(a, ACCESS),
    'SILVA, A. M. Efeitos do treinamento. Revista Brasileira de Teste, v. 12, n. 3, p. 45-67, 2021. '
    + 'Disponível em: https://pubmed.ncbi.nlm.nih.gov/12345/. Acesso em: 10 out. 2026.',
  );
  assert.equal(
    cite.vancouver(a),
    'Silva AM. Efeitos do treinamento. Rev Bras Teste. 2021;12(3):45-67. PMID: 12345.',
  );
});

test('sem DOI nem PMID: sem localizador', () => {
  const a = artigo({ doi: null, pmid: null });
  assert.equal(
    cite.abnt(a, ACCESS),
    'SILVA, A. M. Efeitos do treinamento. Revista Brasileira de Teste, v. 12, n. 3, p. 45-67, 2021. '
    + 'Acesso em: 10 out. 2026.',
  );
  assert.equal(cite.vancouver(a), 'Silva AM. Efeitos do treinamento. Rev Bras Teste. 2021;12(3):45-67.');
});

test('título terminando em ? mantém a pontuação e não ganha ponto', () => {
  const a = artigo({ title: 'Qual o efeito do treinamento?' });
  assert.equal(
    cite.abnt(a, ACCESS),
    'SILVA, A. M. Qual o efeito do treinamento? Revista Brasileira de Teste, v. 12, n. 3, p. 45-67, 2021. '
    + 'DOI: 10.1000/xyz. Disponível em: https://doi.org/10.1000/xyz. Acesso em: 10 out. 2026.',
  );
  assert.equal(
    cite.vancouver(a),
    'Silva AM. Qual o efeito do treinamento? Rev Bras Teste. 2021;12(3):45-67. doi: 10.1000/xyz',
  );
});

test('Vancouver usa o nome da revista quando não há abreviação', () => {
  assert.equal(
    cite.vancouver(artigo({ journalAbbrev: null })),
    'Silva AM. Efeitos do treinamento. Revista Brasileira de Teste. 2021;12(3):45-67. doi: 10.1000/xyz',
  );
});

test('data de acesso: 2026-10-10 vira "10 out. 2026"; maio não tem ponto', () => {
  assert.ok(cite.abnt(artigo(), ACCESS).endsWith('Acesso em: 10 out. 2026.'));
  assert.ok(cite.abnt(artigo(), { accessDate: '2026-05-03' }).endsWith('Acesso em: 3 maio 2026.'));
});

test('sem accessDate o ABNT omite "Acesso em"', () => {
  assert.ok(!cite.abnt(artigo()).includes('Acesso em'));
});

test('entrada inválida devolve string vazia', () => {
  assert.equal(cite.abnt(null, ACCESS), '');
  assert.equal(cite.abnt({ authors: [SILVA] }, ACCESS), '');
  assert.equal(cite.vancouver(undefined), '');
  assert.equal(cite.vancouver(artigo({ title: '   ' })), '');
});

test('LABELS de tipo e licença batem com a tabela do contrato §4.3', () => {
  assert.deepEqual(cite.LABELS.type, {
    artigo: 'Artigo original',
    revisao: 'Revisão',
    revisao_sistematica: 'Revisão sistemática',
    meta_analise: 'Metanálise',
    ensaio_clinico: 'Ensaio clínico',
    relato_caso: 'Relato de caso',
    diretriz: 'Diretriz',
    outro: 'Outro',
  });
  assert.deepEqual(cite.LABELS.license, {
    'cc-by': 'CC BY',
    'cc-by-sa': 'CC BY-SA',
    'cc-by-nd': 'CC BY-ND',
    'cc-by-nc': 'CC BY-NC',
    'cc-by-nc-sa': 'CC BY-NC-SA',
    'cc-by-nc-nd': 'CC BY-NC-ND',
    cc0: 'CC0',
    pd: 'Domínio público',
    outra: 'Licença do editor',
    desconhecida: 'Licença não informada pelo editor',
  });
});

test('typeLabel e licenseLabel devolvem rótulo ou string vazia para chave desconhecida', () => {
  assert.equal(cite.typeLabel('relato_caso'), 'Relato de caso');
  assert.equal(cite.licenseLabel('desconhecida'), 'Licença não informada pelo editor');
  assert.equal(cite.typeLabel('nao_existe'), '');
  assert.equal(cite.typeLabel('constructor'), '');
  assert.equal(cite.licenseLabel(undefined), '');
});

test('arquivo sem DOM: nenhum innerHTML, outerHTML ou insertAdjacentHTML', () => {
  const src = read('library-cite.js');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src));
  assert.ok(src.startsWith('/*\n * Plataforma de Membros LAIFT\n'));
});
