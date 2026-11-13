/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-nv-fila.js (F-005)
 * Os JSON do Laboratório guardam, no repositório, marcas [NV] (valor a conferir com fonte primária) para o
 * revisor farmacêutico. Elas nunca podem chegar ao público. Este módulo:
 *  - coletarNV(): lista (arquivo, campo, item, valor) de cada marca [NV] nas fontes;
 *  - sanitizar(): devolve uma cópia sem os campos marcados e sem o objeto interno `conferencia`;
 *  - gerarMarkdown(): produz docs/LABORATORIO_NV_FILA.md (fila de conferência).
 * O build.js publica em dist só a versão sanitizada; as fontes não mudam.
 * Uso: node scripts/lab-nv-fila.js --escrever   (regrava o documento)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LAB = path.join(ROOT, 'modulos', 'laboratorio');
const DOC = path.join(ROOT, '..', 'docs', 'LABORATORIO_NV_FILA.md');
const MARCA = /\[NV\]/;
const CHAVES_INTERNAS = new Set(['conferencia']);

function listarJson(dir) {
  const saida = [];
  if (!fs.existsSync(dir)) return saida;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') saida.push(...listarJson(full)); }
    else if (e.name.endsWith('.json')) saida.push(full);
  }
  return saida.sort();
}

function formatarCaminho(partes) {
  return partes.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('').replace(/^\./, '');
}

function percorrer(no, partes, achados, item = '') {
  if (typeof no === 'string') {
    if (MARCA.test(no)) achados.push({ campo: formatarCaminho(partes), valor: no, item });
    return;
  }
  if (Array.isArray(no)) { no.forEach((v, i) => percorrer(v, [...partes, i], achados, item)); return; }
  if (no && typeof no === 'object') {
    const titulo = typeof no.titulo === 'string' && !MARCA.test(no.titulo) ? no.titulo : item;
    for (const k of Object.keys(no)) percorrer(no[k], [...partes, k], achados, titulo);
  }
}

function coletarNV(labDir = LAB) {
  const fila = [];
  for (const arq of listarJson(labDir)) {
    const achados = [];
    percorrer(JSON.parse(fs.readFileSync(arq, 'utf8')), [], achados);
    const rel = path.relative(path.join(labDir, '..', '..'), arq).split(path.sep).join('/');
    achados.forEach((a) => fila.push({ arquivo: rel, ...a }));
  }
  return fila;
}

// Cópia sem campo interno e sem qualquer texto com marca [NV]; não muda nenhum valor científico.
function sanitizar(no) {
  if (Array.isArray(no)) return no.map(sanitizar);
  if (no && typeof no === 'object') {
    const novo = {};
    for (const k of Object.keys(no)) {
      if (CHAVES_INTERNAS.has(k)) continue;
      if (typeof no[k] === 'string' && MARCA.test(no[k])) continue;
      novo[k] = sanitizar(no[k]);
    }
    return novo;
  }
  return no;
}

// Reescreve, dentro de distLab, cada JSON sem marcas; devolve quantos arquivos mudaram.
function sanitizarDist(distLab) {
  let alterados = 0;
  for (const arq of listarJson(distLab)) {
    const dado = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const achados = [];
    percorrer(dado, [], achados);
    const temInterno = JSON.stringify(dado).includes('"conferencia"');
    if (!achados.length && !temInterno) continue;
    fs.writeFileSync(arq, JSON.stringify(sanitizar(dado)));
    alterados++;
  }
  return alterados;
}

const celula = (texto) => String(texto || '').replace(/\|/g, '\\|');

function gerarMarkdown(fila = coletarNV()) {
  const linhas = [
    '# Laboratório: fila de conferência [NV]',
    '',
    'Documento gerado por `frontend/scripts/lab-nv-fila.js`. Não edite à mão.',
    '',
    'Como o revisor farmacêutico usa esta fila:',
    '',
    '1. Cada linha é um valor a conferir com a fonte primária (arquivo, campo e item de referência).',
    '2. A marca [NV] permanece nas fontes do repositório (`frontend/modulos/laboratorio/data/**`); o build a remove de `dist`, então o público nunca a vê.',
    '3. Após conferir, edite o JSON de origem (corrija o valor ou a citação e apague a marca [NV] daquele campo) e rode `node frontend/scripts/lab-nv-fila.js --escrever` para atualizar este documento.',
    '4. Para ver a fila sem abrir arquivos: `node frontend/scripts/lab-nv-fila.js` (imprime o documento).',
    '',
    `Total: ${fila.length} marca(s) [NV] em ${new Set(fila.map((f) => f.arquivo)).size} arquivo(s).`,
    '',
    '| Arquivo | Campo | Item | Valor a conferir |',
    '|---|---|---|---|',
    ...fila.map((f) => `| \`${f.arquivo}\` | \`${f.campo}\` | ${celula(f.item)} | ${celula(f.valor)} |`),
    '',
  ];
  return linhas.join('\n');
}

module.exports = { coletarNV, sanitizar, sanitizarDist, gerarMarkdown, DOC, LAB };

if (require.main === module) {
  if (process.argv.includes('--escrever')) {
    fs.writeFileSync(DOC, gerarMarkdown());
    console.log(`Fila [NV] gravada em ${path.relative(path.join(ROOT, '..'), DOC)}.`);
  } else {
    process.stdout.write(gerarMarkdown());
  }
}
