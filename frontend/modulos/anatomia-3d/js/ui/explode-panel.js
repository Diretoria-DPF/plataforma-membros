/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * explode-panel.js — painel da vista "Separar peças" (carregado sob demanda)
 * ---------------------------------------------------------------------------
 * Controle deslizante (0–100%) + botão "Juntar peças". Acessível: o slider
 * tem rótulo e `aria-valuetext` em PT-BR, o botão fechar e o "Juntar" têm
 * rótulo, Esc fecha, a mensagem de escopo é `aria-live`. Alvos de toque de
 * 44px (celular). O CSS vem de css/explode.css (injetado pelo explode-entry).
 */

import { percentToAmount } from '../engine/explode-math.js';

const HINTS = Object.freeze({
  corpo: 'Afasta as camadas a partir do centro do corpo: pele e músculos saem primeiro, o esqueleto e as vísceras ficam mais perto.',
  orgao: 'Afasta as partes da estrutura isolada a partir do centro dela.',
  semPartes: 'A estrutura isolada tem uma peça só. Para separar o corpo, limpe o isolamento (botão Centralizar).',
});

const h = (tag, props = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') el.textContent = v;
    else if (k === 'className') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.appendChild(c);
  return el;
};

/** Texto do valor para leitores de tela. */
export const valueText = (percent) => (percent === 0 ? 'Peças juntas' : `Peças ${percent}% separadas`);

/** Mensagem de escopo conforme o estado do controlador. */
export function hintFor(info) {
  if (info.mode === 'orgao') return info.separable ? HINTS.orgao : HINTS.semPartes;
  return HINTS.corpo;
}

/**
 * @param {{ controller: Object, onClose: () => void }} deps
 * @returns {{ element: HTMLElement, setOpen: (open: boolean) => void }}
 */
export function createExplodePanel({ controller, onClose }) {
  const range = h('input', {
    id: 'atlas-explode-range', className: 'atlas-explode-range', type: 'range', min: '0', max: '100', step: '1', value: '0',
    'aria-valuetext': valueText(0),
  });
  const output = h('output', { className: 'atlas-explode-value', for: 'atlas-explode-range', text: '0%' });
  const hint = h('p', { className: 'atlas-explode-hint', 'aria-live': 'polite' });
  const join = h('button', { className: 'atlas-explode-join', type: 'button', 'aria-label': 'Juntar as peças de novo', text: 'Juntar peças' });
  const close = h('button', { className: 'atlas-explode-close', type: 'button', 'aria-label': 'Fechar Separar peças', text: '×' });
  const element = h('div', { className: 'atlas-explode-host', role: 'dialog', 'aria-label': 'Separar peças' }, [
    close,
    h('div', { className: 'atlas-explode-panel' }, [
      h('h2', { className: 'atlas-explode-title', text: 'Separar peças' }),
      h('label', { className: 'atlas-explode-label', for: 'atlas-explode-range', text: 'Distância entre as peças' }),
      h('div', { className: 'atlas-explode-row' }, [range, output]),
      hint,
      join,
    ]),
  ]);

  function render(info) {
    const percent = Math.round(info.amount * 100);
    if (Number(range.value) !== percent) range.value = String(percent);
    output.textContent = `${percent}%`;
    range.setAttribute('aria-valuetext', valueText(percent));
    hint.textContent = hintFor(info);
    join.disabled = percent === 0;
  }

  range.addEventListener('input', () => controller.setAmount(percentToAmount(range.value)));
  join.addEventListener('click', () => { controller.setAmount(0); range.focus(); });
  close.addEventListener('click', () => onClose());
  element.addEventListener('keydown', (evt) => { if (evt.key === 'Escape') onClose(); });
  controller.subscribe(render);
  render(controller.getInfo());

  function setOpen(open) {
    element.hidden = !open;
    if (open) { render(controller.getInfo()); range.focus(); } else {
      const back = document.getElementById('atlas-toolbar-more') || document.getElementById('atlas-toolbar-tools');
      if (back && typeof back.focus === 'function') back.focus();
    }
  }

  return { element, setOpen };
}
