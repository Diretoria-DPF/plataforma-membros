/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Motor do Laboratório (O3): carrega no navegador sem empacotador (ordem de <script>), sem DOM nem eval,
// e cabe no orçamento de peso próprio do motor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../modulos/laboratorio/js');
const SEED_JS = path.join(JS, '../data/lab-seed.js');
const DATA = path.join(JS, '../data/processos');

// Ordem de carregamento no navegador (o lab-quimica.js já existe na página).
const ORDEM = [
  'lab-quimica.js', 'lab-motor-estado.js', 'lab-motor-fisica.js', 'lab-motor-relogio.js', 'lab-motor-calculos.js',
  'lab-motor-especies.js', 'lab-motor-especies-farmaco.js', 'lab-motor-op-base.js', 'lab-motor-op-separacao.js', 'lab-motor-op-cq.js',
  'lab-farma-calculos.js', 'lab-cq.js', 'lab-motor-op-farma.js', 'lab-motor-operacoes.js', 'lab-motor-condicoes.js', 'lab-motor-caderno.js', 'lab-motor-processo.js', 'lab-motor-validador.js'
];
const MOTOR = ORDEM.filter((f) => f.startsWith('lab-motor-'));
// O3: o motor-base mede 120 KB; as peças de farmacotécnica/CQ da O5 têm orçamento próprio em lab-farmacotecnica.test.mjs.
const O5 = ['lab-motor-especies-farmaco.js', 'lab-farma-calculos.js', 'lab-cq.js', 'lab-motor-op-farma.js'];
const RUNTIME = MOTOR.filter((f) => !['lab-motor-validador.js', 'lab-motor-especies.js'].concat(O5).includes(f));
const TETO_RUNTIME_BYTES = 120 * 1024;
const TETO_RUNTIME_GZIP = 40 * 1024;

test('navegador: os módulos carregam como <script> comuns (globais em window) e rodam o processo de exemplo', () => {
  const caixa = vm.createContext({ console });
  caixa.window = caixa;
  const janela = caixa;
  vm.runInContext(fs.readFileSync(SEED_JS, 'utf8'), caixa, { filename: 'lab-seed.js' });
  for (const f of ORDEM) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), caixa, { filename: f });
  for (const g of ['LabMotorEstado', 'LabMotorFisica', 'LabMotorRelogio', 'LabMotorOperacoes', 'LabMotorProcesso', 'LabMotorCaderno', 'LabMotorValidador']) {
    assert.ok(janela[g], `window.${g} ausente`);
  }
  assert.ok(janela.LabMotorEspecies.versaoSeed, 'espécies montadas a partir do seed da O2 já carregado na página');
  assert.equal(janela.LabMotorEspecies.ESPECIES.NaCl_s.nome, 'Cloreto de Sódio');
  const proc = JSON.parse(fs.readFileSync(path.join(DATA, 'proc_nacl_09_v1.json'), 'utf8'));
  const ctx = { especies: janela.LabMotorEspecies.ESPECIES };
  assert.equal(janela.LabMotorValidador.validarProcesso(proc, ctx).ok, true);
  const { sessao } = janela.LabMotorProcesso.rodarProcesso(proc, ctx, { semente: 9, respostas: { e2: '0,9', e7: '308' } });
  assert.equal(sessao.terminado, true);
  assert.equal(janela.LabMotorProcesso.relatorio(sessao, proc, ctx).conforme, true);
});

test('navegador: o motor não toca o DOM nem usa eval/Function/innerHTML (CSP sem inline)', () => {
  for (const f of MOTOR) {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    assert.ok(!/\bdocument\.|innerHTML|\beval\s*\(|new Function|setInterval|localStorage/.test(src), f);
    if (f !== 'lab-motor-relogio.js') assert.ok(!/requestAnimationFrame|addEventListener/.test(src), f);
    assert.match(src, /© 2026 Daniel Pires Francisco/, `${f} sem cabeçalho de licença`);
  }
});

test('orçamento: motor em tempo de execução ≤ 120 KB sem compressão e ≤ 40 KB com gzip', () => {
  let bruto = 0;
  let gz = 0;
  for (const f of RUNTIME) {
    const b = fs.readFileSync(path.join(JS, f));
    bruto += b.length;
    gz += zlib.gzipSync(b).length;
  }
  assert.ok(bruto <= TETO_RUNTIME_BYTES, `motor com ${(bruto / 1024).toFixed(1)} KB; teto ${TETO_RUNTIME_BYTES / 1024} KB`);
  assert.ok(gz <= TETO_RUNTIME_GZIP, `motor com ${(gz / 1024).toFixed(1)} KB gzip; teto ${TETO_RUNTIME_GZIP / 1024} KB`);
});

test('processos: cada JSON de exemplo cabe em 32 KB', () => {
  for (const f of fs.readdirSync(DATA).filter((x) => x.endsWith('.json'))) {
    assert.ok(fs.statSync(path.join(DATA, f)).size <= 32 * 1024, f);
  }
});
