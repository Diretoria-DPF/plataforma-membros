/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Estado do processo seletivo nas páginas /liga, /processo-seletivo e /edital.
// Lê liga-ciclo.json e a flag pública selection_open e pinta os elementos
// marcados com data-*. Elemento ausente = ignora. Todo texto é escrito com
// textContent (nunca HTML bruto).
(function () {
  'use strict';

  var CICLO_URL = 'liga-ciclo.json';
  var TIMEOUT_MS = 5000;
  var FORMS_PREFIXOS = ['https://docs.google.com/forms/', 'https://forms.gle/'];
  var MENSAGENS = {
    aberto: 'Processo seletivo aberto',
    fechado: 'Inscrições fechadas no momento. Acompanhe @laift.liga.',
    continuo: 'Inscrições abertas',
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

  // Resolve { formulario, plataforma } (selection_open e selection_enabled), ou null se a consulta falhou ou expirou.
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
        var flags = corpo.flags || {};
        return { formulario: flags.selection_open === true, plataforma: flags.selection_enabled === true };
      })
      .catch(function () { return null; })
      .finally(function () { clearTimeout(timer); });
  }

  // Processo seletivo dentro da plataforma (flag selection_enabled): visão pública, sem login.
  function consultarVisao() {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    return fetch(apiBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'apiSelectionOverview', args: [''] }),
      credentials: 'omit',
      signal: controller.signal
    })
      .then(function (res) { if (!res.ok) throw new Error('api'); return res.json(); })
      .then(function (corpo) { return corpo && corpo.success === true && corpo.enabled === true ? corpo : null; })
      .catch(function () { return null; })
      .finally(function () { clearTimeout(timer); });
  }

  // "2026-11-05" -> "05/11"
  function diaMes(iso) {
    var m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] : '';
  }

  // Datas do fluxo contínuo: no lugar de "a divulgar".
  function datasContinuas(visao) {
    var proxima = diaMes(visao.nextReviewOn);
    return {
      inscricoes: 'Inscrições abertas',
      analise: proxima ? 'Em lotes · próxima análise: ' + proxima : 'Em lotes, a cada ' + visao.batchEveryDays + ' dias',
      resultado: 'Individual, por e-mail e na plataforma'
    };
  }

  function pintarPlataforma(visao, ciclo) {
    if (!visao || visao.open !== true) { pintarTudo('fechado', ciclo); return; }
    pintarRaiz('aberto');
    var status = document.getElementById('liga-status');
    if (status) { status.setAttribute('data-estado', 'aberto'); status.textContent = MENSAGENS.continuo; }
    pintarBlocos('aberto');
    Array.prototype.forEach.call(document.querySelectorAll('a[data-formulario]'), function (link) {
      link.setAttribute('href', './#inscricao');
      link.removeAttribute('target');
      link.removeAttribute('rel');
    });
    pintarCiclo({ datas: datasContinuas(visao), vagas: visao.vacanciesNote || (ciclo && ciclo.vagas) });
  }

  // Flag ausente ou desligada = fechado. Flag ligada sem link válido = erro.
  function decidirEstado(flagAberta, ciclo) {
    if (flagAberta === null) return 'erro';
    if (flagAberta === false) return 'fechado';
    return ciclo && isFormUrlValida(ciclo.formularioUrl) ? 'aberto' : 'erro';
  }

  function textoValido(valor) {
    return typeof valor === 'string' && valor.trim() !== '';
  }

  function pintarRaiz(estado) {
    document.documentElement.setAttribute('data-processo', estado);
  }

  function pintarStatus(estado) {
    var status = document.getElementById('liga-status');
    if (!status) return;
    status.setAttribute('data-estado', estado);
    status.textContent = MENSAGENS[estado];
  }

  function pintarBlocos(estado) {
    var aberto = estado === 'aberto';
    Array.prototype.forEach.call(document.querySelectorAll('[data-se-aberto]'), function (no) {
      no.hidden = !aberto;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-se-fechado]'), function (no) {
      no.hidden = aberto;
    });
  }

  function pintarFormularios(estado, formUrl) {
    if (estado !== 'aberto') return;
    Array.prototype.forEach.call(document.querySelectorAll('a[data-formulario]'), function (link) {
      link.setAttribute('href', formUrl);
    });
  }

  function pintarCiclo(ciclo) {
    var datas = ciclo && ciclo.datas;
    Array.prototype.forEach.call(document.querySelectorAll('[data-ciclo-data]'), function (no) {
      var chave = no.getAttribute('data-ciclo-data');
      var valor = datas && Object.prototype.hasOwnProperty.call(datas, chave) ? datas[chave] : null;
      if (textoValido(valor)) no.textContent = valor;
    });
    var vagas = ciclo && ciclo.vagas;
    Array.prototype.forEach.call(document.querySelectorAll('[data-ciclo-vagas]'), function (no) {
      if (textoValido(vagas)) no.textContent = vagas;
    });
  }

  // Não depende da flag: o botão de imprimir funciona mesmo com a API lenta.
  function ligarImpressao() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-imprimir]'), function (no) {
      no.hidden = false;
      no.addEventListener('click', function () { window.print(); });
    });
  }

  function pintarTudo(estado, ciclo) {
    pintarRaiz(estado);
    pintarStatus(estado);
    pintarBlocos(estado);
    pintarFormularios(estado, ciclo && ciclo.formularioUrl);
    pintarCiclo(ciclo);
  }

  function iniciar() {
    ligarImpressao();
    Promise.all([lerCiclo(), consultarFlag()])
      .then(function (res) {
        var flags = res[1];
        if (flags && flags.plataforma) return consultarVisao().then(function (visao) { pintarPlataforma(visao, res[0]); });
        pintarTudo(decidirEstado(flags ? flags.formulario : null, res[0]), res[0]);
      })
      .catch(function () {
        pintarTudo('erro', null);
      });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { decidirEstado: decidirEstado, isFormUrlValida: isFormUrlValida };
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
