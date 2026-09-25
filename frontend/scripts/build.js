/**
 * build.js
 * Gera frontend/dist/ para publicação: index.html e styles.css são
 * copiados sem alteração (não há segredo nem lógica neles para proteger);
 * app.js é ofuscado antes de publicar.
 *
 * app.js continua sendo a fonte de verdade legível no repositório — é o
 * que se lê, revisa e testa. dist/app.js é gerado, nunca editado à mão, e
 * não é commitado (ver .gitignore) — o workflow do GitHub Actions roda
 * este build antes de cada publicação (ver ../../.github/workflows/deploy-frontend.yml).
 */
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

const result = JavaScriptObfuscator.obfuscate(source, {
  compact: true,
  selfDefending: true,
  controlFlowFlattening: true,
  // O resto fica no padrão da biblioteca — não ligamos extras agressivos
  // (ex.: stringArrayEncoding/debugProtection) sem necessidade: o pedido
  // foi especificamente estas 3 opções + minificação padrão, e cada opção
  // extra é mais uma chance de quebrar algo sem ganho de segurança real
  // (isto é ofuscação/atrito, não criptografia — ver aviso abaixo).
});

fs.writeFileSync(path.join(DIST, 'app.js'), result.getObfuscatedCode());

// Páginas estáticas (HTML/CSS puro, sem lógica a proteger) — copiadas sem
// alteração. Adicione aqui qualquer nova página estática do site.
['index.html', 'styles.css', 'termos.html', 'privacidade.html'].forEach((name) => {
  fs.copyFileSync(path.join(ROOT, name), path.join(DIST, name));
});

console.log('Build gerado em frontend/dist/ (app.js ofuscado; demais páginas copiadas).');
