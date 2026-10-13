/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Memória de estudo (ADR 0007, etapa 7): parte PURA de memory.js (sem DOM e sem rede): textos da tela, texto da finalidade
// (CONSENT_SECTIONS: RASCUNHO PARA APROVAÇÃO DO DONO, docs/memoria-consentimento-RASCUNHO.md; única cópia no front),
// mensagens por code de erro, normalização do que vem do servidor (dado não confiável), descrição dos itens, exportação
// em JSON e download local por Blob. Expõe window.LaiftMemoryCore (ou module.exports, no Node, para os testes).
(function (root) {
  'use strict';

  var PANEL = 'panel-profile';
  var GRID_ID = 'profile-grid';
  var CARD_ID = 'memory-card';
  var ITEMS_MAX = 100;
  var REVOKE_DELAY_MS = 1000;
  var KINDS = ['topic_level', 'difficulty', 'study_pref', 'goal'];
  var SOURCES = ['quiz', 'tutor', 'member'];
  var STATUSES = ['none', 'granted', 'revoked'];
  var LEVELS = [1, 2, 3, 4, 5];
  var SLUG_RE = /^[a-z0-9_-]{2,40}$/;
  var ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var VERSION_RE = /^[A-Za-z0-9._-]{1,64}$/;
  var FALLBACK_LIMITS = { maxItems: 60, retentionUnusedDays: 180, retentionMaxMonths: 12 };
  var NETWORK_FAILURE = { success: false, networkUnavailable: true };

  // Texto da finalidade (rascunho do dono). {maxItems}, {unusedDays} e {maxMonths} vêm de `limits` do servidor.
  var CONSENT_SECTIONS = [
    { title: 'Para que serve', text: 'Se você ativar, o Tutor Clínico e a plataforma lembram, entre uma conversa e outra, do que ajuda a adaptar suas explicações ao seu jeito de estudar: em quais temas você está mais forte ou com mais dúvida, como prefere as explicações (exemplos, resumo, passo a passo) e o seu objetivo (prova, revisão, aprofundamento, monitoria). É opcional: o Tutor funciona igual sem a memória.' },
    { title: 'O que guardamos', text: 'Só itens de uma lista fixa: tema de estudo (por exemplo, "Farmacocinética" ou "Antimicrobianos"), um nível de 1 a 5, uma marca de "dúvida recorrente" e as preferências e objetivos que você escolher. Eles vêm de três fontes: o resultado dos seus simulados, os temas que aparecem nas suas perguntas ao Tutor e o que você mesmo marcar.' },
    { title: 'O que NÃO guardamos', text: 'O texto das suas perguntas, as respostas do Tutor, a conversa, seu nome, e-mail ou telefone, e nenhum dado de saúde, seu ou de outra pessoa. A memória não tem onde guardar texto livre.' },
    { title: 'Onde fica', text: 'Em um banco de dados separado do restante da plataforma, ligado à sua conta por um código que, sozinho, não identifica você.' },
    { title: 'Por quanto tempo', text: 'Cada item é apagado se ficar {unusedDays} dias sem uso, e em no máximo {maxMonths} meses depois de criado. Há um limite de {maxItems} itens por pessoa.' },
    { title: 'Quem pode ver', text: 'Você, no seu Perfil. A administração não lê a sua memória (vê apenas números totais). A memória só é usada para montar as respostas do Tutor para você.' },
    { title: 'Seus controles', text: 'Aqui no Perfil você pode ver tudo o que está guardado, apagar um item, apagar tudo, baixar uma cópia (JSON) e desativar a memória a qualquer momento. Desativar apaga a memória: a exclusão é imediata ou, se houver falha técnica, concluída em até 3 meses. Desativar não prejudica o uso da plataforma nem do Tutor.' },
    { title: 'Quem pode usar', text: 'Somente maiores de 18 anos.' },
    { title: 'Base legal', text: 'Seu consentimento (LGPD, art. 7º, I). Você pode revogá-lo quando quiser (art. 8º, § 5º), de forma tão fácil quanto foi dado.' },
  ];

  var TEXT = {
    title: 'Memória de estudo',
    lead: 'Opcional. Se você ativar, o Tutor lembra do que ajuda a adaptar as explicações ao seu jeito de estudar. O Tutor funciona igual sem a memória.',
    termsLabel: 'Texto do consentimento da memória de estudo',
    termsFooter: 'Se este texto mudar, pediremos um novo aceite antes de voltar a usar ou gravar a memória.',
    activate: 'Ativar memória de estudo',
    reaccept: 'Aceitar o novo texto',
    reconsent: 'O texto da memória de estudo mudou. Leia de novo e aceite para voltar a usá-la. Enquanto você não aceitar, nada é lido nem gravado.',
    activeLead: 'A memória de estudo está ativa. O Tutor usa os itens abaixo para adaptar as explicações. Só você vê o que está guardado aqui.',
    itemsTitle: 'O que está guardado',
    itemsLabel: 'Itens da memória de estudo',
    itemsEmpty: 'Ainda não há nada guardado. Os itens aparecem aqui conforme você faz simulados e conversa com o Tutor, ou quando você mesmo escolhe abaixo.',
    deleteItem: 'Apagar',
    origin: 'Origem: ',
    topicTitle: 'Meu nível em um tema',
    topicLabel: 'Tema',
    levelLabel: 'Meu nível',
    saveLevel: 'Salvar nível',
    styleTitle: 'Como prefiro estudar',
    saveStyle: 'Salvar preferências',
    goalTitle: 'Meu objetivo de estudo',
    goalLabel: 'Objetivo',
    saveGoal: 'Salvar objetivo',
    choose: 'Escolher…',
    exportData: 'Baixar meus dados',
    refresh: 'Atualizar lista',
    deleteAll: 'Apagar tudo',
    revoke: 'Desligar memória',
    revokeErase: 'Apagar tudo e desligar',
    retry: 'Tentar de novo',
    unavailable: 'A memória de estudo está indisponível agora. Tente novamente mais tarde.',
    pickTopic: 'Escolha um tema e um nível.',
    pickStyle: 'Escolha ao menos uma preferência.',
    pickGoal: 'Escolha um objetivo.',
    confirmActivate: 'Ativar a memória de estudo? Guardaremos só temas, níveis e preferências de uma lista fixa, nunca o texto das suas conversas. Você pode desativar e apagar tudo quando quiser, aqui no Perfil.',
    confirmItem: 'Apagar este item da sua memória de estudo? Isso não pode ser desfeito.',
    confirmAll: 'Apagar tudo da sua memória de estudo? Todos os itens guardados serão removidos e não poderão ser recuperados. A memória continua ativada.',
    confirmRevoke: 'Desligar a memória de estudo? Tudo o que está guardado será apagado e o Tutor deixa de usar a memória. Você pode ativar de novo depois.',
    okActivated: 'Memória de estudo ativada.',
    okRevoked: 'Memória desativada e apagada.',
    okRevokedPending: 'Memória desativada. O apagamento está em andamento e termina em até 3 meses.',
    okItemDeleted: 'Item apagado.',
    okAllDeleted: 'Tudo foi apagado.',
    okSaved: 'Salvo.',
    okExport: 'Arquivo gerado no seu aparelho. Nada foi enviado a outro lugar.',
    okRefreshed: 'Lista atualizada.',
    exportFailed: 'Não foi possível gerar o arquivo agora. Tente de novo em instantes.',
    versionChanged: 'O texto da memória foi atualizado. Leia de novo antes de aceitar.',
    network: 'Sem conexão com o servidor. Tente de novo em instantes.',
    generic: 'Não foi possível concluir agora. Tente de novo em instantes.',
  };
  var ERRORS = {
    MEMORY_DISABLED: 'A memória de estudo não está disponível no momento.',
    MEMORY_UNAVAILABLE: TEXT.unavailable,
    CONSENT_REQUIRED: 'Ative a memória de estudo e aceite o texto para guardar preferências.',
    MEMORY_FULL: 'Você chegou ao limite de itens da memória. Apague algum item para guardar outro.',
    RATE_LIMIT: 'Você fez muitas operações na memória de estudo. Tente novamente mais tarde.',
    VALIDATION: 'Escolha apenas opções da lista.',
    NOT_FOUND: 'Esse item não existe mais.',
  };
  var PREF_LABEL = { formato: 'Formato das explicações', profundidade: 'Profundidade', ritmo: 'Ritmo' };
  var VALUE_LABEL = {
    exemplos: 'Com exemplos', resumo: 'Em resumo', passo_a_passo: 'Passo a passo', analogias: 'Com analogias',
    basico: 'Básico', intermediario: 'Intermediário', avancado: 'Avançado', curto: 'Curto', detalhado: 'Detalhado',
  };
  var GOAL_LABEL = { prova: 'Prova', revisao: 'Revisão', aprofundamento: 'Aprofundamento', monitoria: 'Monitoria' };
  var LEVEL_LABEL = { 1: 'iniciando', 2: 'básico', 3: 'intermediário', 4: 'avançado', 5: 'domínio' };
  var SOURCE_LABEL = { quiz: 'Simulados', tutor: 'Perguntas ao Tutor', member: 'Você escolheu' };

  // ---------------------------------------------------------------------------
  // Funções puras
  // ---------------------------------------------------------------------------
  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function clip(value, max) {
    return typeof value === 'string' ? value.slice(0, max) : '';
  }

  function own(map, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : '';
  }

  function labelOr(map, key) {
    return own(map, key) || key;
  }

  function intIn(value, min, max, fallback) {
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  }

  function slugOf(value) {
    return typeof value === 'string' && SLUG_RE.test(value) ? value : '';
  }

  function oneOf(value, allowed, fallback) {
    return allowed.indexOf(value) !== -1 ? value : fallback;
  }

  /** Texto da finalidade com os números de `limits` (do servidor). */
  function consentSections(limits) {
    var lim = isObject(limits) ? limits : FALLBACK_LIMITS;
    var numbers = {
      maxItems: intIn(lim.maxItems, 1, 1000, FALLBACK_LIMITS.maxItems),
      unusedDays: intIn(lim.retentionUnusedDays, 1, 3650, FALLBACK_LIMITS.retentionUnusedDays),
      maxMonths: intIn(lim.retentionMaxMonths, 1, 120, FALLBACK_LIMITS.retentionMaxMonths),
    };
    return CONSENT_SECTIONS.map(function (s) {
      return {
        title: s.title,
        text: s.text.replace(/\{(maxItems|unusedDays|maxMonths)\}/g, function (_all, key) { return String(numbers[key]); }),
      };
    });
  }

  function normalizeConsent(raw) {
    var c = isObject(raw) ? raw : {};
    return {
      status: oneOf(c.status, STATUSES, 'none'),
      current: c.current === true,
      needsReconsent: c.needsReconsent === true && c.current !== true,
      purposeVersion: typeof c.purposeVersion === 'string' && VERSION_RE.test(c.purposeVersion) ? c.purposeVersion : '',
    };
  }

  function normalizeItem(raw) {
    if (!isObject(raw) || typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
    var kind = oneOf(raw.kind, KINDS, '');
    var slug = slugOf(raw.slug);
    if (!kind || !slug) return null;
    return {
      id: raw.id.toLowerCase(), kind: kind, slug: slug, label: clip(raw.label, 80),
      level: intIn(raw.level, 1, 5, null), value: slugOf(raw.value), source: oneOf(raw.source, SOURCES, ''),
    };
  }

  function normalizeVocabulary(raw) {
    var v = isObject(raw) ? raw : {};
    return {
      topics: list(v.topics).filter(function (t) { return isObject(t) && slugOf(t.slug); })
        .slice(0, 60).map(function (t) { return { slug: t.slug, label: clip(t.label, 80) || t.slug }; }),
      preferences: list(v.preferences).filter(function (p) { return isObject(p) && slugOf(p.slug); }).slice(0, 10)
        .map(function (p) { return { slug: p.slug, values: list(p.values).filter(slugOf).slice(0, 10) }; })
        .filter(function (p) { return p.values.length > 0; }),
      goals: list(v.goals).filter(slugOf).slice(0, 10),
    };
  }

  function normalizeLimits(raw) {
    var l = isObject(raw) ? raw : {};
    return {
      maxItems: intIn(l.maxItems, 1, 1000, FALLBACK_LIMITS.maxItems),
      retentionUnusedDays: intIn(l.retentionUnusedDays, 1, 3650, FALLBACK_LIMITS.retentionUnusedDays),
      retentionMaxMonths: intIn(l.retentionMaxMonths, 1, 120, FALLBACK_LIMITS.retentionMaxMonths),
    };
  }

  /** Resposta de apiMemoryGet → dados normalizados para a tela, ou null se não tiver a forma esperada. */
  function normalizeState(res) {
    if (!isObject(res) || res.success !== true) return null;
    if (!isObject(res.consent) || typeof res.available !== 'boolean') return null; // resposta de outra ação ou formato antigo: sem cartão
    return {
      available: res.available === true,
      consent: normalizeConsent(res.consent),
      items: list(res.items).map(normalizeItem).filter(Boolean).slice(0, ITEMS_MAX),
      vocabulary: normalizeVocabulary(res.vocabulary),
      limits: normalizeLimits(res.limits),
    };
  }

  function errorMessage(res) {
    if (!isObject(res)) return TEXT.generic;
    if (res.networkUnavailable === true) return TEXT.network;
    return own(ERRORS, res.code) || TEXT.generic;
  }

  /**
   * Resposta do primeiro apiMemoryGet → o que fazer:
   *   { kind: 'ok', data } | { kind: 'error', message } (cartão com aviso) | { kind: 'hidden', cache } (sem cartão).
   * `cache` diz se o "não mostrar" vale pela sessão toda (resposta definitiva do servidor, como MEMORY_DISABLED) ou só desta
   * tentativa (falha de rede ou resposta que nem é um objeto).
   */
  function classifyLoad(res) {
    if (!isObject(res)) return { kind: 'hidden', cache: false };
    if (res.code === 'MEMORY_DISABLED') return { kind: 'hidden', cache: true };
    if (res.networkUnavailable === true) return { kind: 'hidden', cache: false };
    if (res.success === true) {
      var data = normalizeState(res);
      return data ? { kind: 'ok', data: data } : { kind: 'hidden', cache: true };
    }
    if (res.code === 'RATE_LIMIT' || res.code === 'MEMORY_UNAVAILABLE') return { kind: 'error', message: errorMessage(res) };
    return { kind: 'hidden', cache: true };
  }

  function levelText(level) {
    return level ? 'Nível ' + level + ' de 5 (' + LEVEL_LABEL[level] + ')' : 'Nível não informado';
  }

  /** { title, detail, origin } de um item já normalizado; rótulos conhecidos em português, senão o próprio slug. */
  function describeItem(item) {
    var origin = own(SOURCE_LABEL, item.source);
    if (item.kind === 'study_pref') return { title: labelOr(PREF_LABEL, item.slug), detail: labelOr(VALUE_LABEL, item.value), origin: origin };
    if (item.kind === 'goal') return { title: 'Objetivo', detail: labelOr(GOAL_LABEL, item.slug), origin: origin };
    var title = item.label || item.slug;
    if (item.kind === 'difficulty') return { title: title, detail: 'Dúvida recorrente', origin: origin };
    return { title: title, detail: levelText(item.level), origin: origin };
  }

  var EXPORT_ITEM_KEYS = ['kind', 'slug', 'label', 'level', 'value', 'source', 'evidence', 'createdAt', 'updatedAt', 'lastUsedAt', 'expiresAt'];

  function plainValue(value) {
    return (typeof value === 'string' || typeof value === 'number' || value === null) ? value : null;
  }

  /** JSON legível do arquivo de portabilidade a partir de apiMemoryExport, ou '' se a resposta não servir. */
  function exportText(res) {
    if (!isObject(res) || res.success !== true || !Array.isArray(res.items)) return '';
    var items = res.items.filter(isObject).map(function (item) {
      return EXPORT_ITEM_KEYS.reduce(function (acc, key) {
        return Object.prototype.hasOwnProperty.call(item, key) ? Object.assign(acc, { [key]: plainValue(item[key]) }) : acc;
      }, {});
    });
    var consent = isObject(res.consent) ? res.consent : {};
    var doc = {
      format: clip(res.format, 40) || 'laift-memory/v1',
      exportedAt: clip(res.exportedAt, 40),
      consent: { status: plainValue(consent.status), acceptedVersion: plainValue(consent.acceptedVersion), grantedAt: plainValue(consent.grantedAt), revokedAt: plainValue(consent.revokedAt) },
      items: items,
    };
    return JSON.stringify(doc, null, 2);
  }

  function exportFileName(now) {
    var date = now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString().slice(0, 10) : 'hoje';
    return 'laift-memoria-de-estudo-' + date + '.json';
  }

  function defaultEnv() {
    return { document: root.document, Blob: root.Blob, URL: root.URL, setTimeout: root.setTimeout.bind(root) };
  }

  /** Baixa `text` como arquivo no próprio aparelho (Blob + URL de objeto); a URL é revogada logo depois. */
  function downloadJson(env, name, text) {
    var doc = env.document;
    var url = env.URL.createObjectURL(new env.Blob([text], { type: 'application/json' }));
    var link = doc.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', name);
    link.hidden = true;
    doc.body.appendChild(link);
    try {
      link.click();
    } finally {
      doc.body.removeChild(link);
      env.setTimeout(function () { env.URL.revokeObjectURL(url); }, REVOKE_DELAY_MS);
    }
  }

  var api = {
    PANEL: PANEL, GRID_ID: GRID_ID, CARD_ID: CARD_ID, NETWORK_FAILURE: NETWORK_FAILURE, LEVELS: LEVELS, LEVEL_LABEL: LEVEL_LABEL,
    PREF_LABEL: PREF_LABEL, VALUE_LABEL: VALUE_LABEL, GOAL_LABEL: GOAL_LABEL, TEXT: TEXT, ERRORS: ERRORS, CONSENT_SECTIONS: CONSENT_SECTIONS,
    isObject: isObject, labelOr: labelOr, consentSections: consentSections, normalizeConsent: normalizeConsent, normalizeItem: normalizeItem,
    normalizeState: normalizeState, errorMessage: errorMessage, classifyLoad: classifyLoad, describeItem: describeItem,
    exportText: exportText, exportFileName: exportFileName, defaultEnv: defaultEnv, downloadJson: downloadJson,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftMemoryCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
