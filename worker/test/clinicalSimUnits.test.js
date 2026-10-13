/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSimUnits.test.js — módulos PUROS de worker/src/clinicalSim (ADR 0009): PRNG, eixos (determinismo, golden,
 * distribuição, combinações incoerentes), catálogo, estado que evolui, perfil do caso, entrada, nota e simId.
 */
import { mulberry32, pickWeighted, toUint32 } from '../src/clinicalSim/prng.js';
import { AXIS_ORDER, AXIS_VALUES, DIFFICULTIES, drawAxes, isCoherent, isValidAxes, normalizeSimDifficulty } from '../src/clinicalSim/axes.js';
import { getCatalog, profilePromptLines, adaptationLines, describeAxes, severityPrompt, SEVERITIES, AXIS_LABELS } from '../src/clinicalSim/catalog.js';
import { createState, evolve, currentStage } from '../src/clinicalSim/state.js';
import { parseSimProfile } from '../src/clinicalSim/profile.js';
import { parseSimulationInput } from '../src/clinicalSim/input.js';
import { parseSimEvaluation, computeSimScore } from '../src/clinicalSim/scoring.js';
import { computeSimId } from '../src/clinicalSim/simId.js';
import { SIM_VERSION, SIM_LIMITS, SIM_SCORE_WEIGHTS } from '../src/constants.js';

describe('prng', () => {
  test('mesma semente = mesma sequência; sementes diferentes divergem; valores em [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    expect(seqA).toEqual(Array.from({ length: 20 }, () => b()));
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(Array.from({ length: 5 }, mulberry32(43))).not.toEqual(seqA.slice(0, 5));
  });

  test('sequência dourada da semente 1 (não pode mudar sem nova SIM_VERSION)', () => {
    const rng = mulberry32(1);
    expect([rng(), rng()].map((x) => Math.round(x * 1e6))).toEqual([627074, 2736]);
  });

  test('toUint32 só aceita inteiros', () => {
    expect(toUint32(-1)).toBe(4294967295);
    expect(toUint32(1.5)).toBe(0);
    expect(toUint32('7')).toBe(0);
  });

  test('pickWeighted consome sempre um número e exclui peso zero', () => {
    let calls = 0;
    const rng = () => { calls += 1; return 0.999; };
    expect(pickWeighted(rng, [['a', 0], ['b', 1]])).toBe('b');
    expect(pickWeighted(rng, [['a', 0]])).toBeNull();
    expect(calls).toBe(2);
  });
});

