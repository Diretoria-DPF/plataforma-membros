/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/admin-ai.js
 * Painel admin "IA" (Fase 3 — docs/FASE_3_IA_CLINICA.md). Substitui o
 * antigo cartão de saúde da IA do terminal fiscal e
 * reúne:
 *  - auditoria do pool de chaves do Groq (apiAdminAiHealth): percentual
 *    geral e um cartão por chave, só com o final MASCARADO (…abcd) — a
 *    chave nunca sai da Worker;
 *  - uso das últimas 24 h (chamadas, falhas e tokens por recurso);
 *  - cotas diárias por papel (lidas das constantes do servidor);
 *  - moderação do acervo da clínica (apiAdminLearnListPendingCases /
 *    apiAdminLearnReviewCase): casos gerados por IA só aparecem para os
 *    outros depois de aprovados aqui.
 *
 * Mesmo padrão de frontend/messaging.js: script clássico, carregado antes
 * de app.js, que só usa a ponte window.App (h/text/clearEl/setStatus/
 * callApi/getState/openConfirm/formatDate) de DENTRO de funções. Todo dado
 * do servidor — inclusive o texto dos casos, escrito pela IA — entra no
 * DOM só por text()/h() (textContent), nunca innerHTML.
 *
 * A autorização real é do servidor (requireRole admin em cada endpoint);
 * esconder o botão para não-admins é só conveniência de interface.
 */
