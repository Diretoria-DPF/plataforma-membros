/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import {
  STATUSES, TRANSITIONS, allowedTransitions, assertTransition,
  CLINICAL_TERMS, hasClinicalTerms, assertClinicalReviewer,
} from '../src/library/transitions.js';
import {
  LIBRARY_RATE_LIMITS, LIBRARY_LIMITS, OPEN_REUSE_LICENSES, LIBRARY_FLAGS,
} from '../src/library/limits.js';

const NOT_ALLOWED = 'Mudança de estado não permitida.';
const REASON_MSG = 'Informe o motivo (3 a 300 caracteres).';
const AREA_MSG = 'Escolha ao menos uma área antes de aprovar.';
const CLINICAL_MSG = 'Falta a revisão clínica do resumo.';
const AI_MSG = 'O resumo gerado por IA precisa ser aprovado.';
const FORBIDDEN_REVIEWER_MSG = 'A revisão clínica precisa ser de outra pessoa.';
const REASON = 'Motivo válido';

// Artigo que satisfaz todas as pré-condições (sem resumo, não clínico).
const READY = Object.freeze({
  status: 'em_triagem',
  title: 'Título de teste',
  articleType: 'artigo',
  topics: Object.freeze(['farmacologia-clinica']),
  isClinical: false,
  summaryText: null,
  summaryOrigin: null,
  summaryUpdatedAt: null,
  summaryUpdatedBy: null,
  summaryReviewedAt: null,
  summaryReviewerName: null,
  clinicalReviewedAt: null,
  clinicalReviewerName: null,
});

const withFields = (fields) => Object.freeze({ ...READY, ...fields });

// Pares (de, para) que o curador pode executar (tabela de contrato §2, sem o cadastro).
const CURATOR_PAIRS = Object.freeze([
  ['em_triagem', 'aprovado'],
  ['em_triagem', 'rejeitado'],
  ['aprovado', 'publicado'],
  ['aprovado', 'rejeitado'],
  ['aprovado', 'em_triagem'],
  ['publicado', 'removido'],
  ['rejeitado', 'em_triagem'],
  ['removido', 'em_triagem'],
]);

const errorOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
};

describe('estados e tabela de transições', () => {
  test('lista os cinco estados do artigo', () => {
    expect(STATUSES).toEqual(['em_triagem', 'aprovado', 'publicado', 'rejeitado', 'removido']);
  });

  test('tabela tem as 8 transições do curador e a automática do serviço', () => {
    expect(TRANSITIONS).toHaveLength(9);
    const curator = TRANSITIONS.filter((t) => t.role === 'curador');
    expect(curator.map((t) => [t.from, t.to])).toEqual(CURATOR_PAIRS);
    expect(TRANSITIONS).toContainEqual({ from: 'publicado', to: 'aprovado', role: 'servico' });
  });

  test('o cadastro (novo) -> em_triagem não está na tabela', () => {
    expect(TRANSITIONS.some((t) => t.from === null || t.from === 'novo')).toBe(false);
    expect(TRANSITIONS.some((t) => t.to === 'em_triagem' && t.from === 'novo')).toBe(false);
  });
});

describe('matriz completa de transições (curador)', () => {
  for (const de of STATUSES) {
    for (const para of STATUSES) {
      const expected = CURATOR_PAIRS.some(([f, t]) => f === de && t === para);
      test(`${de} -> ${para} é ${expected ? 'permitida' : 'proibida'} para o curador`, () => {
        const article = withFields({ status: de });
        const err = errorOf(() => assertTransition(article, para, ['curador'], REASON));
        if (expected) {
          expect(err).toBeNull();
        } else {
          expect(err).not.toBeNull();
          expect(err.message).toBe(NOT_ALLOWED);
          expect(err.name).toBe('ValidationError');
        }
      });
    }
  }
});

