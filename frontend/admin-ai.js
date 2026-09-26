/**
 * frontend/admin-ai.js
 * Painel admin "IA" (Fase 3 — docs/FASE_3_IA_CLINICA.md). Substitui o
 * cartão de saúde da IA que ficava no terminal fiscal (Apps Script) e
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
  var bound = false;

  function loadPanel() {
    if (!bound) {
      bound = true;
      var btn = $('btn-admin-ai-health');
      if (btn) btn.addEventListener('click', runHealth);
      var refresh = $('btn-admin-ai-cases-refresh');
      if (refresh) refresh.addEventListener('click', function () { loadPending(false); });
    }
    runHealth();
    loadPending(false);
  }

  /** Logout/expiração: descarta respostas pendentes e limpa o que foi exibido. */
  function reset() {
    generation++;
    healthBusy = false;
    var btn = $('btn-admin-ai-health');
    if (btn) btn.disabled = false;
    ['admin-ai-health-summary', 'admin-ai-keys', 'admin-ai-usage', 'admin-ai-quotas', 'admin-ai-pending'].forEach(function (id) {
      var el = $(id);
      if (el && window.App) App().clearEl(el);
    });
    ['msg-admin-ai-health', 'msg-admin-ai-cases'].forEach(function (id) {
      if (window.App) App().setStatus(id, '', null);
    });
  }

  window.LaiftAdminAi = { loadPanel: loadPanel, reset: reset };
})();
