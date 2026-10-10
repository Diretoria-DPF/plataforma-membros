/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Tela de entrada em cartões (index.html, #screen-welcome): sem a Lia do hero, três blocos separados
// (login, atalhos, publicação do blog) e dois botões grandes com os textos do dono.
// Só lê arquivos: o comportamento em tela é conferido por scripts/e2e/entrada.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');

const HTML = read('index.html');
const ABERTURA = '<section id="screen-welcome" class="auth-pilha"';

/** Trecho da tela de entrada: da abertura da <section> até o primeiro </section>. */
function telaDeEntrada() {
  const inicio = HTML.indexOf(ABERTURA);
  assert.ok(inicio >= 0, `${ABERTURA} não encontrado em index.html`);
  const fim = HTML.indexOf('</section>', inicio);
  assert.ok(fim > inicio, 'a tela de entrada não fecha com </section>');
  return HTML.slice(inicio, fim);
}

/** Corpo da primeira regra CSS que começa exatamente em `seletor {`. */
function regraCss(css, seletor) {
  const inicio = css.indexOf(`${seletor} {`);
  assert.ok(inicio >= 0, `regra ${seletor} não encontrada`);
  return css.slice(inicio, css.indexOf('}', inicio));
}

test('index.html não monta mais a Lia do hero na tela de entrada', () => {
  assert.ok(!HTML.includes('hero-lia'), 'sobrou #hero-lia no index.html');
  assert.ok(!HTML.includes('src="hero.js"'), 'sobrou <script src="hero.js"> no index.html');
  assert.ok(!/class="[^"]*\bhero\b/.test(HTML), 'sobrou uma classe hero no index.html');
});

test('a tela de entrada tem login, atalhos e publicação do blog, nessa ordem, com um só h1', () => {
  const tela = telaDeEntrada();
  const login = tela.indexOf('id="form-login"');
  const atalhos = tela.indexOf('<nav class="auth-card welcome-liga" aria-label="Conheça a LAIFT e o blog">');
  const publicacao = tela.indexOf('data-blog-novidade="1"');
  assert.ok(login >= 0, 'faltou o formulário de login');
  assert.ok(atalhos > login, 'o cartão de atalhos deve vir depois do login');
  assert.ok(publicacao > atalhos, 'a publicação do blog deve vir depois dos atalhos');
  assert.equal(tela.split('<h1').length - 1, 1, 'a tela de entrada deve ter um só h1');
});

test('os botões da tela de entrada usam os textos "Conheça a LAIFT" e "Acessar blog"', () => {
  const tela = telaDeEntrada();
  const liga = tela.indexOf('welcome-liga__link" href="liga.html"');
  const blog = tela.indexOf('welcome-liga__blog" href="blog.html"');
  assert.ok(liga >= 0, 'faltou o botão da Liga (href="liga.html")');
  assert.ok(blog >= 0, 'faltou o botão do blog (href="blog.html")');
  assert.ok(tela.slice(liga, tela.indexOf('</a>', liga)).includes('<span>Conheça a LAIFT</span>'), 'o botão da Liga deve dizer "Conheça a LAIFT"');
  assert.ok(tela.slice(blog, tela.indexOf('</a>', blog)).includes('<span>Acessar blog</span>'), 'o botão do blog deve dizer "Acessar blog"');
  assert.ok(!/conheça a plataforma/i.test(HTML), 'sobrou o texto antigo "Conheça a plataforma" no index.html');
});

test('hero.js saiu do build, do cache offline e do disco', () => {
  assert.ok(!read('scripts/build.js').includes("'hero.js'"), "scripts/build.js ainda lista 'hero.js'");
  assert.ok(!read('sw.js').includes("'hero.js'"), "sw.js ainda lista 'hero.js' no PRECACHE");
  assert.ok(!fs.existsSync(path.join(frontend, 'hero.js')), 'frontend/hero.js ainda existe');
});

test('ux.css não tem mais regras do hero e define a pilha de cartões com botões de 56 px', () => {
  const ux = read('ux.css');
  assert.ok(!/\.hero\b/.test(ux), 'sobrou regra .hero no ux.css');
  assert.ok(ux.includes('#screen-welcome.auth-pilha'), 'faltou #screen-welcome.auth-pilha no ux.css');
  assert.ok(regraCss(ux, '.welcome-liga__botao').includes('min-height: 56px'), '.welcome-liga__botao deve ter min-height: 56px');
});

test('styles.css não repete as regras da faixa da Liga (elas vivem só em ux.css)', () => {
  assert.ok(!read('styles.css').includes('.welcome-liga'), 'sobrou .welcome-liga no styles.css');
});

