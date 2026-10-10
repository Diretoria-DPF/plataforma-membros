/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Verificador da ficha H1: endereço novo da instituição (UNINASSAU - Salvador, Rua dos Maçons, 364),
// coordenadas do OpenStreetMap, links de mapa, prédio com o número 364 e o edital.
// Uso, a partir da RAIZ do worktree: node docs/identidade/ajustes-2/verificadores/h1-endereco.js
// Gera instituicao-*.png em docs/identidade/ajustes-2/capturas/.
'use strict';

const path = require('path');
const v = require('./comum');

const LAT = '-12.995296';
const LON = '-38.452023';
const mapa = require(path.join(v.FRONT, 'liga-mapa.js'));
const URLS = mapa.urlsDoMapa(Number(LAT), Number(LON), 'UNINASSAU');
const ANTIGO = /Piedade|40070|98658|51689|Barris|\b358\b/;
const ENDERECO_EDITAL = '<p>Onde a Liga atua: UNINASSAU - Salvador, Rua dos Maçons, 364, Salvador-Bahia, 41810-205, Brasil.</p>';
const ENDERECO_LIGA = '<p class="lp-instituicao__endereco">Rua dos Maçons, 364<br>Salvador-Bahia, 41810-205<br>Brasil</p>';
const amp = (url) => url.replace(/&/g, '&amp;');

