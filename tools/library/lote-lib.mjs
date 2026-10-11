/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lote-lib.mjs
 * Operação em lote da Biblioteca LAIFT: importar DOIs, exportar resumos
 * pendentes, aplicar resumos gerados por IA e ver a fila. NÃO reimplementa
 * regra: chama o serviço de curadoria do Worker (importArticle, updateArticle,
 * listQueue, getAdminArticle), que já aplica papéis, limites de taxa,
 * duplicidade, versão e auditoria. Esta ferramenta nunca aprova, publica nem
 * marca resumo como revisado.
 * Quem usa: tools/library/lote.mjs (linha de comando) e lote-lib.test.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as Cur from '../../worker/src/services/libraryCurationService.js';
import * as Logging from '../../worker/src/logging.js';
import { LIBRARY_LIMITS, LIBRARY_RATE_LIMITS } from '../../worker/src/library/limits.js';
import { isUuid, parseIdentifier } from '../../worker/src/library/identifiers.js';
import { STATUSES, hasClinicalTerms } from '../../worker/src/library/transitions.js';

export const PAUSA_PADRAO_MS = 1000;
const RETENTATIVA_MS = 2000;
const FRASES_MIN = 3;
const FRASES_MAX = 5;
const FRASE_MAX_CARACTERES = 300;
const AREAS_MAX = 5;
const PALAVRAS_PT_MIN = 3;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONTROLE_RE = /[\u0000-\u001f\u007f]/;
const PALAVRAS_PT = new Set(['de', 'da', 'do', 'das', 'dos', 'que', 'em', 'para', 'com', 'uma', 'um', 'os', 'foi', 'foram',
  'são', 'não', 'por', 'ao', 'no', 'na', 'nos', 'nas', 'se', 'mais', 'como', 'entre', 'pelo', 'pela', 'sem']);
const PALAVRAS_EN = new Set(['the', 'of', 'and', 'in', 'was', 'were', 'with', 'that', 'for', 'is', 'are', 'to', 'this',
  'from', 'by', 'on', 'be', 'we', 'which', 'these']);

/** Parada limpa (limite de taxa ou falha crítica): o lote grava o ponto e encerra. */
export class ParadaDoLote extends Error {
  constructor(motivo, codigo = 'limite') {
    super(motivo);
    this.name = 'ParadaDoLote';
    this.codigo = codigo;
  }
}

const dorme = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Argumentos, arquivos e identidade
// ---------------------------------------------------------------------------
const FLAGS_COM_VALOR = Object.freeze({
  '--arquivo': 'arquivo', '--saida': 'saida', '--estado': 'estado', '--perfil': 'perfil', '--nome': 'nome', '--pausa': 'pausa',
});
const FLAGS_BOOLEANAS = Object.freeze({ '--simular': 'simular', '--refazer-falhas': 'refazerFalhas' });

/** ['importar','--arquivo','x.json','--simular'] -> { comando, arquivo, simular }. Recusa flag desconhecida. */
export function lerArgumentos(argv) {
  const [comando, ...resto] = argv;
  const opcoes = {};
  for (let i = 0; i < resto.length; i += 1) {
    const flag = resto[i];
    if (Object.hasOwn(FLAGS_BOOLEANAS, flag)) {
      opcoes[FLAGS_BOOLEANAS[flag]] = true;
    } else if (Object.hasOwn(FLAGS_COM_VALOR, flag)) {
      const valor = resto[i + 1];
      if (valor === undefined || valor.startsWith('--')) throw new Error(`Falta o valor de ${flag}.`);
      opcoes[FLAGS_COM_VALOR[flag]] = valor;
      i += 1;
    } else {
      throw new Error(`Opção desconhecida: ${flag}.`);
    }
  }
  return { comando, ...opcoes };
}

export function lerJson(caminho) {
  let texto;
  try {
    texto = fs.readFileSync(caminho, 'utf8');
  } catch {
    throw new Error(`Não consegui ler o arquivo: ${caminho}`);
  }
  try {
    return JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    throw new Error(`O arquivo não é um JSON válido: ${caminho}`);
  }
}

