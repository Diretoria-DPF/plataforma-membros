/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-revisao.e2e.js — ferramenta de revisão do conselho (PR 3.2, C1).
 *  - Carrega o pacote da onda 01 (gerado na hora; pendente/ não vai ao site).
 *  - "Assinar" só habilita com 100% marcado; ressalva exige comentário.
 *  - O .md baixado passa na trava do build (isSigned) e traz o hash.
 *  - Progresso salvo no navegador (recarregar mantém as marcações).
 *  - axe sem violações sérias; 1280 e 390.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startApp, check } = require('./harness');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function runAt(viewport, pacotePath, isSigned) {
  const label = `${viewport.width}×${viewport.height}`;
  const app = await startApp({ role: 'member', viewport });
  try {
    const page = app.page;
    await page.goto(`${app.baseUrl}modulos/anatomia-3d/revisao/index.html`);
    await page.setInputFiles('#files', pacotePath);
    await page.waitForSelector('.ficha');
    const n = await page.locator('.ficha').count();
    check(n === 31, `${label}: 31 fichas da onda 01 carregadas (${n})`);
    check(await page.locator('#onda').inputValue() === '1', `${label}: onda detectada pelo pacote`);
    check(await page.isDisabled('#btn-sign'), `${label}: assinatura bloqueada sem marcações`);
    const firstName = await page.locator('.ficha h2').first().textContent();
    check(!/za:/.test(firstName), `${label}: ficha mostra o nome da estrutura (${firstName.trim()})`);

    // Marca tudo; a 2ª ficha com ressalva (sem comentário primeiro: fica pendente).
    const cards = page.locator('.ficha');
    for (let i = 0; i < n; i++) await cards.nth(i).locator('button[data-decision="aprovar"]').click();
    await cards.nth(1).locator('button[data-decision="comentar"]').click();
    check(await page.isDisabled('#btn-sign'), `${label}: ressalva sem comentário mantém a assinatura bloqueada`);
    await cards.nth(1).locator('textarea').fill('Trocar "folhetos" por "cúspides".');
    check(!(await page.isDisabled('#btn-sign')), `${label}: 31/31 marcadas habilita a assinatura`);

    // Progresso salvo: recarrega e carrega de novo.
    await page.reload();
    await page.setInputFiles('#files', pacotePath);
    await page.waitForSelector('.ficha');
    check(!(await page.isDisabled('#btn-sign')), `${label}: marcações mantidas depois de recarregar`);

    await page.fill('#rev-nome', 'Revisora de Teste');
    await page.fill('#rev-registro', 'CRF-BA 0000');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-sign')]);
    check(dl.suggestedFilename() === 'revisao-onda-01.md', `${label}: baixa ${dl.suggestedFilename()}`);
    const md = fs.readFileSync(await dl.path(), 'utf8');
    check(isSigned(md) && /aprovado com ressalvas/.test(md), `${label}: .md passa na trava do build ("aprovado com ressalvas")`);
    check(/SHA-256\):\*\* [0-9a-f]{64}/.test(md) && /folhetos/.test(md), `${label}: .md traz o hash do conteúdo e a ressalva`);

    await page.evaluate(AXE); // evaluate (CDP) não passa pela CSP da página
    const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations
      .filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id} (${x.nodes.length})`));
    check(v.length === 0, `${label}: axe sem violações sérias${v.length ? ': ' + v.join(', ') : ''}`);
    check(app.calls.external.length === 0, `${label}: nenhuma requisição externa`);
    check(app.errors.length === 0, `${label}: sem erros de JavaScript${app.errors.length ? ': ' + app.errors.join(' | ') : ''}`);
  } finally {
    await app.close();
  }
}

module.exports = async function atlasRevisao() {
  const { buildPacote } = await import('../atlas/pacote-onda.mjs');
  const { isSigned } = await import('../atlas/check-curated-signed.mjs');
  const pacotePath = path.join(os.tmpdir(), `pacote-onda-01-${process.pid}.json`);
  fs.writeFileSync(pacotePath, JSON.stringify(buildPacote(1)));
  try {
    await runAt({ width: 1280, height: 800 }, pacotePath, isSigned);
    await runAt({ width: 390, height: 844 }, pacotePath, isSigned);
  } finally {
    fs.rmSync(pacotePath, { force: true });
  }
};
