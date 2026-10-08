/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * axe-gate.js — gate de acessibilidade (axe-core, WCAG 2.x A/AA) para os
 * cenários e2e. Violações de impacto "serious" ou "critical" reprovam o
 * cenário; "moderate" e "minor" viram aviso no log.
 *
 * `enforce: false` deixa as serious/critical só como aviso. Use apenas para um
 * defeito real já conhecido, listado no relatório da tarefa, até o dono do
 * produto corrigir — nunca para esconder uma regressão nova.
 *
 * Uso: await axeGate(app.page, 'claro/375x812/inicio');
 */
const fs = require('fs');
const path = require('path');
const { check } = require('./harness');

const AXE_FILE = path.join(__dirname, '..', '..', 'node_modules', 'axe-core', 'axe.min.js');
const AXE_SRC = fs.existsSync(AXE_FILE) ? fs.readFileSync(AXE_FILE, 'utf8') : null;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/** Roda dentro da página e devolve as violações já resumidas (serializáveis). */
function runAxeInPage(tags) {
  return window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })
    .then((result) => result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      count: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((node) => node.target.join(' ')),
    })));
}

async function ensureAxe(page) {
  const loaded = await page.evaluate(() => typeof window.axe === 'object' && window.axe !== null);
  if (!loaded) await page.evaluate(AXE_SRC);
}

/**
 * Espera as animações finitas em andamento (ex.: panel-enter, fade de 280 ms ao abrir uma seção).
 * Durante o fade a opacidade é parcial e o axe calcula contraste com o texto misturado ao fundo,
 * dando um falso positivo. Animações infinitas (respiração da Lia, partículas) não são esperadas.
 */
async function waitFiniteAnimations(page) {
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => null))),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]));
}

function describeBlocking(list) {
  return list.map((v) => `${v.id} ${v.impact} x${v.count} (${v.targets.join(' | ')})`).join(' ; ');
}

/**
 * Aplica o gate na tela atual. Devolve as violações serious/critical (lista vazia = passou).
 * `where` identifica a tela no relatório.
 */
async function axeGate(page, where, { enforce = true } = {}) {
  if (!AXE_SRC) {
    check(false, `${where}: axe-core ausente em node_modules (rode npm ci em frontend/)`);
    return [];
  }
  await ensureAxe(page);
  await waitFiniteAnimations(page);
  const found = await page.evaluate(runAxeInPage, WCAG_TAGS);
  const blocking = found.filter((v) => BLOCKING_IMPACTS.has(v.impact));
  for (const v of found.filter((item) => !BLOCKING_IMPACTS.has(item.impact))) {
    console.log(`  · aviso ${where}: ${v.id} (${v.impact}, ${v.count}) — ${v.help} — ${v.targets.join(' | ')}`);
  }
  if (!blocking.length) {
    check(true, `${where}: axe sem violações serious/critical`);
    return blocking;
  }
  const detail = describeBlocking(blocking);
  if (enforce) {
    check(false, `${where}: axe serious/critical: ${detail}`);
  } else {
    console.log(`  ⚠ AVISO ${where}: axe serious/critical (não bloqueia neste cenário): ${detail}`);
  }
  return blocking;
}

module.exports = { axeGate };
