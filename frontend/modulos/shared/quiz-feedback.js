/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * quiz-feedback.js — microinteração de acerto/erro dos simulados (ENG-05; docs/engajamento.md).
 *
 *   LaiftQuizFeedback.isVibrationEnabled(storage) -> boolean   preferência "Vibração" (padrão: ligada)
 *   LaiftQuizFeedback.setVibrationEnabled(storage, on)         grava a preferência (Perfil -> Preferências)
 *   LaiftQuizFeedback.vibrate(win)                             navigator.vibrate(10) quando disponível
 *   LaiftQuizFeedback.respond(win, option)                     animação curta (classe) + vibração
 *
 * A animação é só CSS (quiz-engine.css, classe `feedback-pop`), dentro de prefers-reduced-motion:
 * no-preference; com movimento reduzido nada anima e nada vibra. Sem som. A preferência fica em
 * localStorage (mesma origem da plataforma e dos módulos); storage bloqueado nunca lança e vale o
 * padrão (ligada). Script clássico; o motor (quiz-engine.js) usa se estiver presente.
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'laift_vibration';
  var OFF = '0';
  var ON = '1';
  var VIBRATE_MS = 10;
  var POP_CLASS = 'feedback-pop';
  var POP_CLEAR_MS = 400;
  var REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

  function isVibrationEnabled(storage) {
    try { return !storage || storage.getItem(STORAGE_KEY) !== OFF; }
    catch (err) { return true; }
  }

  function setVibrationEnabled(storage, on) {
    try { if (storage) storage.setItem(STORAGE_KEY, on ? ON : OFF); }
    catch (err) { /* storage bloqueado: vale o padrão */ }
  }

  function browserStorage(win) {
    try { return (win && win.localStorage) || null; }
    catch (err) { return null; }
  }

  function prefersReducedMotion(win) {
    try { return !!(win && typeof win.matchMedia === 'function' && win.matchMedia(REDUCED_MOTION_QUERY).matches); }
    catch (err) { return false; }
  }

  /** Vibração curta. Devolve true se pediu ao aparelho; nunca lança. */
  function vibrate(win) {
    if (prefersReducedMotion(win) || !isVibrationEnabled(browserStorage(win))) return false;
    var nav = win && win.navigator;
    if (!nav || typeof nav.vibrate !== 'function') return false;
    try { return nav.vibrate(VIBRATE_MS) !== false; }
    catch (err) { return false; }
  }

  /** Marca a alternativa para a animação (reinicia se já estava marcada) e vibra. */
  function respond(win, option) {
    if (option && option.classList && !prefersReducedMotion(win)) {
      option.classList.remove(POP_CLASS);
      if (typeof option.offsetWidth !== 'undefined') void option.offsetWidth; // reflow: reinicia a animação
      option.classList.add(POP_CLASS);
      if (typeof win.setTimeout === 'function') win.setTimeout(function () { option.classList.remove(POP_CLASS); }, POP_CLEAR_MS);
    }
    return vibrate(win);
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    VIBRATE_MS: VIBRATE_MS,
    POP_CLASS: POP_CLASS,
    isVibrationEnabled: isVibrationEnabled,
    setVibrationEnabled: setVibrationEnabled,
    vibrate: vibrate,
    respond: respond,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftQuizFeedback = api;
})(typeof window !== 'undefined' ? window : globalThis);
