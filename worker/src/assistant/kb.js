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

import { AI_QUOTAS, MODERATION, ROLES } from '../constants.js';

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
    reply: 'Os eventos da liga ficam na aba Eventos: lá você vê data, local e vagas e faz a sua inscrição com Inscrever-se. O Histórico mostra os eventos já concluídos. Posso te levar até lá.',
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
    reply: 'A aba Aprender reúne os módulos de estudo: Farmacologia (quiz), Toxicologia, Clínica Virtual, Laboratório Virtual e Atlas 3D. Escolha um para abrir. Lá também aparecem seu desempenho por módulo, suas conquistas e o seu crachá virtual.',
    actions: [nav('panel-learn'), mod('lab'), mod('anatomia'), mod('clinica')],
    suggestions: ['Como funciona o laboratório?', 'Atlas 3D'],
  },
  {
    id: 'seguranca',
    title: 'Senha e verificação em duas etapas',
    keywords: ['verificacao em duas etapas', 'duas etapas', 'autenticador', 'autenticacao', 'mfa', '2fa', 'senha', 'seguranca', 'codigo de recuperacao', 'codigos de recuperacao'],
    reply: 'Para proteger a conta, ative a verificação em duas etapas em Meu perfil: você usa um aplicativo autenticador e guarda os códigos de recuperação. Se esqueceu a senha, toque em Esqueci minha senha na tela de entrada.',
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
    keywords: ['perfil', 'foto', 'avatar', 'editar perfil', 'linkedin', 'instagram', 'preferencias', 'tema escuro', 'nome de usuario', 'minhas metricas'],
    reply: 'Em Meu perfil você troca a foto, edita o nome de usuário, o telefone, o LinkedIn, o Instagram, a escolaridade e os assuntos de interesse. Em Preferências, escolhe o tema e se quer receber e-mails de confirmação de inscrição em eventos. O nome completo não pode ser alterado.',
    actions: [nav('panel-profile')],
    suggestions: ['Segurança da conta', 'Meu crachá'],
  },
  {
    id: 'equipe',
    title: 'Equipe e organograma',
    keywords: ['equipe', 'organograma', 'diretoria', 'quem faz parte', 'lideranca', 'coordenacao', 'adicionar amigo', 'pedido de amizade', 'pedidos de amizade', 'denunciar', 'denuncio', 'denunciar alguem'],
    reply: 'A aba Equipe mostra o organograma da liga. Clique numa pessoa para ver o perfil e adicionar. Você também envia pedidos pelo nome de usuário e aceita os que recebe. Para denunciar alguém, abra o perfil da pessoa e use Enviar denúncia. A aba é para membros.',
    actions: [nav('panel-orgchart')],
    suggestions: ['Propostas', 'Mensagens'],
  },
  {
    id: 'propostas',
    title: 'Propostas e votações',
    keywords: ['proposta', 'propostas', 'votar', 'votacao', 'votacoes', 'enquete', 'sugerir', 'enviar proposta', 'minhas propostas'],
    reply: 'Em Propostas você envia uma proposta com título e descrição, acompanha as que enviou (em Minhas propostas) e vota nas que estão com Votação aberta.',
    actions: [nav('panel-proposals')],
    suggestions: ['Equipe'],
  },
  {
    id: 'tarefas',
    title: 'Tarefas',
    keywords: ['tarefa', 'tarefas', 'atividades', 'prazo', 'prazos', 'aderir', 'marcar como concluida'],
    reply: 'Em Tarefas você vê as tarefas publicadas pela liga, com prazo e situação. Clique em Aderir para participar; depois de cumprir a tarefa, marque como concluída. Cada tarefa também tem comentários.',
    actions: [nav('panel-tasks')],
    suggestions: ['Equipe'],
  },
  {
    id: 'mensagens',
    title: 'Mensagens entre membros',
    keywords: ['mensagem', 'mensagens', 'chat', 'conversar', 'conversa', 'falar com'],
    reply: 'Em Mensagens você troca conversas diretas com outras pessoas da liga. Cada conversa é cifrada de ponta a ponta: só você e a outra pessoa conseguem ler o conteúdo.',
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
    id: 'avaliacao_lia',
    title: 'Avaliar uma resposta da Lia',
    keywords: ['avaliar resposta', 'avaliar a resposta', 'avaliar a lia', 'avaliacao da lia', 'resposta da lia', 'resposta util', 'nao util', 'marcar como util', 'resposta incorreta', 'resposta confusa'],
    reply: 'Abaixo de cada resposta da Lia há as opções Útil e Não útil. Ao marcar Não útil, você pode escolher o motivo (incorreta, incompleta, confusa, ofensiva ou outro) e deixar um comentário de até 500 caracteres. O motivo e o comentário são opcionais, e o comentário é apagado após 90 dias.',
    actions: [],
    suggestions: ['Quem vê meus dados?', 'Meu crachá'],
  },
  {
    id: 'redencao',
    title: 'Pedido de redenção na Lia',
    keywords: ['redencao', 'redimir', 'chat suspenso', 'suspenso', 'suspensa', 'suspensao', 'pedir redencao', 'advertencia da lia', 'nivel de moderacao'],
    reply: 'Mensagens ofensivas à Lia geram avisos que sobem de nível. Nos casos mais graves, o chat fica suspenso por ' + MODERATION.SUSPENSION_HOURS + ' horas. Enquanto estiver suspenso, aparece o botão Pedir redenção: explique com sinceridade o que houve, em ' + MODERATION.REDEEM_MIN_CHARS + ' a ' + MODERATION.REDEEM_MAX_CHARS + ' caracteres. Se for aceito, o nível volta a zero. Se for recusado, dá para tentar de novo após ' + MODERATION.REDEEM_RETRY_SECONDS / 3600 + ' hora. Cada pessoa pode ter até ' + MODERATION.REDEEM_ACCEPTED_MAX + ' redenções aceitas em ' + MODERATION.REDEEM_ACCEPTED_WINDOW_DAYS + ' dias.',
    actions: [],
    suggestions: ['Meu crachá', 'Eventos abertos'],
  },
  {
    id: 'cotas',
    title: 'Limite de perguntas da Lia',
    keywords: ['limite de perguntas', 'quantas perguntas', 'perguntas por dia', 'limite diario', 'cota da lia', 'cota de perguntas', 'limite da lia', 'limite de uso'],
    reply: 'Perguntas de rotina (eventos, crachá, módulos e perfil) são respondidas sem IA e sem limite diário. Perguntas abertas usam IA: membros têm ' + AI_QUOTAS.assistant.member + ' por dia, e administradores, ' + AI_QUOTAS.assistant.admin + '. Quando a Lia está em modo limitado, a resposta não gasta essa cota.',
    actions: [],
    suggestions: ['Eventos abertos', 'O que posso fazer aqui?'],
  },
  {
    id: 'feedback_liga',
    title: 'Enviar feedback à administração',
    keywords: ['enviar feedback', 'enviar um feedback', 'envio feedback', 'envio um feedback', 'mandar feedback', 'mando feedback', 'dar feedback', 'deixar feedback', 'feedback para a liga', 'feedback sobre a plataforma', 'sugestao para a plataforma', 'reclamacao sobre a plataforma'],
    reply: 'Para enviar um feedback à administração, abra Meu perfil, vá até a seção Feedback, escreva sua mensagem e clique em Enviar feedback.',
    actions: [nav('panel-profile')],
    suggestions: ['Meu perfil', 'Equipe'],
  },
  {
    id: 'admin_area',
    title: 'Área de administração (botão Admin)',
    adminOnly: true,
    keywords: ['area admin', 'area de administracao', 'area administrativa', 'painel do administrador', 'painel admin', 'botao admin', 'modo admin', 'sou administrador', 'sou admin', 'o que tem no admin'],
    reply: 'O botão Admin, no menu, abre a área de administração, que só existe para administradores. Ela tem Painel (visão geral com gráficos), Usuários, Eventos, Propostas, Tarefas, Feedback, Auditoria, Denúncias, Fiscal e IA. O botão Voltar retorna à área do membro.',
    actions: [nav('panel-admin-dashboard')],
    suggestions: ['Eventos abertos', 'Meu crachá'],
  },
  {
    id: 'admin_usuarios',
    title: 'Usuários: papel, banimento e reativação',
    adminOnly: true,
    keywords: ['gerir usuarios', 'lista de usuarios', 'buscar usuario', 'alterar papel', 'mudar papel', 'mudar o papel', 'banir', 'banir conta', 'banimento', 'reativar conta', 'desbanir'],
    reply: 'Em Usuários, na área Admin, você busca uma pessoa e altera o papel dela entre Visitante, Membro e Administrador. Banir conta revoga todas as sessões ativas da pessoa; Reativar conta devolve o acesso. Cada ação pede confirmação.',
    actions: [nav('panel-admin-users')],
    suggestions: ['Eventos abertos', 'O que posso fazer aqui?'],
  },
  {
    id: 'admin_eventos',
    title: 'Criar eventos (administração)',
    adminOnly: true,
    weight: 1.5,
    keywords: ['criar evento', 'criar eventos', 'criar um evento', 'crio evento', 'crio um evento', 'novo evento', 'cadastrar evento', 'gerir evento', 'gerir eventos'],
    reply: 'Em Eventos, na área Admin, o formulário Novo evento pede título, descrição, data e visibilidade: Pública, Autenticados ou Somente membros. Local e capacidade são opcionais. Abaixo do formulário fica a lista dos eventos já criados.',
    actions: [nav('panel-admin-events')],
    suggestions: ['Eventos abertos', 'Propostas'],
  },
  {
    id: 'admin_propostas',
    title: 'Aprovar propostas e abrir votação',
    adminOnly: true,
    weight: 1.5,
    keywords: ['aprovar proposta', 'aprovar propostas', 'aprovar uma proposta', 'aprovo uma proposta', 'aprovo proposta', 'rejeitar proposta', 'rejeitar uma proposta', 'abrir votacao', 'abrir a votacao', 'abro a votacao', 'encerrar votacao', 'encerrar a votacao', 'fechar votacao', 'fechar a votacao', 'fecho a votacao', 'gerir propostas', 'resultado da votacao', 'resultados da votacao', 'propostas em analise', 'analisar proposta'],
    reply: 'Em Propostas, na área Admin, a proposta enviada por um membro chega para análise: você aprova ou rejeita. Aprovada, define o início e o fim da votação e clica em Abrir votação. Depois, Encerrar votação. Ver resultados mostra os votos Sim e Não e os comentários.',
    actions: [nav('panel-admin-proposals')],
    suggestions: ['Propostas', 'Equipe'],
  },
  {
    id: 'admin_tarefas',
    title: 'Criar e publicar tarefas (administração)',
    adminOnly: true,
    weight: 1.5,
    keywords: ['criar tarefa', 'criar uma tarefa', 'crio tarefa', 'crio uma tarefa', 'nova tarefa', 'publicar tarefa', 'gerir tarefas', 'gerir tarefa', 'arquivar tarefa'],
    reply: 'Em Tarefas, na área Admin, a nova tarefa pede título, descrição e prazo (opcional) e começa como rascunho. Para publicá-la, escolha Publicada e clique em Atualizar status. Uma tarefa publicada pode ser marcada como concluída ou arquivada.',
    actions: [nav('panel-admin-tasks')],
    suggestions: ['Tarefas', 'Eventos abertos'],
  },
  {
    id: 'admin_fiscal',
    title: 'Terminal fiscal e presença (administração)',
    adminOnly: true,
    weight: 1.5,
    keywords: ['terminal fiscal', 'presenca manual', 'lista de presenca', 'exportar csv', 'csv', 'leitor de qr', 'check in por qr', 'checkin por qr'],
    reply: 'O Terminal fiscal, na área Admin, registra a presença nos eventos por QR Code do crachá, por presença manual ou pela lista. Também há exportação em CSV e crachás.',
    actions: [nav('panel-admin-fiscal')],
    suggestions: ['Meu crachá', 'Eventos abertos'],
  },
  {
    id: 'admin_ia',
    title: 'Painel de IA e moderação da Lia (administração)',
    adminOnly: true,
    keywords: ['painel de ia', 'painel da ia', 'saude das chaves', 'testar chaves', 'chaves do groq', 'orcamento de tokens', 'consumo de ia', 'satisfacao da lia', 'moderacao da lia', 'incidentes da lia', 'cotas diarias', 'acervo da clinica', 'casos gerados', 'revisar casos'],
    reply: 'O Painel de IA, na área Admin, mostra a saúde das chaves do provedor (com Testar chaves agora), o orçamento e o consumo de tokens, o uso anônimo do Atlas 3D, a satisfação da Lia, a moderação da Lia (incidentes e taxa de redenção) e as cotas diárias por pessoa. Casos clínicos gerados com IA entram no acervo da clínica só depois de aprovados nesse painel.',
    actions: [nav('panel-admin-ai')],
    suggestions: ['Meu crachá', 'Eventos abertos'],
  },
  {
    id: 'admin_auditoria',
    title: 'Auditoria e logs técnicos (administração)',
    adminOnly: true,
    keywords: ['auditoria', 'logs tecnicos', 'log tecnico', 'registro de atividades', 'historico de acoes', 'atividade administrativa'],
    reply: 'Em Auditoria, na área Admin, você filtra as atividades por tipo e por resultado (sucesso ou falha) e clica em Filtrar. Os Logs técnicos ficam na mesma tela.',
    actions: [nav('panel-admin-audit')],
    suggestions: ['Eventos abertos', 'Meu crachá'],
  },
  {
    id: 'admin_denuncias',
    title: 'Denúncias: análise e resolução (administração)',
    adminOnly: true,
    keywords: ['denuncias', 'denuncia', 'resolver denuncia', 'arquivar denuncia', 'nota de resolucao', 'denuncias abertas', 'denuncia em analise'],
    reply: 'Em Denúncias, na área Admin, você filtra por status (abertas, em análise, resolvidas ou arquivadas) e vê quem denunciou e quem foi denunciado. Para resolver, escolha o novo status, escreva uma nota de resolução (opcional) e clique em Atualizar.',
    actions: [nav('panel-admin-reports')],
    suggestions: ['Meu perfil', 'Equipe'],
  },
  {
    id: 'admin_feedback',
    title: 'Feedback recebido da liga (administração)',
    adminOnly: true,
    keywords: ['feedback recebido', 'feedbacks recebidos', 'ver feedback', 'ler feedback', 'feedback dos membros', 'feedback da liga'],
    reply: 'Em Feedback, na área Admin, você lê as mensagens que os membros enviaram pelo Meu perfil. Cada uma mostra o autor, ou Anônimo quando o nome não aparece.',
    actions: [nav('panel-admin-feedback')],
    suggestions: ['Eventos abertos', 'Meu crachá'],
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

/**
 * Intenções que o papel pode receber. Só o admin enxerga as de administração; para quem não é admin
 * (visitante, membro ou sem papel) elas não existem: não acertam nem como seguimento de conversa.
 */
function intentsFor(role) {
  return role === ROLES.ADMIN ? INTENTS : PUBLIC_INTENTS;
}

function bestIntent(text, intents) {
  const padded = ' ' + normalize(text) + ' ';
  let best = null;
  for (const intent of intents) {
    const score = scoreOf(intent, padded);
    if (score > 0 && (!best || score > best.score)) best = { id: intent.id, score, intent };
  }
  return best;
}

/**
 * Acha a intenção da mensagem. `history` é a lista de perguntas ANTERIORES da
 * pessoa ([{role:'user', text}]); só é usada para pergunta curta sem palavra-chave.
 * `role` é o papel de quem pergunta: só 'admin' pode acertar as intenções de administração.
 * @returns {{id: string, score: number, intent: object, followUp?: boolean} | null}
 */
export function matchIntent(message, history, role) {
  const intents = intentsFor(role);
  const direct = bestIntent(message, intents);
  if (direct) return direct;
  const text = normalize(message);
  if (!text || text.length > FOLLOW_UP_MAX_CHARS || !FOLLOW_UP_START.test(text) || !Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const previous = history[i] && history[i].role === 'user' ? bestIntent(history[i].text, intents) : null;
    if (previous && previous.id !== 'saudacao') return Object.assign({}, previous, { followUp: true });
  }
  return null;
}

// Intenções de uso geral: só estas entram no prompt da IA e no acervo (RAG), que são compartilhados por
// todos os papéis. As de administração (adminOnly) respondem só pelas regras, com botão só para admin.
export const PUBLIC_INTENTS = INTENTS.filter((intent) => !intent.adminOnly);

const OUTLINE_REPLY_MAX = 70; // 2.331 caracteres com as 22 intenções de uso geral (teto do teste: 2.500)

/** Resumo curto das intenções para o prompt da IA (sem dado de ninguém). */
export function kbOutline() {
  return PUBLIC_INTENTS
    .map((i) => '- ' + i.id + ': ' + i.title + '. ' + i.reply.split('. ')[0].slice(0, OUTLINE_REPLY_MAX))
    .join('\n');
}
