/**
 * @file contracts.js
 * @description Contrato canônico e normalizador de dados do Atlas Anatômico 3D LAIFT.
 * Define a estrutura universal StructureEntry, esquemas de validação e precedência de conteúdo.
 */

/**
 * Estados permitidos de revisão acadêmica conforme docs/ATLAS_CONTENT_POLICY.md
 * @readonly
 * @enum {string}
 */
export const ReviewStatus = Object.freeze({
  AUTO_DRAFT: 'auto-draft',
  LEGACY_UNVERIFIED: 'legacy-unverified',
  REVIEWED: 'reviewed',
  APPROVED: 'approved'
});

/**
 * Tipos padronizados de lateralidade anatômica
 * @readonly
 * @enum {string}
 */
export const Laterality = Object.freeze({
  BILATERAL: 'bilateral',
  LEFT: 'left',
  RIGHT: 'right',
  MIDLINE: 'midline',
  UNPAIRED: 'unpaired'
});

/**
 * Lista canônica dos sistemas anatômicos oficiais
 * @readonly
 */
export const CanonicalSystems = Object.freeze([
  'articular',
  'cardiovascular',
  'digestorio',
  'endocrino',
  'esqueletico',
  'linfatico',
  'muscular',
  'nervoso',
  'reprodutor',
  'respiratorio',
  'tegumentar',
  'urinario'
]);

/**
 * Dicionário de rótulos oficiais dos sistemas em língua portuguesa
 * @readonly
 */
export const SystemLabelsPt = Object.freeze({
  articular: 'Sistema Articular',
  cardiovascular: 'Sistema Cardiovascular',
  digestorio: 'Sistema Digestório',
  endocrino: 'Sistema Endócrino',
  esqueletico: 'Sistema Esquelético',
  linfatico: 'Sistema Linfático',
  muscular: 'Sistema Muscular',
  nervoso: 'Sistema Nervoso',
  reprodutor: 'Sistema Reprodutor',
  respiratorio: 'Sistema Respiratório',
  tegumentar: 'Sistema Tegumentar',
  urinario: 'Sistema Urinário',
  geral: 'Estrutura Geral'
});

// [INÍCIO: sanitizeString]
/**
 * Remove espaços excessivos e caracteres de controle indesejados.
 * @param {any} val
 * @returns {string}
 */
export function sanitizeString(val) {
  if (val === null || val === undefined) {
    return '';
  }
  return String(val).trim();
}
// [FIM: sanitizeString]

// [INÍCIO: normalizeCanonicalSystem]
/**
 * Mapeia aliases legados e variantes ortográficas para o identificador canônico de sistema.
 * @param {string} rawSystem
 * @returns {string}
 */
export function normalizeCanonicalSystem(rawSystem) {
  const clean = sanitizeString(rawSystem).toLowerCase();
  if (CanonicalSystems.includes(clean)) {
    return clean;
  }
  if (clean === 'circulatorio' || clean === 'circulatório' || clean === 'cardiovascular-system') {
    return 'cardiovascular';
  }
  if (clean === 'osseo' || clean === 'ósseo' || clean === 'esqueleto' || clean === 'skeletal') {
    return 'esqueletico';
  }
  if (clean === 'digestivo' || clean === 'digestive') {
    return 'digestorio';
  }
  if (clean === 'respiratório' || clean === 'respiratory') {
    return 'respiratorio';
  }
  if (clean === 'endócrino' || clean === 'endocrine') {
    return 'endocrino';
  }
  if (clean === 'linfático' || clean === 'lymphatic') {
    return 'linfatico';
  }
  if (clean === 'urinário' || clean === 'urinary') {
    return 'urinario';
  }
  return 'geral';
}
// [FIM: normalizeCanonicalSystem]

// [INÍCIO: normalizeLaterality]
/**
 * Determina a lateralidade anatômica a partir de declarações brutas ou sufixos de identificador.
 * @param {string} rawLaterality
 * @param {string} sid
 * @returns {string}
 */
