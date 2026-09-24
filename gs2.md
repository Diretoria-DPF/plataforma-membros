gs: const idPlanilhaMestre = SpreadsheetApp.getActiveSpreadsheet().getId();


const ABAS = {
  MEMBROS: "Tabela Membros",
  EVENTOS: "Tabela Pautas",
  VOTOS: "Tabela Votos",
  TAREFAS: "Tabela Tarefas",
  LOGS: "Tabela Logs",
  PROPOSTAS: "Tabela Propostas",
  RESET: "Tabela ResetSenha"
};


const STATUS = {
  MEMBRO_ATIVO: "Ativo",
  MEMBRO_PENDENTE: "Pendente",


  EVENTO_ANALISE: "Em análise",
  EVENTO_VOTACAO: "Em votação",
  EVENTO_APROVADO: "Aprovada",
  EVENTO_REJEITADO: "Rejeitada",
  EVENTO_EXECUCAO: "Em execução",
  EVENTO_CONCLUIDO: "Concluída",
  EVENTO_ARQUIVADO: "Arquivada",


  TAREFA_PENDENTE: "Pendente",
  TAREFA_ANDAMENTO: "Em andamento",
  TAREFA_CONCLUIDA: "Concluída",


  PROPOSTA_ANALISE: "Em análise",
  PROPOSTA_APROVADA: "Aprovada"
};


const PREFIXOS = {
  MEMBRO: "USR",
  EVENTO: "EVT",
  VOTO: "VOT",
  TAREFA: "TAR",
  LOG: "LOG",
  PROPOSTA: "PRP",
  RESET: "RST"
};


function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


function doGet(e) {
  const token = e && e.parameter ? String(e.parameter.token || "").trim() : "";
  const modo = e && e.parameter ? String(e.parameter.modo || "").trim() : "";


  const tpl = HtmlService.createTemplateFromFile("Index");
  tpl.resetToken = token;
  tpl.resetMode = modo;
  tpl.isResetMode = modo === "redefinir" && token !== "";


  return tpl.evaluate()
    .setTitle("Painel de Governança")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}


function getPlanilha() {
  return SpreadsheetApp.openById(idPlanilhaMestre);
}


function getAba(nomeAba) {
  const aba = getPlanilha().getSheetByName(nomeAba);
  if (!aba) throw new Error(`A aba "${nomeAba}" não foi encontrada.`);
  return aba;
}


function getDadosAba(nomeAba) {
  return getAba(nomeAba).getDataRange().getValues();
}


function inserirLinha(nomeAba, valores) {
  const aba = getAba(nomeAba);
  const linha = aba.getLastRow() + 1;
  aba.getRange(linha, 1, 1, valores.length).setValues([valores]);
}


function normalizarTexto(valor) {
  return String(valor || "").trim();
}


function validarTexto(valor, min, max) {
  const txt = normalizarTexto(valor);
  return txt.length >= min && txt.length <= max;
}


function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarTexto(email).toLowerCase());
}


function formatarData(valor) {
  if (!valor) return "";
  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor)) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(valor).trim();
}


function resposta(sucesso, mensagem, extra) {
  return Object.assign({ sucesso, mensagem }, extra || {});
}


function toHex(bytes) {
  return bytes.map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}


function gerarHashSenha(senha) {
  const valor = normalizarTexto(senha);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, valor, Utilities.Charset.UTF_8);
  return toHex(digest);
}


function senhaValida(senha) {
  return normalizarTexto(senha).length >= 8;
}


function gerarTokenSeguro() {
  const raw = Utilities.getUuid() + "|" + new Date().getTime() + "|" + Math.random();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return toHex(digest);
}


function gerarIdSequencial(nomeAba, prefixo) {
  const dados = getDadosAba(nomeAba);
  const ids = dados.slice(1).map(l => String(l[0] || ""));
  let maior = 0;


  ids.forEach(id => {
    const match = id.match(new RegExp("^" + prefixo + "-(\\d+)$"));
    if (match) {
      const numero = parseInt(match[1], 10);
      if (numero > maior) maior = numero;
    }
  });


  const proximo = String(maior + 1).padStart(3, "0");
  return `${prefixo}-${proximo}`;
}


function obterNomePorReferencia(refId) {
  if (!refId) return "";


  const membro = obterMembroPorId(refId);
  if (membro) return membro.nome;


  const eventos = getDadosAba(ABAS.EVENTOS).slice(1);
  const evento = eventos.find(l => l[0] === refId);
  if (evento) return evento[1];


  const propostas = getDadosAba(ABAS.PROPOSTAS).slice(1);
  const proposta = propostas.find(l => l[0] === refId);
  if (proposta) return proposta[1];


  const tarefas = getDadosAba(ABAS.TAREFAS).slice(1);
  const tarefa = tarefas.find(l => l[0] === refId);
  if (tarefa) return tarefa[2];


  return "";
}


function registrarLog(acao, executorId, alvoId, detalhes) {
  const id = gerarIdSequencial(ABAS.LOGS, PREFIXOS.LOG);
  const executorNome = obterNomePorReferencia(executorId);
  const alvoNome = obterNomePorReferencia(alvoId);


  inserirLinha(ABAS.LOGS, [
    id,
    new Date(),
    acao || "",
    executorId || "",
    executorNome || "",
    alvoId || "",
    alvoNome || "",
    detalhes || ""
  ]);
}


