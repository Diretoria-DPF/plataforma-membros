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
const ROW_BAND_HEIGHT = 48; // px

let keyboardUsed = false;

function isTvMedia() {
  return window.matchMedia('(hover: none) and (min-width: 1600px)').matches;
}

function isActive() {
  return isTvMedia() || keyboardUsed;
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // Uma zona colapsada a 0px (ex.: o inspetor sem seleção no desktop, ver
  // css/atlas.css) existe no DOM mas não tem nada para focar de verdade.
  // Nota: não checamos o atributo HTML 'hidden' porque CSS pode sobrescrevê-lo
  // (ex.: left-panel tem hidden no HTML mas CSS aplica display:block em viewport ≥1024px).
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

// Compara pelo centro horizontal, não pela borda esquerda: o painel esquerdo
// expandido (280px) sobrepõe o canvas, cuja borda esquerda fica à esquerda
// da do painel — pela borda, o canvas "sumia" da navegação para a direita.
function centerX(rect) {
  return rect.left + rect.width / 2;
}

/**
 * Calcula a próxima zona a receber foco, baseado em navegação por setas.
 * Ordena as zonas por posição visual: primeiro por linha (row band de 48px),
 * depois por coluna esquerda. Pulsa zonas ocultas (width ou height === 0).
 *
 * @param {Array<string>} zones - array de IDs de zonas visíveis
 * @param {number} currentIndex - índice da zona atual em `zones`
 * @param {string} key - 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
 * @returns {number} índice da próxima zona em `zones`
 */
export function nextZone(zones, currentIndex, key) {
  if (zones.length === 0 || currentIndex < 0 || currentIndex >= zones.length) {
    return 0;
  }

  // Coleta índices das zonas visíveis e seus rects
  const visibleEntries = []; // array de { index, rect }
  for (let i = 0; i < zones.length; i++) {
    const id = zones[i];
    const el = document.getElementById(id);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) {
        visibleEntries.push({ index: i, rect });
      }
    }
  }

  if (visibleEntries.length === 0) return currentIndex;

  // Ordena zonas visíveis por posição: linha (top/48), depois coluna (left)
  visibleEntries.sort((a, b) => {
    const bandA = Math.floor(a.rect.top / ROW_BAND_HEIGHT);
    const bandB = Math.floor(b.rect.top / ROW_BAND_HEIGHT);
    if (bandA !== bandB) return bandA - bandB;
    return centerX(a.rect) - centerX(b.rect);
  });

  // Encontra a zona atual na lista ordenada
  const currentPos = visibleEntries.findIndex((e) => e.index === currentIndex);
  if (currentPos === -1) return currentIndex; // Zona atual não está visível

  const current = visibleEntries[currentPos];
  const currentCenterX = centerX(current.rect);
  const currentRow = Math.floor(current.rect.top / ROW_BAND_HEIGHT);

  let nextIndex = currentIndex;

  if (key === 'ArrowRight') {
    // Procura próxima zona na mesma linha (à direita)
    const sameLine = visibleEntries.filter((e) => {
      const row = Math.floor(e.rect.top / ROW_BAND_HEIGHT);
      return row === currentRow && centerX(e.rect) > currentCenterX;
    });

    if (sameLine.length > 0) {
      nextIndex = sameLine[0].index;
    } else {
      // Nenhuma à direita: vai para primeira da próxima linha
      const nextLine = visibleEntries.find((e) => {
        const row = Math.floor(e.rect.top / ROW_BAND_HEIGHT);
        return row > currentRow;
      });
      if (nextLine) {
        nextIndex = nextLine.index;
      } else {
        // Nenhuma próxima linha: volta para primeira
        nextIndex = visibleEntries[0].index;
      }
    }
  } else if (key === 'ArrowLeft') {
    // Procura zona anterior na mesma linha (à esquerda)
    const sameLine = visibleEntries.filter((e) => {
      const row = Math.floor(e.rect.top / ROW_BAND_HEIGHT);
      return row === currentRow && centerX(e.rect) < currentCenterX;
    });

    if (sameLine.length > 0) {
      nextIndex = sameLine[sameLine.length - 1].index;
    } else {
      // Nenhuma à esquerda: vai para última da linha anterior
      const prevLine = [...visibleEntries].reverse().find((e) => {
        const row = Math.floor(e.rect.top / ROW_BAND_HEIGHT);
        return row < currentRow;
      });
      if (prevLine) {
        nextIndex = prevLine.index;
      } else {
        // Nenhuma linha anterior: volta para última
        nextIndex = visibleEntries[visibleEntries.length - 1].index;
      }
    }
  } else if (key === 'ArrowDown') {
    // Busca zona na linha seguinte mais próxima horizontalmente
    const nextRowZones = visibleEntries.filter((e) => {
      const row = Math.floor(e.rect.top / ROW_BAND_HEIGHT);
      return row > currentRow;
    });

    if (nextRowZones.length > 0) {
      // Encontra a zona mais próxima ao centro horizontal atual
      let closest = nextRowZones[0];
      let minDist = Infinity;
      for (const e of nextRowZones) {
        const dist = Math.abs(centerX(e.rect) - currentCenterX);
        if (dist < minDist) {
          minDist = dist;
          closest = e;
        }
      }
      nextIndex = closest.index;
    }
  } else if (key === 'ArrowUp') {
    // Busca zona na linha anterior mais próxima horizontalmente
    const prevRowZones = visibleEntries.filter((e) => {
      const row = Math.floor(e.rect.top / ROW_BAND_HEIGHT);
      return row < currentRow;
    });

    if (prevRowZones.length > 0) {
      // Encontra a zona mais próxima ao centro horizontal atual
      let closest = prevRowZones[prevRowZones.length - 1];
      let minDist = Infinity;
      for (const e of prevRowZones) {
        const dist = Math.abs(centerX(e.rect) - currentCenterX);
        if (dist < minDist) {
          minDist = dist;
          closest = e;
        }
      }
      nextIndex = closest.index;
    }
  }

  return nextIndex;
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
  const item = items[iIdx];
  item.focus();

  // Mostra a mira central quando a zona do canvas recebe foco em TV
  if (zone.id === 'atlas-canvas' && isTvMedia()) {
    showCanvasCrosshair();
  }
}

