/**
 * @file search-box.js
 * @description Componente de busca avançada do Atlas Anatômico 3D LAIFT.
 * Implementa WAI-ARIA 1.2 Combobox, realce de termos com DOM seguro, histórico e acessibilidade TV.
 */

import { AppBus } from '../core/bus.js';
import { CanonicalSystems, SystemLabelsPt } from '../core/contracts.js';
import { normalizeSearchString } from './search-index.js';

const STORAGE_KEY_RECENT = 'laift_atlas_recent_searches';
const MAX_RECENT_SEARCHES = 5;

export class SearchBoxUI {
  // [INÍCIO MÉTODO: constructor]
  constructor() {
    /** @type {HTMLElement|null} */
    this.container = null;
    /** @type {import('./search-index.js').SearchIndex|null} */
    this.searchIndex = null;
    /** @type {HTMLInputElement|null} */
    this.inputElement = null;
    /** @type {HTMLButtonElement|null} */
    this.clearButton = null;
    /** @type {HTMLUListElement|null} */
    this.resultsListElement = null;
    /** @type {HTMLElement|null} */
    this.filterBarElement = null;
    /** @type {number|null} */
    this.debounceTimer = null;
    /** @type {Object[]} */
    this.currentResults = [];
    /** @type {number} */
    this.focusedIndex = -1;
    /** @type {boolean} */
    this.isOpen = false;
    /** @type {string|null} */
    this.activeSystemFilter = null;
    /** @type {string[]} */
    this.recentSearches = [];
  }
  // [FIM MÉTODO: constructor]

  // [INÍCIO MÉTODO: init]
  /**
   * Inicializa o componente atrelando-o ao contêiner no DOM.
   * @param {HTMLElement} containerElement
   * @param {import('./search-index.js').SearchIndex} searchIndexInstance
   */
  init(containerElement, searchIndexInstance) {
    if (!containerElement || !searchIndexInstance) {
      console.warn('[SearchBox] Inicialização cancelada: parâmetros inválidos.');
      return;
    }

    this.container = containerElement;
    this.searchIndex = searchIndexInstance;
    this.loadRecentSearches();

    this.buildDOM();
    this.bindEvents();
    this.bindBusEvents();
  }
  // [FIM MÉTODO: init]

