/**
 * navigator.js — navegador em níveis com trilha (breadcrumb)
 * Onda 1, WP09. Sistema → Região → Estrutura → Filhos.
 */

import { SYSTEMS } from '../core/contracts.js';
import { EVENTS } from '../core/bus.js';

const { h, clear } = window.LaiftDom;

/**
 * @typedef {Object} NavigatorState
 * @property {Array<{id: string, label: string, count?: number}>} breadcrumb
 * @property {string} [currentSystemId]
 * @property {Array<Object>} items Estruturas ou sistemas a listar agora
 * @property {string} [currentSid] Estrutura atual destacada
 */

/**
 * @param {HTMLElement} container
 * @param {{bus: Object, getIndex: Function, isSystemAvailable?: Function, onSystemOpen?: Function}} opts
 * @returns {Object} API pública
 */
export function createNavigator(container, opts) {
  const {
    bus,
    getIndex,
    isSystemAvailable = () => true,
    onSystemOpen = () => {},
  } = opts;

  /** @type {NavigatorState} */
  const state = {
    breadcrumb: [],
    currentSystemId: null,
    items: [],
    currentSid: null,
  };

  let unsubscribe = null;
  const navRoot = h('div', { className: 'atlas-nav-root' });
  const breadcrumbEl = h('div', { className: 'atlas-nav-breadcrumb' });
  const contentEl = h('div', { className: 'atlas-nav-content' });

  container.appendChild(navRoot);
  navRoot.appendChild(breadcrumbEl);
  navRoot.appendChild(contentEl);

  /**
   * Renderiza a trilha (breadcrumb) com botão voltar e títulos clicáveis.
   */
  function renderBreadcrumb() {
    clear(breadcrumbEl);

    if (state.breadcrumb.length === 0) return;

    const crumbContainer = h('div', { className: 'atlas-nav-breadcrumb-inner' });

    // Botão voltar
    const backBtn = h('button', {
      className: 'atlas-nav-back-btn',
      'aria-label': 'Voltar',
      onClick: goBack,
    });
    crumbContainer.appendChild(backBtn);

    // Crumbs da trilha (cada um clicável)
    state.breadcrumb.forEach((crumb, idx) => {
      if (idx > 0) {
        const sep = h('span', { className: 'atlas-nav-breadcrumb-sep', text: ' › ' });
        crumbContainer.appendChild(sep);
      }

      const crumbBtn = h('button', {
        className: 'atlas-nav-breadcrumb-btn',
        text: crumb.label,
        onClick: () => goToLevel(idx),
      });
      crumbContainer.appendChild(crumbBtn);
    });

    breadcrumbEl.appendChild(crumbContainer);
  }

  /**
   * Renderiza a lista de itens (sistemas, estruturas, etc.)
   */
  function renderContent() {
    clear(contentEl);

    const list = h('div', { className: 'atlas-nav-list', role: 'listbox' });

    state.items.forEach((item, idx) => {
      const row = h('button', {
        className: 'atlas-nav-row',
        role: 'option',
        'aria-selected': item.sid === state.currentSid ? 'true' : 'false',
        onKeyDown: (evt) => handleKeyDown(evt, idx),
        onClick: () => selectOrDrill(item),
      });

      // Nome e subtítulo
      const nameEl = h('span', { className: 'atlas-nav-row-name', text: item.name });
      row.appendChild(nameEl);

      // Lado (E/D)
      if (item.side) {
        const sideChip = h('span', {
          className: 'atlas-nav-side-chip',
          text: item.side === 'R' ? 'D' : item.side === 'L' ? 'E' : item.side,
        });
        row.appendChild(sideChip);
      }

      // Indicador de filhos (›) ou contagem
      if (item.hasChildren) {
        const arrow = h('span', { className: 'atlas-nav-row-arrow', text: '›' });
        row.appendChild(arrow);
      } else if (item.count !== undefined) {
        const count = h('span', { className: 'atlas-nav-row-count', text: `${item.count}` });
        row.appendChild(count);
      }

      // Selecionar o primeiro item por padrão na renderização
      if (idx === 0) {
        row.focus();
      }

      list.appendChild(row);
    });

    contentEl.appendChild(list);
  }

  /**
   * Obter entrada por sid a partir do índice
   */
  function getEntryBySid(sid) {
    return getIndex().find((e) => e.sid === sid);
  }

  /**
   * Obter filhos de um sid
   */
  function getChildren(sid) {
    const index = getIndex();
    return index.filter((e) => e.parent === sid);
  }

  /**
   * Obter estruturas top-level de um sistema (sem parent, ou parent não existe)
   */
  function getTopLevelInSystem(systemId) {
    const index = getIndex();
    const entries = index.filter((e) => e.system === systemId);

    // Agrupar por region se houver, senão retornar apenas top-level
    const byRegion = new Map();
    const topLevel = [];

    entries.forEach((e) => {
      if (!e.parent || !index.some((x) => x.sid === e.parent)) {
        if (e.region) {
          if (!byRegion.has(e.region)) byRegion.set(e.region, []);
          byRegion.get(e.region).push(e);
        } else {
          topLevel.push(e);
        }
      }
    });

    // Se houver regiões, retornar regiões; senão, retornar top-level
    if (byRegion.size > 0) {
      return Array.from(byRegion.entries()).map(([region, entries]) => ({
        isRegion: true,
        region,
        entries,
        name: region.charAt(0).toUpperCase() + region.slice(1),
      }));
    }

    return topLevel;
  }

  /**
   * Converter entrada para item de lista
   */
  function entryToItem(entry) {
    const children = getChildren(entry.sid);
    return {
      sid: entry.sid,
      name: entry.names.pt,
      side: entry.side,
      hasChildren: children.length > 0,
    };
  }

  /**
   * Navegar para nível home (sistemas)
   */
  function goHome() {
    state.breadcrumb = [];
    state.currentSystemId = null;
    state.items = SYSTEMS.map((sys) => ({
      sid: sys.id,
      name: sys.label,
      isSystem: true,
      count: getIndex().filter((e) => e.system === sys.id && !e.parent).length,
      available: isSystemAvailable(sys.id),
    }));
    state.currentSid = null;
    renderBreadcrumb();
    renderContent();
  }

  /**
   * Abrir um sistema
   */
  function openSystem(systemId) {
    const sys = SYSTEMS.find((s) => s.id === systemId);
    if (!sys || !isSystemAvailable(systemId)) return;

    onSystemOpen(systemId);

    state.breadcrumb = [{ id: 'systems', label: 'Sistemas' }, { id: systemId, label: sys.label }];
    state.currentSystemId = systemId;

    // Agrupar por region
    const entries = getTopLevelInSystem(systemId);
    if (entries.length > 0 && entries[0].isRegion) {
      state.items = entries.map((region) =>
        region.entries
          .sort((a, b) => a.names.pt.localeCompare(b.names.pt, 'pt'))
          .map(entryToItem)
      ).flat();
    } else {
      state.items = entries.sort((a, b) => a.names.pt.localeCompare(b.names.pt, 'pt')).map(entryToItem);
    }

    state.currentSid = null;
    renderBreadcrumb();
    renderContent();
  }

  /**
   * Abrir estrutura (ir para seus filhos, ou selecionar se não tem filhos)
   */
  function openStructure(sid) {
    const entry = getEntryBySid(sid);
    if (!entry) return;

    const children = getChildren(sid);

    if (children.length === 0) {
      // Leaf node: selecionar apenas
      selectStructure(sid);
      return;
    }

    // Tem filhos: drill down
    state.breadcrumb.push({ id: sid, label: entry.names.pt });
    state.items = children
      .sort((a, b) => a.names.pt.localeCompare(b.names.pt, 'pt'))
      .map(entryToItem);
    state.currentSid = null;

    // Emitir que foi selecionado
    bus.emit(EVENTS.STRUCTURE_SELECT, { sid, source: 'navigator' });

    renderBreadcrumb();
    renderContent();
  }

  /**
   * Selecionar uma estrutura (sem ir para seus filhos)
   */
  function selectStructure(sid) {
    state.currentSid = sid;
    bus.emit(EVENTS.STRUCTURE_SELECT, { sid, source: 'navigator' });
    renderContent();
  }

  /**
   * Click em sistema ou estrutura
   */
  function selectOrDrill(item) {
    if (item.isSystem) {
      openSystem(item.sid);
    } else {
      openStructure(item.sid);
    }
  }

  /**
   * Voltar um nível
   */
  function goBack() {
    if (state.breadcrumb.length <= 1) {
      goHome();
    } else {
      state.breadcrumb.pop();
      const level = state.breadcrumb[state.breadcrumb.length - 1];

      if (level.id === 'systems') {
        goHome();
      } else {
        // Reabrir o sistema ou estrutura
        const levelEntry = getEntryBySid(level.id);
        if (levelEntry) {
          // It's a structure level; show its children
          state.items = getChildren(level.id)
            .sort((a, b) => a.names.pt.localeCompare(b.names.pt, 'pt'))
            .map(entryToItem);
        }
      }

      state.currentSid = null;
      renderBreadcrumb();
      renderContent();
    }
  }

  /**
   * Ir para um nível específico da trilha
   */
  function goToLevel(crumbIdx) {
    state.breadcrumb = state.breadcrumb.slice(0, crumbIdx + 1);
    const level = state.breadcrumb[crumbIdx];

    if (level.id === 'systems') {
      goHome();
    } else {
      const levelEntry = getEntryBySid(level.id);
      if (levelEntry) {
        state.currentSystemId = levelEntry.system;
        state.items = getChildren(level.id)
          .sort((a, b) => a.names.pt.localeCompare(b.names.pt, 'pt'))
          .map(entryToItem);
      }
    }

    state.currentSid = null;
    renderBreadcrumb();
    renderContent();
  }

  /**
   * Navegação por teclado (arrow keys)
   */
  function handleKeyDown(evt, idx) {
    if (evt.key === 'ArrowUp') {
      evt.preventDefault();
      if (idx > 0) {
        const rows = contentEl.querySelectorAll('.atlas-nav-row');
        rows[idx - 1].focus();
      }
    } else if (evt.key === 'ArrowDown') {
      evt.preventDefault();
      const rows = contentEl.querySelectorAll('.atlas-nav-row');
      if (idx < rows.length - 1) {
        rows[idx + 1].focus();
      }
    }
  }

  /**
   * Responder a STRUCTURE_SELECT externo (ex.: busca)
   */
  function handleExternalStructureSelect({ sid }) {
    const entry = getEntryBySid(sid);
    if (!entry) return;

    // Navegar até o pai (se houver) para mostrar o item selecionado
    let pathToSid = [entry.sid];
    let current = entry;

    while (current.parent) {
      pathToSid.unshift(current.parent);
      current = getEntryBySid(current.parent);
    }

    // Recriar breadcrumb até o nível acima de `sid`
    state.breadcrumb = [{ id: 'systems', label: 'Sistemas' }];
    const sys = SYSTEMS.find((s) => s.id === current.system);
    if (sys) {
      state.breadcrumb.push({ id: current.system, label: sys.label });
    }

    for (let i = 0; i < pathToSid.length - 1; i++) {
      const e = getEntryBySid(pathToSid[i]);
      if (e) {
        state.breadcrumb.push({ id: e.sid, label: e.names.pt });
      }
    }

    // Mostrar o conteúdo do pai
    const parentSid = pathToSid[pathToSid.length - 2];
    if (parentSid) {
      state.items = getChildren(parentSid)
        .sort((a, b) => a.names.pt.localeCompare(b.names.pt, 'pt'))
        .map(entryToItem);
      state.currentSystemId = current.system;
    } else {
      // Top level do sistema
      const topLevel = getTopLevelInSystem(current.system);
      if (topLevel.length > 0 && topLevel[0].isRegion) {
        state.items = topLevel
          .map((region) =>
            region.entries
              .sort((a, b) => a.names.pt.localeCompare(b.names.pt, 'pt'))
              .map(entryToItem)
          )
          .flat();
      } else {
        state.items = topLevel
          .sort((a, b) => a.names.pt.localeCompare(b.names.pt, 'pt'))
          .map(entryToItem);
      }
      state.currentSystemId = current.system;
    }

    // Destacar o item
    state.currentSid = sid;

    renderBreadcrumb();
    renderContent();

    // Focar no item selecionado
    const rows = contentEl.querySelectorAll('.atlas-nav-row');
    const selected = Array.from(rows).find(
      (row) => row.getAttribute('aria-selected') === 'true'
    );
    if (selected) selected.focus();
  }

  /**
   * Inicializar o navegador
   */
  function init() {
    goHome();

    // Escutar STRUCTURE_SELECT externo
    unsubscribe = bus.on(EVENTS.STRUCTURE_SELECT, (payload) => {
      if (payload.source !== 'navigator' && payload.sid) {
        handleExternalStructureSelect(payload);
      }
    });
  }

  /**
   * Limpar recursos
   */
  function dispose() {
    if (unsubscribe) {
      unsubscribe();
    }
    clear(navRoot);
    navRoot.remove();
  }

  // Inicializar
  init();

  // API pública
  return {
    openSystem,
    openStructure,
    goHome,
    getPath: () => state.breadcrumb.map((b) => b.label),
    refresh: () => renderContent(),
    dispose,
  };
}
