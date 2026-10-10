/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Testes da camada de progresso (modulos/shared/laift-progress.js; docs/ux-progresso/CONTRATO.md §2).
// Só a parte pura e o armazenamento: sem navegador. A tela é conferida pelo verificador do Lote A.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQUIVO = path.join(frontend, 'modulos', 'shared', 'laift-progress.js');
const LP = require(ARQUIVO);

/** Armazenamento em memória com a mesma interface do adaptador local. */
function memoria(inicial = null) {
  const caixa = { texto: inicial, gravacoes: 0 };
  return {
    caixa,
    adaptador: {
      ler: () => caixa.texto,
      gravar: (texto) => { caixa.texto = texto; caixa.gravacoes += 1; return true; },
    },
  };
}

test('constantes do contrato: chave versionada, marcos e frases exatas', () => {
  assert.equal(LP.VERSAO, 1);
  assert.equal(LP.CHAVE, 'laift_progresso_v1');
  assert.deepEqual([...LP.MARCOS], [25, 50, 75, 100]);
  assert.equal(LP.FRASE_INICIAL, 'Boa leitura', 'texto da barra vazia, antes do primeiro marco');
  assert.equal('MARCO_INICIAL' in LP, false, 'não há etapa concluída ao abrir');
  assert.deepEqual({ ...LP.FRASES }, { 25: 'Bom começo', 50: 'Metade do caminho', 75: 'Falta pouco', 100: 'Leitura concluída' });
  assert.deepEqual({ ...LP.ICONES }, { 25: '', 50: 'meta', 75: 'meta', 100: 'estrela' });
  assert.ok(Object.isFrozen(LP.MARCOS) && Object.isFrozen(LP.FRASES) && Object.isFrozen(LP.ICONES));
});

test('idValido: "tipo:slug" em minúsculas, até 100 caracteres', () => {
  assert.equal(LP.idValido('blog:outubro-rosa-2026'), true);
  assert.equal(LP.idValido('modulo:farmaco-1'), true);
  for (const ruim of ['', 'blog', 'blog:', 'Blog:x', 'blog:x y', 'blog:x--y', 'blog:-x', `blog:${'a'.repeat(100)}`, null, 42]) {
    assert.equal(LP.idValido(ruim), false, `deveria recusar ${JSON.stringify(ruim)}`);
  }
});

test('normalizar: só marcos conhecidos, sem repetição, em ordem; data só AAAA-MM-DD com 100', () => {
  assert.deepEqual(LP.normalizar(null, 'blog:a'), { id: 'blog:a', marcos: [], concluidoEm: null });
  assert.deepEqual(LP.normalizar({ marcos: [75, 25, 25, 33, '50', 100], concluidoEm: '2026-10-09' }, 'blog:a'),
    { id: 'blog:a', marcos: [25, 75, 100], concluidoEm: '2026-10-09' });
  assert.deepEqual(LP.normalizar({ marcos: [25, 50], concluidoEm: '2026-10-09' }, 'blog:a'),
    { id: 'blog:a', marcos: [25, 50], concluidoEm: null }, 'sem o marco 100 não há data de conclusão');
  assert.deepEqual(LP.normalizar({ marcos: [100], concluidoEm: '09/10/2026' }, 'blog:a'),
    { id: 'blog:a', marcos: [100], concluidoEm: null }, 'data fora do formato é descartada');
});

test('comMarcos devolve um registro NOVO e marca a data só na primeira conclusão', () => {
  const r0 = Object.freeze({ id: 'blog:a', marcos: Object.freeze([25]), concluidoEm: null });
  const r1 = LP.comMarcos(r0, [50, 75], '2026-10-09');
  assert.notEqual(r1, r0);
  assert.deepEqual(r0.marcos, [25], 'o original não muda');
  assert.deepEqual(r1, { id: 'blog:a', marcos: [25, 50, 75], concluidoEm: null });
  const r2 = LP.comMarcos(r1, [100], '2026-10-09');
  assert.deepEqual(r2, { id: 'blog:a', marcos: [25, 50, 75, 100], concluidoEm: '2026-10-09' });
  assert.equal(LP.comMarcos(r2, [100], '2026-12-31').concluidoEm, '2026-10-09', 'a data da primeira conclusão fica');
});