describe('papéis', () => {
  test('revisor clínico não faz nenhuma transição de estado', () => {
    for (const [de, para] of CURATOR_PAIRS) {
      const article = withFields({ status: de, summaryText: null });
      expect(errorOf(() => assertTransition(article, para, ['revisor_clinico'], REASON))?.message)
        .toBe(NOT_ALLOWED);
    }
    expect(allowedTransitions(withFields({ status: 'aprovado' }), ['revisor_clinico'])).toEqual([]);
  });

  test('a transição automática publicado -> aprovado só vale para o serviço', () => {
    const article = withFields({ status: 'publicado', summaryText: 'Resumo.', summaryUpdatedAt: '2026-10-01T00:00:00Z' });
    expect(errorOf(() => assertTransition(article, 'aprovado', ['servico'], undefined))).toBeNull();
    expect(errorOf(() => assertTransition(article, 'aprovado', ['curador'], undefined))?.message)
      .toBe(NOT_ALLOWED);
  });
});

describe('allowedTransitions', () => {
  test('em triagem com área e título: aprovar e rejeitar', () => {
    expect(allowedTransitions(withFields({ status: 'em_triagem' }), ['curador']))
      .toEqual(['aprovado', 'rejeitado']);
  });

  test('sem área, aprovar não aparece', () => {
    expect(allowedTransitions(withFields({ status: 'em_triagem', topics: [] }), ['curador']))
      .toEqual(['rejeitado']);
  });

  test('aprovado clínico sem revisão: publicar não aparece', () => {
    const article = withFields({
      status: 'aprovado', isClinical: true, summaryText: 'Resumo.', summaryUpdatedAt: '2026-10-01T00:00:00Z',
    });
    expect(allowedTransitions(article, ['curador'])).toEqual(['rejeitado', 'em_triagem']);
  });

  test('publicado: só remover para o curador; aprovado para o serviço', () => {
    const article = withFields({ status: 'publicado' });
    expect(allowedTransitions(article, ['curador'])).toEqual(['removido']);
    expect(allowedTransitions(article, ['servico'])).toEqual(['aprovado']);
  });

  test('sem papel nenhum, nada', () => {
    expect(allowedTransitions(withFields({ status: 'em_triagem' }), [])).toEqual([]);
  });
});

