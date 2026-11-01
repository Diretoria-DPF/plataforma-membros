/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * laift-review-seal.js — selo discreto ⓘ "ainda não revisada por profissional" (CON-01).
 *
 *   LaiftReviewSeal.reviewState(item, { whenMissing }) -> 'reviewed' | 'unreviewed' | 'unknown'
 *   LaiftReviewSeal.create(item, ctx, { whenMissing }) -> <button> | null
 *   LaiftReviewSeal.buildReportMessage(ctx)            -> string
 *
 * O estado vem só do dado que existe (nada é inventado): revisor em `reviewed_by` / `reviewedBy` /
 * `reviewer` / `review.by`, ou `review.status` em reviewed|approved => revisada. `review.status` com outro
 * valor (auto-draft, legacy-unverified, editorial) => sem revisor. Sem nenhum campo de revisão o estado é
 * 'unknown' (sem selo), a menos que o chamador assuma `whenMissing: 'unreviewed'` — caso do banco de
 * questões, que não traz o campo e cujo critério de auditoria (CON-01) é "sem fonte/revisor".
 *
 * Ao tocar, abre a explicação num LaiftDialog.confirm com o botão "Reportar erro", que envia uma
 * mensagem curta (módulo, id, tópico, trecho) pelo feedback que já existe (apiSubmitFeedback), via
 * LaiftApi.reportContent (laift-identity.js -> App.submitContentReport). O token nunca chega ao módulo.
 * Só textContent; nenhum script inline (CSP). Script clássico; precisa de laift-dialog.js antes.
 */
(function (global) {
  'use strict';

  var REVIEWED_STATUS = ['reviewed', 'approved'];
  var MESSAGE_MAX = 600;
  var EXCERPT_MAX = 160;
  var TITLE = 'Ainda não revisada por profissional';
  var SEND_FAILED = 'Não foi possível enviar agora. Tente novamente em instantes.';

  function reviewState(item, opts) {
    if (!item || typeof item !== 'object') return 'unknown';
    var review = item.review && typeof item.review === 'object' ? item.review : null;
    if (item.reviewed_by || item.reviewedBy || item.reviewer || (review && review.by)) return 'reviewed';
    if (review && REVIEWED_STATUS.indexOf(review.status) !== -1) return 'reviewed';
    if (review && review.status) return 'unreviewed';
    return opts && opts.whenMissing === 'unreviewed' ? 'unreviewed' : 'unknown';
  }

  function clean(value, max) {
    var text = String(value === undefined || value === null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function buildReportMessage(ctx) {
    ctx = ctx || {};
    var parts = ['[Erro de conteúdo] ' + clean(ctx.kind || 'conteúdo', 20)];
    if (ctx.module) parts.push('módulo: ' + clean(ctx.module, 60));
    if (ctx.id !== undefined && ctx.id !== null && ctx.id !== '') parts.push('id: ' + clean(ctx.id, 60));
    if (ctx.topic) parts.push('tópico: ' + clean(ctx.topic, 80));
    if (ctx.excerpt) parts.push('trecho: "' + clean(ctx.excerpt, EXCERPT_MAX) + '"');
    return clean(parts.join(' · '), MESSAGE_MAX);
  }

  function explanation(kind) {
    return 'Esta ' + kind + ' ainda não foi revisada por um profissional da área e pode conter erros. '
      + 'Confira em fonte oficial antes de usar em decisões clínicas ou em prova.\n\n'
      + 'Achou algo errado? Toque em "Reportar erro" e a diretoria recebe o aviso.';
  }

  function send(ctx) {
    var dialog = global.LaiftDialog;
    var api = global.LaiftApi;
    if (!api || typeof api.reportContent !== 'function') return dialog.alert(SEND_FAILED);
    return Promise.resolve(api.reportContent(buildReportMessage(ctx))).then(function (res) {
      var ok = res && res.success === true;
      var message = res && typeof res.message === 'string' && res.message ? res.message : null;
      return dialog.alert(message || (ok ? 'Obrigado! Seu relato foi enviado.' : SEND_FAILED));
    }, function () { return dialog.alert(SEND_FAILED); });
  }

  function open(ctx) {
    var kind = (ctx && ctx.kind) || 'questão';
    return global.LaiftDialog.confirm(explanation(kind), { title: TITLE, okLabel: 'Reportar erro', cancelLabel: 'Fechar' })
      .then(function (wantsToReport) { return wantsToReport ? send(ctx) : undefined; });
  }

  function create(item, ctx, opts) {
    if (reviewState(item, opts) !== 'unreviewed') return null;
    if (!global.LaiftDialog || !global.document) return null;
    var btn = global.document.createElement('button');
    btn.type = 'button';
    btn.className = 'laift-review-seal';
    btn.textContent = 'ⓘ';
    btn.setAttribute('aria-label', TITLE + '. Toque para saber mais ou reportar erro.');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.addEventListener('click', function () { return open(ctx); });
    return btn;
  }

  global.LaiftReviewSeal = { reviewState: reviewState, create: create, buildReportMessage: buildReportMessage };
})(typeof window !== 'undefined' ? window : globalThis);