function obterMembroPorId(idMembro) {
  const dados = getDadosAba(ABAS.MEMBROS);
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][0] === idMembro) {
      return {
        id: dados[i][0],
        nome: dados[i][1],
        email: dados[i][2],
        senhaHash: dados[i][3],
        nivel: dados[i][4],
        status: dados[i][5],
        aceitouPolitica: dados[i][6]
      };
    }
  }
  return null;
}


function obterMembroPorEmail(emailInput) {
  const email = normalizarTexto(emailInput).toLowerCase();
  const dados = getDadosAba(ABAS.MEMBROS);


  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][2]).trim().toLowerCase() === email) {
      return {
        id: dados[i][0],
        nome: dados[i][1],
        email: dados[i][2],
        senhaHash: dados[i][3],
        nivel: dados[i][4],
        status: dados[i][5],
        aceitouPolitica: dados[i][6]
      };
    }
  }
  return null;
}


function validarAdminPorId(idUsuarioExecutor) {
  const usuario = obterMembroPorId(idUsuarioExecutor);
  return !!(usuario && usuario.status === STATUS.MEMBRO_ATIVO && usuario.nivel === "Admin");
}


function autenticarUsuario(emailInput, senhaInput, tipoAcessoRequisitado) {
  const email = normalizarTexto(emailInput).toLowerCase();
  const senha = normalizarTexto(senhaInput);


  if (!validarEmail(email)) return resposta(false, "E-mail inválido.");
  if (!senha) return resposta(false, "Informe a senha.");


  const membro = obterMembroPorEmail(email);
  if (!membro || membro.status !== STATUS.MEMBRO_ATIVO) {
    return resposta(false, "Conta não autorizada ou pendente de aprovação.");
  }


  const senhaHash = gerarHashSenha(senha);
  if (senhaHash !== membro.senhaHash) {
    return resposta(false, "E-mail ou senha inválidos.");
  }


  if (tipoAcessoRequisitado === "Admin" && membro.nivel !== "Admin") {
    return resposta(false, "Acesso negado: requer perfil administrativo.");
  }


  registrarLog("LOGIN", membro.id, membro.id, tipoAcessoRequisitado);


  return resposta(true, "Acesso autorizado.", {
    id: membro.id,
    nome: membro.nome,
    nivel: membro.nivel
  });
}


function cadastrarNovoMembro(nomeInput, emailInput, senhaInput, aceitouPolitica) {
  const nome = normalizarTexto(nomeInput);
  const email = normalizarTexto(emailInput).toLowerCase();
  const senha = normalizarTexto(senhaInput);


  if (!validarTexto(nome, 3, 120)) return resposta(false, "Nome inválido.");
  if (!validarEmail(email)) return resposta(false, "E-mail inválido.");
  if (!senhaValida(senha)) return resposta(false, "A senha deve ter pelo menos 8 caracteres.");
  if (aceitouPolitica !== true) return resposta(false, "É necessário concordar com a política de dados.");


  const existente = obterMembroPorEmail(email);
  if (existente) return resposta(false, "E-mail já registado.");


  const id = gerarIdSequencial(ABAS.MEMBROS, PREFIXOS.MEMBRO);


  inserirLinha(ABAS.MEMBROS, [
    id,
    nome,
    email,
    gerarHashSenha(senha),
    "Membro",
    STATUS.MEMBRO_PENDENTE,
    "Sim",
    new Date()
  ]);


  registrarLog("CADASTRO_MEMBRO", id, id, email);
  return resposta(true, "Cadastro realizado. Aguarde a aprovação.");
}


function listarMembrosPendentes() {
  return getDadosAba(ABAS.MEMBROS).slice(1)
    .filter(l => l[5] === STATUS.MEMBRO_PENDENTE)
    .map(l => ({ id: l[0], nome: l[1], email: l[2] }));
}


function aprovarMembroAdmin(idMembro, idExecutor) {
  if (!validarAdminPorId(idExecutor)) return resposta(false, "Acesso negado.");


  const aba = getAba(ABAS.MEMBROS);
  const dados = aba.getDataRange().getValues();
  const linha = dados.findIndex(l => l[0] === idMembro);


  if (linha === -1) return resposta(false, "Membro não encontrado.");


  aba.getRange(linha + 1, 6).setValue(STATUS.MEMBRO_ATIVO);
  registrarLog("APROVAR_MEMBRO", idExecutor, idMembro, "Cadastro aprovado");
  return resposta(true, "Cadastro aprovado com sucesso.");
}


function listarMembrosPorPerfil(idExecutor) {
  if (!validarAdminPorId(idExecutor)) return resposta(false, "Acesso negado.");


  const ativos = getDadosAba(ABAS.MEMBROS).slice(1).filter(l => l[5] === STATUS.MEMBRO_ATIVO);


  return resposta(true, "Consulta concluída.", {
    membros: ativos.filter(l => l[4] !== "Admin").map(l => ({
      id: l[0], nome: l[1], email: l[2], nivel: l[4], status: l[5]
    })),
    admins: ativos.filter(l => l[4] === "Admin").map(l => ({
      id: l[0], nome: l[1], email: l[2], nivel: l[4], status: l[5]
    }))
  });
}