export function normalizeLaterality(rawLaterality, sid) {
  const cleanLat = sanitizeString(rawLaterality).toLowerCase();
  const cleanSid = sanitizeString(sid).toLowerCase();

  if (['left', 'l', 'esquerdo', 'esquerda', 'sinistra'].includes(cleanLat) || cleanSid.endsWith('-l')) {
    return Laterality.LEFT;
  }
  if (['right', 'r', 'direito', 'direita', 'dextra'].includes(cleanLat) || cleanSid.endsWith('-r')) {
    return Laterality.RIGHT;
  }
  if (['bilateral', 'ambos'].includes(cleanLat)) {
    return Laterality.BILATERAL;
  }
  if (['midline', 'medial', 'mediana', 'sagital'].includes(cleanLat)) {
    return Laterality.MIDLINE;
  }
  return Laterality.UNPAIRED;
}
// [FIM: normalizeLaterality]

// [INÍCIO: normalizeStructureEntry]
/**
 * Normaliza um registro anatômico bruto, unificando campos legados e novos no contrato StructureEntry.
 * @param {Object} raw - Registro vindo de structures.json, index.json ou structures.boot.json.
 * @param {Object} [glossary={}] - Mapeamento de termos oriundo de glossario-pt.json.
 * @returns {Readonly<Object>}
 */
export function normalizeStructureEntry(raw, glossary = {}) {
  if (!raw || typeof raw !== 'object' || !raw.sid) {
    throw new TypeError('Estrutura inválida: a propriedade obrigatória "sid" não foi informada.');
  }

  const sid = sanitizeString(raw.sid);
  const glossItem = glossary[sid] || {};

  // Resolução de nomes multilíngues
  const namePt = sanitizeString(raw.names?.pt || raw.ptName || raw.name_pt || glossItem.pt || raw.name || sid);
  const nameEn = sanitizeString(raw.names?.en || raw.englishName || raw.name_en || glossItem.en || '');
  const nameLa = sanitizeString(raw.names?.la || raw.latinName || raw.name_la || glossItem.la || '');

  // Resolução de sistema e lateralidade
  const system = normalizeCanonicalSystem(raw.system || raw.systemId || glossItem.system);
  const laterality = normalizeLaterality(raw.laterality || glossItem.laterality, sid);

  // Camada anatômica de dissecação (1 a 5)
  const rawLayer = Number(raw.layer || glossItem.layer || 1);
  const layer = Number.isFinite(rawLayer) ? Math.max(1, Math.min(5, Math.floor(rawLayer))) : 1;

  // Unificação de sinônimos para busca textual
  const synonymsSet = new Set();
  if (Array.isArray(raw.synonyms)) {
    for (let i = 0; i < raw.synonyms.length; i++) {
      const syn = sanitizeString(raw.synonyms[i]);
      if (syn.length > 0) synonymsSet.add(syn);
    }
  }
  if (Array.isArray(glossItem.synonyms)) {
    for (let i = 0; i < glossItem.synonyms.length; i++) {
      const syn = sanitizeString(glossItem.synonyms[i]);
      if (syn.length > 0) synonymsSet.add(syn);
    }
  }
  const popular = sanitizeString(raw.popularName || glossItem.popular);
  if (popular.length > 0) {
    synonymsSet.add(popular);
  }

  // Resolução de modelo tridimensional, licença e proveniência
  const modelFile = sanitizeString(raw.model?.file || raw.file);
  const rawLod = raw.model?.lod !== undefined ? raw.model.lod : raw.lod;
  const modelLod = Number.isFinite(Number(rawLod)) ? Number(rawLod) : 1;
  const isHra = modelFile.startsWith('hra-') || sanitizeString(raw.model?.source) === 'hra';
  const modelSource = isHra ? 'hra' : 'z-anatomy';
  const modelLicense = sanitizeString(raw.model?.license || (isHra ? 'CC BY 4.0' : 'CC BY-SA 4.0'));
  const meshIndex = Number.isInteger(raw.meshIndex) ? raw.meshIndex : (Number.isInteger(raw.model?.meshIndex) ? raw.model.meshIndex : null);

  // Parâmetros espaciais de enquadramento (Bounding Box)
  let bounds = null;
  const rawBounds = raw.bounds || glossItem.bounds;
  if (rawBounds && Array.isArray(rawBounds.center) && Array.isArray(rawBounds.size)) {
    bounds = {
      center: [
        Number(rawBounds.center[0]) || 0,
        Number(rawBounds.center[1]) || 0,
        Number(rawBounds.center[2]) || 0
      ],
      size: [
        Math.abs(Number(rawBounds.size[0])) || 0,
        Math.abs(Number(rawBounds.size[1])) || 0,
        Math.abs(Number(rawBounds.size[2])) || 0
      ]
    };
  }

  // Identificadores ontológicos cruzados
  const ids = {
    fma: sanitizeString(raw.ids?.fma || glossItem.ids?.fma),
    uberon: sanitizeString(raw.ids?.uberon || glossItem.ids?.uberon),
    ta2: sanitizeString(raw.ids?.ta2 || glossItem.ids?.ta2),
    wikidata: sanitizeString(raw.ids?.wikidata || glossItem.ids?.wikidata)
  };

  return Object.freeze({
    sid,
    names: Object.freeze({
      pt: namePt,
      en: nameEn,
      la: nameLa
    }),
    synonyms: Object.freeze(Array.from(synonymsSet)),
    system,
    systemLabel: SystemLabelsPt[system] || SystemLabelsPt.geral,
    layer,
    laterality,
    ids: Object.freeze(ids),
    model: Object.freeze({
      file: modelFile,
      lod: modelLod,
      source: modelSource,
      license: modelLicense,
      meshIndex
    }),
    bounds: bounds ? Object.freeze(bounds) : null
  });
}
// [FIM: normalizeStructureEntry]

