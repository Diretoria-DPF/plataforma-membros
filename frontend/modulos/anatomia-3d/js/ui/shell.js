/**
 * js/ui/shell.js — casca interativa do Atlas v2 (Onda 1, WP08)
 * ---------------------------------------------------------------------------
 * Constrói a mini barra de ferramentas e o seletor de modo (as duas únicas
 * peças "vazias" que v2.html deixa para JS preencher), liga tema/tela cheia,
 * e expõe os pontos de montagem que o WP09 usa para os próprios painéis.
 *
 * Não conhece o motor 3D nem o conteúdo (ficha, camadas, busca) — só emite
 * os eventos do bus (contrato congelado em js/core/bus.js) e mantém
 * js/core/store.js em sincronia para o que é claramente estado de UI
 * (mode, sex, xray, clip, quality.tier, theme). Quem reage a cada evento
 * (o motor, os modos) é responsabilidade de outros pacotes.
 *
 * Ações "data-action" são resolvidas por LaiftDom.delegateActions a partir
 * de `window.AtlasShell.*` (allow-list em ALLOWED_ACTIONS) — nenhum handler
 * inline, como em todo o resto da plataforma (modulos/shared/safe-dom.js).
 */
import { on, emit, EVENTS } from '../core/bus.js';
import { get as storeGet, set as storeSet, subscribe } from '../core/store.js';
import { MODES, isValidModeId } from '../core/contracts.js';

// Glifos do wireframe da própria spec de UX (docs/ATLAS_UX_SPEC.md §18.1) —
// só decoração (aria-hidden); o rótulo acessível vem do texto/aria-label.
const TOOLBAR_BUTTONS = [
  { id: 'layers', glyph: '▤', label: 'Camadas', action: 'AtlasShell.toggleLayers' },
  { id: 'isolate', glyph: '◎', label: 'Isolar', action: 'AtlasShell.isolateSelected' },
  { id: 'xray', glyph: '☠', label: 'Raio-X', action: 'AtlasShell.toggleXray' },
  { id: 'clip', glyph: '✂', label: 'Corte', action: 'AtlasShell.openClipMenu' },
  { id: 'reset', glyph: '⟲', label: 'Reset', action: 'AtlasShell.reset' },
  { id: 'more', glyph: '⋯', label: 'Mais', action: 'AtlasShell.openMoreMenu' },
];

const CLIP_PLANES = [
  { label: 'Sagital', value: 'sagital' },
  { label: 'Coronal', value: 'coronal' },
  { label: 'Transversal', value: 'transversal' },
  { label: 'Nenhum', value: null },
];

const VIEW_PRESETS = [
  { label: 'Anterior', value: 'anterior' },
  { label: 'Posterior', value: 'posterior' },
  { label: 'Esquerda', value: 'esquerda' },
  { label: 'Direita', value: 'direita' },
  { label: 'Superior', value: 'superior' },
  { label: 'Inferior', value: 'inferior' },
];

const QUALITY_TIERS = [
  { label: 'Automática', value: 'auto' },
  { label: 'Baixa', value: 'baixa' },
  { label: 'Média', value: 'media' },
  { label: 'Alta', value: 'alta' },
];

const ALLOWED_ACTIONS = [
  'AtlasShell.navigateBack',
  'AtlasShell.toggleModeMenu',
  'AtlasShell.setMode',
  'AtlasShell.toggleLayers',
  'AtlasShell.isolateSelected',
  'AtlasShell.toggleXray',
  'AtlasShell.openClipMenu',
  'AtlasShell.setClipPlane',
  'AtlasShell.reset',
  'AtlasShell.openMoreMenu',
  'AtlasShell.toggleLabels',
  'AtlasShell.openViewPresetMenu',
  'AtlasShell.setViewPreset',
  'AtlasShell.toggleFullscreen',
  'AtlasShell.toggleSex',
  'AtlasShell.openQualityMenu',
  'AtlasShell.setQuality',
  'AtlasShell.openCredits',
  'AtlasShell.closeModal',
];

