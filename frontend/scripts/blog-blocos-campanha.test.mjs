/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Testes dos blocos de campanha (scripts/blog-blocos-campanha.js). Sem rede, sem navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const campanha = require('./blog-blocos-campanha.js');
const gerador = require('./build-blog.js');
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(AQUI, 'blog-blocos-campanha.js');
const EXEMPLO = path.join(AQUI, '..', 'blog', 'conteudo', '_EXEMPLO-campanha.json');
// 'laco' entra no ICONES do gerador com o plugue S1; até lá, a lista de teste acrescenta o ícone.
const ICONES = [...gerador.ICONES, 'laco'];
const EMOJI_EXERCICIO = '\u{1F3C3}‍♀️';
const SORRISO = '\u{1F600}';

function esc(valor) {
  return String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function ctxDe(blocos = []) {
  return {
    esc,
    renderInline: esc,
    icone: (id, classe) => `<svg class="${classe}"></svg>`,
    avisos: [],
    contador: { h2: 0, contato: 0 },
    blocos,
  };
}

const validarCom = (bloco, blocos = []) => campanha.validar(bloco, { blocos, icones: ICONES });
const renderCom = (bloco, blocos = []) => campanha.render(bloco, ctxDe(blocos));
const tem = (lista, trecho) => lista.some((e) => e.includes(trecho));
function contem(html, trechos) {
  for (const trecho of trechos) assert.ok(html.includes(trecho), `falta no HTML: ${trecho}`);
}

const REF_BASE = {
  titulo: 'Fonte de teste', orgao: 'Órgão de teste', href: 'https://www.gov.br/inca/x', acesso: '2026-10-09', tipo: 'dados',
};
const REF = (id = 'exemplo-a', extra = {}) => ({ id, ...REF_BASE, ...extra });
// ctx.blocos com as fontes: exemplo-a é a fonte 1 e exemplo-b a fonte 2.
const BLOCOS_COM_FONTE = [{ t: 'referencias', itens: [REF('exemplo-a'), REF('exemplo-b')] }];
const AVISO = { t: 'destaque', tom: 'atencao', texto: 'Aviso de teste.' };

function cartas(n, extra = {}) {
  return Array.from({ length: n }, (_, i) => ({
    frase: `Frase ${i + 1}`, veredito: i % 2 ? 'verdade' : 'mito', explicacao: 'Explicação.', ref: 'exemplo-a', ...extra,
  }));
}

const PAINEL = {
  t: 'painel',
  titulo: 'Números',
  kpis: [{ valor: 78610, casas: 0, sufixo: ' casos/ano', rotulo: 'Casos estimados', detalhe: 'Valor de exemplo.', ref: 'exemplo-a' }],
  graficos: [{
    titulo: 'Taxa',
    unidade: 'casos por 100 mil',
    casas: 1,
    series: ['2023–2025', '2026–2028'],
    itens: [{ rotulo: 'Sudeste', valores: [84.5, 80.1] }, { rotulo: 'Norte', valores: [50, 45] }],
    nota: 'Valor de exemplo.',
    ref: 'exemplo-b',
  }],
  tabelas: [{
    titulo: 'Casos',
    colunas: ['Região', 'Casos'],
    linhas: [['Sudeste', 39000], ['Norte', 21500]],
    casas: 0,
    nota: 'Valor de exemplo.',
    ref: 'exemplo-a',
  }],
};

const DECK = { t: 'deck', titulo: 'Mitos e verdades', cartas: cartas(6) };

const COMPARATIVO = {
  t: 'comparativo',
  titulo: 'Antes e hoje',
  itens: [
    { tema: 'Exame', antes: 'Era raro', agora: 'Mais comum', ref: 'exemplo-a' },
    { tema: 'Tratamento', antes: 'Limitado', agora: 'Amplo' },
    { tema: 'Acesso', antes: 'Menor', agora: 'Maior' },
  ],
};

const CAMPO = { rotulo: 'O que é', texto: 'Exame de imagem.' };
const GUIA = {
  t: 'guia',
  itens: [
    { icone: 'laboratorio', nome: 'Mamografia', campos: [CAMPO], ref: 'exemplo-a' },
    { nome: 'Ultrassom', campos: [CAMPO] },
  ],
};

const FAIXAS = {
  t: 'faixas',
  titulo: 'Por fase',
  itens: [
    { faixa: 'criancas', rotulo: 'Crianças', idade: 'até 12 anos', texto: 'Texto da faixa.', dicas: ['Dica um.'] },
    { faixa: 'jovens', rotulo: 'Jovens', texto: 'Outro texto.', ref: 'exemplo-a' },
    { faixa: 'idosas', rotulo: 'Pessoas idosas', texto: 'Mais um texto.' },
  ],
};

const HABITO = (emoji, efeito, ref = 'exemplo-a') => ({ emoji, titulo: 'Hábito', efeito, texto: 'Texto.', ref });
const HABITOS = {
  t: 'habitos',
  itens: [
    HABITO(EMOJI_EXERCICIO, 'protege'),
    HABITO('\u{1F966}', 'reduz-risco'),
    HABITO('\u{1F6AD}', 'evitar'),
    HABITO('\u{1FA7A}', 'apoia-tratamento', 'exemplo-b'),
  ],
};

const REFERENCIAS = {
  t: 'referencias',
  itens: [{
    id: 'epi-inca-estimativa-2026',
    titulo: 'Estimativas',
    orgao: 'INCA / Ministério da Saúde',
    href: 'https://www.gov.br/inca/x',
    doi: '10.1000/182',
    acesso: '2026-10-09',
    tipo: 'lei',
  }],
};

function erroDeHref(href) {
  return validarCom({ t: 'referencias', itens: [{ ...REFERENCIAS.itens[0], href }] });
}

test('exporta os 8 tipos de bloco e a lista de hosts de fontes', () => {
  assert.deepEqual(campanha.BLOCOS_CAMPANHA, [
    'sumario', 'painel', 'deck', 'comparativo', 'guia', 'faixas', 'habitos', 'referencias',
  ]);
  assert.ok(campanha.HOSTS_FONTES.includes('www.gov.br'));
});

test('formatarNumero segue o padrão pt-BR', () => {
  assert.equal(campanha.formatarNumero(78610, 0), '78.610');
  assert.equal(campanha.formatarNumero(84.5, 1), '84,5');
});

test('sumario lista os h2 em ordem com #s-1 e #s-2', () => {
  const blocos = [{ t: 'h2', texto: 'Primeira' }, { t: 'p', texto: 'Meio' }, { t: 'h2', texto: 'Segunda' }];
  const html = renderCom({ t: 'sumario' }, blocos);
  contem(html, ['<nav class="blog-sumario" aria-labelledby="sumario-1">', 'href="#s-1">Primeira</', 'href="#s-2">Segunda</']);
  assert.ok(html.indexOf('#s-1') < html.indexOf('#s-2'));
});

test('sumario recusa título que não é texto', () => {
  assert.ok(tem(validarCom({ t: 'sumario', titulo: 7 }), 'titulo deve ser texto'));
});

test('painel renderiza KPI, gráfico e tabela com as classes do contrato', () => {
  const html = renderCom(PAINEL, BLOCOS_COM_FONTE);
  contem(html, [
    'class="blog-painel"', 'class="blog-kpi__num"', 'data-valor="78610"', '78.610',
    'class="blog-grafico" data-series="2"', 'class="blog-grafico__barra" data-serie="1"',
    'class="blog-tabela-dados"', '<td data-num>39.000</td>', '<th scope="row">Sudeste</th>',
    'href="#ref-exemplo-a" aria-label="Fonte 1"',
  ]);
  assert.deepEqual(validarCom(PAINEL), []);
});

test('painel sem kpis, graficos nem tabelas é recusado', () => {
  assert.ok(tem(validarCom({ t: 'painel', titulo: 'Vazio' }), 'painel sem kpis, graficos ou tabelas'));
});

test('painel recusa KPI cujo valor não é número', () => {
  assert.ok(tem(validarCom({ t: 'painel', kpis: [{ valor: '78', rotulo: 'x' }] }), 'valor deve ser número'));
});

test('painel exige um valor por série no gráfico', () => {
  const grafico = { titulo: 'T', series: ['a', 'b'], itens: [{ rotulo: 'r', valores: [1] }, { rotulo: 's', valores: [2] }] };
  assert.ok(tem(validarCom({ t: 'painel', graficos: [grafico] }), 'deve ter 2 número(s)'));
});

test('barra de 84,5 sobre máximo 100 tem data-v 0.845 e data-p 85', () => {
  const html = renderCom({
    t: 'painel',
    graficos: [{ titulo: 'Taxa', itens: [{ rotulo: 'A', valores: [84.5] }, { rotulo: 'B', valores: [100] }] }],
  });
  assert.match(html, /data-v="0\.845" data-p="85"/);
});

test('deck renderiza cartas em details, filtros escondidos e atributos do contrato', () => {
  const html = renderCom(DECK, BLOCOS_COM_FONTE);
  contem(html, [
    'class="blog-deck" data-deck',
    'class="blog-deck__filtros" role="group" aria-label="Filtrar cartas" hidden',
    'data-filtro="mito"', '>Mitos</button>',
    '<li class="blog-carta" data-veredito="mito">', '<details class="blog-carta__det">',
    'Ver resposta', '<p class="blog-carta__veredito">Mito</p>',
  ]);
  assert.doesNotMatch(html, /data-filtro="depende"/);
});

test('deck mostra o filtro Depende só com carta depende', () => {
  const lista = cartas(6);
  lista[1] = { ...lista[1], veredito: 'depende' };
  assert.match(renderCom({ t: 'deck', cartas: lista }), /data-filtro="depende"/);
});

test('deck recusa menos de 6 cartas', () => {
  assert.ok(tem(validarCom({ t: 'deck', cartas: cartas(5) }), 'cartas: entre 6 e 12 itens'));
});

test('deck exige ref em toda carta', () => {
  const lista = cartas(6);
  delete lista[0].ref;
  assert.ok(tem(validarCom({ t: 'deck', cartas: lista }), 'ref obrigatório'));
});

test('deck recusa frase com mais de 120 caracteres', () => {
  assert.ok(tem(validarCom({ t: 'deck', cartas: cartas(6, { frase: 'x'.repeat(121) }) }), 'frase com mais de 120'));
});

test('deck recusa emoji no texto', () => {
  assert.ok(tem(validarCom({ t: 'deck', cartas: cartas(6, { frase: `Oi ${SORRISO}` }) }), 'emoji fora de habitos'));
});

test('texto com <b> sai escapado no deck', () => {
  const html = renderCom({ t: 'deck', cartas: cartas(6, { frase: '<b>negrito</b>' }) });
  contem(html, ['&lt;b&gt;negrito&lt;/b&gt;']);
  assert.ok(!html.includes('<b>'));
});

test('comparativo renderiza data-col e data-rotulo com a fonte na coluna Hoje', () => {
  const html = renderCom(COMPARATIVO, BLOCOS_COM_FONTE);
  contem(html, [
    'class="blog-comparativo__tabela"', 'data-col="antes" data-rotulo="Antes"', 'data-col="agora" data-rotulo="Hoje"',
    '<th scope="row">Exame</th>',
    'Mais comum <sup class="blog-ref"><a href="#ref-exemplo-a" aria-label="Fonte 1">1</a></sup></td>',
  ]);
});

test('comparativo recusa menos de 3 itens', () => {
  const itens = COMPARATIVO.itens.slice(0, 2);
  assert.ok(tem(validarCom({ t: 'comparativo', itens }), 'itens: entre 3 e 10 itens'));
});

test('guia renderiza itens com ícone, campos e fonte', () => {
  const html = renderCom(GUIA, BLOCOS_COM_FONTE);
  contem(html, [
    '<li class="blog-guia__item"><svg class="blog-guia__icone"></svg>',
    '<h3 class="blog-guia__nome">Mamografia</h3>',
    '<dl class="blog-guia__campos"><div><dt>O que é</dt><dd>Exame de imagem.</dd></div></dl>',
    '<p class="blog-guia__fonte"><sup class="blog-ref">',
  ]);
});

test('guia recusa ícone fora da lista de ícones', () => {
  const itens = [{ ...GUIA.itens[0], icone: 'inexistente' }, GUIA.itens[1]];
  assert.ok(tem(validarCom({ t: 'guia', itens }), 'icone desconhecido: inexistente'));
});

test('guia recusa item sem campos', () => {
  const itens = [{ nome: 'Sem campos', campos: [] }, GUIA.itens[1]];
  assert.ok(tem(validarCom({ t: 'guia', itens }), 'campos: entre 1 e 4 itens'));
});

test('faixas renderiza details fechados com data-faixa e dicas', () => {
  const html = renderCom(FAIXAS, BLOCOS_COM_FONTE);
  contem(html, [
    '<details class="blog-faixa" data-faixa="criancas"><summary class="blog-faixa__resumo">',
    '<span class="blog-faixa__idade">até 12 anos</span>',
    '<ul class="blog-lista"><li>Dica um.</li></ul>',
  ]);
  assert.doesNotMatch(html, /<details[^>]* open/);
});

test('faixas recusa faixa desconhecida', () => {
  const itens = [{ ...FAIXAS.itens[0], faixa: 'bebes' }, FAIXAS.itens[1], FAIXAS.itens[2]];
  assert.ok(tem(validarCom({ t: 'faixas', itens }), 'valor inválido para faixa'));
});

test('faixas recusa menos de 3 itens', () => {
  assert.ok(tem(validarCom({ t: 'faixas', itens: FAIXAS.itens.slice(0, 2) }), 'itens: entre 3 e 7 itens'));
});

test('habitos aceita emoji no campo emoji e renderiza o efeito', () => {
  assert.deepEqual(validarCom(HABITOS, BLOCOS_COM_FONTE), []);
  const html = renderCom(HABITOS, BLOCOS_COM_FONTE);
  contem(html, [
    '<li class="blog-habito" data-efeito="protege">',
    `<span class="blog-habito__emoji" aria-hidden="true">${EMOJI_EXERCICIO}</span>`,
    '<p class="blog-habito__efeito">Ajuda a prevenir</p>',
    '<p class="blog-habito__efeito">Evite</p>',
  ]);
});

test('habitos recusa emoji que não é emoji', () => {
  const itens = [HABITO('abc', 'protege'), ...HABITOS.itens.slice(1)];
  assert.ok(tem(validarCom({ t: 'habitos', itens }), 'emoji inválido'));
});

test('habitos recusa emoji com mais de 8 pontos de código', () => {
  const itens = [HABITO(SORRISO.repeat(9), 'protege'), ...HABITOS.itens.slice(1)];
  assert.ok(tem(validarCom({ t: 'habitos', itens }), 'emoji deve ter de 1 a 8'));
});

test('habitos recusa efeito desconhecido', () => {
  const itens = [HABITO(EMOJI_EXERCICIO, 'cura'), ...HABITOS.itens.slice(1)];
  assert.ok(tem(validarCom({ t: 'habitos', itens }), 'valor inválido para efeito'));
});

test('referencias renderiza id, DOI, link com rel seguro e data por extenso', () => {
  const html = renderCom(REFERENCIAS);
  contem(html, [
    '<li class="blog-referencia" id="ref-epi-inca-estimativa-2026" data-tipo="lei">',
    'target="_blank" rel="noopener noreferrer"',
    'href="https://doi.org/10.1000/182"',
    'Acesso em 9 de outubro de 2026.',
  ]);
});

test('referencias recusa http e hosts fora da lista', () => {
  assert.ok(tem(erroDeHref('http://www.gov.br/x'), 'href deve usar https'));
  assert.ok(tem(erroDeHref('https://evil.com/x'), 'host fora da lista'));
});

test('referencias recusa id com formato inválido', () => {
  const itens = [{ ...REFERENCIAS.itens[0], id: 'X' }];
  assert.ok(tem(validarCom({ t: 'referencias', itens }), 'id com formato inválido'));
});

test('referencias recusa data de acesso inexistente', () => {
  const itens = [{ ...REFERENCIAS.itens[0], acesso: '2026-13-01' }];
  assert.ok(tem(validarCom({ t: 'referencias', itens }), 'acesso deve ser AAAA-MM-DD'));
});

test('referencias recusa mais de 60 itens', () => {
  const itens = Array.from({ length: 61 }, (_, i) => ({ ...REFERENCIAS.itens[0], id: `ref-${i}` }));
  assert.ok(tem(validarCom({ t: 'referencias', itens }), 'itens: entre 1 e 60 itens'));
});

test('href aceita só https com host exato da lista', () => {
  assert.deepEqual(erroDeHref('https://www.gov.br/inca/x'), []);
  for (const ruim of ['http://www.gov.br/x', 'https://www.gov.br.evil.com/x', 'https://evil.com/x']) {
    assert.ok(erroDeHref(ruim).length > 0, ruim);
  }
});

test('checarPost aceita um post completo e válido', () => {
  const blocos = [
    AVISO,
    { t: 'h2', texto: 'Seção' },
    { t: 'sumario' },
    { t: 'p', texto: 'Fonte [x](#ref-exemplo-a).' },
    { t: 'referencias', itens: [REF('exemplo-a')] },
    AVISO,
  ];
  assert.deepEqual(campanha.checarPost(blocos), []);
});

test('checarPost acusa ref inexistente e #ref-x inexistente num p', () => {
  const erros = campanha.checarPost([
    AVISO,
    { t: 'p', texto: 'Veja [aqui](#ref-x).' },
    { t: 'deck', cartas: cartas(6, { ref: 'nao-existe' }) },
    AVISO,
  ]);
  assert.ok(tem(erros, '#ref-x sem fonte'));
  assert.ok(tem(erros, 'ref "nao-existe" sem fonte'));
});

test('checarPost recusa emoji em p', () => {
  assert.ok(tem(campanha.checarPost([AVISO, { t: 'p', texto: `Oi ${SORRISO}` }, AVISO]), 'emoji'));
});

test('checarPost exige aviso no topo e outro entre os 3 últimos blocos', () => {
  assert.ok(tem(campanha.checarPost([{ t: 'p', texto: 'Oi' }, AVISO]), 'o 1º bloco'));
  const semFim = [AVISO, { t: 'p', texto: 'a' }, { t: 'p', texto: 'b' }, { t: 'p', texto: 'c' }];
  assert.ok(tem(campanha.checarPost(semFim), 'falta destaque de atenção'));
});

test('checarPost limita sumario e referencias a um, e acusa id repetido', () => {
  const erros = campanha.checarPost([
    AVISO,
    { t: 'sumario' },
    { t: 'sumario' },
    { t: 'referencias', itens: [REF('abc-1'), REF('abc-1')] },
    { t: 'referencias', itens: [REF('abc-2')] },
    AVISO,
  ]);
  assert.ok(tem(erros, 'no máximo 1 bloco sumario'));
  assert.ok(tem(erros, 'no máximo 1 bloco referencias'));
  assert.ok(tem(erros, 'id de referência repetido: abc-1'));
});

test('nenhum bloco do exemplo renderiza style=', () => {
  const { posts: [post] } = JSON.parse(fs.readFileSync(EXEMPLO, 'utf8'));
  const campanhas = post.blocos.filter((b) => campanha.BLOCOS_CAMPANHA.includes(b.t));
  for (const bloco of campanhas) {
    assert.ok(!renderCom(bloco, post.blocos).includes('style='), bloco.t);
  }
});

test('_EXEMPLO-campanha.json tem os 8 blocos e passa em validar e checarPost', () => {
  const { posts: [post] } = JSON.parse(fs.readFileSync(EXEMPLO, 'utf8'));
  const tipos = new Set(post.blocos.map((b) => b.t));
  for (const tipo of campanha.BLOCOS_CAMPANHA) assert.ok(tipos.has(tipo), `falta o bloco ${tipo}`);
  assert.ok(tipos.has('h2') && tipos.has('p') && tipos.has('destaque'));
  assert.equal(post.serie, 'campanhas');
  assert.equal(post.fixado, false);
  const avisos = post.blocos.filter((b) => b.t === 'destaque' && b.tom === 'atencao');
  assert.equal(avisos.length, 2);
  const erros = post.blocos
    .filter((b) => campanha.BLOCOS_CAMPANHA.includes(b.t))
    .flatMap((b) => validarCom(b, post.blocos));
  assert.deepEqual(erros, []);
  assert.deepEqual(campanha.checarPost(post.blocos), []);
});

function escreverParte(conteudo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laift-campanha-'));
  const arquivo = path.join(dir, 'parte.json');
  fs.writeFileSync(arquivo, JSON.stringify(conteudo));
  return { dir, arquivo };
}

function rodarCli(arquivo) {
  return spawnSync(process.execPath, [SCRIPT, '--checar-parte', arquivo], { encoding: 'utf8' });
}

test('CLI --checar-parte aceita uma parte válida (código 0)', () => {
  const { dir, arquivo } = escreverParte({
    blocos: [{ t: 'h2', texto: 'Seção' }, { t: 'p', texto: 'Texto com [fonte](#ref-exemplo-a).' }],
    referencias: [REF('exemplo-a')],
  });
  try {
    const r = rodarCli(arquivo);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /OK \(2 blocos, 1 referências\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --checar-parte recusa uma parte com emoji (código 1, lista de erros)', () => {
  const { dir, arquivo } = escreverParte({ blocos: [{ t: 'p', texto: `Oi ${SORRISO}` }] });
  try {
    const r = rodarCli(arquivo);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^- .*emoji/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
