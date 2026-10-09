/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * capturas-identidade.js — capturas da identidade digital da Liga para o portão visual do dono.
 * Não é cenário da suíte (não termina em .e2e.js). Roda sobre o BUILD (frontend/dist/):
 *   cd frontend && node scripts/e2e/capturas-identidade.js
 * Grava os PNGs em docs/identidade/capturas/, as duas folhas de contato (claro e escuro) e imprime a lista.
 */
const fs = require('fs');
const path = require('path');
const { startApp } = require('./harness');

const SAIDA = path.join(__dirname, '..', '..', '..', 'docs', 'identidade', 'capturas');
const CELULAR = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 900 };
const TEMPO_MAX_SPLASH_MS = 3000;
const LARGURA_FOLHA_PX = 300;
const LARGURA_PAGINA_FOLHA = 1400;

/** tela: 'pagina' = página inteira; 'primeira' = só a primeira tela; CSS = elemento. flag: selection_open (liga e processo). */
const ESPECIFICACOES = [
  { arquivo: 'liga-375-claro.png', destino: 'liga.html', viewport: CELULAR, esquema: 'light', flag: true, tela: 'pagina' },
  { arquivo: 'liga-375-escuro.png', destino: 'liga.html', viewport: CELULAR, esquema: 'dark', flag: true, tela: 'pagina' },
  { arquivo: 'liga-1280-claro.png', destino: 'liga.html', viewport: DESKTOP, esquema: 'light', flag: true, tela: 'pagina' },
  { arquivo: 'liga-1280-escuro.png', destino: 'liga.html', viewport: DESKTOP, esquema: 'dark', flag: true, tela: 'pagina' },
  { arquivo: 'instituicao-375-claro.png', destino: 'liga.html', viewport: CELULAR, esquema: 'light', flag: true, tela: '#instituicao' },
  { arquivo: 'processo-375-claro.png', destino: 'processo-seletivo.html', viewport: CELULAR, esquema: 'light', flag: true, tela: 'pagina' },
  { arquivo: 'processo-375-escuro.png', destino: 'processo-seletivo.html', viewport: CELULAR, esquema: 'dark', flag: false, tela: 'pagina' },
  { arquivo: 'processo-1280-claro.png', destino: 'processo-seletivo.html', viewport: DESKTOP, esquema: 'light', flag: true, tela: 'pagina' },
  { arquivo: 'processo-1280-escuro.png', destino: 'processo-seletivo.html', viewport: DESKTOP, esquema: 'dark', flag: false, tela: 'pagina' },
  { arquivo: 'edital-375-claro.png', destino: 'edital.html', viewport: CELULAR, esquema: 'light', tela: 'pagina' },
  { arquivo: 'edital-1280-escuro.png', destino: 'edital.html', viewport: DESKTOP, esquema: 'dark', tela: 'pagina' },
  { arquivo: 'blog-375-claro.png', destino: 'blog.html', viewport: CELULAR, esquema: 'light', tela: 'primeira' },
  { arquivo: 'blog-375-escuro.png', destino: 'blog.html', viewport: CELULAR, esquema: 'dark', tela: 'primeira' },
  { arquivo: 'blog-1280-claro.png', destino: 'blog.html', viewport: DESKTOP, esquema: 'light', tela: 'primeira' },
  { arquivo: 'blog-1280-escuro.png', destino: 'blog.html', viewport: DESKTOP, esquema: 'dark', tela: 'primeira' },
  { arquivo: 'inicio-375-claro.png', destino: '', viewport: CELULAR, esquema: 'light', tela: 'pagina' },
  { arquivo: 'inicio-375-escuro.png', destino: '', viewport: CELULAR, esquema: 'dark', tela: 'pagina' },
  { arquivo: 'app-voltar-375-claro.png', logado: true, viewport: CELULAR, esquema: 'light', tela: 'primeira' },
  { arquivo: 'app-voltar-1280-escuro.png', logado: true, viewport: DESKTOP, esquema: 'dark', tela: 'primeira' },
];

/** Resposta do Worker com a flag selection_open do cenário; sem flag, o harness responde o padrão. */
function trabalhadorDoCenario(flag) {
  if (flag === undefined) return {};
  return { apiGetFeatureFlags: () => ({ success: true, flags: { selection_open: flag } }) };
}

