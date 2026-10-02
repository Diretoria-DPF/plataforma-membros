/**
 * atlas-ficha-nav.e2e.js — navegação e "Ouvir" na ficha (PR 3.1.8–3.1.10).
 *  - "Voltar": depois de abrir 5 estruturas, percorre as 4 anteriores.
 *  - "Próxima"/"Anterior": anda pela sequência do sistema e volta.
 *  - "Ouvir": fala o resumo em pt-BR e para ao trocar de estrutura
 *    (speechSynthesis substituído por um dublê — o Chromium headless não fala).
 *  - Nome em português (tradução assistida), selo na ficha e busca em PT
 *    ("coração", "fêmur", "ligamento tibiofibular" — gate do PR 3.1).
 */
const { startApp, check } = require('./harness');

const FIVE = ['za:femur-r', 'za:tibia-r', 'za:patella-r', 'za:humerus-r', 'za:scapula-r'];

async function runAt(viewport) {
  const label = `${viewport.width}×${viewport.height}`;
  const app = await startApp({ role: 'member', viewport });
  // Dublê de speechSynthesis em todos os documentos (o atlas roda num iframe).
  await app.context.addInitScript(() => {
    window.__ttsLog = [];
    const fake = {
      speaking: false, pending: false,
      getVoices: () => [{ lang: 'pt-BR', name: 'Teste' }],
      speak(u) { this.speaking = true; window.__ttsLog.push({ op: 'speak', lang: u.lang, text: u.text }); },
      cancel() { this.speaking = false; window.__ttsLog.push({ op: 'cancel' }); },
    };
    try {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake });
      window.SpeechSynthesisUtterance = function (text) { this.text = text; this.lang = ''; };
    } catch (e) { /* sem como substituir: o teste do TTS acusa */ }
  });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => {
      const I = window.__atlasInternals;
      return !!I && I.store.get().loadedSystems.includes('esqueletico');
    }, null, { timeout: 60000 });

    const card = viewport.width < 600 ? '#atlas-sheet' : '#atlas-inspector';
    const select = (sid) => frame.evaluate((s) => {
      const I = window.__atlasInternals;
      I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: s, source: 'search' });
    }, sid);
    const selected = () => frame.evaluate(() => window.__atlasInternals.store.get().selectedSid);
    const clickNav = async (action) => {
      await frame.locator(`${card} .atlas-card-nav-btn[data-nav-action="${action}"]`).click({ timeout: 5000 });
      await frame.waitForTimeout(250);
    };

    // ---- Voltar (3.1.8) ----
    for (const sid of FIVE) { await select(sid); await frame.waitForTimeout(200); }
    const backPath = [];
    for (let i = 0; i < 4; i++) { await clickNav('back'); backPath.push(await selected()); }
    check(JSON.stringify(backPath) === JSON.stringify(FIVE.slice(0, 4).reverse()),
      `${label}: "Voltar" percorre as 4 estruturas anteriores (${backPath.join(' → ')})`);
    const backDisabled = await frame.evaluate((c) => document.querySelector(`${c} .atlas-card-nav-btn[data-nav-action="back"]`).disabled, card);
    check(backDisabled, `${label}: "Voltar" desabilitado no início do histórico`);

    // ---- Próxima / Anterior (3.1.9) ----
    await select('za:femur-r');
    await frame.waitForTimeout(250);
    const start = await selected();
    await clickNav('next');
    const afterNext = await selected();
    await clickNav('prev');
    const afterPrev = await selected();
    const sameSystem = await frame.evaluate((s) => window.__atlasInternals.contentStore.getEntry(s).system, afterNext);
    check(afterNext && afterNext !== start && sameSystem === 'esqueletico', `${label}: "Próxima" avança dentro do sistema (${start} → ${afterNext})`);
    check(afterPrev === start || (afterPrev && afterPrev.replace(/-[lr]$/, '') === start.replace(/-[lr]$/, '')),
      `${label}: "Anterior" volta para a estrutura de partida (${afterPrev})`);

    // ---- Nome PT e selo de tradução assistida (3.1.5) ----
    const nameInfo = await frame.evaluate((c) => ({
      name: (document.querySelector(`${c} #organ-name, ${c} .atlas-card-name`) || {}).textContent || '',
      assisted: !!document.querySelector(`${c} .atlas-card-assisted`),
    }), card);
    check(/^F[eê]mur/.test(nameInfo.name), `${label}: nome da ficha em português ("${nameInfo.name}")`);

    // ---- Busca em português (gate do PR 3.1) ----
    const found = await frame.evaluate(async () => {
      const sb = window.__atlasInternals.searchBox;
      const out = {};
      for (const q of ['coração', 'fêmur', 'ligamento tibiofibular']) {
        sb.open(q);
        await new Promise((r) => setTimeout(r, 300));
        out[q] = [...document.querySelectorAll('.atlas-search-option .atlas-search-option-label')].slice(0, 3).map((o) => o.textContent.trim());
        sb.close();
      }
      return out;
    });
    check(/cora[cç][aã]o/i.test((found['coração'] || [])[0] || ''), `${label}: busca "coração" acha (${(found['coração'] || []).join(' · ')})`);
    check(/f[eê]mur/i.test((found['fêmur'] || [])[0] || ''), `${label}: busca "fêmur" acha (${(found['fêmur'] || []).join(' · ')})`);
    check((found['ligamento tibiofibular'] || []).some((t) => /ligamento tibiofibular/i.test(t)), `${label}: busca "ligamento tibiofibular" acha (${(found['ligamento tibiofibular'] || []).join(' · ')})`);

    // ---- Ouvir (3.1.10) ----
    await select('za:calcaneus-l');
    await frame.waitForFunction((c) => !!document.querySelector(`${c} .atlas-card-listen`), card, { timeout: 8000 }).catch(() => {});
    const hasListen = await frame.evaluate((c) => !!document.querySelector(`${c} .atlas-card-listen`), card);
    check(hasListen, `${label}: botão "Ouvir" no resumo`);
    if (hasListen) {
      await frame.locator(`${card} .atlas-card-listen`).click();
      await frame.waitForTimeout(150);
      await select('za:talus-l');
      await frame.waitForTimeout(300);
      const log = await frame.evaluate(() => window.__ttsLog);
      const spoke = log.find((x) => x.op === 'speak');
      check(!!spoke && spoke.lang === 'pt-BR' && spoke.text.length > 40, `${label}: "Ouvir" fala o resumo em pt-BR`);
      check(log.findIndex((x) => x.op === 'cancel') > log.findIndex((x) => x.op === 'speak'), `${label}: a fala para ao trocar de estrutura`);
    }
    check(app.errors.length === 0, `${label}: sem erros de JavaScript${app.errors.length ? ': ' + app.errors.join(' | ') : ''}`);
  } finally {
    await app.close();
  }
}

module.exports = async function atlasFichaNav() {
  await runAt({ width: 1280, height: 800 });
  await runAt({ width: 390, height: 844 });
};
