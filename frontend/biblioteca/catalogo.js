/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Filtro da página pública /biblioteca (CONTRATO-B2 §2.2). Lê /biblioteca/index.json, mostra o
// formulário só depois de carregar e esconde/mostra cada <li id="a-<id>"> com o atributo hidden.
// Só textContent e hidden; nenhuma marcação entra por string. Copia da regra de busca do Worker:
// `normalizar` precisa ficar igual a searchNorm (worker/src/library/normalize.js, CONTRATO-B1 §5).

const ATRASO_DIGITACAO = 250;
const INDICE_URL = '/biblioteca/index.json';
const VERSAO_INDICE = 1;
const SEARCH_MAX = 4000;
const MSG_VAZIO = 'Nenhum artigo com esses filtros.';

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, SEARCH_MAX)
    .trim();
}

function termosDaBusca(q) {
  const norm = normalizar(q);
  return norm ? norm.split(' ') : [];
}

function anoOuNull(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : null;
}

function textoOuVazio(valor) {
  return typeof valor === 'string' ? valor : '';
}

function passaAno(ano, de, ate) {
  if (de === null && ate === null) return true;
  if (typeof ano !== 'number') return false;
  return (de === null || ano >= de) && (ate === null || ano <= ate);
}

function passaTexto(item, termos) {
  const n = typeof item.n === 'string' ? item.n : '';
  return termos.every((termo) => n.includes(termo));
}

function passaArea(item, area) {
  return !area || (Array.isArray(item.topics) && item.topics.includes(area));
}

/**
 * Itens que casam com a busca e os filtros (todos em AND). Filtro vazio não restringe.
 * @param {Array<object>} itens entradas de index.json (com `n`)
 * @param {{q?: string, area?: string, tipo?: string, de?: unknown, ate?: unknown, aberto?: boolean}} [filtros]
 * @returns {Array<object>} novo array
 */
function filtrar(itens, filtros) {
  const f = filtros || {};
  const termos = termosDaBusca(f.q);
  const area = textoOuVazio(f.area);
  const tipo = textoOuVazio(f.tipo);
  const de = anoOuNull(f.de);
  const ate = anoOuNull(f.ate);
  return itens.filter((item) => (
    passaTexto(item, termos)
    && passaArea(item, area)
    && (!tipo || item.type === tipo)
    && passaAno(item.year, de, ate)
    && (f.aberto !== true || item.openAccess === true)
  ));
}

/**
 * @param {number} total
 * @returns {string} texto do contador (CONTRATO-B2 §2.2)
 */
function contagem(total) {
  if (total === 0) return MSG_VAZIO;
  return total === 1 ? '1 artigo' : `${total} artigos`;
}

function itemValido(item) {
  return !!item && typeof item === 'object' && typeof item.id === 'string' && item.id !== ''
    && typeof item.n === 'string';
}

/**
 * @param {unknown} corpo JSON já lido de /biblioteca/index.json
 * @returns {Array<object> | null} itens válidos, ou null se o formato não bate
 */
function validarIndice(corpo) {
  if (!corpo || typeof corpo !== 'object' || corpo.versao !== VERSAO_INDICE) return null;
  if (!Array.isArray(corpo.items)) return null;
  return corpo.items.filter(itemValido);
}

// ---------- tela (só no navegador) ----------

function lerCampos(doc) {
  return {
    form: doc.querySelector('.bib-filtros'),
    lista: doc.querySelector('.bib-lista'),
    status: doc.getElementById('bib-status'),
    q: doc.getElementById('bib-q'),
    area: doc.getElementById('bib-area'),
    tipo: doc.getElementById('bib-tipo'),
    de: doc.getElementById('bib-ano-de'),
    ate: doc.getElementById('bib-ano-ate'),
    aberto: doc.getElementById('bib-aberto'),
    limpar: doc.querySelector('.bib-limpar'),
  };
}

function criarVazio(doc, lista) {
  const vazio = doc.createElement('p');
  vazio.className = 'bib-vazio';
  vazio.textContent = MSG_VAZIO;
  vazio.hidden = true;
  lista.parentNode.insertBefore(vazio, lista.nextSibling);
  return vazio;
}

function lerFiltros(campos) {
  return {
    q: campos.q.value,
    area: campos.area.value,
    tipo: campos.tipo.value,
    de: campos.de.value,
    ate: campos.ate.value,
    aberto: campos.aberto.checked,
  };
}

function mostrarLinhas(doc, itens, visiveis) {
  const ids = new Set(visiveis.map((item) => item.id));
  itens.forEach((item) => {
    const li = doc.getElementById('a-' + item.id);
    if (li) li.hidden = !ids.has(item.id);
  });
}

function aplicar(tela) {
  const visiveis = filtrar(tela.itens, lerFiltros(tela.campos));
  mostrarLinhas(tela.doc, tela.itens, visiveis);
  tela.campos.status.textContent = contagem(visiveis.length);
  tela.vazio.hidden = visiveis.length !== 0;
}

function limparCampos(campos) {
  campos.q.value = '';
  campos.area.value = '';
  campos.tipo.value = '';
  campos.de.value = '';
  campos.ate.value = '';
  campos.aberto.checked = false;
}

function ligarEventos(tela) {
  const { campos } = tela;
  let temporizador = null;
  const agendar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => aplicar(tela), ATRASO_DIGITACAO);
  };
  const agora = () => {
    clearTimeout(temporizador);
    aplicar(tela);
  };
  campos.form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    agora();
  });
  [campos.q, campos.de, campos.ate].forEach((campo) => campo.addEventListener('input', agendar));
  [campos.area, campos.tipo, campos.aberto].forEach((campo) => campo.addEventListener('change', agora));
  campos.limpar.addEventListener('click', () => {
    clearTimeout(temporizador);
    limparCampos(campos);
    aplicar(tela);
    campos.q.focus();
  });
}

function carregarCatalogo(tela) {
  return fetch(INDICE_URL, { cache: 'no-cache' })
    .then((resposta) => {
      if (!resposta.ok) throw new Error('índice ' + resposta.status);
      return resposta.json();
    })
    .then((corpo) => {
      const itens = validarIndice(corpo);
      if (!itens) throw new Error('índice inválido');
      tela.itens = itens;
      tela.campos.form.hidden = false;
      aplicar(tela);
    })
    .catch((erro) => {
      console.warn('biblioteca: catálogo', erro);
    });
}

function iniciarCatalogo(doc) {
  const campos = lerCampos(doc);
  if (!campos.form || !campos.lista || !campos.status || !campos.q || !campos.limpar) return null;
  const tela = {
    doc,
    campos,
    itens: [],
    vazio: criarVazio(doc, campos.lista),
  };
  ligarEventos(tela);
  return carregarCatalogo(tela);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizar, filtrar, contagem, validarIndice, ATRASO_DIGITACAO };
} else if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => iniciarCatalogo(document));
  } else {
    iniciarCatalogo(document);
  }
}