describe('pré-condições de assertTransition', () => {
  test('aprovar sem área recusa com a mensagem da ficha', () => {
    const err = errorOf(() => assertTransition(withFields({ topics: [] }), 'aprovado', ['curador'], undefined));
    expect(err?.message).toBe(AREA_MSG);
  });

  test('aprovar sem título ou tipo recusa', () => {
    const semTitulo = errorOf(() => assertTransition(withFields({ title: '' }), 'aprovado', ['curador'], undefined));
    const semTipo = errorOf(() => assertTransition(withFields({ articleType: '' }), 'aprovado', ['curador'], undefined));
    expect(semTitulo?.name).toBe('ValidationError');
    expect(semTipo?.name).toBe('ValidationError');
  });

  test('publicar resumo clínico sem revisão recusa', () => {
    const article = withFields({
      status: 'aprovado', isClinical: true, summaryText: 'Resumo.', summaryUpdatedAt: '2026-10-02T00:00:00Z',
    });
    expect(errorOf(() => assertTransition(article, 'publicado', ['curador'], undefined))?.message)
      .toBe(CLINICAL_MSG);
  });

  test('revisão clínica anterior à última mudança do resumo não vale', () => {
    const article = withFields({
      status: 'aprovado',
      isClinical: true,
      summaryText: 'Resumo.',
      summaryUpdatedAt: '2026-10-02T00:00:00Z',
      clinicalReviewedAt: '2026-10-01T00:00:00Z',
      clinicalReviewerName: 'Dra. Revisora',
    });
    expect(errorOf(() => assertTransition(article, 'publicado', ['curador'], undefined))?.message)
      .toBe(CLINICAL_MSG);
  });

  test('revisão clínica sem nome do revisor não vale', () => {
    const article = withFields({
      status: 'aprovado',
      isClinical: true,
      summaryText: 'Resumo.',
      summaryUpdatedAt: '2026-10-01T00:00:00Z',
      clinicalReviewedAt: '2026-10-02T00:00:00Z',
      clinicalReviewerName: null,
    });
    expect(errorOf(() => assertTransition(article, 'publicado', ['curador'], undefined))?.message)
      .toBe(CLINICAL_MSG);
  });

  test('revisão clínica feita depois da última mudança libera a publicação', () => {
    const article = withFields({
      status: 'aprovado',
      isClinical: true,
      summaryText: 'Resumo.',
      summaryUpdatedAt: '2026-10-01T00:00:00Z',
      clinicalReviewedAt: '2026-10-02T00:00:00Z',
      clinicalReviewerName: 'Dra. Revisora',
    });
    expect(errorOf(() => assertTransition(article, 'publicado', ['curador'], undefined))).toBeNull();
  });

  test('resumo de IA sem revisão do curador recusa a publicação', () => {
    const article = withFields({
      status: 'aprovado',
      summaryText: 'Resumo gerado.',
      summaryOrigin: 'ia',
      summaryUpdatedAt: '2026-10-01T00:00:00Z',
    });
    expect(errorOf(() => assertTransition(article, 'publicado', ['curador'], undefined))?.message)
      .toBe(AI_MSG);
  });

  test('resumo de IA editado e aprovado depois libera a publicação', () => {
    const article = withFields({
      status: 'aprovado',
      summaryText: 'Resumo editado.',
      summaryOrigin: 'ia_editado',
      summaryUpdatedAt: '2026-10-01T00:00:00Z',
      summaryReviewedAt: '2026-10-02T00:00:00Z',
      summaryReviewerName: 'Curador',
    });
    expect(errorOf(() => assertTransition(article, 'publicado', ['curador'], undefined))).toBeNull();
  });

  test('resumo do curador não exige revisão da IA', () => {
    const article = withFields({
      status: 'aprovado', summaryText: 'Resumo.', summaryOrigin: 'curador', summaryUpdatedAt: '2026-10-01T00:00:00Z',
    });
    expect(errorOf(() => assertTransition(article, 'publicado', ['curador'], undefined))).toBeNull();
  });

  test.each([
    ['vazio', ''],
    ['curto', 'ab'],
    ['só espaços', '     '],
    ['longo', 'a'.repeat(301)],
    ['não é texto', undefined],
  ])('rejeitar com motivo %s recusa', (_nome, motivo) => {
    const err = errorOf(() => assertTransition(withFields({ status: 'em_triagem' }), 'rejeitado', ['curador'], motivo));
    expect(err?.message).toBe(REASON_MSG);
  });

  test('motivo de 3 e de 300 caracteres é aceito', () => {
    const tres = withFields({ status: 'em_triagem' });
    expect(errorOf(() => assertTransition(tres, 'rejeitado', ['curador'], 'abc'))).toBeNull();
    expect(errorOf(() => assertTransition(tres, 'rejeitado', ['curador'], 'a'.repeat(300)))).toBeNull();
  });

  test('remover publicado exige motivo', () => {
    const article = withFields({ status: 'publicado' });
    expect(errorOf(() => assertTransition(article, 'removido', ['curador'], ''))?.message).toBe(REASON_MSG);
    expect(errorOf(() => assertTransition(article, 'removido', ['curador'], REASON))).toBeNull();
  });

  test('voltar para em triagem não pede motivo nem área', () => {
    const article = withFields({ status: 'aprovado', topics: [] });
    expect(errorOf(() => assertTransition(article, 'em_triagem', ['curador'], undefined))).toBeNull();
  });
});

describe('termos clínicos', () => {
  test('lista de termos contém os do contrato', () => {
    expect(CLINICAL_TERMS.length).toBeGreaterThanOrEqual(10);
  });

  test.each([
    ['Dose', true],
    ['A dose recomendada é alta', true],
    ['interação', true],
    ['interacao', true],
    ['interações', true],
    ['contraindicado', true],
    ['deve-se', true],
    ['DEVE-SE', true],
    ['administrar com cautela', true],
    ['10 mg por dia', true],
    ['Este artigo trata de educação continuada e pesquisa.', false],
    ['amgdala e doseamento', false],
    ['', false],
  ])('hasClinicalTerms(%j) = %s', (texto, esperado) => {
    expect(hasClinicalTerms(texto)).toBe(esperado);
  });
});