describe('eixos', () => {
  const GOLDEN = {
    basico: [
      [0, 'verboso', 'baixo', 'alto', 'lucido'], [1, 'agradavel', 'baixo', 'alto', 'lucido'], [2, 'agradavel', 'medio', 'alto', 'lucido'],
      [42, 'agradavel', 'medio', 'baixo', 'lucido'], [2024, 'impaciente', 'alto', 'alto', 'lucido'], [2147483647, 'agradavel', 'baixo', 'alto', 'lucido'],
    ],
    intermediario: [
      [0, 'verboso', 'baixo', 'alto', 'lucido'], [1, 'impaciente', 'baixo', 'alto', 'lucido'], [2, 'desconfiado', 'medio', 'alto', 'lucido'],
      [42, 'impaciente', 'medio', 'baixo', 'lucido'], [2024, 'desconfiado', 'medio', 'baixo', 'lucido'], [123456789, 'verboso', 'alto', 'baixo', 'lucido'],
    ],
    avancado: [
      [0, 'agradavel', 'baixo', 'alto', 'lucido'], [1, 'desconfiado', 'baixo', 'baixo', 'confuso'], [42, 'desconfiado', 'baixo', 'baixo', 'confuso'],
      [2024, 'ansioso', 'medio', 'baixo', 'confuso'], [123456789, 'agradavel', 'alto', 'baixo', 'lucido'], [2147483647, 'impaciente', 'baixo', 'baixo', 'lucido'],
    ],
  };

  test.each(Object.entries(GOLDEN))('golden (%s): a mesma semente é sempre o mesmo paciente', (difficulty, rows) => {
    rows.forEach(([seed, personality, literacy, recall, confusion]) => {
      expect(drawAxes(seed, difficulty)).toEqual({ personality, literacy, recall, confusion });
      expect(drawAxes(seed, difficulty)).toEqual(drawAxes(seed, difficulty));
    });
  });

  test('o resultado é congelado, completo e na ordem canônica', () => {
    const axes = drawAxes(99, 'avancado');
    expect(Object.isFrozen(axes)).toBe(true);
    expect(Object.keys(axes)).toEqual(AXIS_ORDER);
    expect(isValidAxes(axes)).toBe(true);
  });

  test('combinação incoerente (confuso com recall alto) NUNCA sai, em 3 dificuldades e 3000 sementes', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 0; seed < 1000; seed += 1) {
        const axes = drawAxes(seed, difficulty);
        expect(isCoherent(axes)).toBe(true);
        if (axes.confusion === 'confuso') expect(axes.recall).toBe('baixo');
      }
    }
  });

  test('isCoherent e isValidAxes recusam o par proibido e valores desconhecidos', () => {
    expect(isCoherent({ confusion: 'confuso', recall: 'alto' })).toBe(false);
    expect(isValidAxes({ personality: 'direto', literacy: 'alto', recall: 'alto', confusion: 'confuso' })).toBe(false);
    expect(isValidAxes({ personality: 'bravo', literacy: 'alto', recall: 'alto', confusion: 'lucido' })).toBe(false);
    expect(isValidAxes({ personality: 'direto', literacy: 'alto', recall: 'alto' })).toBe(false);
    expect(isValidAxes(null)).toBe(false);
  });

  function frequencies(difficulty, axis) {
    const counts = {};
    for (let seed = 0; seed < 4000; seed += 1) {
      const value = drawAxes(seed * 7919 + 13, difficulty)[axis];
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  }

  test('distribuição razoável: todos os valores aparecem e os pesos por dificuldade se refletem', () => {
    for (const axis of AXIS_ORDER) {
      for (const v of AXIS_VALUES[axis]) {
        if (axis === 'confusion' && v === 'confuso') continue; // no básico nunca sai
        expect(frequencies('intermediario', axis)[v]).toBeGreaterThan(40);
      }
    }
    expect(frequencies('basico', 'confusion').confuso).toBeUndefined();
    const hard = frequencies('avancado', 'confusion');
    const mid = frequencies('intermediario', 'confusion');
    expect(hard.confuso).toBeGreaterThan((mid.confuso || 0) * 2);
    expect(frequencies('basico', 'personality').agradavel).toBeGreaterThan(frequencies('avancado', 'personality').agradavel);
  });

  test('mudar o peso de um eixo não desloca os sorteios seguintes (sempre um número por eixo)', () => {
    // Letramento é sorteado com o mesmo número do gerador independentemente da personalidade escolhida.
    const rng = mulberry32(5);
    const rolls = [rng(), rng(), rng(), rng()];
    const again = mulberry32(5);
    expect(rolls).toEqual([again(), again(), again(), again()]);
  });

  test('dificuldade aceita as formas do acervo e cai no padrão', () => {
    expect(normalizeSimDifficulty('Básico')).toBe('basico');
    expect(normalizeSimDifficulty('Avançado')).toBe('avancado');
    expect(normalizeSimDifficulty('Intermediário')).toBe('intermediario');
    expect(normalizeSimDifficulty('qualquer coisa')).toBe('intermediario');
    expect(normalizeSimDifficulty(undefined)).toBe('intermediario');
  });
});

