/**
 * cdn-mirror/index.js — serve, nos testes E2E, os arquivos que as páginas
 * pedem ao jsDelivr (https://cdn.jsdelivr.net/npm/<pacote>@<versão>/<caminho>)
 * a partir de um espelho local instalado do registro do npm (package.json
 * desta pasta, mesmas versões). Assim o teste:
 *   - confere o SRI de verdade (o navegador compara o `integrity` com os
 *     bytes do pacote — os mesmos que o jsDelivr serve);
 *   - executa as bibliotecas sob a CSP das páginas (eval, workers, WASM).
 * Sem o espelho (máquina sem acesso ao npm), `ensureMirror()` devolve null e
 * o teste segue com as bibliotecas abortadas, como os demais cenários.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIR = __dirname;
const NODE_MODULES = path.join(DIR, 'node_modules');

function listPackages() {
  const found = {};
  if (!fs.existsSync(NODE_MODULES)) return found;
  const dirs = [];
  for (const name of fs.readdirSync(NODE_MODULES)) {
    if (name.startsWith('.')) continue;
    const full = path.join(NODE_MODULES, name);
    if (name.startsWith('@')) fs.readdirSync(full).forEach((sub) => dirs.push(path.join(full, sub)));
    else dirs.push(full);
  }
  for (const dir of dirs) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      // O npm normaliza a versão (2026.03.6 → 2026.3.6); o jsDelivr e o
      // package.json do espelho usam a forma normalizada.
      const normalized = String(pkg.version).replace(/(^|\.)0+(\d)/g, '$1$2');
      found[`${pkg.name}@${pkg.version}`] = dir;
      found[`${pkg.name}@${normalized}`] = dir;
    } catch (e) { /* não é pacote */ }
  }
  return found;
}

/** Garante o espelho instalado (npm ci na primeira vez). Devolve o índice ou null. */
function ensureMirror() {
  const wanted = require(path.join(DIR, 'package.json')).dependencies;
  let pkgs = listPackages();
  const missing = () => Object.entries(wanted).some(([alias, spec]) => {
    const real = spec.startsWith('npm:') ? spec.slice(4) : `${alias}@${spec}`;
    return !pkgs[real];
  });
  if (missing()) {
    try {
      execSync(fs.existsSync(path.join(DIR, 'package-lock.json')) ? 'npm ci --no-audit --no-fund' : 'npm install --no-audit --no-fund', { cwd: DIR, stdio: 'ignore', timeout: 180000 });
    } catch (e) {
      return null;
    }
    pkgs = listPackages();
    if (missing()) return null;
  }
  return pkgs;
}

const TYPES = { '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };

/**
 * Resolve uma URL do jsDelivr para um arquivo do espelho: { body, contentType }
 * ou null (pacote/versão/arquivo inexistente — como o jsDelivr, que só
 * serve o que está no pacote publicado).
 */
function resolveCdnUrl(pkgs, url) {
  const m = /^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/.exec(url.split('?')[0]);
  if (!m) return null;
  const dir = pkgs[`${m[1]}@${m[2]}`];
  if (!dir) return null;
  const file = path.join(dir, m[3]);
  if (!file.startsWith(dir) || !fs.existsSync(file)) return null;
  return { body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' };
}

module.exports = { ensureMirror, resolveCdnUrl };