// [INÍCIO: validateContentEntry]
/**
 * Valida a conformidade científica de um registro de conteúdo conforme ATLAS_CONTENT_POLICY.md.
 * Rejeita textos sem fontes associadas e status de revisão sem auditoria documentada.
 * @param {Object} content
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateContentEntry(content) {
  const errors = [];

  if (!content || typeof content !== 'object') {
    return { valid: false, errors: ['O registro de conteúdo deve ser um objeto válido.'] };
  }

  const sid = sanitizeString(content.sid);
  if (!sid) {
    errors.push('Identificador "sid" ausente no registro de conteúdo.');
  }

  const summary = sanitizeString(content.summary_pt);
  if (summary.length === 0) {
    errors.push(`Campo "summary_pt" obrigatório está ausente ou vazio para SID "${sid}".`);
  }

  const status = content.review?.status;
  if (!status || !Object.values(ReviewStatus).includes(status)) {
    errors.push(`Status de revisão inválido ("${status}") para SID "${sid}". Valores permitidos: ${Object.values(ReviewStatus).join(', ')}.`);
  }

  // Regra de Integridade: Aprovação humana exige dados completos do auditor
  if (status === ReviewStatus.REVIEWED || status === ReviewStatus.APPROVED) {
    const reviewer = sanitizeString(content.review.reviewer);
    const date = sanitizeString(content.review.date);
    const institution = sanitizeString(content.review.institution);

    if (reviewer.length === 0) {
      errors.push(`Conteúdo marcado como "${status}" exige o preenchimento do campo "review.reviewer".`);
    }
    if (date.length === 0) {
      errors.push(`Conteúdo marcado como "${status}" exige o preenchimento da data em "review.date".`);
    }
    if (institution.length === 0) {
      errors.push(`Conteúdo marcado como "${status}" exige a instituição responsável em "review.institution".`);
    }
  }

  // Regra de Fontes: Nenhum conteúdo educacional existe sem citação de fontes
  if (!Array.isArray(content.sources) || content.sources.length === 0) {
    errors.push(`O registro de conteúdo para SID "${sid}" não possui fontes citadas ("sources").`);
  } else {
    for (let i = 0; i < content.sources.length; i++) {
      const src = content.sources[i];
      if (!src || typeof src !== 'object') {
        errors.push(`Fonte no índice ${i} é inválida para SID "${sid}".`);
        continue;
      }
      if (!sanitizeString(src.field)) {
        errors.push(`Fonte [${i}] sem campo de associação ("field") para SID "${sid}".`);
      }
      if (!sanitizeString(src.type)) {
        errors.push(`Fonte [${i}] sem tipagem ("type") para SID "${sid}".`);
      }
      if (!sanitizeString(src.ref)) {
        errors.push(`Fonte [${i}] sem referência/link ("ref") para SID "${sid}".`);
      }
      if (!sanitizeString(src.license)) {
        errors.push(`Fonte [${i}] sem licença patrimonial declarada ("license") para SID "${sid}".`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
// [FIM: validateContentEntry]

// [INÍCIO: resolveContentWithPrecedence]
/**
 * Aplica a precedência determinística em 4 níveis para entrega de conteúdo:
 * 1. Base moderna por SID real com status 'reviewed' ou 'approved'.
 * 2. Base moderna por SID real com status 'auto-draft'.
 * 3. Base legada associada via legacy-id-map.json com status 'legacy-unverified'.
 * 4. Retorno nulo tipado (sem conteúdo disponível).
 *
 * @param {string} sid
 * @param {Object} modernContentSystem - Tabela data/atlas/content/<sistema>.json
 * @param {Object} legacyContentSystem - Tabela data/atlas/legacy/content/<sistema>.json
 * @param {Object} legacyIdMap - Tabela data/atlas/legacy-id-map.json
 * @returns {Object|null}
 */
