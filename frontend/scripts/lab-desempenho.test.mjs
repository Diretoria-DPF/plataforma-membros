/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Desempenho do Laboratório em rede lenta (Fast 3G, CPU 4x): a página pinta antes dos scripts, as bibliotecas pesadas
// saem do caminho crítico e a barra inferior responde enquanto o script principal ainda baixa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const lab = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'modulos', 'laboratorio');
const html = fs.readFileSync(path.join(lab, 'index.html'), 'utf8');
const semComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
const scripts = [...semComentarios.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);

test('só o script de identidade é síncrono (tema e redirecionamento antes da pintura); todos os outros têm defer', () => {
  const sincronos = scripts.filter((t) => !/\bdefer\b/.test(t));
  assert.equal(sincronos.length, 1, `scripts síncronos: ${sincronos.join(' | ')}`);
  assert.match(sincronos[0], /laift-identity\.js/);
});

test('os estilos vêm antes do script síncrono (o navegador busca tudo em paralelo)', () => {
  assert.ok(semComentarios.lastIndexOf('<link rel="stylesheet"') < semComentarios.indexOf('laift-identity.js'));
});

test('SmilesDrawer e 3Dmol não estão no HTML: carregam sob demanda', () => {
  assert.doesNotMatch(semComentarios, /smiles-drawer|3Dmol/i);
  const principal = fs.readFileSync(path.join(lab, 'js/script.js'), 'utf8');
  assert.match(principal, /function carregarVendor\(/);
  assert.match(principal, /s\.integrity = VENDOR\[nome\]\.sri/);
});

test('o lab-boot.js é o primeiro script deferido e o esqueleto do catálogo e da faixa estão no HTML', () => {
  const deferidos = scripts.filter((t) => /\bdefer\b/.test(t));
  assert.match(deferidos[0], /js\/lab-boot\.js/);
  assert.match(html, /id="catalogEsqueleto"/);
  assert.match(html, /id="faixaBoot"/);
  assert.match(html, /id="catalogContainer"[^>]*aria-busy="true"/);
});

function bootComDocumento() {
  const ouvintes = [];
  const grade = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const mkBotao = (alvo) => ({ alvo, ativo: false, classList: { toggle(c, on) { this.dono.ativo = on; }, dono: null }, getAttribute: () => alvo });
  const botoes = ['bancada', 'reagentes', 'analise'].map(mkBotao);
  botoes.forEach((b) => { b.classList.dono = b; });
  const documento = {
    addEventListener: (t, f) => ouvintes.push(f),
    removeEventListener: (t, f) => ouvintes.splice(ouvintes.indexOf(f), 1),
    getElementById: (id) => (id === 'mainGrid' ? grade : null),
    querySelectorAll: () => botoes
  };
  const janela = { document: documento };
  vm.runInNewContext(fs.readFileSync(path.join(lab, 'js/lab-boot.js'), 'utf8'), { window: janela, document: documento });
  const tocar = (b) => ouvintes.slice().forEach((f) => f({ target: { closest: () => b } }));
  return { janela, grade, botoes, ouvintes, tocar };
}

test('lab-boot: antes do script principal, a barra inferior troca de visão', () => {
  const { grade, botoes, tocar } = bootComDocumento();
  tocar(botoes[1]);
  assert.equal(grade.attrs['data-mobile-view'], 'reagentes');
  assert.deepEqual(botoes.map((b) => b.ativo), [false, true, false]);
});

test('lab-boot: depois que setMobileView existe, o ouvinte se remove e a delegação normal assume', () => {
  const { janela, grade, botoes, ouvintes, tocar } = bootComDocumento();
  janela.setMobileView = () => {};
  tocar(botoes[2]);
  assert.equal(grade.attrs['data-mobile-view'], undefined);
  assert.equal(ouvintes.length, 0);
});

test('lab-boot: toque fora da barra não faz nada', () => {
  const { grade, tocar } = bootComDocumento();
  tocar(null);
  assert.equal(grade.attrs['data-mobile-view'], undefined);
});
