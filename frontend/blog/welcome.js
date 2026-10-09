/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Tela "Bem-vindo à LAIFT" do blog: 1,4 s, uma vez por sessão, "Pular"/Esc/clique fecham.
// Pulada com movimento reduzido e quando a URL já aponta para uma seção (#...). O conteúdo
// já está no DOM; enquanto a tela está aberta o resto da página fica inerte (foco e leitor de tela).
const CHAVE = 'laift-blog-bem-vindo';
const DURACAO_MS = 1400;
const SAIDA_MS = 300;

function jaViu() {
  try { return sessionStorage.getItem(CHAVE) === '1'; } catch (_) { return false; }
}

function marcarVisto() {
  try { sessionStorage.setItem(CHAVE, '1'); } catch (_) { /* sem armazenamento: aparece de novo na próxima visita */ }
}

function iniciar() {
  const tela = document.getElementById('welcome');
  if (!tela) return;
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduz || jaViu() || window.location.hash) { tela.remove(); return; }

  const irmaos = Array.from(document.body.children).filter((n) => n !== tela && n.tagName !== 'SCRIPT');
  let fechada = false;
  let timer = 0;

  const fechar = () => {
    if (fechada) return;
    fechada = true;
    clearTimeout(timer);
    marcarVisto();
    document.removeEventListener('keydown', aoTeclar);
    irmaos.forEach((n) => n.removeAttribute('inert'));
    tela.classList.add('blog-welcome--saindo');
    setTimeout(() => tela.remove(), SAIDA_MS);
  };
  function aoTeclar(e) { if (e.key === 'Escape') fechar(); }

  irmaos.forEach((n) => n.setAttribute('inert', ''));
  tela.hidden = false;
  document.addEventListener('keydown', aoTeclar);
  tela.addEventListener('click', fechar);
  const pular = tela.querySelector('.blog-welcome__pular');
  if (pular) pular.focus({ preventScroll: true });
  timer = setTimeout(fechar, DURACAO_MS);
}

iniciar();