describe('catálogo', () => {
  const catalog = getCatalog(SIM_VERSION);

  test('versão desconhecida = null; toda combinação de valores tem trecho, rótulo e dica', () => {
    expect(getCatalog('sim-v0')).toBeNull();
    for (const axis of AXIS_ORDER) {
      for (const value of AXIS_VALUES[axis]) {
        const entry = catalog.axes[axis][value];
        expect(entry.label.length).toBeGreaterThan(2);
        expect(entry.prompt.length).toBeGreaterThan(40);
        expect(entry.adaptation.length).toBeGreaterThan(10);
      }
      expect(Object.keys(catalog.axes[axis]).sort()).toEqual(AXIS_VALUES[axis].slice().sort());
    }
  });

  test('trechos fixos: sem número de dose, sem diagnóstico induzido e em português com acento', () => {
    const texts = [];
    AXIS_ORDER.forEach((axis) => AXIS_VALUES[axis].forEach((v) => texts.push(catalog.axes[axis][v].prompt)));
    SEVERITIES.forEach((s) => texts.push(severityPrompt(s, SIM_VERSION)));
    texts.forEach((t) => {
      expect(t).not.toMatch(/\d+\s?(mg|mcg|ml|g|ui|comprimidos?|gotas?)\b/i);
      expect(t).not.toMatch(/antídoto|intoxicação por|síndrome (colinérgica|anticolinérgica)/i);
      expect(t.length).toBeLessThan(600);
    });
    expect(texts.join(' ')).toMatch(/ç|ã|é/);
  });

  test('profilePromptLines segue a ordem canônica; describeAxes e adaptationLines usam rótulos', () => {
    const axes = drawAxes(1, 'avancado');
    const lines = profilePromptLines(axes, SIM_VERSION);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(catalog.axes.personality[axes.personality].prompt);
    expect(describeAxes(axes, SIM_VERSION).map((d) => d.axisLabel)).toEqual(AXIS_ORDER.map((a) => AXIS_LABELS[a]));
    expect(adaptationLines(axes, SIM_VERSION)).toHaveLength(4);
    expect(profilePromptLines(axes, 'sim-v0')).toEqual([]);
    expect(severityPrompt('desconhecida', SIM_VERSION)).toBe('');
  });
});

describe('perfil do caso (sim_profile)', () => {
  const STAGES = [
    { id: 'inicio', severity: 'estavel', when: { afterMin: 0 } },
    { id: 'piora', severity: 'piora', when: { afterMin: 8, event: 'exam:ecg' }, note: 'Refere falta de ar.' },
  ];

  test('aceita perfil válido, normaliza e congela', () => {
    const p = parseSimProfile({ v: 1, difficulty: 'avancado', stages: STAGES });
    expect(p.difficulty).toBe('avancado');
    expect(p.stages).toHaveLength(2);
    expect(Object.isFrozen(p)).toBe(true);
    expect(parseSimProfile({ v: 1 })).toEqual({ difficulty: 'intermediario', stages: [] });
  });

  test.each([
    ['nulo', null],
    ['versão errada', { v: 2 }],
    ['dificuldade inválida', { v: 1, difficulty: 'dificil' }],
    ['estágios demais', { v: 1, stages: Array.from({ length: 7 }, (_, i) => ({ id: 'e' + i + 'x', severity: 'piora', when: { afterMin: i } })) }],
    ['id repetido', { v: 1, stages: [STAGES[0], STAGES[0]] }],
    ['sem condição', { v: 1, stages: [{ id: 'sem', severity: 'piora', when: {} }] }],
    ['severidade desconhecida', { v: 1, stages: [{ id: 'sev', severity: 'morto', when: { afterMin: 1 } }] }],
    ['evento fora do formato', { v: 1, stages: [{ id: 'evt', severity: 'piora', when: { event: 'Exame Com Espaço' } }] }],
    ['nota longa demais', { v: 1, stages: [{ id: 'nota', severity: 'piora', when: { afterMin: 1 }, note: 'x'.repeat(301) }] }],
    ['tempo fora da faixa', { v: 1, stages: [{ id: 'tempo', severity: 'piora', when: { afterMin: 241 } }] }],
  ])('recusa: %s', (_n, raw) => {
    expect(parseSimProfile(raw)).toBeNull();
  });
});

