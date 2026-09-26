/**
 * toolbar.js — barra de ferramentas do Atlas (mini toolbar vertical)
 *
 * Exporta `createToolbar(container, {bus, store, onOpenLayers, onToggleFullscreen, onOpenCredits})`
 * que retorna `{dispose()}`.
 */

(function () {
  'use strict';

  const { h } = window.LaiftDom;

  /**
   * Estados locais da toolbar
   */
  const localState = {
    isolation: null,
    xray: false,
    clipPlane: null,
    clipOffset: 0,
  };

  /**
   * Cria a toolbar
   */
  function createToolbar(container, { bus, store, onOpenLayers, onToggleFullscreen, onOpenCredits }) {
    const storeState = store.get();

    // Estado inicial do local
    localState.isolation = storeState.isolation;
    localState.xray = storeState.xray;
    localState.clipPlane = storeState.clip.plane;
    localState.clipOffset = storeState.clip.offset || 0;

    // Container da toolbar
    const toolbarEl = h('div', { className: 'atlas-toolbar' }, []);

    // Botão Camadas
    const camadosBtn = h('button', {
      className: 'atlas-toolbar-btn',
      'aria-label': 'Camadas',
      'aria-pressed': 'false',
      onClick: onOpenLayers,
    }, '▤');
    toolbarEl.appendChild(camadosBtn);

    // Botão Isolar
    const isolarBtn = h('button', {
      className: 'atlas-toolbar-btn',
      'aria-label': 'Isolar',
      onClick: () => {
        const sel = store.get().selectedSid;
        if (!sel) return;
        if (localState.isolation.active === 'isolate' && localState.isolation.sid === sel) {
          bus.emit('visibility:reset', {});
          localState.isolation = { active: 'none', sid: null };
        } else {
          bus.emit('visibility:isolate', { sid: sel });
          localState.isolation = { active: 'isolate', sid: sel };
        }
        updateIolarBtnState();
      },
    }, '◎');
    toolbarEl.appendChild(isolarBtn);

    // Botão Raio-X
    const xrayBtn = h('button', {
      className: 'atlas-toolbar-btn',
      'aria-label': 'Raio-X',
      'aria-pressed': localState.xray ? 'true' : 'false',
      onClick: () => {
        localState.xray = !localState.xray;
        bus.emit('xray:set', { enabled: localState.xray });
        updateXrayBtnState();
      },
    }, '☠');
    toolbarEl.appendChild(xrayBtn);

    // Botão Corte com submenu
    const corteBtn = h('button', {
      className: 'atlas-toolbar-btn',
      'aria-label': 'Corte',
      onClick: (e) => {
        toggleCorteMenu(e.currentTarget);
      },
    }, '✂');
    toolbarEl.appendChild(corteBtn);

    // Container para o painel de corte (offset slider + menu)
    const cortePanel = h('div', { className: 'atlas-corte-panel' }, []);

    // Menu de seleção de plano
    const corteMenu = h('div', { className: 'atlas-corte-menu' }, [
      h('button', {
        className: 'atlas-corte-option',
        onClick: () => {
          localState.clipPlane = null;
          bus.emit('clip:set', { plane: null, offset: null });
          updateClipState();
          cortePanel.style.display = 'none';
        },
      }, 'Nenhum'),
      h('button', {
        className: 'atlas-corte-option',
        onClick: () => {
          localState.clipPlane = 'sagital';
          bus.emit('clip:set', { plane: 'sagital', offset: 0 });
          updateClipState();
        },
      }, 'Sagital'),
      h('button', {
        className: 'atlas-corte-option',
        onClick: () => {
          localState.clipPlane = 'coronal';
          bus.emit('clip:set', { plane: 'coronal', offset: 0 });
          updateClipState();
        },
      }, 'Coronal'),
      h('button', {
        className: 'atlas-corte-option',
        onClick: () => {
          localState.clipPlane = 'transversal';
          bus.emit('clip:set', { plane: 'transversal', offset: 0 });
          updateClipState();
        },
      }, 'Transversal'),
    ]);

    // Slider de offset (mostrado só se houver plano ativo)
    const clipSlider = h('input', {
      type: 'range',
      className: 'atlas-clip-slider',
      min: '-1',
      max: '1',
      step: '0.01',
      value: '0',
      style: { display: 'none' },
      onInput: (e) => {
        localState.clipOffset = parseFloat(e.currentTarget.value);
        bus.emit('clip:set', { plane: localState.clipPlane, offset: localState.clipOffset });
      },
    });

    cortePanel.appendChild(corteMenu);
    cortePanel.appendChild(clipSlider);
    toolbarEl.appendChild(cortePanel);

    // Botão Reset
    const resetBtn = h('button', {
      className: 'atlas-toolbar-btn',
      'aria-label': 'Reset',
      onClick: () => {
        bus.emit('visibility:reset', {});
        bus.emit('view:reset', {});
        localState.isolation = { active: 'none', sid: null };
        localState.clipPlane = null;
        localState.clipOffset = 0;
        updateIolarBtnState();
        updateClipState();
      },
    }, '⟲');
    toolbarEl.appendChild(resetBtn);

    // Botão More (...)
    const moreBtn = h('button', {
      className: 'atlas-toolbar-btn',
      'aria-label': 'Mais',
      onClick: (e) => {
        toggleMoreMenu(e.currentTarget);
      },
    }, '⋯');
    toolbarEl.appendChild(moreBtn);

    // Menu More
    const moreMenu = h('div', { className: 'atlas-more-menu' }, [
      h('button', {
        className: 'atlas-more-option',
        onClick: () => {
          bus.emit('view:preset', { name: 'anterior' });
          moreMenu.style.display = 'none';
        },
      }, 'Anterior'),
      h('button', {
        className: 'atlas-more-option',
        onClick: () => {
          bus.emit('view:preset', { name: 'posterior' });
          moreMenu.style.display = 'none';
        },
      }, 'Posterior'),
      h('button', {
        className: 'atlas-more-option',
        onClick: () => {
          bus.emit('view:preset', { name: 'esquerda' });
          moreMenu.style.display = 'none';
        },
      }, 'Esquerda'),
      h('button', {
        className: 'atlas-more-option',
        onClick: () => {
          bus.emit('view:preset', { name: 'direita' });
          moreMenu.style.display = 'none';
        },
      }, 'Direita'),
      h('button', {
        className: 'atlas-more-option',
        onClick: () => {
          bus.emit('view:preset', { name: 'superior' });
          moreMenu.style.display = 'none';
        },
      }, 'Superior'),
      h('button', {
        className: 'atlas-more-option',
        onClick: () => {
          bus.emit('view:preset', { name: 'inferior' });
          moreMenu.style.display = 'none';
        },
      }, 'Inferior'),
      h('button', {
        className: 'atlas-more-option',
        onClick: () => {
          const labelsEnabled = store.get().labels !== false;
          bus.emit('labels:set', { enabled: !labelsEnabled });
          moreMenu.style.display = 'none';
        },
      }, 'Rótulos'),
      h('button', {
        className: 'atlas-more-option',
        onClick: () => {
          onToggleFullscreen();
          moreMenu.style.display = 'none';
        },
      }, 'Tela cheia'),
      h('button', {
        className: 'atlas-more-option',
        onClick: () => {
          onOpenCredits();
          moreMenu.style.display = 'none';
        },
      }, 'Créditos'),
    ]);
    toolbarEl.appendChild(moreMenu);

    // Inscrever em mudanças do store
    const unsubscribe = store.subscribe(
      (s) => s,
      (newState) => {
        localState.xray = newState.xray;
        localState.isolation = newState.isolation;
        localState.clipPlane = newState.clip.plane;
        localState.clipOffset = newState.clip.offset || 0;
        updateXrayBtnState();
        updateIolarBtnState();
        updateClipState();
      }
    );

    // Handler de teclado
    function handleKeyDown(e) {
      // Ignorar se focus está em input/textarea
      if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;

      const key = e.key.toLowerCase();

      if (key === 'h') {
        e.preventDefault();
        const sel = store.get().selectedSid;
        if (sel) bus.emit('visibility:hide', { sid: sel });
      } else if (key === 'i') {
        e.preventDefault();
        const sel = store.get().selectedSid;
        if (sel) {
          if (localState.isolation.active === 'isolate' && localState.isolation.sid === sel) {
            bus.emit('visibility:reset', {});
          } else {
            bus.emit('visibility:isolate', { sid: sel });
          }
        }
      } else if (key === 'x') {
        e.preventDefault();
        localState.xray = !localState.xray;
        bus.emit('xray:set', { enabled: localState.xray });
      } else if (key === 'escape') {
        e.preventDefault();
        // Fechar menus primeiro
        cortePanel.style.display = 'none';
        moreMenu.style.display = 'none';
        // Depois limpar seleção
        bus.emit('structure:select', { sid: null, source: 'api' });
      } else if (key === '/') {
        e.preventDefault();
        bus.emit('search:open', {});
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    // Funções auxiliares de atualização de UI
    function updateXrayBtnState() {
      xrayBtn.setAttribute('aria-pressed', localState.xray ? 'true' : 'false');
      xrayBtn.classList.toggle('active', localState.xray);
    }

    function updateIolarBtnState() {
      const isIsolated = localState.isolation.active === 'isolate' && localState.isolation.sid;
      const sel = store.get().selectedSid;
      isolarBtn.disabled = !sel;
      isolarBtn.classList.toggle('active', isIsolated && isIsolated === sel);
    }

    function updateClipState() {
      if (localState.clipPlane) {
        clipSlider.style.display = 'block';
        clipSlider.value = localState.clipOffset || 0;
        corteBtn.textContent = localState.clipPlane.charAt(0).toUpperCase();
      } else {
        clipSlider.style.display = 'none';
        corteBtn.textContent = '✂';
      }
    }

    function toggleCorteMenu(btn) {
      const displayed = cortePanel.style.display === 'block';
      cortePanel.style.display = displayed ? 'none' : 'block';
    }

    function toggleMoreMenu(btn) {
      const displayed = moreMenu.style.display === 'block';
      moreMenu.style.display = displayed ? 'none' : 'block';
    }

    // Fechar menus ao clicar fora
    document.addEventListener('click', (e) => {
      if (!toolbarEl.contains(e.target)) {
        cortePanel.style.display = 'none';
        moreMenu.style.display = 'none';
      }
    });

    container.appendChild(toolbarEl);

    // Estado inicial
    updateXrayBtnState();
    updateIolarBtnState();
    updateClipState();

    return {
      dispose() {
        unsubscribe();
        document.removeEventListener('keydown', handleKeyDown);
        toolbarEl.remove();
      },
    };
  }

  window.createToolbar = createToolbar;
})();
