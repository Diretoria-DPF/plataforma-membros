/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Testes da operação em lote da Biblioteca (lote-lib.mjs e lote.mjs) contra um
 * Postgres real (PGlite) e um `fetchImpl` simulado com as fixtures do Worker
 * (worker/test/fixtures/library-upstream.json): nada de rede, nada de banco real.
 * Rodar: node --test tools/library/lote-lib.test.mjs
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigratedDb, toSql } from '../../worker/test/helpers/pgliteSql.js';
import {
  validarResumo, validarCandidatos, importarLote, exportarSemResumo, aplicarResumos, resumoDaFila, lerArgumentos,
  caminhosImportar, caminhosResumos,
} from './lote-lib.mjs';
import { executar } from './lote.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(AQUI, '..', '..', 'worker', 'test', 'fixtures', 'library-upstream.json'), 'utf8'));
const { plos, nature } = FIXTURE;
const PERFIL = '11111111-1111-4111-8111-111111111111';
const IDENTIDADE = { profileId: PERFIL, role: 'admin', fullName: 'Dono Teste' };
const ENV = { LIBRARY_CONTACT_EMAIL: 'contato@exemplo.com' };
const RESUMO_BOM = 'O estudo avaliou a exposição ao chumbo em crianças de uma cidade industrial. '
  + 'Foram analisadas amostras de sangue de 200 participantes. '
  + 'Os níveis foram mais altos nas áreas próximas às fábricas. '
  + 'Os autores concluem que a vigilância ambiental é necessária.';

let db;
let sql;
let dir;

/** Respostas falsas por host; escolhe a amostra (plos ou nature) pelo DOI/PMID que aparece na URL. */
function fonteFalsa() {
  const chamadas = [];
  const fetchImpl = async (url) => {
    chamadas.push(String(url));
    const texto = decodeURIComponent(String(url)).toLowerCase();
    const amostra = texto.includes(nature.doi) || texto.includes(String(nature.pmid)) ? nature : plos;
    const corpos = {
      'api.crossref.org': amostra.crossref,
      'www.ebi.ac.uk': amostra.europepmc,
      'api.openalex.org': amostra.openalex,
      'eutils.ncbi.nlm.nih.gov': amostra.pubmed,
      'api.unpaywall.org': amostra.unpaywall,
    };
    return new Response(JSON.stringify(corpos[new URL(url).hostname]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, chamadas };
}

function contexto(extra = {}) {
  const saidas = [];
  return { sql, env: ENV, identity: IDENTIDADE, sleep: async () => {}, escrever: (t) => saidas.push(t), saidas, ...extra };
}

function gravar(nome, dados) {
  const caminho = path.join(dir, nome);
  fs.writeFileSync(caminho, JSON.stringify(dados), 'utf8');
  return caminho;
}

const lerSaida = (caminho) => JSON.parse(fs.readFileSync(caminho, 'utf8'));

async function semear(over = {}) {
  const linha = {
    doi: `10.1000/lote${crypto.randomUUID().slice(0, 8)}`,
    title: 'Artigo de teste',
    authors: '[]',
    journal: 'Revista de Teste',
    pub_year: 2020,
    article_type: 'artigo',
    topics: ['toxicologia'],
    license: 'cc-by',
    oa_status: 'gold',
    landing_url: 'https://doi.org/10.1000/x',
    search_norm: 'artigo de teste',
    status: 'em_triagem',
    ...over,
  };
  const cols = Object.keys(linha);
  const marcas = cols.map((c, i) => (c === 'authors' ? `$${i + 1}::jsonb` : `$${i + 1}`));
  const res = await db.query(`INSERT INTO library_articles (${cols.join(', ')}) VALUES (${marcas.join(', ')}) RETURNING id, version`, cols.map((c) => linha[c]));
  return res.rows[0];
}

const artigos = async () => (await db.query('SELECT * FROM library_articles ORDER BY created_at')).rows;

/** Esgota (quase) o limite de importação do perfil: `tentativas` já usadas na janela. */
async function usarLimiteDeImportacao(tentativas) {
  const hash = crypto.createHash('sha256').update(PERFIL).digest('hex');
  await db.query(
    `INSERT INTO rate_limit_buckets (bucket, identifier_hash, window_started_at, attempts) VALUES ('LIBRARY_IMPORT', $1, now(), $2)
     ON CONFLICT (bucket, identifier_hash) DO UPDATE SET attempts = $2, window_started_at = now()`,
    [hash, tentativas],
  );
}

before(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
});
after(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec('TRUNCATE library_staff, library_suggestions, library_favorites, library_collection_items, library_collections, library_articles, audit_logs, rate_limit_buckets');
  await db.query(
    `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES ($1, 'Pessoa dono', 'dono', 'dono@exemplo.com', 'x', '11999990000', 'admin') ON CONFLICT (id) DO NOTHING`,
    [PERFIL],
  );
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-'));
});

