/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Contatos da Liga (Instagram e e-mail) para componentes criados em JS.
// Os endereços vêm do cabeçalho da própria página, que o gerador monta a partir de blog/site.json:
// assim o e-mail existe em um único lugar e nada é duplicado aqui.

/** Clona os links de contato do cabeçalho (ícone + rótulo + aria-label + target) para outro contêiner. */
export function clonarContatos(doc = document) {
  const origem = doc.querySelectorAll('.blog-topo__contatos a');
  return Array.from(origem).map((a) => {
    const copia = a.cloneNode(true);
    copia.classList.add('blog-barra__contato'); // mantém blog-topo__contato: o estilo do botão de contato é o mesmo
    return copia;
  });
}

/** Rola para o topo respeitando movimento reduzido. */
export function voltarAoTopo() {
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduz ? 'auto' : 'smooth' });
}
