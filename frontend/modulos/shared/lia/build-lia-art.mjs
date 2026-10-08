#!/usr/bin/env node
/*
 * Gera lia-art.js a partir de lia.svg e lia-props-art.js a partir de lia-props.svg (ADR 0003, Onda 2).
 * Por que: a CSP do site nao permite fetch do SVG, entao a arte vai embutida
 * em JS como arvore de dados ({tag, attrs, children}), nunca como string de
 * marcacao. O mount (lia.js) recria os nos com createElementNS.
 * Uso: node frontend/modulos/shared/lia/build-lia-art.mjs
 * Idempotente: lia.svg sem mudanca => lia-art.js sem mudanca.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Elementos permitidos na arte. Qualquer outro (script, foreignObject, style...) falha a geracao.
const TAGS = ['defs', 'g', 'path', 'rect', 'circle', 'ellipse', 'use'];
const MAX_DEPTH = 12;
// Um token por vez, sem pular trecho: texto solto, entidade ou CDATA falham.
const TOKEN = /\s*(?:<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([A-Za-z][\w:-]*)\s*>|<([A-Za-z][\w:-]*)((?:\s+[A-Za-z_:][\w:.-]*="[^"&<]*")*)\s*(\/?)>)/y;
const ATTR = /([A-Za-z_:][\w:.-]*)="([^"&<]*)"/g;

function parseAttrs(raw) {
  const attrs = {};
  for (const [, name, value] of raw.matchAll(ATTR)) {
    if (Object.hasOwn(attrs, name)) throw new Error(`lia.svg: atributo "${name}" repetido`);
    attrs[name] = value;
  }
  return attrs;
}

function tokenize(xml) {
  const tokens = [];
  let pos = 0;
  for (;;) {
    TOKEN.lastIndex = pos;
    const match = TOKEN.exec(xml);
    if (!match) {
      if (xml.slice(pos).trim() === '') return tokens;
      throw new Error(`lia.svg: trecho nao suportado na posicao ${pos}`);
    }
    pos = TOKEN.lastIndex;
    tokens.push(match);
  }
}

function buildTree(xml) {
  const root = { tag: '#document', attrs: {}, children: [] };
  const stack = [root];
  for (const match of tokenize(xml)) {
    const [, close, open, rawAttrs, selfClose] = match;
    if (!open && !close) continue; // comentario ou instrucao de processamento
    if (close) {
      const node = stack.pop();
      if (stack.length === 0 || node.tag !== close) throw new Error(`lia.svg: </${close}> sem abertura correspondente`);
      continue;
    }
    const node = { tag: open, attrs: parseAttrs(rawAttrs), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  if (stack.length !== 1) throw new Error('lia.svg: elemento sem fechamento');
  return root;
}

function assertSafe(node, depth) {
  if (depth > MAX_DEPTH) throw new Error('lia.svg: arvore profunda demais');
  if (!TAGS.includes(node.tag)) throw new Error(`lia.svg: elemento <${node.tag}> nao permitido`);
  for (const [name, value] of Object.entries(node.attrs)) {
    if (/^on/i.test(name) || name === 'style' || name === 'xmlns') throw new Error(`lia.svg: atributo "${name}" nao permitido`);
    if (name === 'href' && !value.startsWith('#')) throw new Error('lia.svg: href so pode apontar para ids internos');
  }
  node.children.forEach((child) => assertSafe(child, depth + 1));
}

/** Lê o SVG e devolve { viewBox, tree } validados. Lança erro em qualquer desvio. */
export function extractArt(svgXml) {
  const document = buildTree(svgXml);
  const svg = document.children[0];
  if (document.children.length !== 1 || !svg || svg.tag !== 'svg') {
    throw new Error('lia.svg: esperado um unico <svg> na raiz');
  }
  if (!svg.attrs.viewBox) throw new Error('lia.svg: <svg> sem viewBox');
  svg.children.forEach((child) => assertSafe(child, 1));
  return { viewBox: svg.attrs.viewBox, tree: svg.children };
}