// ---------------------------------------------------------------------------
test('validarResumo aceita 3 a 5 frases curtas em português', () => {
  const r = validarResumo(RESUMO_BOM);
  assert.equal(r.ok, true, r.motivos.join('; '));
  assert.equal(r.clinico, false);
});

test('validarResumo recusa vazio, longo, poucas frases, inglês e conduta clínica', () => {
  assert.deepEqual(validarResumo('').motivos, ['resumo vazio']);
  assert.deepEqual(validarResumo(null).motivos, ['resumo vazio']);
  const longo = `${'Esta frase de teste é curta para o estudo. '.repeat(40)}`;
  assert.ok(validarResumo(longo).motivos.some((m) => m.includes('caracteres')));
  assert.ok(validarResumo('Uma frase só, que fala do estudo com os dados.').motivos.some((m) => m.includes('frases')));
  const ingles = 'The study evaluated the exposure of children to lead. The samples were collected from the schools. The results show that levels are high.';
  assert.ok(validarResumo(ingles).motivos.some((m) => m.includes('português')));
  const clinico = `${RESUMO_BOM} Administrar 500 mg por dia.`;
  const r = validarResumo(clinico);
  assert.equal(r.clinico, true);
  assert.equal(r.ok, false);
  assert.equal(validarResumo(clinico, { clinicoPermitido: true }).clinico, true);
});

test('validarCandidatos recusa PMID, DOI inválido, área inexistente e repetido', () => {
  const { validos, invalidos } = validarCandidatos(
    [{ doi: plos.doi, areas: ['toxicologia'] }, { doi: plos.doi }, { doi: '12345' }, { doi: 'xyz' }, { doi: nature.doi, areas: ['inventada'] }],
    new Set(['toxicologia']),
  );
  assert.equal(validos.length, 1);
  assert.equal(invalidos.length, 4);
  assert.ok(invalidos.some((i) => i.motivo === 'DOI repetido no arquivo'));
  assert.ok(invalidos.some((i) => i.motivo.startsWith('área inexistente')));
});

test('lerArgumentos recusa opção desconhecida e valor ausente', () => {
  assert.deepEqual(lerArgumentos(['importar', '--arquivo', 'a.json', '--simular']), { comando: 'importar', arquivo: 'a.json', simular: true });
  assert.throws(() => lerArgumentos(['importar', '--xyz']), /desconhecida/);
  assert.throws(() => lerArgumentos(['importar', '--arquivo']), /Falta o valor/);
});

// ---------------------------------------------------------------------------
test('importar --simular valida DOIs e duplicatas sem chamar fontes nem gravar artigos', async () => {
  await semear({ doi: plos.doi });
  const fonte = fonteFalsa();
  const arquivo = gravar('candidatos.json', [
    { doi: plos.doi, areas: ['toxicologia'] },
    { doi: nature.doi, areas: ['farmacologia-clinica'] },
    { doi: 'lixo' },
  ]);
  const relatorio = await importarLote(contexto({ fetchImpl: fonte.fetchImpl }), { arquivo, simular: true });
  assert.equal(fonte.chamadas.length, 0);
  assert.equal(relatorio.simulacao, true);
  assert.deepEqual(relatorio.novos.map((n) => n.doi), [nature.doi]);
  assert.deepEqual(relatorio.duplicados.map((d) => d.doi), [plos.doi]);
  assert.equal(relatorio.falhas.length, 1);
  assert.equal((await artigos()).length, 1);
  assert.equal(fs.existsSync(caminhosImportar(arquivo).estado), false);
  assert.equal(fs.existsSync(caminhosImportar(arquivo).simulacao), true);
});