function criarEventoAdmin(dadosEvento, idExecutor) {
  if (!validarAdminPorId(idExecutor)) return resposta(false, "Acesso negado.");


  const titulo = normalizarTexto(dadosEvento.titulo);
  const descricao = normalizarTexto(dadosEvento.descricao);
  const dataEvento = formatarData(dadosEvento.dataEvento);
  const prazoVotacao = formatarData(dadosEvento.prazoVotacao);
  const tipoVotacao = normalizarTexto(dadosEvento.tipoVotacao || "Sim/Não");


  if (!validarTexto(titulo, 3, 150)) return resposta(false, "Título inválido.");
  if (!validarTexto(descricao, 5, 1000)) return resposta(false, "Descrição inválida.");
  if (!dataEvento) return resposta(false, "Informe a data do evento.");
  if (!prazoVotacao) return resposta(false, "Informe o prazo da votação.");


  const id = gerarIdSequencial(ABAS.EVENTOS, PREFIXOS.EVENTO);


  inserirLinha(ABAS.EVENTOS, [
    id,
    titulo,
    descricao,
    idExecutor,
    dataEvento,
    prazoVotacao,
    STATUS.EVENTO_VOTACAO,
    tipoVotacao,
    0,
    new Date()
  ]);


  registrarLog("CRIAR_EVENTO", idExecutor, id, titulo);
  return resposta(true, "Evento criado com sucesso.");
}


function atualizarStatusEvento(idEvento, novoStatus, idExecutor) {
  if (!validarAdminPorId(idExecutor)) return resposta(false, "Acesso negado.");


  const permitidos = [
    STATUS.EVENTO_ANALISE,
    STATUS.EVENTO_VOTACAO,
    STATUS.EVENTO_APROVADO,
    STATUS.EVENTO_REJEITADO,
    STATUS.EVENTO_EXECUCAO,
    STATUS.EVENTO_CONCLUIDO,
    STATUS.EVENTO_ARQUIVADO
  ];


  if (!permitidos.includes(novoStatus)) return resposta(false, "Status inválido.");


  const aba = getAba(ABAS.EVENTOS);
  const dados = aba.getDataRange().getValues();
  const linha = dados.findIndex(l => l[0] === idEvento);


  if (linha === -1) return resposta(false, "Evento não encontrado.");


  aba.getRange(linha + 1, 7).setValue(novoStatus);
  registrarLog("ATUALIZAR_STATUS_EVENTO", idExecutor, idEvento, novoStatus);
  return resposta(true, "Status do evento atualizado.");
}


function criarPropostaMembro(dadosProposta, idAutor) {
  const membro = obterMembroPorId(idAutor);
  if (!membro || membro.status !== STATUS.MEMBRO_ATIVO) return resposta(false, "Acesso não autorizado.");


  const titulo = normalizarTexto(dadosProposta.titulo);
  const descricao = normalizarTexto(dadosProposta.descricao);
  const recursos = normalizarTexto(dadosProposta.recursos);
  const modoExibicaoAutor = normalizarTexto(dadosProposta.modoExibicaoAutor || "Nome");
  const nomeExibicao = modoExibicaoAutor === "Anonimo" ? "Anónimo" : membro.nome;


  if (!validarTexto(titulo, 3, 150)) return resposta(false, "Título inválido.");
  if (!validarTexto(descricao, 5, 1000)) return resposta(false, "Descrição inválida.");
  if (!validarTexto(recursos, 5, 1000)) return resposta(false, "Informe os recursos necessários.");


  const id = gerarIdSequencial(ABAS.PROPOSTAS, PREFIXOS.PROPOSTA);


  inserirLinha(ABAS.PROPOSTAS, [
    id,
    titulo,
    descricao,
    recursos,
    idAutor,
    membro.nome,
    modoExibicaoAutor,
    nomeExibicao,
    STATUS.PROPOSTA_ANALISE,
    new Date()
  ]);


  registrarLog("CRIAR_PROPOSTA", idAutor, id, titulo);
  return resposta(true, "Proposta enviada para análise.");
}


function listarMinhasPropostas(idMembro) {
  const membro = obterMembroPorId(idMembro);
  if (!membro || membro.status !== STATUS.MEMBRO_ATIVO) {
    return resposta(false, "Acesso não autorizado.");
  }


  const propostas = getDadosAba(ABAS.PROPOSTAS).slice(1)
    .filter(l => l[4] === idMembro)
    .map(l => ({
      id: l[0],
      titulo: l[1],
      descricao: l[2],
      recursos: l[3],
      idAutor: l[4],
      nomeAutor: l[5],
      modoExibicaoAutor: l[6],
      nomeExibicao: l[7],
      status: l[8],
      criadoEm: formatarData(l[9])
    }));


  return resposta(true, "Consulta concluída.", { propostas });
}


function listarPropostasEmAnalise(idExecutor) {
  if (!validarAdminPorId(idExecutor)) return resposta(false, "Acesso negado.");


  const propostas = getDadosAba(ABAS.PROPOSTAS).slice(1)
    .filter(l => l[8] === STATUS.PROPOSTA_ANALISE)
    .map(l => ({
      id: l[0],
      titulo: l[1],
      descricao: l[2],
      recursos: l[3],
      idAutor: l[4],
      nomeAutor: l[5],
      modoExibicaoAutor: l[6],
      nomeExibicao: l[7],
      status: l[8]
    }));


  return resposta(true, "Consulta concluída.", { propostas });
}


