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
/**
 * Selo de revisão da ficha — um por estado de `content.review.status`
 * (content.schema.json). Nunca "Rascunho": o conteúdo editorial é
 * publicado e revisado depois pelo conselho da LAIFT.
 * @param {{status?: string, by?: string, date?: string, review_requested_at?: string}|undefined} review
 * @param {number} [now]
 * @returns {{kind: string, label: string, tooltip: string}|null}
 */
export function getStatusLabel(review, now = Date.now()) {
  if (!review || !review.status) return null;
  switch (review.status) {
    case 'editorial': {
      const asked = review.review_requested_at ? Date.parse(`${review.review_requested_at}T00:00:00Z`) : NaN;
      const days = Number.isNaN(asked) ? 0 : Math.floor((now - asked) / 86400000);
      if (days >= 30) {
        return { kind: 'editorial-late', label: `Aguardando revisão há ${days} dias`, tooltip: 'O conselho editorial da LAIFT ainda não revisou este conteúdo.' };
      }
      return { kind: 'editorial', label: 'Em revisão editorial', tooltip: 'O conselho editorial da LAIFT está revisando este conteúdo.' };
    }
    case 'legacy-unverified':
      return { kind: 'legacy', label: 'Conteúdo antigo · sem revisão', tooltip: 'Migrado de base antiga. Sem revisão formal.' };
    case 'auto-draft':
      return { kind: 'auto', label: 'Gerado automaticamente · não revisado', tooltip: 'Gerado por script a partir de fontes abertas. Não passe adiante sem conferir.' };
    case 'reviewed':
    case 'approved': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(review.date || '');
      const date = m ? `${m[3]}/${m[2]}/${m[1]}` : '';
      const label = review.by ? `Revisado por ${review.by}${date ? ` em ${date}` : ''}` : `Revisado${date ? ` em ${date}` : ''}`;
      return { kind: 'reviewed', label, tooltip: 'Revisado pelo conselho editorial da LAIFT.' };
    }
    default:
      return null;
  }
}

const SIDE_LABEL = { l: 'Esquerdo', L: 'Esquerdo', r: 'Direito', R: 'Direito' };

