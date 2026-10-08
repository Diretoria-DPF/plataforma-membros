/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia (L5): humor, tom, variações, poses idle, atraso idle e encurtamento (lia-mood.js). Funções puras, sem navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIA = 'modulos/shared/lia';
const require = createRequire(import.meta.url);
const Mood = require('../modulos/shared/lia/lia-mood.js');
const States = require('../modulos/shared/lia/lia-states.js');

const DEFAULT_MOOD = { energy: 0.8, patience: 0.9, curiosity: 0.7, rapport: 0.5 };
const SWEEP = Array.from({ length: 400 }, (_, i) => i / 400); // valores de rand espalhados em [0, 1)
const constantRand = (value) => () => value;
const calmMood = () => Mood.createMood({ energy: 0.2 }); // tom reflexivo
const plain = (obj) => ({ ...obj });
const core = (text) => text.replace(/[!.?…]+$/u, '');
const codeOf = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');
const distanceToDefault = (mood) => Object.keys(DEFAULT_MOOD)
  .reduce((sum, axis) => sum + Math.abs(mood[axis] - DEFAULT_MOOD[axis]), 0);

// ---------- createMood ----------

test('createMood: devolve o humor padrão (energy .8, patience .9, curiosity .7, rapport .5)', () => {
  assert.deepEqual(plain(Mood.createMood()), DEFAULT_MOOD);
});

test('createMood: devolve objeto congelado', () => {
  assert.equal(Object.isFrozen(Mood.createMood()), true);
});

test('createMood: clamp mantém cada eixo entre 0 e 1', () => {
  const mood = Mood.createMood({ energy: 3, patience: -2, curiosity: 1.5, rapport: 0.25 });
  assert.deepEqual(plain(mood), { energy: 1, patience: 0, curiosity: 1, rapport: 0.25 });
});

test('createMood: valor não numérico ou NaN cai no padrão do eixo', () => {
  const mood = Mood.createMood({ energy: 'alto', patience: NaN, curiosity: null });
  assert.deepEqual(plain(mood), DEFAULT_MOOD);
});

// ---------- reduce: eventos ----------

test('reduce positive: rapport +0,1 e patience +0,05, o resto intacto', () => {
  const next = Mood.reduce(Mood.createMood(), 'positive');
  assert.equal(next.rapport, 0.6);
  assert.equal(next.patience, 0.95);
  assert.equal(next.energy, 0.8);
  assert.equal(next.curiosity, 0.7);
});

test('reduce positive: não passa de 1', () => {
  const next = Mood.reduce(Mood.createMood({ patience: 0.98, rapport: 0.95 }), 'positive');
  assert.equal(next.patience, 1);
  assert.equal(next.rapport, 1);
});

test('reduce negative: patience -0,2 e rapport -0,05', () => {
  const next = Mood.reduce(Mood.createMood(), 'negative');
  assert.equal(next.patience, 0.7);
  assert.equal(next.rapport, 0.45);
});

test('reduce negative: não passa de 0', () => {
  const next = Mood.reduce(Mood.createMood({ patience: 0.1, rapport: 0.02 }), 'negative');
  assert.equal(next.patience, 0);
  assert.equal(next.rapport, 0);
});

test('reduce quick-reply: energy +0,05', () => {
  const next = Mood.reduce(Mood.createMood({ energy: 0.5 }), 'quick-reply');
  assert.equal(next.energy, 0.55);
  assert.equal(next.patience, 0.9);
});

test('reduce asks-detail: curiosity +0,05', () => {
  const next = Mood.reduce(Mood.createMood(), 'asks-detail');
  assert.equal(next.curiosity, 0.75);
  assert.equal(next.rapport, 0.5);
});

test('reduce new-module: curiosity +0,1', () => {
  const next = Mood.reduce(Mood.createMood(), 'new-module');
  assert.equal(next.curiosity, 0.8);
  assert.equal(next.energy, 0.8);
});

test('reduce idle-tick: cada eixo anda 5% da distância até o padrão', () => {
  const next = Mood.reduce(Mood.createMood({ energy: 0.2, patience: 0.5, curiosity: 1, rapport: 0 }), 'idle-tick');
  assert.equal(next.energy, 0.23); // 0,2 + (0,8 - 0,2) x 0,05
  assert.equal(next.patience, 0.52); // 0,5 + (0,9 - 0,5) x 0,05
  assert.equal(next.curiosity, 0.985); // 1 + (0,7 - 1) x 0,05
  assert.equal(next.rapport, 0.025); // 0 + (0,5 - 0) x 0,05
});

