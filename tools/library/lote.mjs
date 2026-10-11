#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lote.mjs
 * Operação em lote da Biblioteca LAIFT (ver LEIAME.md). Subcomandos:
 *   importar --arquivo candidatos.json [--simular] [--pausa ms] [--refazer-falhas]
 *   exportar [--estado em_triagem] --saida abstracts.json
 *   resumos  --arquivo resumos.json [--simular]
 *   fila
 * Sempre com --perfil <uuid> --nome "<texto>". A conexão vem do ambiente
 * (DATABASE_URL e LIBRARY_CONTACT_EMAIL); nada disso é impresso nem gravado.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ParadaDoLote, lerArgumentos, montarIdentidade, conferirPerfil, ocultarSegredos, gravarJson,
  importarLote, exportarSemResumo, aplicarResumos, resumoDaFila,
} from './lote-lib.mjs';

const USO = `Uso:
  node tools/library/lote.mjs importar --arquivo candidatos.json [--simular] --perfil <uuid> --nome "Nome"
  node tools/library/lote.mjs exportar [--estado em_triagem] --saida abstracts.json --perfil <uuid> --nome "Nome"
  node tools/library/lote.mjs resumos --arquivo resumos.json [--simular] --perfil <uuid> --nome "Nome"
  node tools/library/lote.mjs fila --perfil <uuid> --nome "Nome"
Ambiente: DATABASE_URL (e LIBRARY_CONTACT_EMAIL para importar).`;

const COMANDOS = ['importar', 'exportar', 'resumos', 'fila'];
const SAIDA_OK = 0;
const SAIDA_ERRO = 1;
const SAIDA_INTERROMPIDO = 3;
const ERRO_DE_USO_RE = /^(Falta|Defina|Informe|Opção|Comando)/;

async function criarSqlPadrao(databaseUrl) {
  const { createDb } = await import('../../worker/src/db.js');
  return createDb(databaseUrl);
}

function exigirArquivo(opcoes, nome) {
  if (!opcoes[nome]) throw new Error(`Falta --${nome}.`);
  return path.resolve(opcoes[nome]);
}

function resumirImportacao(r, escrever) {
  if (r.simulacao) {
    escrever(`Simulação: ${r.novos.length} novos, ${r.duplicados.length} já na Biblioteca, ${r.falhas.length} com problema.`);
    return;
  }
  escrever(`Importados: ${r.importados.length}; duplicados: ${r.duplicados.length}; falhas: ${r.falhas.length}; `
    + `avisos de licença: ${r.avisos.length}; pendentes: ${r.pendentes.length}.`);
}

function resumirResumos(r, escrever) {
  escrever(`${r.simulacao ? 'Simulação' : 'Resumos'}: aplicados ${r.aplicados.length}; rejeitados ${r.rejeitados.length}; `
    + `ignorados ${r.ignorados.length}; falhas ${r.falhas.length}; marcados clínicos ${r.clinicos.length}.`);
  if (r.interrompido) escrever(r.interrompido.motivo);
}

async function comandoImportar(opcoes, ctx) {
  const pausaMs = opcoes.pausa === undefined ? undefined : Number(opcoes.pausa);
  if (pausaMs !== undefined && (!Number.isFinite(pausaMs) || pausaMs < 0)) throw new Error('Informe --pausa em milissegundos (número >= 0).');
  const relatorio = await importarLote(ctx, {
    arquivo: exigirArquivo(opcoes, 'arquivo'), simular: opcoes.simular === true, refazerFalhas: opcoes.refazerFalhas === true, pausaMs,
  });
  resumirImportacao(relatorio, ctx.escrever);
  return relatorio.interrompido ? SAIDA_INTERROMPIDO : SAIDA_OK;
}

async function comandoExportar(opcoes, ctx) {
  const saida = exigirArquivo(opcoes, 'saida');
  const itens = await exportarSemResumo(ctx, { estado: opcoes.estado });
  gravarJson(saida, itens);
  ctx.escrever(`${itens.length} artigos exportados (${itens.filter((i) => !i.sourceAbstract).length} sem resumo de fonte) em ${saida}.`);
  return SAIDA_OK;
}

async function comandoResumos(opcoes, ctx) {
  const relatorio = await aplicarResumos(ctx, { arquivo: exigirArquivo(opcoes, 'arquivo'), simular: opcoes.simular === true });
  resumirResumos(relatorio, ctx.escrever);
  return relatorio.interrompido ? SAIDA_INTERROMPIDO : SAIDA_OK;
}

async function comandoFila(_opcoes, ctx) {
  for (const l of await resumoDaFila(ctx)) {
    ctx.escrever(`${l.estado.padEnd(12)} total ${String(l.total).padStart(5)}  com resumo ${String(l.comResumo).padStart(5)}  (de IA ${l.resumoIa})`);
  }
  return SAIDA_OK;
}

const EXECUTORES = Object.freeze({
  importar: comandoImportar, exportar: comandoExportar, resumos: comandoResumos, fila: comandoFila,
});

/**
 * Executa um comando. Dependências injetáveis para teste:
 * { env, escrever, criarSql, fetchImpl, sleep }. Devolve o código de saída.
 */
export async function executar(argv, {
  env = process.env, escrever = (t) => process.stdout.write(`${t}\n`), criarSql = criarSqlPadrao, fetchImpl, sleep,
} = {}) {
  try {
    const opcoes = lerArgumentos(argv);
    if (!COMANDOS.includes(opcoes.comando)) throw new Error(opcoes.comando ? `Comando desconhecido: ${opcoes.comando}.` : 'Falta o comando.');
    if (!env.DATABASE_URL) throw new Error('Defina DATABASE_URL no ambiente.');
    if (opcoes.comando === 'importar' && !opcoes.simular && !env.LIBRARY_CONTACT_EMAIL) {
      throw new Error('Defina LIBRARY_CONTACT_EMAIL no ambiente (as fontes pedem um contato).');
    }
    const identity = montarIdentidade(opcoes);
    const sql = await criarSql(env.DATABASE_URL);
    await conferirPerfil(sql, identity);
    return await EXECUTORES[opcoes.comando](opcoes, { sql, env, identity, fetchImpl, sleep, escrever });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    escrever(`Erro: ${ocultarSegredos(mensagem, env)}`);
    if (ERRO_DE_USO_RE.test(mensagem)) escrever(USO);
    return err instanceof ParadaDoLote ? SAIDA_INTERROMPIDO : SAIDA_ERRO;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  executar(process.argv.slice(2)).then((codigo) => { process.exitCode = codigo; });
}
