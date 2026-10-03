/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Aviso de mudança de endereço. Aparece SÓ no endereço antigo (GitHub Pages),
// apontando para laift.com.br. No domínio novo, em localhost e em qualquer
// outro host não faz nada. Monta o DOM com createElement/textContent, sem
// nunca converter texto em HTML, então é compatível com a CSP estrita.
(function (root) {
  'use strict';

  var OLD_HOSTS = ['diretoria-dpf.github.io'];
  var NEW_URL = 'https://laift.com.br/';

  function shouldShowNotice(hostname) {
    return OLD_HOSTS.indexOf(hostname) !== -1;
  }

  function element(doc, tag, text) {
    var node = doc.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function showNotice(doc) {
    var bar = element(doc, 'div');
    bar.className = 'domain-notice';
    bar.setAttribute('role', 'status');
    bar.appendChild(element(doc, 'strong', 'A LAIFT mudou de endereço.'));
    bar.appendChild(element(doc, 'span',
      'Sua conta é a mesma: acesse laift.com.br e entre com seu e-mail e senha de sempre. ' +
      'As conversas antigas da mensageria continuam visíveis só aqui; no novo endereço a mensageria começa do zero.'));
    var link = element(doc, 'a', 'Ir para laift.com.br');
    link.href = NEW_URL;
    bar.appendChild(link);
    doc.body.insertBefore(bar, doc.body.firstChild);
  }

  function init() {
    if (!root.document || !shouldShowNotice(root.location.hostname)) return;
    if (root.document.body) {
      showNotice(root.document);
    } else {
      root.document.addEventListener('DOMContentLoaded', function () { showNotice(root.document); });
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    // Node (testes): só expõe as funções puras, sem tocar em DOM.
    module.exports = { shouldShowNotice: shouldShowNotice, NEW_URL: NEW_URL };
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
