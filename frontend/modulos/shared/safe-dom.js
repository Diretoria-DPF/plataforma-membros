/**
 * safe-dom.js — utilitários de DOM seguro dos módulos LAIFT (Fase 4).
 *
 * Por que existe: os módulos rodam num iframe da MESMA origem da plataforma,
 * onde fica localStorage['pm_session']. Um XSS num módulo (nome vindo do
 * PubChem, texto do OpenFDA, histórico do IndexedDB, entrada do usuário...)
 * vale tanto quanto um XSS na plataforma. Por isso:
 *
 *   - `escapeHtml` é o ÚNICO escape de HTML dos módulos;
 *   - `html`...`` é um template que escapa TODA interpolação e devolve um
 *     objeto marcado (SafeHtml); `setHtml`/`appendHtml` só aceitam esse
 *     objeto — string crua vira texto, nunca marcação. Assim o único
 *     `innerHTML` dos módulos fica aqui, auditável;
 *   - `h()` monta elementos com textContent, para quem prefere DOM puro;
 *   - `delegateActions` substitui os handlers inline (onclick="...") por
 *     `data-action`, o que prepara a CSP sem 'unsafe-inline' (Onda 2);
 *   - `postToParent`/`isTrustedMessage` fixam o alvo e validam a origem do
 *     postMessage (nunca '*');
 *   - `openExternal` abre sites de terceiros com noopener/noreferrer.
 *
 * Script clássico (sem módulos ES) porque as páginas dos módulos também são.
 * Carregue-o antes dos scripts da página: <script src="../shared/safe-dom.js">.
 */
