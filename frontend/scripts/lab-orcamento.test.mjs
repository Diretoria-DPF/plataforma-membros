/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// O2 (Laboratório v2): orçamento de peso PRÓPRIO do Laboratório. O módulo carrega sob demanda e não entra
// nas contas do shell (perf-budget.test.mjs); por isso o seed e os scripts dele têm tetos aqui.
// Se um teto estourar: primeiro corte dado (o seed é gerado; tools/lab/gerar-seed.mjs); só suba o teto com
// justificativa na PR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = path.join(frontend, 'modulos', 'laboratorio');

const ORCAMENTO = {
  seedBytes: 700 * 1024, // plano do Laboratório v2, seção 4: seed < 700 KB
  dadosBytes: 700 * 1024, // data/*.js somados (seed + bases antigas enquanto coexistirem)
  // js/*.js do módulo (sem vendor). Subiu de 450 para 465 KB na O8 (desempenho por competência e falas da Guia e do
  // Preceptor: ~13 KB em 3 arquivos). JUSTIFICATIVA: esses arquivos só são baixados ao abrir a trilha (lista
  // ARQUIVOS_TUTOR do carregador) e nenhum entra no index.html; o que pesa para a pessoa é a CARGA INICIAL, que
  // tem teto próprio logo abaixo e NÃO subiu. Próxima onda que precisar de mais: cortar código antes de subir.
  scriptsBytes: 465 * 1024,
  cargaInicialBytes: 210 * 1024, // só os <script src="js/..."> do index.html da bancada (hoje ~201 KB)
};

const tamanho = (rel) => fs.statSync(path.join(lab, rel)).size;
const soma = (dir, ext) => fs.readdirSync(path.join(lab, dir)).filter((f) => f.endsWith(ext)).reduce((n, f) => n + tamanho(path.join(dir, f)), 0);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

test('orçamento do Laboratório: o seed único cabe em 700 KB', () => {
  const n = tamanho('data/lab-seed.js');
  assert.ok(n <= ORCAMENTO.seedBytes, `seed com ${kb(n)}; teto ${kb(ORCAMENTO.seedBytes)}`);
});

test('orçamento do Laboratório: dados (seed + bases antigas) cabem em 700 KB', () => {
  const n = soma('data', '.js');
  assert.ok(n <= ORCAMENTO.dadosBytes, `data/ com ${kb(n)}; teto ${kb(ORCAMENTO.dadosBytes)}`);
});

test('orçamento do Laboratório: scripts do módulo cabem em 465 KB', () => {
  const n = soma('js', '.js');
  assert.ok(n <= ORCAMENTO.scriptsBytes, `js/ com ${kb(n)}; teto ${kb(ORCAMENTO.scriptsBytes)}`);
});

test('orçamento do Laboratório: a carga inicial (scripts do index.html) não passa de 210 KB e o código sob demanda fica fora dela', () => {
  const html = fs.readFileSync(path.join(lab, 'index.html'), 'utf8');
  const iniciais = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
  const n = iniciais.reduce((soma, f) => soma + tamanho(f), 0);
  assert.ok(n <= ORCAMENTO.cargaInicialBytes, `carga inicial com ${kb(n)}; teto ${kb(ORCAMENTO.cargaInicialBytes)}`);
  for (const sob of ['lab-boletim', 'lab-boletim-ui', 'lab-contexto', 'lab-tutor', 'lab-trilha', 'lab-tutor-ui']) {
    assert.ok(!iniciais.includes(`js/${sob}.js`), `${sob}.js deve carregar sob demanda`);
  }
});

test('o seed é medido também comprimido (informativo) e fica muito abaixo do teto bruto', () => {
  const gz = zlib.gzipSync(fs.readFileSync(path.join(lab, 'data/lab-seed.js')), { level: 9 }).length;
  assert.ok(gz < ORCAMENTO.seedBytes / 4, `seed gzip ${kb(gz)}`);
});

test('o seed não vai para o shell: nem o index.html da plataforma nem o precache do service worker o citam', () => {
  const index = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(frontend, 'sw.js'), 'utf8');
  assert.doesNotMatch(index, /lab-seed/);
  assert.doesNotMatch(sw, /lab-seed/);
});

test('a bancada carrega o seed antes do leitor, e o leitor antes do script principal', () => {
  const html = fs.readFileSync(path.join(lab, 'index.html'), 'utf8');
  const ordem = ['data/lab-database.js', 'data/lab-seed.js', 'js/lab-seed-leitor.js', 'js/script.js'].map((s) => html.indexOf(`<script src="${s}"`));
  assert.ok(ordem.every((i) => i > 0), `scripts presentes: ${ordem}`);
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, 'ordem de carga');
});
