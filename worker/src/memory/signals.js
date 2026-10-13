/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/signals.js
 * Sinais DETERMINÍSTICOS que podem virar memória (ADR 0007). A escrita NUNCA vem de um modelo de IA: só de
 *   - resultado de simulado (módulo, acertos, total e os tópicos escolhidos), e
 *   - palavras-chave da pergunta ao tutor, mapeadas ao vocabulário controlado (o texto é descartado),
 * além das preferências que o próprio membro escolhe (memory/service.js). Puro: sem I/O. Cada função devolve itens já
 * no formato do store ({ kind, slug, level, value, source }) ou lista vazia; nada do texto original sobrevive.
 */
import { MEMORY } from '../constants.js';
import { matchTopics, levelFromAccuracy, moduleTopic } from './vocabulary.js';

const QUIZ_WEAK_LEVEL = 2;   // até este nível o simulado também registra dúvida
const WEAK_DIFFICULTY = 2;   // nível inicial da dúvida vinda do simulado (sobe 1 a cada recorrência)
const FIRST_DOUBT = 1;       // nível inicial da dúvida vinda de pergunta ao tutor

/**
 * Itens de um simulado concluído. `input` = { module, correct, total, topics? } (já validado pelo learningService).
 * Sem tópico reconhecido, vale o tema geral do módulo (Farmacologia/Toxicologia/Anatomia).
 */
export function quizItems(input) {
  const src = input && typeof input === 'object' ? input : {};
  const level = levelFromAccuracy(src.correct, src.total);
  if (level === null) return [];
  const topicsText = Array.isArray(src.topics) ? src.topics.filter((t) => typeof t === 'string').join(' ; ') : '';
  let slugs = matchTopics(topicsText, MEMORY.SIGNAL_TOPICS_MAX);
  if (!slugs.length) {
    const general = moduleTopic(typeof src.module === 'string' ? src.module : '');
    slugs = general ? [general] : [];
  }
  return slugs.flatMap((slug) => [
    { kind: 'topic_level', slug, level, value: null, source: 'quiz' },
    ...(level <= QUIZ_WEAK_LEVEL ? [{ kind: 'difficulty', slug, level: WEAK_DIFFICULTY, value: 'dificil', source: 'quiz' }] : []),
  ]);
}

/** Dúvidas sobre temas do vocabulário citados na pergunta ao tutor. O texto da pergunta NÃO é guardado. */
export function tutorItems(message) {
  return matchTopics(message, MEMORY.SIGNAL_TOPICS_MAX)
    .map((slug) => ({ kind: 'difficulty', slug, level: FIRST_DOUBT, value: 'duvida', source: 'tutor' }));
}
