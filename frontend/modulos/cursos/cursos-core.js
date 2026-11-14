/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Núcleo puro da tela Cursos e da página pública do certificado: texto da aula (subconjunto de Markdown) em nós DOM
// seguros (só createElement e textContent), carga horária, datas, situação da prova e do certificado.
// Sem rede e sem estado. Expõe window.LaiftCursosCore (ou module.exports, no Node).
(function (root) {
  'use strict';

  /** "30 minutos", "1 hora", "1 h 30 min", "2 horas". */
  function workloadText(minutes) {
    var m = Math.max(0, Math.floor(Number(minutes) || 0));
    var h = Math.floor(m / 60);
    var r = m % 60;
    if (!h) return m + (m === 1 ? ' minuto' : ' minutos');
    if (!r) return h + (h === 1 ? ' hora' : ' horas');
    return h + ' h ' + r + ' min';
  }

  /** Data por extenso curta em pt-BR (dd/mm/aaaa), no fuso de Brasília. */
  function dateText(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function dateTimeText(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  /** Frase da situação da prova para a ficha do curso. */
  function examText(exam) {
    var e = exam || {};
    switch (e.state) {
      case 'disponivel': return 'A prova está disponível.';
      case 'em_andamento': return 'Você tem uma prova em andamento até ' + dateTimeText(e.expiresAt) + '.';
      case 'aprovado': return 'Aprovação registrada' + (typeof e.scorePct === 'number' ? ' com ' + e.scorePct + '% de acerto' : '') + '.';
      case 'aulas_pendentes': return 'Leia todas as aulas para liberar a prova.';
      case 'tempo_minimo': return 'A prova abre em ' + dateTimeText(e.readyAt) + ', depois do tempo mínimo de estudo.';
      case 'aguardar': return 'Nova tentativa a partir de ' + dateTimeText(e.retryAt) + '.';
      case 'tentativas_esgotadas': return 'Você usou as ' + (e.maxAttempts || 3) + ' tentativas. Fale com quem instrui o curso.';
      case 'prova_indisponivel': return 'A prova deste curso ainda não está pronta.';
      default: return '';
    }
  }

  function canStart(exam) {
    return Boolean(exam) && (exam.state === 'disponivel' || exam.state === 'em_andamento');
  }

  var CERT_STATUS = { valido: 'Válido', vencido: 'Vencido', revogado: 'Revogado' };
  function certStatusText(status) { return CERT_STATUS[status] || 'Não encontrado'; }

  /** Endereço público de verificação do código (o QR aponta para ele). */
  function verifyUrl(origin, code) {
    return String(origin || '').replace(/\/+$/, '') + '/certificado/' + encodeURIComponent(String(code || ''));
  }

  /** Código a partir do caminho /certificado/<código> ou de ?c=. */
  function codeFromLocation(pathname, search) {
    var m = /\/certificado\/([A-Za-z0-9-]{10,20})\/?$/.exec(String(pathname || ''));
    if (m) return decodeURIComponent(m[1]).toUpperCase();
    var q = /[?&]c=([A-Za-z0-9-]{10,20})/.exec(String(search || ''));
    return q ? q[1].toUpperCase() : '';
  }

  // -------------------------------------------------------------------------------------------------------------
  // Markdown → DOM (subconjunto: ## e ###, parágrafos, listas, tabelas, **negrito** e *itálico*)
  // -------------------------------------------------------------------------------------------------------------

  function inline(doc, parent, text) {
    var re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
    var last = 0;
    var m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(doc.createTextNode(text.slice(last, m.index)));
      var el = doc.createElement(m[2] ? 'strong' : 'em');
      el.textContent = m[2] || m[3];
      parent.appendChild(el);
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.appendChild(doc.createTextNode(text.slice(last)));
    return parent;
  }

  function cells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
  }

  /** Devolve um DocumentFragment com o texto da aula. Nada vira HTML cru. */
  function renderMarkdown(doc, md) {
    var frag = doc.createDocumentFragment();
    var lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    var i = 0;
    function add(tag, text) { var el = doc.createElement(tag); inline(doc, el, text); frag.appendChild(el); return el; }
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      var h = /^(#{2,4})\s+(.*)$/.exec(line);
      if (h) { add(h[1].length === 2 ? 'h3' : 'h4', h[2]); i++; continue; }
      if (/^\s*\|/.test(line)) {
        var table = doc.createElement('table');
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        rows.forEach(function (row, idx) {
          if (/^\s*\|?\s*:?-{2,}/.test(row)) return;
          var tr = doc.createElement('tr');
          cells(row).forEach(function (c) { var td = doc.createElement(idx === 0 ? 'th' : 'td'); inline(doc, td, c); tr.appendChild(td); });
          table.appendChild(tr);
        });
        var wrap = doc.createElement('div');
        wrap.className = 'cr-table';
        wrap.appendChild(table);
        frag.appendChild(wrap);
        continue;
      }
      var listRe = /^\s*([-*]|\d+\.)\s+(.*)$/;
      if (listRe.test(line)) {
        var ordered = /^\s*\d+\./.test(line);
        var list = doc.createElement(ordered ? 'ol' : 'ul');
        while (i < lines.length && listRe.test(lines[i]) && /^\s*\d+\./.test(lines[i]) === ordered) {
          var li = doc.createElement('li');
          inline(doc, li, listRe.exec(lines[i])[2]);
          list.appendChild(li);
          i++;
        }
        frag.appendChild(list);
        continue;
      }
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^#{2,4}\s/.test(lines[i]) && !/^\s*\|/.test(lines[i]) && !listRe.test(lines[i])) {
        para.push(lines[i].trim());
        i++;
      }
      add('p', para.join(' '));
    }
    return frag;
  }

  var api = {
    workloadText: workloadText, dateText: dateText, dateTimeText: dateTimeText, examText: examText, canStart: canStart,
    certStatusText: certStatusText, verifyUrl: verifyUrl, codeFromLocation: codeFromLocation, renderMarkdown: renderMarkdown,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftCursosCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
