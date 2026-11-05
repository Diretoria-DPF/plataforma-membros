/**
 * MOTOR DA CLÍNICA MÉDICA VIRTUAL (OSCE MULTIPACIENTE, ACERVO & RADAR EPIDEMIOLÓGICO)
 * Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia (LAIFT)
 *
 * Fase 3 (docs/FASE_3_IA_CLINICA.md): a IA e o acervo saíram do Apps Script.
 * Toda chamada ao servidor passa pela ponte `window.LaiftApi.call(action,
 * input)` (modulos/shared/laift-identity.js, Contrato 3), que usa a sessão
 * da plataforma — o token nunca chega a este iframe. Endpoints usados:
 * apiLearnClinicalChat / Evaluate / GenerateCase / Library / Epidemiology e
 * apiLearnGetMyAiQuota.
 *
 * SEGURANÇA: a fala do paciente, o parecer do preceptor, os casos do acervo
 * e os casos gerados vêm da IA ou de outros usuários. Tudo isso é inserido
 * no DOM SÓ com textContent/createElement (helper `el`) — nunca innerHTML.
 * Esta página roda na mesma origem da plataforma: um XSS aqui alcançaria a
 * sessão de quem está logado. Este arquivo não usa innerHTML em lugar
 * nenhum, nem para marcação fixa (CSP e o resto do endurecimento da
 * página: Equipe 4, Onda 2).
 *
 * As regras puras (tempo, pausa, medidores, contexto enviado) ficam em
 * clinic-core.js (window.ClinicCore), testadas em
 * frontend/scripts/clinic-engine.test.mjs. Sem IA ou servidor, a clínica NÃO
 * simula nada: mostra que a função está indisponível (CLI-06).
 */

