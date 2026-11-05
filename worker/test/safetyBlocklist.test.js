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
