/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Jornada de preferências da memória de estudo (T2, opção B aprovada): depois do aceite, uma pergunta por tela
// (temas, nível, estilo, tamanho, objetivo e resumo). Carregada SOB DEMANDA (pacote "memory-journey" de lazy-bundles.js),
// fora do shell e do precache. Nada é gravado até "Salvar e concluir"; sair sem salvar não grava nada; nada vem marcado.
//   - Os temas vêm do servidor (vocabulário fechado); aqui só se agrupam por área. Tema novo cai em "Outros temas".
//   - "Sugerido" = tema que já tem nível guardado; nunca é marcado sozinho.
//   - Só DOM seguro (textContent); estado é o objeto `prefs` que memory.js guarda em memória (nada no navegador).
// Expõe window.LaiftMemoryJourney (ou module.exports, no Node, para os testes).
(function (root) {
  'use strict';

  var Core = root.LaiftMemoryCore || (typeof require === 'function' ? require('./memory-core.js') : null);

  var TEXT = {
    progress: 'Preferências, passo {n} de {total}',
    titles: { topics: 'Quais temas você quer acompanhar?', levels: 'Como você se sente em cada tema?', formato: 'Como prefere que o Tutor explique?', ritmo: 'E o tamanho das respostas?', goal: 'Qual é o seu objetivo agora?', summary: 'Confira e conclua' },
    hints: {
      topics: 'Escolha quantos quiser. Os sugeridos são temas que você já estudou. Mais temas em breve.',
      levels: '1 = estou começando, 5 = domino bem. Tema sem nível não é guardado.',
      formato: 'O Tutor usa isso para escolher o formato da explicação.',
      ritmo: 'Você muda quando quiser.',
      goal: 'O Tutor ajusta a profundidade ao que você precisa agora.',
      summary: 'Você pode mudar tudo depois, aqui no Perfil.',
    },
    suggested: 'sugerido',
    next: 'Continuar',
    back: 'Voltar',
    skip: 'Pular este passo',
    finish: 'Salvar e concluir',
    finishNoSave: 'Concluir sem salvar',
    levelFor: 'Nível de {topic}',
    summaryTopics: 'Temas com nível: {n}',
    summaryNone: 'Nada escolhido',
  };

  var TOPIC_AREAS = [
    ['farmacologia', 'Farmacologia', ['farmacodinamica', 'farmacocinetica', 'sistema-nervoso-autonomo', 'psicofarmacos', 'glicocorticoides', 'farmacologia-endocrina', 'diureticos', 'dislipidemias', 'coagulacao', 'antimicrobianos', 'anti-hipertensivos', 'aines', 'interacoes-medicamentosas', 'reacoes-adversas', 'farmacologia-geral']],
    ['toxicologia', 'Toxicologia', ['toxicocinetica', 'toxicodinamica', 'antidotos', 'toxicologia-hepatica', 'toxicologia-renal', 'toxicologia-geral']],
    ['farmacotecnica', 'Farmacotécnica', ['farmacotecnica']],
    ['anatomia', 'Anatomia', ['anatomia-geral']],
  ];

  /** Temas do servidor em áreas, na ordem em que vieram; o que a tela não conhece cai em "Outros temas". */
  function groupTopics(topics, suggested) {
    var list = Array.isArray(topics) ? topics : [];
    var hints = Array.isArray(suggested) ? suggested : [];
    var groups = TOPIC_AREAS.map(function (a) { return { key: a[0], label: a[1], slugs: a[2], topics: [] }; });
    var other = { key: 'outros', label: 'Outros temas', slugs: [], topics: [] };
    list.forEach(function (t) {
      var home = groups.filter(function (g) { return g.slugs.indexOf(t.slug) >= 0; })[0] || other;
      home.topics.push({ slug: t.slug, label: t.label, suggested: hints.indexOf(t.slug) >= 0 });
    });
    return groups.concat([other]).filter(function (g) { return g.topics.length; }).map(function (g) { return { key: g.key, label: g.label, topics: g.topics }; });
  }

  /** Temas que já têm nível guardado: viram "sugerido" (nunca marcado sozinho). */
  function suggestedFrom(items) {
    return (Array.isArray(items) ? items : []).filter(function (i) { return i && i.kind === 'topic_level'; }).map(function (i) { return i.slug; });
  }

  function newPrefs() {
    return { step: 'topics', topics: [], levels: {}, formato: '', ritmo: '', goal: '' };
  }

  /** Passos da jornada; o de nível só existe quando há temas escolhidos. */
  function prefSteps(prefs) {
    var hasTopics = prefs && Array.isArray(prefs.topics) && prefs.topics.length > 0;
    return hasTopics ? ['topics', 'levels', 'formato', 'ritmo', 'goal', 'summary'] : ['topics', 'formato', 'ritmo', 'goal', 'summary'];
  }

  /** Move `delta` passos (limitado ao primeiro e ao último). */
  function moved(prefs, delta) {
    var seq = prefSteps(prefs);
    var i = Math.max(0, Math.min(seq.length - 1, seq.indexOf(prefs.step) + delta));
    return Object.assign({}, prefs, { step: seq[i] });
  }

  /** "Pular este passo": limpa o que o passo escolheria e avança. */
  function skipped(prefs) {
    var clear = {};
    if (prefs.step === 'topics') { clear.topics = []; clear.levels = {}; }
    if (prefs.step === 'levels') clear.levels = {};
    if (prefs.step === 'formato' || prefs.step === 'ritmo' || prefs.step === 'goal') clear[prefs.step] = '';
    return moved(Object.assign({}, prefs, clear), 1);
  }

  /** Itens a gravar ao concluir: só o que a pessoa escolheu (tema sem nível, preferência e objetivo vazios ficam de fora). */
  function journeyPayloads(prefs) {
    var out = [];
    (prefs.topics || []).forEach(function (slug) {
      var level = prefs.levels && prefs.levels[slug];
      if (level >= 1 && level <= 5) out.push({ kind: 'topic_level', slug: slug, level: level });
    });
    if (prefs.formato) out.push({ kind: 'study_pref', slug: 'formato', value: prefs.formato });
    if (prefs.ritmo) out.push({ kind: 'study_pref', slug: 'ritmo', value: prefs.ritmo });
    if (prefs.goal) out.push({ kind: 'goal', slug: prefs.goal });
    return out;
  }

  function prefValues(data, slug) {
    var hit = data.vocabulary.preferences.filter(function (x) { return x.slug === slug; })[0];
    return hit ? hit.values : [];
  }

  /** Botão de alternância (aria-pressed) no estilo "chip"; `tag` marca o sugerido sem marcá-lo. */
  function chip(doc, h, label, pressed, key, handler, tag) {
    var node = h.btn(doc, tag ? label + ' · ' + tag : label, 'memory-chip' + (pressed ? ' is-on' : '') + (tag && !pressed ? ' is-suggested' : ''), key, handler);
    node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    return node;
  }

  /** Escolha única (formato, ritmo, objetivo): tocar de novo desmarca. */
  function choiceRow(doc, h, p, field, values, labels) {
    var row = h.el(doc, 'div', 'memory-chips');
    values.forEach(function (v) {
      row.appendChild(chip(doc, h, Core.labelOr(labels, v), p[field] === v, 'pref-' + field + '-' + v, function () {
        var patch = {};
        patch[field] = p[field] === v ? '' : v;
        h.set(Object.assign({}, p, patch), 'pref-' + field + '-' + v);
      }));
    });
    return row;
  }

  function body(doc, h, data, p) {
    var nodes = [];
    var step = p.step;
    var labelOf = {};
    data.vocabulary.topics.forEach(function (t) { labelOf[t.slug] = t.label; });
    if (step === 'topics') {
      groupTopics(data.vocabulary.topics, suggestedFrom(data.items)).forEach(function (g) {
        nodes.push(h.el(doc, 'p', 'memory-area', g.label));
        var row = h.el(doc, 'div', 'memory-chips');
        g.topics.forEach(function (t) {
          var on = p.topics.indexOf(t.slug) >= 0;
          row.appendChild(chip(doc, h, t.label, on, 'topic-' + t.slug, function () {
            var topics = on ? p.topics.filter(function (x) { return x !== t.slug; }) : p.topics.concat([t.slug]);
            h.set(Object.assign({}, p, { topics: topics }), 'topic-' + t.slug);
          }, t.suggested ? TEXT.suggested : ''));
        });
        nodes.push(row);
      });
    } else if (step === 'levels') {
      p.topics.forEach(function (slug) {
        nodes.push(h.el(doc, 'p', 'memory-area', labelOf[slug] || slug));
        var row = h.el(doc, 'div', 'memory-chips');
        Core.LEVELS.forEach(function (n) {
          var c = chip(doc, h, String(n), p.levels[slug] === n, 'level-' + slug + '-' + n, function () {
            var levels = Object.assign({}, p.levels);
            levels[slug] = n;
            h.set(Object.assign({}, p, { levels: levels }), 'level-' + slug + '-' + n);
          });
          c.setAttribute('aria-label', TEXT.levelFor.replace('{topic}', labelOf[slug] || slug) + ': ' + n + ' – ' + Core.LEVEL_LABEL[n]);
          row.appendChild(c);
        });
        nodes.push(row);
      });
    } else if (step === 'formato' || step === 'ritmo') {
      nodes.push(choiceRow(doc, h, p, step, prefValues(data, step), Core.VALUE_LABEL));
    } else if (step === 'goal') {
      nodes.push(choiceRow(doc, h, p, 'goal', data.vocabulary.goals, Core.GOAL_LABEL));
    } else {
      var withLevel = journeyPayloads(p).filter(function (x) { return x.kind === 'topic_level'; }).length;
      [TEXT.summaryTopics.replace('{n}', String(withLevel)), p.formato ? Core.labelOr(Core.VALUE_LABEL, p.formato) : '', p.ritmo ? Core.labelOr(Core.VALUE_LABEL, p.ritmo) : '', p.goal ? Core.labelOr(Core.GOAL_LABEL, p.goal) : '']
        .filter(Boolean).forEach(function (line) { nodes.push(h.el(doc, 'p', 'memory-lead', line)); });
      if (!journeyPayloads(p).length) nodes.push(h.el(doc, 'p', 'memory-lead', TEXT.summaryNone));
    }
    return nodes;
  }

  /**
   * Tela do passo atual. `h` (de memory.js): el, btn, actions (linha de botões), set(novoPrefs, chaveDeFoco), finish(), end().
   */
  function buildView(doc, h, data, p) {
    var seq = prefSteps(p);
    var idx = Math.max(0, seq.indexOf(p.step));
    var nodes = [h.el(doc, 'p', 'memory-footnote muted', TEXT.progress.replace('{n}', String(idx + 1)).replace('{total}', String(seq.length)))];
    var heading = h.el(doc, 'h4', 'memory-subtitle', TEXT.titles[p.step]);
    heading.setAttribute('tabindex', '-1');
    heading.setAttribute('data-key', 'prefs-title');
    nodes.push(heading, h.el(doc, 'p', 'memory-footnote muted', TEXT.hints[p.step]));
    body(doc, h, data, p).forEach(function (n) { nodes.push(n); });
    var last = p.step === 'summary';
    var buttons = [last ? h.btn(doc, TEXT.finish, '', 'prefs-finish', h.finish) : h.btn(doc, TEXT.next, '', 'prefs-next', function () { h.set(moved(p, 1), 'prefs-title'); })];
    if (idx > 0) buttons.push(h.btn(doc, TEXT.back, 'secondary', 'prefs-back', function () { h.set(moved(p, -1), 'prefs-title'); }));
    if (last) buttons.push(h.btn(doc, TEXT.finishNoSave, 'secondary', 'prefs-finish-nosave', h.end));
    else buttons.push(h.btn(doc, TEXT.skip, 'secondary', 'prefs-skip', function () { h.set(skipped(p), 'prefs-title'); }));
    nodes.push(h.actions(doc, buttons));
    return nodes;
  }

  var api = {
    TEXT: TEXT, groupTopics: groupTopics, suggestedFrom: suggestedFrom, newPrefs: newPrefs, prefSteps: prefSteps,
    journeyPayloads: journeyPayloads, buildView: buildView,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftMemoryJourney = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