/** Grava JSON por arquivo temporário + rename: uma queda no meio não deixa o estado pela metade. */
export function gravarJson(caminho, dados) {
  const temporario = `${caminho}.tmp`;
  fs.writeFileSync(temporario, `${JSON.stringify(dados, null, 2)}\n`, 'utf8');
  fs.renameSync(temporario, caminho);
}

export function montarIdentidade({ perfil, nome }) {
  if (!isUuid(perfil)) throw new Error('Informe --perfil com o UUID do seu perfil de administrador.');
  const nomeLimpo = typeof nome === 'string' ? nome.trim() : '';
  if (!nomeLimpo) throw new Error('Informe --nome "Seu Nome".');
  return { profileId: perfil, role: 'admin', fullName: nomeLimpo };
}

/** O perfil precisa existir (created_by referencia profiles). */
export async function conferirPerfil(sql, identity) {
  const linhas = await sql`SELECT id FROM profiles WHERE id = ${identity.profileId}::uuid`;
  if (!linhas.length) throw new Error('Esse perfil não existe no banco. Confira o UUID de --perfil.');
}

/** Tira do texto qualquer trecho secreto do ambiente antes de imprimir ou gravar. */
export function ocultarSegredos(texto, env = {}) {
  let saida = String(texto ?? '');
  for (const chave of ['DATABASE_URL', 'LIBRARY_CONTACT_EMAIL']) {
    const valor = env[chave];
    if (typeof valor === 'string' && valor.length >= 4) saida = saida.split(valor).join('[oculto]');
  }
  return saida;
}

const novoCorrelacao = () => crypto.randomUUID();

function caminhosDe(arquivo, sufixos) {
  const dir = path.dirname(arquivo);
  const base = path.basename(arquivo, path.extname(arquivo));
  return Object.fromEntries(Object.entries(sufixos).map(([chave, nome]) => [chave, path.join(dir, nome.replace('{base}', base))]));
}

export const caminhosImportar = (arquivo) => caminhosDe(arquivo, {
  estado: '{base}.estado.json', relatorio: 'relatorio-importar.json', simulacao: 'relatorio-importar-simulacao.json',
});
export const caminhosResumos = (arquivo) => caminhosDe(arquivo, {
  relatorio: 'relatorio-resumos.json', simulacao: 'relatorio-resumos-simulacao.json',
});

// ---------------------------------------------------------------------------
// Erros do serviço
// ---------------------------------------------------------------------------
const ehLimite = (err) => err?.name === 'RateLimitError';
const ehDuplicado = (err) => err?.name === 'ConflictError' && Boolean(err.payload?.articleId);

function textoDoLimite() {
  const imp = LIBRARY_RATE_LIMITS.LIBRARY_IMPORT;
  const glob = LIBRARY_RATE_LIMITS.LIBRARY_IMPORT_GLOBAL;
  const cur = LIBRARY_RATE_LIMITS.LIBRARY_CURATE;
  return `Limite do serviço atingido (importação: ${imp.MAX_ATTEMPTS} por hora por perfil e ${glob.MAX_ATTEMPTS} por hora no total; `
    + `curadoria: ${cur.MAX_ATTEMPTS} por hora por perfil). Aguarde cerca de uma hora e rode o MESMO comando de novo: ele retoma do ponto onde parou.`;
}

/** Erro inesperado (rede, banco): uma segunda tentativa curta; erro esperado do serviço vai direto. */
async function comRetentativa(chamada, sleep) {
  try {
    return await chamada();
  } catch (err) {
    if (err?.expected || ehLimite(err)) throw err;
    await sleep(RETENTATIVA_MS);
    return chamada();
  }
}

function motivoDe(err, env) {
  return ocultarSegredos(err?.expected ? err.message : `Erro inesperado: ${err?.message ?? err}`, env);
}

