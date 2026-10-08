/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Contraste WCAG do vidro (frontend/ux-glass.css) sobre as camadas, nos temas claro e escuro.
// Lê os tokens de modulos/shared/laift-tokens.css e os véus de ux-glass.css: se um valor mudar, o teste reflete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const TOKENS_CSS = read('modulos/shared/laift-tokens.css');
const GLASS_CSS = read('ux-glass.css');

const MINIMO_TEXTO = 4.5;
const MINIMO_GRANDE = 3;
const MINIMO_FOCO = 3;
const MINIMO_VEU_COM_TEXTO = 0.92;
const CAMADAS = ['--layer-0', '--layer-1', '--layer-2', '--layer-3'];
// Pior caso do vidro: o texto do próprio módulo por trás aparece através do véu.
const TEXTO_POR_TRAS = '--laift-text';
const FUNDOS = [...CAMADAS, TEXTO_POR_TRAS];

/** Mapa de tokens do tema claro: todos os `--x: valor;` dos blocos `:root { }`. */
function tokensClaros(css) {
  const mapa = {};
  for (const bloco of css.matchAll(/^:root\s*\{([\s\S]*?)\n\}/gm)) {
    for (const d of bloco[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) mapa[d[1]] = d[2].trim();
  }
  return mapa;
}

/** Sobrescritas do tema escuro (bloco html[data-theme="dark"]). */
function sobrescritasEscuras(css) {
  const mapa = {};
  const bloco = /html\[data-theme="dark"\],\s*html\.laift-always-dark\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(bloco, 'bloco do tema escuro não encontrado em laift-tokens.css');
  for (const d of bloco[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) mapa[d[1]] = d[2].trim();
  return mapa;
}

const CLARO = tokensClaros(TOKENS_CSS);
const ESCURO = { ...CLARO, ...sobrescritasEscuras(TOKENS_CSS) };
const TEMAS = { claro: CLARO, escuro: ESCURO };

/** Resolve var(--x) encadeados até um valor literal (#rrggbb). */
function resolver(tema, nome, profundidade = 0) {
  assert.ok(profundidade < 10, `ciclo de variáveis em ${nome}`);
  const valor = tema[nome];
  assert.ok(valor !== undefined, `token ausente: ${nome}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(valor);
  return ref ? resolver(tema, ref[1], profundidade + 1) : valor;
}

const rgb = (hex) => {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `cor não é #rrggbb: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
};

/** Véus: `--nome: color-mix(in srgb, var(--origem) P%, transparent)` de ux-glass.css. */
const VEUS = {};
for (const m of GLASS_CSS.matchAll(/(--[\w-]+):\s*color-mix\(in srgb,\s*var\((--[\w-]+)\)\s*(\d+(?:\.\d+)?)%,\s*transparent\)/g)) {
  VEUS[m[1]] = { origem: m[2], alfa: Number(m[3]) / 100 };
}

/** Composição sRGB: cor com alfa sobre um fundo opaco. */
const misturar = (frente, alfa, fundo) => frente.map((c, i) => c * alfa + fundo[i] * (1 - alfa));

function luminancia([r, g, b]) {
  const linear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Cor final de uma superfície de vidro: véu (e brilho, se houver) sobre o fundo. */
function superficieSobre(tema, superficie, fundoToken) {
  const veu = VEUS[superficie.veu];
  let cor = misturar(rgb(resolver(tema, veu.origem)), veu.alfa, rgb(resolver(tema, fundoToken)));
  if (superficie.brilho) {
    const brilho = VEUS[superficie.brilho];
    cor = misturar(rgb(resolver(tema, brilho.origem)), brilho.alfa, cor);
  }
  return cor;
}

/** Superfícies criadas em ux-glass.css, com os tokens de texto que sobre elas aparecem. */
const SUPERFICIES = [
  {
    nome: 'Início (cartão de boas-vindas)',
    veu: '--glass-fill-1',
    brilho: '--glass-hero-glow',
    textos: ['--laift-text', '--laift-muted', '--laift-primary-strong'],
    grandes: ['--laift-primary'],
  },
  {
    nome: 'Popover da Lia',
    veu: '--glass-fill-1',
    textos: ['--laift-text', '--laift-muted', '--laift-primary-strong'],
    grandes: [],
  },
  {
    nome: 'Modal',
    veu: '--glass-fill-1',
    textos: ['--laift-text', '--laift-muted', '--laift-primary-strong'],
    grandes: [],
  },
  {
    nome: 'Barra inferior',
    veu: '--glass-fill-0',
    textos: ['--laift-muted', '--laift-primary-strong'],
    grandes: ['--laift-primary'],
  },
  {
    nome: 'Seletor',
    veu: '--glass-fill-2',
    textos: ['--laift-text', '--laift-muted'],
    grandes: [],
  },
];

test('laift-tokens.css traz os tokens v5 (--layer-*); sem eles, integrar feat/v5-ux-fundacao', () => {
  assert.ok(
    CLARO['--layer-0'] !== undefined && CLARO['--layer-1'] !== undefined,
    'laift-tokens.css sem --layer-*: a base desta branch é anterior a feat/v5-ux-fundacao; integre-a antes de rodar',
  );
});

test('ux-glass.css define os véus e o brilho usados pelas superfícies', () => {
  for (const s of SUPERFICIES) {
    assert.ok(VEUS[s.veu], `véu ausente em ux-glass.css: ${s.veu}`);
    if (s.brilho) assert.ok(VEUS[s.brilho], `brilho ausente em ux-glass.css: ${s.brilho}`);
  }
});

for (const [tema, mapa] of Object.entries(TEMAS)) {
  for (const superficie of SUPERFICIES) {
    for (const fundo of FUNDOS) {
      for (const token of superficie.textos) {
        test(`${superficie.nome} / ${tema} / ${token} sobre ${fundo} >= 4.5:1`, () => {
          const razao = contraste(rgb(resolver(mapa, token)), superficieSobre(mapa, superficie, fundo));
          assert.ok(razao >= MINIMO_TEXTO, `${razao.toFixed(2)}:1 abaixo de ${MINIMO_TEXTO}:1`);
        });
      }

      for (const token of superficie.grandes) {
        test(`${superficie.nome} / ${tema} / ${token} (grande/ícone) sobre ${fundo} >= 3:1`, () => {
          const razao = contraste(rgb(resolver(mapa, token)), superficieSobre(mapa, superficie, fundo));
          assert.ok(razao >= MINIMO_GRANDE, `${razao.toFixed(2)}:1 abaixo de ${MINIMO_GRANDE}:1`);
        });
      }
    }
  }
}

test('ux-glass.css: escopo na flag, fallback com @supports e movimento reduzido', () => {
  assert.match(GLASS_CSS, /:root\[data-flag-ux-v2-enabled\]/);
  assert.match(GLASS_CSS, /@supports \(\(backdrop-filter: blur\(1px\)\)/);
  assert.match(GLASS_CSS, /@media \(prefers-reduced-motion: no-preference\)/);
});

test('ux-glass.css: nenhum blur sobre canvas do Atlas e animação só de transform/opacity', () => {
  const codigo = GLASS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(codigo, /canvas/i);
  assert.doesNotMatch(codigo, /anatomia/i);
  const quadro = /@keyframes ux-glass-expand\s*\{([\s\S]*?)\n\}/.exec(codigo);
  assert.ok(quadro, 'keyframes ux-glass-expand ausente');
  assert.doesNotMatch(quadro[1], /\b(top|left|height|width|filter|backdrop-filter)\s*:/);
});

test('tokens de movimento usados existem em laift-tokens.css', () => {
  for (const token of ['--dur-base', '--ease-spring', '--move-sm']) {
    assert.ok(CLARO[token] !== undefined, `token de movimento ausente: ${token}`);
    assert.match(GLASS_CSS, new RegExp(`var\\(${token}\\)`));
  }
});

test('véus do vidro com texto: alfa >= 92% em todas as superfícies (pior caso: texto por trás)', () => {
  for (const superficie of SUPERFICIES) {
    const { alfa } = VEUS[superficie.veu];
    assert.ok(alfa >= MINIMO_VEU_COM_TEXTO, `${superficie.veu} com ${alfa * 100}%, mínimo ${MINIMO_VEU_COM_TEXTO * 100}%`);
  }
});

// Foco visível (WCAG 2.4.11 e 1.4.11): o anel precisa de 3:1 sobre cada camada, nos dois temas.
for (const [tema, mapa] of Object.entries(TEMAS)) {
  for (const camada of CAMADAS) {
    test(`foco / ${tema} / --laift-focus-color sobre ${camada} >= 3:1`, () => {
      const razao = contraste(rgb(resolver(mapa, '--laift-focus-color')), rgb(resolver(mapa, camada)));
      assert.ok(razao >= MINIMO_FOCO, `${razao.toFixed(2)}:1 abaixo de ${MINIMO_FOCO}:1`);
    });
  }
}