test('cobrir: a leitura só avança se a tela encosta no trecho já lido (guarda contra salto)', () => {
  assert.equal(LP.cobrir(0, -200, 600, 3000), 600, 'começo do artigo na tela: conta até a base da tela');
  assert.equal(LP.cobrir(600, 500, 1300, 3000), 1300, 'rolagem contínua avança');
  assert.equal(LP.cobrir(1300, 2200, 3000, 3000), 1300, 'salto (End, âncora, rolagem restaurada) não conta');
  assert.equal(LP.cobrir(1300, 100, 900, 3000), 1300, 'voltar para cima não reduz');
  assert.equal(LP.cobrir(2900, 2800, 3600, 3000), 3000, 'nunca passa da altura do artigo');
  assert.equal(LP.cobrir(500, 0, 800, 0), 500, 'artigo sem altura: nada muda');
});

test('percentual: começa em 0 (só conta depois de ler), vai a 100 só no fim do artigo', () => {
  assert.equal(LP.percentual(0, 3000), 0);
  assert.equal(LP.percentual(749, 3000), 24, 'antes do trecho de 25% não há marco');
  assert.equal(LP.percentual(750, 3000), 25);
  assert.equal(LP.percentual(1500, 3000), 50);
  assert.equal(LP.percentual(2250, 3000), 75);
  assert.equal(LP.percentual(2990, 3000), 99, 'perto do fim ainda não é 100');
  assert.equal(LP.percentual(2998, 3000), 100, 'folga de 2 px no fim');
  assert.equal(LP.percentual(3000, 3000), 100);
  assert.equal(LP.percentual(0, 0), 0, 'sem altura: nada lido');
});

test('percentual com inicio: o que já aparece ao abrir não conta como lido (barra em 0%)', () => {
  assert.equal(LP.percentual(600, 3000, 600), 0, 'ao abrir, 0% mesmo com 600 px na tela');
  assert.equal(LP.percentual(1200, 3000, 600), 25);
  assert.equal(LP.percentual(1800, 3000, 600), 50);
  assert.equal(LP.percentual(2400, 3000, 600), 75);
  assert.equal(LP.percentual(3000, 3000, 600), 100);
  assert.equal(LP.percentual(1000, 1000, 1000), 100, 'artigo inteiro na tela: a primeira rolagem conclui');
});

test('marcosDe e coberturaInicial são inversas nos marcos', () => {
  assert.deepEqual(LP.marcosDe(0), []);
  assert.deepEqual(LP.marcosDe(24), []);
  assert.deepEqual(LP.marcosDe(25), [25]);
  assert.deepEqual(LP.marcosDe(74), [25, 50]);
  assert.deepEqual(LP.marcosDe(100), [25, 50, 75, 100]);
  assert.equal(LP.coberturaInicial([], 3000), 0);
  assert.equal(LP.coberturaInicial([25], 3000), 750);
  assert.equal(LP.coberturaInicial([25, 50], 3000), 1500);
  assert.equal(LP.coberturaInicial([25, 50, 75], 3000), 2250);
  assert.equal(LP.coberturaInicial([25, 50, 75, 100], 3000), 3000);
  assert.equal(LP.coberturaInicial([], 3000, 600), 600);
  assert.equal(LP.coberturaInicial([25], 3000, 600), 1200);
  assert.equal(LP.coberturaInicial([25, 50, 75, 100], 3000, 600), 3000);
  for (const ini of [0, 600]) {
    assert.equal(LP.percentual(LP.coberturaInicial([], 3000, ini), 3000, ini), 0);
    for (const m of [25, 50, 75, 100]) assert.equal(LP.percentual(LP.coberturaInicial(LP.marcosDe(m), 3000, ini), 3000, ini), m);
  }
});