// ---------------------------------------------------------------------------
// Candidatos (importar)
// ---------------------------------------------------------------------------
function areasDe(valor) {
  if (valor === undefined) return { areas: [] };
  if (!Array.isArray(valor) || valor.some((a) => typeof a !== 'string' || !SLUG_RE.test(a))) return { erro: 'areas deve ser uma lista de códigos de área' };
  const unicas = [...new Set(valor)];
  if (unicas.length > AREAS_MAX) return { erro: `no máximo ${AREAS_MAX} áreas` };
  return { areas: unicas };
}

/** Lista de { doi, areas } -> { validos, invalidos }. DOI repetido no arquivo vira inválido (a 2ª ocorrência). */
export function validarCandidatos(lista, areasExistentes = null) {
  if (!Array.isArray(lista)) throw new Error('O arquivo precisa ser uma lista: [{ "doi": "...", "areas": ["toxicologia"] }].');
  const vistos = new Set();
  const validos = [];
  const invalidos = [];
  lista.forEach((item, indice) => {
    const rotulo = typeof item?.doi === 'string' ? item.doi : `item ${indice + 1}`;
    const recusa = (motivo) => invalidos.push({ doi: rotulo, motivo });
    let doi;
    try {
      const ident = parseIdentifier(item?.doi);
      if (ident.kind !== 'doi') return recusa('informe um DOI (não um PMID)');
      doi = ident.value;
    } catch (err) {
      return recusa(err.message);
    }
    const { areas, erro } = areasDe(item.areas);
    if (erro) return recusa(erro);
    const fora = areasExistentes ? areas.filter((a) => !areasExistentes.has(a)) : [];
    if (fora.length) return recusa(`área inexistente: ${fora.join(', ')}`);
    if (vistos.has(doi)) return recusa('DOI repetido no arquivo');
    vistos.add(doi);
    return validos.push({ doi, areas });
  });
  return { validos, invalidos };
}

async function areasDoBanco(sql) {
  const linhas = await sql`SELECT slug FROM library_topics`;
  return new Set(linhas.map((l) => l.slug));
}

async function doisNoBanco(sql, dois) {
  if (!dois.length) return new Map();
  const linhas = await sql`SELECT doi, id FROM library_articles WHERE doi = ANY(${dois}::text[])`;
  return new Map(linhas.map((l) => [l.doi, l.id]));
}

// ---------------------------------------------------------------------------
// Estado da retomada (.estado.json)
// ---------------------------------------------------------------------------
const SITUACOES_FINAIS = Object.freeze(['importado', 'duplicado']);

export function lerEstado(caminho) {
  if (!fs.existsSync(caminho)) return { versao: 1, resultados: {} };
  const estado = lerJson(caminho);
  return { versao: 1, resultados: estado?.resultados && typeof estado.resultados === 'object' ? estado.resultados : {} };
}

function gravarEstado(caminho, estado) {
  gravarJson(caminho, { ...estado, atualizadoEm: new Date().toISOString() });
}

const comResultado = (estado, doi, resultado) => ({ ...estado, resultados: { ...estado.resultados, [doi]: resultado } });

function precisaProcessar(anterior, refazerFalhas) {
  if (!anterior) return true;
  if (SITUACOES_FINAIS.includes(anterior.situacao)) return false;
  if (anterior.situacao === 'falha') return refazerFalhas === true;
  return true; // areas_pendente: refaz só as áreas
}

// ---------------------------------------------------------------------------
// importar
// ---------------------------------------------------------------------------
async function definirAreas(ctx, id, areas) {
  const { sql, identity, correlacao } = ctx;
  const atual = await Cur.getAdminArticle(sql, identity, { id });
  await Cur.updateArticle(sql, identity, { id, version: atual.article.version, fields: { topics: areas } }, correlacao);
  return atual.article.version;
}