function aprovarPropostaAdmin(idProposta, dadosEvento, idExecutor) {
  if (!validarAdminPorId(idExecutor)) return resposta(false, "Acesso negado.");


  const aba = getAba(ABAS.PROPOSTAS);
  const dados = aba.getDataRange().getValues();
  const linha = dados.findIndex(l => l[0] === idProposta);


  if (linha === -1) return resposta(false, "Proposta não encontrada.");


  const proposta = {
    titulo: dados[linha][1],
    descricao: dados[linha][2],
    idAutor: dados[linha][4]
  };


  const dataEvento = formatarData(dadosEvento.dataEvento);
  const prazoVotacao = formatarData(dadosEvento.prazoVotacao);
  const tipoVotacao = normalizarTexto(dadosEvento.tipoVotacao || "Sim/Não");


  if (!dataEvento || !prazoVotacao) {
    return resposta(false, "Informe a data do evento e o prazo da votação.");
  }


  const idEvento = gerarIdSequencial(ABAS.EVENTOS, PREFIXOS.EVENTO);


  inserirLinha(ABAS.EVENTOS, [
    idEvento,
    proposta.titulo,
    proposta.descricao,
    proposta.idAutor,
    dataEvento,
    prazoVotacao,
    STATUS.EVENTO_VOTACAO,
    tipoVotacao,
    0,
    new Date()
  ]);


  aba.getRange(linha + 1, 9).setValue(STATUS.PROPOSTA_APROVADA);
  registrarLog("APROVAR_PROPOSTA", idExecutor, idProposta, proposta.titulo);
  return resposta(true, "Proposta aprovada e encaminhada para votação.");
}


function listarEventosAtivos() {
  const eventos = getDadosAba(ABAS.EVENTOS).slice(1);
  const membros = getDadosAba(ABAS.MEMBROS).slice(1);
  const votos = getDadosAba(ABAS.VOTOS).slice(1);


  const totalMembrosAtivos = membros.filter(l => l[5] === STATUS.MEMBRO_ATIVO).length;


  return eventos
    .filter(l => [STATUS.EVENTO_VOTACAO, STATUS.EVENTO_EXECUCAO, STATUS.EVENTO_APROVADO].includes(l[6]))
    .map(l => {
      const idEvento = l[0];
      const votosEvento = votos.filter(v => v[1] === idEvento);
      const totalVotos = votosEvento.length;
      const faltantes = Math.max(totalMembrosAtivos - totalVotos, 0);


      return {
        id: l[0],
        titulo: l[1],
        descricao: l[2],
        dataEvento: formatarData(l[4]),
        prazoVotacao: formatarData(l[5]),
        status: l[6],
        tipoVotacao: l[7],
        totalVotos,
        faltantes
      };
    });
}


function carregarHistoricoAdmin(idAdmin) {
  if (!validarAdminPorId(idAdmin)) return resposta(false, "Acesso negado.");


  const eventos = getDadosAba(ABAS.EVENTOS).slice(1)
    .map(l => {
      const resumo = obterResumoVotacaoEvento(l[0]);


      return {
        id: l[0],
        titulo: l[1],
        descricao: l[2],
        criadoPor: l[3],
        dataEvento: formatarData(l[4]),
        prazoVotacao: formatarData(l[5]),
        status: l[6],
        tipoVotacao: l[7],
        totalVotos: resumo.totalVotos,
        sim: resumo.sim,
        nao: resumo.nao,
        faltantes: resumo.faltantes,
        editavel: true
      };
    })
    .filter(e => [
      STATUS.EVENTO_APROVADO,
      STATUS.EVENTO_REJEITADO,
      STATUS.EVENTO_CONCLUIDO,
      STATUS.EVENTO_ARQUIVADO
    ].includes(e.status))
    .sort((a, b) => new Date(b.dataEvento || 0) - new Date(a.dataEvento || 0));


  const tarefas = getDadosAba(ABAS.TAREFAS).slice(1)
    .map(l => ({
      id: l[0],
      idEvento: l[1],
      titulo: l[2],
      descricao: l[3],
      responsavel: l[4],
      prazo: formatarData(l[5]),
      status: l[6],
      editavel: true
    }))
    .filter(t => t.status === STATUS.TAREFA_CONCLUIDA)
    .sort((a, b) => new Date(b.prazo || 0) - new Date(a.prazo || 0));


  return resposta(true, "Consulta concluída.", { eventos, tarefas });
}


