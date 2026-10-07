/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/kb.js
 * Base de conhecimento da Lia, guia da plataforma. Texto fixo e regras de
 * intenção por palavra-chave: responde a maioria das perguntas SEM gastar IA.
 *
 * - Cada intenção tem palavras-chave (comparadas sem acento, por palavra
 *   inteira), uma resposta curta em texto puro, ações (botões) e sugestões.
 * - As ações aqui são só CANDIDATAS: quem as entrega é targets.js, que filtra
 *   pela lista branca e pelo papel de quem perguntou.
 * - Nada aqui contém dado de pessoa alguma.
 */

/** Minúsculas, sem acento, só letras/números e espaço simples. */
export function normalize(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const nav = (target) => ({ type: 'navigate', target });
const mod = (target) => ({ type: 'open_module', target });

// weight < 1: intenções genéricas perdem para as específicas quando a frase tem as duas.
export const INTENTS = [
  {
    id: 'eventos',
    title: 'Eventos da liga',
    keywords: ['evento', 'eventos', 'inscrever', 'inscricao', 'inscricoes', 'inscrito', 'congresso', 'palestra', 'workshop', 'agenda de eventos', 'vagas', 'proximo encontro', 'me inscrevo', 'me inscrevi'],
    reply: 'Os eventos da liga ficam na aba Eventos: lá você vê data, local e vagas e faz a sua inscrição. Posso te levar até lá.',
    actions: [nav('panel-events'), { type: 'open_credential', target: 'credential' }],
    suggestions: ['Meu crachá', 'Módulos de estudo'],
  },
  {
    id: 'credencial',
    title: 'Crachá virtual e QR de presença',
    keywords: ['cracha', 'credencial', 'qr', 'qr code', 'qrcode', 'portaria', 'presenca', 'check in', 'checkin', 'carteirinha'],
    reply: 'Seu crachá virtual mostra seu nome, seu papel na liga e um QR Code de presença. Na portaria do evento, mostre o QR para o fiscal ler. Dá para ampliar o QR e salvar a imagem do crachá.',
    actions: [{ type: 'open_credential', target: 'credential' }, nav('panel-events')],
    suggestions: ['Eventos abertos'],
  },
  {
    id: 'laboratorio',
    title: 'Laboratório Virtual e Estúdio 3D',
    keywords: ['laboratorio', 'lab', 'estudio', 'estudio 3d', 'estudio visual', 'estudio molecular', 'bancada', 'molecula', 'moleculas', 'sintese', 'preceptor', 'reagente', 'reagentes', 'farmacotecnica', 'modelagem molecular'],
    reply: 'O Laboratório Virtual é uma bancada de ensino: você monta experimentos, vê reagentes, sínteses e biossegurança e tira dúvidas com o preceptor de IA. Dentro dele fica o Estúdio 3D, onde você modela e visualiza moléculas em três dimensões. Posso abrir o módulo para você começar.',
    actions: [mod('lab'), mod('anatomia')],
    suggestions: ['Atlas 3D', 'Casos clínicos'],
  },
  {
    id: 'atlas',
    title: 'Atlas 3D de anatomia e farmacocinética',
    keywords: ['atlas', 'anatomia', '3d', 'modelo 3d', 'farmacocinetica', 'corpo humano', 'orgaos'],
    reply: 'O Atlas 3D mostra a anatomia em modelos tridimensionais e a farmacocinética: você gira, aproxima e consulta a ficha de cada estrutura. Abro o módulo para você?',
    actions: [mod('anatomia'), mod('lab')],
    suggestions: ['Laboratório virtual'],
  },
  {
    id: 'farmacologia',
    title: 'Farmacologia Básica (quiz)',
    keywords: ['farmacologia', 'quiz', 'quizes', 'questoes', 'simulado', 'farmacos', 'medicamentos', 'mecanismo de acao'],
    reply: 'O módulo de Farmacologia Básica traz quizzes para treinar mecanismos de ação e classes de fármacos, e seu progresso fica salvo. Quer abrir?',
    actions: [mod('farmaco'), mod('toxico')],
    suggestions: ['Toxicologia', 'Casos clínicos'],
  },
  {
    id: 'toxicologia',
    title: 'Toxicologia Clínica e Forense',
    keywords: ['toxicologia', 'toxico', 'intoxicacao', 'intoxicacoes', 'veneno', 'forense', 'antidoto', 'overdose'],
    reply: 'Toxicologia Clínica e Forense reúne casos e questões sobre intoxicações, antídotos e análise forense. Posso abrir o módulo.',
    actions: [mod('toxico'), mod('farmaco')],
    suggestions: ['Farmacologia', 'Casos clínicos'],
  },
  {
    id: 'clinica',
    title: 'Clínica Médica Virtual (OSCE)',
    keywords: ['caso clinico', 'casos clinicos', 'osce', 'paciente virtual', 'clinica medica', 'anamnese', 'simulacao clinica', 'atendimento clinico', 'clinica virtual'],
    reply: 'A Clínica Médica Virtual simula atendimentos: você conversa com o paciente virtual, decide condutas e recebe a avaliação do preceptor. É um treino educacional, não substitui atendimento real.',
    actions: [mod('clinica'), mod('toxico')],
    suggestions: ['Laboratório virtual', 'Atlas 3D'],
  },
  {
    id: 'aprender',
    title: 'Aba Aprender (todos os módulos)',
    keywords: ['aprender', 'modulo', 'modulos', 'estudar', 'estudos', 'conteudo', 'conteudos', 'cursos', 'trilha'],
    reply: 'A aba Aprender reúne os módulos de estudo: Farmacologia (quiz), Toxicologia, Clínica Virtual, Laboratório Virtual e Atlas 3D. Escolha um para abrir.',
    actions: [nav('panel-learn'), mod('lab'), mod('anatomia'), mod('clinica')],
    suggestions: ['Como funciona o laboratório?', 'Atlas 3D'],
  },
  {
    id: 'seguranca',
    title: 'Senha e verificação em duas etapas',
    keywords: ['verificacao em duas etapas', 'duas etapas', 'autenticador', 'autenticacao', 'mfa', '2fa', 'senha', 'seguranca', 'codigo de recuperacao', 'codigos de recuperacao'],
    reply: 'Para proteger a conta, ative a verificação em duas etapas em Meu perfil: você usa um aplicativo autenticador e guarda os códigos de recuperação. Se esqueceu a senha, use a opção de redefinir na tela de entrada.',
    actions: [nav('panel-profile')],
    suggestions: ['Quem vê meus dados?'],
  },
  {
    id: 'privacidade',
    title: 'Privacidade dos dados',
    keywords: ['meus dados', 'dados pessoais', 'privacidade', 'lgpd', 'quem ve', 'quem pode ver', 'informacoes pessoais', 'termos de uso'],
    reply: 'Os dados privados da sua conta, como e-mail, telefone e presenças, são vistos só por você e pela administração autorizada. Mudanças no sistema são feitas apenas por administradores e ficam registradas. Os detalhes estão nos Termos e na Política de Privacidade.',
    actions: [nav('panel-profile')],
    suggestions: ['Segurança da conta'],
  },
  {
    id: 'perfil',
    title: 'Meu perfil e preferências',
    keywords: ['perfil', 'foto', 'avatar', 'editar perfil', 'linkedin', 'instagram', 'preferencias', 'tema escuro'],
    reply: 'Em Meu perfil você edita foto, nome, contatos e preferências, como o tema e os avisos por e-mail, e cuida da segurança da conta.',
    actions: [nav('panel-profile')],
    suggestions: ['Segurança da conta', 'Meu crachá'],
  },
  {
    id: 'equipe',
    title: 'Equipe e organograma',
    keywords: ['equipe', 'organograma', 'diretoria', 'quem faz parte', 'lideranca', 'coordenacao'],
    reply: 'A aba Equipe mostra o organograma da liga, com diretorias e posições. Ela está disponível para membros.',
    actions: [nav('panel-orgchart')],
    suggestions: ['Propostas', 'Mensagens'],
  },
  {
    id: 'propostas',
    title: 'Propostas e votações',
    keywords: ['proposta', 'propostas', 'votar', 'votacao', 'votacoes', 'enquete', 'sugerir'],
    reply: 'Em Propostas você acompanha as propostas da liga e vota nas que estão abertas.',
    actions: [nav('panel-proposals')],
    suggestions: ['Equipe'],
  },
  {
    id: 'tarefas',
    title: 'Tarefas',
    keywords: ['tarefa', 'tarefas', 'atividades', 'prazo', 'prazos'],
    reply: 'Em Tarefas, disponível para membros, você vê o que foi atribuído a você, com prazo e situação.',
    actions: [nav('panel-tasks')],
    suggestions: ['Equipe'],
  },
  {
    id: 'mensagens',
    title: 'Mensagens entre membros',
    keywords: ['mensagem', 'mensagens', 'chat', 'conversar', 'conversa', 'falar com'],
    reply: 'Em Mensagens, disponível para membros, você troca conversas diretas com outras pessoas da liga.',
    actions: [nav('panel-messages')],
    suggestions: ['Equipe'],
  },
  {
    id: 'cadastro',
    title: 'Como criar a conta',
    keywords: ['cadastro', 'cadastrar', 'me cadastro', 'criar conta', 'criar uma conta', 'registrar', 'registro', 'entrar na liga', 'participar da liga', 'virar membro', 'ser membro'],
    reply: 'Para entrar na plataforma, crie sua conta na tela inicial (opção de cadastro), confirme o e-mail e faça o login. Depois disso você já pode explorar os módulos de estudo e os eventos.',
    actions: [],
    suggestions: ['O que posso fazer aqui?'],
  },
  {
    id: 'ajuda',
    title: 'O que a Lia faz',
    weight: 0.7,
    keywords: ['ajuda', 'ajudar', 'socorro', 'duvida', 'como usar', 'como usa', 'nao sei', 'o que voce faz', 'o que voce pode', 'como funciona a plataforma', 'tutorial', 'guia', 'o que posso fazer', 'o que da para fazer'],
    reply: 'Eu te ajudo a encontrar eventos, abrir os módulos de estudo (laboratório, atlas 3D, quiz, casos clínicos), mostrar seu crachá e entender perfil e segurança. Pergunte do seu jeito, por exemplo: "como funciona o laboratório?".',
    actions: [nav('panel-learn')],
    suggestions: ['Eventos abertos', 'Módulos de estudo', 'Meu crachá'],
  },
  {
    id: 'saudacao',
    title: 'Saudação',
    weight: 0.5,
    keywords: ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'opa', 'tudo bem'],
    reply: 'Oi! Eu sou a Lia, a guia da plataforma LAIFT. Posso te explicar cada parte e te levar direto para a tela certa. O que você quer fazer agora?',
    actions: [],
    suggestions: ['Eventos abertos', 'Como funciona o laboratório?', 'Meu crachá'],
  },
];