describe('estado que evolui', () => {
  const stages = parseSimProfile({
    v: 1,
    stages: [
      { id: 'inicio', severity: 'estavel', when: { afterMin: 0 } },
      { id: 'piora', severity: 'piora', when: { afterMin: 10 }, note: 'Mais fraco.' },
      { id: 'grave', severity: 'critico', when: { afterMin: 30, event: 'exam:gasometria' } },
    ],
  }).stages;

  test('estado inicial sem estágio atingido; imutável (evolve devolve estado novo)', () => {
    const s0 = createState(stages);
    expect(currentStage(s0)).toBeNull();
    const s1 = evolve(s0, [], 0);
    expect(s1).not.toBe(s0);
    expect(s0.elapsedMin).toBe(0);
    expect(Object.isFrozen(s1)).toBe(true);
    expect(currentStage(s1).id).toBe('inicio');
  });

  test('avança por tempo e por evento, nunca volta e pode pular estágios', () => {
    let s = evolve(createState(stages), [], 11);
    expect(currentStage(s).id).toBe('piora');
    s = evolve(s, ['exam:gasometria'], 0);
    expect(currentStage(s).id).toBe('grave');
    s = evolve(s, [], 0);
    expect(currentStage(s).id).toBe('grave');
    expect(currentStage(evolve(createState(stages), [], 45)).id).toBe('grave');
  });

  test('determinístico: mesmas entradas, mesmo estado; evolução em passos = em um passo', () => {
    const once = evolve(createState(stages), ['exam:gasometria'], 12);
    const steps = evolve(evolve(createState(stages), [], 5), ['exam:gasometria'], 7);
    expect(steps).toEqual(once);
    expect(evolve(createState(stages), ['exam:gasometria'], 12)).toEqual(once);
  });

  test('tempo inválido ou negativo conta como zero; eventos inválidos e repetidos são ignorados; há teto', () => {
    const s = evolve(createState(stages), ['exam:ok', 'exam:ok', 'COM ESPAÇO', 7, null], -5);
    expect(s.elapsedMin).toBe(0);
    expect(s.events).toEqual(['exam:ok']);
    expect(evolve(createState(stages), [], Number.NaN).elapsedMin).toBe(0);
    expect(evolve(createState(stages), [], 1e9).elapsedMin).toBe(SIM_LIMITS.ELAPSED_SECONDS_MAX / 60);
    const many = Array.from({ length: 80 }, (_, i) => 'e' + i);
    expect(evolve(createState(stages), many, 0).events).toHaveLength(SIM_LIMITS.EVENTS_MAX);
  });

  test('caso sem estágios só acumula tempo e eventos', () => {
    const s = evolve(createState(), ['exam:x'], 4);
    expect(currentStage(s)).toBeNull();
    expect(s.elapsedMin).toBe(4);
  });
});

describe('entrada simulation', () => {
  const ok = { seed: 7, version: SIM_VERSION };

  test('aceita o mínimo e aplica padrões', () => {
    expect(parseSimulationInput(ok)).toEqual({ seed: 7, version: SIM_VERSION, difficulty: undefined, elapsedSeconds: 0, events: [] });
  });

  test.each([
    ['semente decimal', { seed: 1.5 }],
    ['semente negativa', { seed: -1 }],
    ['semente acima do limite', { seed: SIM_LIMITS.SEED_MAX + 1 }],
    ['semente em texto', { seed: '7' }],
    ['versão desconhecida', { version: 'sim-v9' }],
    ['versão ausente', { version: undefined }],
    ['dificuldade inválida', { difficulty: 'impossivel' }],
    ['tempo negativo', { elapsedSeconds: -1 }],
    ['tempo acima do limite', { elapsedSeconds: SIM_LIMITS.ELAPSED_SECONDS_MAX + 1 }],
    ['eventos que não são lista', { events: 'exam:x' }],
    ['evento fora do formato', { events: ['Exame X'] }],
    ['eventos demais', { events: Array.from({ length: SIM_LIMITS.EVENTS_MAX + 1 }, (_, i) => 'e' + i) }],
  ])('recusa: %s', (_n, patch) => {
    expect(() => parseSimulationInput(Object.assign({}, ok, patch))).toThrow(expect.objectContaining({ name: 'ValidationError' }));
  });

  test.each([[null], [undefined], ['texto'], [[1, 2]]])('recusa corpo %p', (raw) => {
    expect(() => parseSimulationInput(raw)).toThrow(expect.objectContaining({ name: 'ValidationError' }));
  });

  test('o cliente não consegue informar eixos: campos extras são ignorados', () => {
    const parsed = parseSimulationInput(Object.assign({ axes: { personality: 'direto' }, personality: 'direto' }, ok));
    expect(Object.keys(parsed).sort()).toEqual(['difficulty', 'elapsedSeconds', 'events', 'seed', 'version']);
  });
});

