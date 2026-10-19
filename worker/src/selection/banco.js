/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * selection/banco.js
 * Banco de questões do processo seletivo (docs/planos/PROCESSO-SELETIVO.md, seção 4). VERSÃO v1, RASCUNHO para a
 * comissão revisar: mudar uma questão é um commit; cada inscrição guarda a versão que respondeu (BANK_VERSION).
 *
 * Princípios (referências em docs/planos/PROCESSO-SELETIVO.md):
 *   - objetivas e cenários de conduta são SINAL DE APOIO para a comissão; nenhum número vira corte aqui;
 *   - cenários de conduta curtos e específicos (boas práticas de testes de julgamento situacional);
 *   - o GABARITO nunca sai do servidor: o candidato só recebe `publicQuiz` (sem `answer`, `best` e `worst`).
 *
 * Puro: sem banco, sem rede. O sorteio é determinístico pela semente da inscrição (mesma pessoa, mesma prova).
 */

export const BANK_VERSION = 'v1';
export const OBJECTIVE_COUNT = 10;
export const CONDUCT_COUNT = 5;

export const COURSES = Object.freeze([
  'Farmácia', 'Biomedicina', 'Medicina', 'Enfermagem', 'Nutrição', 'Odontologia', 'Fisioterapia', 'Psicologia',
  'Educação Física', 'Biologia', 'Química', 'Outro curso da saúde ou correlato',
]);

export const AREAS = Object.freeze([
  'Farmacologia clínica', 'Toxicologia', 'Farmacotécnica e manipulação', 'Pesquisa e evidências',
  'Extensão e educação em saúde', 'Comunicação e redes', 'Organização e eventos',
]);

export const DAYS = Object.freeze(['seg', 'ter', 'qua', 'qui', 'sex', 'sab']);
export const SHIFTS = Object.freeze(['manha', 'tarde', 'noite']);
export const SEMESTERS = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'concluido']);

/** Análise de cenário (edital, seção 6). Limites em caracteres do texto limpo. */
export const SCENARIO = Object.freeze({
  prompt: 'Escolha UM destes pontos de partida e escreva sua análise: um mecanismo farmacológico, uma evidência científica consolidada, uma notícia regulatória ou clínica recente, ou uma linha de pesquisa atual. Explique por que escolheu e qual o impacto na saúde, na pesquisa ou na prática clínica.',
  hints: Object.freeze([
    'Diga em uma frase o que você escolheu.',
    'Cite de onde vem a informação (artigo, diretriz, órgão regulador).',
    'Explique o impacto com suas palavras, sem copiar trechos.',
    'Não escreva dados de saúde, seus ou de terceiros.',
  ]),
  minChars: 400,
  maxChars: 2000,
});

const opt = (id, text) => Object.freeze({ id, text });

