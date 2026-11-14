/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// QA mobile do Laboratório: regras de CSS e de casca que garantem a bancada usável no celular
// (campos de 16 px, altura útil, paisagem, 1ª adição sem rolar). A conferência real fica no e2e lab-mobile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = path.join(frontend, 'modulos', 'laboratorio');
const ler = (...p) => fs.readFileSync(path.join(...p), 'utf8');

test('campos com 16 px no celular e no tablet (sem zoom do iOS)', () => {
  const css = ler(lab, 'style.css');
  const m = css.match(/@media \(pointer: coarse\), \(max-width: 1023px\) \{([^}]*\{[^}]*\})\s*\}/);
  assert.ok(m, 'bloco de 16 px presente');
  assert.match(m[1], /select/);
  assert.match(m[1], /input\[type="number"\]/);
  assert.match(m[1], /font-size:\s*16px\s*!important/);
});

test('o Laboratório abre em camada imersiva (altura útil inteira) como o Atlas', () => {
  const js = ler(frontend, 'learning.js');
  assert.match(js, /IMMERSIVE_MODULES\s*=\s*\{[^}]*anatomia:\s*true[^}]*lab:\s*true[^}]*\}/);
  assert.match(js, /learn-viewer-immersive', IMMERSIVE_MODULES\[id\] === true/);
  assert.match(js, /learn-frame-immersive', IMMERSIVE_MODULES\[key\] === true/);
});

test('paisagem: a janela rola e a barra inferior do Laboratório fica fixa', () => {
  const css = ler(lab, 'lab-guia.css');
  assert.match(css, /@media \(max-width: 1023px\) and \(max-height: 540px\)/);
  assert.match(css, /overflow-y: auto !important/);
  assert.match(css, /mobile-nav-bar \{ position: sticky; bottom: 0; \}/);
});

test('o botão Adicionar fica preso ao fim dos controles no celular e o HUD de 320 px vira duas linhas', () => {
  const css = ler(lab, 'lab-guia.css');
  assert.match(css, /\.btn-row:has\(> #btnStartAdd\)\s*\{[^}]*position: sticky/);
  assert.match(css, /@media \(max-width: 340px\)[\s\S]*hud-overlay \{ display: grid/);
});

test('contraste: o tema claro cobre molécula e missão; o azul dos botões ativos usa #0369a1 (AA com texto branco)', () => {
  const guia = ler(lab, 'lab-guia.css');
  for (const alvo of ['#molFormula', '#molWeight', '#molIupac', '#missionStatus', '.mission-box .panel-section-header h3']) {
    assert.ok(guia.includes(`html[data-theme="light"] ${alvo}`), `regra do tema claro para ${alvo}`);
  }
  assert.doesNotMatch(ler(lab, 'style.css'), /background: #0284c7;/);
  assert.doesNotMatch(ler(lab, 'studio', 'studio.css'), /background: #0284c7;/);
});

test('celular: o título do Laboratório ganha a própria linha no cabeçalho', () => {
  const css = ler(lab, 'lab-guia.css');
  assert.match(css, /@media \(max-width: 600px\) \{\s*\.lab-header \{ height: auto !important;[^}]*flex-wrap: wrap/);
  assert.match(css, /\.lab-header \.header-left \{ flex: 1 1 100%; \}/);
});

// ---- Paisagem de celular (leiaute próprio, sem rolar o módulo) ----
const PAISAGEM = '@media (orientation: landscape) and (max-height: 540px) and (max-width: 1023px)';
const blocoPaisagem = () => {
  const css = fs.readFileSync(path.join(lab, 'lab-guia.css'), 'utf8');
  const i = css.indexOf(PAISAGEM);
  assert.ok(i > 0, 'bloco de paisagem presente');
  return css.slice(i);
};

test('paisagem: painel ao lado da bancada, trilho de navegação à direita e #mainGrid fora do leiaute', () => {
  const css = blocoPaisagem();
  assert.match(css, /grid-template-columns: var\(--lab-esq\) minmax\(0, 1fr\) var\(--lab-trilho\)/);
  assert.match(css, /\.main-grid, \.main-grid\[data-mobile-view\] \{ display: contents !important; \}/);
  assert.match(css, /\.mobile-nav-bar \{ grid-column: 3; grid-row: 1 \/ 4; flex-direction: column !important/);
  assert.match(css, /#viewReagentes \{ display: flex !important; grid-column: 1;/);
  assert.match(css, /#viewBancada \{ display: flex !important; grid-column: 2;/);
});

test('paisagem: a janela deixa de rolar (a regra de rolagem vale só em retrato) e os botões do topo viram ícones de 44 px', () => {
  const css = fs.readFileSync(path.join(lab, 'lab-guia.css'), 'utf8');
  assert.match(css, /@media \(max-width: 1023px\) and \(max-height: 540px\) and \(orientation: portrait\)/);
  assert.match(blocoPaisagem(), /\.lab-header \.manual-btn \{[^}]*font-size: 0; min-width: 44px; min-height: 44px/);
  const html = fs.readFileSync(path.join(lab, 'index.html'), 'utf8');
  for (const id of ['btnLabFullscreen', 'btnOpenStudio', 'btnComece', 'btnManual']) assert.match(html, new RegExp(`id="${id}" data-ico="[^"]+"`));
});

test('paisagem estreita (até 620 px): bancada e painel alternam; a casca tira a barra da plataforma só do Laboratório', () => {
  const css = fs.readFileSync(path.join(lab, 'lab-guia.css'), 'utf8');
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 540px\) and \(max-width: 620px\)/);
  const shell = fs.readFileSync(path.join(lab, '..', '..', 'styles.css'), 'utf8');
  assert.match(shell, /body:has\(\.learn-viewer-immersive\[data-module="lab"\]:not\(\.hidden\)\) \.bottom-nav \{ display: none; \}/);
  assert.match(fs.readFileSync(path.join(lab, '..', '..', 'learning.js'), 'utf8'), /setAttribute\('data-module', id\)/);
});

test('chat do Laboratório no tema claro: sugestões com texto escuro (contraste 1,5:1 corrigido) e botão de enviar com 44 px', () => {
  const css = ler(lab, 'style.css');
  assert.match(css, /html\[data-theme="light"\] \.chat-chip \{[^}]*color:\s*#075985/);
  assert.match(css, /html\[data-theme="light"\] \.btn-chat-action \{[^}]*color:\s*#334155/);
  const guia = ler(lab, 'lab-guia.css');
  assert.match(guia, /\.lab-chat-input button \{[^}]*min-width:\s*44px/);
});
