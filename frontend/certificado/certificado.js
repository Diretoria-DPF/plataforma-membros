/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Página pública de conferência do certificado (/certificado/<código>). Sem sessão: chama apiCertificateVerify,
// que devolve só situação, nome, curso, carga horária e datas (LGPD). Só textContent.
(function (root) {
  'use strict';

  var doc = root.document;
  var Core = root.LaiftCursosCore;
  var form = doc.getElementById('cv-form');
  var codeInput = doc.getElementById('cv-code');
  var nameInput = doc.getElementById('cv-name');
  var submit = doc.getElementById('cv-submit');
  var result = doc.getElementById('cv-result');
  var TIMEOUT_MS = 15000;

  function apiBase() {
    var host = root.location.hostname;
    if (host === 'laift.com.br' || host === 'www.laift.com.br') return 'https://api.laift.com.br';
    if (host === 'staging.laift.com.br') return 'https://staging-api.laift.com.br';
    return 'https://plataforma-membros-api.diretoria-dpf.workers.dev';
  }

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function show(cls, title, rows) {
    while (result.firstChild) result.removeChild(result.firstChild);
    result.className = 'cv-result ' + cls;
    result.appendChild(el('p', 'cv-status', title));
    if (rows && rows.length) {
      var dl = el('dl');
      rows.forEach(function (r) { dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1])); });
      result.appendChild(dl);
    }
    result.focus();
  }

  function render(body) {
    if (!body || body.success !== true) { show('cv-result--nao', (body && body.message) || 'Não foi possível conferir agora. Tente de novo.'); return; }
    if (body.enabled === false) { show('cv-result--nao', 'A conferência de certificados ainda não está disponível.'); return; }
    if (!body.found) { show('cv-result--nao', 'Certificado não encontrado. Confira o código e, se pedido, o nome completo.'); return; }
    var rows = [['Nome', body.holderName], ['Curso', body.courseTitle], ['Carga horária', Core.workloadText(body.workloadMinutes)], ['Concluído em', Core.dateText(body.issuedAt)]];
    if (body.validUntil) rows.push(['Válido até', Core.dateText(body.validUntil)]);
    show('cv-result--' + body.status, 'Certificado ' + Core.certStatusText(body.status).toLowerCase(), rows);
  }

  function verify(code, name) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    submit.disabled = true;
    var input = { code: code };
    if (name) input.name = name;
    return fetch(apiBase(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', signal: controller.signal,
      body: JSON.stringify({ action: 'apiCertificateVerify', args: [input] }),
    }).then(function (res) { return res.json(); }).then(render).catch(function () {
      show('cv-result--nao', 'Não foi possível conferir agora. Verifique a conexão e tente de novo.');
    }).then(function () { clearTimeout(timer); submit.disabled = false; });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var code = codeInput.value.trim();
    if (!code) { show('cv-result--nao', 'Digite o código do certificado.'); return; }
    verify(code, nameInput.value.trim());
  });

  var fromUrl = Core.codeFromLocation(root.location.pathname, root.location.search);
  if (fromUrl) { codeInput.value = fromUrl; verify(fromUrl, ''); }
})(window);
