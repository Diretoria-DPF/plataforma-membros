/**
 * search-box.js — caixa de busca do Atlas v2
 * Onda 1, WP09. Campo com autocomplete, navegação por teclado e histórico.
 */

import { normalize, buildSearchIndex, search } from './search-index.js';
import { EVENTS } from '../core/bus.js';
import { SYSTEMS } from '../core/contracts.js';

const { h, clear } = window.LaiftDom;
const STORAGE_KEY = 'atlas.recentSearches';
const MAX_RECENT = 5;

/**
 * @typedef {Object} SearchResult
 * @property {string} sid
 * @property {string} label
 * @property {string} systemId
 * @property {string} [side]
 */

/**
 * @param {HTMLElement} container
 * @param {{bus: Object, getIndex: Function, onOpenSystem?: Function}} opts
 * @returns {{open(query?: string): void, close(): void, dispose(): void}}
 */
/** Lupa em SVG (createElementNS — sem innerHTML). */
function searchIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'atlas-search-icon');
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', '11'); circle.setAttribute('cy', '11'); circle.setAttribute('r', '7');
  const line = document.createElementNS(NS, 'path');
  line.setAttribute('d', 'M16.5 16.5 L21 21');
  [circle, line].forEach((n) => {
    n.setAttribute('fill', 'none');
    n.setAttribute('stroke', 'currentColor');
    n.setAttribute('stroke-width', '2.2');
    n.setAttribute('stroke-linecap', 'round');
    svg.appendChild(n);
  });
  return svg;
}

