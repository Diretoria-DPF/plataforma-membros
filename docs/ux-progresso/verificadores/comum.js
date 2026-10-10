/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Base dos verificadores de docs/ux-progresso (não faz parte do deploy).
// Serve frontend/ DIRETO DA FONTE (sem build, sem tocar em frontend/dist); o blog é gerado
// por scripts/build-blog.js numa pasta temporária. Simula a Worker (só apiGetFeatureFlags
// responde) e aborta qualquer outro host. Escreve só em docs/ux-progresso/capturas/.
// LAIFT_SOBREPOSICAO (só para o orquestrador ensaiar o contrato): pasta cujos arquivos têm
// prioridade sobre os de frontend/ (mesmos caminhos relativos), inclusive scripts/build-blog.js.
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const FRONT = path.join(RAIZ, 'frontend');
const SOBRE = process.env.LAIFT_SOBREPOSICAO ? path.resolve(process.env.LAIFT_SOBREPOSICAO) : null;
const CAPTURAS = path.join(__dirname, '..', 'capturas');
const { chromium } = require(path.join(FRONT, 'node_modules', 'playwright'));

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

/** Caminho do arquivo: primeiro a sobreposição (ensaio), depois frontend/. */
function caminho(relativo) {
  if (SOBRE) {
    const s = path.join(SOBRE, relativo);
    if (s.startsWith(SOBRE) && fs.existsSync(s) && fs.statSync(s).isFile()) return s;
  }
  const f = path.join(FRONT, relativo);
  return f.startsWith(FRONT) ? f : null;
}

function lerFonte(relativo) {
  const arquivo = caminho(relativo);
  return arquivo && fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '';
}

/** Arquivo a partir da RAIZ (ex.: docs/...); no ensaio, a sobreposição usa a subpasta _raiz/. */
function lerRaiz(relativo) {
  const ensaio = SOBRE ? path.join(SOBRE, '_raiz', relativo) : null;
  const arquivo = ensaio && fs.existsSync(ensaio) ? ensaio : path.join(RAIZ, relativo);
  return fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '';
}

function gerador() {
  return require(caminho(path.join('scripts', 'build-blog.js')));
}

function gerarBlog() {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'laift-ux-progresso-'));
  const resultado = gerador().build({
    outDir: saida, srcDir: path.join(FRONT, 'blog', 'conteudo'), siteFile: path.join(FRONT, 'blog', 'site.json'),
  });
  return { saida, pasta: path.join(saida, 'blog'), indice: resultado.indice };
}

function arquivoDe(urlPath, blog) {
  const limpo = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (limpo.startsWith('/blog/')) {
    const gerado = path.join(blog.pasta, limpo.slice('/blog/'.length));
    if (gerado.startsWith(blog.pasta) && fs.existsSync(gerado) && fs.statSync(gerado).isFile()) return gerado;
  }
  return caminho(limpo === '/' ? 'index.html' : limpo.slice(1));
}

function servidor(blog) {
  const srv = http.createServer((req, res) => {
    const arquivo = arquivoDe(req.url, blog);
    if (!arquivo || !fs.existsSync(arquivo) || !fs.statSync(arquivo).isFile()) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(arquivo).pipe(res);
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

/** Sobe servidor + Chromium. abrir(caminho, { largura, altura, tema, reduzido, flags, respostas, semStorage }); ctx.chamadas guarda as ações da Worker. */
async function iniciar() {
  const blog = gerarBlog();
  const srv = await servidor(blog);
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  fs.mkdirSync(CAPTURAS, { recursive: true });

  async function novoContexto(opcoes = {}) {
    const largura = opcoes.largura || 1280;
    const ctx = await browser.newContext({
      viewport: { width: largura, height: opcoes.altura || 800 }, isMobile: largura < 600, hasTouch: largura < 600,
      colorScheme: opcoes.tema || 'light', reducedMotion: opcoes.reduzido ? 'reduce' : 'no-preference', serviceWorkers: 'block',
    });
    ctx.chamadas = [];
    await ctx.addInitScript((semStorage) => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
      if (semStorage) {
        const falha = () => { throw new Error('armazenamento bloqueado'); };
        Storage.prototype.getItem = falha;
        Storage.prototype.setItem = falha;
      }
    }, !!opcoes.semStorage);
    await ctx.route('**/*', (route) => {
      const req = route.request();
      const url = req.url();
      if (url.startsWith(base)) return route.continue();
      if (url.includes('.workers.dev') || url.includes('api.laift.com.br')) {
        let corpo = {};
        try { corpo = JSON.parse(req.postData() || '{}'); } catch (e) { corpo = {}; }
        ctx.chamadas.push({ action: corpo.action, args: corpo.args });
        const extra = (opcoes.respostas || {})[corpo.action];
        const resposta = corpo.action === 'apiGetFeatureFlags' ? { success: true, flags: opcoes.flags || {} }
          : (extra || { success: false, message: 'verificador sem Worker' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resposta) });
      }
      return route.abort();
    });
    return ctx;
  }

  async function abrirNo(ctx, caminhoUrl) {
    const erros = [];
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { if (!IGNORAVEL.test(e.message)) erros.push(e.message); });
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORAVEL.test(m.text())) erros.push(m.text()); });
    await page.goto(base + caminhoUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('.splash', { state: 'detached', timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(300);
    return { page, erros };
  }

  async function abrir(caminhoUrl, opcoes = {}) {
    const ctx = await novoContexto(opcoes);
    const { page, erros } = await abrirNo(ctx, caminhoUrl);
    return { ctx, page, erros, fechar: () => ctx.close() };
  }

  async function fechar() {
    await browser.close();
    await new Promise((resolve) => srv.close(resolve));
    fs.rmSync(blog.saida, { recursive: true, force: true });
  }

  return { base, blog, abrir, abrirNo, novoContexto, fechar };
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
  const src = fs.readFileSync(path.join(FRONT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  await page.evaluate(src);
  return page.evaluate(() => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'],
  }).then((r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')})`)));
}

function captura(nome) {
  return path.join(CAPTURAS, `${nome}.png`);
}

const CABECALHO = '/*\n * Plataforma de Membros LAIFT\n * © 2026 Daniel Pires Francisco. Todos os direitos reservados.\n';

/** true se o texto começa com o cabeçalho de copyright (aceita CRLF). */
function temCabecalho(texto) {
  return texto.replace(/\r\n/g, '\n').startsWith(CABECALHO);
}

/** Encerra o verificador: código 1 se houve falha. */
function concluir(nome) {
  console.log(`\n${nome}: ${placar.ok} ok, ${placar.falhas.length} falha(s).`);
  if (placar.falhas.length) {
    placar.falhas.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

module.exports = { RAIZ, FRONT, iniciar, confere, contraste, axeSerio, captura, lerFonte, lerRaiz, temCabecalho, concluir };
