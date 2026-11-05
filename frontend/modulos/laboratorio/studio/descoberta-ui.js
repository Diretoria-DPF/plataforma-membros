/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * descoberta-ui.js — painel "Análogos" do Estúdio 3D (O7).
 *
 * Gera ideias de análogos da molécula selecionada (reação estrutural com RDKit,
 * sob demanda), compara cada uma com a original (propriedades lado a lado,
 * regras de Lipinski e Veber, alertas estruturais) e deixa abrir o análogo no
 * 3D. O portão de segurança (descoberta-core.js) vale para este painel, para o
 * painel de bioisosterismo e para as edições de átomo. O seed (nível de
 * conteúdo) só é buscado ao usar a Descoberta; se não carregar, nega.
 * Depende de: LaiftDom, LaiftChemCore, LaiftDescoberta, LaiftEstudioPonte (studio.js).
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var html = global.LaiftDom.html;
  var setHtml = global.LaiftDom.setHtml;
  var SEED_URL = '../data/lab-seed.js';
  var LIMITE_ANALOGOS = 12;
  var seedPromise = null;
  var estado = { original: null, analogos: [], propsCache: {} };

  function msg(texto, tom) { return html`<div class="studio-empty-msg${tom ? ' is-' + tom : ''}">${texto}</div>`; }

  /** Carrega o seed sob demanda (script do mesmo domínio). Resolve com o seed ou null. */
  function carregarSeed() {
    if (global.LAB_SEED) return Promise.resolve(global.LAB_SEED);
    if (seedPromise) return seedPromise;
    seedPromise = new Promise(function (resolve) {
      var s = doc.createElement('script');
      s.src = SEED_URL;
      s.onload = function () { resolve(global.LAB_SEED || null); };
      s.onerror = function () { seedPromise = null; resolve(null); };
      doc.head.appendChild(s);
    });
    return seedPromise;
  }

  /**
   * Portão assíncrono. Falha fechada: sem seed, sem módulo ou sem RDKit, nega.
   * O RDKit é necessário para as classes estruturais (SMILES livre).
   */
  async function verificarPermissao(composto) {
    if (!composto) return { permitido: false, codigo: 'sem_composto', motivo: 'Selecione uma molécula.' };
    var seed = await carregarSeed();
    if (!seed || !global.LaiftDescoberta) {
      return { permitido: false, codigo: 'sem_verificacao', motivo: 'Não foi possível verificar a molécula agora. Tente de novo em instantes.' };
    }
    var ponte = global.LaiftEstudioPonte;
    var rdkit = ponte ? await ponte.carregarRDKit() : null;
    if (!rdkit) {
      return { permitido: false, codigo: 'sem_rdkit', motivo: 'A verificação estrutural exige o RDKit, que não está disponível agora.' };
    }
    return global.LaiftDescoberta.avaliarPermissao(composto, seed, rdkit);
  }

  function fmt(v, casas) { return v === null || v === undefined ? '--' : Number(v).toFixed(casas); }
  function sinal(v, casas) { return v === null ? '--' : (v >= 0 ? '+' : '') + v.toFixed(casas); }

  function selo(rotulo, r) {
    if (!r.disponivel) return html`<span class="cadd-badge badge-pending">${rotulo}: sem dado</span>`;
    var classe = r.conforme ? 'badge-approved' : 'badge-rejected';
    return html`<span class="cadd-badge ${classe}">${rotulo}: ${r.violacoes === 0 ? 'conforme' : r.violacoes + ' fora'}</span>`;
  }

  function itemAlerta(titulo, itens) {
    return itens.length ? html`<li>${titulo}: ${itens.join(', ')}</li>` : '';
  }

  function tabelaComparacao(c) {
    var linhas = c.linhas.map(function (l) {
      return html`<tr><td><strong>${l.rotulo}</strong></td><td>${fmt(l.original, l.casas)}</td><td>${fmt(l.analogo, l.casas)}</td><td>${sinal(l.delta, l.casas)}</td><td>${l.leitura}</td></tr>`;
    });
    return html`<table class="delta-table"><thead><tr><th>Propriedade</th><th>Original</th><th>Análogo</th><th>Variação</th><th>Leitura</th></tr></thead><tbody>${linhas}</tbody></table><div class="lipinski-metrics-row">${selo('Lipinski original', c.lipinski.original)}${selo('Lipinski análogo', c.lipinski.analogo)}${selo('Veber original', c.veber.original)}${selo('Veber análogo', c.veber.analogo)}</div><ul class="studio-list-plain">${itemAlerta('Alerta estrutural novo', c.alertas.novos)}${itemAlerta('Alerta estrutural removido', c.alertas.removidos)}${itemAlerta('Alerta estrutural mantido', c.alertas.mantidos)}</ul><p class="bio-card-desc">${c.resumo.join(' ')}</p>`;
  }

  async function propriedadesDe(smiles, massa) {
    if (estado.propsCache[smiles]) return estado.propsCache[smiles];
    var p = await global.LaiftEstudioPonte.propriedades(smiles, massa || 0);
    estado.propsCache[smiles] = p;
    return p;
  }

  function etiquetaDe(a) { return a.sitio ? a.nome + ' (posição ' + a.sitio + ')' : a.nome; }

  global.abrirPainelAnalogos = async function () {
    var modal = doc.getElementById('analogosModal');
    var body = doc.getElementById('analogosModalBody');
    var ponte = global.LaiftEstudioPonte;
    if (!modal || !body || !ponte || !global.LaiftDescoberta) return;
    modal.style.display = 'flex';
    var original = ponte.selecionado();
    if (!original || !original.smiles || original.smiles === '--') {
      setHtml(body, msg('Selecione uma molécula.'));
      return;
    }
    setHtml(body, msg('Verificando a molécula...'));
    var perm = await verificarPermissao(original);
    if (!perm.permitido) {
      setHtml(body, msg(perm.motivo, 'error'));
      return;
    }
    setHtml(body, msg('Gerando ideias de análogos...'));
    var rdkit = await ponte.carregarRDKit();
    if (ponte.selecionado() !== original) return;
    var seed = await carregarSeed();
    var r = global.LaiftDescoberta.gerarAnalogos(rdkit, global.LaiftChemCore, original, { seed: seed, maximo: LIMITE_ANALOGOS });
    estado = { original: original, analogos: r.analogos, propsCache: {} };
    if (!r.permitido) { setHtml(body, msg(r.motivo, 'error')); return; }
    if (!r.analogos.length) {
      setHtml(body, msg('Nenhuma transformação segura se aplica a esta molécula.'));
      return;
    }
    var cartoes = r.analogos.map(function (a, i) {
      return html`<div class="bio-transform-card"><div class="bio-card-top"><span class="bio-card-name">${etiquetaDe(a)}</span><span class="bio-card-scheme">${a.esquema}</span><span class="cadd-badge badge-warning bio-card-tag">${a.tag}</span><p class="bio-card-desc">${a.descricao}</p><div class="studio-smiles-line">${a.smiles}</div></div><button type="button" class="btn-apply-transform" data-action="compararAnalogo" data-arg="${String(i)}">Comparar com a original</button></div>`;
    });
    setHtml(body, html`<div class="bio-detected-groups-panel"><span class="bio-detected-title">Molécula: <strong class="studio-accent-text">${original.nome}</strong></span><div class="studio-smiles-line">${original.smiles}</div></div><p class="bio-card-desc">${global.LaiftDescoberta.AVISO_EDUCACIONAL}</p><div id="analogoComparacaoArea" aria-live="polite"></div><h4 class="studio-section-title">Ideias de análogos (${String(r.analogos.length)}):</h4><div class="bio-transforms-grid">${cartoes}</div>`);
  };

  global.compararAnalogo = async function (indice) {
    var area = doc.getElementById('analogoComparacaoArea');
    var a = estado.analogos[parseInt(indice, 10)];
    if (!area || !a || !estado.original) return;
    setHtml(area, msg('Calculando propriedades...'));
    var massaOriginal = parseFloat(estado.original.molarMass);
    var pA = await propriedadesDe(estado.original.smiles, isNaN(massaOriginal) ? 0 : massaOriginal);
    var pB = await propriedadesDe(a.smiles, 0);
    if (!pA || !pB) { setHtml(area, msg('Não foi possível calcular as propriedades agora.', 'error')); return; }
    var c = global.LaiftDescoberta.compararMoleculas(pA, pB);
    var argsAbrir = JSON.stringify([a.nome, a.smiles, Number(pB.mw.toFixed(2))]);
    setHtml(area, html`<div class="bio-comparison-container"><div class="bio-comparison-header"><span class="bio-comparison-title">✨ ${etiquetaDe(a)}</span><button type="button" class="studio-btn btn-action-transfer" data-action="abrirAnaloNoTresD" data-args="${argsAbrir}">Ver no 3D</button></div>${tabelaComparacao(c)}</div>`);
    area.scrollIntoView({ block: 'nearest' });
  };

  global.abrirAnaloNoTresD = function (nome, smiles, massa) {
    if (typeof global.adicionarDerivadoAoCatalogo !== 'function') return;
    global.adicionarDerivadoAoCatalogo(nome, smiles, massa);
    global.fecharPainelAnalogos();
  };

  global.fecharPainelAnalogos = function () {
    var m = doc.getElementById('analogosModal');
    if (m) m.style.display = 'none';
  };

  global.LaiftDescobertaUI = { verificarPermissao: verificarPermissao, carregarSeed: carregarSeed };
})(window);
