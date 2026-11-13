/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { checkSafety, normalizeForSafety, SAFE_EDUCATIONAL_ANSWER } from '../src/ai/safetyBlocklist.js';

describe('safetyBlocklist', () => {
  test.each([
    ['Sarin'], ['agente VX'], ['Gás Mostarda'], ['s a r i n'], ['ricina'], ['bomba suja'],
  ])('bloqueia agente de guerra no termo: %s', (term) => {
    expect(checkSafety({ term }).blocked).toBe(true);
  });

  test('bloqueia droga ilícita no termo e produção clandestina na pergunta', () => {
    expect(checkSafety({ term: 'metanfetamina' }).reason).toBe('illicit_synthesis');
    expect(checkSafety({ question: 'Como fazer cocaína em casa?' }).blocked).toBe(true);
  });

  test.each([
    [{ term: 'Paracetamol' }], [{ term: 'Ácido acetilsalicílico' }],
    [{ question: 'Qual o mecanismo da morfina?' }], [{ question: 'Como é a escrituração da codeína?' }],
    [{ question: 'O que é gabapentina?' }],
  ])('não bloqueia uso farmacêutico legítimo: %j', (input) => {
    expect(checkSafety(input).blocked).toBe(false);
  });

  test('normaliza acento e pontuação; resposta fixa não traz rota', () => {
    expect(normalizeForSafety('Gás-Mostarda!')).toBe('gas mostarda');
    expect(SAFE_EDUCATIONAL_ANSWER).not.toMatch(/\d+\s?(mg|g|mL)|°C/);
  });
});

describe('safetyBlocklist — F-037 (asfixiantes e sufocantes)', () => {
  test.each([
    ['fosgênio'], ['Phosgene'], ['cianeto de hidrogênio'], ['hydrogen cyanide'], ['ácido cianídrico'],
    ['carbonyl dichloride'], ['cloreto de cianogênio'], ['f o s g e n i o'],
  ])('bloqueia no termo: %s', (term) => {
    expect(checkSafety({ term })).toEqual({ blocked: true, reason: 'cbrn' });
  });

  test.each([
    ['cloro como arma química'], ['chlorine gas weapon'], ['usar cloro como arma de guerra'],
  ])('bloqueia cloro posto como arma: %s', (question) => {
    expect(checkSafety({ question }).reason).toBe('cbrn');
  });

  test.each([
    [{ term: 'cloro' }], [{ term: 'hipoclorito de sódio' }], [{ term: 'cianeto de potássio' }],
    [{ question: 'Como o cloro desinfeta a água da piscina?' }], [{ question: 'Qual o antídoto da intoxicação por cianeto?' }],
    [{ question: 'O cloro é usado na farmácia para desinfecção?' }],
  ])('não bloqueia uso legítimo: %j', (input) => {
    expect(checkSafety(input).blocked).toBe(false);
  });
});
