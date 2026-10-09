/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Comportamento das páginas de post: barra de progresso de leitura e barra flutuante
// (Instagram, e-mail e "Voltar ao topo"). Só CSSOM e classes: a CSP não permite estilo inline.
import { clonarContatos, voltarAoTopo } from '/blog/contato.js';

const MOSTRAR_BARRA_APOS_PX = 480;

function criarProgresso() {
  const barra = document.createElement('div');
  barra.className = 'blog-progresso';
  barra.setAttribute('aria-hidden', 'true');
  document.body.prepend(barra);
  return barra;
}

function criarBarra() {
  const barra = document.createElement('aside');
  barra.className = 'blog-barra';
  barra.setAttribute('aria-label', 'Atalhos');
  clonarContatos().forEach((a) => barra.appendChild(a));
  const topo = document.createElement('button');
  topo.type = 'button';
  topo.className = 'blog-topo-btn';
  topo.textContent = 'Voltar ao topo';
  topo.addEventListener('click', voltarAoTopo);
  barra.appendChild(topo);
  document.body.appendChild(barra);
  return barra;
}

function iniciar() {
  if (!document.querySelector('.blog-artigo')) return;
  const progresso = criarProgresso();
  const barra = criarBarra();
  let agendado = false;

  const atualizar = () => {
    agendado = false;
    const total = document.documentElement.scrollHeight - window.innerHeight;
    const fracao = total > 0 ? Math.min(1, window.scrollY / total) : 0;
    progresso.style.setProperty('--p', fracao.toFixed(3));
    barra.classList.toggle('blog-barra--visivel', window.scrollY > MOSTRAR_BARRA_APOS_PX);
  };
  window.addEventListener('scroll', () => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(atualizar);
  }, { passive: true });
  atualizar();
}

iniciar();