  // [INÍCIO MÉTODO: loadRecentSearches]
  /**
   * Carrega buscas recentes salvas no navegador com validação defensiva.
   */
  loadRecentSearches() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_RECENT);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.recentSearches = parsed.slice(0, MAX_RECENT_SEARCHES);
        }
      }
    } catch (e) {
      this.recentSearches = [];
    }
  }
  // [FIM MÉTODO: loadRecentSearches]

  // [INÍCIO MÉTODO: saveRecentSearch]
  /**
   * Salva um termo selecionado no histórico recente do usuário.
   * @param {string} term
   */
  saveRecentSearch(term) {
    if (!term || typeof term !== 'string') return;
    const clean = term.trim();
    if (clean.length < 2) return;

    this.recentSearches = [clean, ...this.recentSearches.filter(t => t.toLowerCase() !== clean.toLowerCase())]
      .slice(0, MAX_RECENT_SEARCHES);

    try {
      localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(this.recentSearches));
    } catch (e) {
      // Ignora falhas de gravação em storage restrito/privado
    }
  }
  // [FIM MÉTODO: saveRecentSearch]

  // [INÍCIO MÉTODO: buildDOM]
  /**
   * Monta a árvore completa de elementos DOM com estrita segurança contra injeção.
   */
  buildDOM() {
    if (!this.container) return;

    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    this.container.classList.add('atlas-search-container');

    // 1. Invólucro do campo de entrada (Combobox Pattern)
    const combobox = document.createElement('div');
    combobox.className = 'atlas-search-input-wrapper';
    combobox.setAttribute('role', 'combobox');
    combobox.setAttribute('aria-expanded', 'false');
    combobox.setAttribute('aria-haspopup', 'listbox');
    combobox.setAttribute('aria-owns', 'atlas-search-results-list');

    // Ícone de Lupa em SVG
    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', 'currentColor');
    iconSvg.setAttribute('stroke-width', '2');
    iconSvg.setAttribute('stroke-linecap', 'round');
    iconSvg.setAttribute('stroke-linejoin', 'round');
    iconSvg.setAttribute('aria-hidden', 'true');
    iconSvg.classList.add('atlas-search-icon');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '11');
    circle.setAttribute('cy', '11');
    circle.setAttribute('r', '8');
    iconSvg.appendChild(circle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '21');
    line.setAttribute('y1', '21');
    line.setAttribute('x2', '16.65');
    line.setAttribute('y2', '16.65');
    iconSvg.appendChild(line);

    combobox.appendChild(iconSvg);

    // Campo de texto
    this.inputElement = document.createElement('input');
    this.inputElement.type = 'search';
    this.inputElement.className = 'atlas-search-input';
    this.inputElement.placeholder = 'Buscar estrutura anatômica (ex: coração)...';
    this.inputElement.setAttribute('aria-label', 'Pesquisar estrutura anatômica em português, inglês ou latim');
    this.inputElement.setAttribute('autocomplete', 'off');
    this.inputElement.setAttribute('autocorrect', 'off');
    this.inputElement.setAttribute('autocapitalize', 'off');
    this.inputElement.setAttribute('spellcheck', 'false');
    this.inputElement.setAttribute('aria-autocomplete', 'list');
    this.inputElement.setAttribute('aria-controls', 'atlas-search-results-list');
    combobox.appendChild(this.inputElement);

    // Botão de limpeza
    this.clearButton = document.createElement('button');
    this.clearButton.type = 'button';
    this.clearButton.className = 'atlas-search-clear-btn is-hidden';
    this.clearButton.setAttribute('aria-label', 'Limpar pesquisa');

    const clearSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    clearSvg.setAttribute('viewBox', '0 0 24 24');
    clearSvg.setAttribute('fill', 'none');
    clearSvg.setAttribute('stroke', 'currentColor');
    clearSvg.setAttribute('stroke-width', '2');
    clearSvg.setAttribute('stroke-linecap', 'round');
    clearSvg.setAttribute('stroke-linejoin', 'round');
    clearSvg.setAttribute('aria-hidden', 'true');

    const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l1.setAttribute('x1', '18');
    l1.setAttribute('y1', '6');
    l1.setAttribute('x2', '6');
    l1.setAttribute('y2', '18');
    clearSvg.appendChild(l1);

    const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l2.setAttribute('x1', '6');
    l2.setAttribute('y1', '6');
    l2.setAttribute('x2', '18');
    l2.setAttribute('y2', '18');
    clearSvg.appendChild(l2);

    this.clearButton.appendChild(clearSvg);
    combobox.appendChild(this.clearButton);

    this.container.appendChild(combobox);

    // 2. Barra de Chips de Filtro Rápido de Sistema
    this.filterBarElement = document.createElement('div');
    this.filterBarElement.className = 'atlas-search-filter-bar';
    this.filterBarElement.setAttribute('role', 'toolbar');
    this.filterBarElement.setAttribute('aria-label', 'Filtrar busca por sistema anatômico');

    const allChip = this.createFilterChip('Todos', null, true);
    this.filterBarElement.appendChild(allChip);

    CanonicalSystems.slice(0, 6).forEach(sys => {
      const chip = this.createFilterChip(SystemLabelsPt[sys] || sys, sys, false);
      this.filterBarElement.appendChild(chip);
    });

    this.container.appendChild(this.filterBarElement);

    // 3. Lista Suspensa de Resultados
    this.resultsListElement = document.createElement('ul');
    this.resultsListElement.id = 'atlas-search-results-list';
    this.resultsListElement.className = 'atlas-search-results is-hidden';
    this.resultsListElement.setAttribute('role', 'listbox');
    this.resultsListElement.setAttribute('aria-label', 'Resultados da busca');
    this.container.appendChild(this.resultsListElement);
  }
  // [FIM MÉTODO: buildDOM]

  // [INÍCIO MÉTODO: createFilterChip]
  /**
   * Constrói um chip interativo de filtro de sistema anatômico.
   * @param {string} label
   * @param {string|null} systemId
   * @param {boolean} isDefault
   * @returns {HTMLElement}
   */
  createFilterChip(label, systemId, isDefault) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `atlas-filter-chip ${isDefault ? 'is-active' : ''}`;
    chip.textContent = label;
    chip.setAttribute('aria-pressed', isDefault ? 'true' : 'false');

    chip.addEventListener('click', () => {
      const parent = chip.parentElement;
      if (parent) {
        parent.querySelectorAll('.atlas-filter-chip').forEach(c => {
          c.classList.remove('is-active');
          c.setAttribute('aria-pressed', 'false');
        });
      }
      chip.classList.add('is-active');
      chip.setAttribute('aria-pressed', 'true');

      this.activeSystemFilter = systemId;
      if (this.inputElement && this.inputElement.value.trim().length >= 2) {
        this.executeSearch(this.inputElement.value);
      }
    });

    return chip;
  }
  // [FIM MÉTODO: createFilterChip]

  // [INÍCIO MÉTODO: bindEvents]
  /**
   * Registra os eventos de controle de usuário na interface.
   */
  bindEvents() {
    if (!this.inputElement || !this.clearButton) return;

    // Digitação contínua com debounce
    this.inputElement.addEventListener('input', () => {
      const query = this.inputElement.value;
      if (query.trim().length > 0) {
        this.clearButton.classList.remove('is-hidden');
      } else {
        this.clearButton.classList.add('is-hidden');
      }

      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = window.setTimeout(() => {
        this.executeSearch(query);
      }, 160);
    });

    // Foco no campo: se vazio, mostra histórico recente; se preenchido, reabre busca
    this.inputElement.addEventListener('focus', () => {
      const query = this.inputElement.value.trim();
      if (query.length < 2 && this.recentSearches.length > 0) {
        this.renderRecentSearches();
        this.openResults();
      } else if (query.length >= 2 && this.currentResults.length > 0) {
        this.openResults();
      }
    });

    // Teclado físico e controle remoto de TV (D-pad)
    this.inputElement.addEventListener('keydown', event => {
      this.handleKeyDown(event);
    });

    // Botão Limpar
    this.clearButton.addEventListener('click', () => {
      this.clearSearch();
      this.inputElement.focus();
    });

    // Fechamento ao clicar fora do componente
    document.addEventListener('pointerdown', event => {
      if (this.container && !this.container.contains(event.target)) {
        this.closeResults();
      }
    });
  }
  // [FIM MÉTODO: bindEvents]

  // [INÍCIO MÉTODO: bindBusEvents]
  /**
   * Conecta ouvintes com o barramento de eventos do Atlas.
   */
  bindBusEvents() {
    AppBus.on('structure:select', event => {
      if (event && event.options && event.options.origin !== 'search') {
        // Se a seleção partiu do clique no 3D, limpa o texto para não confundir o usuário
        if (this.inputElement && this.isOpen) {
          this.closeResults();
        }
      }
    });
  }
  // [FIM MÉTODO: bindBusEvents]

  // [INÍCIO MÉTODO: executeSearch]
  /**
   * Executa a busca ponderada e aplica filtragem por sistema se selecionada.
   * @param {string} query
   */
  executeSearch(query) {
    const cleanQuery = query ? query.trim() : '';
    if (cleanQuery.length < 2) {
      if (this.recentSearches.length > 0) {
        this.renderRecentSearches();
        this.openResults();
      } else {
        this.currentResults = [];
        this.renderResults('');
        this.closeResults();
      }
      return;
    }

    if (!this.searchIndex) return;

    let results = this.searchIndex.search(cleanQuery, 20);

    // Aplica filtro de sistema anatômico se houver chip ativo
    if (this.activeSystemFilter) {
      results = results.filter(entry => entry.system === this.activeSystemFilter);
    }

    this.currentResults = results.slice(0, 12);
    this.focusedIndex = -1;

    if (this.currentResults.length > 0) {
      this.renderResults(cleanQuery);
      this.openResults();
    } else {
      this.renderEmptyState(cleanQuery);
      this.openResults();
    }
  }
  // [FIM MÉTODO: executeSearch]

  // [INÍCIO MÉTODO: renderResults]
  /**
   * Constrói a lista de resultados com realce seguro de termos.
   * @param {string} query
   */
  renderResults(query) {
    if (!this.resultsListElement) return;

    while (this.resultsListElement.firstChild) {
      this.resultsListElement.removeChild(this.resultsListElement.firstChild);
    }

    const queryNorm = normalizeSearchString(query);

    for (let i = 0; i < this.currentResults.length; i++) {
      const entry = this.currentResults[i];
      const li = document.createElement('li');
      li.className = 'atlas-search-item';
      li.id = `atlas-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');

      // Título com realce dinâmico sem innerHTML
      const titleEl = document.createElement('div');
      titleEl.className = 'atlas-search-item-title';
      this.appendHighlightedText(titleEl, entry.names.pt, queryNorm);
      li.appendChild(titleEl);

      // Metadados anatômicos (Sistema, Lateralidade e Camada)
      const metaEl = document.createElement('div');
      metaEl.className = 'atlas-search-item-meta';

      const sysDot = document.createElement('span');
      sysDot.className = `atlas-system-bullet bullet-${entry.system}`;
      sysDot.setAttribute('aria-hidden', 'true');
      metaEl.appendChild(sysDot);

      const sysLabel = document.createElement('span');
      sysLabel.textContent = entry.systemLabel || entry.system;
      metaEl.appendChild(sysLabel);

      if (entry.laterality && entry.laterality !== 'unpaired') {
        const latSpan = document.createElement('span');
        let txt = '';
        if (entry.laterality === 'left') txt = '· Esquerdo';
        else if (entry.laterality === 'right') txt = '· Direito';
        else if (entry.laterality === 'bilateral') txt = '· Bilateral';
        else if (entry.laterality === 'midline') txt = '· Mediano';
        latSpan.textContent = txt;
        metaEl.appendChild(latSpan);
      }

      li.appendChild(metaEl);

      // Evento de seleção tátil ou clique
      li.addEventListener('pointerdown', event => {
        event.preventDefault(); // Evita perda precoce de foco no input
        this.selectEntry(entry);
      });

      this.resultsListElement.appendChild(li);
    }
  }
  // [FIM MÉTODO: renderResults]

  // [INÍCIO MÉTODO: appendHighlightedText]
  /**
   * Constrói nós de texto alternando entre texto plano e nós <mark> para o trecho coincidente.
   * Não utiliza innerHTML em nenhuma circunstância.
   * @param {HTMLElement} parent
   * @param {string} fullText
   * @param {string} queryNorm
   */
  appendHighlightedText(parent, fullText, queryNorm) {
    if (!queryNorm || queryNorm.length < 2) {
      parent.appendChild(document.createTextNode(fullText));
      return;
    }

    const textNorm = normalizeSearchString(fullText);
    const matchIndex = textNorm.indexOf(queryNorm);

    if (matchIndex === -1) {
      parent.appendChild(document.createTextNode(fullText));
      return;
    }

    const before = fullText.slice(0, matchIndex);
    const match = fullText.slice(matchIndex, matchIndex + queryNorm.length);
    const after = fullText.slice(matchIndex + queryNorm.length);

    if (before) parent.appendChild(document.createTextNode(before));

    const mark = document.createElement('mark');
    mark.className = 'atlas-search-match';
    mark.textContent = match;
    parent.appendChild(mark);

    if (after) {
      // Chamada recursiva para marcar ocorrências adicionais
      this.appendHighlightedText(parent, after, queryNorm);
    }
  }
  // [FIM MÉTODO: appendHighlightedText]

  // [INÍCIO MÉTODO: renderRecentSearches]
  /**
   * Renderiza a lista de buscas recentes quando o campo de pesquisa é aberto vazio.
   */
  renderRecentSearches() {
    if (!this.resultsListElement) return;

    while (this.resultsListElement.firstChild) {
      this.resultsListElement.removeChild(this.resultsListElement.firstChild);
    }

    const header = document.createElement('li');
    header.className = 'atlas-search-section-header';
    header.textContent = 'Buscas Recentes';
    header.setAttribute('role', 'presentation');
    this.resultsListElement.appendChild(header);

    for (let i = 0; i < this.recentSearches.length; i++) {
      const term = this.recentSearches[i];
      const li = document.createElement('li');
      li.className = 'atlas-search-item recent-item';
      li.setAttribute('role', 'option');

      const span = document.createElement('span');
      span.textContent = term;
      li.appendChild(span);

      li.addEventListener('pointerdown', event => {
        event.preventDefault();
        if (this.inputElement) {
          this.inputElement.value = term;
          this.executeSearch(term);
        }
      });

      this.resultsListElement.appendChild(li);
    }
  }
  // [FIM MÉTODO: renderRecentSearches]

  // [INÍCIO MÉTODO: renderEmptyState]
  /**
   * Renderiza mensagem acessível quando nenhuma estrutura foi localizada.
   * @param {string} query
   */
  renderEmptyState(query) {
    if (!this.resultsListElement) return;

    while (this.resultsListElement.firstChild) {
      this.resultsListElement.removeChild(this.resultsListElement.firstChild);
    }

    const li = document.createElement('li');
    li.className = 'atlas-search-empty-state';
    li.setAttribute('role', 'presentation');

    const p = document.createElement('p');
    p.textContent = `Nenhum resultado anatômico para "${query}". Tente buscar por sinônimos, termos em latim ou selecione outro sistema.`;
    li.appendChild(p);

    this.resultsListElement.appendChild(li);
  }
  // [FIM MÉTODO: renderEmptyState]

  // [INÍCIO MÉTODO: handleKeyDown]
  /**
   * Gerencia navegação pelo teclado físico e controles de TV (D-pad).
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event) {
    // Códigos de TV: D-Pad Up (38), Down (40), Enter (13), Back/Esc (27/10009/461)
    const key = event.key;
    const keyCode = event.keyCode;

    const isDown = key === 'ArrowDown' || keyCode === 40;
    const isUp = key === 'ArrowUp' || keyCode === 38;
    const isEnter = key === 'Enter' || keyCode === 13;
    const isEsc = key === 'Escape' || keyCode === 27 || keyCode === 10009 || keyCode === 461;

    if (!this.isOpen && (isDown || isUp)) {
      if (this.currentResults.length > 0 || this.recentSearches.length > 0) {
        this.openResults();
      }
      return;
    }

    if (!this.isOpen) return;

    if (isDown) {
      event.preventDefault();
      this.navigateResults(1);
    } else if (isUp) {
      event.preventDefault();
      this.navigateResults(-1);
    } else if (isEnter) {
      event.preventDefault();
      if (this.focusedIndex >= 0 && this.focusedIndex < this.currentResults.length) {
        this.selectEntry(this.currentResults[this.focusedIndex]);
      } else if (this.currentResults.length > 0) {
        this.selectEntry(this.currentResults[0]);
      }
    } else if (isEsc) {
      event.preventDefault();
      this.closeResults();
    }
  }
  // [FIM MÉTODO: handleKeyDown]

  // [INÍCIO MÉTODO: navigateResults]
  /**
   * Modifica a linha em foco na lista suspensa através do teclado.
   * @param {number} delta - (+1 ou -1)
   */
  navigateResults(delta) {
    if (this.currentResults.length === 0 || !this.resultsListElement) return;

    const items = this.resultsListElement.querySelectorAll('.atlas-search-item');
    if (items.length === 0) return;

    this.focusedIndex = (this.focusedIndex + delta + items.length) % items.length;

    items.forEach((item, idx) => {
      if (idx === this.focusedIndex) {
        item.classList.add('is-focused');
        item.setAttribute('aria-selected', 'true');
        item.scrollIntoView({ block: 'nearest' });
        if (this.inputElement) {
          this.inputElement.setAttribute('aria-activedescendant', item.id);
        }
      } else {
        item.classList.remove('is-focused');
        item.setAttribute('aria-selected', 'false');
      }
    });
  }
  // [FIM MÉTODO: navigateResults]

  // [INÍCIO MÉTODO: selectEntry]
  /**
   * Conclui a seleção de uma estrutura, salva no histórico e despacha para o motor.
   * @param {Object} entry
   */
  selectEntry(entry) {
    if (!entry || !entry.sid) return;

    if (this.inputElement) {
      this.inputElement.value = entry.names.pt;
    }

    this.saveRecentSearch(entry.names.pt);
    this.closeResults();

    AppBus.emit('structure:select', {
      sid: entry.sid,
      options: { focusCamera: true, origin: 'search' }
    });
  }
  // [FIM MÉTODO: selectEntry]

  // [INÍCIO MÉTODO: openResults]
  /**
   * Abre a exibição dos resultados.
   */
  openResults() {
    if (!this.resultsListElement) return;
    this.resultsListElement.classList.remove('is-hidden');
    this.isOpen = true;
    const combobox = this.container?.querySelector('.atlas-search-input-wrapper');
    if (combobox) combobox.setAttribute('aria-expanded', 'true');
  }
  // [FIM MÉTODO: openResults]

  // [INÍCIO MÉTODO: closeResults]
  /**
   * Oculta os resultados da busca.
   */
  closeResults() {
    if (!this.resultsListElement) return;
    this.resultsListElement.classList.add('is-hidden');
    this.isOpen = false;
    this.focusedIndex = -1;
    const combobox = this.container?.querySelector('.atlas-search-input-wrapper');
    if (combobox) combobox.setAttribute('aria-expanded', 'false');
    if (this.inputElement) this.inputElement.removeAttribute('aria-activedescendant');
  }
  // [FIM MÉTODO: closeResults]

  // [INÍCIO MÉTODO: clearSearch]
  /**
   * Esvazia o campo de pesquisa e reabre o histórico se disponível.
   */
  clearSearch() {
    if (this.inputElement) {
      this.inputElement.value = '';
    }
    if (this.clearButton) {
      this.clearButton.classList.add('is-hidden');
    }
    this.currentResults = [];
    if (this.recentSearches.length > 0) {
      this.renderRecentSearches();
      this.openResults();
    } else {
      this.closeResults();
    }
  }
  // [FIM MÉTODO: clearSearch]
}

export const UISearchBox = new SearchBoxUI();
