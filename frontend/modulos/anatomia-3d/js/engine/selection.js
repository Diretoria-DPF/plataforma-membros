/**
 * @file selection.js
 * @description Módulo de controle do ciclo de seleção anatômica do Atlas 3D LAIFT.
 * Elimina condições de corrida em seleções rápidas por sequenciamento de requisição e AbortController.
 */

import { AppBus } from '../core/bus.js';

class SelectionManager {
  // [INÍCIO MÉTODO: constructor]
  constructor() {
    /** @type {string|null} SID da estrutura atualmente ativa */
    this.currentSid = null;
    /** @type {string|null} SID da estrutura selecionada anteriormente */
    this.previousSid = null;
    /** @type {number} Contador incremental de sequência de requisição */
    this.sequenceCounter = 0;
    /** @type {AbortController|null} Controlador de aborto da requisição ativa */
    this.activeAbortController = null;
    /** @type {boolean} Trava de interação durante transições cinematográficas */
    this.locked = false;
  }
  // [FIM MÉTODO: constructor]

  // [INÍCIO MÉTODO: setLocked]
  /**
   * Ativa ou desativa a trava de seleção.
   * @param {boolean} isLocked
   */
  setLocked(isLocked) {
    this.locked = Boolean(isLocked);
  }
  // [FIM MÉTODO: setLocked]

  // [INÍCIO MÉTODO: isLocked]
  /**
   * Informa se o motor de seleção está bloqueado temporariamente.
   * @returns {boolean}
   */
  isLocked() {
    return this.locked;
  }
  // [FIM MÉTODO: isLocked]

  // [INÍCIO MÉTODO: beginSelection]
  /**
   * Inicia um novo ciclo de seleção, cancelando ativamente qualquer requisição anterior.
   * @param {string} sid - Identificador canônico da estrutura.
   * @param {Object} [options={}] - Parâmetros opcionais (ex: focusCamera, silent).
   * @returns {{ sequence: number, signal: AbortSignal } | null}
   */
  beginSelection(sid, options = {}) {
    if (this.locked) {
      return null;
    }

    const cleanSid = sid ? String(sid).trim() : null;
    if (!cleanSid) {
      this.clearSelection();
      return null;
    }

    // Cancela imediatamente a requisição assíncrona anterior que esteja pendente
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    // Cria novo controlador para a seleção atual
    this.activeAbortController = new AbortController();
    this.sequenceCounter++;
    const currentSequence = this.sequenceCounter;

    this.previousSid = this.currentSid;
    this.currentSid = cleanSid;

    // Emite notificação de início de seleção no barramento global
    AppBus.emit('selection:starting', {
      sid: cleanSid,
      previousSid: this.previousSid,
      sequence: currentSequence,
      options
    });

    return {
      sequence: currentSequence,
      signal: this.activeAbortController.signal
    };
  }
  // [FIM MÉTODO: beginSelection]

  // [INÍCIO MÉTODO: isValidSequence]
  /**
   * Avalia se uma resposta assíncrona que acabou de chegar ainda é válida.
   * Descarta requisições obsoletas que foram ultrapassadas por uma seleção posterior.
   * @param {number} sequence - Número sequencial recebido no beginSelection.
   * @returns {boolean}
   */
  isValidSequence(sequence) {
    if (this.sequenceCounter !== sequence) {
      return false;
    }
    if (this.activeAbortController && this.activeAbortController.signal.aborted) {
      return false;
    }
    return true;
  }
  // [FIM MÉTODO: isValidSequence]

  // [INÍCIO MÉTODO: commitSelection]
  /**
   * Consolida a seleção com a estrutura normalizada e o conteúdo educacional resolvido.
   * @param {Object} entry - StructureEntry canônico.
   * @param {Object|null} content - Ficha de conteúdo resolvida.
   * @param {number} sequence - Número da sequência em processamento.
   */
  commitSelection(entry, content, sequence) {
    if (!this.isValidSequence(sequence)) {
      // Ignora desfecho de promessas defasadas
      return;
    }

    AppBus.emit('selection:resolved', {
      sid: entry.sid,
      entry,
      content,
      sequence
    });
  }
  // [FIM MÉTODO: commitSelection]

  // [INÍCIO MÉTODO: failSelection]
  /**
   * Registra a falha de recuperação dos dados de uma seleção ativa.
   * @param {string} sid
   * @param {Error} error
   * @param {number} sequence
   */
  failSelection(sid, error, sequence) {
    if (!this.isValidSequence(sequence)) {
      return;
    }

    if (error && error.name === 'AbortError') {
      // Cancelamento planejado por nova seleção; não emite erro de UI
      return;
    }

    AppBus.emit('selection:failed', {
      sid,
      error,
      sequence
    });
  }
  // [FIM MÉTODO: failSelection]

  // [INÍCIO MÉTODO: clearSelection]
  /**
   * Limpa integralmente a seleção corrente, aborta requisições e avisa o barramento.
   */
  clearSelection() {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    this.sequenceCounter++;
    this.previousSid = this.currentSid;
    this.currentSid = null;

    AppBus.emit('selection:cleared', {
      previousSid: this.previousSid,
      sequence: this.sequenceCounter
    });
  }
  // [FIM MÉTODO: clearSelection]

  // [INÍCIO MÉTODO: getSelectedSid]
  /**
   * Retorna o SID da estrutura anatômica selecionada no momento.
   * @returns {string|null}
   */
  getSelectedSid() {
    return this.currentSid;
  }
  // [FIM MÉTODO: getSelectedSid]

  // [INÍCIO MÉTODO: getPreviousSid]
  /**
   * Retorna o SID da estrutura anatômica selecionada antes da atual.
   * @returns {string|null}
   */
  getPreviousSid() {
    return this.previousSid;
  }
  // [FIM MÉTODO: getPreviousSid]
}

export const EngineSelection = new SelectionManager();