describe('nota da simulação', () => {
  const FACTS = { hasDiagnosis: true, hasConduct: true, questionsCount: 5 };
  const MODEL = {
    components: { hipotese: 25, conduta: 20, processo: 15, comunicacao: 10 },
    verdict: 'Bom atendimento', feedback: 'Parecer de teste.', strengths: ['a'], improvements: ['b'],
  };

  test('pesos somam 100: hipótese 30, conduta 30, processo 20, comunicação 20', () => {
    expect(SIM_SCORE_WEIGHTS).toEqual({ hipotese: 30, conduta: 30, processo: 20, comunicacao: 20 });
    expect(Object.values(SIM_SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  test('o servidor limita cada componente ao teto e soma (a nota total do modelo é ignorada)', () => {
    const parsed = parseSimEvaluation(Object.assign({}, MODEL, {
      score: 100, components: { hipotese: 99, conduta: -4, processo: '18.6', comunicacao: 20.4 },
    }));
    expect(parsed.components).toEqual({ hipotese: 30, conduta: 0, processo: 19, comunicacao: 20 });
    const scored = computeSimScore(parsed.components, FACTS);
    expect(scored.score).toBe(69);
    expect(Object.isFrozen(scored.components)).toBe(true);
  });

  test.each([
    ['sem components', { components: undefined }],
    ['componente ausente', { components: { hipotese: 10, conduta: 10, processo: 10 } }],
    ['componente não numérico', { components: { hipotese: 'alto', conduta: 1, processo: 1, comunicacao: 1 } }],
    ['sem veredito', { verdict: '' }],
    ['sem parecer', { feedback: '' }],
  ])('saída inutilizável do modelo: %s', (_n, patch) => {
    expect(parseSimEvaluation(Object.assign({}, MODEL, patch))).toBeNull();
    expect(parseSimEvaluation('texto')).toBeNull();
  });

  test('tetos por fatos: sem hipótese, sem conduta ou sem perguntas', () => {
    const c = { hipotese: 30, conduta: 30, processo: 20, comunicacao: 20 };
    expect(computeSimScore(c, FACTS).score).toBe(100);
    expect(computeSimScore(c, Object.assign({}, FACTS, { hasDiagnosis: false })).score).toBe(70);
    expect(computeSimScore(c, Object.assign({}, FACTS, { hasConduct: false })).score).toBe(70);
    expect(computeSimScore(c, Object.assign({}, FACTS, { questionsCount: 0 })).score).toBe(60);
    expect(computeSimScore(c, { hasDiagnosis: false, hasConduct: false, questionsCount: 0 }).score).toBe(0);
  });
});

describe('simId', () => {
  test('12 hex, estável e sensível ao caso, à semente e à versão', async () => {
    const id = await computeSimId('caso_tox_01', 42, SIM_VERSION);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(id).toBe('951f690a3969');
    expect(await computeSimId('caso_tox_01', 42, SIM_VERSION)).toBe(id);
    expect(await computeSimId('caso_tox_02', 42, SIM_VERSION)).not.toBe(id);
    expect(await computeSimId('caso_tox_01', 43, SIM_VERSION)).not.toBe(id);
    expect(await computeSimId('caso_tox_01', 42, 'sim-v2')).not.toBe(id);
  });
});