test('reduce idle-tick: converge ao padrão sem nunca ultrapassá-lo', () => {
  let mood = Mood.createMood({ energy: 0, patience: 0, curiosity: 1, rapport: 1 });
  let previous = distanceToDefault(mood);
  for (let tick = 0; tick < 300; tick += 1) {
    mood = Mood.reduce(mood, 'idle-tick');
    const current = distanceToDefault(mood);
    assert.ok(current <= previous + 1e-9, `tick ${tick}: distância cresceu`);
    previous = current;
  }
  assert.ok(distanceToDefault(mood) < 0.01, 'não convergiu');
});

test('reduce: evento desconhecido devolve o mesmo estado (inclusive chaves de protótipo)', () => {
  const base = Mood.createMood({ energy: 0.3 });
  ['bogus', '', 'constructor', '__proto__', 'toString', undefined, 42].forEach((evento) => {
    assert.deepEqual(plain(Mood.reduce(base, evento)), plain(base), String(evento));
  });
});

test('reduce: nunca altera o humor de entrada', () => {
  const base = Mood.createMood({ energy: 0.5 });
  const before = plain(base);
  ['positive', 'negative', 'quick-reply', 'asks-detail', 'new-module', 'idle-tick'].forEach((evento) => Mood.reduce(base, evento));
  assert.deepEqual(plain(base), before);
});

test('reduce: devolve objeto novo e congelado, também para evento desconhecido', () => {
  const base = Mood.createMood();
  ['positive', 'nao-existe'].forEach((evento) => {
    const next = Mood.reduce(base, evento);
    assert.notEqual(next, base);
    assert.equal(Object.isFrozen(next), true);
  });
});

test('reduce: humor ausente ou malformado usa o padrão', () => {
  assert.deepEqual(plain(Mood.reduce(undefined, 'idle-tick')), DEFAULT_MOOD);
  assert.deepEqual(plain(Mood.reduce({ energy: 'x' }, 'new-module')), { ...DEFAULT_MOOD, curiosity: 0.8 });
});

test('reduce: qualquer sequência de eventos mantém os eixos entre 0 e 1', () => {
  const events = ['positive', 'negative', 'quick-reply', 'asks-detail', 'new-module', 'idle-tick'];
  let mood = Mood.createMood();
  for (let i = 0; i < 500; i += 1) {
    mood = Mood.reduce(mood, events[(i * 7) % events.length]);
    Mood.AXES.forEach((axis) => assert.ok(mood[axis] >= 0 && mood[axis] <= 1, `${axis}=${mood[axis]}`));
  }
});

// ---------- toneOf ----------

test('toneOf: energia acima de 0,7 é animated', () => {
  assert.equal(Mood.toneOf(Mood.createMood()), 'animated');
  assert.equal(Mood.toneOf({ energy: 0.71 }), 'animated');
});

test('toneOf: energia abaixo de 0,4 é reflective', () => {
  assert.equal(Mood.toneOf({ energy: 0.39 }), 'reflective');
  assert.equal(Mood.toneOf({ energy: 0 }), 'reflective');
});

test('toneOf: as fronteiras 0,7 e 0,4 ficam em neutral', () => {
  assert.equal(Mood.toneOf({ energy: 0.7 }), 'neutral');
  assert.equal(Mood.toneOf({ energy: 0.4 }), 'neutral');
  assert.equal(Mood.toneOf({ energy: 0.55 }), 'neutral');
});

// ---------- pickVariation ----------

test('pickVariation: contagem por kind é 5, 4, 6, 4 e 3, com os textos da especificação', () => {
  assert.deepEqual([...Mood.VARIATIONS.greeting], ['Oi!', 'Olá!', 'E aí!', 'Bem-vindo!', 'Chegou!']);
  assert.deepEqual([...Mood.VARIATIONS.confirmation], ['Beleza!', 'Certo!', 'Anotado!', 'Ok!']);
  assert.deepEqual([...Mood.VARIATIONS.tip], ['Tenta assim…', 'Uma dica…', 'Sabia que…', 'Dá uma olhada em…', 'Já pensou em…', 'O que acha de…']);
  assert.deepEqual([...Mood.VARIATIONS.farewell], ['Até mais!', 'Falou!', 'Bons estudos!', 'Volta sempre!']);
  assert.deepEqual([...Mood.VARIATIONS.error], ['Hmm, não entendi.', 'Pode reformular?', 'Não peguei essa.']);
});

