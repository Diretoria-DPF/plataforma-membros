/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Contatos da Liga (Instagram e e-mail) para componentes criados em JS.
// Os links vêm do bloco "Fale com a Liga" (blog-contato__lista) que toda página do blog traz, montado pelo gerador
// a partir de blog/site.json: assim o e-mail existe em um único lugar e nada é duplicado aqui.

/**
 * Clona os links do primeiro bloco "Fale com a Liga" da página (ícone + rótulo + aria-label + target)
 * para outro contêiner. Sem o bloco, devolve [].
 */
export function clonarContatos(doc = document) {
  const lista = doc.querySelector('.blog-contato__lista');
  if (!lista) return [];
  return Array.from(lista.querySelectorAll('a')).map((a) => {
    const copia = a.cloneNode(true);
    copia.classList.remove('blog-contato__item');
    copia.classList.add('blog-topo__contato', 'blog-barra__contato'); // o estilo do botão de contato continua o mesmo
    return copia;
  });
}

/** Rola para o topo respeitando movimento reduzido. */
export function voltarAoTopo() {
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduz ? 'auto' : 'smooth' });
}
