/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * laift-review-seal.js — "Reportar erro" de conteúdo (CON-01). Não exibe selo nem texto sobre revisão.
 *
 *   LaiftReviewSeal.reviewState(item, { whenMissing }) -> 'reviewed' | 'unreviewed' | 'unknown'   (uso interno)
 *   LaiftReviewSeal.report(ctx)                        -> Promise (confirma e envia o aviso de erro)
 *   LaiftReviewSeal.buildReportMessage(ctx)            -> string
 *
 * reviewState lê só o dado que existe (revisor em `reviewed_by` / `reviewedBy` / `reviewer` / `review.by`, ou
 * `review.status`); serve à gestão e nunca é mostrado ao público. O aviso usa o feedback que já existe
 * (apiSubmitFeedback), via LaiftApi.reportContent (laift-identity.js -> App.submitContentReport); o token nunca
 * chega ao módulo. Só textContent; nenhum script inline (CSP). Script clássico; precisa de laift-dialog.js antes.
 */
(function (global) {
  'use strict';

  var REVIEWED_STATUS = ['reviewed', 'approved'];
  var MESSAGE_MAX = 600;
  var EXCERPT_MAX = 160;
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

  /** Aviso de erro iniciado pela pessoa (sem qualquer texto sobre estado de revisão): confirma e envia. */
  function report(ctx) {
    var kind = (ctx && ctx.kind) || 'questão';
    if (!global.LaiftDialog) return Promise.resolve();
    return global.LaiftDialog.confirm('Enviar um aviso de erro sobre esta ' + kind + ' para a diretoria?',
      { title: 'Reportar erro', okLabel: 'Enviar aviso', cancelLabel: 'Cancelar' })
      .then(function (ok) { return ok ? send(ctx) : undefined; });
  }

  global.LaiftReviewSeal = { reviewState: reviewState, report: report, buildReportMessage: buildReportMessage };
})(typeof window !== 'undefined' ? window : globalThis);