function handleArrow(evt) {
  const zones = visibleZones();
  const zone = currentZoneEl();
  const zoneIndex = zones.indexOf(zone);
  if (zoneIndex === -1) return; // foco fora de qualquer zona conhecida — não interfere

  evt.preventDefault();
  const items = focusableItems(zone);
  const currentItemIndex = items.indexOf(document.activeElement);

  const key = evt.key;
  const isHorizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const isForward = key === 'ArrowRight' || key === 'ArrowDown';

  // Se há múltiplos itens na zona e o foco não está na borda, navega dentro da zona
  if (items.length > 1 && currentItemIndex !== -1) {
    if (isHorizontal) {
      // Navegação horizontal dentro da zona
      if (isForward && currentItemIndex < items.length - 1) {
        focusZone(zones, zoneIndex, currentItemIndex + 1);
        return;
      } else if (!isForward && currentItemIndex > 0) {
        focusZone(zones, zoneIndex, currentItemIndex - 1);
        return;
      }
    }
  }

  // Se chegou aqui, é uma navegação entre zonas
  const nextZoneIndex = nextZone(
    zones.map((z) => z.id),
    zoneIndex,
    key
  );

  focusZone(zones, nextZoneIndex, 0);
}

/**
 * Cria ou obtém a mira central do canvas e a torna visível.
 * A mira é um elemento pequeno, posicionado absolutamente no centro do canvas,
 * sem eventos de mouse (pointer-events: none), visível apenas em TV.
 */
function showCanvasCrosshair() {
  let crosshair = document.getElementById('atlas-crosshair');

  if (!crosshair) {
    // Cria o elemento da mira se não existir
    crosshair = document.createElement('div');
    crosshair.id = 'atlas-crosshair';
    crosshair.className = 'atlas-crosshair';
    crosshair.setAttribute('aria-hidden', 'true');
    const canvas = document.getElementById('atlas-canvas');
    if (canvas) {
      canvas.appendChild(crosshair);
    }
  }

  // Garante que a mira está visível
  if (crosshair) {
    crosshair.style.visibility = 'visible';
    crosshair.style.opacity = '1';
  }
}

function onKeydown(evt) {
  if (evt.key === 'Tab' || evt.key === 'Enter' || evt.key.startsWith('Arrow')) keyboardUsed = true;
  if (!isActive()) return;

  switch (evt.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowUp':
      handleArrow(evt);
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
    if (!zone) return;

    // Canvas é uma zona focável especial: recebe setas, não itens
    if (id === 'atlas-canvas') {
      zone.tabIndex = 0;
      if (!zone.getAttribute('aria-label')) {
        zone.setAttribute('aria-label', 'Visualização 3D — use as setas para girar');
      }
    } else if (!zone.hasAttribute('tabindex')) {
      zone.tabIndex = -1;
    }
  });
}

/** Exposto para depuração/teste — não usado pela navegação normal. */
export function isFocusNavActive() {
  return isActive();
}
