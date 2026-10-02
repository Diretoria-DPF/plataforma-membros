/**
 * onboarding.js — apresentação de 3 telas do Atlas (Onda 2).
 * ---------------------------------------------------------------------------
 * <dialog id="atlas-onboarding"> com uma tela por vez (<h2> em cada uma),
 * foco preso dentro do diálogo e "Pular" visível em todas as telas (é o
 * primeiro foco — Enter sem querer não avança nada).
 *
 * Quando aparece (decidido em js/main.js com as funções puras abaixo):
 *   - nunca viu, ou viu há 30 dias ou mais (localStorage `atlas.onboarded.v2`);
 *   - não foi dispensada nesta aba (sessionStorage `atlas.onboarding.dismissed.v1`
 *     — cada aba é uma sessão; 3 abas novas podem mostrar 3 vezes: aceito);
 *   - a página não foi aberta por link direto (`#…sid=…`).
 * Fechar de qualquer jeito (Pular, Esc, concluir) marca como vista. Reabrir
 * por "Como usar" (menu Mais opções) só mostra — não regrava a data.
 */

export const ONBOARDED_KEY = 'atlas.onboarded.v2';
export const DISMISSED_KEY = 'atlas.onboarding.dismissed.v1';
export const ONBOARDING_TTL_DAYS = 30;

/** Deve mostrar? (storage corrompido/bloqueado → mostra). */
export function shouldShowOnboarding(storage, now = Date.now()) {
  try {
    const raw = storage && storage.getItem(ONBOARDED_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'string') return true;
    const t = new Date(parsed.at).getTime();
    if (Number.isNaN(t)) return true;
    return (now - t) / 86400000 >= ONBOARDING_TTL_DAYS;
  } catch (e) {
    return true;
  }
}

export function markOnboarded(storage, now = Date.now()) {
  try { if (storage) storage.setItem(ONBOARDED_KEY, JSON.stringify({ at: new Date(now).toISOString() })); } catch (e) { /* ITP/privado */ }
}

/** Aberta por link direto para uma estrutura? Então não interrompe. */
export function isDeepLink(hash) {
  return /^#.*sid=/.test(String(hash || ''));
}

export function wasDismissedThisTab(session) {
  try { return !!(session && session.getItem(DISMISSED_KEY)); } catch (e) { return false; }
}
export function markDismissedThisTab(session) {
  try { if (session) session.setItem(DISMISSED_KEY, '1'); } catch (e) { /* bloqueado */ }
}

const SCREENS = [
  {
    title: 'Toque numa estrutura',
    text: 'Toque em qualquer parte do corpo para ver o nome, o que faz e onde fica.',
    art: 'tap',
  },
  {
    title: 'Ferramentas essenciais',
    cards: [
      { glyph: '▤', name: 'Camadas', text: 'Ligue e desligue pele, músculos, ossos e órgãos.' },
      { glyph: '◎', name: 'Isolar', text: 'Veja só uma estrutura, sem o resto atrapalhar.' },
      { glyph: '☠', name: 'Raio-X', text: 'Deixe pele e músculos transparentes.' },
    ],
  },
  {
    title: 'Comece por onde quiser',
    text: 'Explore o corpo livremente ou teste o que você sabe com casos clínicos.',
    final: true,
  },
];

/**
 * @param {{ onExplore?: Function, onQuiz?: Function, onOpen?: Function, onClose?: Function,
 *           storage?: Storage, session?: Storage }} opts
 */
export function createOnboarding({ onExplore, onQuiz, onOpen, onClose, storage, session } = {}) {
  const { h, clear } = window.LaiftDom;
  let dialog = null;
  let index = 0;
  let replay = false;

  function el(tag, attrs, children) { return h(tag, attrs, children); }

  function build() {
    dialog = el('dialog', { id: 'atlas-onboarding', className: 'atlas-onboarding', 'aria-labelledby': 'atlas-onboarding-title' }, []);
    dialog.addEventListener('cancel', (evt) => { evt.preventDefault(); close(); }); // Esc
    dialog.addEventListener('keydown', trapTab);
    document.body.appendChild(dialog);
  }

  function focusables() {
    return Array.from(dialog.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
  }
  function trapTab(e) {
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { first.focus(); e.preventDefault(); }
  }

  function button(label, cls, onClick) {
    const b = el('button', { type: 'button', className: `atlas-onb-btn ${cls}` }, [label]);
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    clear(dialog);
    const s = SCREENS[index];
    const skip = button('Pular', 'atlas-onb-skip', () => close());
    const body = [
      el('div', { className: 'atlas-onb-top' }, [
        el('span', { className: 'atlas-onb-step', 'aria-hidden': 'true' }, [`${index + 1} de ${SCREENS.length}`]),
        skip,
      ]),
      el('h2', { id: 'atlas-onboarding-title', className: 'atlas-onb-title' }, [s.title]),
    ];
    if (s.art === 'tap') {
      body.push(el('div', { className: 'atlas-onb-art', 'aria-hidden': 'true' }, [
        el('span', { className: 'atlas-onb-body' }, []),
        el('span', { className: 'atlas-onb-finger' }, []),
      ]));
    }
    if (s.text) body.push(el('p', { className: 'atlas-onb-text' }, [s.text]));
    if (s.cards) {
      body.push(el('ul', { className: 'atlas-onb-cards' }, s.cards.map((c) => el('li', { className: 'atlas-onb-card' }, [
        el('span', { className: 'atlas-onb-card-glyph', 'aria-hidden': 'true' }, [c.glyph]),
        el('span', { className: 'atlas-onb-card-text' }, [el('strong', {}, [c.name]), ` ${c.text}`]),
      ]))));
    }
    const nav = [];
    if (index > 0) nav.push(button('Voltar', 'atlas-onb-back', () => { index -= 1; render(); }));
    if (s.final) {
      nav.push(button('Ir para o Quiz', 'atlas-onb-secondary', () => { close(); if (onQuiz) onQuiz(); }));
      nav.push(button('Começar a explorar', 'atlas-onb-primary', () => { close(); if (onExplore) onExplore(); }));
    } else {
      nav.push(button('Próximo', 'atlas-onb-primary', () => { index += 1; render(); }));
    }
    body.push(el('div', { className: 'atlas-onb-nav' }, nav));
    body.forEach((n) => dialog.appendChild(n));
    skip.focus();
  }

  function open({ replay: isReplay = false } = {}) {
    if (!dialog) build();
    if (dialog.open) return;
    replay = isReplay;
    index = 0;
    render();
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    dialog.querySelector('.atlas-onb-skip').focus();
    if (onOpen) onOpen();
  }

  function close() {
    if (!dialog || !dialog.open) return;
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    if (!replay) markOnboarded(storage);
    markDismissedThisTab(session);
    if (onClose) onClose();
  }

  return { open, close, isOpen: () => !!(dialog && dialog.open) };
}