test('importar cadastra em triagem com as áreas, grava relatório e nunca aprova nem publica', async () => {
  const fonte = fonteFalsa();
  const arquivo = gravar('candidatos.json', [{ doi: plos.doi, areas: ['toxicologia'] }, { doi: nature.doi, areas: ['farmacologia-clinica', 'toxicologia'] }]);
  const ctx = contexto({ fetchImpl: fonte.fetchImpl });
  const relatorio = await importarLote(ctx, { arquivo, pausaMs: 0 });
  assert.equal(relatorio.importados.length, 2);
  assert.equal(relatorio.interrompido, null);
  const linhas = await artigos();
  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((l) => l.status === 'em_triagem' && l.approved_at === null && l.published_at === null));
  assert.deepEqual(linhas.find((l) => l.doi === plos.doi).topics, ['toxicologia']);
  assert.deepEqual([...linhas.find((l) => l.doi === nature.doi).topics].sort(), ['farmacologia-clinica', 'toxicologia']);
  const auditoria = await db.query(`SELECT action FROM audit_logs WHERE action = 'LIBRARY_ARTICLE_STATUS'`);
  assert.equal(auditoria.rows.length, 0);
  assert.ok(fs.existsSync(caminhosImportar(arquivo).relatorio));
});

test('importar roda de novo sem refazer o que já foi feito (duplicado vai para o relatório)', async () => {
  const fonte = fonteFalsa();
  const arquivo = gravar('candidatos.json', [{ doi: plos.doi, areas: ['toxicologia'] }]);
  await importarLote(contexto({ fetchImpl: fonte.fetchImpl }), { arquivo, pausaMs: 0 });
  const antes = fonte.chamadas.length;
  await importarLote(contexto({ fetchImpl: fonte.fetchImpl }), { arquivo, pausaMs: 0 });
  assert.equal(fonte.chamadas.length, antes);
  // outro arquivo/estado com o mesmo DOI: o serviço recusa como duplicado, sem buscar fontes
  const outro = gravar('outro.json', [{ doi: plos.doi }]);
  const relatorio = await importarLote(contexto({ fetchImpl: fonte.fetchImpl }), { arquivo: outro, pausaMs: 0 });
  assert.equal(relatorio.duplicados.length, 1);
  assert.equal(fonte.chamadas.length, antes);
  assert.equal((await artigos()).length, 1);
});

test('importar para no limite de taxa, grava o .estado.json e retoma do ponto', async () => {
  const fonte = fonteFalsa();
  const arquivo = gravar('candidatos.json', [{ doi: plos.doi, areas: ['toxicologia'] }, { doi: nature.doi, areas: ['toxicologia'] }]);
  await usarLimiteDeImportacao(59); // a 1ª importação é a 60ª; a 2ª passa do limite
  const ctx = contexto({ fetchImpl: fonte.fetchImpl });
  const primeira = await importarLote(ctx, { arquivo, pausaMs: 0 });
  assert.ok(primeira.interrompido);
  assert.match(primeira.interrompido.motivo, /rode o MESMO comando/);
  assert.equal(primeira.interrompido.naAltura, nature.doi);
  assert.deepEqual(primeira.pendentes, [nature.doi]);
  assert.equal((await artigos()).length, 1);
  const estado = lerSaida(caminhosImportar(arquivo).estado);
  assert.equal(estado.resultados[plos.doi].situacao, 'importado');
  assert.equal(estado.resultados[nature.doi], undefined);

  await db.exec('TRUNCATE rate_limit_buckets'); // "uma hora depois"
  const chamadasAntes = fonte.chamadas.length;
  const segunda = await importarLote(contexto({ fetchImpl: fonte.fetchImpl }), { arquivo, pausaMs: 0 });
  assert.equal(segunda.interrompido, null);
  assert.equal(segunda.importados.length, 2);
  assert.equal((await artigos()).length, 2);
  const novas = fonte.chamadas.slice(chamadasAntes);
  assert.ok(novas.length > 0);
  assert.ok(novas.every((u) => !decodeURIComponent(u).toLowerCase().includes(plos.doi)), 'o 1º DOI não foi buscado de novo');
});

test('importar registra falha de fonte sem derrubar o lote', async () => {
  const arquivo = gravar('candidatos.json', [{ doi: '10.9999/nao-existe' }, { doi: plos.doi }]);
  const fonte = fonteFalsa();
  const fetchImpl = async (url) => (decodeURIComponent(String(url)).includes('10.9999/nao-existe')
    ? new Response('{}', { status: 404 })
    : fonte.fetchImpl(url));
  const relatorio = await importarLote(contexto({ fetchImpl }), { arquivo, pausaMs: 0 });
  assert.equal(relatorio.importados.length, 1);
  assert.equal(relatorio.falhas.length, 1);
  assert.equal(relatorio.falhas[0].doi, '10.9999/nao-existe');
});