/** Objetivas: `answer` é o id da alternativa correta. */
export const OBJECTIVES = Object.freeze([
  { id: 'o01', area: 'Farmacocinética', stem: 'A farmacocinética estuda:', options: [opt('a', 'o que o fármaco faz no organismo'), opt('b', 'o que o organismo faz com o fármaco: absorção, distribuição, metabolismo e excreção'), opt('c', 'apenas os efeitos adversos do fármaco'), opt('d', 'a produção industrial do fármaco')], answer: 'b' },
  { id: 'o02', area: 'Farmacocinética', stem: 'Biodisponibilidade é:', options: [opt('a', 'a fração da dose administrada que chega inalterada à circulação sistêmica'), opt('b', 'o tempo de duração do efeito do fármaco'), opt('c', 'a quantidade de fármaco eliminada na urina'), opt('d', 'a afinidade do fármaco pelo receptor')], answer: 'a' },
  { id: 'o04', area: 'Farmacocinética', stem: 'O efeito de primeira passagem hepático faz com que um fármaco administrado por via oral:', options: [opt('a', 'tenha biodisponibilidade reduzida, por ser metabolizado antes de chegar à circulação sistêmica'), opt('b', 'seja absorvido mais rápido'), opt('c', 'deixe de se ligar a proteínas'), opt('d', 'seja eliminado apenas pelos pulmões')], answer: 'a' },
  { id: 'o05', area: 'Farmacodinâmica', stem: 'Um antagonista competitivo de receptor:', options: [opt('a', 'ativa o receptor com mais força que o agonista'), opt('b', 'liga-se ao receptor sem ativá-lo, e seu efeito pode ser superado com mais agonista'), opt('c', 'destrói o receptor de forma permanente'), opt('d', 'só atua fora das células')], answer: 'b' },
  { id: 'o06', area: 'Farmacodinâmica', stem: 'Um fármaco de janela terapêutica estreita exige:', options: [opt('a', 'doses sempre maiores que as habituais'), opt('b', 'nenhum acompanhamento, pois é seguro'), opt('c', 'monitorização cuidadosa, porque a dose eficaz está próxima da tóxica'), opt('d', 'uso apenas em jejum')], answer: 'c' },
  { id: 'o07', area: 'Interações', stem: 'A rifampicina, indutora de enzimas do citocromo P450, tende a:', options: [opt('a', 'aumentar a concentração de fármacos metabolizados por essas enzimas'), opt('b', 'reduzir a concentração de fármacos metabolizados por essas enzimas'), opt('c', 'não alterar nenhum outro fármaco'), opt('d', 'bloquear a absorção de todos os alimentos')], answer: 'b' },
  { id: 'o09', area: 'Toxicologia', stem: 'O antídoto específico para a intoxicação por opioides (depressão respiratória) é:', options: [opt('a', 'flumazenil'), opt('b', 'atropina'), opt('c', 'naloxona'), opt('d', 'N-acetilcisteína')], answer: 'c' },
  { id: 'o10', area: 'Toxicologia', stem: 'Na intoxicação por paracetamol, o antídoto que protege o fígado é:', options: [opt('a', 'N-acetilcisteína'), opt('b', 'naloxona'), opt('c', 'protamina'), opt('d', 'vitamina K')], answer: 'a' },
  { id: 'o14', area: 'Evidências', stem: 'Para avaliar a eficácia de um tratamento, qual destas fontes oferece, em geral, o MAIOR nível de evidência?', options: [opt('a', 'um relato de caso'), opt('b', 'a opinião de um especialista'), opt('c', 'uma revisão sistemática de ensaios clínicos randomizados'), opt('d', 'uma série de casos sem grupo de comparação')], answer: 'c' },
  { id: 'o16', area: 'Farmacocinética', stem: 'Em uma pessoa com a função renal bastante reduzida, um fármaco de eliminação predominantemente renal:', options: [opt('a', 'deixa de precisar de qualquer ajuste'), opt('b', 'tende a acumular, e a dose ou o intervalo costumam ser ajustados'), opt('c', 'é eliminado mais rápido'), opt('d', 'passa a ser eliminado apenas pelo suor')], answer: 'b' },
]);

/** Conduta e ética: o candidato escolhe a MELHOR e a PIOR atitude e justifica em uma frase. */
export const CONDUCT = Object.freeze([
  { id: 'c01', title: 'Prazo em risco', situation: 'Você assumiu uma tarefa que vence na sexta. Na quarta, percebe que não vai conseguir terminar com qualidade.', options: [opt('a', 'Avisar a coordenação agora, mostrar o que já está pronto e propor um novo prazo ou ajuda'), opt('b', 'Entregar na sexta o que der, sem avisar que está incompleto'), opt('c', 'Esperar a sexta chegar para ver se alguém cobra'), opt('d', 'Passar a tarefa para um colega sem combinar')], best: 'a', worst: 'b' },
  { id: 'c02', title: 'Dados de participantes', situation: 'Um colega publica no grupo da turma o nome e a condição de saúde de uma pessoa atendida em um projeto da liga.', options: [opt('a', 'Comentar a publicação e compartilhar com outros amigos'), opt('b', 'Ignorar, porque não foi você que publicou'), opt('c', 'Pedir com discrição que ele apague e avisar a coordenação do projeto'), opt('d', 'Apagar a conversa do seu celular e não falar nada')], best: 'c', worst: 'a' },
  { id: 'c03', title: 'Dado incorreto na reunião', situation: 'Em uma reunião, um colega apresenta um dado que você acredita estar errado.', options: [opt('a', 'Corrigir em voz alta, com ironia, para todos ouvirem'), opt('b', 'Perguntar de forma respeitosa qual é a fonte e propor conferirem juntos depois'), opt('c', 'Concordar com tudo para evitar conflito'), opt('d', 'Contar para os outros membros depois da reunião, sem falar com o colega')], best: 'b', worst: 'a' },
  { id: 'c04', title: 'Imagem da liga', situation: 'Você ficou irritado com uma decisão de um professor e quer desabafar em uma rede social, mencionando a liga.', options: [opt('a', 'Publicar o desabafo marcando a liga e a instituição'), opt('b', 'Levar a crítica à coordenação, pelo canal próprio, sem expor ninguém'), opt('c', 'Publicar em um perfil anônimo'), opt('d', 'Pedir aos colegas que publiquem por você')], best: 'b', worst: 'a' },
  { id: 'c06', title: 'Ferramentas de IA', situation: 'Você precisa resumir um artigo científico e pensa em usar uma ferramenta de inteligência artificial.', options: [opt('a', 'Colar o texto gerado e entregar como seu, sem ler o artigo'), opt('b', 'Usar como apoio, conferir tudo no artigo original e informar o uso à equipe'), opt('c', 'Não usar nada, nem para entender o vocabulário'), opt('d', 'Pedir à ferramenta que invente as referências para completar o resumo')], best: 'b', worst: 'd' },
]);

