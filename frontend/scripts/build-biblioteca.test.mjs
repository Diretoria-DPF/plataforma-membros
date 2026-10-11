/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Testes do gerador da página pública /biblioteca (scripts/build-biblioteca.js). Sem rede, sem navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { searchNorm } from '../../worker/src/library/normalize.js';

const require = createRequire(import.meta.url);
const gerador = require('./build-biblioteca.js');
const citacao = require('../library-cite.js');
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(AQUI, '..');
const CSP_DO_BLOG = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(
  fs.readFileSync(path.join(FRONTEND, 'blog.html'), 'utf8'),
)[1];
// A página fala com a API ao vivo: o connect-src é o do blog mais só as origens de produção e homologação.
const CONNECT_DA_BIBLIOTECA = "connect-src 'self' https://api.laift.com.br https://staging-api.laift.com.br";
const CSP_DA_BIBLIOTECA = CSP_DO_BLOG.replace("connect-src 'self'", CONNECT_DA_BIBLIOTECA);
const NOINDEX = '<meta name="robots" content="noindex">';
const RESERVA_DESLIGADA = { versao: 1, enabled: false, generatedAt: '2026-10-10T00:00:00Z', topics: [], items: [] };

function tmp(nome) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `laift-biblioteca-${nome}-`));
}

function escrever(dir, nome, conteudo) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, nome), typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo));
}

function artigo(extra = {}) {
  return {
    id: 'a1',
    title: 'Efeitos do paracetamol no fígado',
    authors: [{ family: 'Silva', given: 'Ana Maria' }, { family: 'Souza', given: 'Bruno' }],
    authorCount: 2,
    journal: 'Toxicology Letters',
    year: 2021,
    doi: '10.1000/xyz',
    pmid: '12345',
    type: 'artigo',
    topics: ['toxicologia'],
    openAccess: true,
    license: 'cc-by',
    landingUrl: 'https://doi.org/10.1000/xyz',
    publishedAt: '2021-03-01',
    ...extra,
  };
}

function catalogo(itens, extra = {}) {
  return {
    enabled: true,
    generatedAt: '2026-10-10T09:00:00Z',
    topics: [{ slug: 'toxicologia', name: 'Toxicologia' }, { slug: 'farmacologia', name: 'Farmacologia' }],
    items: itens,
    ...extra,
  };
}

/** Gera numa pasta nova. recente/reserva são conteúdo (objeto ou texto), não caminho. */
function gerar({ recente, reserva } = {}) {
  const base = tmp('build');
  const srcDir = path.join(base, 'conteudo');
  const outDir = path.join(base, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://laift.com.br/</loc>\n  </url>\n</urlset>\n');
  fs.writeFileSync(path.join(outDir, 'llms.txt'), '# LAIFT\n\n## Páginas públicas\n- [Início](https://laift.com.br/): apresentação.\n\n## Observações\n- Sem API pública.\n');
  if (recente !== undefined) escrever(srcDir, 'recente.json', recente);
  if (reserva !== undefined) escrever(srcDir, 'reserva.json', reserva);
  const catalogoFile = path.join(base, 'catalogo.js');
  fs.writeFileSync(catalogoFile, '// catalogo de teste\n');
  const resultado = gerador.build({ outDir, srcDir, catalogo: catalogoFile });
  return { ...resultado, outDir, srcDir, catalogoFile };
}

const lerHtml = (r) => fs.readFileSync(path.join(r.outDir, 'biblioteca.html'), 'utf8');
const lerIndex = (r) => JSON.parse(fs.readFileSync(path.join(r.outDir, 'biblioteca', 'index.json'), 'utf8'));
const lerJsonLd = (html) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);

