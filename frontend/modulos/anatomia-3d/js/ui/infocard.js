/**
 * @file infocard.js
 * @description Painel de detalhes e ficha clínica-anatômica (bottom-sheet) do Atlas 3D.
 * Implementação segura sem innerHTML (em total conformidade com a política CSP e Fase 4).
 */

import { AppBus } from '../core/bus.js';
import { ReviewStatus } from '../core/contracts.js';

class InfocardUI {
  // [INÍCIO MÉTODO: constructor]
  constructor() {
    /** @type {HTMLElement|null} */
    this.container = null;
    /** @type {Object|null} */
    this.currentEntry = null;
    /** @type {Object|null} */
    this.currentContent = null;
    /** @type {'summary'|'anatomy'|'histology'|'clinical'|'sources'} */
    this.activeTab = 'summary';
    /** @type {'peek'|'half'|'full'} */
    this.currentSnap = 'half';
    /** @type {boolean} */
    this.isVisible = false;
  }
  // [FIM MÉTODO: constructor]

  // [INÍCIO MÉTODO: init]
  /**
   * Inicializa o componente atrelando-o ao contêiner existente no DOM.
   * @param {HTMLElement} containerElement
   */
  init(containerElement) {
    if (!containerElement) {
      return;
    }
    this.container = containerElement;
    this.container.classList.add('atlas-infocard');
    this.setSnap('half');
    this.hide();
  }
  // [FIM MÉTODO: init]

  // [INÍCIO MÉTODO: setSnap]
  /**
   * Altera o ponto de acoplamento vertical da folha inferior.
   * @param {'peek'|'half'|'full'} snap
   */
  setSnap(snap) {
    if (!['peek', 'half', 'full'].includes(snap)) {
      return;
    }
    this.currentSnap = snap;
    if (this.container) {
      this.container.setAttribute('data-snap', snap);
    }
  }
  // [FIM MÉTODO: setSnap]

  // [INÍCIO MÉTODO: showLoading]
  /**
   * Exibe estado visual de carregamento para a estrutura em foco.
   * @param {Object} entry - StructureEntry selecionado.
   */
  showLoading(entry) {
    if (!this.container) return;

    this.currentEntry = entry;
    this.currentContent = null;
    this.clearContainer();

    // Monta barra de arraste
    const handle = this.createHandleElement();
    this.container.appendChild(handle);

    // Cabeçalho básico com nome da estrutura
    const titleZone = this.createTitleZone(entry, null, true);
    this.container.appendChild(titleZone);

    // Corpo de espera visual
    const body = document.createElement('div');
    body.className = 'atlas-card-content';

    const loadingText = document.createElement('p');
    loadingText.className = 'atlas-card-loading-msg';
    loadingText.textContent = 'Carregando dados anatômicos e correlações clínicas...';
    body.appendChild(loadingText);

    this.container.appendChild(body);
    this.show();
  }
  // [FIM MÉTODO: showLoading]

  // [INÍCIO MÉTODO: render]
  /**
   * Renderiza a ficha completa com abas dinâmicas e fontes bibliográficas.
   * @param {{ entry: Object, content: Object|null }} payload
   */
  render(payload) {
    if (!this.container || !payload || !payload.entry) {
      return;
    }

    const { entry, content } = payload;
    this.currentEntry = entry;
    this.currentContent = content;
    this.clearContainer();

    // 1. Alça de arraste (handle)
    const handle = this.createHandleElement();
    this.container.appendChild(handle);

    // 2. Zona de cabeçalho e títulos
    const titleZone = this.createTitleZone(entry, content, false);
    this.container.appendChild(titleZone);

    // 3. Barra de abas informativas
    const tabbar = this.createTabBar(content);
    this.container.appendChild(tabbar);

    // 4. Painel de conteúdo da aba ativa
    const body = document.createElement('div');
    body.className = 'atlas-card-content';
    this.renderActiveTabContent(body, entry, content);
    this.container.appendChild(body);

    // 5. Barra inferior de botões de ação
    const actions = this.createActionButtons(entry);
    this.container.appendChild(actions);

    this.show();
  }
  // [FIM MÉTODO: render]