const ClinicEngine = (() => {
  const Core = window.ClinicCore;
  const UNAVAILABLE_MSG = Core.UNAVAILABLE_MESSAGE;
  let currentCase = null;
  // Estado do atendimento (vitalidade, paciência, relógio, pausa): sempre substituído por um novo objeto (clinic-core.js).
  let state = Core.newState(null);
  let clockInterval = null;
  let isCaseActive = false;
  let canRetryEvaluation = false;
  let chatBusy = false;
  // Atendimentos pausados por leito: o relógio e os medidores ficam parados até a pessoa retomar.
  const pausedSessions = new Map();
  // Turnos da anamnese no formato do servidor: { role: 'student'|'patient', text }.
  let chatTurns = [];
  let requestedExams = [];
  let caseOutcome = 'EM_ANDAMENTO';
  let activeSemiologyAxis = 'cronologia';
  let lastQuota = null;

  // Controle de Estado do Acervo Comunitário
  let modoExibicaoAtual = 'plantao'; // 'plantao' | 'acervo'
  let casosAcervoCache = [];

  // Limites do servidor (worker/src/constants.js, AI_LIMITS) — conferidos
  // aqui só para a pessoa não perder o que digitou numa recusa previsível.
  const HISTORY_TURNS_SENT = 8;
  const TOPIC_MAX = 200;

  // Cache centralizado de referências do DOM
  const dom = {};

  // =========================================================
  // 0. UTILITÁRIOS: PONTE COM A PLATAFORMA E DOM SEGURO
  // =========================================================

  /**
   * Chamada defensiva à ponte. Sem ponte (página aberta fora da plataforma,
   * ou antes da integração da Equipe 2) ou com falha de rede, devolve
   * { success:false, message } — nunca lança.
   */
  async function callLaift(action, input) {
    if (!window.LaiftApi || typeof window.LaiftApi.call !== 'function') {
      return { success: false, message: UNAVAILABLE_MSG, bridgeMissing: true };
    }
    try {
      const res = await window.LaiftApi.call(action, input || {});
      return res && typeof res === 'object' ? res : { success: false, message: UNAVAILABLE_MSG };
    } catch (err) {
      return { success: false, message: UNAVAILABLE_MSG };
    }
  }

  // Modais acessíveis (clinic-modal.js): Esc, foco preso e devolvido. Sem o helper, abre e fecha do jeito simples.
  function openModal(node, onClose) {
    if (!node) return;
    if (window.ClinicModal) { window.ClinicModal.open(node, { onClose }); return; }
    if (node.classList.contains('modal')) node.classList.add('active'); else node.style.display = 'flex';
  }
  function closeModal(node) {
    if (!node) return;
    if (window.ClinicModal) { window.ClinicModal.close(node); return; }
    if (node.classList.contains('modal')) node.classList.remove('active'); else node.style.display = 'none';
  }

  // Avisos e confirmações: modal acessível (LaiftDialog, shared/laift-dialog.js); sem ele, cai nos nativos.
  function dialogAlert(message) {
    if (window.LaiftDialog) return window.LaiftDialog.alert(message);
    window.alert(message);
    return Promise.resolve();
  }
  function dialogConfirm(message) {
    if (window.LaiftDialog) return window.LaiftDialog.confirm(message);
    return Promise.resolve(window.confirm(message));
  }

  // Pergunta de uma linha: campo rotulado no mesmo modal; sem ele, cai no prompt nativo. Cancelar/Esc -> null.
  function dialogPrompt(message, opts) {
    if (window.LaiftDialog) return window.LaiftDialog.prompt(message, opts);
    return Promise.resolve(window.prompt(message, (opts && opts.defaultValue) || ''));
  }

  /** Cria um elemento; `text` vira textContent, filhos string viram nós de texto. */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    const p = props || {};
    Object.keys(p).forEach((key) => {
      const value = p[key];
      if (value === null || value === undefined) return;
      if (key === 'text') node.textContent = String(value);
      else if (key === 'className') node.className = value;
      else if (key === 'style') node.style.cssText = value;
      else if (key === 'dataset') Object.keys(value).forEach((d) => { node.dataset[d] = String(value[d]); });
      else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, String(value));
    });
    (children || []).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
    });
    return node;
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // Estados vazio/carregando/erro das grades: classes de shared/style.css
  // (tokens claro/escuro), no lugar de cores fixas em style.
  function emptyState(container, message, kind) {
    clearNode(container);
    container.appendChild(el('div', {
      className: `clinic-empty${kind ? ' is-' + kind : ''}`,
      role: kind === 'error' ? 'alert' : 'status',
    }, [el('p', { text: message })]));
  }

  const caseSourceOf = Core.caseSourceOf;

  // Modo simulação (clinic-sim.js, ADR 0009): `{ simulation }` só com o modo ligado; senão {} e nada muda no payload.
  function simExtra() {
    return window.ClinicSim ? window.ClinicSim.extraFor(state.elapsedSeconds) : {};
  }

  function initDomReferences() {
    dom.patientName = document.getElementById('clinicPatientName');
    dom.patientMeta = document.getElementById('clinicPatientMeta');
    dom.vitalityValue = document.getElementById('vitalityValue');
    dom.vitalityFill = document.getElementById('vitalityFill');
    dom.patienceValue = document.getElementById('patienceValue');
    dom.patienceFill = document.getElementById('patienceFill');
    dom.timeElapsed = document.getElementById('clinicTimeElapsed');

    // Telas do Módulo Clínico
    dom.dashboardView = document.getElementById('clinicDashboardView');
    dom.workspaceView = document.getElementById('clinicWorkspaceView');
    dom.bedsGrid = document.getElementById('patientBedsGrid');
    dom.communityBedsGrid = document.getElementById('communityBedsGrid');
    dom.btnGenerateAiCase = document.getElementById('btnGenerateAiCase');
    dom.aiQuotaInfo = document.getElementById('aiQuotaInfo');

    // Controles do Acervo e Modos
    dom.btnModoPlantao = document.getElementById('btnModoPlantao');
    dom.btnModoAcervo = document.getElementById('btnModoAcervo');
    dom.acervoToolbar = document.getElementById('acervoToolbar');
    dom.acervoSearchInput = document.getElementById('acervoSearchInput');
    dom.acervoToxFilter = document.getElementById('acervoToxFilter');

    // Radar Epidemiológico
    dom.modalRadarEpidemio = document.getElementById('modalRadarEpidemio');
    dom.radarTaxaSobrevivencia = document.getElementById('radarTaxaSobrevivencia');
    dom.radarTotalAtendimentos = document.getElementById('radarTotalAtendimentos');
    dom.radarToxindromesList = document.getElementById('radarToxindromesList');
    dom.radarAgentesList = document.getElementById('radarAgentesList');

    // Abas da consulta
    dom.tabButtons = document.querySelectorAll('.clinic-tab-btn');
    dom.tabPanes = document.querySelectorAll('.clinic-tab-pane');

    // Prontuário clínico
    dom.chiefComplaint = document.getElementById('clinicChiefComplaint');
    dom.patientHistory = document.getElementById('clinicPatientHistory');
    dom.vitalPA = document.getElementById('vitalPA');
    dom.vitalFC = document.getElementById('vitalFC');
    dom.vitalFR = document.getElementById('vitalFR');
    dom.vitalTemp = document.getElementById('vitalTemp');
    dom.vitalSpO2 = document.getElementById('vitalSpO2');
    dom.vitalGlasgow = document.getElementById('vitalGlasgow');

    // Chat / Anamnese & Guia Semiológico
    dom.chatHistory = document.getElementById('chatHistory');
    dom.chatInitialGreeting = document.getElementById('chatInitialGreeting');
    dom.suggestionsList = document.getElementById('suggestionsList');
    dom.questionInput = document.getElementById('patientQuestionInput');
    dom.sendQuestionBtn = document.getElementById('sendQuestionBtn');

    // Exames
    dom.availableExamsList = document.getElementById('availableExamsList');
    dom.releasedExamsList = document.getElementById('releasedExamsList');

    // Fechamento e Preceptor
    dom.studentDiagnosis = document.getElementById('studentDiagnosisInput');
    dom.studentConduct = document.getElementById('studentConductInput');
    dom.submitResolutionBtn = document.getElementById('submitCaseResolutionBtn');
    dom.preceptorModal = document.getElementById('preceptorModal');
    dom.preceptorGrade = document.getElementById('preceptorGrade');
    dom.caseOutcomeTitle = document.getElementById('caseOutcomeTitle');
    dom.caseOutcomeSummary = document.getElementById('caseOutcomeSummary');
    dom.preceptorFeedbackText = document.getElementById('preceptorFeedbackText');
  }

  // =========================================================
  // 1. COTA DIÁRIA DE IA (apiLearnGetMyAiQuota)
  // =========================================================

  function setGenerateButtonIdle() {
    initDomReferences();
    const btn = dom.btnGenerateAiCase;
    if (!btn) return;
    const esgotada = lastQuota && lastQuota.generateCase && lastQuota.generateCase.remaining <= 0;
    btn.disabled = !!esgotada;
    btn.textContent = esgotada ? '⛔ Cota diária de casos esgotada' : '⚡ Gerar Caso com IA';
  }

  function renderQuota(quotas) {
    initDomReferences();
    if (!dom.aiQuotaInfo) return;
    if (!quotas) {
      dom.aiQuotaInfo.textContent = '';
      return;
    }
    const g = quotas.generateCase || { remaining: 0, limit: 0 };
    const e = quotas.evaluate || { remaining: 0, limit: 0 };
    const c = quotas.chat || { remaining: 0, limit: 0 };
    dom.aiQuotaInfo.textContent =
      `IA hoje: ${g.remaining} de ${g.limit} casos · ${e.remaining} de ${e.limit} avaliações · ${c.remaining} de ${c.limit} perguntas`;
    dom.aiQuotaInfo.dataset.esgotada = g.remaining <= 0 ? 'sim' : 'nao';
  }

  async function refreshAiQuota() {
    const res = await callLaift('apiLearnGetMyAiQuota', {});
    if (res && res.success && res.quotas) {
      lastQuota = res.quotas;
      renderQuota(res.quotas);
    } else {
      lastQuota = null;
      renderQuota(null);
    }
    // O servidor avisa aqui se a simulação está disponível para esta pessoa (sem action nova).
    if (window.ClinicSim) window.ClinicSim.setAvailability(res && res.success ? res.simulation : null);
    setGenerateButtonIdle();
    return lastQuota;
  }

  // =========================================================
  // 2. GESTÃO DE LEITOS (PLANTÃO ATIVO VS. ACERVO COLETIVO)
  // =========================================================

  function setModoExibicao(modo) {
    initDomReferences();
    modoExibicaoAtual = modo;

    if (modo === 'plantao') {
      if (dom.btnModoPlantao) dom.btnModoPlantao.className = 'btn btn-primary btn-sm';
      if (dom.btnModoAcervo) dom.btnModoAcervo.className = 'btn btn-outline btn-sm';
      if (dom.acervoToolbar) dom.acervoToolbar.classList.add('hidden');
      if (dom.communityBedsGrid) dom.communityBedsGrid.classList.add('hidden');
      if (dom.bedsGrid) dom.bedsGrid.classList.remove('hidden');
      renderBedsGrid();
    } else {
      if (dom.btnModoPlantao) dom.btnModoPlantao.className = 'btn btn-outline btn-sm';
      if (dom.btnModoAcervo) dom.btnModoAcervo.className = 'btn btn-primary btn-sm';
      if (dom.acervoToolbar) dom.acervoToolbar.classList.remove('hidden');
      if (dom.bedsGrid) dom.bedsGrid.classList.add('hidden');
      if (dom.communityBedsGrid) dom.communityBedsGrid.classList.remove('hidden');

      if (casosAcervoCache.length === 0) {
        carregarAcervoComunitario(false);
      } else {
        renderAcervoGrid(casosAcervoCache);
      }
    }
  }

  /**
   * "Concluído" no cartão do leito é uma marca LOCAL deste navegador
   * (localStorage `laift_resolved_cases`). O registro oficial de cada
   * atendimento avaliado está em learning_attempts, no servidor (conta nas
   * estatísticas da área "Aprender"); a marca local existe só para a pessoa
   * ver no mapa de leitos o que já atendeu. Decisão documentada em
   * docs/FASE_3_IA_CLINICA.md.
   */
  function lerCasosResolvidos() {
    try {
      const lista = JSON.parse(localStorage.getItem('laift_resolved_cases') || '[]');
      return Array.isArray(lista) ? lista.map(String) : [];
    } catch (e) {
      return [];
    }
  }

  function registrarCasoResolvido(caseId) {
    try {
      const resolvidos = lerCasosResolvidos();
      if (!resolvidos.includes(String(caseId))) {
        resolvidos.push(String(caseId));
        localStorage.setItem('laift_resolved_cases', JSON.stringify(resolvidos.slice(-200)));
      }
    } catch (e) { /* armazenamento indisponível: só perde a marca visual */ }
  }

  /**
   * Revisão espaçada (A3, revisao-espacada.js): o resultado do caso do plantão entra na revisão dos erros guardada neste
   * aparelho. Só casos do plantão (builtin): os de IA e do acervo não voltam com o mesmo id. Nunca trava o atendimento.
   */
  function registrarRevisao(caso, correto) {
    try {
      if (!window.LaiftReview || !caso || caseSourceOf(caso) !== 'builtin') return;
      window.LaiftReview.record({ module: 'clinica', id: String(caso.id), topic: String(caso.queixaPrincipal || '').slice(0, 80), correct: correto });
    } catch (e) { /* a revisão é um extra */ }
  }

  function casosParaRever() {
    try { return window.LaiftReview ? window.LaiftReview.dueIds('clinica').map(String) : []; } catch (e) { return []; }
  }

  function renderBedsGrid() {
    initDomReferences();
    if (!dom.bedsGrid) return;
    clearNode(dom.bedsGrid);

    if (typeof clinicalCases === 'undefined' || !Array.isArray(clinicalCases) || clinicalCases.length === 0) {
      dom.bedsGrid.appendChild(el('div', { className: 'clinic-empty' }, [
        el('h3', { text: 'Nenhum paciente internado no plantão ativo.' }),
        el('p', { text: 'Clique em "⚡ Gerar Caso com IA" ou explore o "Acervo da Liga".' }),
      ]));
      return;
    }

    const resolvidos = lerCasosResolvidos();
    const aRever = casosParaRever();

    clinicalCases.forEach((c, index) => {
      const isConcluido = resolvidos.includes(String(c.id));
      const idade = c.paciente && c.paciente.idade !== undefined ? c.paciente.idade : '--';
      const nome = (c.paciente && c.paciente.nome) || 'Paciente';
      const perfilComportamental = (c.contextoOculto && c.contextoOculto.temperamento)
        ? String(c.contextoOculto.temperamento).split(',')[0]
        : (c.dificuldade || 'Intermediário');
      const queixaTxt = String(c.queixaPrincipal || 'Sem queixa descrita.');
      const queixa = queixaTxt.length > 85 ? queixaTxt.substring(0, 85) + '...' : queixaTxt;

      const card = el('div', { className: `bed-card ${c.tipo === 'emergencia' ? 'emergency' : 'ambulatory'} ${isConcluido ? 'completed' : ''}` }, [
        el('div', { className: 'bed-header' }, [
          el('span', { className: 'bed-tag', text: c.tipo === 'emergencia' ? '🚨 Emergência' : '🩺 Ambulatório' }),
          el('span', {
            className: `bed-status ${isConcluido ? 'is-done' : 'is-open'}`,
            text: isConcluido ? '✅ Concluído' : '🟡 Em Aberto',
          }),
          ...(aRever.includes(String(c.id)) ? [el('span', { className: 'bed-status is-review', text: '🔁 Rever hoje' })] : []),
        ]),
        el('h4', { className: 'bed-title', text: `Leito 0${index + 1}: ${nome}` }),
        el('p', { className: 'bed-complaint', text: `"${queixa}"` }),
        el('div', { className: 'bed-meta' }, [
          el('span', {}, ['Idade: ', el('strong', { text: `${idade} anos` })]),
          el('span', {}, ['Perfil: ', el('strong', { text: perfilComportamental })]),
        ]),
        el('button', {
          className: 'btn btn-primary bed-cta', type: 'button',
          text: isConcluido ? '🔄 Reavaliar Caso' : '🩺 Assumir Atendimento',
          onclick: () => openBed(c),
        }),
      ]);

      dom.bedsGrid.appendChild(card);
    });
  }

  // =========================================================
  // 3. ACERVO COLETIVO (apiLearnClinicalLibrary — só casos aprovados)
  // =========================================================

  async function carregarAcervoComunitario() {
    initDomReferences();
    if (!dom.communityBedsGrid) return;

    emptyState(dom.communityBedsGrid, '⏳ Sincronizando a biblioteca de casos clínicos da LAIFT...', 'loading');

    const res = await callLaift('apiLearnClinicalLibrary', {});
    if (!res.success) {
      emptyState(dom.communityBedsGrid, res.message || 'Não foi possível carregar o acervo agora.', 'error');
      return;
    }

    casosAcervoCache = (Array.isArray(res.cases) ? res.cases : [])
      .filter((c) => c && typeof c === 'object' && c.id)
      .map((c) => Object.assign({}, c, { caseSource: 'acervo' }));

    if (casosAcervoCache.length === 0) {
      clearNode(dom.communityBedsGrid);
      dom.communityBedsGrid.appendChild(el('div', { className: 'clinic-empty' }, [
        el('h4', { text: 'Nenhum caso publicado no acervo até o momento.' }),
        el('p', { text: 'Os casos da Liga aparecerão aqui.' }),
      ]));
      return;
    }
    filtrarAcervo();
  }

  function renderAcervoGrid(casos) {
    initDomReferences();
    if (!dom.communityBedsGrid) return;
    clearNode(dom.communityBedsGrid);

    if (!casos || casos.length === 0) {
      emptyState(dom.communityBedsGrid, 'Nenhum caso encontrado para o filtro aplicado.');
      return;
    }

    casos.forEach((c) => {
      const nomePac = (c.paciente && c.paciente.nome) ? c.paciente.nome : 'Paciente';
      const idadePac = (c.paciente && c.paciente.idade) ? `${c.paciente.idade} anos` : '--';
      const tox = c.toxindrome || 'Geral';
      const agente = c.agentePrincipal || c.agente || 'Não informado';

      const card = el('div', { className: 'bed-card ambulatory is-acervo' }, [
        el('div', { className: 'bed-header' }, [
          el('span', { className: 'bed-tag is-acervo', text: `📚 ${tox}` }),
        ]),
        el('h4', { className: 'bed-title is-acervo', text: c.titulo || 'Caso Clínico' }),
        el('div', { className: 'bed-patient' }, ['Paciente: ', el('strong', { text: `${nomePac} (${idadePac})` })]),
        el('p', { className: 'bed-complaint', text: `"${c.queixaPrincipal || 'Caso clínico catalogado no acervo.'}"` }),
        el('div', { className: 'bed-meta' }, [
          el('span', {}, ['Agente: ', el('strong', { text: agente })]),
          el('span', {}, ['Nível: ', el('strong', { text: c.dificuldade || 'Intermediário' })]),
        ]),
        el('div', { className: 'bed-actions' }, [
          el('button', {
            className: 'btn btn-primary btn-sm bed-cta-main', type: 'button',
            text: '🩺 Atender Este Caso', onclick: () => assumirCasoDoAcervo(c.id),
          }),
          el('button', {
            className: 'btn btn-outline btn-sm bed-cta-alt', type: 'button',
            title: 'Gerar com IA um caso derivado deste tema', text: '⚡ Variação IA',
            onclick: () => gerarVariacaoComIa(agente !== 'Não informado' ? agente : (c.toxindrome || 'Toxicologia')),
          }),
        ]),
      ]);

      dom.communityBedsGrid.appendChild(card);
    });
  }

  function filtrarAcervo() {
    initDomReferences();
    const termo = (dom.acervoSearchInput?.value || '').toLowerCase().trim();
    const toxFiltro = (dom.acervoToxFilter?.value || '').toLowerCase().trim();

    const filtrados = casosAcervoCache.filter((c) => {
      const agenteStr = String(c.agentePrincipal || c.agente || '').toLowerCase();
      const tituloStr = String(c.titulo || '').toLowerCase();
      const queixaStr = String(c.queixaPrincipal || '').toLowerCase();
      const toxStr = String(c.toxindrome || '').toLowerCase();

      const matchTexto = !termo ||
        tituloStr.includes(termo) ||
        agenteStr.includes(termo) ||
        queixaStr.includes(termo) ||
        toxStr.includes(termo);

      const matchTox = !toxFiltro || toxStr.includes(toxFiltro);
      return matchTexto && matchTox;
    });

    renderAcervoGrid(filtrados);
  }

  function assumirCasoDoAcervo(identificador) {
    initDomReferences();
    const caso = casosAcervoCache.find((c) => String(c.id) === String(identificador));
    if (!caso) {
      dialogAlert('Não foi possível localizar este caso no acervo carregado.');
      return;
    }

    // Leva o caso para o plantão (primeiro leito), sem duplicar.
    if (typeof clinicalCases !== 'undefined' && Array.isArray(clinicalCases)) {
      const idx = clinicalCases.findIndex((c) => String(c.id) === String(caso.id));
      if (idx !== -1) clinicalCases.splice(idx, 1);
      clinicalCases.unshift(caso);
    }
    openBed(caso);
  }

  function gerarVariacaoComIa(temaBase) {
    solicitarCasoProcedural(temaBase);
  }

  // =========================================================
  // 4. RADAR EPIDEMIOLÓGICO (apiLearnClinicalEpidemiology)
  // =========================================================

  function renderRadarChips(container, items, emptyMsg, chipClass, suffix) {
    clearNode(container);
    if (!items.length) {
      container.appendChild(el('span', { className: 'radar-empty', text: emptyMsg }));
      return;
    }
    items.forEach((item) => {
      container.appendChild(el('span', { className: `tag radar-chip ${chipClass}`, text: `${item.name}: ${item.count}${suffix}` }));
    });
  }

  async function abrirRadarEpidemiologico() {
    initDomReferences();
    if (!dom.modalRadarEpidemio) return;

    openModal(dom.modalRadarEpidemio);
    if (dom.radarTaxaSobrevivencia) dom.radarTaxaSobrevivencia.textContent = '...';
    if (dom.radarTotalAtendimentos) dom.radarTotalAtendimentos.textContent = '...';
    if (dom.radarToxindromesList) dom.radarToxindromesList.textContent = 'Carregando indicadores...';
    if (dom.radarAgentesList) dom.radarAgentesList.textContent = 'Carregando indicadores...';

    const res = await callLaift('apiLearnClinicalEpidemiology', {});
    if (!res.success) {
      if (dom.radarTaxaSobrevivencia) dom.radarTaxaSobrevivencia.textContent = '--';
      if (dom.radarTotalAtendimentos) dom.radarTotalAtendimentos.textContent = '--';
      if (dom.radarToxindromesList) dom.radarToxindromesList.textContent = res.message || 'Indicadores indisponíveis no momento.';
      if (dom.radarAgentesList) dom.radarAgentesList.textContent = '';
      return;
    }

    if (dom.radarTaxaSobrevivencia) {
      dom.radarTaxaSobrevivencia.textContent = typeof res.survivalRatePct === 'number' ? `${res.survivalRatePct}%` : '--';
    }
    if (dom.radarTotalAtendimentos) dom.radarTotalAtendimentos.textContent = String(Number(res.totalAttended) || 0);

    const norm = (list) => (Array.isArray(list) ? list : [])
      .filter((i) => i && i.name)
      .map((i) => ({ name: String(i.name), count: Number(i.count) || 0 }));

    if (dom.radarToxindromesList) {
      renderRadarChips(dom.radarToxindromesList, norm(res.topToxindromes), 'Nenhuma toxíndrome agregada ainda.',
        'is-toxindrome', ' caso(s)');
    }
    if (dom.radarAgentesList) {
      renderRadarChips(dom.radarAgentesList, norm(res.topAgents), 'Nenhum princípio ativo registrado ainda.',
        'is-agent', 'x');
    }
  }

  function fecharRadarEpidemiologico() {
    initDomReferences();
    closeModal(dom.modalRadarEpidemio);
  }

  // =========================================================
  // 5. ATENDIMENTO CLÍNICO DO LEITO SELECIONADO
  // =========================================================

  function showBedsDashboard() {
    initDomReferences();
    if (dom.workspaceView) dom.workspaceView.classList.add('hidden');
    if (dom.dashboardView) dom.dashboardView.classList.remove('hidden');
    setModoExibicao(modoExibicaoAtual);
    refreshAiQuota();
  }

  function openBed(caseIdOrObject) {
    initDomReferences();
    if (dom.dashboardView) dom.dashboardView.classList.add('hidden');
    if (dom.workspaceView) dom.workspaceView.classList.remove('hidden');
    startCase(caseIdOrObject);
  }

  function snapshotKey(c) {
    return String((c && c.id) || '');
  }

  function savePausedSession() {
    const key = snapshotKey(currentCase);
    if (!key) return;
    pausedSessions.set(key, {
      state,
      chatTurns: chatTurns.slice(),
      requestedExams: requestedExams.slice(),
      axis: activeSemiologyAxis,
      chatNodes: dom.chatHistory ? Array.from(dom.chatHistory.childNodes) : [],
      releasedNodes: dom.releasedExamsList ? Array.from(dom.releasedExamsList.childNodes) : [],
      diagnosis: dom.studentDiagnosis ? dom.studentDiagnosis.value : '',
      conduct: dom.studentConduct ? dom.studentConduct.value : '',
    });
  }

  function restorePausedSession(snap) {
    chatTurns = snap.chatTurns.slice();
    requestedExams = snap.requestedExams.slice();
    activeSemiologyAxis = snap.axis;
    if (dom.chatHistory) {
      clearNode(dom.chatHistory);
      snap.chatNodes.forEach((n) => dom.chatHistory.appendChild(n));
    }
    if (dom.releasedExamsList) {
      clearNode(dom.releasedExamsList);
      snap.releasedNodes.forEach((n) => dom.releasedExamsList.appendChild(n));
    }
    if (dom.availableExamsList) {
      Array.from(dom.availableExamsList.querySelectorAll('button')).forEach((b) => {
        if (snap.requestedExams.includes(b.dataset.examId)) { b.disabled = true; b.textContent = 'Solicitado'; }
      });
    }
    if (dom.studentDiagnosis) dom.studentDiagnosis.value = snap.diagnosis;
    if (dom.studentConduct) dom.studentConduct.value = snap.conduct;
    renderSemiologyGuide();
  }

  async function returnToBeds() {
    if (isCaseActive) {
      if (chatBusy) {
        await dialogAlert('Aguarde a resposta do paciente para pausar o atendimento.');
        return;
      }
      if (!(await dialogConfirm('Pausar o atendimento e voltar ao mapa de leitos? O relógio e os medidores ficam parados e você retoma do mesmo ponto.'))) return;
      clearInterval(clockInterval);
      state = Core.pause(state);
      savePausedSession();
      isCaseActive = false;
    }
    showBedsDashboard();
  }

  function startCase(caseIdOrObject) {
    initDomReferences();

    let selected = null;
    if (caseIdOrObject && typeof caseIdOrObject === 'object') {
      selected = caseIdOrObject;
    } else {
      const idStr = String(caseIdOrObject).trim();
      selected = (typeof clinicalCases !== 'undefined' && Array.isArray(clinicalCases))
        ? (clinicalCases.find((c) => String(c.id).trim() === idStr) || clinicalCases[0])
        : null;
    }

    if (!selected) {
      console.error('[ClinicEngine] Caso clínico não encontrado.');
      return;
    }

    const snap = pausedSessions.get(snapshotKey(selected));
    pausedSessions.delete(snapshotKey(selected));
    currentCase = selected;
    chatTurns = [];
    requestedExams = [];
    caseOutcome = 'EM_ANDAMENTO';
    isCaseActive = true;
    canRetryEvaluation = false;
    chatBusy = false;
    activeSemiologyAxis = 'cronologia';
    state = snap ? Core.resume(snap.state) : Core.newState(selected);
    if (!snap && window.ClinicSim) window.ClinicSim.onCaseStart(caseSourceOf(selected), selected);

    clearInterval(clockInterval);
    renderPatientProfile();
    renderVitals();
    renderSemiologyGuide();
    renderExamsCatalog();
    resetChat();
    resetResolutionForm();
    if (snap) restorePausedSession(snap);
    updateClockUI();
    updateMetersUI();
    switchTab('prontuarioTab');

    clockInterval = setInterval(handleTimeTick, 1000);
  }

  function renderPatientProfile() {
    if (!currentCase) return;
    const pac = currentCase.paciente || {};
    if (dom.patientName) dom.patientName.textContent = pac.nome || 'Paciente';
    if (dom.patientMeta) {
      dom.patientMeta.textContent = `${pac.idade || '--'} anos | ${pac.profissao || 'Ocupação'} | Peso: ${pac.peso || '--'}`;
    }
    if (dom.chiefComplaint) dom.chiefComplaint.textContent = `"${currentCase.queixaPrincipal || 'Mal-estar não especificado'}"`;
    if (dom.patientHistory) {
      clearNode(dom.patientHistory);
      dom.patientHistory.appendChild(el('p', { className: 'history-line' }, [
        el('strong', { text: 'Histórico de Admissão: ' }),
        currentCase.historicoAdmissao || 'Admitido para elucidação diagnóstica.',
      ]));
      dom.patientHistory.appendChild(el('p', { className: 'history-line is-muted' }, [
        el('strong', { text: 'Alergias Conhecidas: ' }),
        pac.alergias || 'Nega alergias relatadas.',
      ]));
    }
  }

  function renderVitals() {
    if (!currentCase || !currentCase.sinaisVitais) return;
    const v = currentCase.sinaisVitais;
    if (dom.vitalPA) dom.vitalPA.textContent = v.pa || '--/--';
    if (dom.vitalFC) dom.vitalFC.textContent = v.fc || '--';
    if (dom.vitalFR) dom.vitalFR.textContent = v.fr || '--';
    if (dom.vitalTemp) dom.vitalTemp.textContent = v.temp || '--';
    if (dom.vitalSpO2) dom.vitalSpO2.textContent = v.spo2 || '--';
    if (dom.vitalGlasgow) dom.vitalGlasgow.textContent = v.glasgow || '--';
  }

  // =========================================================
  // 6. GUIA SEMIOLÓGICO CLÍNICO-METODOLÓGICO (4 EIXOS)
  // =========================================================

  function renderSemiologyGuide() {
    if (!dom.suggestionsList || !currentCase) return;
    clearNode(dom.suggestionsList);

    const guia = currentCase.guiaSemiologico || null;
    const perguntasLegadas = Array.isArray(currentCase.perguntasSugeridas) ? currentCase.perguntasSugeridas : [];

    const eixos = [
      { id: 'cronologia', icone: '⏱️', titulo: 'HMA & Início', desc: 'Evolução, tempo e ritmo dos sintomas' },
      { id: 'farmacoterapia', icone: '💊', titulo: 'Remédios & Doses', desc: 'Automedicação, contínuos e adesão' },
      { id: 'exposicao', icone: '🧪', titulo: 'Exposição & Tóxicos', desc: 'Químicos, alimentos e ambiente' },
      { id: 'sinaisAlarme', icone: '⚠️', titulo: 'Sinais de Alarme', desc: 'Queimação, salivação e gravidade' }
    ];

    const perguntasDoEixo = (id) => {
      const lista = guia && Array.isArray(guia[id]) ? guia[id] : [];
      return lista.length > 0 ? lista : perguntasLegadas;
    };

    const containerGuia = el('div', { className: 'semiology-wrapper' });
    const navBar = el('div', { className: 'semiology-nav', role: 'group', 'aria-label': 'Eixos do roteiro semiológico' });
    const chipsArea = el('div', { className: 'semiology-chips-area' });

    eixos.forEach((eixo) => {
      const btnEixo = el('button', {
        type: 'button',
        className: `btn btn-sm semiology-axis ${eixo.id === activeSemiologyAxis ? 'btn-primary' : 'btn-outline'}`,
        'aria-pressed': eixo.id === activeSemiologyAxis ? 'true' : 'false',
        title: eixo.desc,
        text: `${eixo.icone} ${eixo.titulo}`,
      });
      btnEixo.addEventListener('click', () => {
        activeSemiologyAxis = eixo.id;
        navBar.querySelectorAll('button').forEach((b) => {
          b.className = 'btn btn-sm semiology-axis btn-outline';
          b.setAttribute('aria-pressed', 'false');
        });
        btnEixo.className = 'btn btn-sm semiology-axis btn-primary';
        btnEixo.setAttribute('aria-pressed', 'true');
        carregarPerguntasNoEixo(perguntasDoEixo(eixo.id), chipsArea);
      });
      navBar.appendChild(btnEixo);
    });

    containerGuia.appendChild(navBar);
    containerGuia.appendChild(chipsArea);
    dom.suggestionsList.appendChild(containerGuia);
    carregarPerguntasNoEixo(perguntasDoEixo(activeSemiologyAxis), chipsArea);
  }

  function carregarPerguntasNoEixo(listaPerguntas, container) {
    clearNode(container);

    if (!listaPerguntas || listaPerguntas.length === 0) {
      container.appendChild(el('div', {
        className: 'semiology-empty',
        text: 'Explore livremente os sintomas do paciente pelo campo de texto abaixo.',
      }));
      return;
    }

    listaPerguntas.forEach((perguntaTexto) => {
      const chip = el('button', {
        type: 'button',
        className: 'suggestion-chip semiology-chip',
        text: `🗣️ "${perguntaTexto}"`,
      });
      chip.addEventListener('click', () => {
        if (dom.questionInput) {
          dom.questionInput.value = String(perguntaTexto);
          dom.questionInput.focus();
        }
      });
      container.appendChild(chip);
    });
  }

  // =========================================================
  // 7. EXAMES LABORATORIAIS E COMPLEMENTARES
  // =========================================================

  function renderExamsCatalog() {
    if (!dom.availableExamsList || !dom.releasedExamsList || !currentCase) return;
    clearNode(dom.availableExamsList);
    clearNode(dom.releasedExamsList);
    dom.releasedExamsList.appendChild(el('div', { className: 'empty-state-notice', text: 'Nenhum exame solicitado até o momento.' }));

    (currentCase.examesDisponiveis || []).forEach((exam) => {
      const btn = el('button', { className: 'btn btn-secondary btn-sm', type: 'button', text: 'Solicitar', dataset: { examId: exam.id } });
      btn.addEventListener('click', () => requestExam(exam.id));
      const row = el('div', { className: 'exam-item-row' }, [
        el('div', {}, [
          el('div', { className: 'exam-name', text: exam.nome }),
          el('small', { className: 'exam-cost', text: `Tempo estimado: +${Number(exam.custoTempoMin) || 0} min virtuais` }),
        ]),
        btn,
      ]);
      dom.availableExamsList.appendChild(row);
    });
  }

  function resetChat() {
    if (!dom.chatHistory || !currentCase) return;
    clearNode(dom.chatHistory);
    const nome = (currentCase.paciente && currentCase.paciente.nome) || 'Paciente';
    const queixa = currentCase.queixaPrincipal || 'Estou passando mal...';
    appendChatBubble('patient', nome, queixa);
    chatTurns.push({ role: 'patient', text: String(queixa) });
  }

  function resetResolutionForm() {
    if (dom.studentDiagnosis) {
      dom.studentDiagnosis.value = '';
      dom.studentDiagnosis.disabled = false;
    }
    if (dom.studentConduct) {
      dom.studentConduct.value = '';
      dom.studentConduct.disabled = false;
    }
    if (dom.submitResolutionBtn) {
      dom.submitResolutionBtn.disabled = false;
      dom.submitResolutionBtn.textContent = '⚖️ Submeter ao Preceptor Avaliador';
    }
  }

  function updateClockUI() {
    if (dom.timeElapsed) dom.timeElapsed.textContent = Core.formatClock(state.elapsedSeconds);
  }

  function checkOutcome() {
    if (state.outcome !== 'EM_ANDAMENTO' && isCaseActive) triggerCriticalOutcome(state.outcome);
  }

  function handleTimeTick() {
    if (!isCaseActive) return;
    state = Core.tick(state, currentCase && currentCase.taxaDecaimento);
    updateClockUI();
    updateMetersUI();
    checkOutcome();
  }

  function applyDecay(deltaVitality, deltaPatience) {
    state = Core.applyDecay(state, deltaVitality, deltaPatience);
    updateMetersUI();
    checkOutcome();
  }

  function setMeter(fill, valueEl, bar, value, levelClass) {
    const rounded = Math.round(value);
    if (valueEl) valueEl.textContent = `${rounded}%`;
    if (fill) {
      fill.style.width = `${value}%`;
      fill.className = `meter-fill ${levelClass}`;
    }
    if (bar) bar.setAttribute('aria-valuenow', String(rounded));
  }

  function updateMetersUI() {
    setMeter(dom.vitalityFill, dom.vitalityValue, dom.vitalityFill && dom.vitalityFill.parentNode, state.vitality, Core.vitalityLevel(state.vitality));
    setMeter(dom.patienceFill, dom.patienceValue, dom.patienceFill && dom.patienceFill.parentNode, state.patience, Core.patienceLevel(state.patience));
  }

  // =========================================================
  // 8. ANAMNESE COM O PACIENTE VIRTUAL (apiLearnClinicalChat)
  // =========================================================

  function buildPatientContext() {
    return Core.buildPatientContext(currentCase, requestedExams, state);
  }

  async function submitPatientQuestion() {
    if (!dom.questionInput || !isCaseActive || !currentCase) return;

    const text = dom.questionInput.value.trim();
    if (!text || chatBusy) return;
    chatBusy = true;

    const studentBubble = appendChatBubble('student', 'Você (Estudante)', text);
    dom.questionInput.value = '';
    if (dom.sendQuestionBtn) dom.sendQuestionBtn.disabled = true;

    const nomePac = currentCase.paciente ? currentCase.paciente.nome : 'Paciente';

    // 1. Reações Gerais e Cotidianas (Paciente Estável)
    const reacoesGerais = [
      `${nomePac} pensa por um instante com a mão no queixo antes de responder...`,
      `${nomePac} ajeita-se com calma no leito e tenta organizar as ideias...`,
      `${nomePac} olha atentamente para você e começa a explicar...`,
      `${nomePac} engole em seco, buscando lembrar dos detalhes do ocorrido...`,
      `${nomePac} respira fundo e responde em tom colaborativo...`,
      `${nomePac} gesticula suavemente enquanto tenta descrever o que sente...`,
      `${nomePac} faz uma pausa reflexiva e retoma a conversa...`,
      `${nomePac} assente com a cabeça antes de responder...`,
      `${nomePac} apoia o braço na cama e detalha a situação...`
    ];

    // 2. Reações de Dor Intensa, Falta de Ar ou Fraqueza (Vitalidade Baixa)
    const reacoesDorOuFraqueza = [
      `${nomePac} aperta o peito com a mão e tenta falar...`,
      `${nomePac} puxa o ar com dificuldade entre os lábios trêmulos...`,
      `${nomePac} faz uma careta nítida de dor e apoia a cabeça na maca...`,
      `${nomePac} responde em tom baixo e pausado devido ao cansaço...`,
      `${nomePac} fecha os olhos sentindo uma pontada forte...`,
      `${nomePac} passa a mão na testa suada, com respiração curta e ofegante...`,
      `${nomePac} tenta encontrar uma posição menos dolorosa antes de sussurrar...`,
      `${nomePac} tosse fraco, demonstrando desconforto evidente...`,
      `${nomePac} aperta a barra lateral da maca enquanto busca forças para responder...`,
      `${nomePac} hesita com náusea antes de conseguir pronunciar as palavras...`
    ];

    // 3. Reações de Ansiedade, Insegurança ou Medo
    const reacoesAnsiosas = [
      `${nomePac} esfrega as mãos nervosamente e responde com voz trêmula...`,
      `${nomePac} olha apreensivo(a) para os aparelhos de monitoramento antes de falar...`,
      `${nomePac} pergunta com o olhar marejado se o quadro é grave...`,
      `${nomePac} morde o lábio inferior inquieto(a), demonstrando angústia...`,
      `${nomePac} gagueja ligeiramente pelo nervosismo antes de completar a frase...`,
      `${nomePac} olha em direção à porta do leito e fala em tom de preocupação...`
    ];

    // 4. Reações de Impaciência, Pressa ou Ceticismo
    const reacoesImpacientes = [
      `${nomePac} cruza os braços impaciente e responde em tom incisivo...`,
      `${nomePac} gesticula demonstrando pressa para que a conduta seja logo tomada...`,
      `${nomePac} suspira fundo, como se estivesse cansado(a) de responder perguntas...`,
      `${nomePac} olha para o relógio na parede antes de retrucar rapidamente...`,
      `${nomePac} balança a cabeça em desaprovação e insiste no medicamento...`,
      `${nomePac} bate a mão na maca, demonstrando irritação com a demora...`,
      `${nomePac} fala em tom ríspido, cobrando exames ou receita direta...`
    ];

    let poolReacoes = reacoesGerais;
    const isExigente = currentCase.contextoOculto && String(currentCase.contextoOculto.temperamento).toLowerCase().includes('exigente');

    if (state.vitality < 45) {
      poolReacoes = reacoesDorOuFraqueza;
    } else if (state.patience < 45 || isExigente) {
      poolReacoes = reacoesImpacientes;
    } else if (state.patience < 70) {
      poolReacoes = reacoesAnsiosas;
    }

    const reacaoSorteada = poolReacoes[Math.floor(Math.random() * poolReacoes.length)];
    const typingBubble = appendChatBubble('patient', nomePac, reacaoSorteada, { italic: true });

    const source = caseSourceOf(currentCase);
    const payload = {
      caseId: String(currentCase.id || 'caso_local').slice(0, 80),
      caseSource: source,
      question: text.slice(0, 500),
      history: chatTurns.slice(-HISTORY_TURNS_SENT),
      patientContext: buildPatientContext(),
    };
    Object.assign(payload, simExtra());

    const response = await callLaift('apiLearnClinicalChat', payload);

    if (typingBubble) typingBubble.remove();
    chatBusy = false;
    if (dom.sendQuestionBtn) dom.sendQuestionBtn.disabled = false;

    if (!(response.success && typeof response.patientReply === 'string' && response.patientReply.trim())) {
      // Sem IA (cota esgotada, ponte ausente ou serviço fora): NADA é inventado. A pergunta não conta, o paciente
      // não responde e a pessoa vê o motivo; pode repetir a pergunta depois.
      if (studentBubble) studentBubble.remove();
      appendSystemNotice(response.quotaExceeded && response.message ? response.message : UNAVAILABLE_MSG);
      dom.questionInput.value = text;
      if (response.quotaExceeded) refreshAiQuota();
      return;
    }

    const falaObtida = response.patientReply.trim();
    appendChatBubble('patient', nomePac, falaObtida);
    chatTurns.push({ role: 'student', text: text.slice(0, 500) });
    chatTurns.push({ role: 'patient', text: falaObtida.slice(0, 500) });

    if (currentCase.tipo === 'emergencia') {
      state = Object.assign({}, state, { patience: Math.max(0, state.patience - 1) });
    }
    updateMetersUI();
    if (dom.chatHistory) dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
  }

  /**
   * Balão do chat. `text` é SEMPRE texto (vem da IA, do caso ou do próprio
   * estudante) — textContent, nunca innerHTML. `opts.italic` marca as
   * reações de "digitando".
   */
  function appendChatBubble(role, author, text, opts) {
    if (!dom.chatHistory) return null;
    const p = el('p', { text: String(text === null || text === undefined ? '' : text) });
    if (opts && opts.italic) p.style.fontStyle = 'italic';
    const bubble = el('div', { className: `chat-bubble ${role}` }, [el('strong', { text: `${author}:` }), p]);
    dom.chatHistory.appendChild(bubble);
    dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
    return bubble;
  }

  function appendSystemNotice(message) {
    if (!dom.chatHistory) return;
    dom.chatHistory.appendChild(el('div', { className: 'chat-bubble system-notice', role: 'status', text: `ℹ️ ${message}` }));
    dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
  }

  // =========================================================
  // 9. EXAMES E CONDUTAS CRÍTICAS
  // =========================================================

  function requestExam(examId) {
    if (!isCaseActive || !currentCase) return;

    const exam = (currentCase.examesDisponiveis || []).find((e) => e.id === examId);
    if (!exam || requestedExams.includes(examId)) return;

    requestedExams.push(examId);
    if (window.ClinicSim) window.ClinicSim.noteExam(examId);

    const btn = dom.availableExamsList
      ? Array.from(dom.availableExamsList.querySelectorAll('button')).find((b) => b.dataset.examId === String(examId))
      : null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Solicitado';
    }

    state = Core.applyExam(state, exam);
    updateClockUI();
    updateMetersUI();
    checkOutcome();

    const emptyNotice = dom.releasedExamsList?.querySelector('.empty-state-notice');
    if (emptyNotice) emptyNotice.remove();

    dom.releasedExamsList?.appendChild(el('div', { className: 'released-exam-card' }, [
      el('h5', { text: `📋 ${exam.nome}` }),
      el('p', { text: exam.resultado }),
    ]));

    if (exam.essencial) {
      appendChatBubble('patient', 'Enfermagem do Leito', `O laudo do exame "${exam.nome}" acabou de chegar da bancada e foi liberado na aba de Exames.`);
    }
  }

  async function triggerCriticalOutcome(outcomeType) {
    isCaseActive = false;
    clearInterval(clockInterval);
    caseOutcome = outcomeType;

    if (dom.studentDiagnosis) dom.studentDiagnosis.disabled = true;
    if (dom.studentConduct) dom.studentConduct.disabled = true;
    if (dom.submitResolutionBtn) dom.submitResolutionBtn.disabled = true;

    if (outcomeType === 'OBITO') {
      await dialogAlert('DESFECHO CRÍTICO: O paciente evoluiu para colapso clínico irreversível por falta de suporte terapêutico em tempo hábil.');
    } else if (outcomeType === 'ABANDONO') {
      await dialogAlert('DESFECHO CLÍNICO: O paciente esgotou a paciência com o atendimento prolongado e optou por evadir da unidade.');
    }

    finalizeClinicalCase();
  }

  // =========================================================
  // 10. FECHAMENTO & AVALIAÇÃO (apiLearnClinicalEvaluate)
  // =========================================================

  const OUTCOME_TO_SERVER = Core.OUTCOME_TO_SERVER;

  async function finalizeClinicalCase() {
    if (!isCaseActive && caseOutcome === 'EM_ANDAMENTO' && !canRetryEvaluation) return;
    if (!currentCase) return;
    pausedSessions.delete(snapshotKey(currentCase));

    isCaseActive = false;
    canRetryEvaluation = false;
    clearInterval(clockInterval);

    if (dom.submitResolutionBtn) {
      dom.submitResolutionBtn.disabled = true;
      dom.submitResolutionBtn.textContent = 'Avaliando com o preceptor (IA)...';
    }

    const diagnosis = (dom.studentDiagnosis?.value || '').trim().slice(0, 2000);
    const conduct = (dom.studentConduct?.value || '').trim().slice(0, 2000);
    const outcome = OUTCOME_TO_SERVER[caseOutcome] || 'concluido';
    const source = caseSourceOf(currentCase);

    const input = {
      caseId: String(currentCase.id || 'caso_local').slice(0, 80),
      caseSource: source,
      attendance: {
        diagnosis,
        conduct,
        examsRequested: requestedExams.slice(0, 30),
        questionsAsked: chatTurns.filter((t) => t.role === 'student').map((t) => t.text.slice(0, 300)).slice(-30),
        elapsedSeconds: state.elapsedSeconds,
        vitality: Math.round(state.vitality),
        outcome,
        toxindrome: currentCase.toxindrome || '',
        agent: currentCase.agentePrincipal || currentCase.agente || '',
      },
    };
    // Casos do acervo: o gabarito é SÓ do servidor (o cliente nem o recebe).
    if (source !== 'acervo') input.answerKey = Core.answerKeyForServer(currentCase);
    Object.assign(input, simExtra());

    const response = await callLaift('apiLearnClinicalEvaluate', input);
    if (window.ClinicSim) {
      // O debrief revela o perfil sorteado só agora; a semente deixa de valer ao fim do caso.
      if (response.success && response.simulation) window.ClinicSim.showDebrief(response.simulation);
      window.ClinicSim.endCase();
    }

    if (dom.submitResolutionBtn) dom.submitResolutionBtn.textContent = '⚖️ Submeter ao Preceptor Avaliador';

    if (response.success && response.result) {
      registrarCasoResolvido(currentCase.id);
      registrarRevisao(currentCase, Core.reviewCorrect(response.result, outcome));
      showPreceptorModal(response.result, outcome, {
        note: response.saved === false ? 'A avaliação foi feita, mas não pôde ser registrada nas suas estatísticas agora.' : '',
      });
      refreshAiQuota();
      return;
    }

    // Sem avaliação do servidor: NÃO há nota local nem leito "Concluído". Quem ainda está no atendimento pode tentar
    // de novo; nos desfechos críticos o resultado fica "indisponível" e nada é registrado.
    const aviso = response.quotaExceeded && response.message ? response.message : UNAVAILABLE_MSG;
    if (response.quotaExceeded) refreshAiQuota();
    if (caseOutcome === 'EM_ANDAMENTO') {
      canRetryEvaluation = true;
      if (dom.submitResolutionBtn) dom.submitResolutionBtn.disabled = false;
      await dialogAlert(aviso);
      return;
    }
    showPreceptorModal(null, outcome, { note: aviso });
  }

  function showPreceptorModal(result, outcome, opts) {
    initDomReferences();
    const o = opts || {};
    if (dom.preceptorGrade) dom.preceptorGrade.textContent = result && Number.isFinite(Number(result.score)) ? String(Math.round(Number(result.score))) : '--';
    if (dom.caseOutcomeTitle) {
      dom.caseOutcomeTitle.textContent = Core.outcomeTitle(outcome);
    }
    if (dom.caseOutcomeSummary) dom.caseOutcomeSummary.textContent = result ? String(result.verdict || '') : 'Avaliação indisponível.';

    if (dom.preceptorFeedbackText) {
      const box = dom.preceptorFeedbackText;
      clearNode(box);
      if (o.note) box.appendChild(el('p', { className: 'preceptor-note', role: 'status', text: o.note }));
      if (result) {
        box.appendChild(el('p', { className: 'feedback-paragraph', text: result.feedback || '' }));
        const addList = (title, items) => {
          const lista = Array.isArray(items) ? items.filter(Boolean) : [];
          if (!lista.length) return;
          box.appendChild(el('strong', { text: title }));
          box.appendChild(el('ul', { className: 'feedback-list' }, lista.map((item) => el('li', { text: item }))));
        };
        addList('Pontos fortes:', result.strengths);
        addList('O que melhorar:', result.improvements);
      }
    }

    openModal(dom.preceptorModal, window.closePreceptorModal);
  }

  function switchTab(tabId) {
    dom.tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    dom.tabPanes.forEach((pane) => {
      pane.classList.toggle('active', pane.id === tabId);
    });
  }

  // =========================================================
  // 11. GERAÇÃO DE CASO COM IA (apiLearnClinicalGenerateCase)
  // =========================================================

  async function solicitarCasoProcedural(temaPredefinido = '') {
    initDomReferences();
    const btn = dom.btnGenerateAiCase;
    if (btn && btn.disabled) {
      if (lastQuota && lastQuota.generateCase && lastQuota.generateCase.remaining <= 0) {
        dialogAlert(`Você já usou os ${lastQuota.generateCase.limit} casos com IA de hoje; a cota volta amanhã. O plantão e o acervo continuam disponíveis.`);
      }
      return;
    }

    const promptPadrao = temaPredefinido ? `Variação clínica de ${temaPredefinido}` : 'Intoxicação por Paracetamol';
    const topico = await dialogPrompt(
      'Qual agravo farmacológico ou toxicológico deseja simular?\n\nExemplos:\n• Intoxicação por Paracetamol\n• Paciente exigente pedindo Ciprofloxacino para gripe\n• Intoxicação Ocupacional por Organofosforados\n• Idoso polimedicado com interação Varfarina + AINE',
      { title: 'Novo caso com IA', label: 'Agravo ou situação clínica', defaultValue: promptPadrao, maxLength: TOPIC_MAX, okLabel: 'Gerar caso', cancelLabel: 'Cancelar' }
    );
    if (!topico || !topico.trim()) return;
    const tema = topico.trim().slice(0, TOPIC_MAX);

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Gerando caso com IA...';
    }
    if (typeof showStatus === 'function') showStatus('Gerando um novo caso e o roteiro semiológico com IA...', 'loading');

    const res = await callLaift('apiLearnClinicalGenerateCase', { topic: tema, difficulty: 'Avançado' });
    if (typeof hideStatus === 'function') hideStatus();

    if (res.success && res.case && typeof res.case === 'object') {
      const caso = Object.assign({}, res.case, { caseSource: 'ia' });
      if (typeof clinicalCases !== 'undefined' && Array.isArray(clinicalCases)) clinicalCases.unshift(caso);
      await refreshAiQuota();
      await dialogAlert(`Novo paciente admitido no leito: ${(caso.paciente && caso.paciente.nome) || 'Paciente'} (${caso.titulo || 'Caso Clínico'}).`);
      openBed(caso);
      return;
    }

    if (res.quotaExceeded) {
      await refreshAiQuota();
      await dialogAlert(res.message);
      return;
    }

    // Falha da IA ou do servidor: não se inventa caso. Recusa de tema e outros erros do servidor trazem a própria
    // mensagem (clara); sem ponte ou sem rede, o aviso padrão.
    setGenerateButtonIdle();
    await dialogAlert(res.message || UNAVAILABLE_MSG);
  }

  // =========================================================
  // 12. INICIALIZAÇÃO E OUVINTES DE EVENTOS
  // =========================================================

  function init() {
    initDomReferences();

    dom.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // O clique em "Perguntar" é ligado em clinica-page.js; aqui só o Enter.
    dom.questionInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitPatientQuestion();
    });
  }

  return {
    init,
    showBedsDashboard,
    renderBedsGrid,
    setModoExibicao,
    carregarAcervoComunitario,
    filtrarAcervo,
    assumirCasoDoAcervo,
    gerarVariacaoComIa,
    abrirRadarEpidemiologico,
    fecharRadarEpidemiologico,
    openBed,
    returnToBeds,
    solicitarCasoProcedural,
    startCase,
    requestExam,
    switchTab,
    submitPatientQuestion,
    finalizeClinicalCase,
    renderSemiologyGuide,
    refreshAiQuota,
    getState: () => state,
    isPausedFor: (id) => pausedSessions.has(String(id)),
  };
})();

// Globais mantidos por compatibilidade (clinica-page.js e testes E2E usam ClinicEngine).
window.ClinicEngine = ClinicEngine;
window.submitPatientQuestion = ClinicEngine.submitPatientQuestion;
window.finalizeClinicalCase = ClinicEngine.finalizeClinicalCase;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ClinicEngine.init);
} else {
  ClinicEngine.init();
}
