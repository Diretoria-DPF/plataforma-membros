/**
 * js/ui/focus-nav.js — zonas de foco por teclado/TV (Onda 1, WP08)
 * ---------------------------------------------------------------------------
 * Implementa docs/ATLAS_UX_SPEC.md §12: cinco zonas navegáveis por seta —
 * barra superior → rail do navegador → canvas → mini barra de ferramentas →
 * inspetor/painel. Dentro de uma zona, as setas movem entre os itens
 * daquela zona; no fim/começo da lista, a seta continua para a zona
 * seguinte/anterior. `Escape` sai da zona atual para a anterior.
 *
 * Só ativa quando `(hover: none) and (min-width: 1600px)` (TV — sempre) OU
 * depois que QUALQUER tecla de navegação foi usada (Tab/setas/Enter), em
 * qualquer tamanho de tela — assim um desktop normal usado só com o mouse
 * nunca tem as setas "roubadas" do resto da página, mas quem começa a
 * navegar por teclado ganha o mesmo comportamento de zonas.
 *
 * A zona do CANVAS é tratada como um único alvo focável (a mira central da
 * TV, §12.3): as setas nela só avançam para a zona seguinte/anterior (não
 * há "itens" para navegar dentro do canvas). Quando o motor (WP04/WP06)
 * ligar a rotação de câmera por seta com o canvas focado, esse pacote é
 * quem decide dar `stopPropagation`/`preventDefault` no `keydown` antes de
 * chegar aqui (ex.: só quando o usuário está "engajado" com a mira) — este
 * arquivo não assume isso sozinho, senão a zona do canvas vira um beco sem
 * saída por teclado.
 */

const ZONE_IDS = ['atlas-topbar', 'atlas-left-panel', 'atlas-canvas', 'atlas-toolbar', 'atlas-inspector', 'atlas-sheet'];
const ZONE_SELECTOR = ZONE_IDS.map((id) => `#${id}`).join(', ');

let keyboardUsed = false;

function isTvMedia() {
  return window.matchMedia('(hover: none) and (min-width: 1600px)').matches;
}

function isActive() {
  return isTvMedia() || keyboardUsed;
}

function isVisible(el) {
  if (!el || el.hidden) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // Uma zona colapsada a 0px (ex.: o inspetor sem seleção no desktop, ver
  // css/atlas.css) existe no DOM mas não tem nada para focar de verdade.
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function visibleZones() {
  return ZONE_IDS.map((id) => document.getElementById(id)).filter((el) => isVisible(el));
}

/** Itens focáveis de uma zona. O canvas é sempre "um item só" (ver cabeçalho). */
function focusableItems(zoneEl) {
  if (zoneEl.id === 'atlas-canvas') return [zoneEl];
  const nodes = zoneEl.querySelectorAll('button, a[href], input, select, textarea, [tabindex]');
  return Array.from(nodes).filter((n) => !n.disabled && n.tabIndex !== -1 && isVisible(n));
}

function currentZoneEl() {
  const active = document.activeElement;
  return active ? active.closest(ZONE_SELECTOR) : null;
}

function focusZone(zones, zoneIndex, itemIndex) {
  if (!zones.length) return;
  const idx = ((zoneIndex % zones.length) + zones.length) % zones.length;
  const zone = zones[idx];
  const items = focusableItems(zone);
  if (!items.length) {
    if (typeof zone.focus === 'function') zone.focus();
    return;
  }
  const iIdx = ((itemIndex % items.length) + items.length) % items.length;
  items[iIdx].focus();
}

function handleArrow(evt, forward) {
  const zones = visibleZones();
  const zone = currentZoneEl();
  const zoneIndex = zone ? zones.indexOf(zone) : -1;
  if (zoneIndex === -1) return; // foco fora de qualquer zona conhecida — não interfere

  evt.preventDefault();
  const items = focusableItems(zone);
  const currentItemIndex = items.indexOf(document.activeElement);

  if (forward) {
    if (currentItemIndex !== -1 && currentItemIndex < items.length - 1) {
      focusZone(zones, zoneIndex, currentItemIndex + 1);
    } else {
      focusZone(zones, zoneIndex + 1, 0);
    }
  } else if (currentItemIndex > 0) {
    focusZone(zones, zoneIndex, currentItemIndex - 1);
  } else {
    focusZone(zones, zoneIndex - 1, -1); // -1 → último item da zona anterior (módulo em focusZone)
  }
}

function onKeydown(evt) {
  if (evt.key === 'Tab' || evt.key === 'Enter' || evt.key.startsWith('Arrow')) keyboardUsed = true;
  if (!isActive()) return;

  switch (evt.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      handleArrow(evt, true);
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      handleArrow(evt, false);
      break;
    case 'Escape': {
      // "Voltar" (§12): sai da zona atual para a anterior. Não interfere se
      // o foco já está na primeira zona (topbar) — nada "antes" dela.
      const zones = visibleZones();
      const zone = currentZoneEl();
      const zoneIndex = zone ? zones.indexOf(zone) : -1;
      if (zoneIndex > 0) focusZone(zones, zoneIndex - 1, 0);
      break;
    }
    default:
      break;
  }
}

/** Liga a navegação por zonas sobre a casca de v2.html. */
export function initFocusNav() {
  document.addEventListener('keydown', onKeydown);
  // Garante que cada zona é alcançável por Tab mesmo sem itens focáveis
  // próprios ainda montados (ex.: painéis do WP09 antes de existirem).
  ZONE_IDS.forEach((id) => {
    const zone = document.getElementById(id);
    if (zone && !zone.hasAttribute('tabindex')) zone.tabIndex = -1;
  });
}

/** Exposto para depuração/teste — não usado pela navegação normal. */
export function isFocusNavActive() {
  return isActive();
}
