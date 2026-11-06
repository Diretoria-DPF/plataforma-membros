/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * qa-mobile-publico.e2e.js — páginas públicas e legais em celular de 320 a 390 px (QA mobile, 2026-11-05):
 * sem rolagem horizontal (a tabela de privacidade pedia 336 px) e com alvos de toque de 44 px
 * ("← Voltar" das páginas legais e links do rodapé público).
 */
const { startApp, check } = require('./harness');

const PHONES = [{ w: 320, h: 568 }, { w: 360, h: 800 }, { w: 390, h: 844 }];
const PAGES = ['privacidade.html', 'termos.html', '404.html', 'liga.html', 'blog.html', 'edital.html', 'processo-seletivo.html', 'biblioteca.html'];

/** Rolagem horizontal da página e controles de navegação (voltar e rodapé) com menos de 44 px. */
function probe() {
  const doc = document.documentElement;
  const small = [];
  document.querySelectorAll('a.back-link, .pub-rodape__links a').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width && (r.width < 43.5 || r.height < 43.5)) small.push((el.textContent || '').trim() + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });
  return { hscroll: doc.scrollWidth - doc.clientWidth, small };
}

module.exports = async function qaMobilePublico() {
  for (const phone of PHONES) {
    const app = await startApp({ role: 'member', viewport: { width: phone.w, height: phone.h } });
    try {
      for (const page of PAGES) {
        const tag = `${phone.w}x${phone.h} ${page}`;
        await app.page.goto(app.baseUrl + page);
        await app.page.waitForTimeout(500);
        const r = await app.page.evaluate(probe);
        check(r.hscroll <= 0, `${tag}: sem rolagem horizontal (${r.hscroll} px a mais)`);
        check(r.small.length === 0, `${tag}: voltar e rodapé com 44 px (${r.small.join(', ')})`);
      }
      check(app.errors.length === 0, `${phone.w}x${phone.h}: sem erros de página (${app.errors.join('; ')})`);
    } finally {
      await app.close();
    }
  }
};