/** name → HTMLElement, registrados por WP09 via {@link registerPanel}. */
const panels = new Map();

let labelsEnabled = false;

function el(tag, attrs, children) {
  return window.LaiftDom.h(tag, attrs, children);
}

// ---------------------------------------------------------------------------
// Barra de ferramentas (Explorar — docs/ATLAS_UX_SPEC.md §5)
// ---------------------------------------------------------------------------
function buildToolbar() {
  const root = document.getElementById('atlas-toolbar');
  if (!root) return;
  TOOLBAR_BUTTONS.forEach((btn) => {
    root.appendChild(el('button', {
      type: 'button', id: `atlas-toolbar-${btn.id}`, dataset: { action: btn.action },
      'aria-label': btn.label, title: btn.label,
    }, [el('span', { 'aria-hidden': 'true' }, [btn.glyph])]));
  });
  syncIsolateDisabled(storeGet().selectedSid);
  subscribe((s) => s.selectedSid, syncIsolateDisabled);
  subscribe((s) => s.xray, (enabled) => {
    const b = document.getElementById('atlas-toolbar-xray');
    if (b) b.setAttribute('aria-pressed', String(!!enabled));
  });
}

function syncIsolateDisabled(sid) {
  const b = document.getElementById('atlas-toolbar-isolate');
  if (b) b.disabled = !sid;
}

// ---------------------------------------------------------------------------
// Seletor de modo (§4) — mesma lista de chips serve de gatilho (celular) e
// de linha visível (tablet/desktop); css/atlas.css decide a apresentação.
// ---------------------------------------------------------------------------
function buildModeSwitch() {
  const list = document.getElementById('atlas-mode-list');
  const trigger = document.getElementById('atlas-mode-trigger');
  const triggerLabel = document.getElementById('atlas-mode-trigger-label');
  if (!list || !trigger) return;
  MODES.forEach((mode) => {
    list.appendChild(el('button', {
      type: 'button', role: 'option', dataset: { action: 'AtlasShell.setMode', arg: mode.id },
      'aria-selected': String(mode.id === storeGet().mode),
    }, [mode.label]));
  });
  syncModeSwitch(storeGet().mode);
  subscribe((s) => s.mode, syncModeSwitch);

  document.addEventListener('click', (evt) => {
    const switchEl = document.getElementById('atlas-mode-switch');
    if (switchEl && switchEl.getAttribute('data-open') === 'true' && !switchEl.contains(evt.target)) {
      closeModeMenu();
    }
  });
  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') closeModeMenu();
  });

  function syncModeSwitch(modeId) {
    const def = MODES.find((m) => m.id === modeId) || MODES[0];
    if (triggerLabel) triggerLabel.textContent = def.label;
    Array.from(list.children).forEach((btn) => {
      btn.setAttribute('aria-selected', String(btn.dataset.arg === modeId));
    });
  }
}

