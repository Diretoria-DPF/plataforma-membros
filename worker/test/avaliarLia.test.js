/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * avaliarLia.test.js — worker/scripts/avaliar-lia.mjs: seleção por perfil, avaliação automática, CSV, resumo e
 * a execução inteira com fetch simulado (o token de sessão nunca aparece no CSV nem na saída).
 */
import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BASE, CSV_COLUMNS, parseArgs, selectCases, evaluate, toCsv, summarize, formatSummary, main } from '../scripts/avaliar-lia.mjs';
import { INTENTS } from '../src/assistant/kb.js';
import { CLINICAL_REPLY } from '../src/assistant/questionKind.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'lia-golden.json'), 'utf8'));
const byQuestion = (q) => GOLDEN.find((g) => g.pergunta === q);

describe('argumentos e seleção', () => {
  test('o padrão é o staging, nunca produção', () => {
    expect(DEFAULT_BASE).toBe('https://staging-api.laift.com.br/v1/');
    expect(parseArgs([]).base).toBe(DEFAULT_BASE);
    expect(parseArgs(['https://x.example/v1/', '--out=a.csv', '--delay=50'])).toEqual({ base: 'https://x.example/v1/', options: { out: 'a.csv', delay: '50' } });
  });

  test('visitante roda as de visitante e de ambos; membro roda as de membro e de ambos', () => {
    const visitor = selectCases(GOLDEN, 'visitante');
    const member = selectCases(GOLDEN, 'membro');
    expect(visitor.filter((g) => g.perfil === 'visitante').length).toBeGreaterThanOrEqual(5);
    expect(visitor.every((g) => g.perfil !== 'membro')).toBe(true);
    expect(member.every((g) => g.perfil !== 'visitante')).toBe(true);
  });
});

describe('evaluate', () => {
  test('definição respondida pelo passo a passo é erro de intenção', () => {
    const entry = byQuestion('O que é a Biblioteca LAIFT?');
    const wrong = INTENTS.find((i) => i.id === 'biblioteca');
    const row = evaluate(entry, { success: true, source: 'kb', reply: wrong.reply, sources: [], actions: [{ type: 'navigate', target: 'panel-library' }] }, 120, 'membro');
    expect(row.erro_intencao).toMatch(/passo a passo \(biblioteca\)/);
    expect(row.botoes).toBe('navigate:panel-library');
    const ok = evaluate(entry, { success: true, source: 'ai', reply: 'A Biblioteca reúne artigos. (Fonte: seção Biblioteca)', sources: [{ source: 'kb', section: 'Biblioteca: como buscar artigos' }] }, 800, 'membro');
    expect(ok.erro_intencao).toBe('');
    expect(ok.secao_esperada_ok).toBe('true');
    expect(ok.tem_fonte).toBe('true');
  });

  test('clínica sem a resposta segura é erro; com ela, não', () => {
    const entry = byQuestion('Qual a dose de paracetamol para uma criança de 10 kg?');
    expect(evaluate(entry, { success: true, source: 'ai', reply: 'Dê 500 mg.' }, 10, 'membro').erro_intencao).toMatch(/clínica/);
    expect(evaluate(entry, { success: true, source: 'kb', reply: CLINICAL_REPLY.reply, sources: CLINICAL_REPLY.sources }, 10, 'membro').erro_intencao).toBe('');
  });

  test('"não sei" e erro de rede são marcados', () => {
    const entry = byQuestion('O que é a LAIFT?');
    expect(evaluate(entry, { success: true, source: 'fallback', reply: 'Ainda não sei responder isso por aqui.' }, 5, 'visitante').nao_sei).toBe('true');
    const failed = evaluate(entry, { success: false, message: 'Muitas tentativas' }, 5, 'visitante');
    expect(failed.erro_http).toBe('Muitas tentativas');
    expect(failed.nao_sei).toBe('false');
  });

  test('a linha tem um campo vazio para o revisor humano anotar', () => {
    const row = evaluate(byQuestion('O que é a LAIFT?'), { success: true, source: 'kb', reply: 'x' }, 5, 'visitante');
    expect(row.revisor_nota_0a2).toBe('');
    expect(row.revisor_comentario).toBe('');
  });
});

