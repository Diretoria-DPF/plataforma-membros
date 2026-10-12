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
    defines: true, // lista ou define de fato: responde também a pergunta de definição (assistant/questionKind.js)
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
    defines: true, // lista ou define de fato: responde também a pergunta de definição (assistant/questionKind.js)
    title: 'Aba Aprender (todos os módulos)',
    keywords: ['aprender', 'modulo', 'modulos', 'estudar', 'estudos', 'conteudo', 'conteudos', 'cursos', 'trilha'],
    reply: 'A aba Aprender reúne os módulos de estudo: Farmacologia (quiz), Toxicologia, Clínica Virtual, Laboratório Virtual e Atlas 3D. Escolha um para abrir. Lá também aparecem seu desempenho por módulo, suas conquistas e o seu crachá virtual.',
    actions: [nav('panel-learn'), mod('lab'), mod('anatomia'), mod('clinica')],
    suggestions: ['Como funciona o laboratório?', 'Atlas 3D'],
  },
  {
    id: 'seguranca',
    title: 'Senha e verificação em duas etapas',
    keywords: ['verificacao em duas etapas', 'duas etapas', 'autenticador', 'autenticacao', 'mfa', '2fa', 'seguranca', 'codigo de recuperacao', 'codigos de recuperacao'],
    reply: 'Para proteger a conta com a verificação em duas etapas:\n1. Abra Perfil e vá ao cartão Verificação em duas etapas.\n2. Toque em Ativar verificação em duas etapas e confirme sua senha.\n3. No aplicativo autenticador, escaneie o QR Code e digite o código de 6 dígitos.\n4. Toque em Confirmar e ativar e guarde os códigos de recuperação fora do celular.\nEsqueceu a senha? Toque em Esqueci minha senha na tela de entrada.',
    actions: [nav('panel-profile')],
    suggestions: ['Quem vê meus dados?'],
  },
  {
    id: 'privacidade',
    defines: true, // lista ou define de fato: responde também a pergunta de definição (assistant/questionKind.js)
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
    keywords: ['cadastro', 'cadastrar', 'me cadastro', 'criar conta', 'criar uma conta', 'crio uma conta', 'crio conta', 'criar minha conta', 'nova conta', 'registrar', 'registro', 'entrar na liga', 'participar da liga', 'virar membro', 'ser membro'],
    reply: 'Para criar a conta:\n1. Na tela inicial, toque em Criar conta.\n2. Preencha nome completo (ele não muda depois), nome de usuário, e-mail, telefone e uma senha de pelo menos 8 caracteres.\n3. Marque que leu os Termos de Uso e a Política de Privacidade e toque em Criar conta.\n4. Abra o e-mail de confirmação e depois faça o login.\nA conta começa como visitante; quem muda o papel para membro é a administração.',
    actions: [],
    suggestions: ['O que posso fazer aqui?'],
  },
  {
    id: 'liga_processo',
    title: 'Processo seletivo da LAIFT',
    weight: 1.5,
    keywords: ['processo seletivo', 'seletivo', 'entrar na liga', 'entro na liga', 'fazer parte da liga', 'ser membro', 'virar membro', 'edital', 'areas da liga', 'contato da liga'],
    reply: 'Para entrar na LAIFT há processo seletivo. Pelo edital de 2026, é preciso estar matriculado ou ter concluído curso da área da saúde, ter carga horária semanal e preencher a ficha de inscrição. Áreas: seis temas, de farmacologia a gestão. Contato: laiftligauninassau@gmail.com. Datas e vagas: a definir pela diretoria. Com processo aberto, o aviso aparece na tela de entrada e na página da Liga.',
    actions: [],
    suggestions: ['Equipe', 'Eventos abertos'],
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
    defines: true, // lista ou define de fato: responde também a pergunta de definição (assistant/questionKind.js)
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
    id: 'entrar',
    titleOnlyOutline: true,
    title: 'Entrar na plataforma (login)',
    keywords: ['login', 'logar', 'fazer login', 'fazer o login', 'entrar na conta', 'entrar na minha conta', 'entrar na plataforma', 'nao consigo entrar', 'acessar minha conta', 'acessar a conta', 'como entro', 'tela de entrada'],
    reply: 'Para entrar na plataforma:\n1. Na tela inicial, digite seu e-mail e sua senha (Mostrar senha ajuda a conferir).\n2. Toque em Entrar.\n3. Se ativou a verificação em duas etapas, digite o código de 6 dígitos do aplicativo autenticador, ou um código de recuperação, e toque em Verificar.\nPrimeira vez? Toque em Criar conta. Esqueceu a senha? Toque em Esqueci minha senha.',
    actions: [],
    suggestions: ['Esqueci minha senha', 'Criar conta'],
  },
  {
    id: 'senha',
    titleOnlyOutline: true,
    title: 'Esqueci ou quero trocar a senha',
    keywords: ['senha', 'esqueci a senha', 'esqueci minha senha', 'trocar senha', 'trocar a senha', 'troco a senha', 'mudar senha', 'mudar a senha', 'alterar senha', 'alterar a senha', 'redefinir senha', 'recuperar senha', 'recuperar a senha', 'nova senha', 'resetar senha'],
    reply: 'Para recuperar ou trocar a senha:\n1. Na tela de entrada, toque em Esqueci minha senha.\n2. Digite o e-mail da conta e toque em Enviar link.\n3. Abra o link que chegou por e-mail.\n4. Digite a nova senha (mínimo 8 caracteres) duas vezes e toque em Salvar nova senha.\nNão há troca de senha dentro do perfil: use sempre este caminho.',
    actions: [],
    suggestions: ['Segurança da conta', 'Como faço login?'],
  },
  {
    id: 'inicio',
    titleOnlyOutline: true,
    title: 'Tela Início: o resumo da conta',
    keywords: ['tela de inicio', 'aba inicio', 'aba de inicio', 'pagina inicial', 'resumo da conta', 'o que aparece no inicio', 'graficos de atividade'],
    reply: 'Início, o primeiro botão da barra de baixo, é o resumo da sua conta: próximos eventos, aprendizado e gráficos de atividade no período. Membros também veem as minhas tarefas, a votação e a caixa de entrada (mensagens e pedidos de conexão). Cada cartão tem um atalho, como Ver eventos, Ver tarefas ou Abrir mensagens. A barra de baixo tem Início, Aprender, Eventos e Perfil; o resto fica no menu.',
    actions: [nav('panel-home')],
    suggestions: ['Eventos abertos', 'Meu crachá'],
  },
  {
    id: 'instalar_app',
    titleOnlyOutline: true,
    title: 'Instalar o app no celular',
    keywords: ['instalar', 'instalo', 'instalar o app', 'instalo o app', 'app no celular', 'aplicativo no celular', 'adicionar a tela de inicio', 'baixar o app', 'baixar o aplicativo', 'pwa'],
    reply: 'A plataforma vira um aplicativo no celular, sem loja.\nAndroid, no Chrome:\n1. Abra a plataforma.\n2. Toque no menu ⋮ do navegador.\n3. Escolha Instalar app ou Adicionar à tela inicial.\niPhone ou iPad, no Safari:\n1. Toque em Compartilhar (o quadrado com a seta).\n2. Escolha Adicionar à Tela de Início e toque em Adicionar.\nDepois, o ícone LAIFT abre a plataforma em tela cheia.',
    actions: [],
    suggestions: ['Guia da plataforma'],
  },
  {
    id: 'blog_site',
    titleOnlyOutline: true,
    title: 'Onde ficam o blog e o site da Liga',
    keywords: ['blog', 'posts', 'site da liga', 'site da laift', 'pagina da liga', 'conheca a laift', 'instalar o blog'],
    reply: 'O blog e a página da Liga abrem sem login:\n1. Na tela de entrada, toque em Acessar blog ou em Conheça a LAIFT.\n2. No blog, filtre por série: Liga, Módulos, Plataforma e Publicações; cada post tem página própria.\n3. Na página da Liga ficam a apresentação, as áreas e os contatos; pelo rodapé chega-se ao Processo seletivo, ao Edital e à Biblioteca.\nO blog também pode ser instalado no celular pelo botão Instalar o blog.',
    actions: [],
    suggestions: ['Como instalar o app?', 'Processo seletivo'],
  },
  {
    id: 'menu_pendencias',
    titleOnlyOutline: true,
    title: 'O número no botão de menu',
    keywords: ['numero no menu', 'numerinho', 'bolinha', 'aviso de pendencia', 'avisos de pendencia', 'pendencia', 'pendencias', 'pendente', 'pendentes', 'notificacao', 'notificacoes', 'botao de menu'],
    reply: 'O botão de menu (☰), no alto, abre Propostas, Tarefas, Mensagens, Equipe e Biblioteca, em três grupos: Participação, Comunicação e Estudo. Quando há algo esperando por você, o botão mostra um número, e cada item diz o que está pendente: votação aberta, tarefas em aberto, mensagens não lidas e pedidos de conexão. Os avisos são para membros. Por e-mail, a plataforma manda só a confirmação de inscrição em eventos.',
    actions: [],
    suggestions: ['Tarefas', 'Mensagens'],
  },
  {
    id: 'papeis',
    defines: true, // lista ou define de fato: responde também a pergunta de definição (assistant/questionKind.js)
    titleOnlyOutline: true,
    title: 'O que cada papel pode fazer',
    keywords: ['papeis', 'visitante', 'visitantes', 'o que o membro pode', 'o que um membro pode', 'o que o administrador pode', 'o que um administrador pode', 'diferenca entre visitante e membro'],
    reply: 'Visitante: Início, Aprender, eventos abertos a contas, enviar Propostas, Perfil, crachá e o catálogo da Biblioteca. Membro: tudo isso e mais votar, Tarefas, Mensagens, Equipe, eventos só para membros e, na Biblioteca, resumo, favoritos e coleções. Administrador: tudo do membro e o botão Admin, que abre a área de gestão. A conta nasce como visitante; para virar membro há processo seletivo, e quem muda o papel é a administração.',
    actions: [],
    suggestions: ['Criar conta', 'Processo seletivo'],
  },
  {
    id: 'guia',
    titleOnlyOutline: true,
    title: 'Guia da plataforma: por onde começar',
    keywords: ['guia', 'guia da plataforma', 'tutorial', 'manual', 'por onde comeco', 'por onde comecar', 'por onde eu comeco', 'primeiros passos'],
    reply: 'Por onde começar:\n1. Crie sua conta (ou entre) na tela inicial.\n2. Em Aprender, escolha um módulo de estudo.\n3. Em Eventos, confira os próximos encontros e inscreva-se.\n4. Em Perfil, complete seus dados e ative a verificação em duas etapas.\n5. No menu ☰ ficam Propostas, Tarefas, Mensagens, Equipe e Biblioteca.\nPergunte do seu jeito, por exemplo: "como instalo o app?".',
    actions: [nav('panel-learn'), nav('panel-events')],
    suggestions: ['Como instalar o app?', 'Como uso a Biblioteca?'],
  },
  {
    // Só administrador ou curador: fica fora do acervo (RAG), do prompt da IA e das intenções públicas.
    id: 'biblioteca_curadoria',
    title: 'Curadoria da Biblioteca (administração e curadores)',
    adminOnly: true,
    curatorOnly: true,
    weight: 2,
    keywords: ['curadoria', 'curar', 'curo', 'fila de triagem', 'triagem', 'em triagem', 'aprovar referencia', 'aprovar artigo', 'aprovo um artigo', 'publicar artigo', 'publicar um artigo', 'publico artigo', 'publico um artigo', 'trabalho em lote', 'lote de artigos', 'revisor clinico', 'buscar dados'],
    reply: 'Curadoria da Biblioteca, para administradores e curadores:\n1. No modo administrador, toque em Biblioteca.\n2. Em Artigos, digite o DOI ou o PMID e toque em Buscar dados; o artigo entra Em triagem.\n3. Abra o artigo, confira os dados, a área e o resumo e salve.\n4. Toque em Aprovar referência e depois em Publicar: o artigo aparece no catálogo em até 1 minuto.\nPara muitos de uma vez, use Trabalho em lote. Resumo com dose, conduta ou interação precisa do revisor clínico. Curador sem o botão Admin pede ajuda a um administrador.',
    actions: [nav('panel-admin-library')],
    suggestions: ['Como uso a Biblioteca?'],
  },
  {
    id: 'biblioteca_sugerir',
    titleOnlyOutline: true,
    title: 'Biblioteca: sugerir um artigo',
    library: true,
    weight: 1.5,
    keywords: ['sugerir artigo', 'sugerir um artigo', 'sugiro artigo', 'sugiro um artigo', 'sugestao de artigo', 'sugerir referencia', 'indicar artigo', 'indicar um artigo', 'indico um artigo', 'indicar uma referencia', 'publicar artigo', 'publicar um artigo', 'publico artigo', 'publico um artigo', 'enviar artigo', 'enviar um artigo', 'envio um artigo', 'adicionar artigo', 'adicionar um artigo'],
    reply: 'Para sugerir um artigo à Biblioteca (membros):\n1. Abra a Biblioteca e toque em Sugerir artigo.\n2. Cole o DOI, o PMID ou o link do doi.org ou do PubMed e, se quiser, diga por que (até 300 caracteres, sem links).\n3. Toque em Enviar sugestão.\nA Diretoria Científica avalia antes de publicar: quem publica é a curadoria, não quem sugere.',
    actions: [nav('panel-library')],
    suggestions: ['Como uso a Biblioteca?', 'Citar em ABNT'],
  },
  {
    id: 'biblioteca_salvar_citar',
    titleOnlyOutline: true,
    title: 'Biblioteca: favoritos e citação ABNT ou Vancouver',
    library: true,
    weight: 1.5,
    keywords: ['salvar artigo', 'salvar um artigo', 'salvo artigo', 'salvo um artigo', 'favoritos', 'favorito', 'favoritar', 'citar', 'cito', 'citacao', 'citacoes', 'abnt', 'vancouver', 'copiar citacao', 'copio a citacao', 'colecoes'],
    reply: 'Para salvar e citar um artigo:\n1. Para salvar (membros), toque em Salvar nos favoritos no artigo; ele vai para a aba Favoritos. Remover dos favoritos desfaz.\n2. Para citar, toque no título do artigo e, em Citar, escolha ABNT ou Vancouver.\n3. Toque em Copiar citação: aparece Citação copiada. e o texto fica na tela para conferir.\nA aba Coleções traz seleções de artigos feitas pela curadoria.',
    actions: [nav('panel-library')],
    suggestions: ['Como uso a Biblioteca?', 'Remover um artigo'],
  },
  {
    id: 'biblioteca_remocao',
    titleOnlyOutline: true,
    title: 'Biblioteca: pedir revisão ou remoção de artigo',
    library: true,
    weight: 1.5,
    keywords: ['remocao', 'remover artigo', 'remover um artigo', 'retirar artigo', 'retirar um artigo', 'retirada de artigo', 'artigo errado', 'artigo incorreto', 'artigo com erro', 'erro no artigo', 'artigo duplicado', 'revisao de artigo', 'denunciar artigo', 'despublicar'],
    reply: 'Não há botão de remoção. Para pedir revisão ou retirada de um artigo:\n1. Abra Perfil e vá à seção Feedback.\n2. Escreva o título do artigo e o motivo e toque em Enviar feedback.\n3. Se preferir, escreva para laiftligauninassau@gmail.com.\nA curadoria analisa e registra o motivo de cada remoção.',
    actions: [nav('panel-profile'), nav('panel-library')],
    suggestions: ['Como uso a Biblioteca?', 'Enviar feedback'],
  },
  {
    id: 'biblioteca',
    titleOnlyOutline: true,
    title: 'Biblioteca: como buscar artigos',
    library: true,
    weight: 0.8,
    keywords: ['biblioteca', 'biblioteca laift', 'artigos cientificos', 'artigo cientifico', 'buscar artigos', 'busco artigos', 'buscar artigo', 'busco artigo', 'procurar artigos', 'procuro artigos', 'pesquisar artigos', 'pesquiso artigos', 'achar artigos', 'literatura cientifica', 'referencias bibliograficas', 'catalogo de artigos'],
    reply: 'Para buscar artigos na Biblioteca:\n1. Abra o menu ☰ e toque em Biblioteca (grupo Estudo).\n2. Digite o tema em Buscar artigos e toque em Buscar; os artigos em português vêm primeiro.\n3. Em Filtros, escolha Área, Tipo, Idioma ou Ano, ou marque Só acesso aberto.\n4. Toque no título para ver a ficha e em Abrir no site oficial para ler o artigo.\nQuem não tem conta vê o catálogo público em laift.com.br/biblioteca.',
    actions: [nav('panel-library')],
    suggestions: ['Sugerir um artigo', 'Citar em ABNT'],
  },
  {
    id: 'admin_area',
    title: 'Área de administração (botão Admin)',
    adminOnly: true,
    keywords: ['area admin', 'area de administracao', 'area administrativa', 'painel do administrador', 'painel admin', 'botao admin', 'modo admin', 'sou administrador', 'sou admin', 'o que tem no admin'],
    reply: 'O botão Admin, no menu, abre a área de administração, que só existe para administradores. Ela tem Painel (visão geral com gráficos), Usuários, Eventos, Propostas, Tarefas, Feedback, Auditoria, Denúncias, Fiscal, IA e Biblioteca. O botão Voltar retorna à área do membro.',
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
    defines: true, // lista ou define de fato: responde também a pergunta de definição (assistant/questionKind.js)
    title: 'O que a Lia faz',
    weight: 0.7,
    keywords: ['ajuda', 'ajudar', 'socorro', 'duvida', 'como usar', 'como usa', 'nao sei', 'o que voce faz', 'o que voce pode', 'como funciona a plataforma', 'o que posso fazer', 'o que da para fazer'],
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
 * Exceção: o MEMBRO curador da Biblioteca (opts.curator === true, decidido pelo serviço) também recebe as
 * intenções marcadas curatorOnly. Visitante e pessoa sem papel nunca.
 */
function intentsFor(role, opts) {
  if (role === ROLES.ADMIN) return INTENTS;
  if (role === ROLES.MEMBER && opts && opts.curator === true) return CURATOR_INTENTS;
  return PUBLIC_INTENTS;
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
 * `opts.curator` (true para o membro curador da Biblioteca) libera só as intenções curatorOnly.
 * @returns {{id: string, score: number, intent: object, followUp?: boolean} | null}
 */
export function matchIntent(message, history, role, opts) {
  const intents = intentsFor(role, opts);
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
// todos os papéis. As de administração (adminOnly) respondem só pelas regras, com botão só para admin;
// as curatorOnly (também adminOnly) respondem ainda ao membro curador da Biblioteca.
export const PUBLIC_INTENTS = INTENTS.filter((intent) => !intent.adminOnly && !intent.curatorOnly);
const CURATOR_INTENTS = INTENTS.filter((intent) => !intent.adminOnly || intent.curatorOnly);

// Teto da primeira frase da resposta no resumo (teto do teste: 2.500 caracteres no total). Reduzido de 70 para 40
// quando o guia da plataforma entrou: as intenções com titleOnlyOutline (passo a passo, cobertas pelo acervo
// 'guia-plataforma') entram só com o título, porque a primeira frase de uma resposta numerada não resume nada.
const OUTLINE_REPLY_MAX = 40;

/** Resumo curto das intenções para o prompt da IA (sem dado de ninguém). */
export function kbOutline() {
  return PUBLIC_INTENTS
    .map((i) => '- ' + i.id + ': ' + i.title + '.' + (i.titleOnlyOutline ? '' : ' ' + i.reply.split('. ')[0].slice(0, OUTLINE_REPLY_MAX)))
    .join('\n');
}
