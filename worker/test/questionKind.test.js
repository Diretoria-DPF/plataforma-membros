/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * questionKind.test.js — guarda de intenção da Lia híbrida (assistant/questionKind.js) medida no golden set
 * (test/fixtures/lia-golden.json): o classificador acerta o tipo de TODAS as perguntas, e a guarda só deixa
 * responder por regra, numa pergunta de definição, as intenções marcadas `defines`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { questionKind, allowIntent, KINDS, CLINICAL_REPLY } from '../src/assistant/questionKind.js';
import { INTENTS, matchIntent } from '../src/assistant/kb.js';
import { getTree, byId } from '../src/assistant/tree.js';

const GOLDEN = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'lia-golden.json'), 'utf8'));
const treeIds = byId(getTree());

describe('golden set da Lia (lia-golden.json) — formato', () => {
  test('entre 70 e 100 perguntas, cada tipo bem representado, sem repetição', () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(70);
    expect(GOLDEN.length).toBeLessThanOrEqual(100);
    expect(new Set(GOLDEN.map((g) => g.pergunta)).size).toBe(GOLDEN.length);
    KINDS.forEach((kind) => expect(GOLDEN.filter((g) => g.tipo === kind).length).toBeGreaterThanOrEqual(8));
  });

  test('todo registro tem os campos esperados e todo id de seção existe na árvore', () => {
    GOLDEN.forEach((g) => {
      expect(typeof g.pergunta).toBe('string');
      expect(KINDS).toContain(g.tipo);
      expect(Array.isArray(g.secoes)).toBe(true);
      expect(typeof g.deve_responder).toBe('boolean');
      expect(['ambos', 'visitante', 'membro']).toContain(g.perfil);
      g.secoes.forEach((id) => expect(treeIds.has(id)).toBe(true));
      if (g.deve_responder) expect(g.secoes.length > 0 || !!g.intencao).toBe(true);
    });
  });

  test('tem casos específicos de visitante (sem login)', () => {
    expect(GOLDEN.filter((g) => g.perfil === 'visitante').length).toBeGreaterThanOrEqual(5);
  });

  test('inclui todas as falhas medidas ao vivo em produção', () => {
    const asked = new Set(GOLDEN.map((g) => g.pergunta));
    [
      'O que é a LAIFT?',
      'Quais áreas a liga estuda?',
      'O que é a Biblioteca LAIFT?',
      'Qual a diferença entre farmacologia e toxicologia?',
      'O que é farmacocinética?',
      'Quanto custa participar da liga?',
      'Posso confiar na Lia para dúvidas clínicas?',
    ].forEach((q) => expect(asked.has(q)).toBe(true));
  });
});

describe('questionKind — o golden set inteiro', () => {
  test.each(GOLDEN.map((g) => [g.tipo, g.pergunta]))('%s: %s', (tipo, pergunta) => {
    expect(questionKind(pergunta)).toBe(tipo);
  });

  test('ignora caixa, acento e pontuação', () => {
    expect(questionKind('O QUE É A LAIFT???')).toBe('definicao');
    expect(questionKind('o que e a laift')).toBe('definicao');
    expect(questionKind('ESQUECI A SENHA!!')).toBe('como-fazer');
    expect(questionKind('qual a DOSE de paracetamol?')).toBe('clinico');
  });

  test('entrada que não é texto, vazia ou sem sinal vira fora-de-escopo (nunca lança)', () => {
    [undefined, null, 42, {}, [], '', '   ', 'oi', 'bom dia'].forEach((v) => expect(questionKind(v)).toBe('fora-de-escopo'));
  });

  test('clínico vence sobre qualquer outro sinal', () => {
    expect(questionKind('Como faço para saber a dose de dipirona?')).toBe('clinico');
    expect(questionKind('O que é posologia?')).toBe('clinico');
  });

  test('pergunta educacional sobre o conteúdo não é clínica', () => {
    expect(questionKind('O que é dose letal?')).toBe('definicao');
    expect(questionKind('Quais são os sintomas do câncer de mama?')).toBe('definicao');
  });
});

describe('guarda de intenção sobre o golden set', () => {
  const role = 'member';

  test('definição: só responde por regra a intenção marcada `defines`; a de passo a passo é barrada', () => {
    GOLDEN.filter((g) => g.tipo === 'definicao').forEach((g) => {
      const hit = matchIntent(g.pergunta, [], role);
      if (g.intencao) {
        expect(hit && hit.id).toBe(g.intencao);
        expect(allowIntent('definicao', hit)).toBe(true);
      } else if (hit) {
        expect(hit.id).toBe(g.intencao_bloqueada);
        expect(allowIntent('definicao', hit)).toBe(false);
      } else {
        expect(g.intencao_bloqueada).toBeNull();
      }
    });
  });

  test('como fazer: o comportamento atual é mantido (a intenção esperada responde)', () => {
    GOLDEN.filter((g) => g.tipo === 'como-fazer').forEach((g) => {
      const hit = matchIntent(g.pergunta, [], role);
      expect(hit && hit.id).toBe(g.intencao);
      expect(allowIntent('como-fazer', hit)).toBe(true);
    });
  });

  test('fora de escopo e clínico não mudam a regra de intenção (clínico é tratado antes, em chat())', () => {
    const hit = matchIntent('como funciona o laboratório?', [], role);
    expect(allowIntent('fora-de-escopo', hit)).toBe(true);
    expect(allowIntent('definicao', null)).toBe(false);
  });

  test('`defines` só nas intenções que de fato definem ou listam (eventos ao vivo incluído)', () => {
    expect(INTENTS.filter((i) => i.defines === true).map((i) => i.id).sort()).toEqual(
      ['ajuda', 'aprender', 'cotas', 'eventos', 'papeis', 'privacidade']
    );
  });
});

describe('resposta segura para pergunta clínica', () => {
  test('não dá dose nem conduta, remete a profissional e à emergência, e cita a seção de saúde', () => {
    expect(CLINICAL_REPLY.reply).toMatch(/profissional de saúde/);
    expect(CLINICAL_REPLY.reply).toMatch(/emergência/);
    expect(CLINICAL_REPLY.reply).toMatch(/Fonte: seção A Lia pode errar em temas clínicos/);
    expect(CLINICAL_REPLY.reply).not.toMatch(/\d+\s?(mg|ml|comprimidos?)/i);
    expect(CLINICAL_REPLY.sources).toEqual([{ source: 'saude', section: 'A Lia pode errar em temas clínicos' }]);
  });
});