test('dataLocal formata AAAA-MM-DD no fuso do aparelho', () => {
  assert.equal(LP.dataLocal(new Date(2026, 9, 9, 23, 59)), '2026-10-09');
  assert.equal(LP.dataLocal(new Date(2027, 0, 2)), '2027-01-02');
});

test('ler/gravar/marcos/marcar com o armazenamento trocado (interface estável para a conta)', () => {
  const m = memoria();
  assert.equal(LP.usarArmazenamento(m.adaptador), true);
  assert.deepEqual(LP.ler('blog:a'), { id: 'blog:a', marcos: [], concluidoEm: null });
  const r = LP.marcar('blog:a', [25, 50], '2026-10-09');
  assert.deepEqual(r, { id: 'blog:a', marcos: [25, 50], concluidoEm: null });
  assert.deepEqual(LP.marcos('blog:a'), [25, 50]);
  const salvo = JSON.parse(m.caixa.texto);
  assert.equal(salvo.v, 1);
  assert.deepEqual(salvo.itens['blog:a'], { id: 'blog:a', marcos: [25, 50], concluidoEm: null });
  assert.equal(LP.gravar({ id: 'nao vale', marcos: [25] }), false, 'id inválido não grava');
  const copia = LP.marcos('blog:a');
  copia.push(100);
  assert.deepEqual(LP.marcos('blog:a'), [25, 50], 'marcos() devolve cópia');
});

test('registro inválido, JSON quebrado ou versão diferente começam do zero, sem erro', () => {
  for (const texto of ['{quebrado', JSON.stringify({ v: 2, itens: { 'blog:a': { marcos: [25] } } }), JSON.stringify([1, 2])]) {
    const m = memoria(texto);
    LP.usarArmazenamento(m.adaptador);
    assert.deepEqual(LP.ler('blog:a'), { id: 'blog:a', marcos: [], concluidoEm: null });
  }
});

test('no máximo 200 registros: o mais antigo sai primeiro', () => {
  const m = memoria();
  LP.usarArmazenamento(m.adaptador);
  for (let i = 0; i < 201; i += 1) LP.marcar(`blog:p${i}`, [25], '2026-10-09');
  const itens = JSON.parse(m.caixa.texto).itens;
  assert.equal(Object.keys(itens).length, 200);
  assert.ok(!('blog:p0' in itens) && 'blog:p200' in itens);
});

test('armazenamento que lança erro (modo privado) não quebra: lê vazio e gravar devolve false', () => {
  LP.usarArmazenamento({ ler: () => { throw new Error('bloqueado'); }, gravar: () => { throw new Error('bloqueado'); } });
  assert.deepEqual(LP.ler('blog:a'), { id: 'blog:a', marcos: [], concluidoEm: null });
  assert.equal(LP.gravar({ id: 'blog:a', marcos: [25], concluidoEm: null }), false);
  assert.equal(LP.usarArmazenamento({}), false, 'adaptador sem ler/gravar é recusado');
});

test('fonte: cabeçalho de copyright, script clássico, CSP (sem innerHTML/estilo inline) e try/catch no localStorage', () => {
  const fonte = fs.readFileSync(ARQUIVO, 'utf8');
  assert.ok(fonte.startsWith('/*\n * Plataforma de Membros LAIFT\n'), 'falta o cabeçalho de copyright');
  assert.ok(!/\bimport\s|\bexport\s/.test(fonte), 'tem de ser script clássico (os módulos de estudo não usam ES modules)');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.style\.(?!setProperty)|setAttribute\(\s*['"]style/.test(fonte), 'CSP: nada de HTML em texto nem estilo inline');
  assert.ok(/createElementNS\(/.test(fonte) && /textContent/.test(fonte), 'monta o DOM com createElement(NS)/textContent');
  assert.ok(/try\s*\{[^}]*localStorage/.test(fonte), 'localStorage só dentro de try/catch');
  assert.ok(/role['"]?,\s*['"]status/.test(fonte) && /aria-live['"]?,\s*['"]polite/.test(fonte), 'aviso com role="status" e aria-live="polite"');
  assert.ok(!/em revisão|planejad|proposta|pendente/i.test(fonte), 'texto proibido na interface');
});