/** Importa um DOI e define as áreas. Devolve { resultado } ou lança ParadaDoLote (com o resultado parcial). */
async function importarUm(ctx, item, anterior) {
  const { sql, env, identity, fetchImpl, sleep, correlacao } = ctx;
  let id = anterior?.situacao === 'areas_pendente' ? anterior.id : null;
  let avisos = anterior?.avisos ?? [];
  let licenca = anterior?.licenca ?? null;
  let licencaConflito = anterior?.licencaConflito ?? false;
  let titulo = anterior?.titulo ?? null;
  if (!id) {
    try {
      const entrada = { identifier: item.doi };
      const res = await comRetentativa(() => Cur.importArticle(sql, env, identity, entrada, correlacao, { fetchImpl }), sleep);
      id = res.article.id;
      avisos = res.warnings ?? [];
      licenca = res.article.license;
      licencaConflito = res.article.licenseConflict === true;
      titulo = res.article.title;
    } catch (err) {
      if (ehLimite(err)) throw new ParadaDoLote(textoDoLimite());
      if (ehDuplicado(err)) return { situacao: 'duplicado', id: err.payload.articleId, motivo: 'já estava na Biblioteca' };
      return { situacao: 'falha', motivo: motivoDe(err, env) };
    }
  }
  const base = { id, titulo, areas: item.areas, licenca, licencaConflito, avisos };
  if (!item.areas.length) return { situacao: 'importado', ...base };
  try {
    await definirAreas(ctx, id, item.areas);
    return { situacao: 'importado', ...base };
  } catch (err) {
    const parcial = { situacao: 'areas_pendente', ...base, motivo: ehLimite(err) ? 'parou no limite de taxa antes de definir as áreas' : motivoDe(err, env) };
    if (ehLimite(err)) throw Object.assign(new ParadaDoLote(textoDoLimite()), { parcial });
    return parcial;
  }
}

function relatorioImportar(candidatos, estado, extra) {
  const dois = candidatos.validos.map((c) => c.doi);
  const por = (situacao) => dois.filter((d) => estado.resultados[d]?.situacao === situacao);
  const importados = por('importado').map((doi) => ({ doi, ...estado.resultados[doi] }));
  return {
    geradoEm: new Date().toISOString(),
    simulacao: false,
    total: candidatos.validos.length + candidatos.invalidos.length,
    importados: importados.map(({ situacao: _s, avisos: _a, ...resto }) => resto),
    duplicados: por('duplicado').map((doi) => ({ doi, id: estado.resultados[doi].id })),
    falhas: [
      ...candidatos.invalidos.map((i) => ({ doi: i.doi, motivo: i.motivo })),
      ...por('falha').map((doi) => ({ doi, motivo: estado.resultados[doi].motivo })),
      ...por('areas_pendente').map((doi) => ({ doi, id: estado.resultados[doi].id, motivo: `importado, mas sem as áreas: ${estado.resultados[doi].motivo}` })),
    ],
    avisos: importados
      .filter((i) => i.avisos.length || i.licencaConflito || i.licenca === 'desconhecida')
      .map((i) => ({ doi: i.doi, licenca: i.licenca, conflitoDeLicenca: i.licencaConflito, avisos: i.avisos })),
    pendentes: dois.filter((d) => !estado.resultados[d]),
    ...extra,
  };
}

/** Simulação: só valida DOIs, áreas e duplicatas no banco; nenhuma fonte externa é chamada. */
async function simularImportacao(ctx, lista, caminhos) {
  const candidatos = validarCandidatos(lista, await areasDoBanco(ctx.sql));
  const existentes = await doisNoBanco(ctx.sql, candidatos.validos.map((c) => c.doi));
  const novos = candidatos.validos.filter((c) => !existentes.has(c.doi));
  const relatorio = {
    geradoEm: new Date().toISOString(),
    simulacao: true,
    total: lista.length,
    novos: novos.map((c) => ({ doi: c.doi, areas: c.areas })),
    duplicados: candidatos.validos.filter((c) => existentes.has(c.doi)).map((c) => ({ doi: c.doi, id: existentes.get(c.doi) })),
    falhas: candidatos.invalidos.map((i) => ({ doi: i.doi, motivo: i.motivo })),
  };
  gravarJson(caminhos.simulacao, relatorio);
  return relatorio;
}

/**
 * Importa os candidatos um a um, define as áreas e grava o relatório.
 * ctx = { sql, env, identity, fetchImpl, sleep, escrever, correlacao }.
 * opcoes = { arquivo, simular, pausaMs, refazerFalhas }.
 */