test('pickVariation: devolve só itens da lista do kind e cobre todos quando rand varia', () => {
  Object.keys(Mood.VARIATIONS).forEach((kind) => {
    const seen = new Set(SWEEP.map((r) => Mood.pickVariation(kind, Mood.createMood(), constantRand(r))));
    assert.deepEqual([...seen].sort(), [...Mood.VARIATIONS[kind]].sort(), kind);
  });
});

test('pickVariation: kind desconhecido devolve null', () => {
  assert.equal(Mood.pickVariation('nao-existe', Mood.createMood(), constantRand(0)), null);
  assert.equal(Mood.pickVariation('constructor', Mood.createMood(), constantRand(0)), null);
});

test('pickVariation: nunca repete a última variação, em todos os kinds, tons e rands', () => {
  const moods = [Mood.createMood(), calmMood()];
  Object.keys(Mood.VARIATIONS).forEach((kind) => {
    moods.forEach((mood) => {
      Mood.VARIATIONS[kind].forEach((last) => {
        SWEEP.forEach((r) => {
          const text = Mood.pickVariation(kind, mood, constantRand(r), last);
          assert.notEqual(core(text), core(last), `${kind}: repetiu ${last}`);
        });
      });
    });
  });
});

test('pickVariation: last pode ser o texto já renderizado com pausa', () => {
  SWEEP.forEach((r) => {
    const text = Mood.pickVariation('greeting', calmMood(), constantRand(r), 'Oi…');
    assert.notEqual(core(text), 'Oi');
  });
});

test('pickVariation: tom reflexivo põe pausa "…" em saudação e confirmação', () => {
  ['greeting', 'confirmation'].forEach((kind) => {
    SWEEP.forEach((r) => {
      const text = Mood.pickVariation(kind, calmMood(), constantRand(r));
      assert.ok(text.endsWith('…'), `${kind}: ${text}`);
      assert.equal(text.includes('!'), false, text);
    });
  });
});

test('pickVariation: tom reflexivo prefere reticências na dica e nunca exclamação no erro', () => {
  SWEEP.forEach((r) => {
    const tip = Mood.pickVariation('tip', calmMood(), constantRand(r));
    assert.ok(tip.endsWith('…'), tip);
    const error = Mood.pickVariation('error', calmMood(), constantRand(r));
    assert.equal(error.endsWith('!'), false, error);
  });
});

test('pickVariation: tom reflexivo sem variação calma mantém a despedida inteira', () => {
  const seen = new Set(SWEEP.map((r) => Mood.pickVariation('farewell', calmMood(), constantRand(r))));
  assert.deepEqual([...seen].sort(), [...Mood.VARIATIONS.farewell].sort());
});

test('pickVariation: tom animado nunca põe pausa na saudação', () => {
  SWEEP.forEach((r) => {
    assert.equal(Mood.pickVariation('greeting', Mood.createMood(), constantRand(r)).endsWith('…'), false);
  });
});

test('pickVariation: rapport >= 0,7 libera "Que bom te ver!" na saudação', () => {
  const seen = new Set(SWEEP.map((r) => Mood.pickVariation('greeting', Mood.createMood({ rapport: 0.7 }), constantRand(r))));
  assert.ok(seen.has('Que bom te ver!'));
  assert.equal(seen.size, 6);
});

test('pickVariation: rapport abaixo de 0,7 nunca usa a forma calorosa', () => {
  SWEEP.forEach((r) => {
    assert.notEqual(Mood.pickVariation('greeting', Mood.createMood({ rapport: 0.69 }), constantRand(r)), 'Que bom te ver!');
  });
});

test('pickVariation: a forma calorosa nunca aparece fora da saudação', () => {
  const warm = Mood.createMood({ rapport: 1 });
  ['confirmation', 'tip', 'farewell', 'error'].forEach((kind) => {
    SWEEP.forEach((r) => {
      assert.equal(core(Mood.pickVariation(kind, warm, constantRand(r))).includes('Que bom te ver'), false, kind);
    });
  });
});

