/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Mapa sob demanda da página /liga. Nada sai do site até a pessoa clicar em
// "Ver o mapa aqui": só então o iframe do OpenStreetMap é criado. O link
// "Abrir no app de mapas" escolhe o destino pelo aparelho (destinoDoApp).
// Todo texto é escrito com textContent (nunca HTML bruto).
(function () {
  'use strict';

  var ROTULO = 'UNINASSAU';
  var TITULO_FRAME = 'Mapa do OpenStreetMap: UNINASSAU - Salvador, Rua dos Maçons, 364, Salvador-Bahia';
  var SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox';
  var REFERRER = 'strict-origin-when-cross-origin';
  var CREDITO_URL = 'https://www.openstreetmap.org/copyright';
  var BBOX_LON = 0.0025;
  var BBOX_LAT = 0.0016;
  var NUMERO = /^-?\d{1,3}(\.\d+)?$/;

  function arredondar(valor) {
    return Number(valor.toFixed(5));
  }

  // Coordenadas válidas viram números; qualquer outra coisa vira null.
  function lerCoordenadas(mapa) {
    var lat = mapa.getAttribute('data-lat') || '';
    var lon = mapa.getAttribute('data-lon') || '';
    if (!NUMERO.test(lat) || !NUMERO.test(lon)) return null;
    var latN = Number(lat);
    var lonN = Number(lon);
    if (latN < -90 || latN > 90 || lonN < -180 || lonN > 180) return null;
    return { lat: latN, lon: lonN };
  }

  function urlsDoMapa(lat, lon, rotulo) {
    var la = Number(lat);
    var lo = Number(lon);
    var par = la + ',' + lo;
    var nome = encodeURIComponent(rotulo);
    var bbox = [
      arredondar(lo - BBOX_LON),
      arredondar(la - BBOX_LAT),
      arredondar(lo + BBOX_LON),
      arredondar(la + BBOX_LAT)
    ].join(',');
    return {
      geo: 'geo:' + par + '?q=' + par + '(' + nome + ')',
      apple: 'https://maps.apple.com/?ll=' + par + '&q=' + nome + '&z=17',
      google: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(par),
      osm: 'https://www.openstreetmap.org/?mlat=' + la + '&mlon=' + lo + '#map=18/' + la + '/' + lo,
      embed: 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) +
        '&layer=mapnik&marker=' + encodeURIComponent(par)
    };
  }

  // iPhone, iPad e iPod, ou Mac com toque (iPadOS em modo desktop) = ios.
  function destinoDoApp(env) {
    var e = env || {};
    var ua = String(e.ua || '');
    var platform = String(e.platform || '');
    var toque = Number(e.maxTouchPoints || 0);
    if (/iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && toque > 0)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'outro';
  }

  function escolherUrl(urls, destino) {
    if (destino === 'ios') return urls.apple;
    if (destino === 'android') return urls.geo;
    return urls.google;
  }

  // Aviso oculto para leitor de tela enquanto o link abre em nova aba.
  function marcarNovaAba(link, abreNovaAba) {
    var marca = link.querySelector('.laift-sr-only');
    if (!abreNovaAba) {
      if (marca) link.removeChild(marca);
      return;
    }
    if (marca) return;
    var aviso = document.createElement('span');
    aviso.className = 'laift-sr-only';
    aviso.textContent = ' (abre em nova aba)';
    link.appendChild(aviso);
  }

  function pintarLinkApp(link, urls, env) {
    var destino = destinoDoApp(env);
    link.setAttribute('href', escolherUrl(urls, destino));
    if (destino === 'outro') {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      marcarNovaAba(link, true);
    } else {
      link.removeAttribute('target');
      link.removeAttribute('rel');
      marcarNovaAba(link, false);
    }
  }

  function ambienteDoNavegador() {
    return {
      ua: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints
    };
  }

  function criarFrame(urls) {
    var frame = document.createElement('iframe');
    frame.className = 'lp-mapa__frame';
    frame.setAttribute('src', urls.embed);
    frame.setAttribute('title', TITULO_FRAME);
    frame.setAttribute('referrerpolicy', REFERRER);
    frame.setAttribute('sandbox', SANDBOX);
    return frame;
  }

  function criarCredito() {
    var p = document.createElement('p');
    p.className = 'lp-mapa__credito';
    p.appendChild(document.createTextNode('© '));
    var a = document.createElement('a');
    a.setAttribute('href', CREDITO_URL);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.textContent = 'colaboradores do OpenStreetMap';
    var aviso = document.createElement('span');
    aviso.className = 'laift-sr-only';
    aviso.textContent = ' (abre em nova aba)';
    a.appendChild(aviso);
    p.appendChild(a);
    return p;
  }

  // Só o clique cria o iframe: antes disso não há requisição a terceiros.
  function carregarMapa(mapa, urls) {
    var capa = mapa.querySelector('.lp-mapa__capa');
    var status = mapa.querySelector('[data-mapa-status]');
    if (!capa) return;
    var frame = criarFrame(urls);
    capa.parentNode.replaceChild(frame, capa);
    frame.parentNode.insertBefore(criarCredito(), frame.nextSibling);
    if (status) status.textContent = 'Mapa carregado.';
    frame.focus();
  }

  function iniciarMapa(mapa) {
    var coord = lerCoordenadas(mapa);
    if (!coord) return;
    var urls = urlsDoMapa(coord.lat, coord.lon, ROTULO);
    var link = document.querySelector('a[data-mapa-app]');
    if (link) pintarLinkApp(link, urls, ambienteDoNavegador());
    var botao = mapa.querySelector('.lp-mapa__carregar');
    if (!botao) return;
    botao.removeAttribute('hidden');
    botao.addEventListener('click', function () {
      carregarMapa(mapa, urls);
    }, { once: true });
  }

  function iniciar() {
    var mapas = document.querySelectorAll('.lp-mapa');
    Array.prototype.forEach.call(mapas, function (mapa) {
      iniciarMapa(mapa);
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { destinoDoApp: destinoDoApp, urlsDoMapa: urlsDoMapa };
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
