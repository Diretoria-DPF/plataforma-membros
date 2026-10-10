/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Base dos verificadores de docs/identidade/ajustes-2 (não faz parte do deploy).
// Serve frontend/ DIRETO DA FONTE (sem build, sem tocar em frontend/dist): o blog
// (posts e blog/index.json) é gerado por scripts/build-blog.js numa pasta temporária.
// Simula a Worker (só apiGetFeatureFlags responde com sucesso) e aborta qualquer
// outro host. Uso: const v = require('./comum'); ver s1-entrada.js, s2-blog.js, h1-endereco.js.
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
// LAIFT_FRONT: outra cópia de frontend/ (só para ensaiar o contrato); o padrão é RAIZ/frontend.
const FRONT = process.env.LAIFT_FRONT ? path.resolve(process.env.LAIFT_FRONT) : path.join(RAIZ, 'frontend');
const MODULOS_NODE = path.join(RAIZ, 'frontend', 'node_modules');
const CAPTURAS = process.env.LAIFT_CAPTURAS ? path.resolve(process.env.LAIFT_CAPTURAS) : path.join(__dirname, '..', 'capturas');
const { chromium } = require(path.join(MODULOS_NODE, 'playwright'));
const geradorBlog = require(path.join(FRONT, 'scripts', 'build-blog.js'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8',
};
const IGNORAVEL = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b|net::ERR_FAILED|Failed to load resource/;

const placar = { ok: 0, falhas: [] };

function confere(condicao, descricao) {
  if (condicao) { placar.ok += 1; console.log(`  ✔ ${descricao}`); return true; }
  placar.falhas.push(descricao);
  console.log(`  ✘ ${descricao}`);
  return false;
}

/** Gera posts e índice do blog numa pasta temporária (mesmo gerador do build). */
function gerarBlog() {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'laift-ajustes2-'));
  const resultado = geradorBlog.build({ outDir: saida });
  return { saida, pasta: path.join(saida, 'blog'), indice: resultado.indice };
}

function arquivoDe(urlPath, blogGerado) {
  const limpo = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (limpo.startsWith('/blog/')) {
    const gerado = path.join(blogGerado.pasta, limpo.slice('/blog/'.length));
    if (gerado.startsWith(blogGerado.pasta) && fs.existsSync(gerado) && fs.statSync(gerado).isFile()) return gerado;
  }
  const alvo = path.join(FRONT, limpo === '/' ? '/index.html' : limpo);
  return alvo.startsWith(FRONT) ? alvo : null;
}

function servidor(blogGerado) {
  const srv = http.createServer((req, res) => {
    const arquivo = arquivoDe(req.url, blogGerado);
    if (!arquivo || !fs.existsSync(arquivo) || !fs.statSync(arquivo).isFile()) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(arquivo).pipe(res);
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

/** Sobe servidor + Chromium. Devolve { base, blog, abrir, fechar }. */
async function iniciar() {
  const blog = gerarBlog();
  const srv = await servidor(blog);
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  fs.mkdirSync(CAPTURAS, { recursive: true });

  /** Abre uma página. opcoes: { largura, altura, tema, reduzido, flags }. */
  async function abrir(caminho, opcoes = {}) {
    const largura = opcoes.largura || 1280;
    const ctx = await browser.newContext({
      viewport: { width: largura, height: opcoes.altura || 800 }, isMobile: largura < 600, hasTouch: largura < 600,
      colorScheme: opcoes.tema || 'light', reducedMotion: opcoes.reduzido ? 'reduce' : 'no-preference', serviceWorkers: 'block',
    });
    const erros = [];
    const respostas = [];
    await ctx.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    await ctx.route('**/*', (route) => {
      const req = route.request();
      const url = req.url();
      if (url.startsWith(base)) return route.continue();
      if (url.includes('.workers.dev') || url.includes('api.laift.com.br')) {
        let corpo = {};
        try { corpo = JSON.parse(req.postData() || '{}'); } catch (e) { corpo = {}; }
        const resposta = corpo.action === 'apiGetFeatureFlags'
          ? { success: true, flags: opcoes.flags || {} } : { success: false, message: 'verificador sem Worker' };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resposta) });
      }
      return route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { if (!IGNORAVEL.test(e.message)) erros.push(e.message); });
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORAVEL.test(m.text())) erros.push(m.text()); });
    page.on('response', (r) => respostas.push({ url: r.url(), status: r.status() }));
    await page.goto(base + caminho, { waitUntil: 'networkidle' });
    await page.waitForSelector('.splash', { state: 'detached', timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(400);
    return { ctx, page, erros, respostas, fechar: () => ctx.close() };
  }

  async function fechar() {
    await browser.close();
    await new Promise((resolve) => srv.close(resolve));
    fs.rmSync(blog.saida, { recursive: true, force: true });
  }

  return { base, blog, abrir, fechar };
}

/** Retângulo [x, y, largura, altura] (coordenadas da página) ou null se oculto. */
async function caixa(page, seletor) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, b: r.bottom + scrollY, d: r.right + scrollX };
  }, seletor);
}

/** true se as caixas se cruzam (com folga mínima em px). */
function cruzam(a, b, folga = 0) {
  if (!a || !b) return false;
  return a.x < b.d + folga && b.x < a.d + folga && a.y < b.b + folga && b.y < a.b + folga;
}

function luminancia(rgb) {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre duas cores "rgb(r, g, b)". */
function contraste(cor1, cor2) {
  const num = (c) => (c.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  const [l1, l2] = [luminancia(num(cor1)), luminancia(num(cor2))].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Violações axe sérias/críticas (WCAG A/AA) da página. */
async function axeSerio(page) {
  const src = fs.readFileSync(path.join(MODULOS_NODE, 'axe-core', 'axe.min.js'), 'utf8');
  await page.evaluate(src);
  return page.evaluate(() => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'],
  }).then((r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')})`)));
}

function captura(nome) {
  return path.join(CAPTURAS, `${nome}.png`);
}

function lerFonte(relativo) {
  return fs.readFileSync(path.join(FRONT, relativo), 'utf8');
}

/** Encerra o verificador: código 1 se houve falha. */
function concluir(nome) {
  console.log(`\n${nome}: ${placar.ok} ok, ${placar.falhas.length} falha(s).`);
  if (placar.falhas.length) {
    placar.falhas.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

module.exports = {
  RAIZ, FRONT, CAPTURAS, iniciar, confere, caixa, cruzam, contraste, axeSerio, captura, lerFonte, concluir, geradorBlog,
};