test('pickVariation: rand fixa o índice (0 -> primeiro, quase 1 -> último; inválida -> meio)', () => {
  assert.equal(Mood.pickVariation('greeting', Mood.createMood(), constantRand(0)), 'Oi!');
  assert.equal(Mood.pickVariation('greeting', Mood.createMood(), constantRand(0.9999)), 'Chegou!');
  assert.equal(Mood.pickVariation('greeting', Mood.createMood(), () => NaN), 'E aí!');
  assert.equal(Mood.pickVariation('greeting', Mood.createMood(), undefined), 'E aí!');
});

// ---------- idleVariation ----------

test('idleVariation: são 5 micro-poses distintas', () => {
  assert.equal(Mood.IDLE_POSES.length, 5);
  const seen = new Set(SWEEP.map((r) => JSON.stringify(Mood.idleVariation(Mood.createMood(), constantRand(r)))));
  assert.equal(seen.size, 5);
});

test('idleVariation: cada pose usa só valores permitidos pelas allowlists de LiaStates', () => {
  const allowedKey = { emotion: 'emotion', mouth: 'mouth', armLeft: 'arm', armRight: 'arm' };
  Mood.IDLE_POSES.forEach((pose) => {
    Object.entries(pose).forEach(([key, value]) => {
      assert.ok(Object.prototype.hasOwnProperty.call(allowedKey, key), key);
      assert.ok(States.ALLOWED[allowedKey[key]].includes(value), `${key}=${value}`);
    });
  });
});

test('idleVariation: LiaStates.resolve mantém cada override da pose', () => {
  Mood.IDLE_POSES.forEach((pose) => {
    const attrs = States.resolve('idle', pose);
    Object.entries(pose).forEach(([key, value]) => assert.equal(attrs[key], value, key));
  });
});

test('idleVariation: devolve objeto novo e congelado, sem expor as poses internas', () => {
  const pose = Mood.idleVariation(Mood.createMood(), constantRand(0));
  assert.equal(Object.isFrozen(pose), true);
  assert.equal(Mood.IDLE_POSES.includes(pose), false);
  const key = Object.keys(pose)[0];
  assert.throws(() => { pose[key] = 'x'; }, TypeError);
});

test('idleVariation: tom reflexivo nunca devolve o aceno', () => {
  const seen = new Set(SWEEP.map((r) => Mood.idleVariation(calmMood(), constantRand(r)).armLeft));
  assert.equal(seen.has('wave'), false);
  assert.equal(new Set(SWEEP.map((r) => JSON.stringify(Mood.idleVariation(calmMood(), constantRand(r))))).size, 4);
});

// ---------- nextIdleDelay ----------

test('nextIdleDelay: qualquer rand e energia ficam entre 10 000 e 30 000 ms', () => {
  [0, 0.5, 1].forEach((energy) => {
    SWEEP.forEach((r) => {
      const delay = Mood.nextIdleDelay(Mood.createMood({ energy }), constantRand(r));
      assert.ok(delay >= 10000 && delay <= 30000, `energia ${energy}: ${delay}`);
    });
  });
});

test('nextIdleDelay: energia alta encurta (energia 1 fica em [10 000, 20 000); energia 0 em [20 000, 30 000))', () => {
  SWEEP.forEach((r) => {
    const high = Mood.nextIdleDelay(Mood.createMood({ energy: 1 }), constantRand(r));
    const low = Mood.nextIdleDelay(Mood.createMood({ energy: 0 }), constantRand(r));
    assert.ok(high >= 10000 && high < 20000, `alta: ${high}`);
    assert.ok(low >= 20000 && low < 30000, `baixa: ${low}`);
  });
});

test('nextIdleDelay: valores fixos com rand 0,5', () => {
  assert.equal(Mood.nextIdleDelay(Mood.createMood({ energy: 1 }), constantRand(0.5)), 15000);
  assert.equal(Mood.nextIdleDelay(Mood.createMood({ energy: 0.5 }), constantRand(0.5)), 20000);
  assert.equal(Mood.nextIdleDelay(Mood.createMood({ energy: 0 }), constantRand(0.5)), 25000);
});

test('nextIdleDelay: rand inválida usa o meio do intervalo', () => {
  assert.equal(Mood.nextIdleDelay(Mood.createMood({ energy: 1 }), () => NaN), 15000);
  assert.equal(Mood.nextIdleDelay(Mood.createMood({ energy: 1 }), undefined), 15000);
});

