/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * liaTree.test.js — árvore de seções da Lia (assistant/tree.js): ids estáveis e únicos, resumo de uma
 * linha, resumo compacto para o prompt com teto de tamanho e consulta por id.
 */
import { buildTree, renderOutline, byId, byKey, bodyOf, nodeId, SUMMARY_MAX } from '../src/assistant/tree.js';
import { buildDocuments } from '../src/assistant/docs.js';
import { TREE } from '../src/constants.js';

const docs = buildDocuments();
const nodes = buildTree(docs);

describe('tree.js — nós', () => {
  test('um nó por documento, na mesma ordem, com source e section de origem', () => {
    expect(nodes).toHaveLength(docs.length);
    nodes.forEach((n, i) => {
      expect(n.source).toBe(docs[i].source);
      expect(n.section).toBe(docs[i].section);
    });
  });

  test('ids únicos, no formato source/slug, sem acento nem espaço', () => {
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/));
  });

  test('ids estáveis: a mesma entrada dá sempre os mesmos ids', () => {
    expect(buildTree(buildDocuments()).map((n) => n.id)).toEqual(nodes.map((n) => n.id));
    expect(nodeId('liga', 'O que é a LAIFT')).toBe('liga/o-que-e-a-laift');
  });

  test('colisão de slug ganha sufixo numérico e continua único', () => {
    const dup = buildTree([
      { source: 'a', section: 'Olá, mundo!', content: 'Olá, mundo!. Um.' },
      { source: 'a', section: 'Ola mundo', content: 'Ola mundo. Dois.' },
    ]);
    expect(dup.map((n) => n.id)).toEqual(['a/ola-mundo', 'a/ola-mundo-2']);
  });

  test('o resumo é a primeira frase do conteúdo, sem o prefixo "título — seção." e com até 120 caracteres', () => {
    nodes.forEach((n) => {
      expect(n.summary.length).toBeGreaterThan(0);
      expect(n.summary.length).toBeLessThanOrEqual(SUMMARY_MAX);
      expect(n.summary).not.toContain('\n');
    });
    const oQueE = byId(nodes).get('liga/o-que-e-a-laift');
    expect(oQueE.summary).toMatch(/^A LAIFT é uma liga acadêmica/);
    expect(oQueE.summary).not.toMatch(/^O que é a LAIFT/);
  });

  test('resumo de texto longo é cortado com reticências', () => {
    const [n] = buildTree([{ source: 's', section: 'Longa', content: 'Longa. ' + 'palavra '.repeat(60) + 'fim.' }]);
    expect(n.summary.length).toBeLessThanOrEqual(SUMMARY_MAX);
    expect(n.summary.endsWith('…')).toBe(true);
  });

  test('bodyOf tira o prefixo da seção e preserva o resto', () => {
    expect(bodyOf('Guia — Seção A. Texto um. Texto dois.', 'Seção A')).toBe('Texto um. Texto dois.');
    expect(bodyOf('Seção B: item', 'Seção B')).toBe('item');
    expect(bodyOf('Sem prefixo algum.', 'Outra')).toBe('Sem prefixo algum.');
  });

  test('nenhuma seção de administração entra na árvore (o acervo é o mesmo para todos os papéis)', () => {
    expect(nodes.some((n) => /^Administração/.test(n.section))).toBe(false);
    expect(nodes.some((n) => /administração\)/.test(n.section))).toBe(false);
  });
});

describe('tree.js — resumo compacto e consulta', () => {
  test('cada linha é "[id] source › section — resumo"', () => {
    const line = renderOutline([nodes[0]]);
    expect(line).toBe('[' + nodes[0].id + '] ' + nodes[0].source + ' › ' + nodes[0].section + ' — ' + nodes[0].summary);
  });

  test('respeita o teto de tamanho e nunca corta uma linha no meio', () => {
    const cap = 600;
    const out = renderOutline(nodes, cap);
    expect(out.length).toBeLessThanOrEqual(cap);
    out.split('\n').forEach((l) => expect(l).toMatch(/^\[[a-z0-9-]+\/[a-z0-9-]+\] /));
    expect(renderOutline(nodes).length).toBeLessThanOrEqual(TREE.OUTLINE_MAX_CHARS);
  });

  test('a árvore inteira, em versão curta (só ids), cabe no teto padrão: o teto não corta seção do acervo', () => {
    const brief = renderOutline(nodes, TREE.OUTLINE_MAX_CHARS, { brief: true });
    expect(brief.split('\n')).toHaveLength(nodes.length);
  });

  test('byId e byKey encontram o nó; id desconhecido ou de protótipo não acha nada', () => {
    const idx = byId(nodes);
    expect(idx.get(nodes[3].id)).toBe(nodes[3]);
    expect(idx.get('__proto__')).toBeUndefined();
    expect(idx.get('nao/existe')).toBeUndefined();
    expect(byKey(nodes).get(nodes[5].source + '|' + nodes[5].section)).toBe(nodes[5]);
  });
});