(function (global) {
  'use strict';

  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

  /** Escapa qualquer valor para uso em texto OU atributo HTML (entre aspas). */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"'`]/g, function (ch) { return ESCAPES[ch]; });
  }

  // Marca de origem: só objetos criados por html``/trusted() passam por
  // setHtml. Um Symbol local não pode ser forjado por dado vindo de JSON.
  var BRAND = typeof Symbol === 'function' ? Symbol('laift.safeHtml') : '__laiftSafeHtml__';

  function SafeHtml(markup) {
    this.markup = markup;
    this[BRAND] = true;
  }
  SafeHtml.prototype.toString = function () { return this.markup; };

  function isSafe(value) {
    return !!(value && typeof value === 'object' && value[BRAND] === true);
  }

  function interpolate(value) {
    if (isSafe(value)) return value.markup;
    if (Array.isArray(value)) return value.map(interpolate).join('');
    return escapeHtml(value);
  }

  /**
   * Template seguro: html`<p>${nome}</p>` escapa `nome`. Aceita aninhar
   * outros html`` (inclusive arrays deles, ex.: lista.map(i => html`...`)).
   */
  function html(strings) {
    var out = strings[0];
    for (var i = 1; i < strings.length; i++) {
      out += interpolate(arguments[i]) + strings[i];
    }
    return new SafeHtml(out);
  }

  /**
   * Marca como segura uma marcação CONSTANTE escrita no próprio código
   * (nunca use com dado dinâmico — para isso existe html``).
   */
  function trusted(constantMarkup) {
    return new SafeHtml(String(constantMarkup));
  }

  /** Substitui o conteúdo de `el`. Sem SafeHtml, o valor entra como texto. */
  function setHtml(el, content) {
    if (!el) return el;
    if (isSafe(content)) el.innerHTML = content.markup;
    else el.textContent = content === null || content === undefined ? '' : String(content);
    return el;
  }

  /** Acrescenta ao fim de `el`. Sem SafeHtml, o valor entra como texto. */
  function appendHtml(el, content) {
    if (!el) return el;
    if (isSafe(content)) el.insertAdjacentHTML('beforeend', content.markup);
    else el.appendChild(global.document.createTextNode(content === null || content === undefined ? '' : String(content)));
    return el;
  }

  /** Esvazia um elemento sem passar por innerHTML. */
  function clear(el) {
    if (el) while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  /**
   * h('div', { className: 'x', dataset: { id: 1 }, onClick: fn }, ['texto', filho])
   * Strings viram nós de texto; atributos passam por setAttribute; `on*`
   * com função vira addEventListener (nunca atributo inline).
   */
  function h(tag, attrs, children) {
    var el = global.document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'className') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
        else if (key === 'dataset' && typeof value === 'object') Object.assign(el.dataset, value);
        else if (/^on[A-Z]/.test(key) && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key in el && typeof value !== 'string') el[key] = value;
        else el.setAttribute(key, value === true ? '' : String(value));
      });
    }
    [].concat(children === undefined ? [] : children).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      el.appendChild(typeof child === 'object' && child.nodeType ? child : global.document.createTextNode(String(child)));
    });
    return el;
  }

  /**
   * Resolve "Objeto.metodo" ou "funcao" a partir de window. Só nomes simples
   * (letras, números, _ e $, com no máximo um ponto): nada de expressões.
   */
  function resolveAction(name) {
    if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)?$/.test(name)) return null;
    var parts = name.split('.');
    var owner = parts.length === 2 ? global[parts[0]] : global;
    var fn = owner && owner[parts[parts.length - 1]];
    return typeof fn === 'function' ? { owner: owner, fn: fn } : null;
  }

  function parseJsonArgs(raw) {
    if (raw === null || raw === undefined || raw === '') return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) { return []; }
  }

  function parseArgs(el) {
    if (el.hasAttribute('data-args')) return parseJsonArgs(el.getAttribute('data-args'));
    if (el.hasAttribute('data-arg')) return [el.getAttribute('data-arg')];
    return [];
  }

  // Tabela de delegadores por nó raiz (WeakMap quando suportado, fallback no elemento)
  var DELEGATORS = typeof WeakMap === 'function' ? new WeakMap() : null;

  function getDelegator(root) {
    if (DELEGATORS) return DELEGATORS.get(root);
    return root.__laiftActionDelegator || null;
  }

  function setDelegator(root, delegator) {
    if (DELEGATORS) {
      DELEGATORS.set(root, delegator);
    } else {
      root.__laiftActionDelegator = delegator;
    }
  }

  function removeDelegator(root) {
    if (DELEGATORS) {
      DELEGATORS.delete(root);
    } else {
      delete root.__laiftActionDelegator;
    }
  }

  /**
   * Delegação de eventos para substituir handlers inline:
   *   <button data-action="MolEngine.applyStyle" data-arg="stick">
   *   <button data-action="abrirStudio">
   *   <select data-action-change="selecionarProcesso">  (recebe o value)
   *   <input  data-action-input="filtrar">               (recebe o value)
   * `allowList` (opcional, recomendado) restringe as ações aceitas: mesmo que
   * alguém consiga injetar um data-action, ele só chama o que está na lista.
   * `data-args` aceita JSON (lista de argumentos). Com `data-then`, uma
   * segunda ação é chamada em seguida (ex.: mudar o zoom e abrir o PDB).
   *
   * Idempotente por `root`: chamadas sucessivas sobre o mesmo alvo mesclam
   * suas allowlists sem criar múltiplos ouvintes concorrentes no DOM.
   * Retorna uma função `off()` para desmontagem limpa durante reinicializações.
   */
  function delegateActions(root, allowList) {
    root = root || global.document;
    var delegator = getDelegator(root);

    if (!delegator) {
      delegator = {
        registrations: [],
        allowedActions: new Set(),
        hasUnrestricted: false,
        handlers: {},
        updateAllowed: function () {
          delegator.allowedActions.clear();
          delegator.hasUnrestricted = false;
          for (var i = 0; i < delegator.registrations.length; i++) {
            var reg = delegator.registrations[i];
            if (!reg.allowList) {
              delegator.hasUnrestricted = true;
            } else {
              for (var j = 0; j < reg.allowList.length; j++) {
                delegator.allowedActions.add(reg.allowList[j]);
              }
            }
          }
        }
      };

      function run(el, attr, evt, extraArgs) {
        var names = [el.getAttribute(attr)];
        if (attr === 'data-action' && el.hasAttribute('data-then')) names.push(el.getAttribute('data-then'));
        names.forEach(function (name, idx) {
          if (!name) return;
          if (!delegator.hasUnrestricted && delegator.registrations.length > 0 && !delegator.allowedActions.has(name)) {
            console.warn('[LaiftDom] ação não permitida:', name);
            return;
          }
          var target = resolveAction(name);
          if (!target) {
            console.warn('[LaiftDom] ação indisponível:', name);
            return;
          }
          var args = idx === 0 ? (extraArgs || parseArgs(el)) : parseJsonArgs(el.getAttribute('data-then-args'));
          target.fn.apply(target.owner, args);
        });
      }

      delegator.handlers.click = function (evt) {
        var el = evt.target && evt.target.closest ? evt.target.closest('[data-action]') : null;
        if (!el || !root.contains(el) || el.disabled) return;
        if (el.tagName === 'A') evt.preventDefault();
        run(el, 'data-action', evt);
      };

      delegator.handlers.change = function (evt) {
        var el = evt.target;
        if (!el || !el.hasAttribute || !el.hasAttribute('data-action-change')) return;
        var value = el.type === 'checkbox' ? el.checked : el.value;
        run(el, 'data-action-change', evt, parseArgs(el).concat([value]));
      };

      delegator.handlers.input = function (evt) {
        var el = evt.target;
        if (!el || !el.hasAttribute || !el.hasAttribute('data-action-input')) return;
        run(el, 'data-action-input', evt, parseArgs(el).concat([el.value]));
      };

      // Elementos não-botão com data-action (cartões, itens de lista) ficam
      // acionáveis pelo teclado: Enter/Espaço disparam o mesmo clique.
      delegator.handlers.keydown = function (evt) {
        if (evt.key !== 'Enter' && evt.key !== ' ') return;
        var el = evt.target;
        if (!el || !el.hasAttribute || !el.hasAttribute('data-action')) return;
        if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) return;
        evt.preventDefault();
        el.click();
      };

      root.addEventListener('click', delegator.handlers.click);
      root.addEventListener('change', delegator.handlers.change);
      root.addEventListener('input', delegator.handlers.input);
      root.addEventListener('keydown', delegator.handlers.keydown);

      setDelegator(root, delegator);
    }

    var registration = {
      allowList: allowList ? Array.from(allowList) : null
    };
    delegator.registrations.push(registration);
    delegator.updateAllowed();

    return function off() {
      var idx = delegator.registrations.indexOf(registration);
      if (idx !== -1) {
        delegator.registrations.splice(idx, 1);
        delegator.updateAllowed();
      }
      if (delegator.registrations.length === 0) {
        root.removeEventListener('click', delegator.handlers.click);
        root.removeEventListener('change', delegator.handlers.change);
        root.removeEventListener('input', delegator.handlers.input);
        root.removeEventListener('keydown', delegator.handlers.keydown);
        removeDelegator(root);
      }
    };
  }

  /** Remove todos os delegadores ativos em `root`. */
  function undelegateActions(root) {
    root = root || global.document;
    var delegator = getDelegator(root);
    if (!delegator) return;
    root.removeEventListener('click', delegator.handlers.click);
    root.removeEventListener('change', delegator.handlers.change);
    root.removeEventListener('input', delegator.handlers.input);
    root.removeEventListener('keydown', delegator.handlers.keydown);
    removeDelegator(root);
  }

  /** postMessage para a janela pai, sempre com a origem fixa (nunca '*'). */
  function postToParent(message) {
    if (global.parent && global.parent !== global) global.parent.postMessage(message, global.location.origin);
  }

  /** Envia para um iframe/janela da mesma origem. */
  function postTo(win, message) {
    if (win) win.postMessage(message, global.location.origin);
  }

  /** Só aceita mensagens da própria origem (os módulos e a plataforma). */
  function isTrustedMessage(event) {
    return !!event && event.origin === global.location.origin;
  }

  /** Abre site de terceiros sem dar a ele acesso a window.opener. */
  function openExternal(url) {
    var w = global.open(url, '_blank', 'noopener,noreferrer');
    if (w) { try { w.opener = null; } catch (e) { /* já isolado */ } }
    return w;
  }

  /** Aceita só URLs http(s) (ou relativas) para src/href vindos de dado. */
  function safeUrl(url) {
    try {
      var parsed = new URL(String(url), global.location.href);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'blob:' ? parsed.href : '';
    } catch (e) { return ''; }
  }

  global.LaiftDom = {
    escapeHtml: escapeHtml,
    html: html,
    trusted: trusted,
    isSafe: isSafe,
    setHtml: setHtml,
    appendHtml: appendHtml,
    clear: clear,
    h: h,
    delegateActions: delegateActions,
    undelegateActions: undelegateActions,
    postToParent: postToParent,
    postTo: postTo,
    isTrustedMessage: isTrustedMessage,
    openExternal: openExternal,
    safeUrl: safeUrl,
  };
})(window);