function carregarHistoricoMembro(idMembro) {
  const membro = obterMembroPorId(idMembro);
  if (!membro || membro.status !== STATUS.MEMBRO_ATIVO) {
    return resposta(false, "Acesso não autorizado.");
  }


  const eventos = getDadosAba(ABAS.EVENTOS).slice(1)
    .map(l => ({
      id: l[0],
      titulo: l[1],
      descricao: l[2],
      criadoPor: l[3],
      dataEvento: formatarData(l[4]),
      prazoVotacao: formatarData(l[5]),
      status: l[6],
      tipoVotacao: l[7],
      totalVotos: Number(l[8] || 0)
    }))
    .filter(e => e.status === STATUS.EVENTO_CONCLUIDO)
    .sort((a, b) => new Date(b.dataEvento || 0) - new Date(a.dataEvento || 0));


  const tarefas = getDadosAba(ABAS.TAREFAS).slice(1)
    .map(l => ({
      id: l[0],
      idEvento: l[1],
      titulo: l[2],
      descricao: l[3],
      responsavel: l[4],
      prazo: formatarData(l[5]),
      status: l[6]
    }))
    .filter(t =>
      t.status === STATUS.TAREFA_CONCLUIDA &&
      (!t.responsavel || t.responsavel === membro.nome)
    )
    .sort((a, b) => new Date(b.prazo || 0) - new Date(a.prazo || 0));


  return resposta(true, "Consulta concluída.", { eventos, tarefas });
}


function listarTodosEventosAdmin(idAdmin) {
  if (!validarAdminPorId(idAdmin)) return resposta(false, "Acesso negado.");


  const eventos = getDadosAba(ABAS.EVENTOS).slice(1)
    .map(l => {
      const resumo = obterResumoVotacaoEvento(l[0]);


      return {
        id: l[0],
        titulo: l[1],
        descricao: l[2],
        criadoPor: l[3],
        dataEvento: formatarData(l[4]),
        prazoVotacao: formatarData(l[5]),
        status: l[6],
        tipoVotacao: l[7],
        totalVotos: resumo.totalVotos,
        sim: resumo.sim,
        nao: resumo.nao,
        faltantes: resumo.faltantes,
        percentualParticipacao: resumo.percentualParticipacao
      };
    })
    .filter(e => [
      STATUS.EVENTO_VOTACAO,
      STATUS.EVENTO_APROVADO,
      STATUS.EVENTO_REJEITADO,
      STATUS.EVENTO_EXECUCAO
    ].includes(e.status))
    .sort((a, b) => new Date(a.dataEvento || 0) - new Date(b.dataEvento || 0));


  return resposta(true, "Consulta concluída.", { eventos });
}


function membroJaVotou(idEvento, idMembro) {
  return getDadosAba(ABAS.VOTOS).slice(1).some(v => v[1] === idEvento && v[2] === idMembro);
}


function atualizarTotalVotosEvento(idEvento) {
  const abaEventos = getAba(ABAS.EVENTOS);
  const eventos = abaEventos.getDataRange().getValues();
  const total = getDadosAba(ABAS.VOTOS).slice(1).filter(v => v[1] === idEvento).length;
  const linha = eventos.findIndex(p => p[0] === idEvento);


  if (linha !== -1) abaEventos.getRange(linha + 1, 9).setValue(total);
}


function registrarVoto(idEvento, idMembro, voto) {
  const evento = getDadosAba(ABAS.EVENTOS).slice(1).find(p => p[0] === idEvento);
  if (!evento) return resposta(false, "Evento não encontrado.");


  const membro = obterMembroPorId(idMembro);
  if (!membro || membro.status !== STATUS.MEMBRO_ATIVO) {
    return resposta(false, "Membro não autorizado.");
  }


  if (evento[6] !== STATUS.EVENTO_VOTACAO) {
    return resposta(false, "A votação deste evento não está aberta.");
  }


  if (membroJaVotou(idEvento, idMembro)) {
    return resposta(false, "Voto já registado para este evento.");
  }


    const valorVoto = normalizarTexto(voto).toLowerCase();
  if (!["sim", "não", "nao"].includes(valorVoto)) {
    return resposta(false, "Voto inválido. Selecione 'Sim' ou 'Não'.");
  }


  const votoNormalizado = valorVoto === "sim" ? "Sim" : "Não";


  const id = gerarIdSequencial(ABAS.VOTOS, PREFIXOS.VOTO);


  inserirLinha(ABAS.VOTOS, [
    id,
    idEvento,
    idMembro,
    votoNormalizado,
    new Date()
  ]);


  atualizarTotalVotosEvento(idEvento);
  registrarLog("REGISTRAR_VOTO", idMembro, idEvento, votoNormalizado);
  return resposta(true, "Voto registado com sucesso.");
}


function obterResumoVotacaoEvento(idEvento) {
  const votos = getDadosAba(ABAS.VOTOS).slice(1).filter(v => v[1] === idEvento);
  const membrosAtivos = getDadosAba(ABAS.MEMBROS).slice(1).filter(l => l[5] === STATUS.MEMBRO_ATIVO);


  let sim = 0;
  let nao = 0;
  let outros = 0;


  votos.forEach(v => {
    const valor = normalizarTexto(v[3]).toLowerCase();
    if (valor === "sim") sim++;
    else if (valor === "não" || valor === "nao") nao++;
    else outros++;
  });


  const totalVotos = votos.length;
  const totalMembros = membrosAtivos.length;
  const faltantes = Math.max(totalMembros - totalVotos, 0);


  return {
    idEvento,
    sim,
    nao,
    outros,
    totalVotos,
    totalMembros,
    faltantes,
    percentualParticipacao: totalMembros ? Math.round((totalVotos / totalMembros) * 100) : 0
  };
}