export async function importarLote(ctx, opcoes) {
  const { sql, escrever } = ctx;
  const pronto = { sleep: dorme, correlacao: novoCorrelacao(), ...ctx };
  const caminhos = caminhosImportar(opcoes.arquivo);
  const lista = lerJson(opcoes.arquivo);
  if (opcoes.simular) return simularImportacao(pronto, lista, caminhos);

  const candidatos = validarCandidatos(lista, await areasDoBanco(sql));
  let estado = lerEstado(caminhos.estado);
  const pausa = opcoes.pausaMs ?? PAUSA_PADRAO_MS;
  let interrompido = null;
  for (const item of candidatos.validos) {
    const anterior = estado.resultados[item.doi];
    if (!precisaProcessar(anterior, opcoes.refazerFalhas)) continue;
    let resultado;
    try {
      resultado = await importarUm(pronto, item, anterior);
    } catch (err) {
      if (!(err instanceof ParadaDoLote)) throw err;
      if (err.parcial) estado = comResultado(estado, item.doi, err.parcial);
      interrompido = { motivo: err.message, naAltura: item.doi };
      break;
    }
    estado = comResultado(estado, item.doi, resultado);
    gravarEstado(caminhos.estado, estado);
    escrever(`${resultado.situacao.padEnd(14)} ${item.doi}${resultado.motivo ? `  (${resultado.motivo})` : ''}`);
    if (resultado.situacao !== 'duplicado') await pronto.sleep(pausa);
  }
  gravarEstado(caminhos.estado, estado);
  const relatorio = relatorioImportar(candidatos, estado, { interrompido });
  gravarJson(caminhos.relatorio, relatorio);
  if (interrompido) escrever(interrompido.motivo);
  return relatorio;
}

// ---------------------------------------------------------------------------
// exportar
// ---------------------------------------------------------------------------
const paraExportacao = (a) => ({
  id: a.id,
  version: a.version,
  doi: a.doi,
  title: a.title,
  journal: a.journal,
  year: a.pubYear,
  type: a.articleType,
  isClinical: a.isClinical,
  sourceAbstract: a.sourceAbstract ?? null,
});

/** Artigos do estado (padrão em_triagem) ainda sem resumo, lidos pela fila do serviço, página a página. */
export async function exportarSemResumo(ctx, { estado = 'em_triagem' } = {}) {
  const { sql, identity } = ctx;
  if (!STATUSES.includes(estado)) throw new Error(`Estado desconhecido: ${estado}. Use um de: ${STATUSES.join(', ')}.`);
  const itens = [];
  for (let pagina = 1; ; pagina += 1) {
    let fila;
    try {
      fila = await Cur.listQueue(sql, identity, { status: estado, page: pagina });
    } catch (err) {
      if (ehLimite(err)) throw new ParadaDoLote(textoDoLimite());
      throw err;
    }
    itens.push(...fila.items.filter((a) => !a.summaryText).map(paraExportacao));
    if (fila.items.length === 0 || pagina * fila.pageSize >= fila.total) break;
  }
  return itens;
}

