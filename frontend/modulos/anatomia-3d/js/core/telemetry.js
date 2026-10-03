/**
 * telemetry.js — uso anônimo do atlas (Onda 3.5, A.2).
 * ---------------------------------------------------------------------------
 * Liga-se ao barramento e junta eventos numa fila, enviada em lote pela ponte
 * da plataforma (`LaiftApi.call('apiLearnAtlasTelemetry', …)`) a cada 30 s e
 * quando a aba é escondida ou fechada. Sem PII, por desenho:
 *  - o id da sessão é aleatório e novo a cada abertura da aba;
 *  - a busca envia só o TAMANHO do texto e a contagem de resultados;
 *  - erros de JS enviam um código e a mensagem sem URLs nem e-mails, cortada;
 *  - a Worker ainda descarta qualquer chave fora da lista do evento.
 * Só roda com a flag `telemetry` (js/core/flags.js). Falha de envio é ignorada:
 * nada aqui pode afetar o atlas. Aviso ao aluno: "Meu Estudo" (js/modes/study.js).
 */

export const FLUSH_MS = 30000;
export const BATCH_MAX = 50;
export const QUEUE_MAX = 100;
export const ERRORS_MAX = 10;

/** Id aleatório da sessão (16 caracteres base36), sem relação com a pessoa. */
export function newSessionId(cryptoObj) {
  const bytes = new Uint8Array(12);
  if (cryptoObj && cryptoObj.getRandomValues) cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

/** Mensagem de erro sem URL, e-mail nem caminho, em até 120 caracteres. */
export function scrubMessage(msg) {
  return String(msg == null ? '' : msg)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\S+@\S+\.\S+/g, '[email]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function createTelemetry({ bus, api, flags, win = typeof window !== 'undefined' ? window : null, now = () => Date.now(), flushMs = FLUSH_MS, getMode = () => '' }) {
  const inert = { enabled: false, flush: async () => 0, destroy: () => {}, sessionId: '' };
  if (!flags || !flags.telemetry || !bus || !api || typeof api.call !== 'function' || !win) return inert;

  const sessionId = newSessionId(win.crypto);
  const queue = [];
  const offs = [];
  let views = 0;
  let errors = 0;
  let visibleSince = now();
  let timer = null;

  function push(event, sid, props) {
    if (queue.length >= QUEUE_MAX) queue.shift();
    queue.push({ event, sid: sid || undefined, props: props || {} });
  }

  async function flush() {
    let sent = 0;
    while (queue.length) {
      const events = queue.splice(0, BATCH_MAX);
      try {
        await api.call('apiLearnAtlasTelemetry', { sessionId, events });
        sent += events.length;
      } catch (e) { /* telemetria nunca interrompe o atlas */ }
    }
    return sent;
  }

  const { EVENTS } = bus;
  offs.push(bus.on(EVENTS.STRUCTURE_SELECT, (p) => {
    if (!p || !p.sid) return;
    views += 1;
    push('structure_view', p.sid, { source: p.source || 'api' });
  }));
  if (EVENTS.QUIZ_FINISH) {
    offs.push(bus.on(EVENTS.QUIZ_FINISH, (p) => push('quiz_finish', null, { correct: p && p.correct, total: p && p.total, system: p && p.system })));
  }
  if (EVENTS.SEARCH_RUN) {
    offs.push(bus.on(EVENTS.SEARCH_RUN, (p) => push('search', null, { len: p && p.len, results: p && p.results })));
  }

  function onError(e) {
    if (errors >= ERRORS_MAX) return;
    errors += 1;
    push('error_js', null, { code: 'error', message: scrubMessage(e && e.message) });
  }
  function onRejection(e) {
    if (errors >= ERRORS_MAX) return;
    errors += 1;
    const r = e && e.reason;
    push('error_js', null, { code: 'rejection', message: scrubMessage(r && r.message ? r.message : r) });
  }
  function endSegment() {
    push('session_end', null, { durationS: Math.round((now() - visibleSince) / 1000), views });
    views = 0;
    flush();
  }
  function onVisibility() {
    const hidden = win.document && win.document.visibilityState === 'hidden';
    if (hidden) endSegment(); else visibleSince = now();
  }

  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  win.addEventListener('pagehide', endSegment);
  if (win.document) win.document.addEventListener('visibilitychange', onVisibility);
  timer = win.setInterval(flush, flushMs);

  const ctrl = win.navigator && win.navigator.serviceWorker && win.navigator.serviceWorker.controller;
  push('app_open', null, { mode: getMode() || undefined, viewport: (win.innerWidth || 1024) < 600 ? 'm' : 'd', offline: !!ctrl && win.navigator.onLine === false });

  return {
    enabled: true,
    sessionId,
    flush,
    destroy() {
      offs.forEach((off) => { if (typeof off === 'function') off(); });
      win.removeEventListener('error', onError);
      win.removeEventListener('unhandledrejection', onRejection);
      win.removeEventListener('pagehide', endSegment);
      if (win.document) win.document.removeEventListener('visibilitychange', onVisibility);
      win.clearInterval(timer);
    },
  };
}
