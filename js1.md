jss:

<script>
let dadosUsuario = { id: "", nome: "", nivel: "" };
let saidaPendentePerfil = "";


const $ = id => document.getElementById(id);


function mostrarMensagem(id, texto, tipo = '') {
  const el = $(id);
  if (!el) return;
  el.className = 'status' + (tipo ? ` status-${tipo}` : '');
  el.textContent = texto || '';
}


function alternarTela(sair, entrar) {
  if ($(sair)) $(sair).classList.add('oculto');
  if ($(entrar)) $(entrar).classList.remove('oculto');
}


function ocultarTodasAsTelas() {
  ['telaLoginMembro','telaLoginAdmin','telaCadastro','telaEsqueciSenha',
   'telaNovaSenha','painelAdmin','painelMembro'].forEach(id => {
    const el = $(id);
    if (el) el.classList.add('oculto');
  });
}


function limparMensagens() {
  ['msgMembro','msgAdmin','msgCadastro','msgResetSenha','msgNovaSenha',
   'msgVoto','msgEvento','msgTarefa','msgProposta'].forEach(id => {
    if ($(id)) mostrarMensagem(id, '');
  });
}


function limparCamposLogin() {
  ['emailMembro','senhaMembro','emailAdmin','senhaAdmin'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
}


function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}


function textoValido(texto, min = 1, max = 500) {
  const v = String(texto || '').trim();
  return v.length >= min && v.length <= max;
}


function alternarDesabilitado(container, desabilitado) {
  if (!container) return;
  container.querySelectorAll('button, input, select, textarea').forEach(el => {
    el.disabled = desabilitado;
  });
}


function tratarErro(erro, msgId = null) {
  const mensagem = erro && erro.message ? erro.message : 'Falha na comunicação com o sistema.';
  if (msgId) mostrarMensagem(msgId, mensagem, 'erro');
  else alert(mensagem);
}


function executarNoServidor(nomeFuncao, args, onSuccess, msgId = null) {
  google.script.run
    .withSuccessHandler(onSuccess)
    .withFailureHandler(err => tratarErro(err, msgId))[nomeFuncao](...args);
}


// ==========================================
// AUTENTICAÇÃO E REGISTO
// ==========================================
function entrarSistema(tipo, formEl) {
  const isMembro = tipo === 'Membro';
  const email = $(isMembro ? 'emailMembro' : 'emailAdmin')?.value.trim() || '';
  const senha = $(isMembro ? 'senhaMembro' : 'senhaAdmin')?.value.trim() || '';
  const msgId = isMembro ? 'msgMembro' : 'msgAdmin';


  if (!emailValido(email) || !senha) {
    return mostrarMensagem(msgId, 'Preencha os dados corretamente.', 'erro');
  }


  alternarDesabilitado(formEl, true);
  mostrarMensagem(msgId, 'A validar acesso...', 'info');


  executarNoServidor('autenticarUsuario', [email, senha, tipo], res => {
    alternarDesabilitado(formEl, false);
    if (!res.sucesso) return mostrarMensagem(msgId, res.mensagem, 'erro');


    dadosUsuario = { id: res.id, nome: res.nome, nivel: res.nivel };
    limparMensagens();


    if (tipo === 'Admin') {
      if ($('nomeAdmin')) $('nomeAdmin').textContent = res.nome;
      ocultarTodasAsTelas();
      if ($('painelAdmin')) $('painelAdmin').classList.remove('oculto');
      abrirAbaAdmin('Dashboard');
    } else {
      if ($('nomeMembro')) $('nomeMembro').textContent = res.nome;
      ocultarTodasAsTelas();
      if ($('painelMembro')) $('painelMembro').classList.remove('oculto');
      abrirAbaMembro('Inicio');
    }
  }, msgId);
}


