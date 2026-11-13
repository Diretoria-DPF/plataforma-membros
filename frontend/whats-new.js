/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Novidades da plataforma (ENG-07; docs/engajamento.md): um aviso curto, uma vez por versão de
// novidades, para quem está logado. Usa o LaiftDialog (foco preso, Esc fecha, foco volta), então é
// acessível e dispensável; não bloqueia nada além do tempo de ler. O conteúdo é a constante ENTRIES
// abaixo (arquivo estático versionado com o código); nada novo vai ao servidor. "Visto" fica em
// localStorage, por versão, só como conveniência: storage bloqueado nunca lança (o aviso volta).
// Carregado sob demanda (pacote "novidades" de lazy-bundles.js), junto com laift-dialog.js.
// Para publicar novidades: troque VERSION e acrescente as entradas. Texto só vira textContent.
(function (root) {
  'use strict';

  /** Versão das novidades: muda a cada nova leva de entradas (AAAA-MM-DD). */
  var VERSION = '2026-11-13';
  var STORAGE_KEY = 'laift_whats_new_seen';
  var TITLE = 'Novidades da plataforma';
  var OK_LABEL = 'Entendi';
  var BULLET = '• ';

  /** `flag`: a entrada só aparece com a flag pública ligada (atributo data-flag-* no <html>). */
  var ENTRIES = Object.freeze([
    Object.freeze({ id: 'guia', text: 'A assistente agora se chama Guia. Ela explica as telas e responde dúvidas, e não altera seus dados.' }),
    Object.freeze({ id: 'dialogos', text: 'Avisos e confirmações dos módulos agora são diálogos acessíveis: funcionam com teclado e leitor de tela, e Esc fecha.' }),
    Object.freeze({ id: 'destaques', flag: 'highlights_enabled', text: 'A Início tem um bloco "Na Liga" com os destaques da Liga.' }),
    Object.freeze({ id: 'demo', text: 'A Demonstração abre a plataforma sem conta e sem salvar nada. Serve para mostrar a LAIFT a outras pessoas.' }),
    Object.freeze({ id: 'qr-rotativo', text: 'O QR de presença dos eventos agora é rotativo: ele troca com o tempo, e a contagem regressiva aparece na tela.' }),
    Object.freeze({ id: 'visao-geral', text: 'A portaria ganhou a Visão geral, com o resumo dos eventos e das presenças.' }),
  ]);

  function flagAttribute(flag) {
    return 'data-flag-' + String(flag).replace(/_/g, '-');
  }

  /** Entradas visíveis: as sem flag e as cuja flag está ligada no documento. */
  function entriesFor(doc) {
    var html = doc && doc.documentElement;
    return ENTRIES.filter(function (entry) {
      if (!entry.flag) return true;
      return !!html && typeof html.hasAttribute === 'function' && html.hasAttribute(flagAttribute(entry.flag));
    });
  }

  /** Uma linha por entrada (o LaiftDialog preserva quebras de linha). */
  function messageFor(entries) {
    return entries.map(function (entry) { return BULLET + entry.text; }).join('\n');
  }

  /** localStorage do navegador; o próprio acesso pode lançar (modo privado, dados bloqueados). */
  function browserStorage(win) {
    try { return (win && win.localStorage) || null; }
    catch (err) { return null; }
  }

  /** "Visto" por versão. Storage ausente, bloqueado ou cheio nunca lança: o aviso só volta a aparecer. */
  function createSeenStore(storage) {
    return {
      isSeen: function (version) {
        try { return !!storage && storage.getItem(STORAGE_KEY) === version; }
        catch (err) { return false; }
      },
      markSeen: function (version) {
        try { if (storage) storage.setItem(STORAGE_KEY, version); }
        catch (err) { /* storage bloqueado: o aviso volta na próxima entrada */ }
      },
    };
  }

  /** Cria as novidades para um documento. Usado pela página e pelos testes. */
  function createWhatsNew(doc, win, store) {
    var open = false;

    /** Abre o aviso agora (também usado por "Ver novidades"). Devolve true quando abriu. */
    function show() {
      var dialog = win && win.LaiftDialog;
      if (open || !dialog || typeof dialog.alert !== 'function') return false;
      var entries = entriesFor(doc);
      if (!entries.length) return false;
      open = true;
      store.markSeen(VERSION);
      Promise.resolve(dialog.alert(messageFor(entries), { title: TITLE, okLabel: OK_LABEL })).then(
        function () { open = false; },
        function () { open = false; }
      );
      return true;
    }

    /** Exibe só se esta versão ainda não foi vista neste aparelho. */
    function maybeShow() {
      if (store.isSeen(VERSION)) return false;
      return show();
    }

    /** Marca a versão como vista sem exibir (primeira entrada: o onboarding já apresenta a plataforma). */
    function markSeen() {
      store.markSeen(VERSION);
    }

    return { maybeShow: maybeShow, show: show, markSeen: markSeen };
  }

  var api = {
    VERSION: VERSION,
    STORAGE_KEY: STORAGE_KEY,
    ENTRIES: ENTRIES,
    entriesFor: entriesFor,
    messageFor: messageFor,
    createSeenStore: createSeenStore,
    createWhatsNew: createWhatsNew,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (root.document) {
    var instance = createWhatsNew(root.document, root, createSeenStore(browserStorage(root)));
    root.LaiftWhatsNew = { maybeShow: instance.maybeShow, show: instance.show, markSeen: instance.markSeen, VERSION: VERSION };
  }
})(typeof window !== 'undefined' ? window : globalThis);
