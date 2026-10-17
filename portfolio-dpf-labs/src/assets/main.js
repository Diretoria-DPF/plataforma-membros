// DPF Labs — interações do portfólio (JS puro, sem dependências).
(function () {
  'use strict';
  var d = document;
  d.documentElement.classList.add('js');

  // Menu móvel
  var toggle = d.querySelector('.nav-toggle');
  var links = d.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Revelar ao rolar
  var reveals = d.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  // Seção ativa: menu superior e menu lateral
  var sections = ['hero', 'about', 'platform', 'modules', 'path', 'contact']
    .map(function (id) { return d.getElementById(id); }).filter(Boolean);
  var hud = d.querySelector('.side-hud');
  var hudItems = hud ? hud.querySelectorAll('li') : [];
  var navLinks = d.querySelectorAll('.nav-links a[data-section]');
  var hideTimer;
  function updateActive() {
    var mid = window.scrollY + window.innerHeight * 0.4;
    var current = sections.length ? sections[0].id : '';
    sections.forEach(function (s) { if (s.offsetTop <= mid) current = s.id; });
    hudItems.forEach(function (li) { li.classList.toggle('active', li.getAttribute('data-target') === current); });
    navLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-section') === current); });
  }
  if (sections.length) {
    window.addEventListener('scroll', function () {
      updateActive();
      if (hud) {
        if (window.scrollY > 120) hud.classList.add('open');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function () { hud.classList.remove('open'); }, 1800);
      }
    }, { passive: true });
    updateActive();
    hudItems.forEach(function (li) {
      li.addEventListener('click', function () {
        var t = d.getElementById(li.getAttribute('data-target'));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // Filtro de módulos
  var chips = d.querySelectorAll('.chip');
  var cards = d.querySelectorAll('.modules-grid .module');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var f = chip.getAttribute('data-filter');
      chips.forEach(function (c) { c.classList.toggle('active', c === chip); });
      cards.forEach(function (card) {
        var show = f === 'all' ||
          (f === 'ai' ? card.getAttribute('data-ai') === '1' : (card.getAttribute('data-areas') || '').split(' ').indexOf(f) !== -1);
        card.hidden = !show;
      });
    });
  });

  // Copiar e-mail
  d.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var label = btn.querySelector('span');
      var original = label ? label.textContent : '';
      function done() { if (label) { label.textContent = btn.getAttribute('data-done'); setTimeout(function () { label.textContent = original; }, 1800); } }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });

  // Imprimir
  d.querySelectorAll('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
})();