(function () {
  'use strict';

  function App() {
    if (!window.App) throw new Error('window.App ainda não está pronto (bug de ordem de carregamento).');
    return window.App;
  }

  function $(id) { return document.getElementById(id); }

  function token() {
    var st = App().getState();
    return st && st.sessionToken;
  }

  var FEATURE_LABELS = {
    chat: 'Conversa com o paciente',
    evaluate: 'Avaliação do preceptor',
    generate_case: 'Geração de caso',
    lab_preceptor: 'Preceptor do laboratório',
    health: 'Teste de saúde das chaves',
  };
  var ROLE_LABELS = { visitor: 'Visitante', member: 'Membro', admin: 'Admin' };

  // Contador de geração: descarta respostas que chegam depois de um logout
  // ou de um recarregamento mais novo do painel (mesma ideia de
  // statsRequestId em learning.js).
  var generation = 0;
  var healthBusy = false;

  // ===========================================================================
  // Saúde do pool de chaves
  // ===========================================================================
  function runHealth() {
    if (healthBusy || !token()) return;
    healthBusy = true;
    var gen = generation;
    var btn = $('btn-admin-ai-health');
    if (btn) btn.disabled = true;
    App().setStatus('msg-admin-ai-health', 'Testando cada chave com uma chamada leve ao Groq...', 'info');

    App().callApi('apiAdminAiHealth', token()).then(function (res) {
      if (gen !== generation) return;
      healthBusy = false;
      if (btn) btn.disabled = false;
      if (!res || !res.success) {
        App().setStatus('msg-admin-ai-health', (res && res.message) || 'Não foi possível testar as chaves agora.', 'error');
        return;
      }
      App().setStatus('msg-admin-ai-health', res.configured ? 'Teste concluído às ' + new Date().toLocaleTimeString('pt-BR') + '.' : '', res.configured ? 'success' : null);
      renderHealth(res);
      renderUsage(res.usage24h || []);
      renderConfig(res.config || null);
    });
  }

  function renderHealth(res) {
    var h = App().h;
    var text = App().text;
    var summary = $('admin-ai-health-summary');
    var grid = $('admin-ai-keys');
    if (!summary || !grid) return;
    App().clearEl(summary);
    App().clearEl(grid);

    if (!res.configured) {
      summary.appendChild(text('p', 'Nenhuma chave configurada. Cadastre todas as chaves com `wrangler secret put GROQ_API_KEYS` (uma por linha).', { className: 'empty-state' }));
      return;
    }

    var keys = Array.isArray(res.keys) ? res.keys : [];
    var okCount = keys.filter(function (k) { return k.ok; }).length;
    var pct = Number(res.overallPct) || 0;
    var level = pct >= 80 ? 'ok' : pct >= 40 ? 'warn' : 'down';
    summary.appendChild(h('div', { className: 'ai-health-summary', 'data-level': level }, [
      text('strong', pct + '%'),
      text('span', okCount + ' de ' + keys.length + ' chaves respondendo'),
    ]));

    keys.forEach(function (k) {
      var status = typeof k.status === 'number' ? 'HTTP ' + k.status : String(k.status || '—');
      grid.appendChild(h('div', { className: 'ai-key-card', 'data-ok': k.ok ? 'sim' : 'nao' }, [
        h('div', { className: 'ai-key-card-head' }, [
          text('strong', 'Chave ' + (Number(k.index) + 1)),
          text('span', k.ok ? 'OK' : 'Falhou', { className: 'badge' + (k.ok ? '' : ' banned') }),
        ]),
        text('code', String(k.masked || '…'), { className: 'ai-key-mask', 'aria-label': 'Final da chave' }),
        text('span', status + ' · ' + (Number(k.latencyMs) || 0) + ' ms', { className: 'muted' }),
      ]));
    });
  }

  function renderUsage(rows) {
    var container = $('admin-ai-usage');
    if (!container) return;
    var h = App().h;
    var text = App().text;
    App().clearEl(container);
    if (!rows.length) {
      container.appendChild(text('p', 'Nenhuma chamada à IA nas últimas 24 h.', { className: 'empty-state' }));
      return;
    }
    rows.forEach(function (r) {
      container.appendChild(h('div', { className: 'list-item ai-usage-row' }, [
        text('strong', FEATURE_LABELS[r.feature] || r.feature),
        h('div', { className: 'meta-row' }, [
          text('span', (Number(r.calls) || 0) + ' chamadas'),
          text('span', (Number(r.failures) || 0) + ' falhas'),
          text('span', ((Number(r.promptTokens) || 0) + (Number(r.completionTokens) || 0)).toLocaleString('pt-BR') + ' tokens'),
        ]),
      ]));
    });
  }

  // ===========================================================================
  // Orçamento de tokens e métricas por modelo (Fase 3, apiAdminAiMetrics)
  // ===========================================================================
  function n(value) { return (Number(value) || 0).toLocaleString('pt-BR'); }

  /** Soma as linhas diárias por (recurso, modelo, provedor) no período. */
  function groupMetrics(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      var key = r.feature + '|' + r.model + '|' + r.provider;
      var g = map[key] || (map[key] = { feature: r.feature, model: r.model, provider: r.provider, calls: 0, tokens: 0, cacheHits: 0, rateLimited: 0, latencyTotal: 0 });
      g.calls += Number(r.calls) || 0;
      g.tokens += (Number(r.tokensIn) || 0) + (Number(r.tokensOut) || 0);
      g.cacheHits += Number(r.cacheHits) || 0;
      g.rateLimited += Number(r.rateLimited) || 0;
      g.latencyTotal += (Number(r.avgLatencyMs) || 0) * (Number(r.calls) || 0);
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.tokens - a.tokens; });
  }

  function renderMetrics(res) {
    var container = $('admin-ai-metrics');
    if (!container) return;
    var h = App().h;
    var text = App().text;
    App().clearEl(container);

    var orch = res.orchestratorEnabled ? 'ligado' : 'desligado';
    container.appendChild(h('p', { className: 'muted' }, [
      'Orquestrador (cache e orçamento): ', text('strong', orch),
      res.available === false ? ' · migração 018 ainda não aplicada: sem histórico.' : '',
    ]));

    var b = res.budget;
    if (b && Number(b.budget) > 0) {
      var level = b.exceeded ? 'down' : b.pct >= 80 ? 'warn' : 'ok';
      var meter = h('progress', { max: String(b.budget), value: String(Math.min(b.used, b.budget)), 'aria-label': 'Tokens usados nas últimas 24 horas' });
      container.appendChild(h('div', { className: 'ai-budget', 'data-level': level }, [
        text('strong', n(b.used) + ' de ' + n(b.budget) + ' tokens (' + (Number(b.pct) || 0) + '%)'),
        text('span', 'nas últimas 24 h, só Groq', { className: 'muted' }),
        meter,
      ]));
    }

    var alerts = res.alerts || [];
    if (alerts.length) {
      var list = h('ul', { className: 'ai-alerts', role: 'alert' }, alerts.map(function (a) { return text('li', a.message); }));
      container.appendChild(list);
    }

    if (res.cache) {
      container.appendChild(text('p', 'Cache semântico: ' + n(res.cache.entries) + ' respostas guardadas · ' + n(res.cache.hits) + ' acertos.', { className: 'muted' }));
    }

    var groups = groupMetrics(res.rows);
    if (!groups.length) {
      container.appendChild(text('p', 'Sem chamadas registradas neste período.', { className: 'empty-state' }));
      return;
    }
    var head = ['Recurso', 'Modelo', 'Provedor', 'Chamadas', 'Tokens', 'Cache', '429', 'Latência'];
    var table = h('table', { className: 'ai-metrics-table' }, [
      h('thead', {}, [h('tr', {}, head.map(function (t) { return text('th', t, { scope: 'col' }); }))]),
      h('tbody', {}, groups.map(function (g) {
        return h('tr', {}, [
          text('td', FEATURE_LABELS[g.feature] || g.feature),
          text('td', g.model),
          text('td', g.provider),
          text('td', n(g.calls)),
          text('td', n(g.tokens)),
          text('td', n(g.cacheHits)),
          text('td', n(g.rateLimited)),
          text('td', g.calls ? n(Math.round(g.latencyTotal / g.calls)) + ' ms' : '—'),
        ]);
      })),
    ]);
    container.appendChild(h('div', { className: 'table-scroll' }, [table]));

    var days = res.totals || [];
    var max = days.reduce(function (m, d) { return Math.max(m, d.tokens || 0); }, 0) || 1;
    container.appendChild(h('div', { className: 'ai-days' }, days.slice(0, 30).map(function (d) {
      var bar = h('span', { className: 'ai-day-bar', 'aria-hidden': 'true' });
      bar.style.width = Math.max(2, Math.round(((d.tokens || 0) / max) * 100)) + '%';
      return h('div', { className: 'ai-day' }, [text('span', String(d.day).slice(5), { className: 'muted' }), bar, text('span', n(d.tokens) + ' tokens')]);
    })));
  }

  function loadMetrics(days) {
    if (!token()) return;
    var gen = generation;
    App().setStatus('msg-admin-ai-metrics', 'Carregando…', 'info');
    App().callApi('apiAdminAiMetrics', token(), { days: days || 7 }).then(function (res) {
      if (gen !== generation) return;
      if (!res || !res.success) {
        App().setStatus('msg-admin-ai-metrics', (res && res.message) || 'Não foi possível carregar as métricas da IA.', 'error');
        return;
      }
      App().setStatus('msg-admin-ai-metrics', '', null);
      renderMetrics(res);
    });
  }

  // ===========================================================================
  // Uso do Atlas 3D (Onda 3.5, A.2) — telemetria anônima, só contagens
  // ===========================================================================
  var ATLAS_EVENT_LABELS = {
    app_open: 'Aberturas do atlas',
    structure_view: 'Estruturas vistas',
    quiz_finish: 'Quizzes concluídos',
    search: 'Buscas',
    error_js: 'Erros de JavaScript',
    session_end: 'Fins de sessão',
  };

  function renderAtlasUsage(res) {
    var container = $('admin-ai-atlas');
    if (!container) return;
    var h = App().h;
    var text = App().text;
    App().clearEl(container);
    if (res.unavailable) {
      container.appendChild(text('p', 'A tabela de telemetria ainda não foi criada (sql/014_atlas_telemetry.sql).', { className: 'empty-state' }));
      return;
    }
    var totals = res.totals || {};
    var any = Object.keys(ATLAS_EVENT_LABELS).some(function (k) { return Number(totals[k]) > 0; });
    if (!any) {
      container.appendChild(text('p', 'Nenhum evento nos últimos ' + res.days + ' dias. A coleta fica desligada até a flag "telemetry" do atlas ser ligada.', { className: 'empty-state' }));
      return;
    }
    container.appendChild(h('div', { className: 'meta-row' }, [
      text('span', 'Últimos ' + res.days + ' dias'),
      text('span', (Number(res.sessions) || 0) + ' sessões distintas'),
    ]));
    Object.keys(ATLAS_EVENT_LABELS).forEach(function (key) {
      container.appendChild(h('div', { className: 'list-item ai-usage-row' }, [
        text('strong', ATLAS_EVENT_LABELS[key]),
        h('div', { className: 'meta-row' }, [text('span', (Number(totals[key]) || 0).toLocaleString('pt-BR'))]),
      ]));
    });
    (res.byDay || []).slice(-7).forEach(function (d) {
      var ev = d.events || {};
      container.appendChild(h('div', { className: 'list-item ai-usage-row' }, [
        text('strong', String(d.day || '')),
        h('div', { className: 'meta-row' }, Object.keys(ATLAS_EVENT_LABELS).filter(function (k) { return ev[k]; }).map(function (k) {
          return text('span', ATLAS_EVENT_LABELS[k] + ': ' + ev[k]);
        })),
      ]));
    });
  }

  function loadAtlasUsage(days) {
    if (!token()) return;
    var gen = generation;
    App().setStatus('msg-admin-ai-atlas', 'Carregando…', 'info');
    App().callApi('apiAdminLearnAtlasTelemetry', token(), { days: days || 7 }).then(function (res) {
      if (gen !== generation) return;
      if (!res || !res.success) {
        App().setStatus('msg-admin-ai-atlas', (res && res.message) || 'Não foi possível carregar o uso do atlas.', 'error');
        return;
      }
      App().setStatus('msg-admin-ai-atlas', '', null);
      renderAtlasUsage(res);
    });
  }

  function renderConfig(config) {
    var container = $('admin-ai-quotas');
    if (!container || !config) return;
    var h = App().h;
    var text = App().text;
    App().clearEl(container);

    if (config.models) {
      container.appendChild(text('p', 'Modelos: rápido = ' + config.models.fast + ' · forte = ' + config.models.smart, { className: 'muted' }));
    }
    var quotas = config.quotas || {};
    var features = Object.keys(quotas);
    if (features.length) {
      var roles = ['visitor', 'member', 'admin'];
      // Tabela com rolagem própria: nunca estoura a largura em 360 px.
      container.appendChild(h('div', { className: 'ai-table-wrap' }, [
        h('table', { className: 'data-table' }, [
          h('thead', {}, [h('tr', {}, [text('th', 'Recurso')].concat(roles.map(function (r) { return text('th', ROLE_LABELS[r]); })))]),
          h('tbody', {}, features.map(function (f) {
            return h('tr', {}, [text('td', FEATURE_LABELS[f] || f)].concat(roles.map(function (r) {
              return text('td', quotas[f] && quotas[f][r] !== undefined ? String(quotas[f][r]) : '—');
            })));
          })),
        ]),
      ]));
    }
    if (config.globalDailyMax) {
      container.appendChild(text('p', 'Disjuntor global: até ' + config.globalDailyMax + ' chamadas por dia somando toda a liga.', { className: 'muted' }));
    }
  }

  // ===========================================================================
  // Moderação do acervo
  // ===========================================================================
  /** `keepStatus`: depois de uma revisão, mantém visível a mensagem do resultado. */
  function loadPending(keepStatus) {
    if (!token()) return;
    var gen = generation;
    var keep = keepStatus === true;
    if (!keep) App().setStatus('msg-admin-ai-cases', 'Carregando casos pendentes...', 'info');
    App().callApi('apiAdminLearnListPendingCases', token()).then(function (res) {
      if (gen !== generation) return;
      if (!res || !res.success) {
        App().setStatus('msg-admin-ai-cases', (res && res.message) || 'Não foi possível carregar os casos pendentes.', 'error');
        return;
      }
      if (!keep) App().setStatus('msg-admin-ai-cases', '', null);
      App().renderList('admin-ai-pending', res.cases || [], renderPendingCase, 'Nenhum caso aguardando revisão.');
    });
  }

  function summaryLine(label, value) {
    if (!value) return null;
    return App().h('p', { className: 'ai-case-line' }, [App().text('strong', label + ': '), String(value)]);
  }

  function renderPendingCase(item) {
    var h = App().h;
    var text = App().text;
    var s = item.summary || {};

    function decide(decision) {
      var verb = decision === 'approved' ? 'Aprovar e publicar no acervo' : 'Rejeitar';
      App().openConfirm(verb + ' o caso "' + (item.title || 'sem título') + '"?', function () {
        App().callApi('apiAdminLearnReviewCase', token(), { caseId: item.id, decision: decision }).then(function (res) {
          App().setStatus('msg-admin-ai-cases', (res && res.message) || (res && res.success ? 'Feito.' : 'Não foi possível concluir.'), res && res.success ? 'success' : 'error');
          loadPending(true);
        });
      });
    }

    return h('div', { className: 'list-item ai-case' }, [
      text('strong', item.title || 'Caso sem título'),
      h('div', { className: 'meta-row' }, [
        text('span', item.toxindrome || 'Outra', { className: 'badge' }),
        item.agent ? text('span', item.agent) : null,
        s.difficulty ? text('span', s.difficulty) : null,
        text('span', 'Gerado por ' + (item.createdByName || 'conta removida') + ' · ' + App().formatDate(item.createdAt)),
      ]),
      summaryLine('Paciente', s.patient),
      summaryLine('Queixa', s.chiefComplaint),
      summaryLine('Exposição real', s.hiddenExposure),
      summaryLine('Diagnóstico (gabarito)', s.diagnosis),
      summaryLine('Conduta (gabarito)', s.conduct),
      s.examsCount ? text('p', s.examsCount + ' exames cadastrados.', { className: 'muted' }) : null,
      h('div', { className: 'actions-row' }, [
        h('button', { type: 'button', onclick: function () { decide('approved'); } }, ['Aprovar']),
        h('button', { type: 'button', className: 'danger', onclick: function () { decide('rejected'); } }, ['Rejeitar']),
      ]),
    ]);
  }

  // ===========================================================================
  // Ciclo de vida
  // ===========================================================================
  // ===========================================================================
  // Satisfação da Lia (avaliações dos membros, apiAdminAssistantStats e
  // apiAdminListAssistantFeedback). Só texto no DOM; cada item é revisado aqui.
  // ===========================================================================
  var SAT_CATEGORY_LABELS = { incorreta: 'Incorreta', incompleta: 'Incompleta', confusa: 'Confusa', ofensiva: 'Ofensiva', outra: 'Outra', sem_categoria: 'Sem categoria' };
  var SAT_STATUS_LABELS = { new: 'Novo', reviewed: 'Revisado', dismissed: 'Descartado' };
  var SAT_PAGE_SIZE = 20;
  var SAT_ANSWER_MAX = 300;
  var satDays = 7;
  var satCursor = null;
  var satFilters = { status: '', rating: '' };
  var satSeq = 0;

  function clipText(value, max) {
    var s = String(value || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  /** O servidor manda a utilidade como fração (0 a 1) ou null sem avaliações. */
  function satPercent(rate) {
    return typeof rate === 'number' ? Math.round(rate * 100) + '%' : '—';
  }

  function renderSatTotals(res) {
    var container = $('admin-ai-sat-totals');
    if (!container) return;
    var h = App().h;
    var text = App().text;
    App().clearEl(container);
    var t = res.totals || {};
    if (!t.total) {
      container.appendChild(text('p', 'Nenhuma avaliação nos últimos ' + satDays + ' dias.', { className: 'empty-state' }));
      return;
    }
    container.appendChild(h('div', { className: 'ai-budget' }, [
      text('strong', 'Utilidade: ' + satPercent(t.utilityRate)),
      text('span', n(t.up) + ' úteis · ' + n(t.down) + ' não úteis · ' + n(t.total) + ' avaliações nos últimos ' + satDays + ' dias', { className: 'muted' }),
    ]));
  }

  function renderSatCategories(rows) {
    var container = $('admin-ai-sat-categories');
    if (!container) return;
    var h = App().h;
    var text = App().text;
    App().clearEl(container);
    rows.forEach(function (r) {
      container.appendChild(h('div', { className: 'list-item ai-usage-row' }, [
        text('strong', SAT_CATEGORY_LABELS[r.category] || r.category),
        h('div', { className: 'meta-row' }, [text('span', n(r.up) + ' úteis'), text('span', n(r.down) + ' não úteis')]),
      ]));
    });
  }

  function renderSatDays(rows) {
    var container = $('admin-ai-sat-days');
    if (!container) return;
    var h = App().h;
    var text = App().text;
    App().clearEl(container);
    var totalOf = function (d) { return (Number(d.up) || 0) + (Number(d.down) || 0); };
    var max = rows.reduce(function (m, d) { return Math.max(m, totalOf(d)); }, 0) || 1;
    container.appendChild(h('div', { className: 'ai-days' }, rows.slice(-30).map(function (d) {
      var bar = h('span', { className: 'ai-day-bar', 'aria-hidden': 'true' });
      bar.style.width = Math.max(2, Math.round((totalOf(d) / max) * 100)) + '%';
      return h('div', { className: 'ai-day' }, [
        text('span', String(d.day).slice(5), { className: 'muted' }),
        bar,
        text('span', n(d.up) + ' úteis · ' + n(d.down) + ' não'),
      ]);
    })));
  }

  function loadSatisfaction(days) {
    if (!token()) return;
    satDays = days || 7;
    var gen = generation;
    App().setStatus('msg-admin-ai-sat', 'Carregando…', 'info');
    App().callApi('apiAdminAssistantStats', token(), { days: satDays }).then(function (res) {
      if (gen !== generation) return;
      if (!res || !res.success) {
        App().setStatus('msg-admin-ai-sat', (res && res.message) || 'Não foi possível carregar a satisfação da Lia.', 'error');
        return;
      }
      App().setStatus('msg-admin-ai-sat', '', null);
      renderSatTotals(res);
      renderSatCategories(res.byCategory || []);
      renderSatDays(res.byDay || []);
    });
  }

  function satButton(label, onClick, danger) {
    var button = App().h('button', { type: 'button', className: danger ? 'danger' : 'secondary' }, [label]);
    button.addEventListener('click', onClick);
    return button;
  }

  /** Após 90 dias o servidor apaga o texto e manda commentAnonymizedAt: mostra o aviso, nunca o texto. */
  function satCommentLine(item) {
    if (item.commentAnonymizedAt) return App().text('p', 'Comentário apagado após 90 dias', { className: 'ai-case-line muted' });
    return summaryLine('Comentário', item.comment);
  }

  function satItemNode(item) {
    var h = App().h;
    var text = App().text;
    var answer = item.answer || {};
    var author = item.author && item.author.username ? 'De ' + item.author.username : 'Conta removida';
    var head = (item.rating === 'up' ? 'Útil' : 'Não útil') + (item.category ? ' · ' + (SAT_CATEGORY_LABELS[item.category] || item.category) : '');
    var buttons = [];
    if (item.status !== 'reviewed') buttons.push(satButton('Marcar revisado', function () { decideSat(item, 'reviewed'); }, false));
    if (item.status !== 'dismissed') buttons.push(satButton('Descartar', function () { decideSat(item, 'dismissed'); }, true));
    return h('div', { className: 'list-item ai-case' }, [
      text('strong', head),
      h('div', { className: 'meta-row' }, [
        text('span', SAT_STATUS_LABELS[item.status] || item.status, { className: 'badge' }),
        answer.degraded ? text('span', 'Resposta aproximada') : null,
        text('span', author + ' · ' + App().formatDate(item.createdAt)),
      ]),
      summaryLine('Assunto', answer.topic),
      summaryLine('Resposta da Lia', clipText(answer.text, SAT_ANSWER_MAX)),
      summaryLine('Origem', answer.source),
      satCommentLine(item),
      buttons.length ? h('div', { className: 'actions-row' }, buttons) : null,
    ]);
  }

  function satListParams(reset) {
    var params = { limit: SAT_PAGE_SIZE };
    if (satFilters.status) params.status = satFilters.status;
    if (satFilters.rating) params.rating = satFilters.rating;
    if (!reset && satCursor) params.cursor = satCursor;
    return params;
  }

  function renderSatItems(items, reset) {
    var list = $('admin-ai-sat-list');
    if (!list) return;
    if (reset) App().clearEl(list);
    if (reset && !items.length) list.appendChild(App().text('p', 'Nenhuma avaliação com esses filtros.', { className: 'empty-state' }));
    items.forEach(function (item) { list.appendChild(satItemNode(item)); });
  }

  /** `reset`: volta à primeira página. `keepStatus`: mantém a mensagem de uma revisão. */
  function loadSatList(reset, keepStatus) {
    if (!token()) return;
    var gen = generation;
    var mine = ++satSeq;
    if (reset) satCursor = null;
    if (!keepStatus) App().setStatus('msg-admin-ai-sat', 'Carregando…', 'info');
    App().callApi('apiAdminListAssistantFeedback', token(), satListParams(reset)).then(function (res) {
      if (gen !== generation || mine !== satSeq) return;
      if (!res || !res.success) {
        App().setStatus('msg-admin-ai-sat', (res && res.message) || 'Não foi possível carregar as avaliações.', 'error');
        return;
      }
      if (!keepStatus) App().setStatus('msg-admin-ai-sat', '', null);
      renderSatItems(res.items || [], reset);
      satCursor = res.nextCursor || null;
      var more = $('btn-admin-ai-sat-more');
      if (more) more.classList.toggle('hidden', !satCursor);
    });
  }

  function decideSat(item, status) {
    var question = status === 'reviewed' ? 'Marcar esta avaliação como revisada?' : 'Descartar esta avaliação?';
    App().openConfirm(question, function () {
      App().callApi('apiAdminUpdateAssistantFeedback', token(), { id: item.id, status: status }).then(function (res) {
        var ok = !!res && res.success === true;
        App().setStatus('msg-admin-ai-sat', (res && res.message) || (ok ? 'Feito.' : 'Não foi possível concluir.'), ok ? 'success' : 'error');
        loadSatList(true, true);
      });
    });
  }

  function loadSatAll(days) {
    loadSatisfaction(days);
    loadSatList(true, false);
  }

  var bound = false;

  function loadPanel() {
    if (!bound) {
      bound = true;
      var btn = $('btn-admin-ai-health');
      if (btn) btn.addEventListener('click', runHealth);
      var refresh = $('btn-admin-ai-cases-refresh');
      if (refresh) refresh.addEventListener('click', function () { loadPending(false); });
      var d7 = $('btn-admin-ai-atlas-7');
      var d30 = $('btn-admin-ai-atlas-30');
      if (d7) d7.addEventListener('click', function () { loadAtlasUsage(7); });
      if (d30) d30.addEventListener('click', function () { loadAtlasUsage(30); });
      var m7 = $('btn-admin-ai-metrics-7');
      var m30 = $('btn-admin-ai-metrics-30');
      if (m7) m7.addEventListener('click', function () { loadMetrics(7); });
      if (m30) m30.addEventListener('click', function () { loadMetrics(30); });
      bindSatisfaction();
    }
    runHealth();
    loadMetrics(7);
    loadPending(false);
    loadAtlasUsage(7);
    loadSatAll(7);
  }

  function bindSatisfaction() {
    var s7 = $('btn-admin-ai-sat-7');
    var s30 = $('btn-admin-ai-sat-30');
    if (s7) s7.addEventListener('click', function () { loadSatAll(7); });
    if (s30) s30.addEventListener('click', function () { loadSatAll(30); });
    var status = $('admin-ai-sat-status');
    var rating = $('admin-ai-sat-rating');
    if (status) status.addEventListener('change', function () { satFilters.status = status.value; loadSatList(true, false); });
    if (rating) rating.addEventListener('change', function () { satFilters.rating = rating.value; loadSatList(true, false); });
    var more = $('btn-admin-ai-sat-more');
    if (more) more.addEventListener('click', function () { loadSatList(false, false); });
  }

  /** Logout/expiração: descarta respostas pendentes e limpa o que foi exibido. */
  function reset() {
    generation++;
    healthBusy = false;
    var btn = $('btn-admin-ai-health');
    if (btn) btn.disabled = false;
    ['admin-ai-health-summary', 'admin-ai-keys', 'admin-ai-usage', 'admin-ai-metrics', 'admin-ai-quotas', 'admin-ai-pending', 'admin-ai-atlas',
      'admin-ai-sat-totals', 'admin-ai-sat-categories', 'admin-ai-sat-days', 'admin-ai-sat-list'].forEach(function (id) {
      var el = $(id);
      if (el && window.App) App().clearEl(el);
    });
    ['msg-admin-ai-health', 'msg-admin-ai-metrics', 'msg-admin-ai-cases', 'msg-admin-ai-atlas', 'msg-admin-ai-sat'].forEach(function (id) {
      if (window.App) App().setStatus(id, '', null);
    });
    satCursor = null;
    var more = $('btn-admin-ai-sat-more');
    if (more) more.classList.add('hidden');
  }

  window.LaiftAdminAi = { loadPanel: loadPanel, reset: reset };
})();