describe('CSV e resumo', () => {
  const rows = [
    evaluate(byQuestion('O que é a LAIFT?'), { success: true, source: 'kb', reply: 'Resposta, com vírgula e "aspas".\nsegunda linha', sources: [{ source: 'liga', section: 'O que é a LAIFT', url: '/liga.html' }] }, 100, 'visitante'),
    evaluate(byQuestion('Quanto custa participar da liga?'), { success: true, source: 'fallback', reply: 'Ainda não sei.' }, 300, 'visitante'),
    evaluate(byQuestion('Qual a previsão do tempo para amanhã?'), { success: false, message: 'erro' }, 50, 'visitante'),
  ];

  test('CSV com BOM, cabeçalho fixo, escape de vírgula, aspas e quebra de linha', () => {
    const csv = toCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split('\r\n')[0].slice(1)).toBe(CSV_COLUMNS.join(','));
    expect(csv).toContain('"Resposta, com vírgula e ""aspas"". segunda linha"'.replace('. segunda', '. segunda'));
    expect(CSV_COLUMNS).toEqual(expect.arrayContaining(['pergunta', 'source', 'secoes_citadas', 'botoes', 'latencia_ms', 'revisor_nota_0a2']));
  });

  test('resumo: taxas de "não sei", erro de intenção e resposta com fonte', () => {
    const s = summarize(rows);
    expect(s).toMatchObject({ total: 3, erros_http: 1, previa_de_ia: 0 });
    expect(s.nao_sei).toEqual({ n: 0, de: 1 }); // "Quanto custa" não deve responder: fica fora do denominador
    expect(s.com_fonte).toEqual({ n: 1, de: 1 });
    expect(s.latencia_ms.mediana).toBeGreaterThan(0);
    expect(formatSummary(s)).toMatch(/Taxa de "não sei"/);
    expect(formatSummary(s)).toMatch(/erro de intenção/);
  });
});

describe('main', () => {
  let dir;
  let realFetch;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avaliar-lia-')); realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); jest.restoreAllMocks(); });

  test('visitante: chama a API sem token, grava o CSV e imprime o resumo', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = jest.fn(async () => ({ json: async () => ({ success: true, source: 'kb', reply: 'ok', sources: [], actions: [] }) }));
    const out = path.join(dir, 'saida.csv');
    const rows = await main(['https://staging.example/v1/', '--out=' + out], {});
    expect(rows.length).toBe(selectCases(GOLDEN, 'visitante').length);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://staging.example/v1/');
    expect(JSON.parse(init.body)).toMatchObject({ action: 'apiAssistantChat', args: ['', { message: rows[0].pergunta }] });
    expect(fs.readFileSync(out, 'utf8').split('\r\n').length).toBe(rows.length + 2);
  });

  test('o token de sessão vai só no corpo da chamada: nunca no CSV nem na saída do terminal', async () => {
    const printed = [];
    jest.spyOn(console, 'error').mockImplementation((...a) => { printed.push(a.join(' ')); });
    globalThis.fetch = jest.fn(async () => ({ json: async () => ({ success: true, source: 'ai', reply: 'ok', sources: [] }) }));
    const out = path.join(dir, 'm.csv');
    await main(['--out=' + out], { LIA_SESSION_TOKEN: 'TOKEN-DE-TESTE-FICTICIO' });
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).args[0]).toBe('TOKEN-DE-TESTE-FICTICIO');
    expect(fs.readFileSync(out, 'utf8')).not.toContain('TOKEN-DE-TESTE-FICTICIO');
    expect(printed.join('\n')).not.toContain('TOKEN-DE-TESTE-FICTICIO');
    expect(globalThis.fetch.mock.calls[0][0]).toBe(DEFAULT_BASE);
  });

  test('erros seguidos (limite por hora) param a rodada e guardam o que já veio', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = jest.fn(async () => ({ json: async () => ({ success: false, message: 'Muitas tentativas' }) }));
    const rows = await main(['--out=' + path.join(dir, 'e.csv')], {});
    expect(rows.length).toBe(5);
  });

  test('o arquivo não carrega segredo', () => {
    const src = fs.readFileSync(path.join(here, '..', 'scripts', 'avaliar-lia.mjs'), 'utf8');
    expect(src).not.toMatch(/gsk_|sk-[A-Za-z0-9]{10}|Bearer\s+[A-Za-z0-9]/);
    expect(src).not.toMatch(/console\.log/);
  });
});
