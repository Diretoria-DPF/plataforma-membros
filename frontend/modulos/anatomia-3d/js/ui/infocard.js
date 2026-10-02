/**
 * infocard.js — Ficha de estrutura do Atlas Anatômico 3D.
 *
 * Exporta `createInfoCard(container, {onAction})` que retorna
 * `{render(entry, content), setTab(id), clear(), getTab()}`.
 */

import { SYSTEMS } from '../core/contracts.js';

/**
 * Cria um objeto com os métodos da ficha.
 * @param {HTMLElement} container - Elemento pai onde a ficha será renderizada
 * @param {Object} options - Configurações
 * @param {Function} options.onAction - Callback chamado com {action, sid}
 * @returns {Object} Interface da ficha: {render, setTab, clear, getTab}
 */
export function createInfoCard(container, { onAction = () => {} } = {}) {
  const { h, setHtml, clear: clearEl, safeUrl } = window.LaiftDom;

  let currentEntry = null;
  let currentContent = null;
  let currentTabId = 'resumo';
  const contentBox = {};

  // Mapeamento de system id → label PT
  const systemMap = Object.fromEntries(SYSTEMS.map((s) => [s.id, s.label]));

  /**
   * Renderiza a ficha com entrada e conteúdo (ou null enquanto carrega).
   */
  function render(entry, content) {
    currentEntry = entry;
    currentContent = content;
    currentTabId = 'resumo';

    // Cria/limpa o container principal se for a primeira vez
    if (!contentBox.root) {
      contentBox.root = h('div', { id: 'organ-hud', className: 'atlas-card-wrapper' });
      container.appendChild(contentBox.root);
    } else {
      clearEl(contentBox.root);
    }

    // Cabeçalho
    const header = renderHeader(entry, content);
    contentBox.root.appendChild(header);

    // Abas
    const tabBar = renderTabBar();
    contentBox.root.appendChild(tabBar);

    // Caixa de conteúdo (rola separadamente)
    // tabindex: área rolável alcançável pelo teclado (WCAG 2.1.1).
    contentBox.contentArea = h('div', { className: 'atlas-card-content', tabindex: '0', role: 'region', 'aria-label': 'Conteúdo da aba' });
    contentBox.root.appendChild(contentBox.contentArea);

    // Ações rápidas (sempre visíveis)
    const actions = renderActions(entry);
    contentBox.root.appendChild(actions);

    // Renderiza o conteúdo da aba ativa
    updateTabContent();
  }

  /**
   * Renderiza o cabeçalho com nome, subtítulo e badges.
   */
  function renderHeader(entry, content) {
    const { h } = window.LaiftDom;

    const header = h('div', { className: 'atlas-card-header' });

    // Alça de arraste
    const handle = h('div', { className: 'atlas-card-handle' });
    header.appendChild(handle);

    // Zona do nome e badges
    const titleZone = h('div', { className: 'atlas-card-title-zone' });

    const nameContainer = h('div', { className: 'atlas-card-name-container' });
    const name = h('h2', { id: 'organ-name', className: 'atlas-card-name', text: entry.names.pt });
    nameContainer.appendChild(name);

    // Badge de rascunho se necessário
    if (content && content.review && content.review.status !== 'reviewed' && content.review.status !== 'approved') {
      const badge = h('div', { className: 'atlas-card-draft-badge', role: 'status', title: 'Texto gerado automaticamente; ainda não revisado por profissional da área.' });
      badge.appendChild(h('span', { className: 'atlas-card-draft-icon', text: '⚠' }));
      badge.appendChild(h('span', { className: 'atlas-card-draft-text', text: 'Rascunho — não revisado' }));
      nameContainer.appendChild(badge);
    }

    titleZone.appendChild(nameContainer);

    // Subtítulo: sistema · tipo · lado
    const subtitle = h('div', { className: 'atlas-card-subtitle' });
    const sysLabel = systemMap[entry.system] || entry.system;
    const typeLabel = 'Órgão'; // tipo fixo para demo; pode vir de content se houver
    const sideLabel = entry.side ? (entry.side === 'L' ? 'Esquerdo' : entry.side === 'R' ? 'Direito' : '—') : '—';

    subtitle.appendChild(h('span', { className: 'atlas-card-system', text: sysLabel }));
    subtitle.appendChild(h('span', { text: ' · ' }));
    subtitle.appendChild(h('span', { className: 'atlas-card-type', text: typeLabel }));
    subtitle.appendChild(h('span', { text: ' · ' }));
    subtitle.appendChild(h('span', { className: 'atlas-card-side', text: sideLabel }));

    titleZone.appendChild(subtitle);
    header.appendChild(titleZone);

    return header;
  }

  /**
   * Renderiza a barra de abas com navegação por teclado.
   */
  function renderTabBar() {
    const { h } = window.LaiftDom;

    const tabBar = h('div', { className: 'atlas-card-tabbar', role: 'tablist' });

    const tabs = [
      { id: 'resumo', label: 'Resumo' },
      { id: 'anatomia', label: 'Anatomia' },
      { id: 'histologia', label: 'Histologia & Células' },
      { id: 'clinica', label: 'Clínica' },
      { id: 'referencias', label: 'Referências' },
    ];

    const hasData = {
      resumo: true, // sempre mostra
      anatomia: currentContent && currentContent.anatomy,
      histologia: currentContent && currentContent.histology,
      clinica: currentContent && currentContent.clinical && currentContent.clinical.length > 0,
      referencias: true, // sempre mostra
    };

    tabs.forEach(({ id, label }) => {
      if (!hasData[id]) return; // pula abas vazias

      const button = h('button', {
        className: 'atlas-card-tab',
        'data-tab-id': id,
        'aria-selected': id === currentTabId ? 'true' : 'false',
        role: 'tab',
        onClick: () => {
          currentTabId = id;
          updateTabContent();
          // Atualiza aria-selected em todos os botões
          Array.from(tabBar.querySelectorAll('[role="tab"]')).forEach((btn) => {
            btn.setAttribute('aria-selected', btn.getAttribute('data-tab-id') === id ? 'true' : 'false');
          });
        },
        onKeyDown: (evt) => {
          const allButtons = Array.from(tabBar.querySelectorAll('[role="tab"]'));
          const currentIdx = allButtons.indexOf(evt.target);

          if (evt.key === 'ArrowRight') {
            evt.preventDefault();
            const nextBtn = allButtons[currentIdx + 1];
            if (nextBtn) nextBtn.click();
          } else if (evt.key === 'ArrowLeft') {
            evt.preventDefault();
            const prevBtn = allButtons[currentIdx - 1];
            if (prevBtn) prevBtn.click();
          }
        },
        text: label,
      });
      tabBar.appendChild(button);
    });

    return tabBar;
  }

  /**
   * Renderiza a linha de ações rápidas (Isolar, Ocultar, Fantasma, Focar).
   */
  function renderActions(entry) {
    const { h } = window.LaiftDom;

    const actionBar = h('div', { className: 'atlas-card-actions' });

    const actions = [
      { id: 'isolate', label: 'Isolar', icon: '◎' },
      { id: 'hide', label: 'Ocultar', icon: '◌' },
      { id: 'ghost', label: 'Fantasma', icon: '👻' },
      { id: 'focus', label: 'Focar', icon: '🎯' },
    ];

    actions.forEach(({ id, label, icon }) => {
      const btn = h('button', {
        className: 'atlas-card-action-btn',
        'aria-label': label,
        title: label,
        onClick: () => {
          onAction({ action: id, sid: entry.sid });
        },
      }, [
        h('span', { className: 'atlas-card-action-icon', 'aria-hidden': 'true', text: icon }),
        h('span', { className: 'atlas-card-action-label', text: label }),
      ]);
      actionBar.appendChild(btn);
    });

    return actionBar;
  }

  /**
   * Atualiza o conteúdo da aba ativa.
   */
  function updateTabContent() {
    if (!contentBox.contentArea) return;
    clearEl(contentBox.contentArea);

    // `undefined` = ainda buscando (js/main.js chama render(entry, undefined)
    // antes do fetch); `null`/objeto = já resolveu (mesmo sem nenhum dado
    // real — ver contentStore.getContent em js/main.js). Tratar os dois
    // como "carregando" prendia a ficha em "Carregando ficha…" para sempre
    // em qualquer estrutura sem conteúdo (a maioria — bug real encontrado
    // ao selecionar uma estrutura qualquer e nunca ver o resumo/abas).
    if (currentContent === undefined) {
      contentBox.contentArea.appendChild(h('div', { className: 'atlas-card-loading', text: 'Carregando ficha…' }));
      return;
    }
    if (currentContent === null) currentContent = {};

    if (currentTabId === 'resumo') {
      contentBox.contentArea.appendChild(renderResumo());
    } else if (currentTabId === 'anatomia') {
      contentBox.contentArea.appendChild(renderAnatomia());
    } else if (currentTabId === 'histologia') {
      contentBox.contentArea.appendChild(renderHistologia());
    } else if (currentTabId === 'clinica') {
      contentBox.contentArea.appendChild(renderClinica());
    } else if (currentTabId === 'referencias') {
      contentBox.contentArea.appendChild(renderReferencias());
    }
  }

  function renderResumo() {
    const { h } = window.LaiftDom;

    const section = h('div', { className: 'atlas-card-tab-content' });

    if (!currentContent.summary_pt) {
      section.appendChild(h('p', { className: 'atlas-card-empty', text: 'Sem descrição ainda.' }));
    } else {
      const text = currentContent.summary_pt;
      section.appendChild(h('p', { text }));
    }

    return section;
  }

  function renderAnatomia() {
    const { h } = window.LaiftDom;

    const section = h('div', { className: 'atlas-card-tab-content' });

    const anat = currentContent.anatomy || {};
    const fields = [
      { key: 'relations', label: 'Relações' },
      { key: 'vascularization', label: 'Vascularização' },
      { key: 'innervation', label: 'Inervação' },
      { key: 'lymph', label: 'Drenagem Linfática' },
    ];

    fields.forEach(({ key, label }) => {
      if (!anat[key]) return;

      const group = h('div', { className: 'atlas-card-field-group' });
      group.appendChild(h('h4', { className: 'atlas-card-field-label', text: label }));
      group.appendChild(h('p', { text: anat[key] }));
      section.appendChild(group);
    });

    return section;
  }

  function renderHistologia() {
    const { h } = window.LaiftDom;

    const section = h('div', { className: 'atlas-card-tab-content' });

    const hist = currentContent.histology || {};

    // Epitélio
    if (hist.epithelium) {
      const group = h('div', { className: 'atlas-card-field-group' });
      group.appendChild(h('h4', { className: 'atlas-card-field-label', text: 'Epitélio' }));
      group.appendChild(h('p', { text: hist.epithelium }));
      section.appendChild(group);
    }

    // Tecidos
    if (hist.tissues && hist.tissues.length > 0) {
      const group = h('div', { className: 'atlas-card-field-group' });
      group.appendChild(h('h4', { className: 'atlas-card-field-label', text: 'Tecidos' }));
      const ul = h('ul', { className: 'atlas-card-list' });
      hist.tissues.forEach((tissue) => {
        ul.appendChild(h('li', { text: tissue }));
      });
      group.appendChild(ul);
      section.appendChild(group);
    }

    // Células
    if (hist.cells && hist.cells.length > 0) {
      const group = h('div', { className: 'atlas-card-field-group' });
      group.appendChild(h('h4', { className: 'atlas-card-field-label', text: 'Células' }));
      const cellList = h('ul', { className: 'atlas-card-list' });
      hist.cells.forEach((cell) => {
        const li = h('li', { className: 'atlas-card-cell-item' });
        const clId = cell.cl; // ex: CL:0000746
        const ebiUrl = `https://www.ebi.ac.uk/ols4/ontologies/cl/classes?obo_id=${clId}`;
        const link = h('a', {
          href: ebiUrl,
          className: 'atlas-card-link',
          target: '_blank',
          rel: 'noopener noreferrer',
          text: `${cell.name_pt} (${clId})`,
        });
        li.appendChild(link);

        if (cell.biomarkers && cell.biomarkers.length > 0) {
          const bioText = document.createTextNode(` — ${cell.biomarkers.join(', ')}`);
          li.appendChild(bioText);
        }

        cellList.appendChild(li);
      });
      group.appendChild(cellList);
      section.appendChild(group);
    }

    return section;
  }

  function renderClinica() {
    const { h } = window.LaiftDom;

    const section = h('div', { className: 'atlas-card-tab-content' });

    if (!currentContent.clinical || currentContent.clinical.length === 0) {
      section.appendChild(h('p', { className: 'atlas-card-empty', text: 'Sem informações clínicas.' }));
      return section;
    }

    const list = h('ul', { className: 'atlas-card-list' });
    currentContent.clinical.forEach((item) => {
      list.appendChild(h('li', { text: item }));
    });
    section.appendChild(list);

    return section;
  }

  function renderReferencias() {
    const { h, safeUrl } = window.LaiftDom;

    const section = h('div', { className: 'atlas-card-tab-content' });

    // Identificadores
    if (currentContent.ids && Object.keys(currentContent.ids).length > 0) {
      const idsGroup = h('div', { className: 'atlas-card-field-group' });
      idsGroup.appendChild(h('h4', { className: 'atlas-card-field-label', text: 'Identificadores' }));

      const idsList = h('dl', { className: 'atlas-card-ids-list' });

      const idFields = [
        { key: 'fma', label: 'FMA' },
        { key: 'uberon', label: 'Uberon' },
        { key: 'ta2', label: 'TA2' },
        { key: 'wikidata', label: 'Wikidata' },
        { key: 'mesh', label: 'MeSH' },
      ];

      idFields.forEach(({ key, label }) => {
        if (!currentContent.ids[key]) return;

        const dt = h('dt', { text: label });
        const dd = h('dd', { text: currentContent.ids[key] });
        idsList.appendChild(dt);
        idsList.appendChild(dd);
      });

      // ICD-10 pode ter múltiplos valores
      if (currentContent.ids.icd10 && Array.isArray(currentContent.ids.icd10)) {
        const dt = h('dt', { text: 'ICD-10' });
        const dd = h('dd', { text: currentContent.ids.icd10.join(', ') });
        idsList.appendChild(dt);
        idsList.appendChild(dd);
      }

      idsGroup.appendChild(idsList);
      section.appendChild(idsGroup);
    }

    // Fontes
    if (currentContent.sources && currentContent.sources.length > 0) {
      const sourcesGroup = h('div', { className: 'atlas-card-field-group' });
      sourcesGroup.appendChild(h('h4', { className: 'atlas-card-field-label', text: 'Fontes' }));

      const sourcesList = h('ul', { className: 'atlas-card-list' });
      currentContent.sources.forEach((source) => {
        const li = h('li', { className: 'atlas-card-source-item' });

        const refText = `${source.ref || source.type} (${source.license || 'sem licença'})`;

        if (source.url && safeUrl(source.url)) {
          const link = h('a', {
            href: safeUrl(source.url),
            className: 'atlas-card-link',
            target: '_blank',
            rel: 'noopener noreferrer',
            text: refText,
          });
          li.appendChild(link);
        } else {
          li.appendChild(h('span', { text: refText }));
        }

        sourcesList.appendChild(li);
      });

      sourcesGroup.appendChild(sourcesList);
      section.appendChild(sourcesGroup);
    }

    // Status de revisão
    if (currentContent.review) {
      const reviewGroup = h('div', { className: 'atlas-card-field-group atlas-card-review-info' });
      reviewGroup.appendChild(h('h4', { className: 'atlas-card-field-label', text: 'Status de Revisão' }));

      const dl = h('dl', { className: 'atlas-card-review-list' });

      if (currentContent.review.status) {
        const dt1 = h('dt', { text: 'Status' });
        const dd1 = h('dd', { text: currentContent.review.status });
        dl.appendChild(dt1);
        dl.appendChild(dd1);
      }

      if (currentContent.review.by) {
        const dt2 = h('dt', { text: 'Revisor' });
        const dd2 = h('dd', { text: currentContent.review.by });
        dl.appendChild(dt2);
        dl.appendChild(dd2);
      }

      if (currentContent.review.date) {
        const dt3 = h('dt', { text: 'Data' });
        const dd3 = h('dd', { text: currentContent.review.date });
        dl.appendChild(dt3);
        dl.appendChild(dd3);
      }

      reviewGroup.appendChild(dl);
      section.appendChild(reviewGroup);
    }

    return section;
  }

  /**
   * Interface pública.
   */
  return {
    render,
    /**
     * Nó raiz já montado (ou `null` antes do primeiro `render`). Usado por
     * js/main.js para espelhar a ficha no painel arrastável no celular
     * (<600px, onde #atlas-inspector fica `display:none` — §1.1/§2 da spec
     * de UX; sem isto, tocar numa estrutura no celular não mostrava nada).
     */
    getElement() {
      return contentBox.root || null;
    },
    setTab(id) {
      currentTabId = id;
      if (contentBox.root) {
        updateTabContent();
        const button = contentBox.root.querySelector(`[data-tab-id="${id}"]`);
        if (button) {
          Array.from(contentBox.root.querySelectorAll('[role="tab"]')).forEach((btn) => {
            btn.setAttribute('aria-selected', btn === button ? 'true' : 'false');
          });
        }
      }
    },
    getTab() {
      return currentTabId;
    },
    clear() {
      if (contentBox.root) clearEl(contentBox.root);
      currentEntry = null;
      currentContent = null;
    },
  };
}
