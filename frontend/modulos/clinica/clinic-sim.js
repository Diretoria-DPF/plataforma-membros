/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinic-sim.js — "Modo simulação (beta)" da Clínica Virtual (ADR 0009).
 *
 * Aparece SÓ se o servidor avisar que a simulação está disponível: a resposta de apiLearnGetMyAiQuota (que a clínica já
 * chama) traz `simulation: { available: true, version }` quando a flag clinical_sim_enabled está ligada para a pessoa
 * (maior de 18 anos). Sem esse aviso nada aparece e nenhum parâmetro novo é enviado: a clínica funciona como sempre.
 *
 * Com o modo ligado, cada caso novo sorteia uma semente (inteira, no navegador) e o motor passa `simulation` em
 * apiLearnClinicalChat/Evaluate. A semente NÃO revela o paciente: quem sorteia e reconstrói os eixos (personalidade,
 * letramento em saúde, recall, confusão) é o servidor, a cada turno. Os eixos ficam ocultos até o debrief, que vem na
 * resposta da avaliação. Faixa fixa durante o caso: "Caso de treino. Não define conduta."
 *
 * SEGURANÇA: tudo que vem do servidor (rótulos do debrief) entra no DOM só por textContent/createElement.
 */
const ClinicSim = (() => {
  const VERSION = 'sim-v1';
  const SEED_MAX = 2147483647;
  const ELAPSED_MAX = 21600;
  const EVENTS_MAX = 30;
  const EVENT_RE = /^[a-z0-9][a-z0-9_:.-]{0,59}$/;
  const BANNER_TEXT = 'Caso de treino. Não define conduta.';
  const TOGGLE_LABEL = 'Modo simulação (beta)';
  const TOGGLE_HINT = 'Paciente com personalidade e jeito de falar sorteados. Vale a partir do próximo caso; o perfil só é revelado no fim.';
  const DIFFICULTY_BY_LABEL = { basico: 'basico', intermediario: 'intermediario', avancado: 'avancado' };

  let available = false;
  let wantsSimulation = false;
  let active = false;
  let seed = null;
  let difficulty;
  let events = [];

  function byId(id) {
    return typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.keys(props || {}).forEach((key) => {
      if (key === 'text') node.textContent = String(props[key]);
      else if (key === 'className') node.className = props[key];
      else node.setAttribute(key, props[key]);
    });
    (children || []).forEach((child) => node.appendChild(child));
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  /** Semente inteira de 0 a SEED_MAX, do gerador seguro do navegador (Math.random só como reserva). */
  function newSeed() {
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (c && typeof c.getRandomValues === 'function') {
      return c.getRandomValues(new Uint32Array(1))[0] % (SEED_MAX + 1);
    }
    return Math.floor(Math.random() * (SEED_MAX + 1));
  }

  /** 'Básico' | 'Intermediário' | 'Avançado' (formato dos casos) → 'basico' | ... ; desconhecido = undefined. */
  function difficultyOf(value) {
    const folded = String(value === undefined || value === null ? '' : value)
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return DIFFICULTY_BY_LABEL[folded];
  }

  function eventName(raw) {
    const slug = String(raw === undefined || raw === null ? '' : raw).toLowerCase().replace(/[^a-z0-9_:.-]+/g, '_').slice(0, 55);
    const name = 'exam:' + slug;
    return EVENT_RE.test(name) ? name : null;
  }

  // ---------------------------------------------------------------------
  // Interface
  // ---------------------------------------------------------------------
  function renderToggle() {
    const box = byId('simModeBox');
    if (!box) return;
    clear(box);
    box.classList.toggle('hidden', !available);
    if (!available) return;
    const input = el('input', { type: 'checkbox', id: 'simModeToggle' });
    input.checked = wantsSimulation;
    input.addEventListener('change', () => setWanted(input.checked));
    box.appendChild(el('label', { className: 'sim-mode-label', for: 'simModeToggle' }, [input, el('span', { text: ' ' + TOGGLE_LABEL })]));
    box.appendChild(el('p', { className: 'sim-mode-hint', text: TOGGLE_HINT }));
  }

  function renderBanner() {
    const banner = byId('simBanner');
    if (!banner) return;
    banner.textContent = active ? BANNER_TEXT : '';
    banner.classList.toggle('hidden', !active);
  }

  function clearDebrief() {
    const box = byId('simDebrief');
    if (!box) return;
    clear(box);
    box.classList.add('hidden');
  }

  function setWanted(value) {
    wantsSimulation = !!value && available;
  }

  // ---------------------------------------------------------------------
  // Ganchos do motor (clinic-engine.js)
  // ---------------------------------------------------------------------
  /** Recebe `res.simulation` de apiLearnGetMyAiQuota. Qualquer outra coisa = indisponível. */
  function setAvailability(simulation) {
    available = !!simulation && simulation.available === true && simulation.version === VERSION;
    if (!available) wantsSimulation = false;
    renderToggle();
    return available;
  }

  /** Início de um caso: com o modo ligado, sorteia a semente; casos gerados na sessão ('ia') nunca entram. */
  function onCaseStart(source, caseObj) {
    events = [];
    clearDebrief();
    active = available && wantsSimulation && (source === 'builtin' || source === 'acervo');
    seed = active ? newSeed() : null;
    difficulty = active && source === 'builtin' ? difficultyOf(caseObj && caseObj.dificuldade) : undefined;
    renderBanner();
    return active;
  }

  /** Exame solicitado = evento que pode fazer o quadro do caso avançar de estágio (decidido no servidor). */
  function noteExam(examId) {
    if (!active) return;
    const name = eventName(examId);
    if (name && !events.includes(name) && events.length < EVENTS_MAX) events = events.concat([name]);
  }

  /** `{ simulation }` para somar ao payload do chat/avaliação, ou {} com o modo desligado. */
  function extraFor(elapsedSeconds) {
    if (!active || seed === null) return {};
    const elapsed = Math.min(ELAPSED_MAX, Math.max(0, Math.floor(Number(elapsedSeconds) || 0)));
    const simulation = { seed, version: VERSION, elapsedSeconds: elapsed, events: events.slice() };
    if (difficulty) simulation.difficulty = difficulty;
    return { simulation };
  }

  function addRow(list, text) {
    list.appendChild(el('li', { text }));
  }

  /** Debrief da avaliação: revela os eixos do paciente e a nota por componente. Só texto, e só em caso simulado. */
  function showDebrief(simulation) {
    const box = byId('simDebrief');
    if (!active || !box || !simulation || typeof simulation !== 'object') return false;
    clear(box);
    box.classList.remove('hidden');
    box.appendChild(el('h4', { text: 'Perfil do paciente (revelado agora)' }));
    const axes = el('ul', { className: 'sim-debrief-list' });
    (Array.isArray(simulation.axes) ? simulation.axes : []).forEach((a) => addRow(axes, String(a.axisLabel) + ': ' + String(a.label)));
    box.appendChild(axes);
    const parts = simulation.components && typeof simulation.components === 'object' ? simulation.components : null;
    if (parts) {
      const weights = simulation.weights || {};
      const names = { hipotese: 'Hipótese', conduta: 'Conduta', processo: 'Processo', comunicacao: 'Comunicação adaptada' };
      box.appendChild(el('h4', { text: 'Nota por componente' }));
      const list = el('ul', { className: 'sim-debrief-list' });
      Object.keys(names).forEach((key) => addRow(list, names[key] + ': ' + String(parts[key]) + ' de ' + String(weights[key])));
      box.appendChild(list);
    }
    return true;
  }

  /** Fim do caso (o debrief já foi mostrado ou a avaliação falhou): a semente deixa de valer. */
  function endCase() {
    active = false;
    seed = null;
    events = [];
    renderBanner();
  }

  return {
    VERSION,
    BANNER_TEXT,
    TOGGLE_LABEL,
    setAvailability,
    isAvailable: () => available,
    isActive: () => active,
    setWanted,
    onCaseStart,
    noteExam,
    extraFor,
    showDebrief,
    endCase,
    renderToggle,
  };
})();

window.ClinicSim = ClinicSim;
