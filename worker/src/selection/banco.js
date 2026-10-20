/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * selection/banco.js
 * Conteúdo do processo seletivo (docs/planos/PROCESSO-SELETIVO.md, seção 4). VERSÃO v2: sem questões objetivas, no
 * mesmo espírito do formulário que a liga já usava: perfil e disponibilidade, projeto, análise de cenário e perguntas
 * abertas que mostram COMO a pessoa pensa. Mudar uma pergunta é um commit; cada inscrição guarda a versão que respondeu.
 *
 * Não há gabarito nem nota: a comissão lê as respostas (com o resumo opcional da triagem por IA, que nunca decide).
 * Puro: sem banco, sem rede.
 */

export const BANK_VERSION = 'v2';

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
  minChars: 1,
  maxChars: 2000,
});

/** Perguntas abertas sobre a forma de pensar (a primeira é o "projeto de foco científico" do formulário antigo). */
export const THINKING = Object.freeze([
  { id: 't01', title: 'Seu projeto na liga', prompt: 'Se você pudesse coordenar uma atividade na LAIFT hoje (palestra, simpósio, linha de pesquisa ou ação social), qual seria o tema central e o principal objetivo?', min: 1, max: 800 },
  { id: 't02', title: 'Informação duvidosa', prompt: 'Está circulando a afirmação de que "esta planta substitui o remédio X". O que você faz antes de repassar ou contestar? Descreva seus passos.', min: 1, max: 800 },
  { id: 't03', title: 'Aprender sozinho(a)', prompt: 'Conte uma vez em que você precisou aprender um assunto difícil por conta própria. Como organizou o estudo e o que fez quando travou?', min: 1, max: 800 },
  { id: 't04', title: 'Limite do que você sabe', prompt: 'Em um projeto da liga, você percebe que não sabe o suficiente para executar a sua parte. Como você age e a quem recorre?', min: 1, max: 800 },
]);

/** Situações de conduta: resposta curta em texto, "o que eu faria e por quê". */
export const CONDUCT = Object.freeze([
  { id: 'c01', title: 'Prazo em risco', situation: 'Você assumiu uma tarefa que vence na sexta. Na quarta, percebe que não vai conseguir terminar com qualidade.', min: 1, max: 500 },
  { id: 'c02', title: 'Dados de participantes', situation: 'Um colega publica no grupo da turma o nome e a condição de saúde de uma pessoa atendida em um projeto da liga.', min: 1, max: 500 },
  { id: 'c03', title: 'Ferramentas de IA', situation: 'Você precisa resumir um artigo científico e pensa em usar uma ferramenta de inteligência artificial.', min: 1, max: 500 },
]);

const byId = (list) => new Map(list.map((q) => [q.id, q]));
const THINKING_BY_ID = byId(THINKING);
const CONDUCT_BY_ID = byId(CONDUCT);

export const thinkingById = (id) => THINKING_BY_ID.get(id) || null;
export const conductById = (id) => CONDUCT_BY_ID.get(id) || null;