// ---------------------------------------------------------------------------
test('exportar lista só os de triagem sem resumo, com o resumo da fonte', async () => {
  const sem = await semear({ title: 'Sem resumo', source_abstract: 'Texto da fonte.' });
  await semear({ title: 'Com resumo', summary_text: 'Já resumido.', summary_origin: 'curador', summary_updated_at: new Date(), summary_updated_by: PERFIL });
  await semear({ title: 'Aprovado sem resumo', status: 'aprovado', approved_at: new Date(), approver_name: 'X' });
  const itens = await exportarSemResumo(contexto(), {});
  assert.equal(itens.length, 1);
  assert.deepEqual(Object.keys(itens[0]).sort(), ['doi', 'id', 'isClinical', 'journal', 'sourceAbstract', 'title', 'type', 'version', 'year']);
  assert.equal(itens[0].id, sem.id);
  assert.equal(itens[0].sourceAbstract, 'Texto da fonte.');
  await assert.rejects(exportarSemResumo(contexto(), { estado: 'inexistente' }), /Estado desconhecido/);
});

// ---------------------------------------------------------------------------
test('resumos grava como IA, em triagem, sem aprovar, publicar nem marcar revisão', async () => {
  const a = await semear();
  const arquivo = gravar('resumos.json', [{ id: a.id, version: a.version, summary: RESUMO_BOM }]);
  const relatorio = await aplicarResumos(contexto(), { arquivo });
  assert.equal(relatorio.aplicados.length, 1);
  const [linha] = await artigos();
  assert.equal(linha.summary_text, RESUMO_BOM);
  assert.equal(linha.summary_origin, 'ia');
  assert.equal(linha.status, 'em_triagem');
  assert.equal(linha.approved_at, null);
  assert.equal(linha.published_at, null);
  assert.equal(linha.summary_reviewed_at, null);
  assert.equal(linha.summary_reviewer_name, null);
  assert.equal(linha.version, relatorio.aplicados[0].version);
  assert.ok(fs.existsSync(caminhosResumos(arquivo).relatorio));
});

test('resumos rejeita vazio e longo; ignora quem já tem resumo; recusa versão velha', async () => {
  const a = await semear();
  const b = await semear();
  const c = await semear({ summary_text: 'Resumo antigo.', summary_origin: 'curador', summary_updated_at: new Date(), summary_updated_by: PERFIL });
  const arquivo = gravar('resumos.json', [
    { id: a.id, version: a.version, summary: '' },
    { id: a.id, version: a.version, summary: 'Frase longa de teste para o estudo. '.repeat(50) },
    { id: b.id, version: b.version + 5, summary: RESUMO_BOM },
    { id: c.id, version: c.version, summary: RESUMO_BOM },
  ]);
  const relatorio = await aplicarResumos(contexto(), { arquivo });
  assert.equal(relatorio.aplicados.length, 0);
  assert.equal(relatorio.rejeitados.length, 2);
  assert.equal(relatorio.falhas.length, 1);
  assert.equal(relatorio.ignorados.length, 1);
  assert.ok((await artigos()).filter((l) => l.summary_text).length === 1);
});

test('resumos com termos clínicos exigem isClinical:true e saem marcados no relatório', async () => {
  const a = await semear();
  const b = await semear();
  const clinico = 'O estudo avaliou o uso da droga em adultos com dor crônica. A equipe recomenda administrar 500 mg por dia. Os efeitos foram bem tolerados pelos pacientes.';
  const arquivo = gravar('resumos.json', [
    { id: a.id, version: a.version, summary: clinico },
    { id: b.id, version: b.version, summary: clinico, isClinical: true },
  ]);
  const relatorio = await aplicarResumos(contexto(), { arquivo });
  assert.equal(relatorio.rejeitados.length, 1);
  assert.equal(relatorio.aplicados.length, 1);
  assert.deepEqual(relatorio.clinicos, [b.id]);
  const linhas = await artigos();
  const aplicado = linhas.find((l) => l.id === b.id);
  assert.equal(aplicado.is_clinical, true);
  assert.equal(aplicado.summary_origin, 'ia');
  assert.equal(aplicado.status, 'em_triagem');
});

