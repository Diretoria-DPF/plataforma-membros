/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-descoberta.e2e.js — Descoberta de moléculas no Estúdio 3D (O7), em navegador real:
 *   1. o RDKit e o seed NÃO carregam ao abrir o Estúdio (perf-budget);
 *   2. com a aspirina selecionada, o painel "Análogos e comparação" gera ideias,
 *      compara uma delas com a original (propriedades, Lipinski, alertas) e abre no 3D;
 *   3. com uma substância de nível "educacional" (morfina), o painel nega e não lista análogos;
 *   4. o painel de bioisosterismo e a edição de átomo também negam para ela;
 *   5. nenhuma violação de CSP e nenhum erro de JavaScript.
 * Precisa do espelho do npm (cdn-mirror) para o RDKit; sem ele, avisa e pula.
 */
const { startApp, check } = require('./harness');
const mirror = require('./cdn-mirror');

const AAS = { id: 'AAS', chaveOriginal: 'AAS_s', nome: 'Ácido Acetilsalicílico (Aspirina)', formula: 'C9H8O4', molarMass: 180.16, smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O', categoria: 'farmacos', pubchemQuery: 'Aspirin' };
const MORFINA = { id: 'C17H19NO3_s', chaveOriginal: 'C17H19NO3_s', nome: 'Morfina', formula: 'C17H19NO3', molarMass: 285.34, smiles: 'CN1CCC23C4C1CC5=C2C(=C(C=C5)O)OC3C(C=C4)O', categoria: 'farmacos', pubchemQuery: 'Morphine' };

module.exports = async function labDescoberta() {
  const pkgs = mirror.ensureMirror();
  if (!pkgs) {
    console.log('  (aviso: espelho do npm indisponível; cenário pulado)');
    return;
  }
  const app = await startApp({ role: 'member' });
  try {
    const violations = [];
    await app.context.exposeBinding('__e2eCspReport', (source, v) => { violations.push(v); });
    await app.context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        try { window.__e2eCspReport({ directive: e.effectiveDirective, blocked: e.blockedURI }); } catch (err) { /* sem binding */ }
      });
    });
    await app.context.route('https://cdn.jsdelivr.net/**', (route) => {
      const file = mirror.resolveCdnUrl(pkgs, route.request().url());
      if (!file) return route.abort();
      return route.fulfill({ status: 200, contentType: file.contentType, body: file.body, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await app.login();
    const lab = await app.openModule('lab');
    await lab.waitForTimeout(300);
    await lab.click('#btnOpenStudio');
    const studioEl = await lab.waitForSelector('#studioIframe');
    const studio = await studioEl.contentFrame();
    await studio.waitForLoadState('load').catch(() => {});
    await studio.waitForFunction(() => typeof window.abrirPainelAnalogos === 'function', null, { timeout: 15000 });

    const aoAbrir = await studio.evaluate(() => ({
      seed: !!window.LAB_SEED,
      scriptSeed: !!document.querySelector('script[src*="lab-seed"]'),
    }));
    check(aoAbrir.seed === false && aoAbrir.scriptSeed === false, 'o seed (119 KB) não é carregado ao abrir o Estúdio');

    // Aspirina: gera ideias, compara e abre no 3D.
    await studio.evaluate((c) => window.selecionarCompostoStudio(c), AAS);
    await studio.click('[data-action="abrirPainelAnalogos"]');
    await studio.waitForSelector('#analogosModalBody .bio-transform-card', { timeout: 40000 });
    const cartoes = await studio.$$eval('#analogosModalBody .bio-transform-card', (els) => els.length);
    check(cartoes >= 3, `a aspirina gera ao menos 3 ideias de análogos (${cartoes})`);
    const aviso = await studio.$eval('#analogosModalBody', (el) => el.textContent);
    check(/sem rota de síntese e sem dose/.test(aviso), 'o painel avisa que são ideias para estudo, sem rota de síntese nem dose');
    check(!/PAINS/.test(aviso), 'o painel não chama os alertas de PAINS');

    await studio.click('#analogosModalBody [data-action="compararAnalogo"]');
    await studio.waitForSelector('#analogoComparacaoArea .delta-table', { timeout: 40000 });
    const comparacao = await studio.$eval('#analogoComparacaoArea', (el) => el.textContent);
    check(/Massa molar/.test(comparacao) && /logP/.test(comparacao) && /TPSA/.test(comparacao), 'a comparação mostra propriedades lado a lado');
    check(/Lipinski original/.test(comparacao) && /Veber análogo/.test(comparacao), 'a comparação mostra as regras de Lipinski e Veber das duas moléculas');
    check(/Alerta estrutural|Sem mudança/.test(comparacao), 'a comparação informa os alertas estruturais');

    await studio.click('#analogoComparacaoArea [data-action="abrirAnaloNoTresD"]');
    await studio.waitForFunction(() => document.getElementById('analogosModal').style.display === 'none', null, { timeout: 5000 });
    const derivado = await studio.evaluate(() => window.LaiftEstudioPonte.selecionado());
    check(/^deriv_/.test(derivado.id) && /\[/.test(derivado.nome), 'o análogo vira o composto selecionado no 3D (nome com a transformação)');

    // Morfina (educacional): nega em todos os caminhos.
    await studio.evaluate((c) => window.selecionarCompostoStudio(c), MORFINA);
    await studio.click('[data-action="abrirPainelAnalogos"]');
    await studio.waitForFunction(() => /não gera análogos/.test(document.getElementById('analogosModalBody').textContent), null, { timeout: 20000 });
    const negado = await studio.$$eval('#analogosModalBody .bio-transform-card', (els) => els.length);
    check(negado === 0, 'para a morfina (nível educacional) nenhum análogo é listado');
    await studio.click('#analogosModal [data-action="fecharPainelAnalogos"]');

    await studio.click('[data-action="abrirPainelBioisosterismo"]');
    await studio.waitForFunction(() => /não gera análogos/.test(document.getElementById('bioisostereModalBody').textContent), null, { timeout: 20000 });
    const bioCartoes = await studio.$$eval('#bioisostereModalBody .bio-transform-card', (els) => els.length);
    check(bioCartoes === 0, 'o painel de bioisosterismo também nega a morfina');

    const permEdicao = await studio.evaluate(() => window.LaiftDescobertaUI.verificarPermissao(
      window.LaiftEstudioPonte.selecionado()));
    check(permEdicao.permitido === false, 'a edição de átomo usa o mesmo portão e nega a morfina');

    check(violations.length === 0, 'nenhuma violação de CSP' + (violations.length ? ': ' + JSON.stringify(violations) : ''));
    const realErrors = app.errors.filter((e) => !/\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner)\b/.test(e));
    check(realErrors.length === 0, 'sem erros de JavaScript' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }
};
