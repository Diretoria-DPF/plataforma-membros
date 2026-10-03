/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-fundacao.e2e.js — telemetria anônima e persistência (Onda 3.5, A.2 e A.3).
 *  - Telemetria (flag ligada): lote com abertura e estrutura vista pela ponte,
 *    sem PII; desligada (padrão): nada é enviado.
 *  - "Continuar de onde parei": chip fixo com a última estrutura estudada.
 *  - Meu estudo: exportar e importar o progresso (ida e volta, sem duplicar).
 */
const fs = require('fs');
const { startApp, check } = require('./harness');

const SID = 'za:left-ventricle';

async function ready(frame) {
  await frame.waitForFunction(() => { const I = window.__atlasInternals; return !!I && I.store.get().loadedSystems.includes('esqueletico'); }, null, { timeout: 60000 });
}

module.exports = async function atlasFundacao() {
  // 1) Telemetria desligada: nenhuma chamada
  {
    const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 } });
    try {
      await app.login();
      const frame = await app.openModule('anatomia');
      await ready(frame);
      await frame.evaluate((sid) => window.__atlasInternals.selection.select(sid, 'api'), SID);
      await frame.waitForTimeout(800);
      check(!app.calls.worker.some((c) => c.action === 'apiLearnAtlasTelemetry'), 'telemetria desligada (padrão): nenhuma chamada à Worker');
    } finally { await app.close(); }
  }

  // 2) Telemetria ligada: lote anônimo; depois, Continuar e exportar/importar
  const batches = [];
  const app = await startApp({
    role: 'member', viewport: { width: 1280, height: 800 },
    atlasFlags: { onboarding: false, hints: false, telemetry: true },
    workerHandlers: { apiLearnAtlasTelemetry: (args) => { batches.push(args[1]); return { success: true, stored: (args[1].events || []).length }; } },
  });
  try {
    await app.login();
    let frame = await app.openModule('anatomia');
    await ready(frame);
    await frame.evaluate((sid) => window.__atlasInternals.selection.select(sid, 'api'), SID);
    await frame.waitForTimeout(500);
    // esconder a aba força o envio imediato do lote
    await frame.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await app.page.waitForFunction(() => true);
    for (let i = 0; i < 40 && !batches.length; i++) await frame.waitForTimeout(100);
    const events = batches.flatMap((b) => b.events || []);
    const names = events.map((e) => e.event);
    check(names.includes('app_open') && names.includes('structure_view'), `telemetria ligada: lote com abertura e estrutura vista (${names.join(',')})`);
    check(names.includes('session_end'), 'telemetria: o fim da sessão vai junto ao esconder a aba');
    check(batches.every((b) => /^[a-z0-9]{8,40}$/.test(b.sessionId)), 'telemetria: id de sessão aleatório');
    const wire = JSON.stringify(app.calls.worker.filter((c) => c.action === 'apiLearnAtlasTelemetry').map((c) => c.args[1]));
    check(!/ana@exemplo|Ana Teste|e2e-session-token/.test(wire), 'telemetria: sem nome, e-mail nem token no corpo do lote');

    // Continuar: recarrega o atlas e a última estrutura aparece como chip
    await frame.waitForTimeout(600);
    await frame.goto(frame.url(), { waitUntil: 'load' });
    await ready(frame);
    const chip = await frame.waitForSelector('.atlas-continue', { timeout: 15000 }).then(() => frame.evaluate(() => document.querySelector('.atlas-continue').textContent)).catch(() => null);
    check(!!chip && /Continuar/.test(chip), `chip fixo "${(chip || '').trim()}" depois de recarregar`);
    if (chip) {
      await frame.locator('.atlas-continue').click();
      await frame.waitForFunction((sid) => window.__atlasInternals.store.get().selectedSid === sid, SID, { timeout: 15000 }).catch(() => {});
      const sel = await frame.evaluate(() => window.__atlasInternals.store.get().selectedSid);
      check(sel === SID && await frame.evaluate(() => !document.querySelector('.atlas-continue')), 'tocar em "Continuar" abre a estrutura e o chip some');
    }

    // Meu estudo: exportar e importar
    await frame.evaluate(() => window.AtlasShell.setMode('estudo'));
    await frame.waitForSelector('.study-io-export', { timeout: 15000 });
    const [download] = await Promise.all([app.page.waitForEvent('download', { timeout: 15000 }), frame.locator('.study-io-export').click()]);
    const file = await download.path();
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    check(exported.app === 'laift-atlas' && exported.v === 1 && exported.history.some((h) => h.sid === SID), 'exportar: arquivo JSON com o histórico');
    check(await frame.evaluate(() => /privacidade|anônima/i.test(document.querySelector('.study-privacy') ? document.querySelector('.study-privacy').textContent : '')), 'aviso de uso anônimo em Meu estudo (flag ligada)');
    // importa o mesmo arquivo: nada novo (sem duplicar)
    await frame.locator('.study-io-file').setInputFiles(file);
    await frame.waitForFunction(() => /Nada novo/.test((document.querySelector('.study-io-msg') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
    check(await frame.evaluate(() => /Nada novo/.test(document.querySelector('.study-io-msg').textContent)), 'importar o mesmo arquivo: "Nada novo", sem duplicar');
    // importa um arquivo com uma estrutura nova
    const extra = { app: 'laift-atlas', v: 1, history: [{ type: 'select', sid: 'za:kidney-l', label: 'Rim', at: 1 }], pins: [{ sid: 'za:kidney-l', label: 'Rim', at: 1 }], notes: [] };
    await frame.locator('.study-io-file').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(extra)) });
    await frame.waitForFunction(() => /Importado/.test((document.querySelector('.study-io-msg') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
    const msg = await frame.evaluate(() => document.querySelector('.study-io-msg').textContent);
    check(/Importado: 1 no histórico, 1 fixada/.test(msg), `importar progresso novo (${msg})`);
    await frame.locator('.study-io-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"outro"}') });
    await frame.waitForFunction(() => /não é um progresso/.test((document.querySelector('.study-io-msg') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
    check(await frame.evaluate(() => /não é um progresso/.test(document.querySelector('.study-io-msg').textContent)), 'importar arquivo de outro app: recusado com mensagem');
    check(app.errors.length === 0, 'atlas-fundacao: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally { await app.close(); }
};
