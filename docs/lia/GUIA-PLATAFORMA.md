# Guia da plataforma LAIFT

Fonte única do guia que a Lia usa (base de conhecimento e busca do acervo). Cada seção `## ` vira um trecho
do acervo (`kb_chunks`, fonte `guia-plataforma`) quando um administrador toca em **Reindexar** no Painel de IA.
As seções que começam com "Administração" ficam fora do acervo (ele é o mesmo para todos os papéis); a Lia
responde a elas só para administradores, pelas intenções de `worker/src/assistant/kb.js`.
Depois de editar este arquivo: `cd worker && node scripts/gen-guia-plataforma.mjs` (gera
`worker/src/assistant/guiaPlataforma.js`; o teste `guiaPlataforma.test.js` acusa quando os dois divergem).
Regras: só o que existe de verdade na plataforma, passos curtos e numerados, texto puro, até 1.000 caracteres por seção.

## Entrar na plataforma
Para quem: todos. 1. Na tela inicial, digite seu e-mail e sua senha (Mostrar senha ajuda a conferir). 2. Toque em Entrar. 3. Se você ativou a verificação em duas etapas, digite o código de 6 dígitos do aplicativo autenticador, ou um código de recuperação, e toque em Verificar. Primeira vez? Toque em Criar conta. Esqueceu a senha? Toque em Esqueci minha senha.

## Criar conta passo a passo
Para quem: quem ainda não tem conta. 1. Na tela inicial, toque em Criar conta. 2. Preencha nome completo (ele não pode ser mudado depois), nome de usuário, e-mail, telefone e uma senha de pelo menos 8 caracteres. 3. Se quiser, abra Completar perfil (opcional) e acrescente foto, LinkedIn, Instagram, escolaridade e assuntos de interesse. 4. Marque que leu os Termos de Uso e a Política de Privacidade e toque em Criar conta. 5. Abra o e-mail de confirmação e depois faça o login. A conta começa como visitante; quem muda o papel para membro é a administração.

## Esqueci a senha: nova senha pelo e-mail
Para quem: todos. 1. Na tela de entrada, toque em Esqueci minha senha. 2. Digite o e-mail da conta e toque em Enviar link. 3. Abra o link que chegou por e-mail. 4. Digite a nova senha (mínimo 8 caracteres) duas vezes e toque em Salvar nova senha. Não há troca de senha dentro do perfil: para mudar a senha, use este mesmo caminho.

## Perfil, preferências e feedback
Para quem: todos com conta. 1. Toque em Perfil, na barra de baixo. 2. Em Meu perfil, troque a foto (Trocar foto) e edite nome de usuário, telefone, LinkedIn, Instagram, escolaridade e assuntos de interesse; toque em Salvar perfil. O nome completo não muda. 3. Em Preferências, escolha o tema (Automático, Claro ou Escuro) e se quer receber por e-mail a confirmação de inscrição em eventos; toque em Salvar preferências. 4. Em Feedback, escreva sua mensagem para a administração e toque em Enviar feedback. Minhas métricas mostra seus números na plataforma.

## Verificação em duas etapas passo a passo
Para quem: todos com conta (recomendado). 1. Abra Perfil e vá ao cartão Verificação em duas etapas. 2. Toque em Ativar verificação em duas etapas e confirme sua senha. 3. No aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou Authy), escaneie o QR Code ou digite a chave. 4. Digite o código de 6 dígitos e toque em Confirmar e ativar. 5. Guarde os códigos de recuperação (Copiar ou Baixar .txt) fora do celular: cada um serve para entrar uma vez se você perder o aparelho. No mesmo cartão dá para gerar novos códigos ou desativar.

## Tela Início: o resumo
Para quem: todos com conta. Início, o primeiro botão da barra de baixo, é o resumo da sua conta: próximos eventos, aprendizado e gráficos de atividade no período. Membros também veem minhas tarefas, votação e caixa de entrada (mensagens e pedidos de conexão). Cada cartão tem um atalho, como Ver eventos, Ver tarefas ou Abrir mensagens. Os botões da barra de baixo são Início, Aprender, Eventos e Perfil; o resto fica no menu.

