/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * trilhas.js — modo "Trilhas e desafios" do Atlas (A4), atrás da flag `trilhas`.
 *  - Trilhas guiadas: passos por estruturas que já existem no Atlas; a câmera
 *    vai até cada uma e o progresso fica neste aparelho.
 *  - Encontre a estrutura: livre, sem tempo; tocar no 3D ou nomear pela lista.
 *  - Desafio diário: 3 questões que mudam por data (a mesma data dá o mesmo
 *    desafio), feitas com casos do Quiz e estruturas das trilhas.
 * Implementa o contrato Mode (enter/exit/sheetContent). Regras puras em
 * trilhas-core.js; esta camada só desenha e liga os eventos.
 */

import { isCorrect } from './quiz.js';
import { seedFromSearch, randomSeed, shuffleWithSeed } from './quiz-select.js';
import {
  DAILY_COUNT, dateKey, buildItems, pickDaily, listOptions, answerSid, firstSentence, createProgressStore,
} from './trilhas-core.js';

const CSS_HREF = 'css/trilhas.css';

function safeStorage() {
  try { return window.localStorage; } catch (e) { return null; }
}

/** Carrega o CSS do modo só quando ele abre (fora do caminho de abertura do Atlas). */
function ensureStyles() {
  if (document.querySelector('link[data-trilhas-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.setAttribute('data-trilhas-css', '');
  document.head.appendChild(link);
}

/**
 * @param {Object} opts
 * @param {Object} opts.bus  { on, emit, EVENTS }
 * @param {Function} opts.getLabel   (sid) => nome
 * @param {Function} opts.loadTrilhas  () => Promise<{trilhas, desafio}>
 * @param {Function} opts.loadCases    () => Promise<Array> (quiz-cases.json)
 * @param {Function} [opts.resolveSid]  aliases antigos
 * @param {Function} [opts.systemOf]    (sid) => sistema
 * @param {Function} [opts.groupOf]     (sid) => todos os sids da mesma estrutura (lados)
 * @param {Function} [opts.prepareCase] (caso) => Promise, carrega a resposta no corpo sem selecionar
 * @param {Function} [opts.getSummary]  (sid) => Promise<string> resumo já existente da ficha
 * @param {Function} [opts.openFicha]   () => abre a ficha da estrutura selecionada
 * @param {Object}   [opts.storage]     padrão: localStorage
 * @param {Function} [opts.now]         padrão: () => new Date()
 * @param {string}   [opts.search]      location.search (?seed= fixa o sorteio do "encontre")
 */
export function createTrilhasMode({
  bus, getLabel, loadTrilhas, loadCases, resolveSid, systemOf, groupOf, prepareCase, getSummary, openFicha,
  storage = safeStorage(), now = () => new Date(), search = '',
}) {
  const { on, emit, EVENTS } = bus;
  const progress = createProgressStore(storage);
  const h = (tag, attrs, children) => window.LaiftDom.h(tag, attrs, children);

  let isRunning = false;
  let sheetNode = null;
  let data = { trilhas: [], desafio: { excluirCasos: [] } };
  let items = [];
  let offSelect = null;
  let pending = null; // { item, onPick(sid) } — a próxima seleção por toque no 3D responde a isto
  let renderToken = 0; // descarta resumos que chegam depois de a tela mudar
  let lastFind = null;
  let findSeed = seedFromSearch(search) ?? randomSeed();
  let findCount = 0;

  function ensureNode() {
    if (!sheetNode) {
      sheetNode = document.createElement('div');
      sheetNode.id = 'trilhasCard';
    }
    return sheetNode;
  }

  function show(children, focusHeading = true) {
    ensureNode();
    renderToken++;
    pending = null;
    window.LaiftDom.clear(sheetNode);
    sheetNode.appendChild(h('div', { className: 'quiz-card trilhas-card' }, children));
    if (focusHeading) {
      const head = sheetNode.querySelector('[data-foco]');
      if (head) head.focus({ preventScroll: true });
    }
  }

  const button = (text, onClick, extra = {}) => h('button', { type: 'button', className: 'quiz-btn', onClick, ...extra }, [text]);
  const backBar = (onBack, label = 'Voltar ao início') => h('div', { className: 'trilhas-nav' }, [button(`← ${label}`, onBack, { className: 'quiz-btn trilhas-voltar' })]);
  const heading = (text) => h('h3', { className: 'quiz-summary-title', tabindex: '-1', 'data-foco': '' }, [text]);
  const status = () => h('div', { className: 'quiz-feedback trilhas-feedback', role: 'status', 'aria-live': 'polite', hidden: true }, []);

  function setFeedback(kind, nodes) {
    const box = sheetNode.querySelector('.trilhas-feedback');
    if (!box) return null;
    window.LaiftDom.clear(box);
    box.dataset.kind = kind;
    nodes.forEach((n) => box.appendChild(n));
    box.hidden = false;
    return box;
  }

  const labelOf = (sid) => getLabel(sid);
  const listSeed = () => (findSeed + findCount * 7919) & 0x7fffffff;

  function selectInScene(sid) {
    emit(EVENTS.STRUCTURE_SELECT, { sid, source: 'api' });
  }

  // ---- Início -------------------------------------------------------------
  function renderHome() {
    const key = dateKey(now());
    const done = progress.daily(key);
    const streak = progress.streak(key);
    const concluidas = data.trilhas.filter((t) => progress.trail(t.id).done).length;
    const f = progress.state().find;
    const card = (titulo, texto, resumo, onClick, id) => h('button', { type: 'button', className: 'trilhas-opcao', id, onClick }, [
      h('strong', {}, [titulo]),
      h('span', { className: 'trilhas-opcao-texto' }, [texto]),
      h('span', { className: 'trilhas-opcao-resumo' }, [resumo]),
    ]);
    show([
      heading('Trilhas e desafios'),
      h('p', {}, ['Treine com o que já está no Atlas. O progresso fica salvo só neste aparelho.']),
      card('Trilhas guiadas', 'Passo a passo por um grupo de estruturas, com a câmera levando você até cada uma.',
        `${concluidas} de ${data.trilhas.length} concluída${concluidas === 1 ? '' : 's'}`, renderTrails, 'trilhasBtnTrilhas'),
      card('Encontre a estrutura', 'Sem tempo: toque na estrutura pedida ou diga o nome da que está destacada.',
        f.tries ? `${f.hits} acerto${f.hits === 1 ? '' : 's'} em ${f.tries} tentativa${f.tries === 1 ? '' : 's'}` : 'Ainda sem tentativas', () => startFind('tocar'), 'trilhasBtnEncontre'),
      card('Desafio diário', `${DAILY_COUNT} questões novas por dia, as mesmas para todos na mesma data.`,
        done ? `Hoje: ${done.correct} de ${done.results.length}. Sequência: ${streak} dia${streak === 1 ? '' : 's'}` : (streak ? `Hoje: não feito. Sequência: ${streak} dia${streak === 1 ? '' : 's'}` : 'Hoje: não feito'), startDaily, 'trilhasBtnDesafio'),
    ]);
  }

  // ---- Trilhas guiadas ----------------------------------------------------
  function renderTrails() {
    show([
      backBar(renderHome),
      heading('Trilhas guiadas'),
      data.trilhas.length ? h('ul', { className: 'trilhas-lista' }, data.trilhas.map((t) => {
        const p = progress.trail(t.id);
        const n = Math.min(p.visited.length, t.passos.length);
        return h('li', {}, [h('button', { type: 'button', className: 'trilhas-opcao', 'data-trilha': t.id, onClick: () => openTrail(t) }, [
          h('strong', {}, [t.titulo]),
          h('span', { className: 'trilhas-opcao-texto' }, [t.descricao]),
          h('span', { className: 'trilhas-opcao-resumo' }, [p.done ? `Concluída (${t.passos.length} passos)` : `${n} de ${t.passos.length} passos vistos`]),
        ])]);
      })) : h('p', {}, ['Nenhuma trilha disponível agora.']),
    ]);
  }

  function openTrail(trail) {
    const p = progress.trail(trail.id);
    const first = trail.passos.findIndex((sid) => !p.visited.includes(sid));
    renderStep(trail, first < 0 ? 0 : first);
  }

  function renderStep(trail, index) {
    const sid = trail.passos[index];
    const total = trail.passos.length;
    progress.visit(trail.id, sid, total);
    const visited = progress.trail(trail.id).visited;
    const resumo = h('p', { className: 'trilhas-resumo', 'aria-live': 'polite' }, []);
    const last = index === total - 1;
    show([
      backBar(renderTrails, 'Trilhas'),
      h('div', { className: 'quiz-step' }, [`${trail.titulo} · passo ${index + 1} de ${total}`]),
      h('ol', { className: 'trilhas-pontos', 'aria-label': 'Passos da trilha' }, trail.passos.map((s, i) => h('li', {
        className: 'trilhas-ponto', 'data-estado': i === index ? 'atual' : visited.includes(s) ? 'visto' : 'novo',
        ...(i === index ? { 'aria-current': 'step' } : {}),
      }, [h('span', { className: 'trilhas-ponto-texto' }, [`${i + 1}. ${labelOf(s)}${visited.includes(s) ? ' (visto)' : ''}`])]))),
      h('h3', { className: 'quiz-summary-title', tabindex: '-1', 'data-foco': '' }, [labelOf(sid)]),
      resumo,
      h('div', { className: 'trilhas-nav' }, [
        button('Anterior', () => renderStep(trail, index - 1), { disabled: index === 0 }),
        button(last ? 'Concluir' : 'Próximo', () => (last ? renderTrailEnd(trail) : renderStep(trail, index + 1)), { className: 'quiz-btn trilhas-primario' }),
      ]),
      openFicha ? button('Abrir a ficha completa', () => openFicha(), { className: 'quiz-btn trilhas-secundario' }) : null,
    ]);
    selectInScene(sid);
    const token = renderToken;
    if (getSummary) {
      Promise.resolve(getSummary(sid)).then((txt) => {
        const frase = firstSentence(txt);
        if (token === renderToken && frase) resumo.textContent = frase;
      }).catch(() => {});
    }
  }

  function renderTrailEnd(trail) {
    show([
      heading('Trilha concluída'),
      h('p', {}, [`Você passou pelos ${trail.passos.length} passos de "${trail.titulo}".`]),
      h('div', { className: 'trilhas-nav' }, [
        button('Rever a trilha', () => renderStep(trail, 0)),
        button('Outras trilhas', renderTrails, { className: 'quiz-btn trilhas-primario' }),
      ]),
    ]);
    selectInScene(null);
  }

  // ---- Encontre a estrutura -----------------------------------------------
  function nextFindTarget() {
    const pool = items.filter((i) => i.tipo === 'estrutura');
    if (!pool.length) return null;
    findCount++;
    const candidates = pool.length > 1 ? pool.filter((i) => i.id !== (lastFind && lastFind.id)) : pool;
    const pick = shuffleWithSeed(candidates, (findSeed + findCount) & 0x7fffffff)[0];
    lastFind = pick;
    return pick;
  }

  function startFind(modo) {
    const item = nextFindTarget();
    if (!item) { show([backBar(renderHome), heading('Encontre a estrutura'), h('p', {}, ['Nenhuma estrutura disponível agora.'])]); return; }
    modo === 'nomear' ? renderNamePrompt(item) : renderTapPrompt(item);
  }

  const modeSwitch = (modo) => h('div', { className: 'trilhas-nav', role: 'group', 'aria-label': 'Como responder' }, [
    button('Tocar no 3D', () => startFind('tocar'), { 'aria-pressed': String(modo === 'tocar') }),
    button('Dizer o nome', () => startFind('nomear'), { 'aria-pressed': String(modo === 'nomear') }),
  ]);

  function renderTapPrompt(item) {
    let counted = false;
    const fb = status();
    const nextBtn = () => button('Próxima estrutura', () => startFind('tocar'), { className: 'quiz-btn quiz-next trilhas-primario' });
    show([
      backBar(renderHome),
      heading('Encontre a estrutura'),
      modeSwitch('tocar'),
      h('p', { className: 'quiz-prompt' }, [item.prompt]),
      fb,
      h('div', { className: 'trilhas-nav trilhas-acoes' }, [
        button('Mostrar onde fica', () => {
          if (!counted) { counted = true; progress.recordFind(false); }
          selectInScene(item.sid);
          setFeedback('dica', [h('p', { className: 'quiz-result' }, [`${labelOf(item.sid)} está destacada no 3D.`]), nextBtn()]);
          pending = null;
        }),
        button('Pular', () => startFind('tocar')),
      ]),
    ]);
    if (prepareCase) Promise.resolve(prepareCase(item.caso)).catch(() => {});
    pending = {
      item,
      onPick(sid) {
        const ok = isCorrect(item.caso, sid, { resolve: resolveSid, systemOf });
        if (ok) {
          if (!counted) { counted = true; progress.recordFind(true); }
          setFeedback('acerto', [h('p', { className: 'quiz-result' }, [`Acertou: ${labelOf(sid)}.`]), nextBtn()]);
          pending = null;
        } else {
          if (!counted) { counted = true; progress.recordFind(false); }
          setFeedback('erro', [h('p', { className: 'quiz-result' }, [`Não é essa: você tocou em ${labelOf(sid)}. Tente de novo.`])]);
        }
      },
    };
  }

  function renderNamePrompt(item) {
    const fb = status();
    const options = listOptions(item, items, labelOf, listSeed());
    let answered = false;
    show([
      backBar(renderHome),
      heading('Encontre a estrutura'),
      modeSwitch('nomear'),
      h('p', { className: 'quiz-prompt' }, ['Qual é o nome da estrutura destacada no 3D?']),
      options.length
        ? h('div', { className: 'trilhas-opcoes', role: 'group', 'aria-label': 'Nomes possíveis' }, options.map((o) => button(o.label, () => {
          if (answered) return;
          answered = true;
          progress.recordFind(o.correct);
          setFeedback(o.correct ? 'acerto' : 'erro', [
            h('p', { className: 'quiz-result' }, [o.correct ? `Acertou: ${o.label}.` : `Era ${labelOf(item.sid)}.`]),
            button('Próxima estrutura', () => startFind('nomear'), { className: 'quiz-btn quiz-next trilhas-primario' }),
          ]);
        }, { 'data-correta': o.correct ? '1' : '0' })))
        : h('p', {}, ['Sem alternativas suficientes para esta estrutura.']),
      fb,
      button('Pular', () => startFind('nomear'), { className: 'quiz-btn trilhas-secundario' }),
    ]);
    if (prepareCase) Promise.resolve(prepareCase(item.caso)).catch(() => {});
    selectInScene(item.sid);
  }

  // ---- Desafio diário -----------------------------------------------------
  function startDaily() {
    const key = dateKey(now());
    const done = progress.daily(key);
    if (done) { renderDailyDone(key); return; }
    const questions = pickDaily(items, key);
    if (!questions.length) { show([backBar(renderHome), heading('Desafio diário'), h('p', {}, ['Nenhuma questão disponível agora.'])]); return; }
    renderQuestion(key, questions, 0, []);
  }

  function renderQuestion(key, questions, index, results) {
    const item = questions[index];
    const last = index === questions.length - 1;
    const fb = status();
    let answered = false;
    const conclude = (ok) => {
      const next = [...results, ok];
      return button(last ? 'Ver resultado' : 'Próxima questão', () => (last ? finishDaily(key, next) : renderQuestion(key, questions, index + 1, next)), { className: 'quiz-btn quiz-next trilhas-primario' });
    };
    const explain = (ok) => {
      const nodes = [h('p', { className: 'quiz-result' }, [ok ? 'Acertou.' : `Resposta: ${labelOf(answerSid(item))}.`])];
      if (item.caso.explanation_pt) nodes.push(h('p', { className: 'quiz-explanation' }, [item.caso.explanation_pt]));
      nodes.push(conclude(ok));
      return nodes;
    };
    const finish = (ok, revealSid) => {
      answered = true;
      pending = null;
      if (revealSid) selectInScene(revealSid);
      setFeedback(ok ? 'acerto' : 'erro', explain(ok));
    };
    const options = listOptions(item, items, labelOf, hashSeed(key, index));
    const viaLista = () => {
      if (answered) return;
      pending = null;
      const box = sheetNode.querySelector('.trilhas-opcoes');
      if (box) box.hidden = false;
      const trig = sheetNode.querySelector('.trilhas-lista-btn');
      if (trig) trig.hidden = true;
      if (item.tipo === 'estrutura') {
        const q = sheetNode.querySelector('.quiz-prompt');
        if (q) q.textContent = 'Qual é o nome da estrutura destacada no 3D?';
        selectInScene(item.sid);
      }
    };
    show([
      h('div', { className: 'quiz-step' }, [`Desafio diário · questão ${index + 1} de ${questions.length}`]),
      h('h3', { className: 'quiz-summary-title', tabindex: '-1', 'data-foco': '' }, ['Desafio diário']),
      h('p', { className: 'quiz-prompt' }, [item.prompt]),
      options.length ? h('div', { className: 'trilhas-opcoes', role: 'group', 'aria-label': 'Respostas possíveis', hidden: true }, options.map((o) => button(o.label, () => {
        if (answered) return;
        finish(o.correct, o.correct ? null : answerSid(item));
      }, { 'data-correta': o.correct ? '1' : '0' }))) : null,
      fb,
      options.length ? button('Responder por lista, sem tocar no 3D', viaLista, { className: 'quiz-btn trilhas-secundario trilhas-lista-btn' }) : null,
      backBar(renderHome, 'Sair do desafio'),
    ]);
    if (prepareCase) Promise.resolve(prepareCase(item.caso)).catch(() => {});
    pending = {
      item,
      onPick(sid) {
        if (answered) return;
        const ok = isCorrect(item.caso, sid, { resolve: resolveSid, systemOf });
        finish(ok, ok ? null : answerSid(item));
      },
    };
  }

  function hashSeed(key, index) {
    let s = index + 1;
    for (let i = 0; i < key.length; i++) s = (s * 31 + key.charCodeAt(i)) & 0x7fffffff;
    return s;
  }

  function finishDaily(key, results) {
    progress.recordDaily(key, results);
    renderDailyDone(key);
  }

  function renderDailyDone(key) {
    const d = progress.daily(key);
    const streak = progress.streak(key);
    const total = d.results.length;
    show([
      heading('Desafio de hoje concluído'),
      h('p', { className: 'trilhas-placar', role: 'status' }, [`Você acertou ${d.correct} de ${total}.`]),
      h('ul', { className: 'trilhas-resultado' }, d.results.map((ok, i) => h('li', {}, [`Questão ${i + 1}: ${ok ? 'acerto' : 'erro'}`]))),
      h('p', {}, [`Sequência: ${streak} dia${streak === 1 ? '' : 's'} seguido${streak === 1 ? '' : 's'}. Um desafio novo aparece amanhã.`]),
      h('div', { className: 'trilhas-nav' }, [
        button('Treinar mais', () => startFind('tocar')),
        button('Voltar ao início', renderHome, { className: 'quiz-btn trilhas-primario' }),
      ]),
    ]);
    selectInScene(null);
  }

  // ---- Contrato Mode ------------------------------------------------------
  function handlePick({ sid, source } = {}) {
    if (!isRunning || !pending || source !== 'pick' || !sid) return;
    pending.onPick(sid);
  }

  return {
    id: 'trilhas',
    label: 'Trilhas e desafios',
    icon: 'route',

    async enter() {
      isRunning = true;
      ensureStyles();
      let cases = [];
      try { data = { ...data, ...(await loadTrilhas()) }; } catch (e) { console.warn('[trilhas] trilhas indisponíveis:', e); }
      try { cases = await loadCases(); } catch (e) { cases = []; }
      items = buildItems({
        cases, excluded: (data.desafio && data.desafio.excluirCasos) || [], trails: data.trilhas || [], labelOf, groupOf,
      });
      offSelect = on(EVENTS.STRUCTURE_SELECT, handlePick);
      renderHome();
    },

    exit() {
      isRunning = false;
      pending = null;
      renderToken++;
      if (offSelect) { offSelect(); offSelect = null; }
    },

    sheetContent() {
      return ensureNode();
    },
  };
}
