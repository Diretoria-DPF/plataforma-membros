/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-moleculas.e2e.js — modo Moléculas pelo proxy da Worker (PR 3.2, Bloco E).
 *  - O .pdb vem de apiLearnAtlasPdb; nenhuma requisição ao files.rcsb.org nem
 *    ao PubChem sai do navegador.
 *  - Worker com HTTP 500: aviso "Serviço de moléculas indisponível" com
 *    "Tentar de novo"; ao voltar, o botão carrega a estrutura.
 *  - Worker antiga ("Ação desconhecida.", deploy fora de ordem): mesmo aviso.
 *  - CSP do atlas sem RCSB/PubChem no connect-src.
 */
const { startApp, check } = require('./harness');

const MOCK_PDB = [
  'HEADER    HYDROLASE                               01-JAN-00   4EY7',
  'ATOM      1  N   ALA A   1      11.104   6.134  -6.504  1.00  0.00           N',
  'ATOM      2  CA  ALA A   1      11.639   6.071  -5.147  1.00  0.00           C',
  'ATOM      3  C   ALA A   1      13.149   5.879  -5.180  1.00  0.00           C',
  'HETATM    4  C1  E20 A 900      12.000   6.000  -5.500  1.00  0.00           C',
  'END',
].join('\n');

module.exports = async function atlasMoleculas() {
  let workerMode = 'ok';
  const proxyCalls = [];
  const app = await startApp({
    role: 'member',
    workerHandlers: {
      apiLearnAtlasPdb: (args) => {
        proxyCalls.push(args[1]);
        if (workerMode === 'unknown') return { success: false, message: 'Ação desconhecida.' };
        return { success: true, id: String(args[1] && args[1].id).toUpperCase(), pdb: MOCK_PDB };
      },
    },
  });
  // Worker fora do ar: HTTP 500 só para o proxy (o resto segue no harness).
  await app.context.route((url) => url.href.includes('.workers.dev'), async (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) { /* corpo inválido */ }
    if (workerMode === 'down' && body.action === 'apiLearnAtlasPdb') {
      proxyCalls.push(body.args && body.args[1]);
      return route.fulfill({ status: 500, contentType: 'text/plain', body: 'erro' });
    }
    return route.fallback();
  });

  const atlasCdn = [];
  app.context.on('request', (r) => { try { if (/jsdelivr/.test(r.url()) && /anatomia-3d/.test(r.frame().url())) atlasCdn.push(r.url()); } catch (e) { /* sem frame */ } });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => !!window.__atlasInternals && !!window.AtlasShell, null, { timeout: 60000 });

    const csp = await frame.evaluate(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
    const connect = (/connect-src([^;]*)/.exec(csp) || [])[1] || '';
    check(connect && !/rcsb|pubchem/i.test(connect), `CSP do atlas sem RCSB/PubChem no connect-src (${connect.trim()})`);

    await frame.evaluate(() => window.AtlasShell.setMode('moleculas'));
    await frame.waitForFunction(() => [...document.querySelectorAll('.molecules-sheet div')].some((d) => /^4EY7: /.test(d.textContent || '')), null, { timeout: 15000 });
    const openProtein = (id) => frame.locator(`.molecules-sheet [data-pdb="${id}"]`).click({ timeout: 5000 });
    const hudState = () => frame.evaluate(() => {
      const box = document.getElementById('molInfoDetails');
      const err = box && box.querySelector('[role="alert"]');
      return {
        error: err ? err.getAttribute('data-mol-error') : null,
        text: err ? err.textContent.replace(/\s+/g, ' ').trim() : '',
        retry: !!(box && box.querySelector('.mol-retry')),
        canvas: !!document.querySelector('#mol-viewport canvas'),
      };
    });

    // ---- 1. Worker fora do ar (HTTP 500) ----
    workerMode = 'down';
    await openProtein('4EY7');
    await frame.waitForFunction(() => !!document.querySelector('#molInfoDetails [data-mol-error]'), null, { timeout: 15000 }).catch(() => {});
    let s = await hudState();
    check(s.error === 'unavailable' && /Serviço de moléculas indisponível/.test(s.text), `Worker com 500: aviso "Serviço de moléculas indisponível" (${s.text || 'sem aviso'})`);
    check(s.retry, 'Worker com 500: botão "Tentar de novo"');

    // ---- 2. Worker volta: "Tentar de novo" carrega pela Worker ----
    workerMode = 'ok';
    const before = proxyCalls.length;
    await frame.locator('#molInfoDetails .mol-retry').click({ timeout: 5000 });
    await frame.waitForFunction(() => !document.querySelector('#molInfoDetails [data-mol-error]'), null, { timeout: 15000 }).catch(() => {});
    s = await hudState();
    check(proxyCalls.length > before && proxyCalls[proxyCalls.length - 1].id === '4EY7', `"Tentar de novo" pede 4EY7 de novo à Worker (${JSON.stringify(proxyCalls[proxyCalls.length - 1])})`);
    check(!s.error, `depois de "Tentar de novo", a estrutura carrega sem aviso`);
    check(s.canvas, 'estrutura do PDB (mock) monta a cena do 3Dmol (3Dmol do próprio site)');
    check(atlasCdn.length === 0, `o atlas não pede nada ao jsDelivr${atlasCdn.length ? ' (' + atlasCdn.join(',') + ')' : ''}`);

    // ---- 3. Worker antiga, sem a ação (deploy fora de ordem) ----
    workerMode = 'unknown';
    await openProtein('1EQG');
    await frame.waitForFunction(() => !!document.querySelector('#molInfoDetails [data-mol-error]'), null, { timeout: 15000 }).catch(() => {});
    s = await hudState();
    check(s.error === 'unavailable' && s.retry, `Worker sem a ação ("Ação desconhecida."): mesmo aviso de indisponível (${s.text || 'sem aviso'})`);

    const direct = app.calls.external.filter((c) => /rcsb\.org|pubchem\.ncbi/.test(c.url));
    check(direct.length === 0, `nenhuma chamada direta ao RCSB/PubChem${direct.length ? ': ' + direct.map((c) => c.url).join(' | ') : ''}`);
    check(app.errors.length === 0, `sem erros de JavaScript${app.errors.length ? ': ' + app.errors.join(' | ') : ''}`);
  } finally {
    await app.close();
  }
};