// docs/ux-progresso/CONTRATO.md §6: hierarquia do login, cadastro em grupos e entrada.js.
function telaDeCadastro() {
  const inicio = HTML.indexOf('<section id="screen-register"');
  assert.ok(inicio >= 0, '<section id="screen-register" não encontrado');
  return HTML.slice(inicio, HTML.indexOf('</section>', inicio));
}

test('login: "Mostrar senha" e "Esqueci minha senha" junto da senha; "Criar conta" é botão secundário depois do Entrar', () => {
  const tela = telaDeEntrada();
  const senha = tela.indexOf('id="login-password"');
  const mostrar = tela.indexOf('<input type="checkbox" id="login-mostrar" data-senha-visivel="login-password">');
  const esqueci = tela.indexOf('<button type="button" class="link-btn auth-esqueci" data-nav="screen-forgot">Esqueci minha senha</button>');
  const entrar = tela.indexOf('<button type="submit">Entrar</button>');
  const criar = tela.indexOf('<button type="button" class="secondary auth-criar__botao" data-nav="screen-register">Criar conta</button>');
  assert.ok(senha > 0 && mostrar > senha && esqueci > mostrar && entrar > esqueci, 'ordem: senha, Mostrar senha, Esqueci, Entrar');
  assert.ok(criar > entrar && tela.includes('<p class="auth-criar__texto">Primeira vez aqui?</p>'), '"Primeira vez aqui?" e "Criar conta" depois do Entrar');
  assert.ok(!tela.includes('class="auth-links"'), 'sobrou a fila de links soltos no login');
});

test('cadastro: "Seus dados" e "Senha" à vista; o opcional recolhido; sem SMS, sem asterisco', () => {
  const tela = telaDeCadastro();
  assert.ok(tela.indexOf('<legend>Seus dados</legend>') > 0 && tela.indexOf('<legend>Senha</legend>') > tela.indexOf('<legend>Seus dados</legend>'));
  const det = tela.slice(tela.indexOf('<details class="cadastro-opcional">'), tela.indexOf('</details>'));
  assert.ok(det.includes('<summary>Completar perfil (opcional)</summary>'), 'faltou o resumo "Completar perfil (opcional)"');
  for (const id of ['reg-avatar-input', 'reg-linkedin', 'reg-instagram', 'reg-education', 'reg-interests']) assert.ok(det.includes(`id="${id}"`), `${id} fora do grupo opcional`);
  for (const id of ['reg-name', 'reg-username', 'reg-email', 'reg-phone', 'reg-password']) assert.ok(!det.includes(`id="${id}"`), `${id} não pode ficar recolhido`);
  assert.ok(tela.includes('<input type="hidden" id="reg-validation" value="email">') && !tela.includes('<select id="reg-validation"') && !tela.includes('SMS'));
  assert.ok(!/<label for="reg-[a-z]+">\*/.test(tela) && tela.split('(opcional)').length === 2, 'sem asterisco e sem "(opcional)" campo a campo');
  assert.ok(tela.includes('<button type="submit">Criar conta</button>'));
});

test('entrada.js: cabeçalho, script clássico, sem HTML em texto, publicado no build e no cache offline', () => {
  const js = read('entrada.js');
  assert.ok(js.replace(/\r\n/g, '\n').startsWith('/*\n * Plataforma de Membros LAIFT\n'), 'falta o cabeçalho de copyright');
  assert.ok(!/\bimport\s|\bexport\s/.test(js) && !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.style\./.test(js));
  assert.ok(/data-senha-visivel/.test(js) && /focus\(\{ preventScroll: true \}\)/.test(js), 'mostra a senha e leva o foco ao título');
  assert.ok(HTML.includes('<script src="app.js" defer></script>\n  <script src="entrada.js" defer></script>'), 'entrada.js logo depois de app.js');
  assert.ok(read('scripts/build.js').includes("'entrada.js'") && read('sw.js').includes("'entrada.js'"));
});

test('ux.css: campos públicos com 16 px e alvos de 44 px no "Mostrar senha" e no "Esqueci"', () => {
  const ux = read('ux.css');
  assert.ok(ux.includes('#public-shell :is(input:not([type="checkbox"]):not([type="radio"]), select, textarea) { font-size: 1rem; }'));
  assert.ok(regraCss(ux, '.auth-mostrar').includes('min-height: 44px'));
  assert.ok(regraCss(ux, '.auth-esqueci').includes('min-height: 44px'));
  assert.ok(regraCss(ux, '.auth-criar__botao').includes('width: 100%'));
});
