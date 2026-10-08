/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Contraste WCAG do balão vermelho de aviso da Lia (cena 5) nos dois temas, com os tokens reais de laift-tokens.css
// e as regras de lia.css: o "!" sobre o balão (texto, 4,5:1) e o balão sobre o fundo com o véu de 35% (objeto gráfico, 3:1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8').replace(/\r\n/g, '\n');
const TOKENS = read('modulos/shared/laift-tokens.css');
const LIA_CSS = read('modulos/shared/lia/lia.css');

const MIN_TEXT = 4.5;
const MIN_GRAPHIC = 3;
const VEIL = 0.35; // opacidade final do véu (lia-scenes.js, cena 5)

function lightTokens(css) {
  const map = {};
  for (const block of css.matchAll(/^:root\s*\{([\s\S]*?)\n\}/gm)) {
    for (const d of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map[d[1]] = d[2].trim();
  }
  return map;
}

function darkOverrides(css) {
  const block = /html\[data-theme="dark"\],\s*html\.laift-always-dark\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(block, 'bloco do tema escuro não encontrado');
  const map = {};
  for (const d of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map[d[1]] = d[2].trim();
  return map;
}

const LIGHT = lightTokens(TOKENS);
const DARK = { ...LIGHT, ...darkOverrides(TOKENS) };

function resolve(theme, name, depth = 0) {
  assert.ok(depth < 10, `ciclo em ${name}`);
  const value = theme[name];
  assert.ok(value !== undefined, `token ausente: ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  return ref ? resolve(theme, ref[1], depth + 1) : value;
}

const rgb = (hex) => {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `cor não é #rrggbb: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
};
const channel = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => { const [r, g, b] = rgb(hex); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
const ratio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg, bg, alpha) => '#' + rgb(fg).map((c, i) => Math.round(c * alpha + rgb(bg)[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');

const LAYERS = ['--layer-0', '--layer-1', '--layer-2', '--layer-3'];

// Cores que lia.css dá ao .lia: --lia-shadow (véu) e --lia-line (contorno), claro e escuro.
function liaVar(selectorPattern, name) {
  const block = selectorPattern.exec(LIA_CSS);
  assert.ok(block, `bloco ${selectorPattern} não encontrado em lia.css`);
  const found = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block[1]);
  assert.ok(found, `${name} ausente em ${selectorPattern}`);
  return found[1];
}
const LIA_LIGHT = /^\.lia \{([\s\S]*?)\n\}/m;
const LIA_DARK = /^\[data-theme="dark"\] \.lia, \.laift-always-dark \.lia \{([\s\S]*?)\n\}/m;

test('lia.css liga o balão e o "!" aos tokens de perigo (que já mudam no tema escuro)', () => {
  assert.match(LIA_CSS, /\.lia-svg \.al \{ fill: var\(--lia-alert, var\(--laift-danger, #b3261e\)\); \}/);
  assert.match(LIA_CSS, /\.lia-svg \.gi \{ fill: var\(--lia-alert-ink, var\(--laift-on-danger, #ffffff\)\);/);
  assert.equal(resolve(LIGHT, '--laift-danger'), '#b3261e');
  assert.notEqual(resolve(DARK, '--laift-danger'), resolve(LIGHT, '--laift-danger'), 'o escuro troca o vermelho');
});

for (const [name, theme] of [['claro', LIGHT], ['escuro', DARK]]) {
  test(`balão de aviso, tema ${name}: o "!" sobre o balão tem pelo menos 4,5:1`, () => {
    const fill = resolve(theme, '--laift-danger');
    const ink = resolve(theme, '--laift-on-danger');
    assert.ok(ratio(ink, fill) >= MIN_TEXT, `${ink} sobre ${fill}: ${ratio(ink, fill).toFixed(2)}`);
  });
}

test('balão de aviso, tema claro: com o véu de 35%, o contorno do balão se separa do fundo por pelo menos 3:1 em toda camada', () => {
  const veil = liaVar(LIA_LIGHT, '--lia-shadow');
  const line = liaVar(LIA_LIGHT, '--lia-line');
  LAYERS.forEach((layer) => {
    const backdrop = over(veil, resolve(LIGHT, layer), VEIL);
    assert.ok(ratio(line, backdrop) >= MIN_GRAPHIC, `${layer}: contorno ${line} sobre ${backdrop}: ${ratio(line, backdrop).toFixed(2)}`);
  });
});

test('balão de aviso, tema escuro: com o véu de 35%, o balão se separa do fundo por pelo menos 3:1 em toda camada', () => {
  const veil = liaVar(LIA_DARK, '--lia-shadow');
  const fill = resolve(DARK, '--laift-danger');
  LAYERS.forEach((layer) => {
    const backdrop = over(veil, resolve(DARK, layer), VEIL);
    assert.ok(ratio(fill, backdrop) >= MIN_GRAPHIC, `${layer}: balão ${fill} sobre ${backdrop}: ${ratio(fill, backdrop).toFixed(2)}`);
  });
});

test('o véu da cena 5 chega a 35% (a conta do contraste usa o mesmo número da cena)', () => {
  const Scenes = require('../modulos/shared/lia/lia-scenes.js');
  const veil = Scenes.scenes.warning.anima.find((part) => part.sel === '#lia-pv-veu');
  assert.equal(veil.frames.at(-1).opacity, VEIL);
});