function listarEventosParaMembro(idMembro) {
  const membro = obterMembroPorId(idMembro);
  if (!membro || membro.status !== STATUS.MEMBRO_ATIVO) {
    return resposta(false, "Acesso não autorizado.");
  }


  const eventos = listarEventosAtivos();
  const votos = getDadosAba(ABAS.VOTOS).slice(1);


  const lista = eventos.map(p => {
    const meuVoto = votos.find(v => v[1] === p.id && v[2] === idMembro);
    return Object.assign({}, p, {
      jaVotou: !!meuVoto,
      meuVoto: meuVoto ? meuVoto[3] : ""
    });
  });


  return resposta(true, "Consulta concluída.", { eventos: lista });
}


function detalharResultadoEventoParaMembro(idEvento, idMembro) {
  const membro = obterMembroPorId(idMembro);
  if (!membro || membro.status !== STATUS.MEMBRO_ATIVO) {
    return resposta(false, "Acesso não autorizado.");
  }


  const eventoLinha = getDadosAba(ABAS.EVENTOS).slice(1).find(l => l[0] === idEvento);
  if (!eventoLinha) return resposta(false, "Evento não encontrado.");


  const statusEvento = eventoLinha[6];
  const statusPermitidos = [
    STATUS.EVENTO_APROVADO,
    STATUS.EVENTO_REJEITADO,
    STATUS.EVENTO_CONCLUIDO,
    STATUS.EVENTO_ARQUIVADO
  ];


  if (!statusPermitidos.includes(statusEvento)) {
    return resposta(false, "O resultado desta votação ainda não está disponível.");
  }


  const evento = {
    id: eventoLinha[0],
    titulo: eventoLinha[1],
    descricao: eventoLinha[2],
    dataEvento: formatarData(eventoLinha[4]),
    prazoVotacao: formatarData(eventoLinha[5]),
    status: statusEvento,
    tipoVotacao: eventoLinha[7]
  };


  const resumo = obterResumoVotacaoEvento(idEvento);


  return resposta(true, "Consulta concluída.", { evento, resumo });
}


function criarTarefaAdmin(dadosTarefa, idExecutor) {
  if (!validarAdminPorId(idExecutor)) return resposta(false, "Acesso negado.");


  const idEvento = normalizarTexto(dadosTarefa.idEvento);
  const titulo = normalizarTexto(dadosTarefa.titulo);
  const descricao = normalizarTexto(dadosTarefa.descricao);
  const responsavel = normalizarTexto(dadosTarefa.responsavel);
  const prazo = formatarData(dadosTarefa.prazo);


  if (!validarTexto(idEvento, 3, 100)) return resposta(false, "Selecione um evento.");
  if (!validarTexto(titulo, 3, 150)) return resposta(false, "Título da tarefa inválido.");
  if (!validarTexto(descricao, 3, 1000)) return resposta(false, "Descrição inválida.");
  if (!prazo) return resposta(false, "Informe o prazo da tarefa.");


  const id = gerarIdSequencial(ABAS.TAREFAS, PREFIXOS.TAREFA);


  inserirLinha(ABAS.TAREFAS, [
    id,
    idEvento,
    titulo,
    descricao,
    responsavel,
    prazo,
    STATUS.TAREFA_PENDENTE,
    new Date()
  ]);


  registrarLog("CRIAR_TAREFA", idExecutor, id, titulo);
  return resposta(true, "Tarefa adicionada com sucesso.");
}


function detalharVotacaoAdmin(idEvento, idAdmin) {
  if (!validarAdminPorId(idAdmin)) return resposta(false, "Acesso negado.");


  const eventoLinha = getDadosAba(ABAS.EVENTOS).slice(1).find(l => l[0] === idEvento);
  if (!eventoLinha) return resposta(false, "Evento não encontrado.");


  const evento = {
    id: eventoLinha[0],
    titulo: eventoLinha[1],
    descricao: eventoLinha[2],
    criadoPor: eventoLinha[3],
    dataEvento: formatarData(eventoLinha[4]),
    prazoVotacao: formatarData(eventoLinha[5]),
    status: eventoLinha[6],
    tipoVotacao: eventoLinha[7],
    totalVotos: Number(eventoLinha[8] || 0)
  };


  const resumo = obterResumoVotacaoEvento(idEvento);


  const votosDetalhados = getDadosAba(ABAS.VOTOS).slice(1)
    .filter(v => v[1] === idEvento)
    .map(v => {
      const membro = obterMembroPorId(v[2]);
      return {
        idVoto: v[0],
        idEvento: v[1],
        idMembro: v[2],
        nomeMembro: membro ? membro.nome : "",
        voto: v[3],
        registradoEm: formatarData(v[4])
      };
    });


  return resposta(true, "Consulta concluída.", {
    evento,
    resumo,
    votos: votosDetalhados
  });
}


function finalizarVotacaoPorApuracao(idEvento, idAdmin) {
  if (!validarAdminPorId(idAdmin)) return resposta(false, "Acesso negado.");


  const aba = getAba(ABAS.EVENTOS);
  const dados = aba.getDataRange().getValues();
  const linha = dados.findIndex(l => l[0] === idEvento);


  if (linha === -1) return resposta(false, "Evento não encontrado.");


  const statusAtual = dados[linha][6];
  if (statusAtual !== STATUS.EVENTO_VOTACAO) {
    return resposta(false, "Este evento não está em votação.");
  }


  const resumo = obterResumoVotacaoEvento(idEvento);
  const novoStatus = resumo.sim > resumo.nao ? STATUS.EVENTO_APROVADO : STATUS.EVENTO_REJEITADO;


  aba.getRange(linha + 1, 7).setValue(novoStatus);
  aba.getRange(linha + 1, 9).setValue(resumo.totalVotos);


  registrarLog(
    "FINALIZAR_VOTACAO",
    idAdmin,
    idEvento,
    `Resultado: ${novoStatus} | Sim: ${resumo.sim} | Não: ${resumo.nao} | Total: ${resumo.totalVotos}`
  );


  return resposta(true, `Votação finalizada com status ${novoStatus}.`, {
    status: novoStatus,
    resumo
  });
}