  // [INÍCIO MÉTODO: renderError]
  /**
   * Apresenta estado de erro recuperável na ficha.
   * @param {Object} entry
   * @param {string} errorMessage
   */
  renderError(entry, errorMessage) {
    if (!this.container) return;

    this.clearContainer();

    const handle = this.createHandleElement();
    this.container.appendChild(handle);

    const titleZone = this.createTitleZone(entry, null, false);
    this.container.appendChild(titleZone);

    const body = document.createElement('div');
    body.className = 'atlas-card-content';

    const errBox = document.createElement('div');
    errBox.className = 'atlas-card-error-box';

    const p = document.createElement('p');
    p.textContent = errorMessage;
    errBox.appendChild(p);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'atlas-card-action-btn primary';
    retryBtn.textContent = 'Tentar Novamente';
    retryBtn.addEventListener('click', () => {
      AppBus.emit('structure:select', { sid: entry.sid });
    });
    errBox.appendChild(retryBtn);

    body.appendChild(errBox);
    this.container.appendChild(body);
    this.show();
  }
  // [FIM MÉTODO: renderError]

  // [INÍCIO MÉTODO: show]
  /**
   * Torna o painel visível na interface.
   */
  show() {
    if (!this.container) return;
    this.container.classList.remove('is-hidden');
    this.isVisible = true;
  }
  // [FIM MÉTODO: show]

  // [INÍCIO MÉTODO: hide]
  /**
   * Oculta o painel da interface.
   */
  hide() {
    if (!this.container) return;
    this.container.classList.add('is-hidden');
    this.isVisible = false;
  }
  // [FIM MÉTODO: hide]

  // [INÍCIO MÉTODO: clearContainer]
  /**
   * Esvazia o conteúdo filho do contêiner de forma segura.
   */
  clearContainer() {
    if (!this.container) return;
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }
  // [FIM MÉTODO: clearContainer]

  // [INÍCIO MÉTODO: createHandleElement]
  /**
   * Constrói a alça de arraste superior da folha deslizante.
   * @returns {HTMLElement}
   */
  createHandleElement() {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'atlas-card-handle';
    handle.setAttribute('aria-label', 'Alternar tamanho da ficha de informações');
    handle.addEventListener('click', () => {
      if (this.currentSnap === 'peek') this.setSnap('half');
      else if (this.currentSnap === 'half') this.setSnap('full');
      else this.setSnap('peek');
    });
    return handle;
  }
  // [FIM MÉTODO: createHandleElement]

  // [INÍCIO MÉTODO: createTitleZone]
  /**
   * Monta o bloco de títulos, lateralidade e selo acadêmico.
   * @param {Object} entry
   * @param {Object|null} content
   * @param {boolean} isLoading
   * @returns {HTMLElement}
   */
  createTitleZone(entry, content, isLoading) {
    const zone = document.createElement('div');
    zone.className = 'atlas-card-title-zone';

    const nameContainer = document.createElement('div');
    nameContainer.className = 'atlas-card-name-container';

    // Título vernacular em português
    const h2 = document.createElement('h2');
    h2.textContent = entry.names?.pt || entry.sid;
    nameContainer.appendChild(h2);

    // Subtítulo descritivo com sistema e lateralidade
    const subtitle = document.createElement('div');
    subtitle.className = 'atlas-card-subtitle';

    const sysSpan = document.createElement('span');
    sysSpan.textContent = entry.systemLabel || entry.system;
    subtitle.appendChild(sysSpan);

    if (entry.laterality && entry.laterality !== 'unpaired') {
      const latSpan = document.createElement('span');
      let latText = '';
      if (entry.laterality === 'left') latText = '· Esquerdo';
      else if (entry.laterality === 'right') latText = '· Direito';
      else if (entry.laterality === 'bilateral') latText = '· Bilateral';
      else if (entry.laterality === 'midline') latText = '· Mediano';
      latSpan.textContent = latText;
      subtitle.appendChild(latSpan);
    }

    nameContainer.appendChild(subtitle);
    zone.appendChild(nameContainer);

    // Selo de revisão acadêmica conforme ATLAS_CONTENT_POLICY.md
    if (!isLoading && content) {
      const badge = document.createElement('div');
      badge.className = 'atlas-card-draft-badge';

      const status = content.review?.status || ReviewStatus.AUTO_DRAFT;
      if (status === ReviewStatus.REVIEWED || status === ReviewStatus.APPROVED) {
        badge.classList.add('is-reviewed');
        badge.textContent = 'Conteúdo Revisado';
      } else if (status === ReviewStatus.LEGACY_UNVERIFIED) {
        badge.textContent = 'Acervo Histórico';
      } else {
        badge.textContent = 'Rascunho não revisado';
      }

      zone.appendChild(badge);
    }

    return zone;
  }
  // [FIM MÉTODO: createTitleZone]