export function createSearchBox(container, opts) {
  const { bus, getIndex, onOpenSystem = () => {} } = opts;

  // Estado
  let isOpen = false;
  let index = null;
  let debounceTimer = null;
  let activeIndex = -1;
  let results = [];
  let inputEl = null;
  let listboxEl = null;

  // Root elements
  const root = h('div', { className: 'atlas-search-root' });
  container.appendChild(root);

  // Botão collapsed
  // Campo de busca sempre visível na barra superior (antes era um botão
  // vazio de 44px, sem ícone nem texto — ninguém achava a busca).
  const toggleBtn = h('button', {
    type: 'button',
    className: 'atlas-search-toggle',
    'aria-label': 'Buscar estrutura',
    title: 'Buscar estrutura ( / )',
    onClick: () => open(),
  });
  toggleBtn.appendChild(searchIcon());
  toggleBtn.appendChild(h('span', { className: 'atlas-search-toggle-text', text: 'Buscar estrutura…' }));

  // Overlay container (hidden by default)
  const overlayEl = h('div', { className: 'atlas-search-overlay', hidden: true });

  // Overlay interior (para responsividade mobile/desktop)
  const overlayInner = h('div', { className: 'atlas-search-overlay-inner' });

  // Cabeçalho do overlay
  const headerEl = h('div', { className: 'atlas-search-header' });

  // Input
  inputEl = h('input', {
    className: 'atlas-search-input',
    type: 'text',
    role: 'combobox',
    'aria-expanded': 'false',
    'aria-controls': 'atlas-search-listbox',
    placeholder: 'Buscar: coração, fêmur, nervo vago…',
    autocomplete: 'off',
    inputmode: 'search',
    onInput: handleInput,
    onKeyDown: handleKeyDown,
  });

  // Listbox
  listboxEl = h('div', {
    id: 'atlas-search-listbox',
    className: 'atlas-search-listbox',
    role: 'listbox',
  });

  headerEl.appendChild(inputEl);
  overlayInner.appendChild(headerEl);
  overlayInner.appendChild(listboxEl);
  overlayEl.appendChild(overlayInner);

  root.appendChild(toggleBtn);
  // O overlay vai direto no <body>: a barra superior usa backdrop-filter,
  // que vira "containing block" de position:fixed — dentro dela o overlay
  // ficava preso à altura da barra e a lista de resultados não aparecia.
  document.body.appendChild(overlayEl);
  overlayEl.addEventListener('click', (evt) => { if (evt.target === overlayEl) close(); });

  // Listeners
  let unsubscribeSearchOpen = null;

  /**
   * Debounced search
   */
  function handleInput(evt) {
    clearTimeout(debounceTimer);
    const query = evt.target.value;

    debounceTimer = setTimeout(() => {
      activeIndex = -1;
      performSearch(query);
      renderListbox();
    }, 80);
  }

  /**
   * Teclado: ArrowUp/Down, Enter, Esc
   */
  function handleKeyDown(evt) {
    if (evt.key === 'Escape') {
      close();
      return;
    }

    if (evt.key === 'ArrowDown') {
      evt.preventDefault();
      if (results.length > 0) {
        activeIndex = Math.min(activeIndex + 1, results.length - 1);
        updateActiveDescendant();
        renderListbox();
      }
      return;
    }

    if (evt.key === 'ArrowUp') {
      evt.preventDefault();
      if (results.length > 0) {
        activeIndex = Math.max(activeIndex - 1, -1);
        updateActiveDescendant();
        renderListbox();
      }
      return;
    }

    if (evt.key === 'Enter' && activeIndex >= 0 && activeIndex < results.length) {
      evt.preventDefault();
      selectResult(results[activeIndex]);
    }
  }

  /**
   * Atualiza aria-activedescendant
   */
  function updateActiveDescendant() {
    if (activeIndex >= 0) {
      inputEl.setAttribute('aria-activedescendant', `atlas-search-option-${activeIndex}`);
    } else {
      inputEl.removeAttribute('aria-activedescendant');
    }
  }

  /**
   * Busca
   */
  function performSearch(query) {
    if (!index) return;

    if (!query.trim()) {
      // Mostrar histórico recente
      results = getRecentSearches().slice(0, 5);
      return;
    }

    // Buscar no índice
    results = search(index, query, { limit: 12 });
  }

  /**
   * Renderiza a listbox
   */
  function renderListbox() {
    clear(listboxEl);

    if (results.length === 0) {
      const query = inputEl.value.trim();
      if (!query) {
        // Campo vazio - mostrar histórico recente
        const recentSearches = getRecentSearches().slice(0, 5);
        if (recentSearches.length === 0) {
          const msg = h('div', { className: 'atlas-search-empty', text: 'Nenhuma busca recente.' });
          listboxEl.appendChild(msg);
        } else {
          recentSearches.forEach((result, idx) => {
            const option = renderOption(result, idx, true);
            listboxEl.appendChild(option);
          });
        }
      } else {
        // Sem resultados
        const msg = h('div', {
          className: 'atlas-search-empty',
          text: `Nada encontrado para "${query}". Tente o nome em latim ou em inglês.`,
        });
        listboxEl.appendChild(msg);
      }
      return;
    }

    // Renderizar resultados (até 12)
    results.slice(0, 12).forEach((result, idx) => {
      const option = renderOption(result, idx, false);
      listboxEl.appendChild(option);
    });
  }

  /**
   * Renderiza uma opção
   */
  function renderOption(result, idx, isRecent) {
    const option = h('div', {
      id: `atlas-search-option-${idx}`,
      className: `atlas-search-option ${activeIndex === idx ? 'active' : ''}`,
      role: 'option',
      'aria-selected': activeIndex === idx,
      onClick: () => selectResult(result),
    });

    // Label com match destacado
    const labelEl = h('div', { className: 'atlas-search-option-label' });

    // Construir o texto com <mark> para a parte encontrada
    const fullLabel = result.label;
    const query = inputEl.value.trim();
    const normalizedQuery = normalize(query);
    const normalizedLabel = normalize(fullLabel);

    if (query && normalizedLabel.includes(normalizedQuery)) {
      // Encontrar a posição do match
      const idx = normalizedLabel.indexOf(normalizedQuery);
      const before = fullLabel.substring(0, idx);
      const matched = fullLabel.substring(idx, idx + normalizedQuery.length);
      const after = fullLabel.substring(idx + normalizedQuery.length);

      if (before) labelEl.appendChild(document.createTextNode(before));
      const mark = h('mark', { text: matched });
      labelEl.appendChild(mark);
      if (after) labelEl.appendChild(document.createTextNode(after));
    } else {
      labelEl.appendChild(document.createTextNode(fullLabel));
    }

    option.appendChild(labelEl);

    // Sistema chip
    const systemLabel = findSystemLabel(result.systemId);
    if (systemLabel) {
      const systemChip = h('span', { className: 'atlas-search-chip atlas-search-chip-system', text: systemLabel });
      option.appendChild(systemChip);
    }

    // Side chip (E ou D)
    if (result.side) {
      const sideText = { l: 'E', r: 'D' }[result.side] || result.side;
      const sideChip = h('span', {
        className: 'atlas-search-chip atlas-search-chip-side',
        text: sideText,
        title: sideText === 'E' ? 'Lado esquerdo' : sideText === 'D' ? 'Lado direito' : '',
      });
      option.appendChild(sideChip);
    }

    return option;
  }

  /**
   * Encontra o label do sistema
   */
  function findSystemLabel(systemId) {
    const sys = SYSTEMS.find((s) => s.id === systemId);
    return sys ? sys.label : null;
  }

  /**
   * Seleciona um resultado
   */
  function selectResult(result) {
    // Chamar callback
    onOpenSystem(result.systemId);

    // Emitir evento
    bus.emit(EVENTS.STRUCTURE_SELECT, {
      sid: result.sid,
      source: 'search',
    });

    // Salvar no histórico
    saveRecentSearch(result);

    // Fechar
    close();
  }

  /**
   * Salva no histórico
   */
  function saveRecentSearch(result) {
    try {
      let recent = getRecentSearches();
      // Remover se já existe
      recent = recent.filter((r) => r.sid !== result.sid);
      // Adicionar no início
      recent.unshift(result);
      // Manter apenas os últimos 5
      recent = recent.slice(0, MAX_RECENT);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch (err) {
      // Ignorar erros de localStorage
    }
  }

  /**
   * Carrega o histórico
   */
  function getRecentSearches() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Abre a caixa de busca
   */
  function open(query) {
    if (isOpen) return;

    // Construir índice se necessário
    if (!index) {
      const entries = getIndex();
      index = buildSearchIndex(entries);
    }

    isOpen = true;
    overlayEl.hidden = false;
    inputEl.setAttribute('aria-expanded', 'true');

    // Focus no input
    setTimeout(() => inputEl.focus(), 0);

    // Se houver uma query inicial, colocá-la e buscar
    if (query !== undefined) {
      inputEl.value = query;
      performSearch(query);
    } else {
      // Campo vazio - mostrar histórico
      performSearch('');
    }

    renderListbox();
  }

  /**
   * Fecha a caixa de busca
   */
  function close() {
    if (!isOpen) return;

    isOpen = false;
    overlayEl.hidden = true;
    inputEl.setAttribute('aria-expanded', 'false');
    inputEl.removeAttribute('aria-activedescendant');
    inputEl.value = '';
    activeIndex = -1;
    results = [];
    clear(listboxEl);
  }

  /**
   * Limpa listeners e recursos
   */
  function dispose() {
    close();
    document.removeEventListener('keydown', onGlobalKey);
    if (unsubscribeSearchOpen) unsubscribeSearchOpen();
    clearTimeout(debounceTimer);
  }

  // Atalho "/" (fora de campos de texto) abre a busca.
  function onGlobalKey(evt) {
    if (evt.key !== '/' || isOpen || evt.ctrlKey || evt.metaKey || evt.altKey) return;
    const t = evt.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    evt.preventDefault();
    open();
  }
  document.addEventListener('keydown', onGlobalKey);

  // Escutar SEARCH_OPEN
  unsubscribeSearchOpen = bus.on(EVENTS.SEARCH_OPEN, (payload) => {
    open(payload?.query);
  });

  return { open, close, dispose };
}
