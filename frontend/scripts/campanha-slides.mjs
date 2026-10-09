/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Gera os slides PNG 1080x1350 do carrossel da campanha (Instagram).
// Uso: node scripts/campanha-slides.mjs [caminho/slides.json]
// Padrão: ../docs/campanhas/outubro-rosa/instagram/slides.json. Os PNG vão para a mesma pasta do JSON.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPTS_DIR, '..');
const LOGO_PATH = path.join(FRONTEND_DIR, 'modulos', 'cracha', 'laift-marca.png');
const JSON_PADRAO = path.resolve(FRONTEND_DIR, '..', 'docs', 'campanhas', 'outubro-rosa', 'instagram', 'slides.json');
const LARGURA = 1080;
const ALTURA = 1350;
const FONTE_INICIAL = { titulo: 72, corpo: 40 };
const FONTE_MINIMA = { titulo: 64, corpo: 30 };
const PASSO_PX = 2;
const TIPOS = new Set(['capa', 'texto', 'numero', 'lista', 'mitos', 'habitos', 'fecho']);
const TIPOS_COM_ITENS = new Set(['lista', 'mitos', 'habitos']);
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const PREFIXO_ROTULO = /^([^:]{1,40}):\s*([\s\S]*)$/;
const PREFIXO_EMOJI = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*([\s\S]*)$/u;
const SISTEMA = 'system-ui, "Segoe UI", Roboto, sans-serif';
const FONTE_EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';

const CSS = `
:root { --bg: #fafaf7; --tinta: #1c2333; --apoio: #5b6478; --acento: #a61d56; --suave: #fce7f3; --verde: #0b5349;
  --fs-titulo: 72px; --fs-corpo: 40px; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${LARGURA}px; height: ${ALTURA}px; overflow: hidden; background: var(--bg); }
body { font-family: ${SISTEMA}; color: var(--tinta); }
.slide { position: relative; width: ${LARGURA}px; height: ${ALTURA}px; padding: 80px; display: flex; flex-direction: column;
  overflow: hidden; background: var(--bg); }
.slide::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 16px; background: var(--acento); }
.topo { display: flex; align-items: center; min-height: 144px; padding-top: 8px; }
.placa { background: #ffffff; border-radius: 20px; padding: 12px; }
.placa img { display: block; height: 120px; width: 120px; }
.conteudo { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 32px; overflow: hidden; }
.titulo { font-size: var(--fs-titulo); line-height: 1.15; font-weight: 800; overflow-wrap: break-word; }
.corpo { font-size: var(--fs-corpo); line-height: 1.35; font-weight: 500; overflow-wrap: break-word; }
.rodape-area { display: flex; flex-direction: column; gap: 12px; margin-top: 32px; padding-top: 20px; border-top: 4px solid var(--verde); }
.fonte, .linha-rodape { font-size: 28px; line-height: 1.3; font-weight: 600; color: var(--apoio); }
.linha-rodape { display: flex; justify-content: space-between; gap: 24px; }
.itens { list-style: none; display: flex; flex-direction: column; gap: 18px; }
.item { display: flex; align-items: flex-start; gap: 24px; }
.item > .corpo { flex: 1; min-width: 0; }
.marca { flex: 0 0 auto; width: 28px; height: 28px; margin-top: 12px; border-radius: 50%; background: var(--verde); }
.marca-mito { background: var(--acento); }
.prefixo-mito, .prefixo-fontes { font-weight: 800; }
.prefixo-mito { color: var(--acento); }
.prefixo-fontes { color: var(--verde); }
.icone { flex: 0 0 auto; width: 84px; height: 84px; border-radius: 50%; background: var(--suave); display: flex;
  align-items: center; justify-content: center; font-size: 44px; font-family: ${FONTE_EMOJI}, sans-serif; }
.numero-bloco { display: flex; flex-direction: column; gap: 12px; border-left: 12px solid var(--verde); padding-left: 32px; }
.numero { font-size: 230px; font-weight: 900; line-height: 1; color: var(--acento); letter-spacing: -0.02em; }
.rotulo { font-weight: 700; }
.tipo-capa { background: var(--suave); }
.tipo-capa .titulo { font-size: calc(var(--fs-titulo) + 24px); }
.tipo-fecho { background: var(--acento); color: #ffffff; }
.tipo-fecho::before { background: #ffffff; }
.tipo-fecho .titulo, .tipo-fecho .corpo, .tipo-fecho .fonte, .tipo-fecho .linha-rodape { color: #ffffff; }
.tipo-fecho .rodape-area { border-top-color: #ffffff; }
`;

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function validarSlide(s) {
  if (!TIPOS.has(s.tipo) || !s.titulo) throw new Error(`slide ${s.n}: tipo ou titulo inválido`);
  if (s.tipo === 'numero' && !s.numero) throw new Error(`slide ${s.n}: falta "numero"`);
  if (TIPOS_COM_ITENS.has(s.tipo) && !(s.itens && s.itens.length)) throw new Error(`slide ${s.n}: falta "itens"`);
}

function validarDados(dados) {
  if (dados.tamanho && (dados.tamanho[0] !== LARGURA || dados.tamanho[1] !== ALTURA)) {
    throw new Error(`tamanho fixo ${LARGURA}x${ALTURA}, JSON pede ${dados.tamanho.join('x')}`);
  }
  if (!Array.isArray(dados.slides) || dados.slides.length === 0) throw new Error('slides.json sem "slides"');
  dados.slides.forEach(validarSlide);
}

function logoUri() {
  return `data:image/png;base64,${readFileSync(LOGO_PATH).toString('base64')}`;
}

function itemLista(texto) {
  return `<li class="item"><span class="marca" aria-hidden="true"></span><span class="corpo ajustavel">${esc(texto)}</span></li>`;
}