  // [INÍCIO MÉTODO: createTabBar]
  /**
   * Constrói a barra de abas dinâmicas conforme a disponibilidade de dados.
   * @param {Object|null} content
   * @returns {HTMLElement}
   */
  createTabBar(content) {
    const tabbar = document.createElement('div');
    tabbar.className = 'atlas-card-tabbar';
    tabbar.setAttribute('role', 'tablist');

    const availableTabs = [
      { id: 'summary', label: 'Resumo', available: true },
      { id: 'anatomy', label: 'Anatomia', available: Boolean(content?.anatomy) },
      { id: 'histology', label: 'Histologia', available: Boolean(content?.histology) },
      { id: 'clinical', label: 'Clínica', available: Boolean(Array.isArray(content?.clinical) && content.clinical.length > 0) },
      { id: 'sources', label: 'Fontes', available: Boolean(Array.isArray(content?.sources) && content.sources.length > 0) }
    ];

    // Se a aba selecionada anteriormente não estiver disponível nesta estrutura, retorna para resumo
    const currentTabObj = availableTabs.find(t => t.id === this.activeTab);
    if (!currentTabObj || !currentTabObj.available) {
      this.activeTab = 'summary';
    }

    for (let i = 0; i < availableTabs.length; i++) {
      const tabDef = availableTabs[i];
      if (!tabDef.available) continue;

      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = 'atlas-card-tab';
      tabBtn.setAttribute('role', 'tab');
      tabBtn.setAttribute('aria-selected', this.activeTab === tabDef.id ? 'true' : 'false');
      tabBtn.textContent = tabDef.label;

      if (this.activeTab === tabDef.id) {
        tabBtn.classList.add('is-active');
      }

      tabBtn.addEventListener('click', () => {
        this.activeTab = tabDef.id;
        if (this.currentEntry) {
          this.render({ entry: this.currentEntry, content: this.currentContent });
        }
      });

      tabbar.appendChild(tabBtn);
    }

    return tabbar;
  }
  // [FIM MÉTODO: createTabBar]