function enviarCadastro(formEl) {
  const nome = $('novoNome')?.value.trim() || '';
  const email = $('novoEmail')?.value.trim() || '';
  const senha = $('novaSenhaCadastro')?.value.trim() || '';
  const aceitou = $('aceitePolitica')?.checked || false;


  if (!textoValido(nome, 3, 120) || !emailValido(email) || senha.length < 8 || !aceitou) {
    return mostrarMensagem('msgCadastro', 'Verifique os dados informados.', 'erro');
  }


  alternarDesabilitado(formEl, true);
  mostrarMensagem('msgCadastro', 'A enviar solicitação...', 'info');


  executarNoServidor('cadastrarNovoMembro', [nome, email, senha, aceitou], res => {
    alternarDesabilitado(formEl, false);
    mostrarMensagem('msgCadastro', res.mensagem, res.sucesso ? 'sucesso' : 'erro');
    if (res.sucesso && formEl) formEl.reset();
  }, 'msgCadastro');
}


// ==========================================
// NAVEGAÇÃO
// ==========================================
function abrirAbaAdmin(nome) {
  ['Dashboard','Membros','Eventos','Tarefas','Propostas','Historico'].forEach(aba => {
    const painel = $('abaAdmin' + aba);
    const botao = $('btnAbaAdmin' + aba);
    if (painel) painel.classList.add('oculto');
    if (botao) botao.classList.remove('abaAtivaAdmin');
  });


  const abaAtual = $('abaAdmin' + nome);
  const botaoAtual = $('btnAbaAdmin' + nome);
  if (abaAtual) abaAtual.classList.remove('oculto');
  if (botaoAtual) botaoAtual.classList.add('abaAtivaAdmin');


  if (nome === 'Dashboard') carregarPainelAdmin();
  if (nome === 'Membros') carregarMembrosAdmin();
  if (nome === 'Eventos') carregarEventosAdmin();
  if (nome === 'Tarefas') carregarTarefasAdmin();
  if (nome === 'Propostas') carregarPropostasAdmin();
  if (nome === 'Historico') carregarHistoricoAdmin();
}


function abrirAbaMembro(nome) {
  ['Inicio','Eventos','Tarefas','Agenda','Ideias','Pendencias','Historico'].forEach(aba => {
    const painel = $('abaMembro' + aba);
    const botao = $('btnAbaMembro' + aba);
    if (painel) painel.classList.add('oculto');
    if (botao) botao.classList.remove('abaAtiva');
  });


  const abaAtual = $('abaMembro' + nome);
  const botaoAtual = $('btnAbaMembro' + nome);
  if (abaAtual) abaAtual.classList.remove('oculto');
  if (botaoAtual) botaoAtual.classList.add('abaAtiva');


  if (['Inicio','Eventos','Tarefas','Agenda','Pendencias'].includes(nome)) carregarPainelMembro();
  if (nome === 'Historico') carregarHistoricoMembro();
  if (nome === 'Ideias') carregarMinhasPropostas();
}


// ==========================================
// PROPOSTAS DO MEMBRO
// ==========================================
function carregarMinhasPropostas() {
  executarNoServidor('listarMinhasPropostas', [dadosUsuario.id], res => {
    if (!res.sucesso || !$('listaMinhasPropostas')) return;


    $('listaMinhasPropostas').innerHTML = res.propostas.length
      ? res.propostas.map(item => `
          <div class="itemLista">
            <h4>${item.titulo}</h4>
            <p>${item.descricao}</p>
            <div class="linhaMeta">
              <span>Status: ${item.status}</span>
              <span>Envio: ${item.criadoEm || 'Não informado'}</span>
              <span>Exibição: ${item.nomeExibicao || 'Não informado'}</span>
            </div>
            ${item.recursos ? `<p><strong>Recursos:</strong> ${item.recursos}</p>` : ''}
          </div>
        `).join('')
      : '<p>Você ainda não enviou iniciativas.</p>';
  });
}


function gerarHTMLItemLista(titulo, descricao, metaArray = []) {
  const metas = metaArray.length
    ? `<div class="linhaMeta">${metaArray.map(m => `<span>${m}</span>`).join('')}</div>`
    : '';
  return `<div class="itemLista"><h4>${titulo}</h4>${descricao ? `<p>${descricao}</p>` : ''}${metas}</div>`;
}


