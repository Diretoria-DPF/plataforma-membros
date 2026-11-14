/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Regra do dono: nenhum texto público do Atlas fala de revisão, rascunho, IA ou marcas internas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const novidades = path.join(frontend, 'modulos', 'anatomia-3d', 'data', 'atlas', 'novidades.json');
const PROIBIDO = /revis|selo|rascunho|\bIA\b|\bpor IA\b|\[NV\]|reverifica|⏳|✓|○/i;

test('novidades do Atlas não citam revisão, selos, rascunho nem IA', () => {
  const dados = JSON.parse(fs.readFileSync(novidades, 'utf8'));
  const textos = dados.itens.flatMap((item) => [item.titulo, ...item.notas]);
  const achados = textos.filter((t) => PROIBIDO.test(t));
  assert.deepEqual(achados, []);
});
