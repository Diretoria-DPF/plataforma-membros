/**
 * fiscal-engine.js — Terminal Fiscal & Portaria (LAIFT)
 *
 * Fase 2 da unificação (docs/PLANO_FASES_2_3_4.md): a presença saiu da
 * planilha do Google Apps Script e vive nos eventos da plataforma. Tudo aqui
 * fala com a Worker por `LaiftApi.call` (modulos/shared/laift-identity.js),
 * que passa pela allowlist da plataforma e leva o token da sessão — o
 * terminal não guarda credencial nenhuma e não existe mais senha fiscal:
 * o servidor exige o papel `admin` em cada apiAdminAttendance*.
 *
 * Regras de front-end seguidas neste arquivo:
 *  - DOM montado só com createElement/textContent (nunca innerHTML ou
 *    document.write com dado) e eventos só por addEventListener;
 *  - o QR lido é repassado cru ao servidor, que confere a assinatura; o
 *    formato antigo sem assinatura (LAIFT:ID:<e-mail>) só PREENCHE o campo
 *    de presença manual, para o admin conferir e confirmar.
 */
(function () {
  'use strict';

  const ROLE_LABELS = { visitor: 'Visitante', member: 'Membro', admin: 'Administrador' };
  const STATUS_LABELS = {
    published: 'publicado', in_progress: 'em andamento', closed: 'encerrado', completed: 'concluído',
  };
  const SEARCH_DEBOUNCE_MS = 350;
  const SAME_QR_COOLDOWN_MS = 4000; // a câmera lê o mesmo QR várias vezes por segundo

  const state = {
    events: [],
    eventId: '',
    participants: [],
    selected: new Map(), // profileId → fullName (seleção sobrevive a novas buscas)
    scanner: null,
    scanBusy: false,
    lastScan: { text: '', at: 0 },
    searchTimer: null,
    searchSeq: 0,
  };

  const $ = (id) => document.getElementById(id);

  /** Construtor de DOM seguro: texto sempre via textContent/TextNode. */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach((key) => {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = String(value);
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    (children || []).forEach((child) => {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clearEl(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function setStatus(message, kind) {
    const banner = $('status');
    banner.textContent = message || '';
    banner.className = 'status-banner' + (kind ? ' ' + kind : '');
    banner.classList.toggle('hidden', !message);
  }

  function api(action, input) {
    if (!window.LaiftApi) return Promise.resolve({ success: false, message: 'Sessão indisponível.' });
    return window.LaiftApi.call(action, input);
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // =========================================================
  // 1. EVENTOS
  // =========================================================

  function currentEvent() {
    return state.events.find((e) => e.id === state.eventId) || null;
  }

  function renderEventSelect() {
    const select = $('fiscalEvent');
    clearEl(select);
    if (!state.events.length) {
      select.appendChild(el('option', { value: '', text: 'Nenhum evento publicado ou em andamento' }));
      select.disabled = true;
      return;
    }
    select.disabled = false;
    state.events.forEach((ev) => {
      const label = ev.title + ' — ' + formatDateTime(ev.eventDate) + ' (' + (STATUS_LABELS[ev.status] || ev.status) + ')';
      select.appendChild(el('option', { value: ev.id, text: label }));
    });
    select.value = state.eventId;
  }

  function updateEventInfo() {
    const ev = currentEvent();
    const info = $('fiscalEventInfo');
    const open = !!(ev && ev.checkInOpen);
    ['scannerStart', 'manualSubmit'].forEach((id) => { $(id).disabled = !open; });
    $('exportCsv').disabled = !ev;
    $('listRegistered').disabled = !ev;
    if (!ev) { info.textContent = ''; return; }
    let text = ev.checkedInCount + ' presente(s) de ' + ev.registeredCount + ' inscrito(s)';
    if (ev.capacity) text += ' · capacidade ' + ev.capacity;
    if (!open) text += ' · check-in fechado (só exportação)';
    info.textContent = text;
    if (!open) stopScanner();
  }

  async function loadEvents() {
    setStatus('Carregando eventos...', 'loading');
    const res = await api('apiAdminAttendanceListEvents');
    if (!res.success) {
      setStatus(res.message || 'Não foi possível carregar os eventos.', 'error');
      return;
    }
    state.events = Array.isArray(res.events) ? res.events : [];
    // Mantém o evento escolhido se ele ainda existir; senão, o primeiro
    // aberto (a Worker já ordena: em andamento, depois publicados).
    if (!currentEvent()) {
      const firstOpen = state.events.find((e) => e.checkInOpen) || state.events[0];
      state.eventId = firstOpen ? firstOpen.id : '';
    }
    renderEventSelect();
    updateEventInfo();
    setStatus('', null);
  }

  function onEventChange() {
    state.eventId = $('fiscalEvent').value;
    state.participants = [];
    renderList('Busque participantes ou veja os inscritos deste evento.');
    updateEventInfo();
  }

  // =========================================================
  // 2. CHECK-IN (comum aos três métodos)
  // =========================================================

  async function checkIn(input) {
    const ev = currentEvent();
    if (!ev) { setStatus('Selecione um evento.', 'error'); return null; }
    if (!ev.checkInOpen) { setStatus('O check-in deste evento está fechado.', 'error'); return null; }

    setStatus('Registrando presença...', 'loading');
    const res = await api('apiAdminAttendanceCheckIn', Object.assign({ eventId: ev.id }, input));
    if (!res.success) {
      setStatus(res.message || 'Não foi possível registrar a presença.', 'error');
      return res;
    }
    const p = res.participant || {};
    setStatus(res.message || 'Presença registrada.', p.alreadyCheckedIn ? 'warning' : 'success');
    if (!p.alreadyCheckedIn) {
      ev.checkedInCount += 1;
      if (p.walkIn) ev.registeredCount += 1;
      updateEventInfo();
    }
    const listed = state.participants.find((x) => x.profileId === p.profileId);
    if (listed) {
      listed.registered = true;
      listed.checkedInAt = p.checkedInAt || listed.checkedInAt || new Date().toISOString();
      renderList();
    }
    return res;
  }

  // =========================================================
  // 3. LEITOR DE QR CODE
  // =========================================================

  function parseQr(text) {
    const value = String(text || '').trim();
    if (value.indexOf('LAIFT:v2:') === 0) return { kind: 'v2', payload: value };
    if (value.indexOf('LAIFT:ID:') === 0) return { kind: 'legacy', identifier: value.slice('LAIFT:ID:'.length) };
    return null;
  }

  async function onScan(decodedText) {
    const now = Date.now();
    if (state.scanBusy) return;
    if (decodedText === state.lastScan.text && now - state.lastScan.at < SAME_QR_COOLDOWN_MS) return;
    state.lastScan = { text: decodedText, at: now };
    state.scanBusy = true;
    try {
      const qr = parseQr(decodedText);
      if (!qr) {
        setStatus('QR Code não reconhecido como credencial LAIFT.', 'error');
      } else if (qr.kind === 'legacy') {
        // Formato antigo: só o e-mail, sem assinatura — qualquer um geraria.
        // Não registra direto: preenche a presença manual para o admin
        // conferir a pessoa e confirmar.
        const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(qr.identifier);
        if (looksLikeEmail) $('manualEmail').value = qr.identifier;
        setStatus(looksLikeEmail
          ? 'Credencial antiga, sem assinatura. Confira a pessoa e confirme em “Presença manual”.'
          : 'Credencial antiga (sem e-mail). Peça para a pessoa abrir a credencial atualizada na área “Aprender”.', 'warning');
      } else {
        await checkIn({ method: 'qr', qrPayload: qr.payload });
      }
    } finally {
      state.scanBusy = false;
    }
  }

  function startScanner() {
    if (state.scanner) return;
    if (typeof window.Html5QrcodeScanner !== 'function') {
      setStatus('Leitor de QR indisponível (a biblioteca não carregou). Use a presença manual ou a lista.', 'error');
      return;
    }
    $('reader').classList.remove('hidden');
    $('scannerStart').classList.add('hidden');
    $('scannerStop').classList.remove('hidden');
    try {
      state.scanner = new window.Html5QrcodeScanner('reader', { fps: 10, qrbox: { width: 240, height: 240 } }, false);
      state.scanner.render(onScan, () => {});
    } catch (err) {
      state.scanner = null;
      stopScanner();
      setStatus('Não foi possível abrir a câmera. Verifique a permissão do navegador.', 'error');
    }
  }

  async function stopScanner() {
    const scanner = state.scanner;
    state.scanner = null;
    if (scanner) {
      try { await scanner.clear(); } catch (err) { /* câmera já liberada */ }
    }
    $('reader').classList.add('hidden');
    $('scannerStart').classList.remove('hidden');
    $('scannerStop').classList.add('hidden');
  }

  // =========================================================
  // 4. PRESENÇA MANUAL (E-MAIL)
  // =========================================================

  async function onManualSubmit(evt) {
    evt.preventDefault();
    const input = $('manualEmail');
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('Digite o e-mail da conta do participante.', 'error');
      input.focus();
      return;
    }
    const res = await checkIn({ method: 'manual', email: email });
    if (res && res.success) input.value = '';
  }

  // =========================================================
  // 5. LISTA / BUSCA DE PARTICIPANTES
  // =========================================================

  function updateSelectedCount() {
    $('selectedCount').textContent = state.selected.size + ' selecionado(s)';
    const all = state.participants.length > 0 && state.participants.every((p) => state.selected.has(p.profileId));
    $('selectAll').checked = all;
    $('printBadges').disabled = state.selected.size === 0;
  }

  function renderList(emptyMessage) {
    const list = $('memberList');
    clearEl(list);
    if (!state.participants.length) {
      list.appendChild(el('li', { className: 'fiscal-empty', text: emptyMessage || 'Nenhum participante encontrado.' }));
      updateSelectedCount();
      return;
    }
    state.participants.forEach((p) => {
      const checkboxId = 'sel-' + p.profileId;
      const checkbox = el('input', { type: 'checkbox', id: checkboxId });
      checkbox.checked = state.selected.has(p.profileId);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selected.set(p.profileId, p.fullName);
        else state.selected.delete(p.profileId);
        updateSelectedCount();
      });

      const meta = [ROLE_LABELS[p.role] || p.role, p.email, p.registered ? 'inscrito' : 'não inscrito'];
      if (p.checkedInAt) meta.push('presente desde ' + formatTime(p.checkedInAt));

      const presenceBtn = el('button', {
        type: 'button', className: 'btn btn-secondary btn-sm', 'data-action': 'presence',
        'aria-label': 'Registrar presença de ' + p.fullName,
      }, [p.checkedInAt ? '✔ Presente' : 'Presença']);
      presenceBtn.disabled = !!p.checkedInAt || !(currentEvent() && currentEvent().checkInOpen);
      presenceBtn.addEventListener('click', () => checkIn({ method: 'lista', profileId: p.profileId }));

      const badgeBtn = el('button', {
        type: 'button', className: 'btn btn-outline btn-sm', 'data-action': 'badge',
        'aria-label': 'Abrir crachá de ' + p.fullName,
      }, ['Crachá']);
      badgeBtn.addEventListener('click', () => openBadge(p));

      list.appendChild(el('li', {
        className: 'fiscal-item' + (p.checkedInAt ? ' is-present' : ''), 'data-profile-id': p.profileId,
      }, [
        checkbox,
        el('label', { for: checkboxId, className: 'fiscal-item-info' }, [
          el('strong', { className: 'fiscal-item-name', text: p.fullName }),
          el('span', { className: 'fiscal-item-meta', text: meta.join(' · ') }),
        ]),
        el('span', { className: 'fiscal-item-actions' }, [presenceBtn, badgeBtn]),
      ]));
    });
    updateSelectedCount();
  }

  async function search(term) {
    const ev = currentEvent();
    if (!ev) { setStatus('Selecione um evento.', 'error'); return; }
    const seq = ++state.searchSeq;
    const list = $('memberList');
    clearEl(list);
    list.appendChild(el('li', { className: 'fiscal-empty', text: term ? 'Buscando...' : 'Carregando inscritos...' }));
    const res = await api('apiAdminAttendanceSearch', { eventId: ev.id, term: term });
    if (seq !== state.searchSeq) return; // resposta de uma busca já substituída
    if (!res.success) {
      state.participants = [];
      renderList(res.message || 'Não foi possível consultar a lista.');
      return;
    }
    state.participants = Array.isArray(res.participants) ? res.participants : [];
    renderList(term ? 'Nenhum participante encontrado.' : 'Ninguém inscrito neste evento ainda.');
  }

  function onSearchInput() {
    clearTimeout(state.searchTimer);
    const term = $('memberSearch').value.trim();
    if (term.length < 2) {
      state.searchSeq++;
      if (!term) return;
      state.participants = [];
      renderList('Digite ao menos 2 caracteres.');
      return;
    }
    state.searchTimer = setTimeout(() => search(term), SEARCH_DEBOUNCE_MS);
  }

  function onSelectAll() {
    const checked = $('selectAll').checked;
    state.participants.forEach((p) => {
      if (checked) state.selected.set(p.profileId, p.fullName);
      else state.selected.delete(p.profileId);
    });
    renderList();
  }

  // =========================================================
  // 6. EXPORTAÇÃO CSV
  // =========================================================

  async function exportCsv() {
    const ev = currentEvent();
    if (!ev) { setStatus('Selecione um evento.', 'error'); return; }
    setStatus('Gerando CSV...', 'loading');
    // excel: BOM UTF-8 + ";" — abre direto, com acentos, no Excel em pt-BR.
    const res = await api('apiAdminAttendanceExportCsv', { eventId: ev.id, excel: true });
    if (!res.success || typeof res.csv !== 'string') {
      setStatus(res.message || 'Não foi possível exportar as presenças.', 'error');
      return;
    }
    const filename = /^[A-Za-z0-9._-]{1,120}$/.test(res.filename || '') ? res.filename : 'presenca.csv';
    const url = URL.createObjectURL(new Blob([res.csv], { type: 'text/csv;charset=utf-8' }));
    const link = el('a', { href: url, download: filename, className: 'hidden' });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus('CSV exportado (' + (Number(res.rows) || 0) + ' linha(s)).', 'success');
  }

  // =========================================================
  // 7. CRACHÁS (individual e em lote)
  // =========================================================

  // Código curto impresso no crachá: identifica sem expor e-mail/CPF.
  function badgeCode(profileId) {
    return String(profileId || '').slice(0, 8).toUpperCase();
  }

  function badgeRole(badge) {
    if (badge.leaguePosition) return 'Diretoria';
    return badge.role === 'visitor' ? 'Visitante' : 'Membro';
  }

  async function fetchBadges(profileIds) {
    const res = await api('apiAdminAttendanceBadges', { profileIds: profileIds });
    if (!res.success || !Array.isArray(res.badges)) {
      setStatus(res.message || 'Não foi possível gerar os crachás.', 'error');
      return null;
    }
    return res.badges;
  }

  /**
   * Crachá individual no estúdio (../cracha/index.html) — mesma interface
   * por parâmetros de sempre (id, nome, cargo, qr), agora com o QR v2. A aba
   * é aberta ANTES da chamada à Worker, ainda dentro do clique, para o
   * bloqueador de pop-up não barrar; sem 'noopener' porque o estúdio acha a
   * plataforma (e a identidade) por window.opener.
   */
  async function openBadge(participant) {
    const win = window.open('about:blank', '_blank');
    if (!win) { setStatus('Libere a abertura de pop-ups para abrir o crachá.', 'error'); return; }
    setStatus('Gerando crachá...', 'loading');
    const badges = await fetchBadges([participant.profileId]);
    if (!badges || !badges.length) {
      win.close();
      if (badges) setStatus('Conta indisponível para crachá.', 'error');
      return;
    }
    const b = badges[0];
    const url = '../cracha/index.html' +
      '?id=' + encodeURIComponent(badgeCode(b.profileId)) +
      '&nome=' + encodeURIComponent(b.fullName) +
      '&cargo=' + encodeURIComponent(badgeRole(b).toUpperCase()) +
      '&qr=' + encodeURIComponent(b.qrPayload);
    win.location.href = new URL(url, window.location.href).href;
    setStatus('', null);
  }

  function qrDataUrl(payload) {
    const qrcode = window.qrcode;
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, 'M');
    qr.addData(payload);
    qr.make();
    return qr.createDataURL(4, 2);
  }

  function buildBadgeCard(b) {
    const initial = (b.fullName || '?').trim().charAt(0).toUpperCase();
    const role = badgeRole(b);
    return el('div', { className: 'badge-card', 'data-profile-id': b.profileId }, [
      el('div', { className: 'badge-header' }, [
        el('div', { className: 'badge-institution', text: 'UNINASSAU SALVADOR' }),
        el('div', { className: 'badge-league', text: 'LIGA ACADÊMICA LAIFT' }),
      ]),
      el('div', { className: 'badge-body' }, [
        el('div', { className: 'badge-visual' }, [
          el('div', { className: 'badge-avatar', text: initial, 'aria-hidden': 'true' }),
          el('img', { className: 'badge-qr', src: qrDataUrl(b.qrPayload), alt: 'QR Code de presença' }),
        ]),
        el('div', { className: 'badge-data' }, [
          el('div', { className: 'badge-name', text: b.fullName }),
          el('div', { className: 'badge-role' + (role === 'Diretoria' ? ' is-board' : ''), text: role }),
          el('div', { className: 'badge-code', text: 'ID ' + badgeCode(b.profileId) }),
        ]),
      ]),
      el('div', { className: 'badge-footer', text: 'Farmacologia Clínica e Toxicologia' }),
    ]);
  }

  async function printSelectedBadges() {
    const ids = Array.from(state.selected.keys());
    if (!ids.length) { setStatus('Selecione participantes na lista para imprimir os crachás.', 'error'); return; }
    if (typeof window.qrcode !== 'function') { setStatus('Gerador de QR indisponível. Recarregue o terminal.', 'error'); return; }
    setStatus('Gerando ' + ids.length + ' crachá(s)...', 'loading');
    const badges = await fetchBadges(ids);
    if (!badges) return;
    if (!badges.length) { setStatus('Nenhuma das contas selecionadas está disponível para crachá.', 'error'); return; }

    const area = $('printArea');
    clearEl(area);
    const sheet = el('div', { className: 'badge-sheet' }, badges.map(buildBadgeCard));
    area.appendChild(sheet);
    document.body.classList.add('is-printing');
    setStatus(badges.length + ' crachá(s) prontos — ' + Math.ceil(badges.length / 8) + ' folha(s) A4.', 'success');
    const cleanup = () => {
      document.body.classList.remove('is-printing');
      clearEl(area);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  // =========================================================
  // 8. INICIALIZAÇÃO
  // =========================================================

  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    $('fiscalEvent').addEventListener('change', onEventChange);
    $('fiscalRefreshEvents').addEventListener('click', loadEvents);
    $('scannerStart').addEventListener('click', startScanner);
    $('scannerStop').addEventListener('click', stopScanner);
    $('manualForm').addEventListener('submit', onManualSubmit);
    $('searchForm').addEventListener('submit', (evt) => {
      evt.preventDefault();
      const term = $('memberSearch').value.trim();
      if (term.length >= 2) search(term);
    });
    $('memberSearch').addEventListener('input', onSearchInput);
    $('listRegistered').addEventListener('click', () => { $('memberSearch').value = ''; search(''); });
    $('selectAll').addEventListener('change', onSelectAll);
    $('exportCsv').addEventListener('click', exportCsv);
    $('printBadges').addEventListener('click', printSelectedBadges);
    window.addEventListener('pagehide', stopScanner); // libera a câmera ao sair
    renderList('Busque participantes ou veja os inscritos deste evento.');
    updateEventInfo();
    loadEvents();
  }

  window.FiscalEngine = { init: init };
})();
