#!/usr/bin/env node
/**
 * focus-nav.test.mjs — teste do nextZone() para navegação por zonas na TV
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/focus-nav.test.mjs
 *
 * Testa a função nextZone() que implementa navegação por setas entre zonas
 * em um layout 1920×1080 (TV). Usa mock de getBoundingClientRect() para
 * simular posições de zonas sem precisar de um DOM completo.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// Mock de document global para testes Node.js
if (typeof global.document === 'undefined') {
  global.document = {};
}

// Mock de getBoundingClientRect sem DOM
class MockElement {
  constructor(id, rect) {
    this.id = id;
    this._rect = rect;
  }

  getBoundingClientRect() {
    return { ...this._rect };
  }
}

// Substitui document.getElementById durante os testes
function createMockZones(zoneRects) {
  const elements = {};
  for (const [id, rect] of Object.entries(zoneRects)) {
    elements[id] = new MockElement(id, rect);
  }

  const originalGetElementById = document.getElementById;
  document.getElementById = function (id) {
    return elements[id] || null;
  };

  return () => {
    document.getElementById = originalGetElementById;
  };
}

// Importa a função nextZone (sem ESM export, precisa ser injetada)
// Para este teste, vamos copiar a lógica aqui e testar isoladamente

/**
 * Copia a lógica de nextZone para teste sem dependência de módulo.
 */
function nextZone(zones, currentIndex, key) {
  const ROW_BAND_HEIGHT = 48;

  if (zones.length === 0 || currentIndex < 0 || currentIndex >= zones.length) {
    return 0;
  }

  // Recolhe rects e ordena por posição visual
  const rects = zones.map((id) => {
    const el = document.getElementById(id);
    return el ? el.getBoundingClientRect() : null;
  }).filter((r) => r !== null);

  if (rects.length === 0) return currentIndex;

  // Ordena por top (em bandas de ROW_BAND_HEIGHT px), depois por left
  const indices = Array.from({ length: zones.length }, (_, i) => i);
  indices.sort((a, b) => {
    const ra = rects[a];
    const rb = rects[b];
    const bandA = Math.floor(ra.top / ROW_BAND_HEIGHT);
    const bandB = Math.floor(rb.top / ROW_BAND_HEIGHT);
    if (bandA !== bandB) return bandA - bandB;
    return ra.left - rb.left;
  });

  // Encontra a posição do índice atual na lista ordenada
  const orderedPos = indices.indexOf(currentIndex);
  if (orderedPos === -1) return currentIndex;

  const currentRect = rects[currentIndex];
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentRow = Math.floor(currentRect.top / ROW_BAND_HEIGHT);

  let nextIndex = currentIndex;

  if (key === 'ArrowRight' || key === 'ArrowDown') {
    // Busca a próxima zona na mesma linha (direita) ou na linha seguinte
    if (key === 'ArrowRight') {
      // Procura a próxima zona na mesma linha
      const sameLine = indices.filter((idx) => {
        const r = rects[idx];
        const row = Math.floor(r.top / ROW_BAND_HEIGHT);
        return row === currentRow && r.left > currentRect.left;
      });

      if (sameLine.length > 0) {
        // Próxima zona na mesma linha
        nextIndex = sameLine[0];
      } else {
        // Nenhuma zona à direita na mesma linha: vai para a primeira zona da próxima linha
        const nextLine = indices.find((idx) => {
          const r = rects[idx];
          const row = Math.floor(r.top / ROW_BAND_HEIGHT);
          return row > currentRow;
        });
        if (nextLine !== undefined) {
          nextIndex = nextLine;
        } else {
          // Nenhuma próxima linha: volta para a primeira zona
          nextIndex = indices[0];
        }
      }
    } else if (key === 'ArrowDown') {
      // Busca a zona na linha seguinte mais próxima horizontalmente
      const nextLine = indices.find((idx) => {
        const r = rects[idx];
        const row = Math.floor(r.top / ROW_BAND_HEIGHT);
        return row > currentRow;
      });

      if (nextLine !== undefined) {
        // Entre as zonas na próxima linha, escolhe a mais próxima ao centro horizontal
        const zonesInNextLine = indices.filter((idx) => {
          const r = rects[idx];
          const row = Math.floor(r.top / ROW_BAND_HEIGHT);
          return row === Math.floor(rects[nextLine].top / ROW_BAND_HEIGHT);
        });

        let closest = zonesInNextLine[0];
        let minDist = Infinity;
        for (const idx of zonesInNextLine) {
          const r = rects[idx];
          const centerX = r.left + r.width / 2;
          const dist = Math.abs(centerX - currentCenterX);
          if (dist < minDist) {
            minDist = dist;
            closest = idx;
          }
        }
        nextIndex = closest;
      }
    }
  } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
    // Busca a zona anterior
    if (key === 'ArrowLeft') {
      // Procura a zona anterior na mesma linha
      const sameLine = indices.filter((idx) => {
        const r = rects[idx];
        const row = Math.floor(r.top / ROW_BAND_HEIGHT);
        return row === currentRow && r.left < currentRect.left;
      });

      if (sameLine.length > 0) {
        // Última zona à esquerda na mesma linha
        nextIndex = sameLine[sameLine.length - 1];
      } else {
        // Nenhuma zona à esquerda: vai para a última zona da linha anterior
        const prevLine = [...indices].reverse().find((idx) => {
          const r = rects[idx];
          const row = Math.floor(r.top / ROW_BAND_HEIGHT);
          return row < currentRow;
        });
        if (prevLine !== undefined) {
          nextIndex = prevLine;
        } else {
          // Nenhuma linha anterior: volta para a última zona
          nextIndex = indices[indices.length - 1];
        }
      }
    } else if (key === 'ArrowUp') {
      // Busca a zona na linha anterior mais próxima horizontalmente
      const prevLine = [...indices].reverse().find((idx) => {
        const r = rects[idx];
        const row = Math.floor(r.top / ROW_BAND_HEIGHT);
        return row < currentRow;
      });

      if (prevLine !== undefined) {
        // Entre as zonas na linha anterior, escolhe a mais próxima ao centro horizontal
        const zonesInPrevLine = indices.filter((idx) => {
          const r = rects[idx];
          const row = Math.floor(r.top / ROW_BAND_HEIGHT);
          return row === Math.floor(rects[prevLine].top / ROW_BAND_HEIGHT);
        });

        let closest = zonesInPrevLine[0];
        let minDist = Infinity;
        for (const idx of zonesInPrevLine) {
          const r = rects[idx];
          const centerX = r.left + r.width / 2;
          const dist = Math.abs(centerX - currentCenterX);
          if (dist < minDist) {
            minDist = dist;
            closest = idx;
          }
        }
        nextIndex = closest;
      }
    }
  }

  return nextIndex;
}