test('reserva desligada ainda gera a página (vazia, noindex), mas fora do sitemap e do llms.txt', () => {
  const r = gerar({ reserva: RESERVA_DESLIGADA });
  assert.equal(r.gerada, true);
  assert.equal(r.indexavel, false);
  assert.equal(r.itens, 0);
  const html = lerHtml(r);
  assert.ok(html.includes(NOINDEX), 'falta o noindex');
  assert.ok(html.includes('Nenhum artigo publicado ainda.'));
  assert.equal((html.match(/id="a-/g) || []).length, 0);
  assert.deepEqual(lerIndex(r).items, []);
  assert.ok(fs.existsSync(path.join(r.outDir, 'biblioteca', 'catalogo.js')));
  assert.doesNotMatch(fs.readFileSync(path.join(r.outDir, 'sitemap.xml'), 'utf8'), /\/biblioteca/);
  assert.doesNotMatch(fs.readFileSync(path.join(r.outDir, 'llms.txt'), 'utf8'), /\/biblioteca/);
});

test('catálogo ligado e vazio gera a página com noindex; com itens, sem noindex', () => {
  const vazio = gerar({ reserva: catalogo([]) });
  assert.equal(vazio.gerada, true);
  assert.equal(vazio.indexavel, false);
  assert.ok(lerHtml(vazio).includes(NOINDEX));
  const cheio = gerar({ reserva: catalogo([artigo()]) });
  assert.equal(cheio.indexavel, true);
  assert.equal(lerHtml(cheio).includes(NOINDEX), false);
  assert.equal(lerHtml(cheio).includes('biblioteca:robots'), false);
});

test('ligado com todos os itens inválidos: página vazia com noindex e aviso', () => {
  const r = gerar({ reserva: catalogo([artigo({ landingUrl: 'https://evil.example/x' })]) });
  assert.equal(r.gerada, true);
  assert.equal(r.itens, 0);
  assert.ok(lerHtml(r).includes(NOINDEX));
  assert.ok(r.avisos.some((a) => a.includes('nenhum item válido')));
});

test('CSP: connect-src só com a própria origem e as APIs de produção e homologação', () => {
  const r = gerar({ reserva: catalogo([artigo()]) });
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(lerHtml(r))[1];
  const connect = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'));
  assert.equal(connect, CONNECT_DA_BIBLIOTECA);
});

test('página com 3 itens: um h1, canonical, description, CSP do blog, og e JSON-LD válido', () => {
  const r = gerar({
    reserva: catalogo([
      artigo(),
      artigo({ id: 'a2', title: 'Revisão de farmacocinética', landingUrl: 'https://pubmed.ncbi.nlm.nih.gov/12345/', year: 2019, type: 'revisao', topics: ['farmacologia'], openAccess: false, license: 'desconhecida', authors: [{ family: 'Lima', given: 'Carla' }], authorCount: 1 }),
      artigo({ id: 'a3', title: 'Ensaio clínico randomizado', year: 2024, type: 'ensaio_clinico', topics: [] }),
    ]),
  });
  assert.equal(r.gerada, true);
  assert.equal(r.itens, 3);
  const html = lerHtml(r);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.ok(html.includes('<link rel="canonical" href="https://laift.com.br/biblioteca">'));
  const description = /<meta name="description" content="([^"]*)">/.exec(html)[1];
  assert.ok(description.length >= 70 && description.length <= 160, `description com ${description.length} caracteres`);
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP_DA_BIBLIOTECA}">`));
  assert.match(html, /<meta property="og:title" content="[^"]+">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/laift\.com\.br\/blog\/og-default\.jpg">/);
  const jsonld = lerJsonLd(html);
  const lista = jsonld['@graph'].find((no) => no['@type'] === 'ItemList');
  assert.equal(lista.numberOfItems, 3);
  assert.equal(lista.itemListElement[0].item['@type'], 'ScholarlyArticle');
  assert.equal(lista.itemListElement[0].item.isPartOf.name, 'Toxicology Letters');
  assert.ok(html.includes('id="a-a1"') && html.includes('id="a-a3"'));
  assert.ok(html.includes('href="https://doi.org/10.1000/xyz"'));
  assert.ok(html.includes('href="https://pubmed.ncbi.nlm.nih.gov/12345/"'));
});

