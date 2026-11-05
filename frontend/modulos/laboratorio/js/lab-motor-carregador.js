/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — porta de entrada do motor de processos (O3) na bancada.
 *
 * Arquivo pequeno, carregado com a página. O motor (~110 KB) e o painel só são baixados quando a
 * pessoa toca em "Processo guiado" (scripts do mesmo domínio, na ordem certa: CSP script-src 'self').
 * Atrás da chave local `labMotor` (desligada por padrão; liga com ?flags=labMotor).
 */
(function (raiz) {
  'use strict';

  const ARQUIVOS = Object.freeze([
    'js/lab-motor-estado.js', 'js/lab-motor-fisica.js', 'js/lab-motor-relogio.js', 'js/lab-motor-calculos.js',
    'js/lab-motor-especies.js', 'js/lab-motor-op-base.js', 'js/lab-motor-op-separacao.js', 'js/lab-motor-op-cq.js',
    'js/lab-motor-operacoes.js', 'js/lab-motor-condicoes.js', 'js/lab-motor-caderno.js', 'js/lab-motor-processo.js',
    'js/lab-motor-painel.js'
  ]);
  const PROCESSOS = Object.freeze({ proc_nacl_09_v1: 'Solução de cloreto de sódio a 0,9 %' });
  const ID_PROCESSO = /^proc_[a-z0-9_]+$/;

  let carregando = null;

  /** Insere os scripts do motor em sequência (uma vez só). Resolve quando o último carrega. */
  function carregarMotor(doc) {
    if (carregando) return carregando;
    carregando = ARQUIVOS.reduce((anterior, src) => anterior.then(() => new Promise((ok, falha) => {
      if (doc.querySelector(`script[data-lab-motor="${src}"]`)) return ok();
      const s = doc.createElement('script');
      s.src = src;
      s.async = false;
      s.dataset.labMotor = src;
      s.onload = () => ok();
      s.onerror = () => falha(new Error(`não carregou ${src}`));
      doc.head.appendChild(s);
    })), Promise.resolve()).catch((e) => { carregando = null; throw e; });
    return carregando;
  }

  /** Busca o JSON do processo (id da lista fechada). */
  async function carregarProcesso(buscar, id) {
    if (!ID_PROCESSO.test(id) || !Object.prototype.hasOwnProperty.call(PROCESSOS, id)) throw new Error('processo desconhecido');
    const r = await buscar(`data/processos/${id}.json`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`processo indisponível (${r.status})`);
    return r.json();
  }

  function flagLigada(janela) {
    const G = janela.LabGuia;
    if (!G || typeof G.flagLigada !== 'function') return false;
    return G.flagLigada('labMotor', janela.location ? janela.location.search : '', janela.__labFlags || null);
  }

  /** Põe o botão "Processo guiado" na aba Missões quando a chave estiver ligada. */
  function iniciar(janela) {
    const doc = janela.document;
    if (!flagLigada(janela)) return false;
    const cabecalho = doc.querySelector('#tabMissao .panel-section-header');
    if (!cabecalho || doc.getElementById('btnProcessoGuiado')) return false;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.id = 'btnProcessoGuiado';
    btn.className = 'btn btn-clear';
    btn.textContent = 'Processo guiado';
    btn.addEventListener('click', () => abrir(janela, 'proc_nacl_09_v1'));
    cabecalho.appendChild(btn);
    return true;
  }

  async function abrir(janela, id) {
    const doc = janela.document;
    const btn = doc.getElementById('btnProcessoGuiado');
    if (btn) { btn.disabled = true; btn.textContent = 'Carregando…'; }
    try {
      await carregarMotor(doc);
      const processo = await carregarProcesso(janela.fetch.bind(janela), id);
      janela.LabMotorPainel.abrir(janela, processo);
    } catch (e) {
      if (janela.console) janela.console.warn('[Laboratório] processo guiado indisponível:', e.message);
      if (btn) btn.textContent = 'Processo guiado indisponível';
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Processo guiado'; }
  }

  const API = { ARQUIVOS, PROCESSOS, carregarMotor, carregarProcesso, flagLigada, iniciar, abrir };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabMotorCarregador = API;
  if (raiz && raiz.document && !(typeof module !== 'undefined' && module.exports)) iniciar(raiz);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