function atualizarStatusTarefa(idTarefa, novoStatus, idExecutor) {
  if (!validarAdminPorId(idExecutor)) return resposta(false, "Acesso negado.");


  const permitidos = [STATUS.TAREFA_PENDENTE, STATUS.TAREFA_ANDAMENTO, STATUS.TAREFA_CONCLUIDA];
  if (!permitidos.includes(novoStatus)) return resposta(false, "Status inválido.");


  const aba = getAba(ABAS.TAREFAS);
  const dados = aba.getDataRange().getValues();
  const linha = dados.findIndex(l => l[0] === idTarefa);


  if (linha === -1) return resposta(false, "Tarefa não encontrada.");


  aba.getRange(linha + 1, 7).setValue(novoStatus);
  registrarLog("ATUALIZAR_STATUS_TAREFA", idExecutor, idTarefa, novoStatus);
  return resposta(true, "Status da tarefa atualizado.");
}


function listarTarefasAdmin(idExecutor) {
  if (!validarAdminPorId(idExecutor)) return resposta(false, "Acesso negado.");
  const tarefas = getDadosAba(ABAS.TAREFAS).slice(1)
    .filter(l => l[6] !== STATUS.TAREFA_CONCLUIDA) 
    .map(l => ({
      id: l[0],
      idEvento: l[1],
      titulo: l[2],
      descricao: l[3],
      responsavel: l[4],
      prazo: formatarData(l[5]),
      status: l[6]
    }));
  return resposta(true, "Consulta concluída.", { tarefas });
}


function listarTarefasDoMembro(idMembro) {
  const membro = obterMembroPorId(idMembro);
  if (!membro || membro.status !== STATUS.MEMBRO_ATIVO) return resposta(false, "Acesso não autorizado.");


  const nomeMembro = normalizarTexto(membro.nome).toLowerCase();


  const tarefas = getDadosAba(ABAS.TAREFAS).slice(1)
    .filter(l => {
      const statusTarefa = normalizarTexto(l[6]);
      const responsavel = normalizarTexto(l[4]).toLowerCase();
      const aberta = statusTarefa !== STATUS.TAREFA_CONCLUIDA;
      const pertenceAoMembro = !responsavel || responsavel === nomeMembro;
      return aberta && pertenceAoMembro;
    })
    .map(l => ({
      id: l[0],
      idEvento: l[1],
      titulo: l[2],
      descricao: l[3],
      responsavel: l[4],
      prazo: formatarData(l[5]),
      status: l[6]
    }));


  return resposta(true, "Consulta concluída.", { tarefas });
}
function carregarDashboardAdmin(idExecutor) {
  if (!validarAdminPorId(idExecutor)) return resposta(false, "Acesso negado.");


  const membros = getDadosAba(ABAS.MEMBROS).slice(1);
  const eventos = getDadosAba(ABAS.EVENTOS).slice(1);
  const votos = getDadosAba(ABAS.VOTOS).slice(1);
  const tarefas = getDadosAba(ABAS.TAREFAS).slice(1);
  const propostas = getDadosAba(ABAS.PROPOSTAS).slice(1);


  const membrosAtivos = membros.filter(l => l[5] === STATUS.MEMBRO_ATIVO);
  const admins = membrosAtivos.filter(l => l[4] === "Admin");
  const eventosAtivos = eventos.filter(l => l[6] === STATUS.EVENTO_VOTACAO);
  const taxaParticipacao = membrosAtivos.length
    ? Math.round((votos.length / Math.max(membrosAtivos.length * Math.max(eventosAtivos.length, 1), 1)) * 100)
    : 0;


  const eventosProximos = eventos
    .filter(l => l[4])
    .sort((a, b) => new Date(a[4]) - new Date(b[4]))
    .slice(0, 5)
    .map(l => ({
      id: l[0],
      titulo: l[1],
      dataEvento: formatarData(l[4]),
      status: l[6]
    }));


  const quoruns = eventosAtivos.map(p => {
    const totalVotos = votos.filter(v => v[1] === p[0]).length;
    return {
      id: p[0],
      titulo: p[1],
      totalVotos,
      totalMembros: membrosAtivos.length,
      percentual: membrosAtivos.length ? Math.round((totalVotos / membrosAtivos.length) * 100) : 0
    };
  });


  return resposta(true, "Consulta concluída.", {
    indicadores: {
  membrosAtivos: membrosAtivos.length,
  administradores: admins.length,
  eventosAtivos: eventosAtivos.length,
  tarefasEmAberto: tarefas.filter(t => t[6] !== STATUS.TAREFA_CONCLUIDA).length,
  propostasAnalise: propostas.filter(p => p[8] === STATUS.PROPOSTA_ANALISE).length,
  taxaParticipacao
},
    eventosProximos,
    quoruns
  });
}


