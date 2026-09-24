index: 

<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>
    window.APP_RESET_MODE = <?= isResetMode ? 'true' : 'false' ?>;
    window.APP_RESET_TOKEN = "<?= resetToken || '' ?>";
  </script>
  <?!= include('CSS'); ?>
</head>
<body>
  <main class="layout">
    <section id="telaLoginMembro" class="authCard" aria-labelledby="titulo-login-membro">
      <div class="marca" ondblclick="alternarTela('telaLoginMembro', 'telaLoginAdmin')" title="Duplo clique para acesso administrativo">Painel de Governança</div>
      <h1 id="titulo-login-membro">Acesso de membros</h1>
      <p class="textoApoio">Ambiente de acompanhamento, participação e organização coletiva.</p>


      <form onsubmit="event.preventDefault(); entrarSistema('Membro', this);">
        <input type="email" id="emailMembro" placeholder="E-mail" autocomplete="email" required>
        <input type="password" id="senhaMembro" placeholder="Senha" autocomplete="current-password" required>
        <button type="submit">Entrar</button>
      </form>


      <div id="msgMembro" class="status" aria-live="polite"></div>


      <div class="acoesAuth">
        <button type="button" class="linkBtn" onclick="alternarTela('telaLoginMembro', 'telaCadastro')">Solicitar cadastro</button>
        <button type="button" class="linkBtn" onclick="alternarTela('telaLoginMembro', 'telaEsqueciSenha')">Esqueci minha senha</button>
      </div>
    </section>


    <section id="telaLoginAdmin" class="authCard oculto" aria-labelledby="titulo-login-admin">
      <div class="marca" ondblclick="alternarTela('telaLoginAdmin', 'telaLoginMembro')" title="Duplo clique para voltar">Painel de Governança</div>
      <h2 id="titulo-login-admin">Identificação administrativa</h2>
      <p class="textoApoio">Utilize o seu e-mail autorizado e sua senha.</p>


      <form onsubmit="event.preventDefault(); entrarSistema('Admin', this);">
        <input type="email" id="emailAdmin" placeholder="E-mail autorizado" autocomplete="email" required>
        <input type="password" id="senhaAdmin" placeholder="Senha" autocomplete="current-password" required>
        <button type="submit" class="btnAdmin">Entrar</button>
      </form>


      <div id="msgAdmin" class="status" aria-live="polite"></div>
    </section>


    <section id="telaCadastro" class="authCard oculto" aria-labelledby="titulo-cadastro">
      <div class="marca">Painel de Governança</div>
      <h2 id="titulo-cadastro">Solicitação de cadastro</h2>
      <p class="textoApoio">Preencha os dados para solicitar acesso.</p>


      <form onsubmit="event.preventDefault(); enviarCadastro(this);">
        <input type="text" id="novoNome" placeholder="Nome completo" autocomplete="name" required>
        <input type="email" id="novoEmail" placeholder="E-mail" autocomplete="email" required>
        <input type="password" id="novaSenhaCadastro" placeholder="Crie uma senha" autocomplete="new-password" required>


        <label class="caixaPolitica">
          <input type="checkbox" id="aceitePolitica">
          <span>Concordo com a coleta e uso dos dados informados neste cadastro, incluindo nome, e-mail e credenciais protegidas para acesso ao sistema.</span>
        </label>


        <button type="submit">Enviar solicitação</button>
      </form>


      <div id="msgCadastro" class="status" aria-live="polite"></div>


      <div class="acoesAuth">
        <button type="button" class="linkBtn" onclick="alternarTela('telaCadastro', 'telaLoginMembro')">Voltar</button>
      </div>
    </section>


    <section id="telaEsqueciSenha" class="authCard oculto" aria-labelledby="titulo-esqueci-senha">
      <div class="marca">Painel de Governança</div>
      <h2 id="titulo-esqueci-senha">Redefinir senha</h2>
      <p class="textoApoio">Informe o seu e-mail para receber o link de redefinição.</p>


      <form onsubmit="event.preventDefault(); solicitarResetSenha(this);">
        <input type="email" id="emailResetSenha" placeholder="Seu e-mail" autocomplete="email" required>
        <button type="submit">Enviar link</button>
      </form>


      <div id="msgResetSenha" class="status" aria-live="polite"></div>


      <div class="acoesAuth">
        <button type="button" class="linkBtn" onclick="alternarTela('telaEsqueciSenha', 'telaLoginMembro')">Voltar</button>
      </div>
    </section>


    <section id="telaNovaSenha" class="authCard oculto" aria-labelledby="titulo-nova-senha">
      <div class="marca">Painel de Governança</div>
      <h2 id="titulo-nova-senha">Criar nova senha</h2>
      <p class="textoApoio">Defina uma nova senha para voltar a acessar o sistema.</p>


      <form onsubmit="event.preventDefault(); redefinirSenha(this);">
        <input type="hidden" id="tokenRedefinicao" value="<?= resetToken || '' ?>">
        <input type="password" id="novaSenhaReset" placeholder="Nova senha" autocomplete="new-password" required>
        <input type="password" id="confirmacaoSenhaReset" placeholder="Confirmar nova senha" autocomplete="new-password" required>
        <button type="submit">Guardar nova senha</button>
      </form>


      <div id="msgNovaSenha" class="status" aria-live="polite"></div>
      <div class="acoesAuth">
        <button type="button" class="linkBtn" onclick="voltarAoInicio()">Voltar ao início</button>
      </div>
    </section>


    <section id="painelAdmin" class="painel painelAdmin oculto" aria-labelledby="titulo-admin">
      <header class="topoPainel">
        <div>
          <p class="rotulo">Painel administrativo</p>
          <h2 id="titulo-admin">Bem-vindo, <span id="nomeAdmin"></span></h2>
        </div>
      </header>


      <nav class="menuPainel" aria-label="Navegação administrativa">
        <div class="grupoMenu">
          <button type="button" id="btnAbaAdminDashboard" class="abaNav abaAtivaAdmin" onclick="abrirAbaAdmin('Dashboard')">Visão geral</button>
          <button type="button" id="btnAbaAdminMembros" class="abaNav" onclick="abrirAbaAdmin('Membros')">Membros</button>
          <button type="button" id="btnAbaAdminEventos" class="abaNav" onclick="abrirAbaAdmin('Eventos')">Eventos</button>
          <button type="button" id="btnAbaAdminTarefas" class="abaNav" onclick="abrirAbaAdmin('Tarefas')">Tarefas</button>
          <button type="button" id="btnAbaAdminPropostas" class="abaNav" onclick="abrirAbaAdmin('Propostas')">Propostas</button>
          <button type="button" id="btnAbaAdminHistorico" class="abaNav" onclick="abrirAbaAdmin('Historico')">Histórico</button>
        </div>
        <div class="grupoSaida">
          <button type="button" class="abaNav btnSaida" onclick="confirmarSaida('Admin')">Sair</button>
        </div>
      </nav>


      <section id="abaAdminDashboard">
        <div class="gradeIndicadores">
          <article class="cardIndicador"><span>Membros ativos</span><strong id="indMembrosAtivos">0</strong></article>
          <article class="cardIndicador"><span>Administradores</span><strong id="indAdmins">0</strong></article>
          <article class="cardIndicador"><span>Eventos em votação</span><strong id="indEventosAtivos">0</strong></article>
          <article class="cardIndicador"><span>Tarefas abertas</span><strong id="indTarefasAbertas">0</strong></article>
          <article class="cardIndicador"><span>Propostas em análise</span><strong id="indPropostasAnalise">0</strong></article>
          <article class="cardIndicador"><span>Participação média</span><strong id="indParticipacao">0%</strong></article>
        </div>


        <div class="painelGrid">
          <article class="cardSecao">
            <h3>Próximos eventos</h3>
            <div id="listaEventosAdmin"></div>
          </article>


          <article class="cardSecao">
            <h3>Cadastros pendentes</h3>
            <div id="listaMembrosPendentes"></div>
          </article>
        </div>


        <article class="cardSecao blocoQuorum">
          <h3>Painel de quórum</h3>
          <div id="listaQuorumAdmin"></div>
        </article>
      </section>


      <section id="abaAdminMembros" class="oculto">
        <div class="painelGrid">
          <article class="cardSecao">
            <h3>Membros ativos</h3>
            <div id="listaMembrosAtivos"></div>
          </article>


          <article class="cardSecao">
            <h3>Administradores</h3>
            <div id="listaAdmins"></div>
          </article>
        </div>
      </section>


      <section id="abaAdminEventos" class="oculto">
        <div class="painelGrid">
          <article class="cardSecao">
            <h3>Novo evento</h3>
            <form onsubmit="event.preventDefault(); criarEvento(this);">
              <input type="text" id="eventoTitulo" placeholder="Título do evento" required>
              <textarea id="eventoDescricao" placeholder="Descrição do evento" required></textarea>
              <input type="date" id="eventoDataEvento" required>
              <input type="date" id="eventoPrazoVotacao" required>
              <select id="eventoTipoVotacao">
                <option value="Sim/Não">Sim/Não</option>
              </select>
              <button type="submit" class="btnAdmin">Criar evento</button>
            </form>
            <div id="msgEvento" class="status" aria-live="polite"></div>
          </article>


          <article class="cardSecao">
            <h3>Eventos</h3>
            <div id="listaEventosGeraisAdmin"></div>
          </article>
        </div>
      </section>


      <section id="abaAdminTarefas" class="oculto">
        <div class="painelGrid">
          <article class="cardSecao">
            <h3>Nova tarefa</h3>
            <form onsubmit="event.preventDefault(); criarTarefa(this);">
              <select id="tarefaEvento" required></select>
              <input type="text" id="tarefaTitulo" placeholder="Título da tarefa" required>
              <textarea id="tarefaDescricao" placeholder="Descrição da tarefa" required></textarea>
              <input type="text" id="tarefaResponsavel" placeholder="Responsável">
              <input type="date" id="tarefaPrazo" required>
              <button type="submit" class="btnAdmin">Adicionar tarefa</button>
            </form>
            <div id="msgTarefa" class="status" aria-live="polite"></div>
          </article>


          <article class="cardSecao">
            <h3>Tarefas em acompanhamento</h3>
            <div id="listaTarefasAdmin"></div>
          </article>
        </div>
      </section>


      <section id="abaAdminPropostas" class="oculto">
        <article class="cardSecao">
          <h3>Propostas em análise</h3>
          <div id="listaPropostasAdmin"></div>
        </article>
      </section>


      <section id="abaAdminHistorico" class="oculto">
        <div class="painelGrid">
          <article class="cardSecao">
            <h3>Eventos Finalizados</h3>
            <div id="listaHistoricoEventos"></div>
          </article>
          <article class="cardSecao">
            <h3>Tarefas Concluídas</h3>
            <div id="listaHistoricoTarefas"></div>
          </article>
        </div>
      </section>
      
       </section>


    <section id="painelMembro" class="painel painelMembro oculto" aria-labelledby="titulo-membro">
      <header class="topoPainel">
        <div>
          <p class="rotulo">Área do membro</p>
          <h2 id="titulo-membro">Bem-vindo, <span id="nomeMembro"></span></h2>
        </div>
      </header>


      <nav class="menuPainel" aria-label="Navegação do membro">
        <div class="grupoMenu">
          <button type="button" id="btnAbaMembroInicio" class="abaNav abaAtiva" onclick="abrirAbaMembro('Inicio')">Início</button>
          <button type="button" id="btnAbaMembroEventos" class="abaNav" onclick="abrirAbaMembro('Eventos')">Eventos</button>
          <button type="button" id="btnAbaMembroTarefas" class="abaNav" onclick="abrirAbaMembro('Tarefas')">Tarefas</button>
          <button type="button" id="btnAbaMembroAgenda" class="abaNav" onclick="abrirAbaMembro('Agenda')">Agenda</button>
          <button type="button" id="btnAbaMembroIdeias" class="abaNav" onclick="abrirAbaMembro('Ideias')">Iniciativas</button>
          <button type="button" id="btnAbaMembroPendencias" class="abaNav" onclick="abrirAbaMembro('Pendencias')">Pendências</button>
          <button type="button" id="btnAbaMembroHistorico" class="abaNav" onclick="abrirAbaMembro('Historico')">Histórico</button>
        </div>
        <div class="grupoSaida">
          <button type="button" class="abaNav btnSaida" onclick="confirmarSaida('Membro')">Sair</button>
        </div>
      </nav>


      <section id="abaMembroInicio">
        <div class="gradeIndicadores">
          <article class="cardIndicador"><span>Eventos abertos</span><strong id="memEventosAbertos">0</strong></article>
          <article class="cardIndicador"><span>Votações pendentes</span><strong id="memVotacoesPendentes">0</strong></article>
          <article class="cardIndicador"><span>Tarefas em aberto</span><strong id="memTarefasAbertas">0</strong></article>
        </div>


        <div class="painelGrid">
          <article class="cardSecao">
            <h3>Agenda próxima</h3>
            <div id="listaAgendaMembro"></div>
          </article>


          <article class="cardSecao">
            <h3>Eventos em destaque</h3>
            <div id="listaEventosResumo"></div>
          </article>
        </div>
      </section>


      <section id="abaMembroEventos" class="oculto">
        <article class="cardSecao">
          <h3>Eventos e votação</h3>
          <div id="msgVoto" class="status" aria-live="polite"></div>
          <div id="listaEventosMembro"></div>
        </article>
      </section>


      <section id="abaMembroTarefas" class="oculto">
        <article class="cardSecao">
          <h3>Tarefas em acompanhamento</h3>
          <div id="listaTarefasMembro"></div>
        </article>
      </section>


      <section id="abaMembroAgenda" class="oculto">
        <article class="cardSecao">
          <h3>Agenda dos eventos</h3>
          <div id="agendaCompletaMembro"></div>
        </article>
      </section>


      <section id="abaMembroIdeias" class="oculto">
        <div class="painelGrid">
          <article class="cardSecao">
            <h3>Nova iniciativa</h3>
            <form onsubmit="event.preventDefault(); enviarProposta(this);">
              <input type="text" id="propostaTitulo" placeholder="Nome do evento ou iniciativa" required>
              <textarea id="propostaDescricao" placeholder="Descreva a proposta" required></textarea>
              <textarea id="propostaRecursos" placeholder="Informe os recursos necessários para a construção da proposta" required></textarea>
              <select id="propostaModoExibicaoAutor">
                <option value="Nome">Exibir meu nome</option>
                <option value="Anonimo">Enviar de forma anónima</option>
              </select>
              <button type="submit">Enviar proposta</button>
            </form>
            <div id="msgProposta" class="status" aria-live="polite"></div>
          </article>


          <article class="cardSecao">
            <h3>Minhas iniciativas</h3>
            <div id="listaMinhasPropostas"></div>
          </article>
        </div>
      </section>


      <section id="abaMembroPendencias" class="oculto">
        <article class="cardSecao">
          <h3>Minhas pendências</h3>
          <div id="listaPendenciasMembro"></div>
        </article>
      </section>
      <section id="abaMembroHistorico" class="oculto">
        <div class="painelGrid">
          <article class="cardSecao">
            <h3>Eventos Finalizados</h3>
            <div id="listaHistoricoEventosMembro"></div>
          </article>
          <article class="cardSecao">
            <h3>Tarefas Concluídas</h3>
            <div id="listaHistoricoTarefasMembro"></div>
          </article>
        </div>
      </section>
    </section>
  </main>


  <?!= include('JS'); ?>
</body>
</html>