  // [INÍCIO MÉTODO: renderActiveTabContent]
  /**
   * Preenche a área de leitura com base na aba ativa selecionada.
   * @param {HTMLElement} container
   * @param {Object} entry
   * @param {Object|null} content
   */
  renderActiveTabContent(container, entry, content) {
    if (!content) {
      const p = document.createElement('p');
      p.className = 'atlas-card-empty-msg';
      p.textContent = 'Não há ficha descritiva catalogada para esta estrutura no momento.';
      container.appendChild(p);
      return;
    }

    if (this.activeTab === 'summary') {
      const p = document.createElement('p');
      p.textContent = content.summary_pt || 'Sem resumo cadastrado.';
      container.appendChild(p);

      // Nomes científicos adicionais
      if (entry.names?.la || entry.names?.en) {
        const sciBox = document.createElement('div');
        sciBox.className = 'atlas-card-sci-box';

        if (entry.names.la) {
          const laP = document.createElement('p');
          const strong = document.createElement('strong');
          strong.textContent = 'Terminologia Anatômica (TA2): ';
          laP.appendChild(strong);
          laP.appendChild(document.createTextNode(entry.names.la));
          sciBox.appendChild(laP);
        }

        if (entry.names.en) {
          const enP = document.createElement('p');
          const strongEn = document.createElement('strong');
          strongEn.textContent = 'Nome em Inglês: ';
          enP.appendChild(strongEn);
          enP.appendChild(document.createTextNode(entry.names.en));
          sciBox.appendChild(enP);
        }

        container.appendChild(sciBox);
      }
    } else if (this.activeTab === 'anatomy') {
      const anat = content.anatomy || {};
      this.appendPropertySection(container, 'Vascularização:', anat.vascularization);
      this.appendPropertySection(container, 'Inervação:', anat.innervation);
      this.appendPropertySection(container, 'Drenagem Linfática:', anat.lymph);
      this.appendPropertySection(container, 'Relações Anatômicas:', anat.relations);
    } else if (this.activeTab === 'histology') {
      const histo = content.histology || {};
      this.appendPropertySection(container, 'Epitélio:', histo.epithelium);
      this.appendPropertySection(container, 'Tecidos:', histo.tissues);
      this.appendPropertySection(container, 'Células Principais:', histo.cells);
    } else if (this.activeTab === 'clinical') {
      const list = Array.isArray(content.clinical) ? content.clinical : [];
      const ul = document.createElement('ul');
      ul.className = 'atlas-card-clinical-list';
      for (let i = 0; i < list.length; i++) {
        const li = document.createElement('li');
        li.textContent = list[i];
        ul.appendChild(li);
      }
      container.appendChild(ul);
    } else if (this.activeTab === 'sources') {
      const sources = Array.isArray(content.sources) ? content.sources : [];
      const ul = document.createElement('ul');
      ul.className = 'atlas-card-sources-list';

      for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        const li = document.createElement('li');

        const label = document.createElement('strong');
        label.textContent = `${src.field}: `;
        li.appendChild(label);

        const refText = document.createTextNode(`${src.ref} (${src.license || 'Uso restrito'})`);
        li.appendChild(refText);

        ul.appendChild(li);
      }
      container.appendChild(ul);
    }
  }
  // [FIM MÉTODO: renderActiveTabContent]

  // [INÍCIO MÉTODO: appendPropertySection]
  /**
   * Constrói e anexa uma seção de texto formatada com rótulo e valor.
   * @param {HTMLElement} parent
   * @param {string} label
   * @param {string|null} value
   */
  appendPropertySection(parent, label, value) {
    if (!value || String(value).trim().length === 0) return;
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label} `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(String(value)));
    parent.appendChild(p);
  }
  // [FIM MÉTODO: appendPropertySection]

  // [INÍCIO MÉTODO: createActionButtons]
  /**
   * Constrói os botões ergonômicos de ação no rodapé da ficha.
   * @param {Object} entry
   * @returns {HTMLElement}
   */
  createActionButtons(entry) {
    const actions = document.createElement('div');
    actions.className = 'atlas-card-actions';

    // Botão Isolar Estrutura
    const isolateBtn = document.createElement('button');
    isolateBtn.type = 'button';
    isolateBtn.className = 'atlas-card-action-btn';
    isolateBtn.textContent = 'Isolar';
    isolateBtn.addEventListener('click', () => {
      AppBus.emit('scene:isolate', { sid: entry.sid });
    });
    actions.appendChild(isolateBtn);

    // Botão Ocultar Estrutura
    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.className = 'atlas-card-action-btn';
    hideBtn.textContent = 'Ocultar';
    hideBtn.addEventListener('click', () => {
      AppBus.emit('scene:hide-structure', { sid: entry.sid });
      AppBus.emit('structure:clear');
    });
    actions.appendChild(hideBtn);

    // Botão Focar Câmera
    const focusBtn = document.createElement('button');
    focusBtn.type = 'button';
    focusBtn.className = 'atlas-card-action-btn primary';
    focusBtn.textContent = 'Focar';
    focusBtn.addEventListener('click', () => {
      if (entry.bounds) {
        AppBus.emit('camera:focus', { bounds: entry.bounds });
      }
    });
    actions.appendChild(focusBtn);

    return actions;
  }
  // [FIM MÉTODO: createActionButtons]
}

export const UIInfocard = new InfocardUI();