test('título com HTML e </script> sai escapado no HTML e no JSON-LD', () => {
  const titulo = 'Teste </script><img src=x onerror=alert(1)>';
  const r = gerar({ reserva: catalogo([artigo({ title: titulo })]) });
  const html = lerHtml(r);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.equal(html.includes('</script><img'), false);
  const lista = lerJsonLd(html)['@graph'].find((no) => no['@type'] === 'ItemList');
  assert.equal(lista.itemListElement[0].item.name, titulo);
});

test('nenhum atributo de estilo, de evento inline ou innerHTML na página gerada', () => {
  const r = gerar({ reserva: catalogo([artigo()]) });
  const html = lerHtml(r);
  assert.doesNotMatch(html, /\sstyle=/);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
});

test('item inválido sai com aviso e o resto é gerado', () => {
  const r = gerar({
    reserva: catalogo([
      artigo(),
      artigo({ id: 'b1', landingUrl: 'https://evil.example/x' }),
      artigo({ id: 'b2', title: '   ' }),
      artigo({ id: 'b3', year: 1500 }),
      artigo({ id: 'b4', year: 2019 }),
    ]),
  });
  assert.equal(r.gerada, true);
  assert.equal(r.itens, 2);
  assert.equal(r.avisos.length, 3);
  assert.ok(r.avisos.some((a) => a.includes('b1')));
  assert.ok(r.avisos.some((a) => a.includes('b2')));
  assert.ok(r.avisos.some((a) => a.includes('b3')));
  assert.equal(lerIndex(r).items.length, 2);
});

test('recente.json inválido cai na reserva com aviso', () => {
  const r = gerar({ recente: '{ isto não é json', reserva: catalogo([artigo({ id: 'r1' })]) });
  assert.equal(r.gerada, true);
  assert.equal(r.itens, 1);
  assert.ok(r.avisos.some((a) => a.includes('recente')));
});

test('recente.json válido vale mais que a reserva', () => {
  const r = gerar({
    recente: catalogo([artigo({ id: 'n1' }), artigo({ id: 'n2' })]),
    reserva: catalogo([artigo({ id: 'r1' })]),
  });
  assert.equal(r.itens, 2);
  assert.deepEqual(lerIndex(r).items.map((i) => i.id), ['n1', 'n2']);
});

