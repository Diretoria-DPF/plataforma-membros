/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * blog-blocos-campanha.js — blocos das Publicações (série "campanhas") do blog.
 *
 * Contrato: docs/blog/CAMPANHAS.md (seções 1, 2, 3, 6 e 8). Roda no build, nunca no navegador.
 * O texto sai sempre por ctx.esc / ctx.renderInline do gerador; aqui só se monta a estrutura.
 *
 * CLI: node scripts/blog-blocos-campanha.js --checar-parte <arquivo.json>
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BLOCOS_CAMPANHA = ['sumario', 'painel', 'deck', 'comparativo', 'guia', 'faixas', 'habitos', 'referencias'];
const HOSTS_FONTES = Object.freeze([
  'www.gov.br', 'www.inca.gov.br', 'www.planalto.gov.br', 'www.in.gov.br', 'legis.senado.leg.br',
  'www12.senado.leg.br', 'www25.senado.leg.br', 'www.camara.leg.br', 'bvsms.saude.gov.br',
  'datasus.saude.gov.br', 'tabnet.datasus.gov.br', 'www.sei.ba.gov.br', 'doi.org', 'pubmed.ncbi.nlm.nih.gov',
  'pmc.ncbi.nlm.nih.gov', 'www.ncbi.nlm.nih.gov', 'www.who.int', 'iris.who.int', 'gco.iarc.who.int',
  'gco.iarc.fr', 'www.iarc.who.int', 'publications.iarc.who.int', 'monographs.iarc.who.int',
  'www.scielo.br', 'www.thelancet.com', 'www.nejm.org', 'jamanetwork.com', 'ascopubs.org', 'www.nature.com',
  'www.bmj.com', 'acsjournals.onlinelibrary.wiley.com', 'www.cancer.gov', 'seer.cancer.gov', 'www.cancer.org',
  'www.wcrf.org', 'www.paho.org', 'www.ibge.gov.br', 'biblioteca.ibge.gov.br', 'www.saude.ba.gov.br',
  'agenciabrasil.ebc.com.br', 'agenciagov.ebc.com.br', 'www1.folha.uol.com.br', 'g1.globo.com',
  'oglobo.globo.com', 'www.estadao.com.br', 'www.bbc.com',
  'ninho.inca.gov.br', 'rbc.inca.gov.br', 'agenciadenoticias.ibge.gov.br',
]);
const RE_ID = /^[a-z0-9-]{3,48}$/;
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const RE_DOI = /^10\.\d{4,9}\/\S+$/;
const RE_EMOJI = /\p{Extended_Pictographic}/u;
const RE_REF_TEXTO = /#ref-([a-z0-9-]+)/g;
const RE_LINK_PROIBIDO = /[<>"'\s]/;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const VEREDITOS = { mito: 'Mito', verdade: 'Verdade', depende: 'Depende' };
const EFEITOS = {
  protege: 'Ajuda a prevenir', 'reduz-risco': 'Reduz o risco',
  'apoia-tratamento': 'Apoia o tratamento', evitar: 'Evite',
};
const FAIXAS = ['criancas', 'adolescentes', 'jovens', 'adultas', 'idosas', 'homens', 'todas'];
const TIPOS_REF = ['dados', 'artigo', 'lei', 'guia', 'noticia'];
const ROTULOS_COMPARATIVO = ['tema', 'antes', 'agora'];
const FILTROS_DECK = [['todas', 'Todas'], ['mito', 'Mitos'], ['verdade', 'Verdades'], ['depende', 'Depende']];
const INSTRUCAO_PADRAO = 'Toque em cada carta para ver a resposta.';
const AVISO_SAUDE = 'Conteúdo educativo. Não substitui consulta com profissional de saúde. '
  + 'Notou alguma alteração nas mamas? Procure uma Unidade Básica de Saúde.';
// Campos que não são texto exibido (tipo, ids, links, datas, emoji de habitos): ficam fora da checagem de texto.
const NAO_TEXTO = new Set(['t', 'tom', 'href', 'foto', 'icone', 'id', 'ref', 'faixa', 'veredito',
  'efeito', 'tipo', 'acesso', 'doi', 'emoji']);

const ehObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ehTextoNaoVazio = (v) => typeof v === 'string' && v.trim() !== '';
const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const ehNumeroNaoNegativo = (v) => ehNumero(v) && v >= 0;
const ehId = (v) => typeof v === 'string' && RE_ID.test(v);
const ehBloco = (tipo) => (b) => ehObjeto(b) && b.t === tipo;

/** Texto exibido de um valor (strings de campos não técnicos, em qualquer profundidade). */
function textosDe(valor, saida = []) {
  if (typeof valor === 'string') saida.push(valor);
  else if (Array.isArray(valor)) valor.forEach((v) => textosDe(v, saida));
  else if (ehObjeto(valor)) {
    Object.keys(valor).filter((k) => !NAO_TEXTO.has(k)).forEach((k) => textosDe(valor[k], saida));
  }
  return saida;
}

/** Todos os valores do campo `ref` em qualquer profundidade. */
function refsDe(valor, saida = []) {
  if (Array.isArray(valor)) valor.forEach((v) => refsDe(v, saida));
  else if (ehObjeto(valor)) {
    if (typeof valor.ref === 'string') saida.push(valor.ref);
    Object.keys(valor).forEach((k) => refsDe(valor[k], saida));
  }
  return saida;
}

function limiteTexto(valor, nome, max) {
  return max && valor.length > max ? [`${nome} com mais de ${max} caracteres`] : [];
}

function textoObrigatorio(valor, nome, max) {
  if (!ehTextoNaoVazio(valor)) return [`${nome} obrigatório`];
  return limiteTexto(valor, nome, max);
}

function textoOpcional(valor, nome, max) {
  if (valor === undefined) return [];
  if (!ehTextoNaoVazio(valor)) return [`${nome} deve ser texto`];
  return limiteTexto(valor, nome, max);
}

/** Lista com tamanho entre min e max; cada item é validado e as mensagens ganham o número do item. */
function emLista(nome, lista, min, max, validarItem) {
  if (!Array.isArray(lista) || lista.length < min || lista.length > max) {
    return [`${nome}: entre ${min} e ${max} itens`];
  }
  return lista.flatMap((item, i) => {
    const erros = item !== null && typeof item === 'object' ? validarItem(item) : ['item inválido'];
    return erros.map((e) => `${nome} ${i + 1}: ${e}`);
  });
}

function enumValor(valor, lista, nome) {
  return lista.includes(valor) ? [] : [`valor inválido para ${nome}`];
}

function casasValidas(casas) {
  if (casas === undefined) return [];
  return Number.isInteger(casas) && casas >= 0 && casas <= 2 ? [] : ['casas deve ser 0, 1 ou 2'];
}

function refValida(ref, obrigatoria) {
  if (ref === undefined) return obrigatoria ? ['ref obrigatório'] : [];
  return ehId(ref) ? [] : ['ref com formato inválido'];
}

function iconeValido(id, ctx) {
  if (id === undefined) return [];
  if (!ehTextoNaoVazio(id)) return ['icone inválido'];
  return Array.isArray(ctx.icones) && !ctx.icones.includes(id) ? [`icone desconhecido: ${id}`] : [];
}

function emojiValido(emoji) {
  if (typeof emoji !== 'string') return ['emoji obrigatório'];
  const pontos = Array.from(emoji).length;
  if (pontos < 1 || pontos > 8) return ['emoji deve ter de 1 a 8 pontos de código'];
  return RE_EMOJI.test(emoji) ? [] : ['emoji inválido'];
}

function hrefValido(href) {
  if (typeof href !== 'string' || !href) return ['href obrigatório'];
  if (href.length > 300) return ['href com mais de 300 caracteres'];
  if (RE_LINK_PROIBIDO.test(href)) return ['href com caractere não permitido'];
  let url;
  try {
    url = new URL(href);
  } catch {
    return ['href inválido'];
  }
  if (url.protocol !== 'https:') return ['href deve usar https'];
  return HOSTS_FONTES.includes(url.hostname) ? [] : [`host fora da lista de fontes: ${url.hostname}`];
}

function dataValida(valor) {
  if (typeof valor !== 'string' || !RE_ISO.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

function doiValido(doi) {
  if (doi === undefined) return [];
  return typeof doi === 'string' && RE_DOI.test(doi) ? [] : ['doi inválido'];
}

function validarSumario(b) {
  return textoOpcional(b.titulo, 'titulo');
}

function validarKpi(k) {
  return [
    ...(ehNumero(k.valor) ? [] : ['valor deve ser número']),
    ...casasValidas(k.casas),
    ...textoOpcional(k.prefixo, 'prefixo'),
    ...textoOpcional(k.sufixo, 'sufixo'),
    ...textoObrigatorio(k.rotulo, 'rotulo'),
    ...textoOpcional(k.detalhe, 'detalhe'),
    ...refValida(k.ref, false),
  ];
}

function seriesValidas(series) {
  if (series === undefined) return [];
  const ok = Array.isArray(series) && series.length >= 1 && series.length <= 2 && series.every(ehTextoNaoVazio);
  return ok ? [] : ['series: 1 ou 2 nomes'];
}

function validarItemGrafico(item, nSeries) {
  const erros = textoObrigatorio(item.rotulo, 'rotulo');
  const valores = item.valores;
  if (!Array.isArray(valores) || valores.length !== nSeries) {
    return [...erros, `valores: deve ter ${nSeries} número(s), um por série`];
  }
  if (!valores.every(ehNumeroNaoNegativo)) erros.push('valores: números maiores ou iguais a 0');
  return erros;
}

function validarGrafico(g) {
  const nSeries = Array.isArray(g.series) ? g.series.length : 1;
  return [
    ...textoObrigatorio(g.titulo, 'titulo'),
    ...textoOpcional(g.unidade, 'unidade'),
    ...casasValidas(g.casas),
    ...seriesValidas(g.series),
    ...emLista('itens', g.itens, 2, 12, (it) => validarItemGrafico(it, nSeries)),
    ...textoOpcional(g.nota, 'nota'),
    ...refValida(g.ref, false),
  ];
}

function validarLinha(linha, colunas) {
  if (!Array.isArray(linha) || linha.length !== colunas) return [`${colunas} células por linha`];
  return linha.every((c) => typeof c === 'string' || ehNumero(c)) ? [] : ['célula deve ser texto ou número'];
}

function validarTabela(t) {
  const erros = [
    ...textoObrigatorio(t.titulo, 'titulo'),
    ...casasValidas(t.casas),
    ...textoOpcional(t.nota, 'nota'),
    ...refValida(t.ref, false),
  ];
  const colunas = t.colunas;
  if (!Array.isArray(colunas) || colunas.length < 2 || colunas.length > 8 || !colunas.every(ehTextoNaoVazio)) {
    return [...erros, 'colunas: de 2 a 8 textos'];
  }
  return [...erros, ...emLista('linhas', t.linhas, 1, 20, (linha) => validarLinha(linha, colunas.length))];
}

function validarPainel(b) {
  const erros = textoOpcional(b.titulo, 'titulo');
  if (b.kpis === undefined && b.graficos === undefined && b.tabelas === undefined) {
    return [...erros, 'painel sem kpis, graficos ou tabelas'];
  }
  if (b.kpis !== undefined) erros.push(...emLista('kpis', b.kpis, 1, 6, validarKpi));
  if (b.graficos !== undefined) erros.push(...emLista('graficos', b.graficos, 1, 3, validarGrafico));
  if (b.tabelas !== undefined) erros.push(...emLista('tabelas', b.tabelas, 1, 3, validarTabela));
  return erros;
}

function validarCarta(c) {
  return [
    ...textoObrigatorio(c.frase, 'frase', 120),
    ...enumValor(c.veredito, Object.keys(VEREDITOS), 'veredito'),
    ...textoObrigatorio(c.explicacao, 'explicacao', 400),
    ...refValida(c.ref, true),
  ];
}

function validarDeck(b) {
  return [
    ...textoOpcional(b.titulo, 'titulo'),
    ...textoOpcional(b.instrucao, 'instrucao'),
    ...emLista('cartas', b.cartas, 6, 12, validarCarta),
  ];
}

function rotulosValidos(rotulos) {
  if (rotulos === undefined) return [];
  if (!ehObjeto(rotulos)) return ['rotulos deve ser objeto'];
  return ROTULOS_COMPARATIVO.flatMap((chave) => textoOpcional(rotulos[chave], `rotulos.${chave}`));
}

function validarItemComparativo(it) {
  return [
    ...textoObrigatorio(it.tema, 'tema'),
    ...textoObrigatorio(it.antes, 'antes'),
    ...textoObrigatorio(it.agora, 'agora'),
    ...refValida(it.ref, false),
  ];
}

function validarComparativo(b) {
  return [
    ...textoOpcional(b.titulo, 'titulo'),
    ...rotulosValidos(b.rotulos),
    ...emLista('itens', b.itens, 3, 10, validarItemComparativo),
  ];
}

function validarCampoGuia(c) {
  return [...textoObrigatorio(c.rotulo, 'rotulo'), ...textoObrigatorio(c.texto, 'texto')];
}

function validarItemGuia(it, ctx) {
  return [
    ...textoObrigatorio(it.nome, 'nome'),
    ...iconeValido(it.icone, ctx),
    ...emLista('campos', it.campos, 1, 4, validarCampoGuia),
    ...refValida(it.ref, false),
  ];
}

function validarGuia(b, ctx) {
  return [
    ...textoOpcional(b.titulo, 'titulo'),
    ...emLista('itens', b.itens, 2, 10, (it) => validarItemGuia(it, ctx)),
  ];
}

function validarDicas(dicas) {
  if (dicas === undefined) return [];
  const ok = Array.isArray(dicas) && dicas.length <= 5 && dicas.every(ehTextoNaoVazio);
  return ok ? [] : ['dicas: até 5 textos'];
}

function validarFaixa(f) {
  return [
    ...enumValor(f.faixa, FAIXAS, 'faixa'),
    ...textoObrigatorio(f.rotulo, 'rotulo'),
    ...textoOpcional(f.idade, 'idade'),
    ...textoObrigatorio(f.texto, 'texto'),
    ...validarDicas(f.dicas),
    ...refValida(f.ref, false),
  ];
}

function validarFaixas(b) {
  return [...textoOpcional(b.titulo, 'titulo'), ...emLista('itens', b.itens, 3, 7, validarFaixa)];
}

function validarHabito(h) {
  return [
    ...emojiValido(h.emoji),
    ...textoObrigatorio(h.titulo, 'titulo'),
    ...enumValor(h.efeito, Object.keys(EFEITOS), 'efeito'),
    ...textoObrigatorio(h.texto, 'texto'),
    ...refValida(h.ref, true),
  ];
}

function validarHabitos(b) {
  return [...textoOpcional(b.titulo, 'titulo'), ...emLista('itens', b.itens, 4, 10, validarHabito)];
}

function validarReferencia(r) {
  return [
    ...(ehId(r.id) ? [] : ['id com formato inválido']),
    ...textoObrigatorio(r.titulo, 'titulo'),
    ...textoObrigatorio(r.orgao, 'orgao'),
    ...hrefValido(r.href),
    ...doiValido(r.doi),
    ...(dataValida(r.acesso) ? [] : ['acesso deve ser AAAA-MM-DD']),
    ...enumValor(r.tipo, TIPOS_REF, 'tipo'),
  ];
}

function validarReferencias(b) {
  return emLista('itens', b.itens, 1, 60, validarReferencia);
}

// Regras por tipo de bloco (mesmo formato de VALIDAR do gerador: fn(bloco, ctx) -> string[]).
const VALIDAR = {
  sumario: validarSumario,
  painel: validarPainel,
  deck: validarDeck,
  comparativo: validarComparativo,
  guia: validarGuia,
  faixas: validarFaixas,
  habitos: validarHabitos,
  referencias: validarReferencias,
};

/** Lista de problemas de um bloco de campanha (vazia = ok). ctx = { blocos, icones }. */
function validar(bloco, ctx) {
  if (!ehObjeto(bloco) || !BLOCOS_CAMPANHA.includes(bloco.t)) return ['tipo de bloco de campanha desconhecido'];
  const contexto = ctx || {};
  const emojiFora = textosDe(bloco).some((t) => RE_EMOJI.test(t)) ? ['emoji fora de habitos[].emoji'] : [];
  return [...emojiFora, ...VALIDAR[bloco.t](bloco, contexto)];
}

/** Número no padrão brasileiro com `casas` decimais (ex.: 78610 -> "78.610"; 84.5 com 1 casa -> "84,5"). */
function formatarNumero(valor, casas = 0) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(valor);
}

function dataPorExtenso(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${ano}`;
}

/** Posição (1-based) do id no bloco referencias de ctx.blocos; 0 se não existir. */
function posicaoRef(id, blocos) {
  const bloco = (blocos || []).find(ehBloco('referencias'));
  const itens = bloco && Array.isArray(bloco.itens) ? bloco.itens : [];
  return itens.findIndex((item) => ehObjeto(item) && item.id === id) + 1;
}

function refHtml(ref, ctx) {
  const n = ref === undefined ? 0 : posicaoRef(ref, ctx.blocos);
  if (!n) return '';
  return `<sup class="blog-ref"><a href="#ref-${ctx.esc(ref)}" aria-label="Fonte ${n}">${n}</a></sup>`;
}

/** Texto (inline ou não) seguido da marca de fonte, se houver. */
function textoComRef(texto, ref, ctx, inline) {
  let corpo = '';
  if (texto !== undefined) corpo = inline ? ctx.renderInline(texto) : ctx.esc(texto);
  const marca = refHtml(ref, ctx);
  if (!corpo) return marca;
  return marca ? `${corpo} ${marca}` : corpo;
}

/** Id único na página: sufixo -N com ctx.contador.campanha. */
function proximoId(ctx, prefixo) {
  ctx.contador.campanha = (ctx.contador.campanha || 0) + 1;
  return `${prefixo}-${ctx.contador.campanha}`;
}

function renderSumario(b, ctx) {
  const id = proximoId(ctx, 'sumario');
  const itens = (ctx.blocos || []).filter(ehBloco('h2'))
    .map((h, i) => `<li><a class="blog-sumario__link" href="#s-${i + 1}">${ctx.esc(h.texto)}</a></li>`).join('');
  return `<nav class="blog-sumario" aria-labelledby="${id}">`
    + `<p class="blog-sumario__titulo" id="${id}">${ctx.esc(b.titulo || 'Nesta publicação')}</p>`
    + `<ol class="blog-sumario__lista">${itens}</ol></nav>`;
}

function renderKpi(k, ctx) {
  const casas = k.casas || 0;
  const numero = formatarNumero(k.valor, casas);
  const detalhe = textoComRef(k.detalhe, k.ref, ctx, true);
  return '<li class="blog-kpi">'
    + `<p class="blog-kpi__valor"><span class="blog-kpi__prefixo">${ctx.esc(k.prefixo || '')}</span>`
    + `<span class="blog-kpi__num" aria-hidden="true" data-valor="${ctx.esc(String(k.valor))}" data-casas="${casas}">${numero}</span>`
    + `<span class="blog-sr-only">${numero}</span><span class="blog-kpi__sufixo">${ctx.esc(k.sufixo || '')}</span></p>`
    + `<p class="blog-kpi__rotulo">${ctx.esc(k.rotulo)}</p>`
    + (detalhe ? `<p class="blog-kpi__detalhe">${detalhe}</p>` : '')
    + '</li>';
}

function renderLegenda(series, ctx) {
  return `<ul class="blog-grafico__legenda">${series.map((s, i) => `<li data-serie="${i + 1}">${ctx.esc(s)}</li>`).join('')}</ul>`;
}

/** Barra: data-v = fração do maior valor (3 casas); data-p = data-v em % arredondado ao múltiplo de 5. */
function renderBarra(valor, max, serie) {
  const fracao = max > 0 ? (valor / max).toFixed(3) : '0.000';
  const porcento = Math.round(Number(fracao) * 20) * 5;
  return `<span class="blog-grafico__barra" data-serie="${serie}" data-v="${fracao}" data-p="${porcento}"></span>`;
}

function renderValorGrafico(valor, casas, serie, series, ctx) {
  const prefixo = series ? `<span class="blog-sr-only">${ctx.esc(series[serie - 1])}: </span>` : '';
  return `<span class="blog-grafico__valor" data-serie="${serie}">${prefixo}${formatarNumero(valor, casas)}</span>`;
}

function renderLinhaGrafico(item, max, casas, series, ctx) {
  const barras = item.valores.map((v, i) => renderBarra(v, max, i + 1)).join('');
  const valores = item.valores.map((v, i) => renderValorGrafico(v, casas, i + 1, series, ctx)).join(' ');
  return `<li class="blog-grafico__linha"><span class="blog-grafico__rotulo">${ctx.esc(item.rotulo)}</span>`
    + `<span class="blog-grafico__trilho" aria-hidden="true">${barras}</span>`
    + `<span class="blog-grafico__valores">${valores}</span></li>`;
}

function renderGrafico(g, ctx) {
  const casas = g.casas || 0;
  const series = Array.isArray(g.series) ? g.series : null;
  const max = Math.max(0, ...g.itens.flatMap((it) => it.valores));
  const unidade = g.unidade ? ` <span class="blog-grafico__unidade">(${ctx.esc(g.unidade)})</span>` : '';
  const linhas = g.itens.map((it) => renderLinhaGrafico(it, max, casas, series, ctx)).join('');
  const nota = textoComRef(g.nota, g.ref, ctx, false);
  return `<figure class="blog-grafico" data-series="${series ? series.length : 1}">`
    + `<figcaption class="blog-grafico__titulo">${ctx.esc(g.titulo)}${unidade}</figcaption>`
    + (series ? renderLegenda(series, ctx) : '')
    + `<ul class="blog-grafico__linhas">${linhas}</ul>`
    + (nota ? `<p class="blog-grafico__nota">${nota}</p>` : '')
    + '</figure>';
}

function textoCelula(valor, casas, ctx) {
  return typeof valor === 'number' ? formatarNumero(valor, casas) : ctx.esc(valor);
}

function renderLinhaTabela(linha, casas, ctx) {
  const [primeira, ...demais] = linha;
  const cabeca = `<th scope="row">${textoCelula(primeira, casas, ctx)}</th>`;
  const celulas = demais.map((c) => (typeof c === 'number'
    ? `<td data-num>${formatarNumero(c, casas)}</td>`
    : `<td>${ctx.esc(c)}</td>`)).join('');
  return `<tr>${cabeca}${celulas}</tr>`;
}

function renderTabela(t, ctx) {
  const id = proximoId(ctx, 'tab');
  const cabecalho = t.colunas.map((c) => `<th scope="col">${ctx.esc(c)}</th>`).join('');
  const corpo = t.linhas.map((linha) => renderLinhaTabela(linha, t.casas || 0, ctx)).join('');
  const nota = textoComRef(t.nota, t.ref, ctx, false);
  return `<div class="blog-tabela-dados" role="region" aria-labelledby="${id}" tabindex="0">`
    + `<table><caption id="${id}">${ctx.esc(t.titulo)}</caption>`
    + `<thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table>`
    + (nota ? `<p class="blog-tabela-dados__nota">${nota}</p>` : '')
    + '</div>';
}

function renderPainel(b, ctx) {
  const titulo = b.titulo ? `<h3 class="blog-painel__titulo">${ctx.esc(b.titulo)}</h3>` : '';
  const kpis = b.kpis ? `<ul class="blog-painel__kpis">${b.kpis.map((k) => renderKpi(k, ctx)).join('')}</ul>` : '';
  const graficos = (b.graficos || []).map((g) => renderGrafico(g, ctx)).join('');
  const tabelas = (b.tabelas || []).map((t) => renderTabela(t, ctx)).join('');
  return `<div class="blog-painel">${titulo}${kpis}${graficos}${tabelas}</div>`;
}

function renderCarta(c, ctx) {
  return `<li class="blog-carta" data-veredito="${c.veredito}"><details class="blog-carta__det">`
    + '<summary class="blog-carta__frente"><span class="blog-carta__pergunta">Mito ou verdade?</span>'
    + `<span class="blog-carta__frase">${ctx.esc(c.frase)}</span><span class="blog-carta__dica">Ver resposta</span></summary>`
    + `<div class="blog-carta__verso"><p class="blog-carta__veredito">${VEREDITOS[c.veredito] || ''}</p>`
    + `<p class="blog-carta__explicacao">${textoComRef(c.explicacao, c.ref, ctx, true)}</p></div></details></li>`;
}

function renderFiltrosDeck(cartas) {
  const temDepende = cartas.some((c) => c.veredito === 'depende');
  const botoes = FILTROS_DECK
    .filter(([id]) => id !== 'depende' || temDepende)
    .map(([id, rotulo]) => `<button type="button" class="blog-chip" aria-pressed="${id === 'todas'}" data-filtro="${id}">${rotulo}</button>`)
    .join('');
  return `<div class="blog-deck__filtros" role="group" aria-label="Filtrar cartas" hidden>${botoes}</div>`;
}

function renderDeck(b, ctx) {
  const titulo = b.titulo ? `<h3 class="blog-deck__titulo">${ctx.esc(b.titulo)}</h3>` : '';
  const instrucao = `<p class="blog-deck__instrucao">${ctx.esc(b.instrucao || INSTRUCAO_PADRAO)}</p>`;
  const cartas = b.cartas.map((c) => renderCarta(c, ctx)).join('');
  return `<div class="blog-deck" data-deck>${titulo}${instrucao}${renderFiltrosDeck(b.cartas)}`
    + '<p class="blog-deck__placar" aria-live="polite" hidden></p>'
    + `<ul class="blog-deck__cartas">${cartas}</ul></div>`;
}

function renderLinhaComparativo(it, rotulos, ctx) {
  return `<tr><th scope="row">${ctx.esc(it.tema)}</th>`
    + `<td data-col="antes" data-rotulo="${ctx.esc(rotulos.antes)}">${ctx.renderInline(it.antes)}</td>`
    + `<td data-col="agora" data-rotulo="${ctx.esc(rotulos.agora)}">${textoComRef(it.agora, it.ref, ctx, true)}</td></tr>`;
}

function renderComparativo(b, ctx) {
  const r = { tema: 'Tema', antes: 'Antes', agora: 'Hoje', ...(b.rotulos || {}) };
  const titulo = b.titulo ? `<h3 class="blog-comparativo__titulo">${ctx.esc(b.titulo)}</h3>` : '';
  const legenda = b.titulo || 'Comparação: antes e hoje';
  const linhas = b.itens.map((it) => renderLinhaComparativo(it, r, ctx)).join('');
  return `<div class="blog-comparativo">${titulo}`
    + `<table class="blog-comparativo__tabela"><caption class="blog-sr-only">${ctx.esc(legenda)}</caption>`
    + '<thead><tr>'
    + `<th scope="col">${ctx.esc(r.tema)}</th><th scope="col" data-col="antes">${ctx.esc(r.antes)}</th>`
    + `<th scope="col" data-col="agora">${ctx.esc(r.agora)}</th>`
    + `</tr></thead><tbody>${linhas}</tbody></table></div>`;
}

function renderItemGuia(it, ctx) {
  const ic = it.icone ? ctx.icone(it.icone, 'blog-guia__icone') : '';
  const campos = it.campos
    .map((c) => `<div><dt>${ctx.esc(c.rotulo)}</dt><dd>${ctx.renderInline(c.texto)}</dd></div>`).join('');
  const marca = refHtml(it.ref, ctx);
  const fonte = marca ? `<p class="blog-guia__fonte">${marca}</p>` : '';
  return `<li class="blog-guia__item">${ic}<h3 class="blog-guia__nome">${ctx.esc(it.nome)}</h3>`
    + `<dl class="blog-guia__campos">${campos}</dl>${fonte}</li>`;
}

function renderGuia(b, ctx) {
  const titulo = b.titulo ? `<h3 class="blog-guia__titulo">${ctx.esc(b.titulo)}</h3>` : '';
  return `${titulo}<ul class="blog-guia">${b.itens.map((it) => renderItemGuia(it, ctx)).join('')}</ul>`;
}

function renderFaixa(f, ctx) {
  const idade = f.idade ? `<span class="blog-faixa__idade">${ctx.esc(f.idade)}</span>` : '';
  const dicas = f.dicas && f.dicas.length
    ? `<ul class="blog-lista">${f.dicas.map((d) => `<li>${ctx.renderInline(d)}</li>`).join('')}</ul>`
    : '';
  return `<details class="blog-faixa" data-faixa="${f.faixa}"><summary class="blog-faixa__resumo">`
    + `<span class="blog-faixa__rotulo">${ctx.esc(f.rotulo)}</span>${idade}</summary>`
    + `<div class="blog-faixa__corpo"><p>${textoComRef(f.texto, f.ref, ctx, true)}</p>${dicas}</div></details>`;
}

function renderFaixas(b, ctx) {
  const titulo = b.titulo ? `<h3 class="blog-faixas__titulo">${ctx.esc(b.titulo)}</h3>` : '';
  return `<div class="blog-faixas">${titulo}${b.itens.map((f) => renderFaixa(f, ctx)).join('')}</div>`;
}

function renderHabito(h, ctx) {
  return `<li class="blog-habito" data-efeito="${h.efeito}">`
    + `<span class="blog-habito__emoji" aria-hidden="true">${ctx.esc(h.emoji)}</span>`
    + `<h3 class="blog-habito__titulo">${ctx.esc(h.titulo)}</h3>`
    + `<p class="blog-habito__efeito">${EFEITOS[h.efeito] || ''}</p>`
    + `<p class="blog-habito__texto">${textoComRef(h.texto, h.ref, ctx, true)}</p></li>`;
}

function renderHabitos(b, ctx) {
  const titulo = b.titulo ? `<h3 class="blog-habitos__titulo">${ctx.esc(b.titulo)}</h3>` : '';
  return `${titulo}<ul class="blog-habitos">${b.itens.map((h) => renderHabito(h, ctx)).join('')}</ul>`;
}

function renderReferencia(r, ctx) {
  const doi = r.doi
    ? ` DOI: <a href="https://doi.org/${ctx.esc(r.doi)}" target="_blank" rel="noopener noreferrer">${ctx.esc(r.doi)}`
      + '<span class="blog-sr-only"> (abre em nova aba)</span></a>.'
    : '';
  return `<li class="blog-referencia" id="ref-${ctx.esc(r.id)}" data-tipo="${r.tipo}">`
    + `<span class="blog-referencia__titulo">${ctx.esc(r.titulo)}</span>. `
    + `<span class="blog-referencia__orgao">${ctx.esc(r.orgao)}</span>. `
    + `<a href="${ctx.esc(r.href)}" target="_blank" rel="noopener noreferrer">Acessar a fonte`
    + '<span class="blog-sr-only"> (abre em nova aba)</span></a>.'
    + `${doi} <span class="blog-referencia__acesso">Acesso em ${dataPorExtenso(r.acesso)}.</span></li>`;
}

function renderReferencias(b, ctx) {
  return `<ol class="blog-referencias">${b.itens.map((r) => renderReferencia(r, ctx)).join('')}</ol>`;
}

// Um render por tipo de bloco (mesmo formato de RENDER do gerador). Só recebe blocos já validados.
const RENDER = {
  sumario: renderSumario,
  painel: renderPainel,
  deck: renderDeck,
  comparativo: renderComparativo,
  guia: renderGuia,
  faixas: renderFaixas,
  habitos: renderHabitos,
  referencias: renderReferencias,
};

/** HTML de um bloco de campanha. ctx = { esc, renderInline, icone, avisos, contador, blocos }. */
function render(bloco, ctx) {
  if (!ehObjeto(bloco) || !BLOCOS_CAMPANHA.includes(bloco.t)) {
    throw new Error(`bloco de campanha desconhecido: ${bloco && bloco.t}`);
  }
  return RENDER[bloco.t](bloco, ctx);
}

/** Ids de referencias e lista de ids repetidos. */
function idsDeReferencias(blocos) {
  const todos = blocos.filter(ehBloco('referencias')).flatMap((b) => (Array.isArray(b.itens) ? b.itens : [])
    .map((item) => (ehObjeto(item) ? item.id : undefined)));
  const repetidos = todos.filter((id, i) => id !== undefined && todos.indexOf(id) !== i);
  return {
    ids: new Set(todos),
    erros: [...new Set(repetidos)].map((id) => `id de referência repetido: ${id}`),
  };
}

function checarRefsDoBloco(bloco, ids) {
  const semFonte = (id) => !ids.has(id);
  const porRef = refsDe(bloco).filter(semFonte).map((id) => `ref "${id}" sem fonte em referencias`);
  const porLink = textosDe(bloco)
    .flatMap((t) => [...t.matchAll(RE_REF_TEXTO)].map((m) => m[1]))
    .filter(semFonte)
    .map((id) => `#ref-${id} sem fonte em referencias`);
  return [...porRef, ...porLink];
}

function checarEmoji(blocos) {
  return blocos.flatMap((b, i) => (textosDe(b).some((t) => RE_EMOJI.test(t))
    ? [`bloco ${i} (${b && b.t}): emoji só é permitido em habitos[].emoji`]
    : []));
}

const ehAviso = (b) => ehObjeto(b) && b.t === 'destaque' && b.tom === 'atencao';

function checarAvisos(blocos) {
  const erros = [];
  if (!ehAviso(blocos[0])) erros.push('o 1º bloco deve ser destaque de atenção (aviso de saúde)');
  const inicioFim = Math.max(1, blocos.length - 3);
  if (!blocos.slice(inicioFim).some(ehAviso)) erros.push('falta destaque de atenção entre os 3 últimos blocos');
  return erros;
}

function limiteUnico(blocos, tipo) {
  return blocos.filter(ehBloco(tipo)).length > 1 ? [`no máximo 1 bloco ${tipo} por post`] : [];
}

function checarSumario(blocos) {
  const temSumario = blocos.some(ehBloco('sumario'));
  const temH2 = blocos.some(ehBloco('h2'));
  return temSumario && !temH2 ? ['sumario sem seções (h2)'] : [];
}

/** Regras do post inteiro (contrato, seção 1, item 3). Lista de problemas (vazia = ok). */
function checarPost(blocos) {
  if (!Array.isArray(blocos)) return ['blocos devem ser uma lista'];
  const { ids, erros: errosIds } = idsDeReferencias(blocos);
  return [
    ...limiteUnico(blocos, 'sumario'),
    ...limiteUnico(blocos, 'referencias'),
    ...errosIds,
    ...blocos.flatMap((b) => checarRefsDoBloco(b, ids)),
    ...checarEmoji(blocos),
    ...checarAvisos(blocos),
    ...checarSumario(blocos),
  ];
}

// ---------------------------------------------------------------------------
// CLI: --checar-parte <arquivo.json>  ({ "blocos": [...], "referencias": [...] })
// ---------------------------------------------------------------------------

function avisoSaude() {
  return { t: 'destaque', tom: 'atencao', texto: AVISO_SAUDE };
}

/** Post falso que envolve a parte com os avisos de saúde no topo e no fim. */
function montarPostDeParte(parte) {
  const blocos = parte.blocos;
  const referencias = Array.isArray(parte.referencias) ? parte.referencias : [];
  const extra = !blocos.some(ehBloco('referencias')) && referencias.length
    ? [{ t: 'referencias', itens: referencias }]
    : [];
  return {
    slug: 'checagem-parte',
    titulo: 'Checagem de parte',
    resumo: 'Checagem de uma parte de publicação de campanha.',
    data: '2026-10-09',
    tags: ['checagem'],
    serie: 'campanhas',
    icone: 'laco',
    leitura_min: 5,
    fontes: ['checagem'],
    blocos: [avisoSaude(), ...blocos, ...extra, avisoSaude()],
  };
}

/** Checagem completa pelo gerador quando o plugue S1 existe; senão, só blocos de campanha + checarPost. */
function checarParte(post) {
  const g = require('./build-blog.js');
  if (g.SERIES.includes('campanhas')) return g.validatePost(post, { email: null });
  console.log('AVISO: plugue S1 ausente; checagem parcial');
  const erros = [];
  post.blocos.forEach((b, i) => {
    if (!ehObjeto(b) || !BLOCOS_CAMPANHA.includes(b.t)) return;
    validar(b, { blocos: post.blocos, icones: g.ICONES })
      .forEach((e) => erros.push(`bloco ${i} (${b.t}): ${e}`));
  });
  return [...erros, ...checarPost(post.blocos)];
}

function contarReferencias(blocos) {
  const bloco = blocos.find(ehBloco('referencias'));
  return bloco && Array.isArray(bloco.itens) ? bloco.itens.length : 0;
}

function executarCli(argv) {
  const i = argv.indexOf('--checar-parte');
  if (i < 0 || !argv[i + 1]) {
    console.log('uso: node scripts/blog-blocos-campanha.js --checar-parte <arquivo.json>');
    return 1;
  }
  let parte;
  try {
    parte = JSON.parse(fs.readFileSync(path.resolve(argv[i + 1]), 'utf8'));
  } catch (erro) {
    console.log(`não foi possível ler a parte: ${erro.message}`);
    return 1;
  }
  if (!ehObjeto(parte) || !Array.isArray(parte.blocos)) {
    console.log('- o arquivo precisa de "blocos" (lista)');
    return 1;
  }
  const post = montarPostDeParte(parte);
  const erros = checarParte(post);
  if (erros.length) {
    erros.forEach((e) => console.log(`- ${e}`));
    return 1;
  }
  console.log(`OK (${parte.blocos.length} blocos, ${contarReferencias(post.blocos)} referências)`);
  return 0;
}

module.exports = { BLOCOS_CAMPANHA, HOSTS_FONTES, validar, render, checarPost, formatarNumero };

if (require.main === module) {
  process.exitCode = executarCli(process.argv.slice(2));
}