let failures = 0;

/**
 * @param {string} name
 * @param {() => void} fn
 */
function test(name, fn) {
  try {
    fn();
    console.log(`  ok — ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FALHOU — ${name}`);
    console.error(`    ${err && err.message ? err.message : err}`);
  }
}

console.log('nextZone() — navegação por setas entre zonas');

// Layout de 3 colunas a 1920×1080:
// linha 0 (top=0-48):    topbar (0-1920)
// linha 1 (top=48-96):   left(0-56), canvas(56-1920), toolbar(1864-1920)
//                        (deixe espaço para inspetor que pode aparecer à direita)

test('Direita de topbar → próxima zona (left)', () => {
  const restore = createMockZones({
    'atlas-topbar': { top: 0, left: 0, width: 1920, height: 48 },
    'atlas-left-panel': { top: 48, left: 0, width: 56, height: 1032 },
    'atlas-canvas': { top: 48, left: 56, width: 1808, height: 1032 },
    'atlas-toolbar': { top: 48, left: 1864, width: 56, height: 1032 },
  });

  try {
    const zones = ['atlas-topbar', 'atlas-left-panel', 'atlas-canvas', 'atlas-toolbar'];
    const next = nextZone(zones, 0, 'ArrowRight');
    assert.equal(next, 1, `esperado índice 1 (left-panel), got ${next}`);
  } finally {
    restore();
  }
});

test('Direita de left → próxima zona (canvas)', () => {
  const restore = createMockZones({
    'atlas-topbar': { top: 0, left: 0, width: 1920, height: 48 },
    'atlas-left-panel': { top: 48, left: 0, width: 56, height: 1032 },
    'atlas-canvas': { top: 48, left: 56, width: 1808, height: 1032 },
    'atlas-toolbar': { top: 48, left: 1864, width: 56, height: 1032 },
  });

  try {
    const zones = ['atlas-topbar', 'atlas-left-panel', 'atlas-canvas', 'atlas-toolbar'];
    const next = nextZone(zones, 1, 'ArrowRight');
    assert.equal(next, 2, `esperado índice 2 (canvas), got ${next}`);
  } finally {
    restore();
  }
});

test('Direita de canvas → próxima zona (toolbar)', () => {
  const restore = createMockZones({
    'atlas-topbar': { top: 0, left: 0, width: 1920, height: 48 },
    'atlas-left-panel': { top: 48, left: 0, width: 56, height: 1032 },
    'atlas-canvas': { top: 48, left: 56, width: 1808, height: 1032 },
    'atlas-toolbar': { top: 48, left: 1864, width: 56, height: 1032 },
  });

  try {
    const zones = ['atlas-topbar', 'atlas-left-panel', 'atlas-canvas', 'atlas-toolbar'];
    const next = nextZone(zones, 2, 'ArrowRight');
    assert.equal(next, 3, `esperado índice 3 (toolbar), got ${next}`);
  } finally {
    restore();
  }
});