function estaticos() {
  console.log('\n▶ fonte');
  const liga = v.lerFonte('liga.html');
  const ld = JSON.parse(liga.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const local = ld.location || {};
  const end = local.address || {};
  for (const arquivo of ['liga.html', 'liga-mapa.js', 'edital.html', 'icons/predio-instituicao.svg', 'scripts/e2e/liga.e2e.js']) {
    v.confere(!ANTIGO.test(v.lerFonte(arquivo)), `${arquivo}: sem o endereço antigo (Piedade, 358, 40070-190, -12.98658/-38.51689)`);
  }
  v.confere(local.name === 'UNINASSAU - Salvador', `JSON-LD: location.name "UNINASSAU - Salvador" (achou "${local.name}")`);
  v.confere(end.streetAddress === 'Rua dos Maçons, 364' && end.addressLocality === 'Salvador' && end.addressRegion === 'BA'
    && end.postalCode === '41810-205' && end.addressCountry === 'BR', 'JSON-LD: PostalAddress Rua dos Maçons, 364 · Salvador · BA · 41810-205 · BR');
  v.confere(local.geo && String(local.geo.latitude) === LAT && String(local.geo.longitude) === LON, `JSON-LD: geo ${LAT}, ${LON}`);
  v.confere(liga.includes('<p class="lp-instituicao__sigla">UNINASSAU - Salvador</p>'), 'liga.html: sigla "UNINASSAU - Salvador"');
  v.confere(liga.includes(ENDERECO_LIGA), 'liga.html: endereço "Rua dos Maçons, 364 / Salvador-Bahia, 41810-205 / Brasil"');
  v.confere(liga.includes('com o número 364 na entrada"') && !liga.includes('quatro andares'), 'liga.html: alt do prédio com 364 e sem "quatro andares"');
  v.confere(liga.includes(`data-lat="${LAT}" data-lon="${LON}"`), `liga.html: data-lat/data-lon ${LAT}/${LON}`);
  for (const chave of ['geo', 'google', 'apple', 'osm']) {
    v.confere(liga.includes(`href="${amp(URLS[chave])}"`), `liga.html: link ${chave} = ${URLS[chave]}`);
  }
  const js = v.lerFonte('liga-mapa.js');
  v.confere(js.includes("var TITULO_FRAME = 'Mapa do OpenStreetMap: UNINASSAU - Salvador, Rua dos Maçons, 364, Salvador-Bahia';"), 'liga-mapa.js: TITULO_FRAME novo');
  v.confere(v.lerFonte('edital.html').includes(ENDERECO_EDITAL), 'edital.html: "Onde a Liga atua" com o endereço do dono');
  const svg = v.lerFonte('icons/predio-instituicao.svg');
  v.confere(/>364<\/text>/.test(svg) && svg.includes('o número 364 na entrada.</desc>') && !svg.includes('quatro andares'), 'predio-instituicao.svg: placa 364 e <desc> novo');
  const e2e = v.lerFonte('scripts/e2e/liga.e2e.js');
  v.confere(e2e.includes("'Rua dos Maçons, 364'") && e2e.includes("const SELOS_NOVIDADE = ['Nova publicação no blog', ''];"), 'liga.e2e.js: endereço novo e selos atualizados');
  v.confere(e2e.includes('.blog-novidade__capa svg use'), 'liga.e2e.js: confere a miniatura dos cartões do blog');
}

async function pagina(app, largura, tema) {
  const onde = `liga.html ${tema === 'dark' ? 'escuro' : 'claro'}/${largura}`;
  console.log(`\n▶ ${onde}`);
  const { page, erros, fechar } = await app.abrir('liga.html', { largura, tema, altura: largura < 600 ? 812 : 900 });
  try {
    const texto = (await page.locator('#instituicao').textContent()) || '';
    v.confere(texto.includes('UNINASSAU - Salvador') && texto.includes('Rua dos Maçons, 364') && texto.includes('Salvador-Bahia, 41810') && texto.includes('Brasil'),
      `${onde}: #instituicao mostra UNINASSAU - Salvador, Rua dos Maçons, 364, Salvador-Bahia, 41810-205, Brasil`);
    const predio = await page.locator('img.lp-instituicao__predio').evaluate((img) => img.complete && img.naturalWidth > 0);
    v.confere(predio, `${onde}: prédio carregado`);
    const app1 = await page.getAttribute('a[data-mapa-app]', 'href');
    v.confere(app1 === URLS.google, `${onde}: "Abrir no app de mapas" no desktop/Chromium → Google Maps (${app1})`);
    await page.locator('.lp-mapa__carregar').click();
    const frame = await page.getAttribute('iframe.lp-mapa__frame', 'src');
    const titulo = await page.getAttribute('iframe.lp-mapa__frame', 'title');
    v.confere(frame === URLS.embed, `${onde}: mapa embutido com bbox do novo endereço (${frame})`);
    v.confere(titulo === 'Mapa do OpenStreetMap: UNINASSAU - Salvador, Rua dos Maçons, 364, Salvador-Bahia', `${onde}: title do iframe`);
    v.confere((await page.evaluate(() => window.__csp)).length === 0 && erros.length === 0, `${onde}: sem CSP violada nem erro de JS (${erros.join(' | ')})`);
    await page.locator('#instituicao').screenshot({ path: v.captura(`instituicao-${tema === 'dark' ? 'escuro' : 'claro'}-${largura}`) });
  } finally {
    await fechar();
  }
}

async function predio(app) {
  console.log('\n▶ icons/predio-instituicao.svg');
  const { page, fechar } = await app.abrir('icons/predio-instituicao.svg', { largura: 400, altura: 400 });
  try {
    const textos = await page.evaluate(() => Array.from(document.querySelectorAll('text')).map((t) => t.textContent.trim()));
    v.confere(JSON.stringify(textos) === JSON.stringify(['UNINASSAU', '364']), `SVG válido com os textos UNINASSAU e 364 (achou ${JSON.stringify(textos)})`);
  } finally {
    await fechar();
  }
}

(async () => {
  estaticos();
  const app = await v.iniciar();
  try {
    await predio(app);
    await pagina(app, 375, 'light');
    await pagina(app, 1280, 'dark');
  } finally {
    await app.fechar();
  }
  v.concluir('H1 endereço');
})().catch((e) => { console.error(e); process.exitCode = 1; });