function closeModeMenu() {
  const switchEl = document.getElementById('atlas-mode-switch');
  const trigger = document.getElementById('atlas-mode-trigger');
  if (switchEl) switchEl.setAttribute('data-open', 'false');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

// ---------------------------------------------------------------------------
// Trilha/voltar (§1.1) — WP09 (navigator.js) pode substituir o conteúdo do
// slot via getSlot('breadcrumb'); aqui só o comportamento mínimo do botão
// "voltar" (mostra/esconde com a seleção) e o rótulo padrão "Atlas".
// ---------------------------------------------------------------------------
function wireBreadcrumb() {
  const backBtn = document.getElementById('atlas-breadcrumb-back');
  if (!backBtn) return;
  const sync = (sid) => { backBtn.hidden = !sid; };
  sync(storeGet().selectedSid);
  subscribe((s) => s.selectedSid, sync);
}

/**
 * Reflete `store.selectedSid` em `data-has-selection` no inspetor (tablet
 * ≥756px/desktop — regra dos 45%, docs/ATLAS_UX_SPEC.md §1.6): com seleção,
 * o inspetor abre como coluna real; sem seleção, colapsa para a aba fina.
 * O CONTEÚDO da ficha (WP09) fica por conta de quem montar #atlas-inspector.
 */
function wireInspectorState() {
  const inspector = document.getElementById('atlas-inspector');
  if (!inspector) return;
  const sync = (sid) => inspector.setAttribute('data-has-selection', String(!!sid));
  sync(storeGet().selectedSid);
  subscribe((s) => s.selectedSid, sync);
}

// ---------------------------------------------------------------------------
// aria-live único do módulo (§16) — anuncia seleção/limpeza.
// ---------------------------------------------------------------------------
function wireLiveRegion() {
  const live = document.getElementById('atlas-live');
  if (!live) return;
  on(EVENTS.STRUCTURE_SELECT, ({ sid }) => {
    // TODO(WP13/WP09): trocar `sid` pelo nome de exibição via ContentStore
    // quando main.js injetar esse serviço — o shell não tem acesso a
    // conteúdo (só ao bus/estado), então por ora anuncia o identificador.
    live.textContent = sid ? `Selecionado: ${sid}` : 'Seleção removida.';
  });
}

// ---------------------------------------------------------------------------
// Tema (segue a plataforma — sem laift-always-dark, ver plano §"Decisões").
// ---------------------------------------------------------------------------
function wireTheme() {
  const announce = () => {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    storeSet({ theme });
    emit(EVENTS.THEME_CHANGE, { theme });
  };
  announce(); // laift-identity.js já aplicou data-theme antes deste script rodar
  window.addEventListener('laift:themechange', announce);
}

// ---------------------------------------------------------------------------
// Menus flutuantes genéricos (⋯, Corte, Vistas, Qualidade) — mesma receita.
// ---------------------------------------------------------------------------
let openDropdown = null;

function closeDropdown() {
  if (openDropdown && openDropdown.isConnected) openDropdown.remove();
  openDropdown = null;
  document.removeEventListener('click', onDropdownOutsideClick, true);
  document.removeEventListener('keydown', onDropdownEscape, true);
}

function onDropdownOutsideClick(evt) {
  if (openDropdown && !openDropdown.contains(evt.target)) closeDropdown();
}
function onDropdownEscape(evt) {
  if (evt.key === 'Escape') closeDropdown();
}

/** Abre um menu simples ancorado a `anchorEl` com `items` = [{label, onSelect, checked?}]. */
function openDropdownMenu(anchorEl, items) {
  closeDropdown();
  const menu = el('div', { className: 'atlas-dropdown', role: 'menu' },
    items.map((item) => el('button', {
      type: 'button', role: 'menuitemradio',
      'aria-checked': item.checked ? 'true' : 'false',
      onClick: () => { closeDropdown(); item.onSelect(); },
    }, [item.label])));
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const top = Math.min(rect.bottom + 6, window.innerHeight - menuRect.height - 8);
  const left = Math.min(rect.left, window.innerWidth - menuRect.width - 8);
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.max(8, left)}px`;
  openDropdown = menu;
  const first = menu.querySelector('button');
  if (first) first.focus();
  document.addEventListener('click', onDropdownOutsideClick, true);
  document.addEventListener('keydown', onDropdownEscape, true);
}

// ---------------------------------------------------------------------------
// Painéis registrados por outros pacotes (Camadas, Créditos, ...) — §9/§16.
// ---------------------------------------------------------------------------
function togglePanel(name) {
  const target = panels.get(name);
  const open = target ? target.hidden : null;
  if (target) target.hidden = !target.hidden;
  const btn = document.getElementById(`atlas-toolbar-${name}`);
  if (btn) btn.setAttribute('aria-pressed', String(target ? !target.hidden : false));
  // Nome de evento PROPOSTO (fora de EVENTS, congelado) — ver relatório
  // final do WP08: bus.js não reservou um evento para "painel X abriu/
  // fechou"; até o orquestrador decidir um nome oficial, WP09 pode ouvir
  // isto para saber quando montar/mostrar o próprio painel.
  emit(`${name}:toggle`, { open: target ? !target.hidden : open });
}

// ---------------------------------------------------------------------------
// Tela cheia (Fullscreen API, com fallback — §5.6).
// ---------------------------------------------------------------------------
function toggleFullscreen() {
  const isFs = document.fullscreenElement;
  if (isFs) {
    (document.exitFullscreen ? document.exitFullscreen() : Promise.resolve())
      .catch(() => {})
      .finally(() => document.body.classList.remove('atlas-fullscreen-fallback'));
    return;
  }
  const root = document.documentElement;
  if (root.requestFullscreen) {
    root.requestFullscreen().catch(() => document.body.classList.add('atlas-fullscreen-fallback'));
  } else {
    // Sem suporte à API (ex.: iframe sem allow="fullscreen"): aproxima o
    // efeito com uma classe — v2.html já ocupa 100% da viewport do módulo,
    // então o ganho real é o host (learning.js) que decide, mas ao menos
    // não deixamos o botão sem efeito nenhum.
    document.body.classList.toggle('atlas-fullscreen-fallback');
  }
}

// ---------------------------------------------------------------------------
// window.AtlasShell — alvo das data-action (delegateActions).
// ---------------------------------------------------------------------------
function installActions() {
  window.AtlasShell = {
    navigateBack() {
      // WP08 só controla o que já sabe: sem navegador/trilha própria ainda,
      // "voltar" limpa a seleção atual. WP09 (navigator.js) pode substituir
      // este handler por um que suba um nível na árvore quando existir.
      if (storeGet().selectedSid) emit(EVENTS.STRUCTURE_SELECT, { sid: null, source: 'api' });
    },

    toggleModeMenu() {
      const switchEl = document.getElementById('atlas-mode-switch');
      const trigger = document.getElementById('atlas-mode-trigger');
      const open = switchEl.getAttribute('data-open') !== 'true';
      switchEl.setAttribute('data-open', String(open));
      trigger.setAttribute('aria-expanded', String(open));
    },
    setMode(modeId) {
      if (!isValidModeId(modeId)) return;
      closeModeMenu();
      if (storeGet().mode === modeId) return;
      storeSet({ mode: modeId });
      emit(EVENTS.MODE_CHANGE, { mode: modeId });
    },

    toggleLayers() { togglePanel('layers'); },

    isolateSelected() {
      const sid = storeGet().selectedSid;
      if (sid) emit(EVENTS.VISIBILITY_ISOLATE, { sid });
    },

    toggleXray() {
      const enabled = !storeGet().xray;
      storeSet({ xray: enabled });
      emit(EVENTS.XRAY_SET, { enabled });
    },

    openClipMenu() {
      const anchor = document.getElementById('atlas-toolbar-clip');
      openDropdownMenu(anchor, CLIP_PLANES.map((p) => ({
        label: p.label,
        checked: storeGet().clip.plane === p.value,
        onSelect: () => window.AtlasShell.setClipPlane(p.value),
      })));
    },
    setClipPlane(plane) {
      storeSet({ clip: { plane, offset: plane ? 0 : null } });
      emit(EVENTS.CLIP_SET, { plane, offset: plane ? 0 : null });
    },

    reset() {
      storeSet({
        isolation: { active: 'none', sid: null },
        xray: false,
        clip: { plane: null, offset: null },
      });
      emit(EVENTS.VISIBILITY_RESET, {});
      emit(EVENTS.XRAY_SET, { enabled: false });
      emit(EVENTS.CLIP_SET, { plane: null, offset: null });
      emit(EVENTS.VIEW_RESET, {});
    },

    openMoreMenu() {
      const anchor = document.getElementById('atlas-toolbar-more');
      openDropdownMenu(anchor, [
        { label: labelsEnabled ? 'Rótulos: ligados' : 'Rótulos: desligados', checked: labelsEnabled, onSelect: () => window.AtlasShell.toggleLabels() },
        { label: 'Vistas…', onSelect: () => window.AtlasShell.openViewPresetMenu(anchor) },
        { label: 'Tela cheia', onSelect: () => window.AtlasShell.toggleFullscreen() },
        { label: `Trocar sexo (atual: ${storeGet().sex})`, onSelect: () => window.AtlasShell.toggleSex() },
        { label: 'Qualidade gráfica…', onSelect: () => window.AtlasShell.openQualityMenu(anchor) },
        { label: 'Créditos', onSelect: () => window.AtlasShell.openCredits() },
      ]);
    },

    toggleLabels() {
      labelsEnabled = !labelsEnabled;
      emit(EVENTS.LABELS_SET, { enabled: labelsEnabled });
    },

    openViewPresetMenu(anchor) {
      openDropdownMenu(anchor || document.getElementById('atlas-toolbar-more'), VIEW_PRESETS.map((v) => ({
        label: v.label, onSelect: () => window.AtlasShell.setViewPreset(v.value),
      })));
    },
    setViewPreset(name) { emit(EVENTS.VIEW_PRESET, { name }); },

    toggleFullscreen,

    toggleSex() {
      const next = storeGet().sex === 'M' ? 'F' : 'M';
      // Sem evento próprio no bus (contracts.js/store.js documentam `sex`
      // como estado puro) — quem precisar reagir assina o store, não o bus.
      storeSet({ sex: next });
    },

    openQualityMenu(anchor) {
      openDropdownMenu(anchor || document.getElementById('atlas-toolbar-more'), QUALITY_TIERS.map((q) => ({
        label: q.label, checked: storeGet().quality.tier === q.value, onSelect: () => window.AtlasShell.setQuality(q.value),
      })));
    },
    setQuality(tier) {
      storeSet({ quality: { ...storeGet().quality, tier } });
      emit(EVENTS.QUALITY_CHANGE, { tier });
    },

    openCredits() {
      togglePanel('credits');
      const modal = document.getElementById('atlas-modal');
      if (modal && typeof modal.showModal === 'function' && !modal.open) modal.showModal();
    },
    closeModal() {
      const modal = document.getElementById('atlas-modal');
      if (modal && modal.open) modal.close();
    },
  };
}

// ---------------------------------------------------------------------------
// API pública para outros pacotes (WP09).
// ---------------------------------------------------------------------------
const SLOTS = {
  breadcrumb: 'atlas-breadcrumb',
  search: 'atlas-search-slot',
  modeSwitch: 'atlas-mode-switch',
  toolbar: 'atlas-toolbar',
  leftPanel: 'atlas-left-panel',
  inspector: 'atlas-inspector',
  sheetPeek: 'atlas-sheet-peek',
  sheetBody: 'atlas-sheet-body',
  contextMenu: 'atlas-context-menu',
  toast: 'atlas-toast',
  live: 'atlas-live',
  modal: 'atlas-modal',
  modalBody: 'atlas-modal-body',
};

/** @param {string} name uma chave de SLOTS. @returns {(Element|null)} */
export function getSlot(name) {
  const id = SLOTS[name];
  return id ? document.getElementById(id) : null;
}

/**
 * Registra um painel flutuante (ex.: Camadas, Créditos) construído por
 * outro pacote. `name` é o mesmo usado pelo botão da toolbar que deve
 * abri-lo (ex.: 'layers' ↔ #atlas-toolbar-layers) — ver docs/ATLAS_UX_SPEC.md
 * §9. Painéis de nome 'credits' entram dentro de #atlas-modal-body (modal
 * de verdade); os demais são ancorados livres em document.body (WP09 quem
 * decide posição/CSS via css/components.css).
 * @param {string} name
 * @param {Element} element
 */
export function registerPanel(name, element) {
  panels.set(name, element);
  element.hidden = true;
  if (!element.isConnected) {
    const host = name === 'credits' ? document.getElementById('atlas-modal-body') : document.body;
    (host || document.body).appendChild(element);
  }
}

/** Liga toda a casca interativa sobre a estrutura estática de v2.html. */
export function initShell() {
  installActions();
  window.LaiftDom.delegateActions(document, ALLOWED_ACTIONS);
  buildToolbar();
  buildModeSwitch();
  wireBreadcrumb();
  wireInspectorState();
  wireLiveRegion();
  wireTheme();
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('atlas-fullscreen-fallback', false);
  });
}
