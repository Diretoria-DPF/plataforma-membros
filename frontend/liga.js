/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Página pública da Liga (/liga). Só mostra o CTA de inscrição quando a flag
// pública selection_open está ligada e o link do formulário é válido.
// Todo texto é escrito com textContent (nunca HTML bruto).
(function () {
  'use strict';

  var CICLO_URL = 'liga-ciclo.json';
  var TIMEOUT_MS = 5000;
  var FORMS_PREFIXOS = ['https://docs.google.com/forms/', 'https://forms.gle/'];
  var MENSAGENS = {
    aberto: 'Processo seletivo aberto',
    fechado: 'Inscrições fechadas no momento. Acompanhe @laift.liga.',
    erro: 'Não foi possível verificar agora.'
  };

  // Mesmo mapa de hosts de API_BASE_URL em frontend/app.js.
  function apiBase() {
    var host = window.location.hostname;
    if (host === 'laift.com.br' || host === 'www.laift.com.br') return 'https://api.laift.com.br';
    if (host === 'staging.laift.com.br') return 'https://staging-api.laift.com.br';
    return 'https://plataforma-membros-api.diretoria-dpf.workers.dev';
  }

  function isFormUrlValida(url) {
    if (typeof url !== 'string') return false;
    return FORMS_PREFIXOS.some(function (prefixo) {
      return url.indexOf(prefixo) === 0;
    });
  }

  // Falha de rede ou JSON inválido vira null; a tela mostra o estado de erro.
  function lerCiclo() {
    return fetch(CICLO_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('ciclo');
        return res.json();
      })
      .catch(function () { return null; });
  }

  // Resolve true/false para a flag, ou null se a consulta falhou ou expirou.
  function consultarFlag() {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    return fetch(apiBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'apiGetFeatureFlags', args: [''] }),
      credentials: 'omit',
      signal: controller.signal
    })
      .then(function (res) {
        if (!res.ok) throw new Error('api');
        return res.json();
      })
      .then(function (corpo) {
        if (!corpo || corpo.success !== true) return null;
        return !!corpo.flags && corpo.flags.selection_open === true;
      })
      .catch(function () { return null; })
      .finally(function () { clearTimeout(timer); });
  }

  // Flag ausente ou desligada = fechado. Flag ligada sem link válido = erro.
  function decidirEstado(flagAberta, ciclo) {
    if (flagAberta === null) return 'erro';
    if (flagAberta === false) return 'fechado';
    return ciclo && isFormUrlValida(ciclo.formularioUrl) ? 'aberto' : 'erro';
  }

  function pintarEstado(estado, formUrl) {
    var status = document.getElementById('liga-status');
    var cta = document.getElementById('liga-cta-inscricao');
    if (status) {
      status.setAttribute('data-estado', estado);
      status.textContent = MENSAGENS[estado];
    }
    if (cta && estado === 'aberto') {
      cta.setAttribute('href', formUrl);
      cta.hidden = false;
    }
  }

  function pintarDatas(ciclo) {
    var datas = ciclo && ciclo.datas;
    if (!datas) return;
    var nos = document.querySelectorAll('[data-ciclo-data]');
    Array.prototype.forEach.call(nos, function (no) {
      var chave = no.getAttribute('data-ciclo-data');
      if (Object.prototype.hasOwnProperty.call(datas, chave) && typeof datas[chave] === 'string') {
        no.textContent = datas[chave];
      }
    });
  }

  function iniciar() {
    Promise.all([lerCiclo(), consultarFlag()]).then(function (res) {
      var ciclo = res[0];
      var estado = decidirEstado(res[1], ciclo);
      pintarDatas(ciclo);
      pintarEstado(estado, ciclo && ciclo.formularioUrl);
    });
  }

  iniciar();
})();
