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
 * O4: "Trilha de missões" baixa motor + tutor e a trilha (data/trilha), e joga a Missão 1 no motor.
 * Atrás da chave local `labMotor` (ligada por padrão; ?flags=-labMotor desliga).
 */
(function (raiz) {
  'use strict';

  const ARQUIVOS = Object.freeze([
    'js/lab-motor-estado.js', 'js/lab-motor-fisica.js', 'js/lab-motor-relogio.js', 'js/lab-motor-calculos.js',
    'js/lab-motor-especies.js', 'js/lab-motor-especies-farmaco.js',
    'js/lab-motor-op-base.js', 'js/lab-motor-op-separacao.js', 'js/lab-motor-op-cq.js',
    // O5: o registro de operações exige as de farmacotécnica (e elas, os cálculos e o CQ) antes dele.
    'js/lab-farma-calculos.js', 'js/lab-cq.js', 'js/lab-motor-op-farma.js',
    'js/lab-motor-operacoes.js', 'js/lab-motor-condicoes.js', 'js/lab-motor-caderno.js', 'js/lab-motor-processo.js',
    'js/lab-motor-painel.js'
  ]);
  // O4: tutor, trilha e tela da Missão 1 no motor (baixados depois do motor, só ao abrir a trilha).
  // O8: falas da Guia/Preceptor e desempenho vêm junto (nunca no index.html).
  const ARQUIVOS_TUTOR = Object.freeze(['js/lab-tutor-controles.js', 'js/lab-tutor.js', 'js/lab-trilha.js', 'js/lab-contexto.js', 'js/lab-boletim.js', 'js/lab-boletim-ui.js', 'js/lab-tutor-ui.js']);
  const TRILHA = 'data/trilha/trilha_v1.json';
  // Lista fechada de processos que a bancada pode buscar (todos com nivel_conteudo 'completo', conferido em teste).
  const PROCESSOS = Object.freeze({
    proc_nacl_09_v1: 'Solução de cloreto de sódio a 0,9 %',
    proc_desinfetante_cloro_v1: 'Desinfetante a 0,1 % de cloro ativo',
    proc_cq_titulacao_hcl_v1: 'Titulação de HCl 0,1 mol/L',
    proc_xarope_simples_v1: 'Xarope simples',
    proc_suspensao_mgoh2_v1: 'Suspensão de hidróxido de magnésio',
    proc_pomada_zno_v1: 'Pomada de óxido de zinco',
    proc_capsulas_vitc_v1: 'Cápsulas de ácido ascórbico',
    proc_alcool_gel_70_v1: 'Álcool em gel a 70 %',
    proc_sabonete_liquido_v1: 'Sabonete líquido',
    proc_home_spray_v1: 'Home spray',
    proc_sf09_esteril_v1: 'Soro fisiológico estéril',
    proc_vitc_filtrada_v1: 'Ácido ascórbico estéril por filtração'
  });
  const ID_PROCESSO = /^proc_[a-z0-9_]+$/;

  const carregando = {};

  function carregarLista(doc, nome, lista) {
    if (carregando[nome]) return carregando[nome];
    carregando[nome] = lista.reduce((anterior, src) => anterior.then(() => new Promise((ok, falha) => {
      if (doc.querySelector(`script[data-lab-motor="${src}"]`)) return ok();
      const s = doc.createElement('script');
      s.src = src;
      s.async = false;
      s.dataset.labMotor = src;
      s.onload = () => ok();
      s.onerror = () => falha(new Error(`não carregou ${src}`));
      doc.head.appendChild(s);
    })), Promise.resolve()).catch((e) => { carregando[nome] = null; throw e; });
    return carregando[nome];
  }

  /** Insere os scripts do motor em sequência (uma vez só). Resolve quando o último carrega. */
  function carregarMotor(doc) { return carregarLista(doc, 'motor', ARQUIVOS); }

  /** Motor + tutor, trilha e tela (O4), nessa ordem. */
  function carregarTutor(doc) { return carregarMotor(doc).then(() => carregarLista(doc, 'tutor', ARQUIVOS_TUTOR)); }

  async function carregarTrilha(buscar) {
    const r = await buscar(TRILHA, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`trilha indisponível (${r.status})`);
    const trilha = await r.json();
    const cache = {};
    // O processo só é baixado quando a pessoa joga a missão (uma vez por página).
    const buscarProcesso = (id) => {
      if (!cache[id]) cache[id] = carregarProcesso(buscar, id).catch((e) => { delete cache[id]; throw e; });
      return cache[id];
    };
    return { trilha, buscarProcesso };
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
    const trilha = doc.createElement('button');
    trilha.type = 'button';
    trilha.id = 'btnTrilha';
    trilha.className = 'btn btn-play';
    trilha.textContent = 'Trilha de missões';
    trilha.addEventListener('click', () => abrirTrilha(janela));
    cabecalho.appendChild(trilha);
    return true;
  }

  const ATALHOS = [
    { flag: 'labProdutos', id: 'lnkProdutos', texto: 'Produtos e controle de qualidade', href: 'produtos/index.html' },
    { flag: 'labRegulacao', id: 'lnkRegulacao', texto: 'Regulação (controlados)', href: 'regulacao/index.html' }
  ];

  /** Atalhos para as páginas de Produtos e de Regulação (cada uma na sua chave), logo abaixo do cabeçalho de Missões. */
  function iniciarAtalhos(janela) {
    const doc = janela.document;
    const G = janela.LabGuia;
    if (!G || typeof G.flagLigada !== 'function') return false;
    const cabecalho = doc.querySelector('#tabMissao .panel-section-header');
    if (!cabecalho || !cabecalho.parentNode || doc.getElementById('labAtalhos')) return false;
    const busca = janela.location ? janela.location.search : '';
    const ativos = ATALHOS.filter((a) => G.flagLigada(a.flag, busca, janela.__labFlags || null));
    if (!ativos.length) return false;
    const nav = doc.createElement('nav');
    nav.id = 'labAtalhos';
    nav.className = 'lab-atalhos';
    nav.setAttribute('aria-label', 'Outras áreas do Laboratório');
    ativos.forEach((a) => {
      const link = doc.createElement('a');
      link.id = a.id;
      link.className = 'lab-atalho';
      link.href = a.href;
      link.textContent = a.texto;
      nav.appendChild(link);
    });
    cabecalho.parentNode.insertBefore(nav, cabecalho.nextSibling);
    return true;
  }

  /** Abre a trilha (O4): a Missão 1 é jogada no motor, no lugar da bancada clássica, só enquanto durar. */
  async function abrirTrilha(janela) {
    const doc = janela.document;
    const btn = doc.getElementById('btnTrilha');
    if (btn) { btn.disabled = true; btn.textContent = 'Carregando…'; }
    try {
      await carregarTutor(doc);
      const dados = await carregarTrilha(janela.fetch.bind(janela));
      janela.LabTutorUI.abrirTrilha(janela, dados);
    } catch (e) {
      if (janela.console) janela.console.warn('[Laboratório] trilha indisponível:', e.message);
      if (btn) btn.textContent = 'Trilha indisponível';
      return;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Trilha de missões'; }
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

  const API = { ARQUIVOS, ARQUIVOS_TUTOR, TRILHA, PROCESSOS, carregarMotor, carregarTutor, carregarProcesso, carregarTrilha, flagLigada, iniciar, iniciarAtalhos, abrir, abrirTrilha };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabMotorCarregador = API;
  if (raiz && raiz.document && !(typeof module !== 'undefined' && module.exports)) { iniciar(raiz); iniciarAtalhos(raiz); }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
