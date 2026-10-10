/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Verificador do Lote B (entrada e cadastro; docs/ux-progresso/CONTRATO.md §6).
// Uso, da RAIZ: node docs/ux-progresso/verificadores/b-entrada.js   (sai com código 1 se algo falhar)
// Fotos em docs/ux-progresso/capturas/{entrada,cadastro}-*.png (portão visual do dono).
'use strict';

const v = require('./comum');

const FLAGS = { ux_v2_enabled: true, chatbot_enabled: true, feedback_enabled: true };
const ALTURA_CADASTRO_ANTES_375 = 1541; // medido em 2026-10-09 (AUDITORIA E2): 12 campos soltos, 7 obrigatórios

function fontes() {
  console.log('\nFontes');
  const js = v.lerFonte('entrada.js');
  v.confere(v.temCabecalho(js), 'entrada.js existe e tem o cabeçalho de copyright');
  v.confere(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.style\./.test(js), 'entrada.js sem HTML em texto e sem estilo inline');
  v.confere(/'entrada\.js'/.test(v.lerFonte('scripts/build.js')) && /'entrada\.js'/.test(v.lerFonte('sw.js')), "build.js publica e sw.js guarda 'entrada.js'");
  const html = v.lerFonte('index.html');
  v.confere(html.includes('<script src="app.js" defer></script>\n  <script src="entrada.js" defer></script>')
    || html.includes('<script src="app.js" defer></script>\r\n  <script src="entrada.js" defer></script>'), 'index.html carrega entrada.js logo depois de app.js');
  v.confere(!/SMS \(indisponível/.test(html) && !/<select id="reg-validation"/.test(html) && html.includes('<input type="hidden" id="reg-validation" value="email">'),
    'cadastro sem a escolha inútil de SMS (valor "email" fixo)');
  const inicio = html.indexOf('<section id="screen-register"');
  const cadastro = inicio >= 0 ? html.slice(inicio, html.indexOf('</section>', inicio)) : '';
  v.confere(cadastro.length > 0 && !/<label for="reg-[a-z]+">\*/.test(cadastro) && cadastro.split('(opcional)').length === 2
    && cadastro.includes('<summary>Completar perfil (opcional)</summary>'),
    'cadastro sem asterisco e sem "(opcional)" campo a campo (o opcional fica num grupo só)');
  const ux = v.lerFonte('ux.css');
  v.confere(ux.includes('#public-shell :is(input:not([type="checkbox"]):not([type="radio"]), select, textarea) { font-size: 1rem; }'), 'ux.css: campos da tela pública com 16 px');
  v.confere(!/prefers-reduced-motion:s*reduce/.test(ux), 'ux.css continua sem @media de movimento reduzido');
}

async function lerEntrada(page) {
  return page.evaluate(() => {
    const cartao = document.querySelector('#screen-welcome > .auth-card');
    const caixa = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; };
    const ordem = cartao ? Array.from(cartao.querySelectorAll('#login-email, #login-password, #login-mostrar, .auth-esqueci, #form-login button[type="submit"], .auth-criar__texto, .auth-criar__botao'))
      .map((el) => el.id || el.className.split(' ').pop() || el.type) : [];
    const campo = document.getElementById('login-email');
    return {
      ordem,
      entrar: caixa(document.querySelector('#form-login button[type="submit"]')),
      criar: caixa(document.querySelector('.auth-criar__botao')),
      criarTexto: (document.querySelector('.auth-criar__botao') || {}).textContent,
      criarSecundario: !!document.querySelector('.auth-criar__botao.secondary'),
      esqueci: caixa(document.querySelector('.auth-esqueci')),
      mostrar: caixa(document.querySelector('.auth-mostrar')),
      fonteCampo: campo ? parseFloat(getComputedStyle(campo).fontSize) : 0,
      linksSoltos: document.querySelectorAll('#screen-welcome .auth-links').length,
      rolagemX: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

async function entrada(app, largura, tema) {
  const rotulo = `entrada ${largura} ${tema}`;
  const nome = `${tema === 'dark' ? 'escuro' : 'claro'}-${largura}`;
  console.log(`\n${rotulo}`);
  const respostas = { apiRegister: { success: true, message: 'Cadastro realizado. Verifique seu e-mail para confirmar a conta.' } };
  const aberto = await app.abrir('', { largura, altura: largura < 600 ? 812 : 800, tema, flags: FLAGS, respostas });
  const { page, ctx, erros } = aberto;
  try {
    await page.waitForSelector('#screen-welcome:not(.hidden)', { timeout: 15000 });
    const s = await lerEntrada(page);
    v.confere(JSON.stringify(s.ordem) === JSON.stringify(['login-email', 'login-password', 'login-mostrar', 'auth-esqueci', 'submit', 'auth-criar__texto', 'auth-criar__botao']),
      `${rotulo}: ordem e-mail, senha, Mostrar senha, Esqueci, Entrar, "Primeira vez aqui?", Criar conta (${s.ordem.join(', ')})`);
    v.confere(s.linksSoltos === 0, `${rotulo}: sem a fila de links soltos (.auth-links) no login`);
    v.confere(s.criarSecundario && s.criarTexto === 'Criar conta' && s.criar && s.entrar && Math.abs(s.criar.w - s.entrar.w) <= 1 && s.criar.h >= 44,
      `${rotulo}: "Criar conta" é botão secundário da largura do "Entrar" (${s.criar && Math.round(s.criar.w)} x ${s.criar && Math.round(s.criar.h)})`);
    v.confere(s.criar && s.entrar && s.criar.y > s.entrar.y, `${rotulo}: "Entrar" vem antes de "Criar conta" (hierarquia)`);
    v.confere(s.esqueci && s.esqueci.h >= 44 && s.mostrar && s.mostrar.h >= 44, `${rotulo}: "Esqueci minha senha" e "Mostrar senha" com alvo >= 44 px`);
    v.confere(s.fonteCampo >= 16, `${rotulo}: campo com fonte >= 16 px (${s.fonteCampo})`);
    v.confere(!s.rolagemX, `${rotulo}: sem rolagem horizontal`);
    if (!s.mostrar || !s.criar) return;

    await page.fill('#login-password', 'segredo-de-teste');
    await page.check('#login-mostrar');
    const tipoVisivel = await page.getAttribute('#login-password', 'type');
    await page.uncheck('#login-mostrar');
    const tipoOculto = await page.getAttribute('#login-password', 'type');
    v.confere(tipoVisivel === 'text' && tipoOculto === 'password', `${rotulo}: "Mostrar senha" alterna o campo (${tipoVisivel} → ${tipoOculto})`);
    await page.fill('#login-password', '');
    await page.screenshot({ path: v.captura(`entrada-${nome}`), fullPage: true });

    await page.evaluate(() => window.scrollTo(0, 300));
    await page.click('.auth-criar__botao');
    await page.waitForSelector('#screen-register:not(.hidden)');
    await page.waitForTimeout(150);
    const foco = await page.evaluate(() => ({ id: document.activeElement && document.activeElement.id, y: scrollY }));
    v.confere(foco.id === 'register-title' && foco.y === 0, `${rotulo}: "Criar conta" leva ao topo do cadastro com o foco no título (${foco.id}, y ${foco.y})`);

    const c = await page.evaluate(() => {
      const f = document.getElementById('form-register');
      const visiveis = Array.from(f.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea')).filter((e) => e.checkVisibility());
      const det = f.querySelector('details.cadastro-opcional');
      return {
        legendas: Array.from(f.querySelectorAll('fieldset.cadastro-grupo > legend')).map((l) => l.textContent.trim()),
        visiveis: visiveis.map((e) => e.id), resumo: det && det.querySelector('summary').textContent.trim(), aberto: !!det && det.open,
        dentro: det ? ['reg-avatar-input', 'reg-linkedin', 'reg-instagram', 'reg-education', 'reg-interests'].every((id) => det.contains(document.getElementById(id))) : false,
        enviar: (f.querySelector('button[type="submit"]') || {}).textContent, altura: document.documentElement.scrollHeight,
        dica: (document.getElementById('reg-name').getAttribute('aria-describedby') || ''),
      };
    });
    v.confere(JSON.stringify(c.legendas) === '["Seus dados","Senha"]', `${rotulo}: cadastro em grupos "Seus dados" e "Senha" (${c.legendas.join(', ')})`);
    v.confere(JSON.stringify(c.visiveis) === '["reg-name","reg-username","reg-email","reg-phone","reg-password","reg-mostrar","reg-terms","reg-privacy"]',
      `${rotulo}: à vista só o obrigatório (${c.visiveis.join(', ')})`);
    v.confere(c.resumo === 'Completar perfil (opcional)' && !c.aberto && c.dentro, `${rotulo}: foto, LinkedIn, Instagram, escolaridade e interesses recolhidos em "Completar perfil (opcional)"`);
    v.confere(c.enviar === 'Criar conta' && c.dica === 'reg-name-dica', `${rotulo}: botão "Criar conta"; aviso do nome ligado ao campo`);
    if (largura < 600) {
      v.confere(c.altura <= ALTURA_CADASTRO_ANTES_375 - 300, `${rotulo}: cadastro mais curto (${c.altura} px; antes ${ALTURA_CADASTRO_ANTES_375})`);
    }
    await page.screenshot({ path: v.captura(`cadastro-${nome}`), fullPage: true });

    await page.fill('#reg-name', 'Pessoa de Teste');
    await page.fill('#reg-username', 'pessoateste');
    await page.fill('#reg-email', 'pessoa@exemplo.com');
    await page.fill('#reg-phone', '71999998888');
    await page.fill('#reg-password', 'senha-de-teste-123');
    await page.check('#reg-mostrar');
    await page.check('#reg-terms');
    await page.check('#reg-privacy');
    await page.click('#form-register button[type="submit"]');
    await page.waitForFunction(() => document.getElementById('msg-register').getAttribute('data-kind') === 'success', null, { timeout: 5000 }).catch(() => null);
    const envio = ctx.chamadas.find((x) => x.action === 'apiRegister');
    const corpo = envio ? JSON.stringify(envio.args) : '';
    v.confere(corpo.includes('"validationPreference":"email"') && corpo.includes('"fullName":"Pessoa de Teste"'), `${rotulo}: cadastro envia os mesmos campos (validação por e-mail)`);
    const depois = await page.evaluate(() => ({ tipo: document.getElementById('reg-password').type, marcado: document.getElementById('reg-mostrar').checked }));
    v.confere(depois.tipo === 'password' && !depois.marcado, `${rotulo}: depois de enviar, a senha volta a ficar oculta`);

    await page.click('#screen-register .auth-voltar');
    await page.waitForSelector('#screen-welcome:not(.hidden)');
    await page.click('.auth-esqueci');
    await page.waitForSelector('#screen-forgot:not(.hidden)');
    await page.waitForTimeout(100);
    const foco2 = await page.evaluate(() => document.activeElement && document.activeElement.id);
    v.confere(foco2 === 'forgot-title', `${rotulo}: "Esqueci minha senha" leva o foco ao título da tela (${foco2})`);

    const sobra = await v.axeSerio(page);
    v.confere(sobra.length === 0, `${rotulo}: axe sem violação séria${sobra.length ? ': ' + sobra.join(', ') : ''}`);
    v.confere(erros.length === 0, `${rotulo}: sem erro de JavaScript${erros.length ? ': ' + erros.join(' | ') : ''}`);
  } finally {
    await aberto.fechar();
  }
}

async function cadastroAberto(app) {
  const aberto = await app.abrir('#cadastro', { largura: 375, altura: 812, flags: FLAGS });
  try {
    await aberto.page.waitForSelector('#screen-register:not(.hidden)', { timeout: 15000 });
    if (!v.confere((await aberto.page.locator('details.cadastro-opcional > summary').count()) === 1, '/#cadastro: grupo "Completar perfil (opcional)" existe')) return;
    await aberto.page.click('details.cadastro-opcional > summary');
    const dentro = await aberto.page.isVisible('#reg-linkedin');
    v.confere(dentro, '/#cadastro: "Completar perfil (opcional)" abre e mostra os campos opcionais');
    await aberto.page.screenshot({ path: v.captura('cadastro-claro-375-opcional'), fullPage: true });
  } finally {
    await aberto.fechar();
  }
}

(async () => {
  fontes();
  const app = await v.iniciar();
  try {
    await entrada(app, 375, 'light');
    await entrada(app, 1280, 'dark');
    await cadastroAberto(app);
  } finally {
    await app.fechar();
  }
  v.concluir('Lote B entrada e cadastro');
})().catch((e) => { console.error(e); process.exitCode = 1; });