/** Módulo JS (UMD) que expõe `global` com { viewBox, tree } validados. */
function renderModule(art, { global, origem }) {
  // Um nó por linha: legível no diff e sem a indentação do JSON (o arquivo vai para o precache).
  const nodes = art.tree.map((node) => `    ${JSON.stringify(node)}`).join(',\n');
  const literal = `{\n    "viewBox": ${JSON.stringify(art.viewBox)},\n    "tree": [\n${nodes}\n    ]\n  }`;
  return [
    `/* Gerado por build-lia-art.mjs a partir de ${origem} (ADR 0003). Nao edite a mao: rode o script. */`,
    '(function (root, factory) {',
    "  'use strict';",
    '  var art = factory();',
    "  if (typeof module === 'object' && module.exports) module.exports = art;",
    `  if (root) root.${global} = art;`,
    "})(typeof window !== 'undefined' ? window : null, function () {",
    "  'use strict';",
    `  return ${literal};`,
    '});',
    '',
  ].join('\n');
}

/** Texto completo de lia-art.js para o SVG dado (função pura: o teste compara com o arquivo). */
export function buildLiaArtSource(svgXml) {
  return renderModule(extractArt(svgXml), { global: 'LiaArt', origem: 'lia.svg' });
}

const CENAS = ['1', '2', '3', '4', '5', '6', '7'];

/** Ids de todos os nós (para checar colisão entre props e lia.svg). */
function collectIds(nodes, ids = new Set()) {
  for (const node of nodes) {
    if (node.attrs.id) ids.add(node.attrs.id);
    collectIds(node.children, ids);
  }
  return ids;
}

/** Contrato dos props (README, "Contrato de ids"): cada <g> de topo é lia-pv-*, com cena e pai; ids nunca repetem. */
function assertPropsContract(tree, baseIds) {
  for (const node of tree) {
    const { id, 'data-cena': cena, 'data-pai': pai } = node.attrs;
    if (node.tag !== 'g' || !id || !id.startsWith('lia-pv-')) throw new Error(`lia-props.svg: <g id="lia-pv-…"> esperado, achei ${node.tag} ${id ?? ''}`);
    if (!CENAS.includes(cena)) throw new Error(`lia-props.svg: "${id}" sem data-cena válido (1-7)`);
    if (!pai || (pai !== 'svg' && !pai.startsWith('#'))) throw new Error(`lia-props.svg: "${id}" sem data-pai válido`);
  }
  const todos = [...collectIdsList(tree)];
  const unicos = new Set(todos);
  if (unicos.size !== todos.length) throw new Error('lia-props.svg: id repetido (de topo ou aninhado)');
  const colidem = todos.filter((id) => baseIds.has(id));
  if (colidem.length) throw new Error(`lia-props.svg: id(s) ja existentes em lia.svg: ${colidem.join(', ')}`);
}

/** Lista (com repetição) de todos os ids do array de nós, em ordem. */
function collectIdsList(nodes, acc = []) {
  for (const node of nodes) {
    if (node.attrs.id) acc.push(node.attrs.id);
    collectIdsList(node.children, acc);
  }
  return acc;
}

/** Orçamento de lia-props-art.js (ADR 0003 / Onda 2): carregado sob demanda, mas sem estourar 16 KB. */
export const PROPS_MAX_BYTES = 16 * 1024;

/** Texto de lia-props-art.js. `baseSvgXml` (lia.svg) só serve para checar colisão de ids. */
export function buildLiaPropsSource(svgXml, baseSvgXml) {
  const art = extractArt(svgXml);
  assertPropsContract(art.tree, collectIds(extractArt(baseSvgXml).tree));
  const source = renderModule(art, { global: 'LIA_PROPS_ART', origem: 'lia-props.svg' });
  if (Buffer.byteLength(source, 'utf8') > PROPS_MAX_BYTES) throw new Error(`lia-props-art.js acima de ${PROPS_MAX_BYTES} bytes`);
  return source;
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseSvg = await readFile(join(here, 'lia.svg'), 'utf8');
  const propsSvg = await readFile(join(here, 'lia-props.svg'), 'utf8');
  const source = buildLiaArtSource(baseSvg);
  const propsSource = buildLiaPropsSource(propsSvg, baseSvg);
  await writeFile(join(here, 'lia-art.js'), source, 'utf8');
  await writeFile(join(here, 'lia-props-art.js'), propsSource, 'utf8');
  console.log(`lia-art.js gerado (${Buffer.byteLength(source, 'utf8')} bytes).`);
  console.log(`lia-props-art.js gerado (${Buffer.byteLength(propsSource, 'utf8')} bytes).`);
}