export function resolveContentWithPrecedence(sid, modernContentSystem = {}, legacyContentSystem = {}, legacyIdMap = {}) {
  const cleanSid = sanitizeString(sid);
  if (!cleanSid) {
    return null;
  }

  // Nível 1 e 2: Base moderna catalogada por SID real
  const modernData = modernContentSystem[cleanSid];
  if (modernData) {
    const validation = validateContentEntry(modernData);
    if (validation.valid) {
      const isReviewed = modernData.review?.status === ReviewStatus.REVIEWED ||
                         modernData.review?.status === ReviewStatus.APPROVED;
      return {
        ...modernData,
        resolvedFrom: 'modern',
        isReviewed,
        isLegacy: false
      };
    }
  }

  // Nível 3: Mapeamento verificado para conteúdo do acervo legado
  const legacySid = legacyIdMap.realToLegacySid?.[cleanSid];
  if (legacySid && legacyContentSystem[legacySid]) {
    const rawLegacy = legacyContentSystem[legacySid];
    const summary = sanitizeString(rawLegacy.description_pt || rawLegacy.summary_pt || rawLegacy.resumo);

    return {
      sid: cleanSid,
      legacySid,
      ids: rawLegacy.ids || {},
      summary_pt: summary.length > 0 ? summary : 'Registro anatômico em catalogação histórica.',
      anatomy: rawLegacy.anatomy || null,
      histology: rawLegacy.histology || null,
      clinical: Array.isArray(rawLegacy.clinical) ? rawLegacy.clinical : [],
      sources: Array.isArray(rawLegacy.sources) && rawLegacy.sources.length > 0
        ? rawLegacy.sources
        : [{
            field: 'summary_pt',
            type: 'internal-archive',
            ref: 'Acervo Histórico LAIFT (v1)',
            license: 'legacy-unverified'
          }],
      review: {
        status: ReviewStatus.LEGACY_UNVERIFIED,
        reviewer: null,
        date: null,
        institution: 'LAIFT',
        note: 'Ficha importada do sistema legado v1; necessita de nova verificação acadêmica.'
      },
      resolvedFrom: 'legacy',
      isReviewed: false,
      isLegacy: true
    };
  }

  // Nível 4: Ausência comprovada de conteúdo descritivo
  return null;
}
// [FIM: resolveContentWithPrecedence]
