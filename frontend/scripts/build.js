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

console.log('Build gerado em frontend/dist/ (app.js ofuscado; demais páginas, módulos e vendor copiados).');
