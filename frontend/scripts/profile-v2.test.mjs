/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Perfil v2 (profile-v2.js, profile-v2.css; flag profile_v2_enabled): funções puras, fiação (pacote sob demanda, flag
// desligada por padrão, Perfil de sempre intacto) e regras do código e do CSS (sem innerHTML, sem estilo inline, tudo
// sob a flag, movimento reduzido, alvos de 44 px).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertSobDemanda } from './lazy-wiring.mjs';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');
const p2 = require('../profile-v2.js');
const SRC = ler('profile-v2.js');
const CSS = ler('profile-v2.css');
const APP = ler('app.js');
const HTML = ler('index.html');

test('initialOf: inicial maiúscula ou vazio', () => {
  assert.equal(p2.initialOf('  marina alves'), 'M');
  assert.equal(p2.initialOf(''), '');
  assert.equal(p2.initialOf(null), '');
});

test('handleText: @usuario ou vazio', () => {
  assert.equal(p2.handleText('marina.a'), '@marina.a');
  assert.equal(p2.handleText('  '), '');
});

test('heroName: nome salvo ou "Meu perfil" enquanto carrega', () => {
  assert.equal(p2.heroName(' Ana Teste '), 'Ana Teste');
  assert.equal(p2.heroName(''), 'Meu perfil');
});

test('bodyId e expandedValue', () => {
  assert.equal(p2.bodyId('mfa'), 'p2-body-mfa');
  assert.equal(p2.expandedValue(true), 'true');
  assert.equal(p2.expandedValue(false), 'false');
});

test('seções: chaves únicas, todos os ids existem no index.html e só Dados e Preferências abrem', () => {
  const keys = p2.SECTIONS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const s of p2.SECTIONS) assert.ok(HTML.includes(`id="${s.childId}"`), `${s.childId} deve existir no Perfil de sempre`);
  assert.deepEqual(p2.SECTIONS.filter((s) => s.open).map((s) => s.key), ['dados', 'preferencias']);
});

test('mount sem o painel não faz nada', () => {
  const doc = { getElementById: () => null };
  assert.equal(p2.mount(null, doc), null);
  assert.doesNotThrow(() => p2.reset());
});

test('o script não recria nem troca ids do Perfil: sem innerHTML, sem estilo inline, só DOM seguro', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(SRC));
  assert.ok(!/\.style\.|setAttribute\('style'/.test(SRC));
  assert.ok(!/\.id\s*=\s*'(profile-|form-|btn-profile|mfa-|privacy-|pref-)/.test(SRC), 'nenhum id de sempre é reatribuído');
  assert.ok(SRC.includes('createElementNS'));
  assert.ok(SRC.includes('aria-expanded'));
});

test('textos: a Guia, sem diminutivos nem "grátis"', () => {
  for (const texto of [SRC, CSS, ler('../docs/perfil-v2.md')]) assert.ok(!/gr[áa]tis/i.test(texto));
});

test('CSS: toda regra sob a flag, movimento reduzido e foco visível', () => {
  const semComentario = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const seletores = semComentario.replace(/@media[^{]*\{/g, '').replace(/@keyframes[^{]*\{[\s\S]*?\}\s*\}/g, '').split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
  for (const seletor of seletores) {
    for (const parte of seletor.split(',')) assert.ok(parte.trim().startsWith(':root[data-flag-profile-v2-enabled]'), `fora da flag: ${parte.trim()}`);
  }
  assert.ok(CSS.includes('prefers-reduced-motion: reduce'));
  assert.ok(CSS.includes('focus-visible'));
  assert.ok(/min-height: 56px/.test(CSS) && /min-height: 44px/.test(CSS));
  assert.ok(!/font-size:\s*(1[01]|[0-9])px/.test(CSS), 'fontes de pelo menos 12 px');
});

test('fiação: pacote sob demanda, flag no app.js e Perfil de sempre sem a flag', () => {
  assertSobDemanda('perfil2', 'profile-v2.js');
  assert.ok(ler('scripts/build.js').includes("'profile-v2.css'"));
  assert.ok(APP.includes("data-flag-profile-v2-enabled"));
  assert.ok(APP.includes("withBundle('perfil2'"));
  assert.ok(/if \(profileV2On\(\)\) mountProfileV2\(\);\s*else if \(window\.LaiftProfileV2\) window\.LaiftProfileV2\.reset/.test(APP));
  assert.ok(!HTML.includes('profile-v2'), 'o index.html não carrega nada do Perfil v2');
});
