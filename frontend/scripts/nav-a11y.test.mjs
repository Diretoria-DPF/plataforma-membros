/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Semântica da navegação inferior (WCAG 1.3.1 e 4.1.2): aba ativa com aria-current e badges com texto oculto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const APP = read('frontend/app.js');
const HTML = read('frontend/index.html');

// app.js é um IIFE sem exports; a lógica pura fica entre estes marcadores e é avaliada isoladamente.
const BLOCK_START = '// >>> nav-a11y (puro)';
const BLOCK_END = '// <<< nav-a11y (puro)';
function pureHelpers() {
  const start = APP.indexOf(BLOCK_START);
  const end = APP.indexOf(BLOCK_END);
  assert.ok(start >= 0 && end > start, 'bloco "nav-a11y (puro)" não encontrado em app.js');
  return new Function(`${APP.slice(start, end)}\nreturn { navBadgeSrText, navItemState, NAV_BADGES };`)();
}

// Mesma ordem e ids usados em index.html (#app-nav).
const BADGE_TABS = [
  { panel: 'panel-proposals', badge: 'nav-badge-voting', sr: 'nav-badge-voting-sr' },
  { panel: 'panel-tasks', badge: 'nav-badge-tasks', sr: 'nav-badge-tasks-sr' },
  { panel: 'panel-orgchart', badge: 'nav-badge-connections', sr: 'nav-badge-connections-sr' },
  { panel: 'panel-messages', badge: 'nav-badge-messages', sr: 'nav-badge-messages-sr' },
];

function navButtonHtml(panel) {
  const match = new RegExp(`<button[^>]*data-panel="${panel}"[\\s\\S]*?</button>`).exec(HTML);
  assert.ok(match, `botão da aba ${panel} não encontrado em index.html`);
  return match[0];
}

// ---------- texto oculto do badge ----------
test('badge de votação aberta anuncia "há votação aberta" e some sem votação', () => {
  const { navBadgeSrText } = pureHelpers();
  assert.equal(navBadgeSrText('voting', 1), 'há votação aberta');
  assert.equal(navBadgeSrText('voting', 0), '');
});

test('tarefas pendentes: singular e plural em pt-BR', () => {
  const { navBadgeSrText } = pureHelpers();
  assert.equal(navBadgeSrText('tasks', 1), '1 tarefa pendente');
  assert.equal(navBadgeSrText('tasks', 3), '3 tarefas pendentes');
});

test('mensagens não lidas: singular e plural em pt-BR', () => {
  const { navBadgeSrText } = pureHelpers();
  assert.equal(navBadgeSrText('messages', 1), '1 mensagem não lida');
  assert.equal(navBadgeSrText('messages', 2), '2 mensagens não lidas');
});

test('solicitações de conexão: singular e plural em pt-BR', () => {
  const { navBadgeSrText } = pureHelpers();
  assert.equal(navBadgeSrText('connections', 1), '1 solicitação de conexão pendente');
  assert.equal(navBadgeSrText('connections', 2), '2 solicitações de conexão pendentes');
});

test('contagem zero, negativa, vazia ou inválida não gera texto para anunciar', () => {
  const { navBadgeSrText } = pureHelpers();
  for (const count of [0, -2, NaN, undefined, null, '']) {
    assert.equal(navBadgeSrText('tasks', count), '', `contagem ${String(count)} deveria ficar sem texto`);
  }
});

test('contagem vinda como texto (textContent do badge) é aceita', () => {
  const { navBadgeSrText } = pureHelpers();
  assert.equal(navBadgeSrText('messages', '2'), '2 mensagens não lidas');
});

test('tipo desconhecido não gera texto e não vaza propriedades herdadas do objeto', () => {
  const { navBadgeSrText } = pureHelpers();
  assert.equal(navBadgeSrText('unknown', 2), '');
  assert.equal(navBadgeSrText('constructor', 2), '');
  assert.equal(navBadgeSrText('toString', 2), '');
});