export const DEFAULT_SUGGESTIONS = ['Eventos abertos', 'Módulos de estudo', 'Meu crachá', 'Como funciona o laboratório?'];

// Pergunta curta (até este tamanho, já normalizada) sem palavra-chave só vale como seguimento da anterior
// se COMEÇA como uma continuação ("e a data?", "onde fica?"); "obrigado", "tchau" ou "quem é você?" não.
const FOLLOW_UP_MAX_CHARS = 25;
const FOLLOW_UP_START = /^(e|qual|quais|quando|onde|quanto|quantos|quantas|como|tem|ha|pode|quero|me|abre|abrir|mostra|mostrar)\b/;

function scoreOf(intent, padded) {
  let hits = 0;
  for (const kw of intent.keywords) {
    if (padded.includes(' ' + kw + ' ')) hits += 1;
  }
  return hits * (intent.weight || 1);
}

function bestIntent(text) {
  const padded = ' ' + normalize(text) + ' ';
  let best = null;
  for (const intent of INTENTS) {
    const score = scoreOf(intent, padded);
    if (score > 0 && (!best || score > best.score)) best = { id: intent.id, score, intent };
  }
  return best;
}

/**
 * Acha a intenção da mensagem. `history` é a lista de perguntas ANTERIORES da
 * pessoa ([{role:'user', text}]); só é usada para pergunta curta sem palavra-chave.
 * @returns {{id: string, score: number, intent: object, followUp?: boolean} | null}
 */
export function matchIntent(message, history) {
  const direct = bestIntent(message);
  if (direct) return direct;
  const text = normalize(message);
  if (!text || text.length > FOLLOW_UP_MAX_CHARS || !FOLLOW_UP_START.test(text) || !Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const previous = history[i] && history[i].role === 'user' ? bestIntent(history[i].text) : null;
    if (previous && previous.id !== 'saudacao') return Object.assign({}, previous, { followUp: true });
  }
  return null;
}

/** Resumo curto das intenções para o prompt da IA (sem dado de ninguém). */
export function kbOutline() {
  return INTENTS
    .map((i) => '- ' + i.id + ': ' + i.title + '. ' + i.reply.split('. ')[0].slice(0, 110))
    .join('\n');
}
