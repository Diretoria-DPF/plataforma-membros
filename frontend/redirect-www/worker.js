/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Redireciona www.laift.com.br para o domínio principal. É um Worker separado
// do site (frontend/wrangler.toml) de propósito: assim o site continua só com
// arquivos estáticos e o _headers dele segue valendo. Preserva caminho e
// parâmetros; o fragmento (#...) nunca chega ao servidor.
const CANONICAL_HOST = 'laift.com.br';
const SAFE_METHODS = new Set(['GET', 'HEAD']);

export default {
  fetch(request) {
    const target = new URL(request.url);
    target.protocol = 'https:';
    target.hostname = CANONICAL_HOST;
    target.port = '';
    target.hash = '';
    // 308 mantém o método (POST continua POST); 301 é o padrão para navegação.
    const status = SAFE_METHODS.has(request.method) ? 301 : 308;
    return Response.redirect(target.toString(), status);
  },
};
