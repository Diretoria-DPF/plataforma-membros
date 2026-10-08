/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import * as R from '../src/assistant/moderationRules.js';

const DAY = 86400000;
const T0 = new Date('2026-01-01T12:00:00Z');
const at = (days) => new Date(T0.getTime() + days * DAY);

// Três incidentes em 90 dias (dias 0, 25 e 50): cada um chega antes de os 30 dias vencerem.
function threeIncidents() {
  let state = R.EMPTY_STATE;
  [0, 25, 50].forEach((d) => { state = R.registerIncident(state, at(d)); });
  return state;
}

describe('ADR 0004 — testes exigidos', () => {
  test('(a) 3 incidentes em 90 dias levam ao nível 3 (suspensão de 24 h)', () => {
    const state = threeIncidents();
    expect(state.level).toBe(3);
    expect(state.until.getTime()).toBe(at(50).getTime() + 24 * 3600000);
    expect(R.isSuspended(state, at(50.5))).toBe(true);
    expect(R.isSuspended(state, at(52))).toBe(false);
  });

  test('(b) o mesmo + 30 dias sem novo incidente: nível 2', () => {
    const state = threeIncidents();
    expect(R.decay(state, at(50 + 29)).level).toBe(3); // ainda não
    expect(R.decay(state, at(50 + 30)).level).toBe(2);
  });

  test('(c) redenção zera o nível na hora', () => {
    const redeemed = R.redeem(threeIncidents());
    expect(redeemed.level).toBe(0);
    expect(redeemed.until).toBeNull();
    expect(R.isSuspended(redeemed, at(50.1))).toBe(false);
  });
});

describe('decaimento', () => {
  test('cai 1 nível a cada 30 dias, até 0', () => {
    const state = threeIncidents();
    expect(R.decay(state, at(50 + 60)).level).toBe(1);
    expect(R.decay(state, at(50 + 90)).level).toBe(0);
    expect(R.decay(state, at(50 + 400)).level).toBe(0);
  });

  test('o relógio do degrau seguinte parte do decaimento aplicado, não do incidente', () => {
    const once = R.decay(threeIncidents(), at(50 + 30)); // nível 2, lastDecayAt = dia 80
    expect(once.lastDecayAt.getTime()).toBe(at(80).getTime());
    expect(R.decay(once, at(80 + 29)).level).toBe(2);
    expect(R.decay(once, at(80 + 30)).level).toBe(1);
  });

  test('nível 3 ainda suspenso nunca decai, mesmo com relógio adiantado', () => {
    const state = R.registerIncident(R.registerIncident(R.registerIncident(R.EMPTY_STATE, at(0)), at(1)), at(2));
    expect(R.decay(state, new Date(at(2).getTime() + 3600000)).level).toBe(3);
  });

  test('um incidente novo depois de decair parte do nível já reduzido', () => {
    const afterDecay = R.decay(threeIncidents(), at(50 + 30)); // nível 2
    expect(R.registerIncident(afterDecay, at(81)).level).toBe(3);
    const lowered = R.decay(threeIncidents(), at(50 + 90)); // nível 0
    expect(R.registerIncident(lowered, at(141)).level).toBe(1);
  });

  test('a redenção não reinicia o contador: lastIncidentAt permanece', () => {
    const state = threeIncidents();
    const redeemed = R.redeem(state);
    expect(redeemed.lastIncidentAt.getTime()).toBe(state.lastIncidentAt.getTime());
    const afterNew = R.registerIncident(redeemed, at(60));
    expect(afterNew.level).toBe(1);
  });

  test('funções puras: o estado de entrada não é alterado', () => {
    const state = threeIncidents();
    const snapshot = JSON.stringify(state);
    R.decay(state, at(200));
    R.registerIncident(state, at(51));
    R.redeem(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  test('aceita linha do banco (snake_case, strings ISO)', () => {
    const state = R.normalizeState({ level: 2, until: null, last_incident_at: '2026-01-01T00:00:00Z', last_decay_at: null });
    expect(state.lastIncidentAt).toBeInstanceOf(Date);
    expect(R.decay(state, new Date('2026-02-05T00:00:00Z')).level).toBe(1);
  });
});

describe('detecção de ofensa e sinceridade', () => {
  test.each([['você é uma idiota'], ['VAI SE FODER'], ['que merda de robô'], ['cala a boca']])('termo ofensivo: %s', (m) => {
    expect(R.containsOffensiveTerm(m)).toBe(true);
  });
  test.each([['como descarto lixo químico?'], ['qual a droga de escolha?'], ['quero me inscrever no evento'], ['curso de computação']])('pergunta legítima: %s', (m) => {
    expect(R.containsOffensiveTerm(m)).toBe(false);
  });

  const SINCERE = 'Peço desculpas, eu estava irritado com um erro e passei do limite com palavras que não devia usar. Vou respeitar as conversas daqui em diante.';
  test('texto sincero passa', () => { expect(R.sincerityHeuristic(SINCERE)).toEqual({ ok: true }); });
  test.each([
    ['curto', 'desculpa'],
    ['repetitivo', 'desculpa '.repeat(12)],
    ['ofensivo', 'Desculpa mas você continua sendo uma idiota e eu não vou mudar nada disso nunca'],
    ['sem_reconhecimento', 'Quero que o chat volte a funcionar agora porque preciso muito usar a plataforma hoje'],
    ['longo', 'desculpa '.repeat(5) + 'x'.repeat(700)],
  ])('recusa por %s', (reason, text) => {
    expect(R.sincerityHeuristic(text)).toMatchObject({ ok: false, reason });
  });
});