export function createInfoCard(container, { onAction = () => {}, tts = false } = {}) {
  const { h, setHtml, clear: clearEl, safeUrl } = window.LaiftDom;

  let currentEntry = null;
  let currentContent = null;
  let currentTabId = 'resumo';
  const contentBox = {};

  // Mapeamento de system id → label PT
  const systemMap = Object.fromEntries(SYSTEMS.map((s) => [s.id, s.label]));

  // "Ouvir a ficha" (PR 3.1.10): speechSynthesis em pt-BR. Some quando o
  // navegador não tem a API; para ao trocar de estrutura ou limpar a ficha.
  const speech = tts && typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function'
    ? window.speechSynthesis : null;
  let speakingBtn = null;
  function stopSpeech() {
    if (speech && (speech.speaking || speech.pending)) speech.cancel();
    if (speakingBtn) {
      speakingBtn.setAttribute('aria-pressed', 'false');
      speakingBtn.lastChild.textContent = 'Ouvir';
      speakingBtn = null;
    }
  }
  function speak(text, btn) {
    if (!speech) return;
    if (speakingBtn === btn) { stopSpeech(); return; }
    stopSpeech();
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    const voice = (speech.getVoices() || []).find((v) => /^pt(-|_)BR/i.test(v.lang)) || (speech.getVoices() || []).find((v) => /^pt/i.test(v.lang));
    if (voice) u.voice = voice;
    u.rate = 1;
    u.onend = () => { if (speakingBtn === btn) stopSpeech(); };
    u.onerror = u.onend;
    speakingBtn = btn;
    btn.setAttribute('aria-pressed', 'true');
    btn.lastChild.textContent = 'Parar';
    speech.speak(u);
  }

  /**
   * Renderiza a ficha com entrada e conteúdo (ou null enquanto carrega).
   */
  function render(entry, content) {
    if (!currentEntry || currentEntry.sid !== entry.sid) stopSpeech();
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

    // Voltar / anterior / próxima (PR 3.1.8/3.1.9)
    if (entry.nav) contentBox.root.appendChild(renderNav(entry));

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

    // Selo de revisão (4 estados — getStatusLabel)
    const status = getStatusLabel(content && content.review);
    if (status) {
      const badge = h('div', {
        className: `atlas-card-status atlas-card-status--${status.kind}`, title: status.tooltip,
      }, [
        h('span', { className: 'atlas-card-status-icon', 'aria-hidden': 'true', text: status.kind === 'reviewed' ? '✓' : status.kind === 'editorial-late' ? '⏳' : '🛡' }),
        h('span', { className: 'atlas-card-status-text', text: status.label }),
        h('span', { className: 'laift-sr-only', text: `. ${status.tooltip}` }),
      ]);
      nameContainer.appendChild(badge);
    }
    if (entry.isNew) {
      nameContainer.appendChild(h('span', { className: 'atlas-card-new', text: 'Novo' }));
    }

    titleZone.appendChild(nameContainer);

    // Selos de sistema (cor da camada) e lado
    const subtitle = h('div', { className: 'atlas-card-subtitle' });
    const sysLabel = systemMap[entry.system] || entry.system;
    subtitle.appendChild(h('span', {
      className: 'atlas-card-chip atlas-card-system',
      style: entry.layer ? { '--chip-color': `var(--atlas-color-${entry.layer === 'vasos' ? 'vasos-arteria' : entry.layer})` } : {},
      text: sysLabel,
    }));
    if (SIDE_LABEL[entry.side]) {
      subtitle.appendChild(h('span', { className: 'atlas-card-chip atlas-card-side', text: SIDE_LABEL[entry.side] }));
    }
    // Nome traduzido com ajuda de IA e ainda não revisado pelo conselho (PR 3.1.5).
    if (entry.nameAssisted) {
      subtitle.appendChild(h('span', {
        className: 'atlas-card-chip atlas-card-assisted',
        title: `Tradução assistida, ainda sem revisão do conselho. Nome original: ${entry.names.en}`,
        text: 'Tradução assistida',
      }));
    }
    // "Ver mais": no celular, abre a ficha completa (painel em "metade").
    const more = h('button', { type: 'button', className: 'atlas-card-more', text: 'Ver mais' });
    more.addEventListener('click', () => onAction({ action: 'more', sid: entry.sid }));
    subtitle.appendChild(more);

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
   * Barra de navegação: voltar à estrutura anterior (histórico) e andar pela
   * sequência do sistema (mesma ordem do navegador).
   */
  function renderNav(entry) {
    const { h } = window.LaiftDom;
    const nav = entry.nav;
    const bar = h('nav', { className: 'atlas-card-nav', 'aria-label': 'Navegar entre estruturas' });
    const mk = (action, label, glyph, title, disabled) => {
      const btn = h('button', {
        type: 'button', className: `atlas-card-nav-btn atlas-card-nav-${action}`, title, 'aria-label': title,
        dataset: { navAction: action },
        onClick: () => onAction({ action, sid: entry.sid }),
      }, [
        h('span', { 'aria-hidden': 'true', text: glyph }),
        h('span', { className: 'atlas-card-nav-label', text: label }),
      ]);
      if (disabled) btn.disabled = true;
      return btn;
    };
    bar.appendChild(mk('back', 'Voltar', '←', 'Voltar à estrutura anterior', !nav.canBack));
    bar.appendChild(mk('prev', 'Anterior', '‹', nav.prevName ? `Anterior: ${nav.prevName}` : 'Anterior', !nav.prevName));
    if (nav.position) bar.appendChild(h('span', { className: 'atlas-card-nav-pos', text: nav.position }));
    bar.appendChild(mk('next', 'Próxima', '›', nav.nextName ? `Próxima: ${nav.nextName}` : 'Próxima', !nav.nextName));
    return bar;
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
      // Skeleton (3 linhas pulsantes) no lugar do texto solto; o texto fica
      // para leitores de tela.
      contentBox.contentArea.setAttribute('aria-busy', 'true');
      contentBox.contentArea.appendChild(h('div', { className: 'atlas-card-loading atlas-skeleton' }, [
        h('span', { className: 'laift-sr-only', text: 'Carregando ficha…' }),
        h('span', { className: 'atlas-skeleton-line', style: { width: '60%' }, 'aria-hidden': 'true' }),
        h('span', { className: 'atlas-skeleton-line', style: { width: '40%' }, 'aria-hidden': 'true' }),
        h('span', { className: 'atlas-skeleton-line', style: { width: '90%' }, 'aria-hidden': 'true' }),
      ]));
      return;
    }
    contentBox.contentArea.removeAttribute('aria-busy');
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
      if (speech) {
        const btn = h('button', {
          type: 'button', className: 'atlas-card-listen', 'aria-pressed': 'false',
          title: 'Ouvir o resumo em voz alta',
        }, [h('span', { 'aria-hidden': 'true', text: '🔊 ' }), h('span', { text: 'Ouvir' })]);
        btn.addEventListener('click', () => speak(`${currentEntry ? currentEntry.names.pt + '. ' : ''}${text}`, btn));
        section.appendChild(btn);
      }
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
      stopSpeech();
      if (contentBox.root) clearEl(contentBox.root);
      currentEntry = null;
      currentContent = null;
    },
  };
}