test('sitemap e llms.txt têm uma entrada mesmo rodando duas vezes', () => {
  const r = gerar({ reserva: catalogo([artigo()]) });
  gerador.build({ outDir: r.outDir, srcDir: r.srcDir, catalogo: r.catalogoFile });
  const sitemap = fs.readFileSync(path.join(r.outDir, 'sitemap.xml'), 'utf8');
  const llms = fs.readFileSync(path.join(r.outDir, 'llms.txt'), 'utf8');
  assert.equal(sitemap.split('<loc>https://laift.com.br/biblioteca</loc>').length - 1, 1);
  assert.equal(llms.split('(https://laift.com.br/biblioteca)').length - 1, 1);
  assert.match(llms, /## Observações/);
});

test('desligar depois de ligar tira a URL do sitemap e do llms.txt e põe noindex', () => {
  const r = gerar({ reserva: catalogo([artigo()]) });
  escrever(r.srcDir, 'reserva.json', RESERVA_DESLIGADA);
  const segunda = gerador.build({ outDir: r.outDir, srcDir: r.srcDir, catalogo: r.catalogoFile });
  assert.equal(segunda.gerada, true);
  assert.equal(segunda.indexavel, false);
  assert.doesNotMatch(fs.readFileSync(path.join(r.outDir, 'sitemap.xml'), 'utf8'), /\/biblioteca/);
  assert.doesNotMatch(fs.readFileSync(path.join(r.outDir, 'llms.txt'), 'utf8'), /\/biblioteca/);
  assert.ok(lerHtml(r).includes(NOINDEX));
});

test('index.json com 150 itens fictícios fica até 80 KB', () => {
  const itens = Array.from({ length: 150 }, (_, i) => artigo({
    id: `x${i}`,
    title: `Artigo número ${i} sobre farmacologia clínica e toxicologia`,
    landingUrl: `https://doi.org/10.1000/item${i}`,
    doi: `10.1000/item${i}`,
    authors: [{ family: 'Silva', given: 'Ana' }, { family: 'Souza', given: 'Bruno' }, { family: 'Lima', given: 'Carla' }, { family: 'Reis', given: 'Daniel' }],
    authorCount: 4,
  }));
  const r = gerar({ reserva: catalogo(itens) });
  assert.equal(r.itens, 150);
  const tamanho = fs.statSync(path.join(r.outDir, 'biblioteca', 'index.json')).size;
  assert.ok(tamanho <= 80 * 1024, `index.json com ${tamanho} bytes`);
});

test('n de cada item é o searchNorm do worker', () => {
  const bruto = artigo({
    title: 'Efeitos do Paracetamol: revisão (2021)',
    authors: [{ family: 'Müller', given: 'Ana' }, { family: 'D’Ávila', given: 'Bruno' }],
    authorCount: 2,
    journal: 'Ciência & Saúde',
  });
  const r = gerar({ reserva: catalogo([bruto]) });
  const item = lerIndex(r).items[0];
  assert.equal(item.n, searchNorm({ title: bruto.title, authors: bruto.authors, journal: bruto.journal, doi: bruto.doi, pmid: bruto.pmid }));
  assert.match(item.n, /muller/);
});

test('rótulos de tipo do filtro e dos selos são iguais aos de library-cite.js', () => {
  const r = gerar({ reserva: catalogo([artigo({ type: 'meta_analise' })]) });
  const html = lerHtml(r);
  for (const [chave, rotulo] of Object.entries(citacao.LABELS.type)) {
    assert.ok(html.includes(`<option value="${chave}">${rotulo}</option>`), `opção ${chave}`);
  }
  assert.ok(html.includes('<span class="bib-selo">Metanálise</span>'));
});

test('filtro de área lista os tópicos do catálogo', () => {
  const r = gerar({ reserva: catalogo([artigo()]) });
  const html = lerHtml(r);
  assert.ok(html.includes('<option value="toxicologia">Toxicologia</option>'));
  assert.ok(html.includes('<option value="farmacologia">Farmacologia</option>'));
});

test('validarItem devolve o item normalizado ou o motivo do erro', () => {
  const ok = gerador.validarItem(artigo());
  assert.equal(ok.erro, null);
  assert.equal(ok.item.id, 'a1');
  assert.equal(ok.item.year, 2021);
  assert.equal(ok.item.url, 'https://doi.org/10.1000/xyz');
  const ruim = gerador.validarItem(artigo({ landingUrl: 'http://doi.org/x' }));
  assert.ok(ruim.erro);
  assert.equal(ruim.item, null);
});

test('copia biblioteca/catalogo.js para dist/biblioteca/', () => {
  const r = gerar({ reserva: catalogo([artigo()]) });
  assert.equal(fs.readFileSync(path.join(r.outDir, 'biblioteca', 'catalogo.js'), 'utf8'), '// catalogo de teste\n');
});

test('o mesmo catálogo vindo ao vivo da API dá os mesmos itens e áreas do index.json (a tela não é refeita)', () => {
  const bruto = catalogo([artigo(), artigo({ id: 'a2', landingUrl: 'https://pubmed.ncbi.nlm.nih.gov/9/', authors: [] })]);
  const indice = lerIndex(gerar({ reserva: bruto }));
  const vivo = require('../biblioteca/catalogo.js').lerCatalogoAoVivo({ success: true, ...bruto });
  assert.deepEqual(vivo.items, indice.items);
  assert.deepEqual(vivo.topics, indice.topics);
});

test('pasta de conteúdo ausente não derruba o build', () => {
  const base = tmp('ausente');
  const outDir = path.join(base, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const r = gerador.build({ outDir, srcDir: path.join(base, 'nao-existe') });
  assert.equal(r.gerada, true);
  assert.equal(r.indexavel, false);
  assert.equal(r.itens, 0);
  assert.ok(r.avisos.length > 0);
});
