/**
 * context-menu.js — menu de contexto flutuante
 *
 * Exporta `createContextMenu({bus, getLabel})` que retorna
 * `{open({client:{x,y}, sid}), close(), dispose()}`.
 */

(function () {
  'use strict';

  const { h } = window.LaiftDom;

  /**
   * Cria um menu de contexto
   */
  function createContextMenu({ bus, getLabel }) {
    let currentSid = null;
    let isOpen = false;

    const menuEl = h('div', {
      className: 'atlas-context-menu',
      role: 'menu',
      style: {
        position: 'fixed',
        display: 'none',
        zIndex: 'calc(var(--atlas-z-context-menu))',
        backgroundColor: 'var(--laift-surface)',
        borderRadius: 'var(--laift-radius)',
        boxShadow: 'var(--laift-shadow)',
        minWidth: '200px',
        overflow: 'hidden',
      },
    }, []);

    // Título (nome da estrutura)
    const titleEl = h('div', {
      className: 'atlas-context-menu-title',
      style: {
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '600',
        borderBottom: '1px solid var(--laift-border)',
        color: 'var(--laift-text)',
      },
    }, 'Estrutura');

    // Opções do menu
    const optionsContainer = h('div', { className: 'atlas-context-menu-options' }, [
      h('button', {
        className: 'atlas-context-menu-option',
        role: 'menuitem',
        style: {
          display: 'block',
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: '14px',
          color: 'var(--laift-text)',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          transition: 'background-color 200ms',
        },
        onMouseEnter: function() {
          this.style.backgroundColor = 'var(--laift-border)';
        },
        onMouseLeave: function() {
          this.style.backgroundColor = 'transparent';
        },
        onClick: () => {
          if (currentSid) {
            bus.emit('visibility:isolate', { sid: currentSid });
            close();
          }
        },
      }, 'Isolar'),
      h('button', {
        className: 'atlas-context-menu-option',
        role: 'menuitem',
        style: {
          display: 'block',
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: '14px',
          color: 'var(--laift-text)',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          transition: 'background-color 200ms',
        },
        onMouseEnter: function() {
          this.style.backgroundColor = 'var(--laift-border)';
        },
        onMouseLeave: function() {
          this.style.backgroundColor = 'transparent';
        },
        onClick: () => {
          if (currentSid) {
            bus.emit('visibility:hide', { sid: currentSid });
            close();
          }
        },
      }, 'Ocultar'),
      h('button', {
        className: 'atlas-context-menu-option',
        role: 'menuitem',
        style: {
          display: 'block',
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: '14px',
          color: 'var(--laift-text)',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          transition: 'background-color 200ms',
        },
        onMouseEnter: function() {
          this.style.backgroundColor = 'var(--laift-border)';
        },
        onMouseLeave: function() {
          this.style.backgroundColor = 'transparent';
        },
        onClick: () => {
          if (currentSid) {
            bus.emit('visibility:ghost', { sid: currentSid });
            close();
          }
        },
      }, 'Fantasma'),
      h('button', {
        className: 'atlas-context-menu-option',
        role: 'menuitem',
        style: {
          display: 'block',
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: '14px',
          color: 'var(--laift-text)',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          transition: 'background-color 200ms',
        },
        onMouseEnter: function() {
          this.style.backgroundColor = 'var(--laift-border)';
        },
        onMouseLeave: function() {
          this.style.backgroundColor = 'transparent';
        },
        onClick: () => {
          if (currentSid) {
            bus.emit('structure:select', { sid: currentSid, source: 'api' });
            close();
          }
        },
      }, 'Info'),
    ]);

    menuEl.appendChild(titleEl);
    menuEl.appendChild(optionsContainer);
    document.body.appendChild(menuEl);

    // Fechar ao clicar fora
    function handleClickOutside(e) {
      if (!menuEl.contains(e.target)) {
        close();
      }
    }

    // Fechar com Esc
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        close();
      }
    }

    function open({ client, sid }) {
      currentSid = sid;
      const label = getLabel ? getLabel(sid) : sid;
      titleEl.textContent = label;

      // Posicionar no viewport
      let x = client.x;
      let y = client.y;

      menuEl.style.display = 'block';

      // Medir depois de mostrar
      const rect = menuEl.getBoundingClientRect();
      const menuW = rect.width;
      const menuH = rect.height;
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;

      // Ajustar se sair da viewport
      if (x + menuW > viewW) x = viewW - menuW - 12;
      if (y + menuH > viewH) y = viewH - menuH - 12;
      x = Math.max(12, x);
      y = Math.max(12, y);

      menuEl.style.left = x + 'px';
      menuEl.style.top = y + 'px';

      isOpen = true;
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);

      // Focus na primeira opção
      const firstOption = optionsContainer.querySelector('[role="menuitem"]');
      if (firstOption) firstOption.focus();
    }

    function close() {
      if (!isOpen) return;
      menuEl.style.display = 'none';
      isOpen = false;
      currentSid = null;
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    }

    function dispose() {
      close();
      menuEl.remove();
    }

    return { open, close, dispose };
  }

  window.createContextMenu = createContextMenu;
})();