/** Espera a rede assentar e a splash do blog (se houver) sair. */
async function assentar(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#welcome', { state: 'detached', timeout: TEMPO_MAX_SPLASH_MS });
  await page.waitForLoadState('networkidle');
}

/**
 * Só para a captura de página inteira ou de elemento: barras fixas e sticky (barra do topo, faixa de seções,
 * barra de ação do processo) viram estáticas, para não aparecerem no meio do texto. Usa CSSOM (sem atributo style).
 */
async function neutralizarFixos(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const posicao = getComputedStyle(el).position;
      if (posicao === 'fixed' || posicao === 'sticky') el.style.setProperty('position', 'static', 'important');
    }
  });
}

/** Abre a tela do cenário e devolve o PNG (Buffer). */
async function capturar(spec) {
  const app = await startApp({
    viewport: spec.viewport,
    theme: spec.esquema === 'dark' ? 'dark' : 'light',
    workerHandlers: trabalhadorDoCenario(spec.flag),
  });
  try {
    await app.page.emulateMedia({ colorScheme: spec.esquema });
    if (spec.logado) {
      await app.login();
      await app.showPanel('panel-events');
    } else {
      await app.page.goto(app.baseUrl + spec.destino);
    }
    await assentar(app.page);
    const opcoes = { animations: 'disabled', caret: 'hide' };
    if (spec.tela === 'primeira') return await app.page.screenshot(opcoes);
    await neutralizarFixos(app.page);
    if (spec.tela.startsWith('#')) return await app.page.locator(spec.tela).screenshot(opcoes);
    return await app.page.screenshot({ ...opcoes, fullPage: true });
  } finally {
    await app.close();
  }
}

/** Página de folha de contato: cada captura reduzida a 300 px de largura, com o nome embaixo. Só local. */
function montarFolha(titulo, fundo, texto, cartoes) {
  const figuras = cartoes.map(({ arquivo, png }) => `<figure><img src="data:image/png;base64,${png.toString('base64')}" alt="${arquivo}"><figcaption>${arquivo}</figcaption></figure>`).join('\n');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>
  body { margin: 0; padding: 24px; background: ${fundo}; color: ${texto}; font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  .folha { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
  figure { margin: 0; width: ${LARGURA_FOLHA_PX}px; }
  img { display: block; width: ${LARGURA_FOLHA_PX}px; height: auto; border: 1px solid #888; }
  figcaption { margin-top: 6px; font-size: 13px; word-break: break-all; }
</style>
</head>
<body>
<h1>${titulo}</h1>
<div class="folha">
${figuras}
</div>
</body>
</html>`;
}

/** Grava a folha como PNG de página inteira, com o navegador do harness. */
async function gravarFolha(nome, html) {
  const app = await startApp({ viewport: { width: LARGURA_PAGINA_FOLHA, height: 900 } });
  try {
    await app.page.setContent(html, { waitUntil: 'load' });
    await app.page.evaluate(() => Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => null))));
    const destino = path.join(SAIDA, nome);
    await app.page.screenshot({ path: destino, fullPage: true });
    return destino;
  } finally {
    await app.close();
  }
}

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const cartoes = [];
  for (const spec of ESPECIFICACOES) {
    const png = await capturar(spec);
    fs.writeFileSync(path.join(SAIDA, spec.arquivo), png);
    cartoes.push({ arquivo: spec.arquivo, esquema: spec.esquema, png });
  }
  const claros = cartoes.filter((c) => c.esquema === 'light');
  const escuros = cartoes.filter((c) => c.esquema === 'dark');
  const gravadas = [];
  gravadas.push(await gravarFolha('folha-claro.png', montarFolha('Folha de contato · tema claro', '#ffffff', '#1d1d1b', claros)));
  gravadas.push(await gravarFolha('folha-escuro.png', montarFolha('Folha de contato · tema escuro', '#111418', '#f1f1ee', escuros)));
  for (const spec of ESPECIFICACOES) gravadas.push(path.join(SAIDA, spec.arquivo));
  console.log(`Capturas gravadas (${gravadas.length}) em ${SAIDA}:`);
  for (const arquivo of gravadas) console.log(`  ${path.basename(arquivo)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { ESPECIFICACOES };