function itemMito(texto) {
  const m = texto.match(PREFIXO_ROTULO);
  if (!m) return itemLista(texto);
  const tipo = m[1] === 'Mito' ? 'mito' : 'fontes';
  return `<li class="item"><span class="marca marca-${tipo}" aria-hidden="true"></span>`
    + `<span class="corpo ajustavel"><strong class="prefixo-${tipo}">${esc(m[1])}:</strong> ${esc(m[2])}</span></li>`;
}

function itemHabito(texto) {
  const m = texto.match(PREFIXO_EMOJI);
  const icone = m ? `<span class="icone" aria-hidden="true">${esc(m[1])}</span>` : '';
  return `<li class="item">${icone}<span class="corpo ajustavel">${esc(m ? m[2] : texto)}</span></li>`;
}

const RENDER_ITEM = { lista: itemLista, mitos: itemMito, habitos: itemHabito };

function itensHtml(slide) {
  const render = RENDER_ITEM[slide.tipo];
  return `<ul class="itens">${slide.itens.map((t) => render(String(t))).join('')}</ul>`;
}

function blocoNumero(slide) {
  const rotulo = slide.numeroRotulo ? `<p class="corpo rotulo ajustavel">${esc(slide.numeroRotulo)}</p>` : '';
  return `<div class="numero-bloco"><p class="numero ajustavel">${esc(slide.numero)}</p>${rotulo}</div>`;
}

function corpoHtml(slide) {
  const partes = [`<h1 class="titulo ajustavel">${esc(slide.titulo)}</h1>`];
  if (slide.texto) partes.push(`<p class="corpo ajustavel">${esc(slide.texto)}</p>`);
  if (slide.tipo === 'numero') partes.push(blocoNumero(slide));
  if (TIPOS_COM_ITENS.has(slide.tipo)) partes.push(itensHtml(slide));
  return partes.join('');
}

function rodapeHtml(slide, total, rodape) {
  const fonte = slide.fonte ? `<p class="fonte">Fonte: ${esc(slide.fonte)}</p>` : '';
  return `<footer class="rodape-area">${fonte}`
    + `<div class="linha-rodape"><span>${esc(rodape)}</span><span>${slide.n}/${total}</span></div></footer>`;
}

function montarHtml(slide, total, ctx) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(slide.titulo)}</title><style>${CSS}</style></head>
<body><section class="slide tipo-${esc(slide.tipo)}">
<header class="topo"><div class="placa"><img src="${ctx.logo}" alt="LAIFT"></div></header>
<div class="conteudo">${corpoHtml(slide)}</div>
${rodapeHtml(slide, total, ctx.rodape)}
</section></body></html>`;
}

// Roda no navegador: define os tamanhos por variável CSS (sem style="" e sem innerHTML).
function aplicarTamanhos(tam) {
  const estilo = document.documentElement.style;
  estilo.setProperty('--fs-titulo', `${tam.titulo}px`);
  estilo.setProperty('--fs-corpo', `${tam.corpo}px`);
}

// Roda no navegador: true se algum bloco sai da área do conteúdo ou se o texto estoura a largura.
function medirEstouro() {
  const area = document.querySelector('.conteudo');
  const limite = area.getBoundingClientRect();
  const fora = (el) => {
    const r = el.getBoundingClientRect();
    return r.top < limite.top - 0.5 || r.bottom > limite.bottom + 0.5 || el.scrollWidth > el.clientWidth + 1;
  };
  const blocos = Array.from(area.querySelectorAll('.ajustavel'));
  return area.scrollHeight > area.clientHeight + 1 || blocos.some(fora);
}

function passosDeFonte() {
  const passos = [];
  for (let corpo = FONTE_INICIAL.corpo; corpo >= FONTE_MINIMA.corpo; corpo -= PASSO_PX) {
    const reducao = FONTE_INICIAL.corpo - corpo;
    passos.push({ corpo, titulo: Math.max(FONTE_MINIMA.titulo, FONTE_INICIAL.titulo - reducao) });
  }
  return passos;
}

async function ajustarFonte(page, n) {
  for (const tam of passosDeFonte()) {
    await page.evaluate(aplicarTamanhos, tam);
    if (!(await page.evaluate(medirEstouro))) return tam;
  }
  throw new Error(`slide ${n}: o texto não cabe nem com a fonte mínima`);
}

async function renderizarSlide(page, slide, total, ctx) {
  await page.setContent(montarHtml(slide, total, ctx), { waitUntil: 'load' });
  const tam = await ajustarFonte(page, slide.n);
  if (tam.corpo !== FONTE_INICIAL.corpo) console.log(`slide ${slide.n}: fonte reduzida para ${tam.corpo}px`);
  const arquivo = path.join(ctx.pasta, `slide-${String(slide.n).padStart(2, '0')}.png`);
  await page.screenshot({ path: arquivo, clip: { x: 0, y: 0, width: LARGURA, height: ALTURA } });
  return arquivo;
}

async function abrirPagina(browser) {
  const page = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 1 });
  await page.route(/^https?:\/\//, (rota) => rota.abort());
  return page;
}

async function main() {
  const entrada = path.resolve(process.argv[2] || JSON_PADRAO);
  const pasta = path.dirname(entrada);
  const dados = JSON.parse(readFileSync(entrada, 'utf8'));
  validarDados(dados);
  const ctx = { pasta, logo: logoUri(), rodape: dados.rodape || '' };
  const browser = await chromium.launch();
  try {
    const page = await abrirPagina(browser);
    for (const slide of dados.slides) {
      await renderizarSlide(page, slide, dados.slides.length, ctx);
    }
  } finally {
    await browser.close();
  }
  console.log(`${dados.slides.length} slides gerados em ${pasta}`);
}

main().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