describe('assertClinicalReviewer', () => {
  test('revisor que escreveu o resumo é recusado', () => {
    const article = withFields({ summaryUpdatedBy: 'perfil-1' });
    const err = errorOf(() => assertClinicalReviewer(article, { profileId: 'perfil-1' }));
    expect(err?.message).toBe(FORBIDDEN_REVIEWER_MSG);
    expect(err?.name).toBe('ForbiddenError');
  });

  test('outro revisor passa', () => {
    const article = withFields({ summaryUpdatedBy: 'perfil-1' });
    expect(errorOf(() => assertClinicalReviewer(article, { profileId: 'perfil-2' }))).toBeNull();
  });

  test('sem identidade não compara com nulo', () => {
    const article = withFields({ summaryUpdatedBy: null });
    expect(errorOf(() => assertClinicalReviewer(article, { profileId: undefined }))).toBeNull();
  });
});

describe('limites (valores do contrato §4.3)', () => {
  test('limites de taxa no formato { MAX_ATTEMPTS, WINDOW_SECONDS }', () => {
    expect(LIBRARY_RATE_LIMITS).toEqual({
      LIBRARY_PUBLIC_IP: { MAX_ATTEMPTS: 30, WINDOW_SECONDS: 3600 },
      LIBRARY_PUBLIC_GLOBAL: { MAX_ATTEMPTS: 300, WINDOW_SECONDS: 3600 },
      LIBRARY_SEARCH: { MAX_ATTEMPTS: 300, WINDOW_SECONDS: 3600 },
      LIBRARY_READ: { MAX_ATTEMPTS: 600, WINDOW_SECONDS: 3600 },
      LIBRARY_FAVORITE: { MAX_ATTEMPTS: 120, WINDOW_SECONDS: 3600 },
      LIBRARY_SUGGEST: { MAX_ATTEMPTS: 5, WINDOW_SECONDS: 3600 },
      LIBRARY_SUGGEST_DAY: { MAX_ATTEMPTS: 15, WINDOW_SECONDS: 86400 },
      LIBRARY_IMPORT: { MAX_ATTEMPTS: 60, WINDOW_SECONDS: 3600 },
      LIBRARY_IMPORT_GLOBAL: { MAX_ATTEMPTS: 200, WINDOW_SECONDS: 3600 },
      LIBRARY_CURATE: { MAX_ATTEMPTS: 300, WINDOW_SECONDS: 3600 },
    });
  });

  test('limites de tamanho e tempo', () => {
    expect(LIBRARY_LIMITS).toEqual({
      FAVORITES_MAX: 500,
      SUGGESTIONS_PENDING_MAX: 200,
      SUGGESTIONS_PENDING_PER_MEMBER: 10,
      NOTE_MAX: 300,
      REASON_MIN: 3,
      REASON_MAX: 300,
      SUMMARY_MAX: 1200,
      QUERY_MAX: 120,
      QUERY_TERMS_MAX: 5,
      PAGE_SIZE_MAX: 50,
      PUBLIC_MAX_ITEMS: 2000,
      COLLECTION_ITEMS_MAX: 200,
      UPSTREAM_TIMEOUT_MS: 8000,
      IMPORT_BUDGET_MS: 20000,
      UPSTREAM_MAX_BYTES: 1048576,
      AUTHORS_STORED_MAX: 30,
    });
  });

  test('licenças de reuso aberto e flags', () => {
    expect(OPEN_REUSE_LICENSES).toEqual(['cc0', 'pd', 'cc-by', 'cc-by-sa']);
    expect(Object.values(LIBRARY_FLAGS).sort()).toEqual([
      'lia_library_enabled', 'library_ai_summary', 'library_enabled', 'library_member_suggest',
    ]);
  });

  test('constantes estão congeladas', () => {
    expect(Object.isFrozen(LIBRARY_RATE_LIMITS)).toBe(true);
    expect(Object.isFrozen(LIBRARY_RATE_LIMITS.LIBRARY_SEARCH)).toBe(true);
    expect(Object.isFrozen(LIBRARY_LIMITS)).toBe(true);
    expect(Object.isFrozen(OPEN_REUSE_LICENSES)).toBe(true);
    expect(Object.isFrozen(LIBRARY_FLAGS)).toBe(true);
  });
});