// ---------- aba ativa ----------
test('navItemState: só a aba do painel atual fica ativa e recebe aria-current="page"', () => {
  const { navItemState } = pureHelpers();
  assert.deepEqual(navItemState('panel-tasks', 'panel-tasks'), { active: true, ariaCurrent: 'page' });
  assert.deepEqual(navItemState('panel-home', 'panel-tasks'), { active: false, ariaCurrent: null });
});

test('app.js aplica aria-current em showPanelSection, removendo das demais abas', () => {
  const body = APP.slice(APP.indexOf('function showPanelSection('), APP.indexOf('function showPanel('));
  assert.match(body, /querySelectorAll\('#app-nav \[data-panel\], #app-menu \[data-panel\]'\)/);
  assert.match(body, /navItemState\(btn\.getAttribute\('data-panel'\), panelId\)/);
  assert.match(body, /setAttribute\('aria-current', state\.ariaCurrent\)/);
  assert.match(body, /removeAttribute\('aria-current'\)/);
});

test('o seletor de abas cobre o grupo do admin, que também fica dentro de #app-nav', () => {
  const navStart = HTML.indexOf('id="app-nav"');
  const navHtml = HTML.slice(navStart, HTML.indexOf('</nav>', navStart));
  assert.ok(navHtml.includes('id="nav-group-admin"'), 'grupo admin fora de #app-nav');
  assert.ok(navHtml.includes('data-panel="panel-admin-ai"'), 'aba admin fora de #app-nav');
});

// ---------- badges no markup ----------
test('badges da navegação são decorativos: span com aria-hidden e sem aria-label', () => {
  for (const { panel, badge } of BADGE_TABS) {
    const tag = new RegExp(`<span id="${badge}"[^>]*>`).exec(navButtonHtml(panel))?.[0];
    assert.ok(tag, `badge ${badge} ausente em ${panel}`);
    assert.match(tag, /class="nav-badge/);
    assert.match(tag, /aria-hidden="true"/);
    assert.doesNotMatch(tag, /aria-label/);
  }
});

test('cada aba com badge tem texto oculto dentro do próprio botão, fora do span do número', () => {
  for (const { panel, sr } of BADGE_TABS) {
    assert.match(navButtonHtml(panel), new RegExp(`<span id="${sr}" class="visually-hidden"></span>`));
  }
});

test('rótulos visíveis das abas continuam iguais (e2e depende deles)', () => {
  const labels = {
    'panel-home': 'Início', 'panel-learn': 'Aprender', 'panel-events': 'Eventos', 'panel-proposals': 'Propostas',
    'panel-tasks': 'Tarefas', 'panel-orgchart': 'Equipe', 'panel-messages': 'Mensagens', 'panel-profile': 'Perfil',
  };
  for (const [panel, label] of Object.entries(labels)) {
    const html = navButtonHtml(panel);
    // Na barra o rótulo é <span>Rótulo</span>; os itens do menu (app-menu.js) usam <span class="app-menu__titulo">.
    assert.ok(html.includes(`<span>${label}</span>`) || html.includes(`<span class="app-menu__titulo">${label}</span>`), `rótulo "${label}" mudou em ${panel}`);
  }
});

test('ids de badge e de texto oculto em app.js (NAV_BADGES) batem com index.html', () => {
  const { NAV_BADGES } = pureHelpers();
  const fromApp = NAV_BADGES.map((entry) => `${entry.id}|${entry.srId}`);
  const fromHtml = BADGE_TABS.map((entry) => `${entry.badge}|${entry.sr}`);
  assert.deepEqual(fromApp, fromHtml);
});

test('app.js inicia a sincronização dos badges (watchNavBadges) depois da lógica pura', () => {
  const pureEnd = APP.indexOf(BLOCK_END);
  const callAt = APP.indexOf('\n  watchNavBadges();');
  assert.ok(callAt > pureEnd, 'watchNavBadges() precisa ser chamada depois do bloco puro');
});

test('classe .visually-hidden existe em styles.css', () => {
  assert.match(read('frontend/styles.css'), /\.visually-hidden\s*\{/);
});
