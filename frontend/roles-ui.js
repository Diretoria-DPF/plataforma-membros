/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Cargos funcionais na interface (ADR 0010, ROL-03). Um elemento com data-cap="events.manage" só aparece para quem tem
// a capacidade (o admin tem todas); vários valores separados por espaço valem "qualquer um". data-cap-cargo marca o que
// é só para quem tem cargo (o menu Gestão): o admin já tem tudo no modo admin e não vê a cópia. O crachá do cabeçalho
// mostra o papel e os cargos. Só classes e textContent (CSP sem inline, nada de innerHTML). Mostrar ou esconder aqui
// não é controle de acesso: a Worker confere a capacidade em toda chamada.
(function (root) {
  'use strict';

  var BASE_NAMES = { visitor: 'Visitante', member: 'Membro', admin: 'Administrador' };
  var ROLE_NAMES = {
    gestor: 'Gestor',
    revisor_conteudo: 'Revisor de conteúdo',
    moderador: 'Moderador',
    curador: 'Curador',
    mentor: 'Mentor',
  };

  function listOf(value) {
    return Array.isArray(value) ? value.filter(function (v) { return typeof v === 'string'; }) : [];
  }

  /** A pessoa tem a capacidade? Admin: todas. Sem perfil: nenhuma. */
  function hasCap(profile, cap) {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    return listOf(profile.capabilities).indexOf(cap) !== -1;
  }

  /** Valor de data-cap ("a b" = qualquer uma). Vazio: nunca. */
  function capAllowed(profile, attr) {
    var caps = String(attr || '').split(/\s+/).filter(Boolean);
    return caps.some(function (cap) { return hasCap(profile, cap); });
  }

  /** O elemento deve aparecer? data-cap-cargo esconde a cópia do menu Gestão para o admin. */
  function isVisible(profile, attr, onlyForRoles) {
    if (onlyForRoles && profile && profile.role === 'admin') return false;
    return capAllowed(profile, attr);
  }

  /** Nomes dos cargos conhecidos, na ordem recebida. */
  function roleNames(profile) {
    return listOf(profile && profile.functionalRoles)
      .filter(function (r) { return Object.prototype.hasOwnProperty.call(ROLE_NAMES, r); })
      .map(function (r) { return ROLE_NAMES[r]; });
  }

  /** Texto do crachá: "Membro · Gestor, Curador". */
  function badgeText(profile) {
    if (!profile) return '';
    var base = BASE_NAMES[profile.role] || String(profile.role || '');
    var names = roleNames(profile);
    return names.length ? base + ' · ' + names.join(', ') : base;
  }

  function apply(doc, profile) {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-cap]'), function (el) {
      var visible = isVisible(profile, el.getAttribute('data-cap'), el.hasAttribute('data-cap-cargo'));
      el.classList.toggle('hidden', !visible);
    });
    var badge = doc.getElementById('header-role-badge');
    if (badge) badge.textContent = badgeText(profile);
    var aviso = doc.getElementById('gestao-mfa-aviso');
    if (aviso) aviso.classList.toggle('hidden', !(profile && profile.roleMfaPending === true));
  }

  /** Atalho para os outros módulos: capacidade da pessoa logada agora. */
  function has(cap) {
    var app = root.App;
    var state = app && typeof app.getState === 'function' ? app.getState() : null;
    return hasCap(state && state.profile, cap);
  }

  var api = {
    BASE_NAMES: BASE_NAMES, ROLE_NAMES: ROLE_NAMES, hasCap: hasCap, capAllowed: capAllowed, isVisible: isVisible,
    roleNames: roleNames, badgeText: badgeText, apply: apply, has: has,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }
  root.LaiftRoles = api;
})(typeof self !== 'undefined' ? self : this);