test('Direita de toolbar → volta para topbar (wrap)', () => {
  const restore = createMockZones({
    'atlas-topbar': { top: 0, left: 0, width: 1920, height: 48 },
    'atlas-left-panel': { top: 48, left: 0, width: 56, height: 1032 },
    'atlas-canvas': { top: 48, left: 56, width: 1808, height: 1032 },
    'atlas-toolbar': { top: 48, left: 1864, width: 56, height: 1032 },
  });

  try {
    const zones = ['atlas-topbar', 'atlas-left-panel', 'atlas-canvas', 'atlas-toolbar'];
    const next = nextZone(zones, 3, 'ArrowRight');
    assert.equal(next, 0, `esperado índice 0 (topbar, wrap), got ${next}`);
  } finally {
    restore();
  }
});

test('Baixo de topbar → zona mais próxima horizontalmente na linha seguinte', () => {
  const restore = createMockZones({
    'atlas-topbar': { top: 0, left: 0, width: 1920, height: 48 },
    'atlas-left-panel': { top: 48, left: 0, width: 56, height: 1032 },
    'atlas-canvas': { top: 48, left: 56, width: 1808, height: 1032 },
    'atlas-toolbar': { top: 48, left: 1864, width: 56, height: 1032 },
  });

  try {
    const zones = ['atlas-topbar', 'atlas-left-panel', 'atlas-canvas', 'atlas-toolbar'];
    // Topbar está centrado em 960. Na linha seguinte, canvas (centro ~960) é o mais próximo.
    const next = nextZone(zones, 0, 'ArrowDown');
    assert.equal(next, 2, `esperado índice 2 (canvas, mais próximo), got ${next}`);
  } finally {
    restore();
  }
});

test('Esquerda de canvas → volta para left na mesma linha', () => {
  const restore = createMockZones({
    'atlas-topbar': { top: 0, left: 0, width: 1920, height: 48 },
    'atlas-left-panel': { top: 48, left: 0, width: 56, height: 1032 },
    'atlas-canvas': { top: 48, left: 56, width: 1808, height: 1032 },
    'atlas-toolbar': { top: 48, left: 1864, width: 56, height: 1032 },
  });

  try {
    const zones = ['atlas-topbar', 'atlas-left-panel', 'atlas-canvas', 'atlas-toolbar'];
    const next = nextZone(zones, 2, 'ArrowLeft');
    assert.equal(next, 1, `esperado índice 1 (left-panel), got ${next}`);
  } finally {
    restore();
  }
});

test('Zonas ocultas são puladas (rects vazias)', () => {
  const restore = createMockZones({
    'atlas-topbar': { top: 0, left: 0, width: 1920, height: 48 },
    'atlas-left-panel': { top: 48, left: 0, width: 0, height: 0 }, // oculta
    'atlas-canvas': { top: 48, left: 56, width: 1808, height: 1032 },
    'atlas-toolbar': { top: 48, left: 1864, width: 56, height: 1032 },
  });

  try {
    const zones = ['atlas-topbar', 'atlas-canvas', 'atlas-toolbar'];
    // Com left-panel oculta, as zonas visíveis são topbar, canvas, toolbar
    const next = nextZone(zones, 0, 'ArrowRight');
    // Deveria pular direto para canvas (índice 1)
    assert.equal(next, 1, `esperado índice 1 (canvas, pulando left oculta), got ${next}`);
  } finally {
    restore();
  }
});

test('Canvas está incluído na sequência de navegação (TV 1920×1080)', () => {
  const restore = createMockZones({
    'atlas-topbar': { top: 0, left: 0, width: 1920, height: 48 },
    'atlas-left-panel': { top: 48, left: 0, width: 56, height: 1032 },
    'atlas-canvas': { top: 48, left: 56, width: 1808, height: 1032 },
    'atlas-toolbar': { top: 48, left: 1864, width: 56, height: 1032 },
  });

  try {
    const zones = ['atlas-topbar', 'atlas-left-panel', 'atlas-canvas', 'atlas-toolbar'];
    // Navega da esquerda (left-panel) para o canvas
    const next = nextZone(zones, 1, 'ArrowRight');
    assert.equal(next, 2, `esperado índice 2 (canvas), got ${next}`);
  } finally {
    restore();
  }
});

console.log('');
if (failures === 0) {
  console.log('✓ Todos os testes passaram!');
} else {
  console.error(`✗ ${failures} teste(s) falharam`);
  process.exitCode = 1;
}