function carregarDashboardMembro(idMembro) {
  const membro = obterMembroPorId(idMembro);
  if (!membro || membro.status !== STATUS.MEMBRO_ATIVO) {
    return resposta(false, "Acesso não autorizado.");
  }


  const eventosAtivos = listarEventosAtivos();
const eventos = (eventosAtivos || [])
  .filter(e => [STATUS.EVENTO_VOTACAO, STATUS.EVENTO_EXECUCAO].includes(e.status))
  .sort((a, b) => new Date(a.dataEvento || 0) - new Date(b.dataEvento || 0));


const votos = getDadosAba(ABAS.VOTOS).slice(1);
const tarefas = getDadosAba(ABAS.TAREFAS).slice(1);


  const minhasPendencias = eventos.filter(p => p.status === STATUS.EVENTO_VOTACAO && !votos.some(v => v[1] === p.id && v[2] === idMembro));
  const agenda = eventos
    .filter(p => p.dataEvento)
    .sort((a, b) => new Date(a.dataEvento) - new Date(b.dataEvento))
    .slice(0, 5);


  return resposta(true, "Consulta concluída.", {
    resumo: {
      eventosAbertos: eventos.filter(p => p.status === STATUS.EVENTO_VOTACAO).length,
      votacoesPendentes: minhasPendencias.length,
      tarefasEmAberto: tarefas.filter(t => t[6] !== STATUS.TAREFA_CONCLUIDA && (!t[4] || t[4] === membro.nome)).length
    },
    agenda,
    eventos
  });
}


function obterBaseUrlApp() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return "";
  }
}


function solicitarRedefinicaoSenha(emailInput) {
  const email = normalizarTexto(emailInput).toLowerCase();
  if (!validarEmail(email)) return resposta(false, "Informe um e-mail válido.");


  const membro = obterMembroPorEmail(email);
  if (!membro) return resposta(true, "Se o e-mail existir, o link de redefinição será enviado.");


  const id = gerarIdSequencial(ABAS.RESET, PREFIXOS.RESET);
  const token = gerarTokenSeguro();
  const criadoEm = new Date();
  const expiraEm = new Date(criadoEm.getTime() + 60 * 60 * 1000);


  inserirLinha(ABAS.RESET, [
    id,
    membro.id,
    membro.email,
    token,
    expiraEm,
    "Não",
    criadoEm
  ]);


  const baseUrl = obterBaseUrlApp();
  const link = `${baseUrl}?modo=redefinir&token=${encodeURIComponent(token)}`;


  MailApp.sendEmail({
    to: membro.email,
    subject: "Redefinição de senha - Painel de Governança",
    body: `Acesse o link para redefinir a senha: ${link}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <h2>Redefinição de senha</h2>
        <p>Recebemos uma solicitação para redefinir sua senha.</p>
        <p><a href="${link}" target="_blank">Clique aqui para criar uma nova senha</a></p>
        <p>Este link expira em 1 hora.</p>
      </div>
    `,
    name: "Painel de Governança"
  });


  registrarLog("SOLICITAR_RESET_SENHA", membro.id, id, membro.email);
  return resposta(true, "Se o e-mail existir, o link de redefinição será enviado.");
}


function validarTokenRedefinicao(tokenInput) {
  const token = normalizarTexto(tokenInput);
  if (!token) return resposta(false, "Token inválido.");


  const dados = getDadosAba(ABAS.RESET).slice(1);
  const item = dados.find(l => l[3] === token);


  if (!item) return resposta(false, "Link inválido.");
  if (String(item[5]) === "Sim") return resposta(false, "Este link já foi utilizado.");
  if (new Date(item[4]).getTime() < new Date().getTime()) return resposta(false, "Este link expirou.");


  return resposta(true, "Token válido.", {
    idReset: item[0],
    idMembro: item[1],
    email: item[2]
  });
}


function redefinirSenhaPorToken(tokenInput, novaSenhaInput) {
  const tokenCheck = validarTokenRedefinicao(tokenInput);
  if (!tokenCheck.sucesso) return tokenCheck;


  const novaSenha = normalizarTexto(novaSenhaInput);
  if (!senhaValida(novaSenha)) return resposta(false, "A nova senha deve ter pelo menos 8 caracteres.");


  const dadosMembros = getAba(ABAS.MEMBROS).getDataRange().getValues();
  const linhaMembro = dadosMembros.findIndex(l => l[0] === tokenCheck.idMembro);
  if (linhaMembro === -1) return resposta(false, "Usuário não encontrado.");


  getAba(ABAS.MEMBROS).getRange(linhaMembro + 1, 4).setValue(gerarHashSenha(novaSenha));


  const dadosReset = getAba(ABAS.RESET).getDataRange().getValues();
  const linhaReset = dadosReset.findIndex(l => l[0] === tokenCheck.idReset);
  if (linhaReset !== -1) {
    getAba(ABAS.RESET).getRange(linhaReset + 1, 6).setValue("Sim");
  }


  registrarLog("RESETAR_SENHA", tokenCheck.idMembro, tokenCheck.idReset, tokenCheck.email);
  return resposta(true, "Senha redefinida com sucesso.");
}