test('resumos --simular valida sem gravar', async () => {
  const a = await semear();
  const arquivo = gravar('resumos.json', [{ id: a.id, version: a.version, summary: RESUMO_BOM }]);
  const relatorio = await aplicarResumos(contexto(), { arquivo, simular: true });
  assert.equal(relatorio.simulacao, true);
  assert.equal(relatorio.aplicados[0].simulado, true);
  assert.equal((await artigos())[0].summary_text, null);
  assert.ok(fs.existsSync(caminhosResumos(arquivo).simulacao));
});

test('resumos para no limite de taxa da curadoria e lista os pendentes', async () => {
  const a = await semear();
  const hash = crypto.createHash('sha256').update(PERFIL).digest('hex');
  await db.query(`INSERT INTO rate_limit_buckets (bucket, identifier_hash, window_started_at, attempts) VALUES ('LIBRARY_CURATE', $1, now(), 300)`, [hash]);
  const arquivo = gravar('resumos.json', [{ id: a.id, version: a.version, summary: RESUMO_BOM }]);
  const relatorio = await aplicarResumos(contexto(), { arquivo });
  assert.ok(relatorio.interrompido);
  assert.deepEqual(relatorio.pendentes, [a.id]);
  assert.equal((await artigos())[0].summary_text, null);
});

test('fila conta por estado, com resumo e resumos de IA', async () => {
  const a = await semear();
  await semear({ status: 'rejeitado', status_reason: 'fora do escopo' });
  await aplicarResumos(contexto(), { arquivo: gravar('r.json', [{ id: a.id, version: a.version, summary: RESUMO_BOM }]) });
  const linhas = await resumoDaFila(contexto());
  const triagem = linhas.find((l) => l.estado === 'em_triagem');
  assert.deepEqual([triagem.total, triagem.comResumo, triagem.resumoIa], [1, 1, 1]);
  assert.equal(linhas.find((l) => l.estado === 'rejeitado').total, 1);
});

// ---------------------------------------------------------------------------
test('linha de comando: exige ambiente e perfil, e nunca imprime o segredo', async () => {
  const segredo = 'SEGREDO-do-banco-123';
  const env = { DATABASE_URL: `postgres://u:${segredo}@host/db`, LIBRARY_CONTACT_EMAIL: 'contato@exemplo.com' };
  const saidas = [];
  const base = { env, escrever: (t) => saidas.push(t), criarSql: async () => sql };

  assert.equal(await executar(['fila'], { ...base, env: {} }), 1);
  assert.equal(await executar(['fila'], base), 1); // sem --perfil
  assert.equal(await executar(['fila', '--perfil', '99999999-9999-4999-8999-999999999999', '--nome', 'X'], base), 1); // perfil inexistente

  await semear();
  assert.equal(await executar(['fila', '--perfil', PERFIL, '--nome', 'Dono Teste'], base), 0);
  assert.ok(saidas.some((l) => l.startsWith('em_triagem')));

  const falho = { ...base, criarSql: async () => { throw new Error(`falha ao conectar em ${env.DATABASE_URL}`); } };
  assert.equal(await executar(['fila', '--perfil', PERFIL, '--nome', 'Dono Teste'], falho), 1);
  assert.ok(!saidas.join('\n').includes(segredo));
  assert.ok(saidas.some((l) => l.includes('[oculto]')));
});

test('linha de comando: exportar grava o arquivo e importar --simular não exige contato', async () => {
  const env = { DATABASE_URL: 'postgres://u:p@host/db' };
  const saidas = [];
  const base = { env, escrever: (t) => saidas.push(t), criarSql: async () => sql };
  const comPerfil = ['--perfil', PERFIL, '--nome', 'Dono Teste'];
  await semear({ source_abstract: 'Fonte.' });
  const saida = path.join(dir, 'abstracts.json');
  assert.equal(await executar(['exportar', '--saida', saida, ...comPerfil], base), 0);
  assert.equal(lerSaida(saida).length, 1);
  const cand = gravar('candidatos.json', [{ doi: plos.doi, areas: ['toxicologia'] }]);
  assert.equal(await executar(['importar', '--arquivo', cand, '--simular', ...comPerfil], base), 0);
  assert.equal(await executar(['importar', '--arquivo', cand, ...comPerfil], base), 1); // sem LIBRARY_CONTACT_EMAIL
});