## Aprender e os cinco módulos de estudo
Para quem: todos com conta. 1. Toque em Aprender, na barra de baixo. 2. Escolha um módulo: Farmacologia Básica (quiz), Toxicologia Clínica e Forense, Clínica Médica Virtual, Laboratório Virtual (com o Estúdio 3D) ou Anatomia e Farmacocinética 3D (Atlas 3D). 3. Para voltar, toque em ← Voltar; Tela cheia amplia o módulo. No alto ficam seu aproveitamento, o desempenho por módulo, as conquistas e o botão Meu crachá virtual. O conteúdo é de estudo e não substitui orientação profissional.

## Eventos: inscrição e histórico
Para quem: todos com conta; alguns eventos são só para membros. 1. Toque em Eventos, na barra de baixo. 2. Confira data, local e vagas de cada encontro. 3. Toque em Inscrever-se. Aparece Inscrição confirmada; sem vagas, a tela avisa. 4. No dia, mostre o crachá virtual na portaria. O Histórico, abaixo, lista os últimos eventos concluídos. Se você ligou o e-mail em Preferências, recebe a confirmação da inscrição.

## Crachá virtual na portaria
Para quem: todos com conta. 1. Abra Aprender e toque em Meu crachá virtual (QR de presença). 2. O crachá mostra seu nome, seu papel e o QR de presença. 3. Na portaria, deixe o crachá aberto e mostre o QR para o fiscal ler. Ampliar QR deixa o código maior; Salvar imagem guarda o crachá no aparelho.

## Propostas e votações passo a passo
Para quem: enviar, todos com conta; votar, só membros e administradores. 1. Abra o menu (botão ☰ no alto) e toque em Propostas. 2. Em Enviar proposta, escreva o título e a descrição e toque em Enviar. 3. Acompanhe a análise em Minhas propostas. 4. Em Votação aberta, toque em Sim ou Não, ou em Comentar para votar com um comentário. Depois aparece Voto registrado.

## Tarefas: aderir e concluir
Para quem: membros e administradores. 1. Abra o menu ☰ e toque em Tarefas. 2. Veja prazo e situação de cada tarefa publicada pela liga. 3. Toque em Aderir para participar. 4. Depois de cumprir, toque em Marcar como concluída. Cada tarefa tem uma área de Comentários. O menu mostra quantas tarefas estão em aberto.

## Mensagens cifradas
Para quem: membros e administradores. 1. Abra o menu ☰ e toque em Mensagens. 2. Escolha uma conversa na lista. Para começar uma nova, abra o perfil de uma conexão (em Equipe) e toque em Enviar mensagem. 3. Escreva e toque em Enviar (➤). As mensagens são cifradas de ponta a ponta: só você e a outra pessoa leem. Limpar apaga o histórico só da sua visão.

## Equipe, conexões e denúncia
Para quem: membros e administradores. 1. Abra o menu ☰ e toque em Equipe para ver o organograma da liga. 2. Toque numa pessoa para ver o perfil e tocar em Adicionar. 3. Em Adicionar, digite o nome de usuário ou o telefone e toque em Enviar pedido. 4. Em Pedidos de amizade, toque em Adicionar de volta ou Recusar. 5. Para denunciar alguém, abra o perfil da pessoa, toque em Denunciar e depois em Enviar denúncia.

## Biblioteca: buscar e abrir artigos
Para quem: todos com conta, quando a Biblioteca está ligada. Resumo, favoritos e coleções são só para membros. 1. Abra o menu ☰ e toque em Biblioteca (grupo Estudo). 2. Digite o tema em Buscar artigos e toque em Buscar: a lista mostra os artigos em português primeiro. 3. Para refinar, abra Filtros e escolha Área, Tipo, Idioma (Português ou Inglês e outros), Ano de e Ano até, ou marque Só acesso aberto; Limpar filtros desfaz tudo, e Carregar mais mostra os próximos. 4. Toque no título do artigo para ver a ficha e, nela, em Abrir no site oficial para ler no site do editor, em nova aba. Quem não tem conta vê o catálogo público em laift.com.br/biblioteca.

## Biblioteca: favoritos, citação e coleções
Para quem: membros e administradores (citar: todos). 1. Para salvar, toque em Salvar nos favoritos (☆) no artigo; ele vai para a aba Favoritos. Toque em Remover dos favoritos para tirar. 2. Para citar, toque no título do artigo e, em Citar, escolha ABNT ou Vancouver e toque em Copiar citação: aparece Citação copiada. e o texto fica na tela para conferir. 3. Na aba Coleções, abra uma seleção de artigos feita pela curadoria; ← Voltar às coleções retorna à lista.

