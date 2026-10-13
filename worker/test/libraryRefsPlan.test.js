/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * libraryRefsPlan.test.js — quando a Lia busca artigos da Biblioteca para citar (libraryPlan, regra PURA):
 * pedido explícito de artigos, ou pergunta de conteúdo científico/estudo (definição) que não é de uso da
 * plataforma, não é clínica e não foi respondida por regra. Nunca para uso da plataforma nem conduta.
 */
import { libraryPlan, studyQuery, referenceView } from '../src/assistant/libraryRefs.js';
import { questionKind } from '../src/assistant/questionKind.js';

const plan = (message, hadIntent = false) => libraryPlan(message, questionKind(message), hadIntent);

describe('pedido explícito de artigos', () => {
  test.each([
    ['tem artigos sobre intoxicação por metanol?', 'intoxicação metanol'],
    ['quais estudos existem sobre paracetamol?', 'paracetamol'],
    ['me indica referências sobre receptores muscarínicos', 'receptores muscarínicos'],
  ])('%s', (message, query) => {
    expect(plan(message)).toEqual({ query, explicit: true });
  });

  test('vale mesmo quando uma intenção por regra respondeu', () => {
    expect(plan('tem artigos sobre paracetamol?', true)).toEqual({ query: 'paracetamol', explicit: true });
  });

  test('pergunta de USO da Biblioteca (sugerir, citar, salvar) não é busca', () => {
    expect(plan('como sugiro um artigo para a Biblioteca?')).toBeNull();
    expect(plan('como faço para citar um artigo em ABNT?')).toBeNull();
  });
});

describe('pergunta de conteúdo científico (definição) sem intenção por regra', () => {
  test.each([
    ['O que é um agonista parcial?', 'agonista parcial'],
    ['Qual a diferença entre agonista e antagonista?', 'agonista antagonista'],
    ['Para que serve a atropina?', 'atropina'],
    ['O que é toxicidade hepática do paracetamol?', 'toxicidade hepática paracetamol'],
  ])('%s', (message, query) => {
    expect(plan(message)).toEqual({ query, explicit: false });
  });

  test('usa no máximo 3 termos (a busca exige TODOS)', () => {
    expect(studyQuery('O que é a síndrome colinérgica por organofosforados em adultos?').split(' ')).toHaveLength(3);
  });

  test('se uma intenção por regra respondeu, não há busca implícita', () => {
    expect(plan('O que é um agonista parcial?', true)).toBeNull();
  });
});

describe('quando NÃO busca artigos', () => {
  test.each([
    ['O que é a LAIFT?'],
    ['Quanto custa a mensalidade?'],
    ['O que é o processo seletivo?'],
    ['Quem pode acessar a Biblioteca?'],
    ['Para que serve o crachá virtual?'],
    ['Por que não consigo entrar na minha conta?'],
    ['Como faço para me inscrever em um evento?'],
    ['Qual a previsão do tempo para amanhã?'],
    ['bom dia'],
    [''],
  ])('uso da plataforma ou assunto alheio: %p', (message) => {
    expect(plan(message)).toBeNull();
  });

  test.each([
    ['Qual a dose de paracetamol para uma criança?'],
    ['Qual a conduta na intoxicação por organofosforado?'],
    ['Como é o tratamento do meu paciente com overdose?'],
    ['tem artigos sobre a dose de paracetamol?'],
  ])('pergunta clínica (dose, conduta, tratamento): %p', (message) => {
    expect(plan(message)).toBeNull();
  });

  test('entrada que não é texto nunca lança', () => {
    expect(libraryPlan(undefined, 'definicao', false)).toBeNull();
    expect(libraryPlan({}, 'definicao', false)).toBeNull();
    expect(studyQuery(null)).toBe('');
  });
});

describe('referenceView — só o que o cliente precisa', () => {
  const full = {
    id: 'a-1', title: 'Título', authors: 'Silva A, Souza B et al.', journal: 'Rev', year: 2021, language: 'pt',
    languageLabel: 'Português', openAccess: true, url: 'https://doi.org/10.1/x', summary: { text: 'resumo', origin: 'ia' },
  };

  test('id, título, autores, periódico, ano e url — sem resumo, idioma nem outros campos', () => {
    expect(referenceView(full)).toEqual({ id: 'a-1', title: 'Título', authors: 'Silva A, Souza B et al.', journal: 'Rev', year: 2021, url: 'https://doi.org/10.1/x' });
  });
});