// ---------- Sorteio determinístico (mesma semente, mesma prova) ----------

/** PRNG pequeno e rápido (mulberry32). Não é criptográfico: serve só para variar a prova entre pessoas. */
export function seededRandom(seed) {
  let t = (Number(seed) >>> 0) || 1;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Embaralha uma cópia (Fisher-Yates) com o gerador dado. */
export function shuffled(list, random) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Ids sorteados para esta semente: { objectives: [ids], conduct: [ids], order: { id: [optionIds] } }. */
export function pickForSeed(seed) {
  const random = seededRandom(seed);
  const objectives = shuffled(OBJECTIVES, random).slice(0, OBJECTIVE_COUNT);
  const conduct = shuffled(CONDUCT, random).slice(0, CONDUCT_COUNT);
  const order = {};
  [...objectives, ...conduct].forEach((q) => { order[q.id] = shuffled(q.options, random).map((o) => o.id); });
  return { objectives: objectives.map((q) => q.id), conduct: conduct.map((q) => q.id), order };
}

const byId = (list) => new Map(list.map((q) => [q.id, q]));
const OBJECTIVE_BY_ID = byId(OBJECTIVES);
const CONDUCT_BY_ID = byId(CONDUCT);

export const objectiveById = (id) => OBJECTIVE_BY_ID.get(id) || null;
export const conductById = (id) => CONDUCT_BY_ID.get(id) || null;

function orderedOptions(question, order) {
  const byOption = new Map(question.options.map((o) => [o.id, o]));
  return (order[question.id] || question.options.map((o) => o.id)).map((id) => byOption.get(id)).filter(Boolean);
}

/** A prova que o candidato VÊ: sem gabarito. */
export function publicQuiz(seed) {
  const pick = pickForSeed(seed);
  return {
    version: BANK_VERSION,
    objectives: pick.objectives.map((id) => {
      const q = OBJECTIVE_BY_ID.get(id);
      return { id: q.id, area: q.area, stem: q.stem, options: orderedOptions(q, pick.order).map((o) => ({ id: o.id, text: o.text })) };
    }),
    conduct: pick.conduct.map((id) => {
      const q = CONDUCT_BY_ID.get(id);
      return { id: q.id, title: q.title, situation: q.situation, options: orderedOptions(q, pick.order).map((o) => ({ id: o.id, text: o.text })) };
    }),
  };
}

/** Correção das objetivas: { correct, total, byArea }. Respostas fora da prova sorteada são ignoradas. */
export function gradeObjectives(seed, answers) {
  const pick = pickForSeed(seed);
  const given = answers && typeof answers === 'object' ? answers : {};
  let correct = 0;
  const byArea = {};
  pick.objectives.forEach((id) => {
    const q = OBJECTIVE_BY_ID.get(id);
    const ok = given[id] === q.answer;
    if (ok) correct += 1;
    const slot = byArea[q.area] || { correct: 0, total: 0 };
    slot.total += 1;
    if (ok) slot.correct += 1;
    byArea[q.area] = slot;
  });
  return { correct, total: pick.objectives.length, byArea };
}

/** Conduta: +1 por "melhor" acertada, +1 por "pior" acertada (0 a 2 por cenário). Só sinal de apoio. */
export function gradeConduct(seed, answers) {
  const pick = pickForSeed(seed);
  const given = answers && typeof answers === 'object' ? answers : {};
  let points = 0;
  pick.conduct.forEach((id) => {
    const q = CONDUCT_BY_ID.get(id);
    const a = given[id] && typeof given[id] === 'object' ? given[id] : {};
    if (a.best === q.best) points += 1;
    if (a.worst === q.worst) points += 1;
  });
  return { points, max: pick.conduct.length * 2 };
}