## Biblioteca: sugerir artigo e pedir remoção
Para quem: membros e administradores. Sugerir (quando a função está ligada): 1. Abra a Biblioteca e toque em Sugerir artigo. 2. Cole o DOI, o PMID ou o link do doi.org ou do PubMed e, se quiser, diga por que (Por que este artigo?, até 300 caracteres, sem links). 3. Toque em Enviar sugestão. Aparece Sugestão enviada. e a Diretoria Científica avalia antes de publicar. Pedir remoção ou correção: não há botão de remoção. Abra Perfil, escreva em Feedback o título do artigo e o motivo e toque em Enviar feedback, ou escreva para laiftligauninassau@gmail.com. A curadoria analisa e registra o motivo de cada remoção.

## Blog e site da Liga
Para quem: todos, sem login. 1. Na tela de entrada, toque em Acessar blog ou em Conheça a LAIFT. 2. No blog, filtre por série: Liga, Módulos, Plataforma e Publicações; cada post tem página própria. 3. Na página da Liga ficam a apresentação, as áreas e os contatos; pelo rodapé chega-se ao Processo seletivo, ao Edital e à Biblioteca. O blog também pode ser instalado no celular pelo botão Instalar o blog.

## Instalar o app: passo a passo
Para quem: todos. A plataforma vira um aplicativo no celular, sem loja. Android, no Chrome: 1. Abra a plataforma. 2. Toque no menu ⋮ do navegador. 3. Escolha Instalar app ou Adicionar à tela inicial. iPhone ou iPad, no Safari: 1. Toque em Compartilhar (o quadrado com a seta). 2. Escolha Adicionar à Tela de Início. 3. Toque em Adicionar. Depois, o ícone LAIFT abre a plataforma em tela cheia.

## Menu e avisos de pendência
Para quem: todos com conta; os avisos são de membros. O botão de menu (☰), no alto, abre Propostas, Tarefas, Mensagens, Equipe e Biblioteca, em três grupos: Participação, Comunicação e Estudo. Quando há algo esperando por você, o botão mostra um número, e cada item diz o que está pendente: votação aberta, tarefas em aberto, mensagens não lidas e pedidos de conexão. Por e-mail, a plataforma manda só a confirmação de inscrição em eventos, e isso se liga em Perfil, Preferências.

## Papéis: visitante, membro e administrador
Visitante: Início, Aprender, Eventos abertos a contas, Propostas (enviar), Perfil, crachá e o catálogo da Biblioteca. Membro: tudo isso e mais votar, Tarefas, Mensagens, Equipe, eventos só para membros e, na Biblioteca, resumo, favoritos e coleções. Administrador: tudo do membro e o botão Admin, que abre a área de gestão. A conta nasce como visitante; para virar membro há processo seletivo, e quem muda o papel é a administração.

## Administração: modo administrador
Para quem: administradores. 1. Toque em Admin (a engrenagem) na barra de baixo. 2. A barra troca para Painel, Usuários, Eventos, Propostas, Tarefas, Feedback, Auditoria, Denúncias, Fiscal, IA e Biblioteca. 3. Toque em Voltar para retornar à área do membro. Cada ação que muda dados pede confirmação e fica registrada na Auditoria.

## Administração: curadoria da Biblioteca
Para quem: administradores e curadores. 1. Entre no modo administrador e toque em Biblioteca. 2. Em Artigos, digite o DOI ou o PMID e toque em Buscar dados; o artigo entra Em triagem. 3. Abra o artigo, confira os dados, a área e o resumo e salve. 4. Toque em Aprovar referência e depois em Publicar: o artigo aparece no catálogo em até 1 minuto. Para muitos de uma vez, use Trabalho em lote. Resumo com dose, conduta ou interação precisa do revisor clínico. Curador sem acesso à área Admin pede ajuda a um administrador.

## Administração: Reindexar a base da Lia
Para quem: administradores. Depois de mudar este guia ou outro texto da base da Lia, publique o Worker e, no modo administrador, abra IA e toque em Reindexar base da Lia (pede confirmação; uma vez por minuto). A Lia passa a buscar nos trechos novos; os trechos que não mudaram não são refeitos.
