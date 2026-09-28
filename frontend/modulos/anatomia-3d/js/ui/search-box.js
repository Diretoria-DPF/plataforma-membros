/**
 * @file search-box.js
 * @description Componente de interface para o campo de pesquisa anatômica do Atlas 3D.
 * Constrói o DOM de forma segura (sem innerHTML), provê debounce e navegação por teclado (WCAG 2.1 AA).
 */

import { AppBus } from '../core/bus.js';

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
    /** @type {number|null} */
    this.debounceTimer = null;
    /** @type {Object[]} */
    this.currentResults = [];
    /** @type {number} Índice do item focado na lista de resultados (-1 = nenhum) */
    this.focusedIndex = -1;
    /** @type {boolean} */
    this.isOpen = false;
  }
  // [FIM MÉTODO: constructor]

  // [INÍCIO MÉTODO: init]
  /**
   * Constrói o componente dentro do elemento hospedeiro.
   * @param {HTMLElement} containerElement
   * @param {import('./search-index.js').SearchIndex} searchIndexInstance
   */
  init(containerElement, searchIndexInstance) {
    if (!containerElement || !searchIndexInstance) {
      console.warn('[SearchBox] Inicialização abortada: contêiner ou índice ausente.');
      return;
    }

    this.container = containerElement;
    this.searchIndex = searchIndexInstance;

    this.buildDOM();
    this.bindEvents();
  }
  // [FIM MÉTODO: init]

  // [INÍCIO MÉTODO: buildDOM]
  /**
   * Cria a árvore DOM da caixa de pesquisa de maneira programática segura.
   */
  buildDOM() {
    if (!this.container) return;

    // Limpa qualquer resíduo prévio
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    this.container.classList.add('atlas-search-container');

    // Invólucro de entrada (input wrapper)
    const wrapper = document.createElement('div');
    wrapper.className = 'atlas-search-input-wrapper';
    wrapper.setAttribute('role', 'combobox');
    wrapper.setAttribute('aria-expanded', 'false');
    wrapper.setAttribute('aria-haspopup', 'listbox');
    wrapper.setAttribute('aria-owns', 'atlas-search-results-list');

    // Ícone visual de busca (SVG gerado por construtor de nós com namespace)
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

    wrapper.appendChild(iconSvg);

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
    wrapper.appendChild(this.inputElement);

    // Botão de limpar busca
    this.clearButton = document.createElement('button');
    this.clearButton.type = 'button';
    this.clearButton.className = 'atlas-search-clear-btn is-hidden';
    this.clearButton.setAttribute('aria-label', 'Limpar campo de pesquisa');

    const clearSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    clearSvg.setAttribute('viewBox', '0 0 24 24');
    clearSvg.setAttribute('fill', 'none');
    clearSvg.setAttribute('stroke', 'currentColor');
    clearSvg.setAttribute('stroke-width', '2');
    clearSvg.setAttribute('stroke-linecap', 'round');
    clearSvg.setAttribute('stroke-linejoin', 'round');
    clearSvg.setAttribute('aria-hidden', 'true');

    const clearLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    clearLine1.setAttribute('x1', '18');
    clearLine1.setAttribute('y1', '6');
    clearLine1.setAttribute('x2', '6');
    clearLine1.setAttribute('y2', '18');
    clearSvg.appendChild(clearLine1);

    const clearLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    clearLine2.setAttribute('x1', '6');
    clearLine2.setAttribute('y1', '6');
    clearLine2.setAttribute('x2', '18');
    clearLine2.setAttribute('y2', '18');
    clearSvg.appendChild(clearLine2);

    this.clearButton.appendChild(clearSvg);
    wrapper.appendChild(this.clearButton);

    this.container.appendChild(wrapper);

    // Lista suspensa de resultados
    this.resultsListElement = document.createElement('ul');
    this.resultsListElement.id = 'atlas-search-results-list';
    this.resultsListElement.className = 'atlas-search-results is-hidden';
    this.resultsListElement.setAttribute('role', 'listbox');
    this.resultsListElement.setAttribute('aria-label', 'Sugestões de estruturas encontradas');
    this.container.appendChild(this.resultsListElement);
  }
  // [FIM MÉTODO: buildDOM]

  // [INÍCIO MÉTODO: bindEvents]
  /**
   * Conecta ouvintes de eventos para mouse, toque e teclado.
   */
  bindEvents() {
    if (!this.inputElement || !this.clearButton) return;

    // Digitação com debounce
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
      }, 180);
    });

    // Teclas de controle (combobox pattern)
    this.inputElement.addEventListener('keydown', event => {
      this.handleKeyDown(event);
    });

    // Foco no campo abre a lista se houver resultados
    this.inputElement.addEventListener('focus', () => {
      if (this.currentResults.length > 0) {
        this.openResults();
      }
    });

    // Botão limpar
    this.clearButton.addEventListener('click', () => {
      this.clearSearch();
      this.inputElement.focus();
    });

    // Clique fora fecha o dropdown
    document.addEventListener('click', event => {
      if (!this.container.contains(event.target)) {
        this.closeResults();
      }
    });
  }
  // [FIM MÉTODO: bindEvents]

  // [INÍCIO MÉTODO: executeSearch]
  /**
   * Executa a pesquisa no índice de estruturas e atualiza a interface.
   * @param {string} query
   */
  executeSearch(query) {
    const cleanQuery = query ? query.trim() : '';
    if (cleanQuery.length < 2) {
      this.currentResults = [];
      this.renderResults();
      this.closeResults();
      return;
    }

    if (!this.searchIndex) return;

    this.currentResults = this.searchIndex.search(cleanQuery, 12);
    this.focusedIndex = -1;
    this.renderResults();

    if (this.currentResults.length > 0) {
      this.openResults();
    } else {
      this.renderEmptyState(cleanQuery);
      this.openResults();
    }
  }
  // [FIM MÉTODO: executeSearch]

  // [INÍCIO MÉTODO: renderResults]
  /**
   * Constrói os itens de resultado na lista suspensa com nós de DOM seguros.
   */
  renderResults() {
    if (!this.resultsListElement) return;

    while (this.resultsListElement.firstChild) {
      this.resultsListElement.removeChild(this.resultsListElement.firstChild);
    }

    for (let i = 0; i < this.currentResults.length; i++) {
      const entry = this.currentResults[i];
      const li = document.createElement('li');
      li.className = 'atlas-search-item';
      li.id = `atlas-search-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');

      // Linha principal: Nome vernacular em português
      const titleSpan = document.createElement('span');
      titleSpan.className = 'atlas-search-item-title';
      titleSpan.textContent = entry.names.pt;
      li.appendChild(titleSpan);

      // Linha secundária: Metadados de sistema e lateralidade
      const metaSpan = document.createElement('span');
      metaSpan.className = 'atlas-search-item-meta';

      let metaText = entry.systemLabel || entry.system;
      if (entry.laterality && entry.laterality !== 'unpaired') {
        if (entry.laterality === 'left') metaText += ' · Esquerdo';
        else if (entry.laterality === 'right') metaText += ' · Direito';
        else if (entry.laterality === 'bilateral') metaText += ' · Bilateral';
        else if (entry.laterality === 'midline') metaText += ' · Mediano';
      }
      metaSpan.textContent = metaText;
      li.appendChild(metaSpan);

      // Ação de seleção real por ponteiro
      li.addEventListener('click', () => {
        this.selectEntry(entry);
      });

      this.resultsListElement.appendChild(li);
    }
  }
  // [FIM MÉTODO: renderResults]

  // [INÍCIO MÉTODO: renderEmptyState]
  /**
   * Exibe mensagem informativa amigável quando nenhum registro coincide com a busca.
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
    p.textContent = `Nenhuma estrutura encontrada para "${query}". Verifique a grafia ou tente buscar pelo sistema.`;
    li.appendChild(p);

    this.resultsListElement.appendChild(li);
  }
  // [FIM MÉTODO: renderEmptyState]

  // [INÍCIO MÉTODO: handleKeyDown]
  /**
   * Gerencia atalhos de teclado para acessibilidade de navegação no menu.
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event) {
    if (!this.isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      if (this.currentResults.length > 0) {
        this.openResults();
      }
      return;
    }

    if (!this.isOpen) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.navigateResults(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.navigateResults(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.focusedIndex >= 0 && this.focusedIndex < this.currentResults.length) {
        this.selectEntry(this.currentResults[this.focusedIndex]);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeResults();
    }
  }
  // [FIM MÉTODO: handleKeyDown]

  // [INÍCIO MÉTODO: navigateResults]
  /**
   * Alterna a seleção visual de foco pelas opções através do teclado.
   * @param {number} direction - (+1 para descer, -1 para subir)
   */
  navigateResults(direction) {
    if (this.currentResults.length === 0 || !this.resultsListElement) return;

    const total = this.currentResults.length;
    this.focusedIndex = (this.focusedIndex + direction + total) % total;

    const items = this.resultsListElement.querySelectorAll('.atlas-search-item');
    items.forEach((item, index) => {
      if (index === this.focusedIndex) {
        item.classList.add('is-focused');
        item.setAttribute('aria-selected', 'true');
        item.scrollIntoView({ block: 'nearest' });
        this.inputElement.setAttribute('aria-activedescendant', item.id);
      } else {
        item.classList.remove('is-focused');
        item.setAttribute('aria-selected', 'false');
      }
    });
  }
  // [FIM MÉTODO: navigateResults]

  // [INÍCIO MÉTODO: selectEntry]
  /**
   * Conclui a seleção de um resultado, notificando o barramento central.
   * @param {Object} entry
   */
  selectEntry(entry) {
    if (!entry || !entry.sid) return;

    this.inputElement.value = entry.names.pt;
    this.closeResults();

    AppBus.emit('structure:select', {
      sid: entry.sid,
      options: { focusCamera: true, origin: 'search' }
    });
  }
  // [FIM MÉTODO: selectEntry]

  // [INÍCIO MÉTODO: openResults]
  /**
   * Abre o dropdown de resultados.
   */
  openResults() {
    if (!this.resultsListElement) return;
    this.resultsListElement.classList.remove('is-hidden');
    this.isOpen = true;
    const wrapper = this.container.querySelector('.atlas-search-input-wrapper');
    if (wrapper) wrapper.setAttribute('aria-expanded', 'true');
  }
  // [FIM MÉTODO: openResults]

  // [INÍCIO MÉTODO: closeResults]
  /**
   * Fecha o dropdown de resultados.
   */
  closeResults() {
    if (!this.resultsListElement) return;
    this.resultsListElement.classList.add('is-hidden');
    this.isOpen = false;
    this.focusedIndex = -1;
    const wrapper = this.container.querySelector('.atlas-search-input-wrapper');
    if (wrapper) wrapper.setAttribute('aria-expanded', 'false');
    this.inputElement.removeAttribute('aria-activedescendant');
  }
  // [FIM MÉTODO: closeResults]

  // [INÍCIO MÉTODO: clearSearch]
  /**
   * Limpa o campo de entrada e esvazia resultados.
   */
  clearSearch() {
    if (this.inputElement) {
      this.inputElement.value = '';
    }
    if (this.clearButton) {
      this.clearButton.classList.add('is-hidden');
    }
    this.currentResults = [];
    this.closeResults();
  }
  // [FIM MÉTODO: clearSearch]
}

export const UISearchBox = new SearchBoxUI();