test('nextIdleDelay: devolve inteiro em ms', () => {
  SWEEP.forEach((r) => {
    assert.ok(Number.isInteger(Mood.nextIdleDelay(Mood.createMood({ energy: 0.37 }), constantRand(r))));
  });
});

// ---------- shortenFor ----------

const LONG = 'Tenta assim: abra o menu lateral e depois escolha a opção de exportação. Depois salve.';

test('shortenFor: paciência a partir de 0,4 devolve o texto intacto', () => {
  assert.equal(Mood.shortenFor(Mood.createMood(), LONG), LONG);
  assert.equal(Mood.shortenFor(Mood.createMood({ patience: 0.4 }), LONG), LONG);
});

test('shortenFor: paciência abaixo de 0,4 mantém só a primeira frase', () => {
  const mood = Mood.createMood({ patience: 0.39 });
  assert.equal(Mood.shortenFor(mood, 'Tenta assim: abra o menu. Depois salve tudo.'), 'Tenta assim: abra o menu.');
});

test('shortenFor: frase curta sem pontuação fica intacta', () => {
  assert.equal(Mood.shortenFor(Mood.createMood({ patience: 0.1 }), 'Vamos lá'), 'Vamos lá');
});

test('shortenFor: primeira frase longa é cortada em fronteira de palavra, com reticências', () => {
  const text = 'Esta frase inicial é bem mais comprida do que deveria ser para caber numa bolha de fala curta.';
  const out = Mood.shortenFor(Mood.createMood({ patience: 0.1 }), text);
  assert.ok(out.endsWith('…'), out);
  const bare = out.slice(0, -1);
  assert.ok(bare.length <= 60, `comprimento ${bare.length}`);
  assert.ok(text.startsWith(bare));
  assert.equal(text[bare.length], ' ', 'cortou no meio de palavra');
});

test('shortenFor: nunca corta no meio de palavra, em vários comprimentos', () => {
  const words = ['abacaxi', 'pé', 'tomate', 'é', 'configurações', 'ação', 'sim', 'palavrasuperlongaqueultrapassaolimitedecaracteresdaforma'];
  const mood = Mood.createMood({ patience: 0.1 });
  for (let n = 1; n <= 30; n += 1) {
    const text = Array.from({ length: n }, (_, i) => words[(i * 3) % words.length]).join(' ');
    const out = Mood.shortenFor(mood, text);
    const bare = out.endsWith('…') ? out.slice(0, -1) : out;
    assert.ok(text.startsWith(bare), `n=${n}: ${out}`);
    assert.ok(bare === text || /\s/.test(text[bare.length]), `n=${n}: cortou palavra em "${out}"`);
  }
});

test('shortenFor: ponto decimal não encerra a frase', () => {
  assert.equal(Mood.shortenFor(Mood.createMood({ patience: 0.1 }), 'Versão 2.0 é a nova. Teste.'), 'Versão 2.0 é a nova.');
});

test('shortenFor: entrada que não é texto devolve string vazia', () => {
  assert.equal(Mood.shortenFor(Mood.createMood({ patience: 0.1 }), undefined), '');
  assert.equal(Mood.shortenFor(Mood.createMood(), 42), '');
});

// ---------- pureza e forma do módulo ----------

test('lia-mood.js é puro: sem DOM, armazenamento, timers, rede nem Math.random', () => {
  const forbidden = /innerHTML|outerHTML|insertAdjacentHTML|DOMParser|document\.|localStorage|sessionStorage|indexedDB|setTimeout|setInterval|Math\.random|fetch\(/;
  assert.equal(forbidden.test(codeOf(`${LIA}/lia-mood.js`)), false);
});

test('lia-mood.js expõe a API prevista e o objeto da API é congelado', () => {
  ['createMood', 'reduce', 'toneOf', 'pickVariation', 'idleVariation', 'nextIdleDelay', 'shortenFor']
    .forEach((name) => assert.equal(typeof Mood[name], 'function', name));
  assert.equal(Object.isFrozen(Mood), true);
});

test('lia-mood.js em navegador (sem module) registra window.LiaMood', () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(frontend, LIA, 'lia-mood.js'), 'utf8'), sandbox);
  const api = sandbox.window.LiaMood;
  assert.equal(typeof api.reduce, 'function');
  assert.equal(api.toneOf(api.createMood()), 'animated');
});