// ==========================================
// PAINÉIS DO ADMINISTRADOR
// ==========================================
function carregarPainelAdmin() {
  executarNoServidor('carregarDashboardAdmin', [dadosUsuario.id], res => {
    if (!res.sucesso) return;


    if ($('indMembrosAtivos')) $('indMembrosAtivos').textContent = res.indicadores.membrosAtivos;
    if ($('indAdmins')) $('indAdmins').textContent = res.indicadores.administradores;
    if ($('indEventosAtivos')) $('indEventosAtivos').textContent = res.indicadores.eventosAtivos;
    if ($('indTarefasAbertas')) $('indTarefasAbertas').textContent = res.indicadores.tarefasEmAberto;
    if ($('indPropostasAnalise')) $('indPropostasAnalise').textContent = res.indicadores.propostasAnalise;
    if ($('indParticipacao')) $('indParticipacao').textContent = res.indicadores.taxaParticipacao + '%';


    if ($('listaEventosAdmin')) {
      $('listaEventosAdmin').innerHTML = res.eventosProximos.length
        ? res.eventosProximos.map(item =>
            gerarHTMLItemLista(item.titulo, '', [`Data: ${item.dataEvento}`, `Status: ${item.status}`])
          ).join('')
        : '<p>Não há eventos agendados.</p>';
    }


    if ($('listaQuorumAdmin')) {
      $('listaQuorumAdmin').innerHTML = res.quoruns.length
        ? res.quoruns.map(item => `
            <div class="quorumItem">
              <h4>${item.titulo}</h4>
              <p>Quórum atual: ${item.totalVotos} de ${item.totalMembros} membros (${item.percentual}%)</p>
              <div class="barraQuorum"><span style="width:${Math.max(0,Math.min(item.percentual,100))}%"></span></div>
            </div>
          `).join('')
        : '<p>Não há eventos em votação no momento.</p>';
    }


    carregarMembrosPendentesDashboard();
  });
}


function carregarMembrosPendentesDashboard() {
  executarNoServidor('listarMembrosPendentes', [], lista => {
    if (!$('listaMembrosPendentes')) return;
    $('listaMembrosPendentes').innerHTML = lista.length
      ? lista.map(item => `
          <div class="itemLista">
            <h4>${item.nome} (${item.id})</h4>
            <p>${item.email}</p>
            <button class="btnAdmin" onclick="aprovarMembro('${item.id}')" style="margin-top:10px;">Aprovar cadastro</button>
          </div>
        `).join('')
      : '<p>Não há solicitações pendentes.</p>';
  });
}


function aprovarMembro(id) {
  executarNoServidor('aprovarMembroAdmin', [id, dadosUsuario.id], () => {
    carregarPainelAdmin();
    carregarMembrosAdmin();
  });
}


function carregarMembrosAdmin() {
  executarNoServidor('listarMembrosPorPerfil', [dadosUsuario.id], res => {
    if (!res.sucesso) return;


    if ($('listaMembrosAtivos')) {
      $('listaMembrosAtivos').innerHTML = res.membros.length
        ? res.membros.map(item =>
            gerarHTMLItemLista(`${item.nome} (${item.id})`, item.email, [`Perfil: ${item.nivel}`, `Status: ${item.status}`])
          ).join('')
        : '<p>Nenhum membro ativo.</p>';
    }


    if ($('listaAdmins')) {
      $('listaAdmins').innerHTML = res.admins.length
        ? res.admins.map(item =>
            gerarHTMLItemLista(`${item.nome} (${item.id})`, item.email, [`Perfil: ${item.nivel}`, `Status: ${item.status}`])
          ).join('')
        : '<p>Nenhum administrador ativo.</p>';
    }
  });
}


