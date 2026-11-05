/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Cartão "Desempenho" do Perfil (pacote sob demanda "desempenho"; montado por app.js com a flag home_v2_enabled).
// Mostra, só para a própria pessoa e só neste aparelho, o nível de proficiência por competência, a próxima sugestão
// de treino e o atalho para o módulo. Sem nota, sem ranking, sem comparação, sem rede além do arquivo da rubrica.
//
// FORMATO EXTENSÍVEL (Quiz, Atlas e Clínica entram depois): cada módulo registra UMA fonte com
//   registrarFonte({ id: 'lab', nome: 'Laboratório', atalho: { rotulo, abrir() }, carregar() -> Promise<Painel> })
// e o Painel é simples: { itens: [{ id, nome, nivel, rotulo, texto }], sugestao: { id, nome } | null }, em que
// `nivel` é um de NIVEIS (sem_registro < iniciando < em_desenvolvimento < proficiente < dominio). O cartão não
// conhece o módulo: só desenha o que a fonte devolve. A fonte do Laboratório lê laift_lab_boletim_v1 (alimentado
// pela trilha) com a rubrica de trilha_v1.json (limiares em dados).
(function (root) {
  'use strict';

  var NIVEIS = ['sem_registro', 'iniciando', 'em_desenvolvimento', 'proficiente', 'dominio'];
  var CARD_ID = 'profile-desempenho-card';
  var STYLE_HREF = 'desempenho.css';
  var STYLE_ATTR = 'data-desempenho-style';
  var RUBRICA_LAB = 'modulos/laboratorio/data/trilha/trilha_v1.json';
  var ID_FONTE = /^[a-z]{2,20}$/;
  var fontes = [];

  /** Registra (ou troca) a fonte de um módulo. Recusa formato inválido. */
  function registrarFonte(f) {
    if (!f || !ID_FONTE.test(f.id || '') || typeof f.nome !== 'string' || typeof f.carregar !== 'function') throw new Error('fonte de desempenho inválida');
    fontes = fontes.filter(function (x) { return x.id !== f.id; }).concat([f]);
    return fontes.length;
  }

  /** Painel válido: descarta item com nível desconhecido ou texto que não seja string. */
  function normalizarPainel(p) {
    var itens = (p && Array.isArray(p.itens) ? p.itens : []).filter(function (i) {
      return i && typeof i.nome === 'string' && NIVEIS.indexOf(i.nivel) >= 0 && typeof i.rotulo === 'string';
    }).map(function (i) { return { id: String(i.id), nome: i.nome, nivel: i.nivel, rotulo: i.rotulo, texto: typeof i.texto === 'string' ? i.texto : '' }; });
    var s = p && p.sugestao && typeof p.sugestao.nome === 'string' ? { id: String(p.sugestao.id), nome: p.sugestao.nome } : null;
    return { itens: itens, sugestao: s };
  }

  function el(doc, tag, className, text) {
    var n = doc.createElement(tag);
    if (className) n.className = className;
    if (text) n.textContent = text;
    return n;
  }

  function ensureStyles(doc) {
    if (!doc.head || doc.querySelector('link[' + STYLE_ATTR + ']')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute(STYLE_ATTR, '1');
    doc.head.appendChild(link);
  }

  /** Desenha uma fonte dentro do cartão (itens com barra <meter> e valor em texto; sugestão; atalho). */
  function desenharFonte(doc, fonte, painelBruto) {
    var painel = normalizarPainel(painelBruto);
    var sec = el(doc, 'section', 'desemp-fonte');
    sec.setAttribute('aria-label', 'Desempenho: ' + fonte.nome);
    sec.appendChild(el(doc, 'h4', 'desemp-fonte__nome', fonte.nome));
    var lista = el(doc, 'ul', 'desemp-lista');
    painel.itens.forEach(function (i) {
      var li = el(doc, 'li', 'desemp-item');
      li.setAttribute('data-nivel', i.nivel);
      li.appendChild(el(doc, 'span', 'desemp-item__nome', i.nome));
      var m = el(doc, 'meter', 'desemp-item__barra');
      m.setAttribute('min', '0'); m.setAttribute('max', String(NIVEIS.length - 1)); m.setAttribute('value', String(NIVEIS.indexOf(i.nivel)));
      m.setAttribute('aria-label', i.nome + ': ' + i.rotulo);
      li.appendChild(m);
      li.appendChild(el(doc, 'span', 'desemp-item__valor', i.rotulo));
      if (i.texto) li.appendChild(el(doc, 'span', 'desemp-item__texto', i.texto));
      lista.appendChild(li);
    });
    sec.appendChild(lista);
    sec.appendChild(el(doc, 'p', 'desemp-sugestao', painel.sugestao ? 'Praticar ' + painel.sugestao.nome + '.' : 'Nenhum treino sugerido agora: as competências com prática estão proficientes.'));
    if (fonte.atalho && typeof fonte.atalho.abrir === 'function') {
      var b = el(doc, 'button', 'btn desemp-atalho', fonte.atalho.rotulo);
      b.type = 'button';
      b.addEventListener('click', function () { fonte.atalho.abrir(); });
      sec.appendChild(b);
    }
    return sec;
  }

  function limpar(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  /** Cria (uma vez) o cartão no Perfil e preenche cada fonte; falha de uma fonte não derruba as outras. */
  function mount(app, doc) {
    var grid = doc.getElementById('profile-grid');
    if (!grid || !grid.parentNode) return null;
    ensureStyles(doc);
    var card = doc.getElementById(CARD_ID);
    if (!card) {
      card = el(doc, 'section', 'card profile-desempenho-card');
      card.id = CARD_ID;
      card.setAttribute('aria-labelledby', CARD_ID + '-t');
      var t = el(doc, 'h3', '', 'Desempenho');
      t.id = CARD_ID + '-t';
      card.appendChild(t);
      card.appendChild(el(doc, 'p', 'desemp-nota', 'Só você vê este painel. Ele fica neste aparelho e não tem nota, posição nem comparação com outras pessoas.'));
      var corpo = el(doc, 'div', 'desemp-corpo');
      corpo.id = CARD_ID + '-corpo';
      card.appendChild(corpo);
      var ancora = doc.getElementById('profile-desempenho') || grid.nextSibling;
      grid.parentNode.insertBefore(card, ancora);
    }
    var host = doc.getElementById(CARD_ID + '-corpo');
    limpar(host);
    fontes.forEach(function (f) {
      var p;
      try { p = Promise.resolve(f.carregar()); } catch (e) { p = Promise.reject(e); }
      p.then(function (painel) { host.appendChild(desenharFonte(doc, f, painel)); }, function () {
        var s = el(doc, 'section', 'desemp-fonte');
        s.appendChild(el(doc, 'h4', 'desemp-fonte__nome', f.nome));
        s.appendChild(el(doc, 'p', 'desemp-erro', 'Não foi possível carregar este desempenho agora.'));
        host.appendChild(s);
      });
    });
    return card;
  }

  /** Fonte do Laboratório: rubrica em dados + contadores do aparelho (LabBoletim, do mesmo pacote). */
  function fonteLab(win) {
    return {
      id: 'lab', nome: 'Laboratório',
      atalho: { rotulo: 'Abrir a trilha do Laboratório', abrir: function () { if (win.LaiftLearning && win.LaiftLearning.openModule) win.LaiftLearning.openModule('lab'); } },
      carregar: function () {
        return win.fetch(RUBRICA_LAB, { credentials: 'same-origin' }).then(function (r) {
          if (!r.ok) throw new Error('rubrica indisponível');
          return r.json();
        }).then(function (trilha) {
          var B = win.LabBoletim;
          var arm = null;
          try { arm = win.localStorage; } catch (e) { arm = null; }
          var b = B.ler(arm);
          return { itens: B.resumo(b, trilha.boletim), sugestao: B.sugestao(b, trilha.boletim) };
        });
      }
    };
  }

  var api = { NIVEIS: NIVEIS, CARD_ID: CARD_ID, RUBRICA_LAB: RUBRICA_LAB, registrarFonte: registrarFonte, normalizarPainel: normalizarPainel, desenharFonte: desenharFonte, mount: mount, fonteLab: fonteLab, fontes: function () { return fontes.slice(); }, reset: function () { fontes = []; } };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  if (root.LabBoletim) registrarFonte(fonteLab(root));
  root.LaiftDesempenho = api;
})(typeof self !== 'undefined' ? self : this);