// ---------------------------------------------------------------------------
// resumos: regras do texto
// ---------------------------------------------------------------------------
const FIM_DE_FRASE = /(?<=[.!?…]["”')\]]*)\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ0-9"“'(\[])/u;

export function dividirFrases(texto) {
  return texto.split(FIM_DE_FRASE).map((f) => f.trim()).filter(Boolean);
}

function parecePortugues(texto) {
  const palavras = texto.toLowerCase().match(/[a-zà-ú]+/g) ?? [];
  const pt = palavras.filter((p) => PALAVRAS_PT.has(p)).length;
  const en = palavras.filter((p) => PALAVRAS_EN.has(p)).length;
  return pt >= PALAVRAS_PT_MIN && pt > en;
}

/**
 * Confere um resumo antes de enviar ao serviço.
 * @returns {{ ok: boolean, texto: string, motivos: string[], clinico: boolean }}
 *   clinico = o texto tem termos de conduta/dose/interação (hasClinicalTerms).
 */
export function validarResumo(bruto, { clinicoPermitido = false } = {}) {
  const motivos = [];
  if (typeof bruto !== 'string' || !bruto.trim()) return { ok: false, texto: '', motivos: ['resumo vazio'], clinico: false };
  const texto = bruto.replace(/\s+/g, ' ').trim();
  if (CONTROLE_RE.test(texto)) motivos.push('o resumo tem caracteres de controle');
  if (texto.length > LIBRARY_LIMITS.SUMMARY_MAX) motivos.push(`o resumo tem ${texto.length} caracteres (máximo ${LIBRARY_LIMITS.SUMMARY_MAX})`);
  const frases = dividirFrases(texto);
  if (frases.length < FRASES_MIN || frases.length > FRASES_MAX) motivos.push(`o resumo tem ${frases.length} frases (precisa de ${FRASES_MIN} a ${FRASES_MAX})`);
  if (frases.some((f) => f.length > FRASE_MAX_CARACTERES)) motivos.push(`há frase com mais de ${FRASE_MAX_CARACTERES} caracteres (use frases curtas)`);
  if (!parecePortugues(texto)) motivos.push('o resumo não parece estar em português');
  const clinico = hasClinicalTerms(texto);
  if (clinico && !clinicoPermitido) {
    motivos.push('o resumo fala de conduta, dose ou interação: marque "isClinical": true no item (vai para revisor clínico) ou reescreva');
  }
  return { ok: motivos.length === 0, texto, motivos, clinico };
}

function validarItemResumo(item) {
  if (!item || typeof item !== 'object') return ['item inválido'];
  const motivos = [];
  if (!isUuid(item.id)) motivos.push('id inválido');
  if (!Number.isInteger(item.version) || item.version < 1) motivos.push('version inválida');
  if (item.isClinical !== undefined && typeof item.isClinical !== 'boolean') motivos.push('isClinical precisa ser true ou false');
  return motivos;
}

// ---------------------------------------------------------------------------
// resumos: aplicação
// ---------------------------------------------------------------------------
/**
 * O serviço grava a origem 'curador' ao editar o resumo. Aqui o texto é de IA:
 * marca 'ia' logo em seguida (uma instrução, só se nada mudou), o que mantém o
 * artigo barrado para aprovação até alguém revisar. Sem isso o resumo de IA
 * apareceria como se fosse do curador.
 */
async function marcarComoIa(ctx, artigo, texto) {
  const { sql, identity, correlacao } = ctx;
  const linhas = await sql`
    UPDATE library_articles SET summary_origin = 'ia', version = version + 1
    WHERE id = ${artigo.id}::uuid AND version = ${artigo.version}::int AND status = 'em_triagem'
      AND summary_origin = 'curador' AND summary_text = ${texto}::text AND summary_updated_by = ${identity.profileId}::uuid
    RETURNING version
  `;
  if (!linhas.length) throw new ParadaDoLote(`O resumo do artigo ${artigo.id} foi gravado mas NÃO ficou marcado como de IA. Corrija esse artigo antes de continuar.`, 'critico');
  await Logging.logAudit(sql, correlacao, identity.profileId, 'LIBRARY_ARTICLE_UPDATE', 'library_article', artigo.id, 'success',
    { fields: ['summaryOrigin'], origin: 'ia', via: 'lote' });
  return linhas[0].version;
}

async function lerArtigo(ctx, id) {
  const res = await Cur.getAdminArticle(ctx.sql, ctx.identity, { id });
  return res.article;
}

/** Decide, sem gravar, se o item pode ser aplicado ao artigo atual. Devolve { recusa } ou { texto, clinico }. */
function conferirItem(item, artigo) {
  const regras = validarResumo(item.summary, { clinicoPermitido: item.isClinical === true || artigo.isClinical === true });
  if (!regras.ok) return { recusa: { tipo: 'rejeitado', motivos: regras.motivos } };
  if (artigo.status !== 'em_triagem') return { recusa: { tipo: 'ignorado', motivos: [`o artigo está em "${artigo.status}", não em triagem`] } };
  if (artigo.summaryText) return { recusa: { tipo: 'ignorado', motivos: ['o artigo já tem resumo'] } };
  if (artigo.version !== item.version) {
    return { recusa: { tipo: 'falha', motivos: [`versão desatualizada (arquivo ${item.version}, banco ${artigo.version}): exporte de novo`] } };
  }
  return { texto: regras.texto, clinico: regras.clinico || item.isClinical === true || artigo.isClinical === true };
}

async function aplicarUm(ctx, item, artigo, conferido) {
  const { sql, identity, correlacao } = ctx;
  const fields = { summaryText: conferido.texto, ...(conferido.clinico ? { isClinical: true } : {}) };
  const res = await Cur.updateArticle(sql, identity, { id: item.id, version: artigo.version, fields }, correlacao);
  const versao = await marcarComoIa(ctx, res.article, conferido.texto);
  return { id: item.id, version: versao, clinico: conferido.clinico };
}

/**
 * Aplica resumos { id, version, summary, isClinical? } como resumo de IA em
 * triagem. Nunca aprova, publica nem marca revisão.
 * opcoes = { arquivo, simular }.
 */
export async function aplicarResumos(ctx, opcoes) {
  const pronto = { sleep: dorme, correlacao: novoCorrelacao(), ...ctx };
  const caminhos = caminhosResumos(opcoes.arquivo);
  const lista = lerJson(opcoes.arquivo);
  if (!Array.isArray(lista)) throw new Error('O arquivo precisa ser uma lista: [{ "id": "...", "version": 1, "summary": "..." }].');
  const relatorio = { geradoEm: new Date().toISOString(), simulacao: opcoes.simular === true, total: lista.length, aplicados: [], rejeitados: [], ignorados: [], falhas: [], clinicos: [], pendentes: [], interrompido: null };
  const registrar = (tipo, id, motivos) => relatorio[`${tipo}s`].push({ id, motivos });
  for (let i = 0; i < lista.length; i += 1) {
    const item = lista[i];
    const id = item?.id ?? `item ${i + 1}`;
    const problemas = validarItemResumo(item);
    if (problemas.length) { registrar('rejeitado', id, problemas); continue; }
    try {
      const artigo = await lerArtigo(pronto, item.id);
      const conferido = conferirItem(item, artigo);
      if (conferido.recusa) { registrar(conferido.recusa.tipo, id, conferido.recusa.motivos); continue; }
      if (opcoes.simular) { relatorio.aplicados.push({ id, simulado: true, clinico: conferido.clinico }); continue; }
      const feito = await aplicarUm(pronto, item, artigo, conferido);
      relatorio.aplicados.push(feito);
      if (feito.clinico) relatorio.clinicos.push(id);
    } catch (err) {
      if (err instanceof ParadaDoLote || ehLimite(err)) {
        relatorio.interrompido = { motivo: err instanceof ParadaDoLote ? err.message : textoDoLimite(), naAltura: id };
        relatorio.pendentes = lista.slice(i).map((x, j) => x?.id ?? `item ${i + j + 1}`);
        break;
      }
      registrar('falha', id, [motivoDe(err, pronto.env)]);
    }
  }
  gravarJson(opcoes.simular ? caminhos.simulacao : caminhos.relatorio, relatorio);
  return relatorio;
}

// ---------------------------------------------------------------------------
// fila
// ---------------------------------------------------------------------------
/** Contagem por estado (pela fila do serviço) e quantos têm resumo, inclusive os de IA. */
export async function resumoDaFila(ctx) {
  const fila = await Cur.listQueue(ctx.sql, ctx.identity, { status: 'em_triagem' });
  const linhas = await ctx.sql`
    SELECT status, count(summary_text)::int AS com_resumo, (count(*) FILTER (WHERE summary_origin = 'ia'))::int AS resumo_ia
    FROM library_articles GROUP BY status
  `;
  const porEstado = Object.fromEntries(linhas.map((l) => [l.status, l]));
  return STATUSES.map((estado) => ({
    estado,
    total: fila.counts[estado] ?? 0,
    comResumo: porEstado[estado]?.com_resumo ?? 0,
    resumoIa: porEstado[estado]?.resumo_ia ?? 0,
  }));
}