function carregarEventosAdmin() {
  executarNoServidor('listarTodosEventosAdmin', [dadosUsuario.id], res => {
    if (!res.sucesso) return;


    const selectEvt = $('tarefaEvento');
    if (selectEvt) {
      selectEvt.innerHTML = res.eventos.length
        ? res.eventos.map(item => `<option value="${item.id}">${item.id} - ${item.titulo}</option>`).join('')
        : '<option value="">Sem eventos disponíveis</option>';
    }


    if ($('listaEventosGeraisAdmin')) {
      $('listaEventosGeraisAdmin').innerHTML = res.eventos.length
        ? res.eventos.map(item => `
            <div class="itemLista">
              <h4>${item.titulo} (${item.id})</h4>
              <p>${item.descricao}</p>
              <div class="linhaMeta">
                <span>Data: ${item.dataEvento}</span>
                <span>Prazo: ${item.prazoVotacao}</span>
                <span>Status: ${item.status}</span>
                <span>Sim: ${item.sim || 0} | Não: ${item.nao || 0} | Total: ${item.totalVotos}</span>
              </div>
              <div class="acoesInline">
                <select id="selStatus${item.id}">
                  ${['Em análise','Em votação','Aprovada','Rejeitada','Em execução','Concluída','Arquivada']
                    .map(s => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${s}</option>`)
                    .join('')}
                </select>
                <button class="btnAdmin" onclick="atualizarStatusEvento('${item.id}')">Atualizar status</button>
              </div>
            </div>
          `).join('')
        : '<p>Não há eventos no momento.</p>';
    }
  });
}


function atualizarStatusEvento(idEvento) {
  const selectEl = $('selStatus' + idEvento);
  if (!selectEl) return;
  const novoStatus = selectEl.value;


  executarNoServidor('atualizarStatusEvento', [idEvento, novoStatus, dadosUsuario.id], () => {
    carregarEventosAdmin();
    carregarPainelAdmin();
    carregarHistoricoAdmin();
  });
}


function carregarHistoricoAdmin() {
  executarNoServidor('carregarHistoricoAdmin', [dadosUsuario.id], res => {
    if (!res.sucesso) return;


    if ($('listaHistoricoEventos')) {
      $('listaHistoricoEventos').innerHTML = res.eventos.length
        ? res.eventos.map(item => `
            <div class="itemLista">
              <h4>${item.titulo} (${item.id})</h4>
              <p>${item.descricao}</p>
              <div class="linhaMeta">
                <span>Data: ${item.dataEvento}</span>
                <span>Status: ${item.status}</span>
                <span>Sim: ${item.sim || 0} | Não: ${item.nao || 0} | Total: ${item.totalVotos}</span>
              </div>
              <div class="acoesInline">
                <select id="selHistStatus${item.id}">
                  ${['Em análise','Em votação','Aprovada','Rejeitada','Em execução','Concluída','Arquivada']
                    .map(s => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${s}</option>`)
                    .join('')}
                </select>
                <button class="btnAdmin" onclick="atualizarStatusEvento('${item.id}')">Alterar status</button>
              </div>
            </div>
          `).join('')
        : '<p>Não há eventos finalizados.</p>';
    }


    if ($('listaHistoricoTarefas')) {
      $('listaHistoricoTarefas').innerHTML = res.tarefas.length
        ? res.tarefas.map(item => `
            <div class="itemLista">
              <h4>${item.titulo} (${item.id})</h4>
              <div class="linhaMeta">
                <span>Evento: ${item.idEvento}</span>
                <span>Resp: ${item.responsavel || 'N/A'}</span>
                <span>Concluída em: ${item.prazo}</span>
              </div>
              <div class="acoesInline">
                <select id="selHistTar${item.id}">
                  ${['Pendente','Em andamento','Concluída']
                    .map(s => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${s}</option>`)
                    .join('')}
                </select>
                <button class="btnAdmin" onclick="atualizarStatusTarefa('${item.id}')">Alterar status</button>
              </div>
            </div>
          `).join('')
        : '<p>Não há tarefas concluídas.</p>';
    }
  });
}


function criarEvento(formEl) {
  const dados = {
    titulo: $('eventoTitulo')?.value.trim() || '',
    descricao: $('eventoDescricao')?.value.trim() || '',
    dataEvento: $('eventoDataEvento')?.value || '',
    prazoVotacao: $('eventoPrazoVotacao')?.value || '',
    tipoVotacao: $('eventoTipoVotacao')?.value || ''
  };


  alternarDesabilitado(formEl, true);
  executarNoServidor('criarEventoAdmin', [dados, dadosUsuario.id], res => {
    alternarDesabilitado(formEl, false);
    mostrarMensagem('msgEvento', res.mensagem, res.sucesso ? 'sucesso' : 'erro');
    if (res.sucesso && formEl) {
      formEl.reset();
      carregarEventosAdmin();
    }
  }, 'msgEvento');
}


function carregarTarefasAdmin() {
  executarNoServidor('listarTarefasAdmin', [dadosUsuario.id], res => {
    if (!res.sucesso || !$('listaTarefasAdmin')) return;


    $('listaTarefasAdmin').innerHTML = res.tarefas.length
      ? res.tarefas.map(item => `
          <div class="itemLista">
            <h4>${item.titulo} (${item.id})</h4>
            <p>${item.descricao}</p>
            <div class="linhaMeta">
              <span>Evento: ${item.idEvento}</span>
              <span>Responsável: ${item.responsavel || 'Não definido'}</span>
              <span>Prazo: ${item.prazo}</span>
              <span>Status: ${item.status}</span>
            </div>
            <div class="acoesInline">
              <select id="selTar${item.id}">
                ${['Pendente','Em andamento','Concluída']
                  .map(s => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${s}</option>`)
                  .join('')}
              </select>
              <button class="btnAdmin" onclick="atualizarStatusTarefa('${item.id}')">Atualizar</button>
            </div>
          </div>
        `).join('')
      : '<p>Não há tarefas registadas.</p>';
  });
}


function atualizarStatusTarefa(idTarefa) {
  const selectEl = $('selTar' + idTarefa) || $('selHistTar' + idTarefa);
  if (!selectEl) return;
  const novoStatus = selectEl.value;


  executarNoServidor('atualizarStatusTarefa', [idTarefa, novoStatus, dadosUsuario.id], () => {
    carregarTarefasAdmin();
    carregarPainelAdmin();
    carregarHistoricoAdmin();
  });
}


function criarTarefa(formEl) {
  const dados = {
    idEvento: $('tarefaEvento')?.value || '',
    titulo: $('tarefaTitulo')?.value.trim() || '',
    descricao: $('tarefaDescricao')?.value.trim() || '',
    responsavel: $('tarefaResponsavel')?.value.trim() || '',
    prazo: $('tarefaPrazo')?.value || ''
  };


  alternarDesabilitado(formEl, true);
  executarNoServidor('criarTarefaAdmin', [dados, dadosUsuario.id], res => {
    alternarDesabilitado(formEl, false);
    mostrarMensagem('msgTarefa', res.mensagem, res.sucesso ? 'sucesso' : 'erro');
    if (res.sucesso && formEl) {
      formEl.reset();
      carregarTarefasAdmin();
    }
  }, 'msgTarefa');
}


function carregarPropostasAdmin() {
  executarNoServidor('listarPropostasEmAnalise', [dadosUsuario.id], res => {
    if (!res.sucesso || !$('listaPropostasAdmin')) return;


    $('listaPropostasAdmin').innerHTML = res.propostas.length
      ? res.propostas.map(item => `
          <div class="itemLista">
            <h4>${item.titulo} (${item.id})</h4>
            <p>${item.descricao}</p>
            <p><strong>Recursos:</strong> ${item.recursos}</p>
            <p><strong>Autor:</strong> ${item.nomeExibicao || item.idAutor}</p>
            <div class="acoesInline" style="margin-top:15px;">
              <input type="date" id="dataEvtProp${item.id}" required>
              <input type="date" id="prazoVotProp${item.id}" required>
              <button class="btnAdmin" onclick="aprovarProposta('${item.id}')">Aprovar para Votação</button>
            </div>
          </div>
        `).join('')
      : '<p>Não há propostas em análise.</p>';
  });
}


function aprovarProposta(idProposta) {
  const dataEvt = $('dataEvtProp' + idProposta)?.value || '';
  const prazoVot = $('prazoVotProp' + idProposta)?.value || '';


  if (!dataEvt || !prazoVot) return alert("Preencha as datas para aprovar.");


  executarNoServidor(
    'aprovarPropostaAdmin',
    [idProposta, { dataEvento: dataEvt, prazoVotacao: prazoVot, tipoVotacao: 'Sim/Não' }, dadosUsuario.id],
    () => {
      carregarPropostasAdmin();
      carregarEventosAdmin();
      carregarPainelAdmin();
    }
  );
}


// ==========================================
// PAINÉIS DO MEMBRO
// ==========================================
function carregarPainelMembro() {
  executarNoServidor('carregarDashboardMembro', [dadosUsuario.id], res => {
    if (!res.sucesso) return;


    if ($('memEventosAbertos')) $('memEventosAbertos').textContent = res.resumo.eventosAbertos;
    if ($('memVotacoesPendentes')) $('memVotacoesPendentes').textContent = res.resumo.votacoesPendentes;
    if ($('memTarefasAbertas')) $('memTarefasAbertas').textContent = res.resumo.tarefasEmAberto;


    const htmlAgenda = res.agenda.length
      ? res.agenda.map(item =>
          gerarHTMLItemLista(item.titulo, item.descricao, [`Data: ${item.dataEvento}`, `Status: ${item.status}`])
        ).join('')
      : '<p>Não há eventos agendados.</p>';


    if ($('listaAgendaMembro')) $('listaAgendaMembro').innerHTML = htmlAgenda;
    if ($('agendaCompletaMembro')) $('agendaCompletaMembro').innerHTML = htmlAgenda;


    carregarEventosComVoto();
    carregarTarefasMembro();
  }, 'msgVoto');
}


function carregarEventosComVoto() {
  executarNoServidor('listarEventosParaMembro', [dadosUsuario.id], res => {
    if (!res.sucesso) return;


    const eventos = res.eventos || [];


    if ($('listaEventosResumo')) {
      $('listaEventosResumo').innerHTML = eventos.length
        ? eventos.map(item =>
            gerarHTMLItemLista(item.titulo, item.descricao, [`Votos: ${item.totalVotos}`, `Faltantes: ${item.faltantes}`])
          ).join('')
        : '<p>Não há eventos em destaque.</p>';
    }


    const pendentes = eventos.filter(p => p.status === 'Em votação' && !p.jaVotou);
    if ($('listaPendenciasMembro')) {
      $('listaPendenciasMembro').innerHTML = pendentes.length
        ? pendentes.map(item =>
            gerarHTMLItemLista(item.titulo, item.descricao, [`Prazo: ${item.prazoVotacao}`])
          ).join('')
        : '<p>Não há pendências.</p>';
    }


    if ($('listaEventosMembro')) {
      $('listaEventosMembro').innerHTML = eventos.length
        ? eventos.map(item => `
            <div class="blocoVotacao ${item.jaVotou ? 'votoConcluido' : ''}" id="blocoEvt${item.id}">
              <div class="tag">${item.status}</div>
              <h4>${item.titulo}</h4>
              <p>${item.descricao}</p>
              <div class="linhaMeta">
                <span>Prazo: ${item.prazoVotacao}</span>
                <span>Votos: ${item.totalVotos}</span>
                <span>Faltantes: ${item.faltantes}</span>
              </div>
              ${item.jaVotou
                ? `<p style="margin-top:10px;"><strong>O seu voto: ${item.meuVoto}</strong></p>`
                : `<div class="acoesVoto">
                    <button onclick="votarEvento('${item.id}', 'Sim', this)">Votar: Sim</button>
                    <button onclick="votarEvento('${item.id}', 'N\u00e3o', this)">Votar: N\u00e3o</button>
                  </div>`}
            </div>
          `).join('')
        : '<p>Não há eventos para votação no momento.</p>';
    }
  });
}


function votarEvento(idEvento, voto, btnEl) {
  const bloco = $('blocoEvt' + idEvento);
  const acoesVoto = bloco ? bloco.querySelector('.acoesVoto') : null;


  if (acoesVoto) acoesVoto.querySelectorAll('button').forEach(b => b.disabled = true);


  if (bloco) {
    let feedbackEl = bloco.querySelector('.feedbackVoto');
    if (!feedbackEl) {
      feedbackEl = document.createElement('p');
      feedbackEl.className = 'feedbackVoto';
      bloco.appendChild(feedbackEl);
    }
    feedbackEl.textContent = 'A registar o voto...';
    feedbackEl.style.cssText = 'margin-top:8px;color:#555;font-style:italic;';
  }


  executarNoServidor('registrarVoto', [idEvento, dadosUsuario.id, voto], res => {
    const bloco = $('blocoEvt' + idEvento);
    if (!bloco) return;


    let feedbackEl = bloco.querySelector('.feedbackVoto');
    if (!feedbackEl) {
      feedbackEl = document.createElement('p');
      feedbackEl.className = 'feedbackVoto';
      bloco.appendChild(feedbackEl);
    }


    feedbackEl.textContent = res.mensagem;


    if (res.sucesso) {
      feedbackEl.style.cssText = 'margin-top:8px;color:#1e5631;font-weight:600;background:#d4edda;padding:6px 10px;border-radius:6px;';
      const acoesVoto = bloco.querySelector('.acoesVoto');
      if (acoesVoto) acoesVoto.remove();
      bloco.classList.add('votoConcluido');
      setTimeout(() => carregarEventosComVoto(), 800);
    } else {
      feedbackEl.style.cssText = 'margin-top:8px;color:#7b1a2e;font-weight:600;background:#fce4ec;padding:6px 10px;border-radius:6px;';
      const acoesVoto = bloco.querySelector('.acoesVoto');
      if (acoesVoto) acoesVoto.querySelectorAll('button').forEach(b => b.disabled = false);
    }
  }, null);
}


function carregarTarefasMembro() {
  executarNoServidor('listarTarefasDoMembro', [dadosUsuario.id], res => {
    if (!res.sucesso) return;


    const html = res.tarefas && res.tarefas.length
      ? res.tarefas.map(item =>
          gerarHTMLItemLista(`${item.titulo} (${item.id})`, item.descricao, [
            `Evento: ${item.idEvento}`,
            `Responsável: ${item.responsavel || 'Não definido'}`,
            `Prazo: ${item.prazo}`,
            `Status: ${item.status}`
          ])
        ).join('')
      : '<p>Não há tarefas disponíveis.</p>';


    if ($('listaTarefasMembro')) $('listaTarefasMembro').innerHTML = html;
    if ($('listaTarefasResumoPainel')) $('listaTarefasResumoPainel').innerHTML = html;
  });
}


function carregarHistoricoMembro() {
  executarNoServidor('carregarHistoricoMembro', [dadosUsuario.id], res => {
    if (!res.sucesso) return;


    if ($('listaHistoricoEventosMembro')) {
      $('listaHistoricoEventosMembro').innerHTML = res.eventos.length
        ? res.eventos.map(item =>
            gerarHTMLItemLista(item.titulo, item.descricao, [`Data: ${item.dataEvento}`, `Status: ${item.status}`])
          ).join('')
        : '<p>Não há eventos finalizados.</p>';
    }


    if ($('listaHistoricoTarefasMembro')) {
      $('listaHistoricoTarefasMembro').innerHTML = res.tarefas.length
        ? res.tarefas.map(item =>
            gerarHTMLItemLista(item.titulo, '', [
              `Evento: ${item.idEvento}`,
              `Resp: ${item.responsavel || 'N/A'}`,
              `Concluída em: ${item.prazo}`
            ])
          ).join('')
        : '<p>Não há tarefas concluídas.</p>';
    }
  });
}


function enviarProposta(formEl) {
  const dados = {
    titulo: $('propostaTitulo')?.value.trim() || '',
    descricao: $('propostaDescricao')?.value.trim() || '',
    recursos: $('propostaRecursos')?.value.trim() || '',
    modoExibicaoAutor: $('propostaModoExibicaoAutor')?.value || 'Nome'
  };


  alternarDesabilitado(formEl, true);
  executarNoServidor('criarPropostaMembro', [dados, dadosUsuario.id], res => {
    alternarDesabilitado(formEl, false);
    mostrarMensagem('msgProposta', res.mensagem, res.sucesso ? 'sucesso' : 'erro');
    if (res.sucesso && formEl) {
      formEl.reset();
      carregarMinhasPropostas();
    }
  }, 'msgProposta');
}


// ==========================================
// SAÍDA E RESET DE SENHA
// ==========================================
function confirmarSaida(perfil) {
  saidaPendentePerfil = perfil;
  if ($('modalSaida')) $('modalSaida').remove();


  document.body.insertAdjacentHTML('beforeend', `
    <div id="modalSaida" class="modalConfirmacao">
      <div class="modalBox">
        <h3>Confirmar sa\u00edda</h3>
        <p>Tem a certeza de que deseja sair de forma segura do sistema?</p>
        <div class="modalAcoes">
          <button class="btnSecundario" onclick="fecharModalSaida()">Cancelar</button>
          <button onclick="efetuarSaida()">Sair Agora</button>
        </div>
      </div>
    </div>
  `);
}


function fecharModalSaida() {
  if ($('modalSaida')) $('modalSaida').remove();
  saidaPendentePerfil = "";
}


function efetuarSaida() {
  if ($('modalSaida')) $('modalSaida').remove();
  dadosUsuario = { id: "", nome: "", nivel: "" };
  saidaPendentePerfil = "";
  ocultarTodasAsTelas();
  limparCamposLogin();
  limparMensagens();
  if ($('telaLoginMembro')) $('telaLoginMembro').classList.remove('oculto');
}


function solicitarResetSenha(formEl) {
  const email = $('emailResetSenha')?.value.trim() || '';
  if (!emailValido(email)) return mostrarMensagem('msgResetSenha', 'Informe um e-mail v\u00e1lido.', 'erro');


  alternarDesabilitado(formEl, true);
  executarNoServidor('solicitarRedefinicaoSenha', [email], res => {
    alternarDesabilitado(formEl, false);
    mostrarMensagem('msgResetSenha', res.mensagem, res.sucesso ? 'sucesso' : 'erro');
    if (res.sucesso && formEl) formEl.reset();
  }, 'msgResetSenha');
}


function redefinirSenha(formEl) {
  const token = $('tokenRedefinicao')?.value.trim() || '';
  const novaSenha = $('novaSenhaReset')?.value.trim() || '';
  const confirmacao = $('confirmacaoSenhaReset')?.value.trim() || '';


  if (!token || novaSenha !== confirmacao || novaSenha.length < 8) {
    return mostrarMensagem('msgNovaSenha', 'As senhas n\u00e3o coincidem ou s\u00e3o inv\u00e1lidas.', 'erro');
  }


  alternarDesabilitado(formEl, true);
  executarNoServidor('redefinirSenhaPorToken', [token, novaSenha], res => {
    alternarDesabilitado(formEl, false);
    mostrarMensagem('msgNovaSenha', res.mensagem, res.sucesso ? 'sucesso' : 'erro');
    if (res.sucesso) setTimeout(() => window.location.href = window.location.pathname, 1400);
  }, 'msgNovaSenha');
}


function voltarAoInicio() {
  dadosUsuario = { id: "", nome: "", nivel: "" };
  saidaPendentePerfil = "";
  ocultarTodasAsTelas();
  limparMensagens();
  limparCamposLogin();
  if ($('telaLoginMembro')) $('telaLoginMembro').classList.remove('oculto');
}


(function initResetScreen() {
  if (window.APP_RESET_MODE && window.APP_RESET_TOKEN) {
    ocultarTodasAsTelas();
    if ($('telaNovaSenha')) $('telaNovaSenha').classList.remove('oculto');


    executarNoServidor('validarTokenRedefinicao', [window.APP_RESET_TOKEN], res => {
      if (!res.sucesso) {
        mostrarMensagem('msgNovaSenha', res.mensagem, 'erro');
        if ($('novaSenhaReset')) $('novaSenhaReset').disabled = true;
        if ($('confirmacaoSenhaReset')) $('confirmacaoSenhaReset').disabled = true;
      }
    }, 'msgNovaSenha');
  }
})();
</script>