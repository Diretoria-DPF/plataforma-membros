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

// Trava do conteúdo curado (PR 3.2, O2): nenhuma ficha de curated/ vai para
// produção sem a revisão do conselho assinada (docs/atlas-conteudo/ata-revisao-3-2.md).
{
  const check = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'atlas', 'check-curated-signed.mjs')], { encoding: 'utf8' });
  if (check.status !== 0) {
    process.stderr.write(check.stderr || check.stdout || '');
    throw new Error('Build bloqueado: há fichas curadas sem assinatura do conselho (scripts/atlas/check-curated-signed.mjs).');
  }
}

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
['index.html', 'styles.css', 'termos.html', 'privacidade.html', '404.html'].forEach((name) => {
  fs.copyFileSync(path.join(ROOT, name), path.join(DIST, name));
});

// Módulos ES da mensageria E2EE (frontend/msg-crypto.js e messaging.js):
// copiados sem ofuscação, de propósito — ao contrário de app.js, este é
// código de criptografia genuinamente sensível, e mantê-lo legível em
// produção (view-source) é uma escolha deliberada de auditabilidade, não
// um descuido. A segurança do sistema vem da matemática (X25519/AES-GCM/
// PBKDF2+HKDF), nunca de esconder o código-fonte — e ofuscar um módulo ES
// com import dinâmico é uma superfície extra de risco de quebra silenciosa
// sem nenhum ganho de segurança real, o mesmo raciocínio já documentado
// acima para não ligar opções agressivas do obfuscator.
['msg-crypto.js', 'messaging.js'].forEach((name) => {
  fs.copyFileSync(path.join(ROOT, name), path.join(DIST, name));
});

// Área "Aprender" (unificação com o o-bala-vip — docs/PLANO_UNIFICACAO_LAIFT.md):
// learning.js não guarda segredo nenhum e é copiado sem ofuscação, como os
// módulos acima. modulos/ (as
// páginas autônomas de cada módulo, com dados, CSS e o modelo 3D) e vendor/
// (bibliotecas de terceiros versionadas no repositório) vão inteiros —
// cópia recursiva para nenhum arquivo novo ficar de fora da publicação,
// o mesmo tipo de esquecimento que já derrubou um deploy antes.
fs.copyFileSync(path.join(ROOT, 'learning.js'), path.join(DIST, 'learning.js'));
// Decoração das páginas estáticas (404/termos/privacidade): script externo
// em vez de inline, para a CSP delas não precisar de 'unsafe-inline'.
fs.copyFileSync(path.join(ROOT, 'static-page.js'), path.join(DIST, 'static-page.js'));
// Fase 3 — painel admin de IA: sem segredo (só chama a Worker com o token da
// sessão, como o resto), copiado sem ofuscação, como learning.js.
fs.copyFileSync(path.join(ROOT, 'admin-ai.js'), path.join(DIST, 'admin-ai.js'));
['modulos', 'vendor'].forEach((dir) => {
  fs.cpSync(path.join(ROOT, dir), path.join(DIST, dir), { recursive: true });
});

// Modelos 3D também em .glb.gz (PR 3.1, meta de boot < 10 s em Fast 3G):
// o GitHub Pages não comprime .glb, e o gzip tira ~43% do esqueleto. O atlas
// baixa o .gz e descomprime no navegador (DecompressionStream); sem suporte,
// cai no .glb — por isso os dois ficam publicados.
const zlib = require('zlib');
(function gzipModels(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) gzipModels(full);
    else if (entry.name.endsWith('.glb')) fs.writeFileSync(`${full}.gz`, zlib.gzipSync(fs.readFileSync(full), { level: 9 }));
  }
})(path.join(DIST, 'modulos', 'anatomia-3d')); // models/ e data/atlas/fixtures/models/

// Atlas offline (Onda 3.5, A.1): hash do conteúdo de modulos/anatomia-3d (sem
// o próprio sw.js e sem os .gz, que derivam dos .glb) → nome do cache do SW;
// precache.json lista o que o SW baixa ao instalar (código, estilos e o
// esqueleto; os demais modelos e as fichas entram no cache ao serem usados).
{
  const crypto = require('crypto');
  const A3D = path.join(DIST, 'modulos', 'anatomia-3d');
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else files.push(path.relative(A3D, full).split(path.sep).join('/'));
    }
  })(A3D);
  files.sort();
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    if (f === 'sw.js' || f === 'precache.json' || f.endsWith('.gz')) continue;
    hash.update(f).update('\0').update(fs.readFileSync(path.join(A3D, f))).update('\0');
  }
  const build = hash.digest('hex').slice(0, 16);
  const swPath = path.join(A3D, 'sw.js');
  fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace(/__ATLAS_BUILD__/g, build));
  const precache = files.filter((f) => /\.(js|css|html|wasm)$/.test(f)
    && f !== 'sw.js' && !/^(revisao\/|js\/revisao\/|vendor\/draco\/|data\/atlas\/fixtures\/|dev\/|scripts\/)/.test(f));
  precache.push('data/atlas/generated/structures.boot.json', 'data/atlas/generated/review-status.json',
    'data/atlas/legacy/index.legacy.json', 'models/manifest.json', 'models/zanatomy/esqueletico.lod1.glb.gz');
  // ../shared/ (identidade, safe-dom, tokens) é carregado pela página do atlas
  const SHARED = path.join(DIST, 'modulos', 'shared');
  for (const f of fs.readdirSync(SHARED)) if (/\.(js|css)$/.test(f)) precache.push(`../shared/${f}`);
  fs.writeFileSync(path.join(A3D, 'precache.json'), JSON.stringify({ build, urls: [...new Set(precache)].filter((f) => f.startsWith('../') || files.includes(f)) }));
  console.log(`Atlas offline: build ${build}, ${precache.length} arquivos no precache.`);
}

console.log('Build gerado em frontend/dist/ (app.js ofuscado; demais páginas, módulos e vendor copiados).');
