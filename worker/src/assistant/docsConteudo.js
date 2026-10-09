/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/docsConteudo.js
 * Conteúdo factual da base da Lia (kb_chunks), no mesmo formato markdown de assistant/docs.js:
 * uma lista { source, markdown } com as fontes plataforma, modulos, publicacoes, processo, faq e saude.
 * Cada "## Seção" tem título único em todo o corpus, porque o golden set casa por título de seção.
 *
 * Só entra fato que está nas fontes: frontend/blog/conteudo/*.json, docs/blog/FATOS_VERIFICADOS_2026-10-09.md,
 * frontend/liga.html, /privacidade.html e /termos.html. O que é desconhecido vira "a definir pela diretoria".
 * Nenhum nome de pessoa; o único e-mail é o oficial da Liga. Saúde: a Lia orienta sobre a plataforma e
 * não faz diagnóstico, dose nem conduta; o conteúdo de estudo é educacional.
 */

export const CONTENT_DOCS = [
  {
    source: 'plataforma',
    markdown: [
      '# Plataforma LAIFT',
      '## Instalar a LAIFT no celular',
      'A plataforma pode ser instalada no celular: você a salva na tela inicial do telefone como um aplicativo chamado LAIFT, com o ícone da marca. Depois de instalada, ela abre em tela cheia, sem a barra do navegador.',
      '## Uso sem internet',
      '49 arquivos do miolo do app, como estilos, scripts, a Lia, o ícone e a tela de abertura, ficam guardados no aparelho. Sem conexão, o app usa esse conteúdo guardado e mostra um aviso de que você está offline. Envios de dados e consultas ao servidor precisam de internet.',
      '## Desempenho medido na tela de entrada',
      'Em 2026-10-08, a tela de entrada foi medida com o Lighthouse, ferramenta do Google, com a mediana de três rodadas. No celular: desempenho 94 de 100; acessibilidade, boas práticas e SEO 100 de 100; tempo até o conteúdo principal de 1,2 s. No computador: desempenho 100 de 100, com 369 ms até o conteúdo principal. Esses números valem só para a tela de entrada, pois as outras telas não foram medidas.',
      '## Acessibilidade da plataforma',
      'A meta para alvos de toque é de 44 px. As janelas de confirmação mantêm o foco dentro delas, fecham com a tecla Esc e devolvem o foco ao ponto de partida. Se o aparelho pedir menos movimento, as animações são reduzidas. Há uma exceção registrada: um controle de notificação por e-mail no Perfil tem 13 px de largura, abaixo da meta, e a equipe aceitou esse caso.',
      '## Limites conhecidos da plataforma',
      'A equipe registra os limites que conhece e não promete segurança absoluta. Hoje, por exemplo, o QR do crachá ainda não tem prazo de validade. A Lia pode errar, sobretudo em temas clínicos. A cifragem das mensagens protege o texto no navegador, mas não substitui cuidados com a senha e com a verificação em duas etapas.',
    ].join('\n'),
  },
  {
    source: 'modulos',
    markdown: [
      '# Módulos da plataforma',
      '## Início: resumo e atalhos do membro',
      'Início é o resumo do membro, um panorama com acessos rápidos às áreas da plataforma. Reúne atalhos para essas áreas, como eventos, propostas, tarefas, equipe e mensagens, e leva ao Aprender, a área dos cinco módulos de estudo. A área de gestão aparece só para quem tem o papel de administração.',
      '## Farmacologia Básica: temas e simulador',
      'Para estudar como os remédios agem no corpo, use o módulo Farmacologia Básica. Ele trata de mecanismos de ação, receptores e farmacodinâmica, e a farmacocinética clínica, que é o caminho do remédio no corpo. Traz um simulador de múltipla escolha, com 240 questões. As estatísticas de acerto aparecem no Aprender. É material de estudo.',
      '## Toxicologia: temas e simulador',
      'O módulo de Toxicologia Clínica e Forense reúne intoxicações agudas, defensivos agrícolas, animais peçonhentos e antídotos, nos lados clínico e forense. Traz um simulador com 240 questões. O atendimento clínico cuida da pessoa intoxicada, e a área forense cuida da prova. É material de estudo.',
      '## Clínica Médica Virtual: plantão e roteiro',
      'A Clínica Médica Virtual simula atendimento no modelo OSCE, o Exame Clínico Objetivo Estruturado. Ela reúne um plantão com mais de um paciente simulado, um acervo de casos da própria Liga, um roteiro semiológico para organizar a anamnese e o exame físico, e um preceptor com IA para conversar sobre o caso.',
      '## Laboratório Virtual: bancada e estúdio molecular',
      'O Laboratório Virtual tem ensaios de bancada, sínteses, identificação de compostos e um estúdio molecular 3D, que é uma tela própria dentro do módulo. Você alterna entre a bancada e o estúdio. O preceptor com IA tira dúvidas sobre o experimento, mas a IA pode errar, então a resposta se confere com o material do curso.',
      '## Anatomia e Farmacocinética 3D: atlas e PK',
      'O módulo reúne o Atlas, um modelo 3D do corpo humano com estruturas para explorar, simulações de farmacocinética (PK) e vias metabólicas, que são as rotas que o organismo usa para transformar um medicamento. PK é a sigla de farmacocinética. O Atlas registra telemetria de uso anônima.',
      '## Eventos e QR de presença: passo a passo',
      'Na seção Eventos você vê a lista dos encontros da Liga e faz a inscrição em cada um. No dia do evento, abra o crachá virtual e mostre o QR de presença: a equipe lê o QR no terminal de check-in. Deixe o crachá aberto na tela do celular até a leitura.',
    ].join('\n'),
  },
  {
    source: 'publicacoes',
    markdown: [
      '# Blog e publicações',
      '## Blog da LAIFT: as séries',
      'O blog da LAIFT, na página blog.html, reúne textos sobre a Liga, os módulos, a plataforma e as publicações, separados por categoria. O feed filtra por série: Liga, Módulos, Plataforma e Publicações. Cada post tem a sua própria página.',
      '## Como o blog confere os fatos',
      'A equipe garante informações corretas: o blog só publica o que foi verificado no código e nas fontes da equipe. Quando um dado ainda não foi confirmado, o texto deixa o dado de fora ou usa "a divulgar" ou "a definir pela diretoria". Por isso, as datas e as vagas do processo seletivo aparecem como a divulgar.',
      '## Publicações informativas: a série de campanhas',
      'As publicações são a série de campanhas do blog, exibida no filtro como Publicações. Elas tratam de temas de conscientização e de saúde em texto informativo, sem orientação individual. A primeira é a Outubro Rosa 2026, sobre o câncer de mama.',
      '## Outubro Rosa 2026: publicação informativa',
      'A publicação Outubro Rosa 2026: conhecer, cuidar e saber seus direitos reúne informações sobre o câncer de mama: o que é a campanha, exames, sinais de alerta, direitos, mitos e verdades e hábitos que ajudam. É material informativo e não substitui consulta.',
    ].join('\n'),
  },
  {
    source: 'processo',
    markdown: [
      '# Processo seletivo da LAIFT',
      '## Etapas do processo seletivo 2026',
      'O processo seletivo, isto é, a seleção para entrar na liga, tem três fases. As duas primeiras são eliminatórias: a inscrição com a ficha diagnóstica, e a análise de perfil com filtro crítico. A última, a divulgação dos selecionados, é classificatória. As datas de cada etapa são a divulgar pela diretoria.',
      '## Quem pode participar do seletivo',
      'Estudante cursando, matriculado, pode se candidatar ao seletivo. Pode participar quem está regularmente matriculado ou já concluiu curso da área da saúde ou correlatos, como Farmácia, Biomedicina, Medicina, Nutrição e Enfermagem. A regra está em revisão pela diretoria.',
      '## Compromissos de quem entra na Liga',
      'Quem ingressa assume o compromisso de cumprir os prazos e entregar as tarefas com qualidade, ter conduta ética e colaborativa, zelar pela imagem pública da Liga e da instituição mantenedora, e proteger informações científicas e dados pessoais dos participantes dos projetos. A disponibilidade semanal mínima é a definir pela diretoria.',
      '## Ficha diagnóstica e análise de cenário',
      'A inscrição é feita pelo formulário eletrônico da ficha diagnóstica. Na última seção, a pessoa descreve uma análise de cenário: um mecanismo, uma evidência ou uma notícia recente, com a sua escolha e o impacto. Nos campos de texto livre, não se escrevem dados de saúde, seus ou de terceiros.',
      '## Quando o seletivo está aberto ou fechado',
      'O topo da página da Liga mostra o estado do processo. Enquanto estiver fechado, aparece a mensagem de inscrições fechadas no momento. Quando estiver aberto, o botão Inscrever-se leva ao formulário oficial, que abre em outra aba. A inscrição direta no site ainda é um plano.',
      '## Edital 2026 em revisão',
      'O edital 2026 está em revisão pela diretoria. Enquanto a revisão não termina, as regras que valem são as da página da Liga, e a Lia não as apresenta como definitivas. Vagas e datas: a definir pela diretoria.',
    ].join('\n'),
  },
  {
    source: 'faq',
    markdown: [
      '# Perguntas frequentes',
      '## Preciso confirmar o e-mail para entrar?',
      'Sim. Depois do cadastro na tela inicial, a conta é confirmada pelo e-mail, e só então você faz o login.',
      '## Esqueci minha senha. O que faço?',
      'Se perdeu a senha, recupere o acesso pela tela de entrada: toque em Esqueci minha senha. Para proteger a conta, ative a verificação em duas etapas em Meu perfil e guarde os códigos de recuperação fora do aparelho.',
      '## Como mostro meu crachá na portaria?',
      'Abra o crachá virtual, que mostra o seu nome, o seu papel na Liga e um QR de presença. Na portaria do evento, mostre o QR para o fiscal ler e deixe o crachá aberto na tela do celular até a leitura.',
      '## O QR do crachá tem validade?',
      'Não. Hoje o QR de presença do crachá não tem prazo de validade. Esse é um limite conhecido, registrado pela equipe.',
      '## Como faço a inscrição em um evento?',
      'Entre com a sua conta, abra a seção Eventos, escolha o encontro e faça a inscrição. No dia, o crachá virtual com o QR de presença é o que você mostra na portaria.',
      '## Como encontro um módulo de estudo?',
      'Abra o Aprender, a área dos módulos de estudo. Ele reúne cinco módulos: Farmacologia Básica, Toxicologia Clínica e Forense, Clínica Médica Virtual, Laboratório Virtual e Anatomia e Farmacocinética 3D. Escolha um para abrir.',
      '## A Lia tem limite de perguntas por dia?',
      'Perguntas de rotina, como as sobre eventos, crachá, módulos e perfil, são respondidas sem IA e sem limite diário. As perguntas abertas com IA têm cota diária por pessoa, e a resposta em modo limitado não gasta essa cota.',
      '## Onde leio os Termos e a Política de Privacidade?',
      'Os Termos de Uso ficam na página termos.html e a Política de Privacidade na página privacidade.html, ambas dentro da plataforma. Os dois documentos explicam como os dados são tratados e quais são os direitos do titular.',
      '## Onde ficam o blog e as publicações?',
      'O blog fica na página blog.html, com o feed que filtra por série: Liga, Módulos, Plataforma e Publicações. As publicações informativas, como a Outubro Rosa 2026, estão na série Publicações.',
      '## Como falo com a Liga?',
      'Pelo e-mail oficial, laiftligauninassau@gmail.com, ou pelo Instagram @laift.liga. A página da Liga, em liga.html, também reúne os contatos.',
    ].join('\n'),
  },
  {
    source: 'saude',
    markdown: [
      '# Saúde e estudo: avisos',
      '## Papel da Lia em temas de saúde',
      'A Lia não diz qual remédio tomar nem quanto tomar. Ela orienta sobre a plataforma: onde ficam as telas, os módulos e as regras de uso. Ela não faz diagnóstico, não indica medicamento, dose ou tempo de uso, não define conduta e não substitui orientação de profissional de saúde. Os conteúdos de Farmacologia e de Anatomia e Farmacocinética são de estudo.',
      '## Emergências: onde buscar ajuda',
      'Em caso de intoxicação real, procure um serviço de emergência na hora. Para sintomas que preocupam, procure avaliação médica, por exemplo em uma Unidade Básica de Saúde (UBS). A Lia não é canal de emergência e não avalia sintomas.',
      '## Casos de treino não definem conduta',
      'Os casos e simuladores da plataforma são de treino educacional. Eles não servem para decidir o atendimento de ninguém e não substituem aula, livro-texto nem orientação profissional. As respostas da IA devem ser conferidas com o material do seu curso.',
      '## Atlas 3D: conteúdo em revisão',
      'O conteúdo do Atlas 3D ainda está em revisão. As fichas das estruturas não foram aprovadas por profissional: há rascunhos automáticos e fichas ainda não verificadas. Use o Atlas como apoio ao estudo, junto com o livro-texto e a aula, e não como fonte única.',
      '## Alteração nas mamas: onde buscar avaliação',
      'Se você encontrar um caroço ou nódulo na mama, ou notar outra alteração, procure avaliação, por exemplo em uma Unidade Básica de Saúde (UBS). Só a avaliação de um profissional de saúde diz o que é. A publicação Outubro Rosa 2026 é informativa e não diagnostica nada.',
      '## A Lia pode errar em temas clínicos',
      'A Lia pode errar, sobretudo em temas clínicos. Qualquer resposta sobre sintomas, tratamento ou medicamento precisa de avaliação de um profissional de saúde antes de ser usada. Em caso de dúvida sobre a saúde de alguém, o caminho é procurar atendimento.',
    ].join('\n'),
  },
];
