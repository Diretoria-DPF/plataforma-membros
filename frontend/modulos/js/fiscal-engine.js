/**
 * TERMINAL FISCAL, VALIDAÇÃO DE QR CODE, TELEMETRIA IA E STUDIO DE CRACHÁ
 * Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia (LAIFT)
 */

const FiscalEngine = (() => {
  let fiscalSession = '';
  let scannerInstance = null;
  let scanInProgress = false;
  let logoPressTimer = null;
  let memberSearchTimer = null;
  let dadosMembrosLote = [];

  const QR_PREFIX = 'LAIFT:v1:';
  const SESSION_STORAGE_KEY = 'laift_student_session';

  function getStatusBanner(msg, type) {
    if (typeof window.showStatus === 'function') {
      window.showStatus(msg, type);
    } else {
      const el = document.getElementById('status');
      if (el) {
        el.textContent = msg;
        el.className = `status-banner ${type}`;
        el.classList.remove('hidden');
      }
    }
  }

  function clearStatusBanner() {
    if (typeof window.hideStatus === 'function') {
      window.hideStatus();
    } else {
      const el = document.getElementById('status');
      if (el) el.classList.add('hidden');
    }
  }

  // =========================================================
  // 1. AUTENTICAÇÃO E MODAL DE ACESSO DO FISCAL
  // =========================================================

  function abrirModalLogin() {
    if (fiscalSession) {
      const fiscalArea = document.getElementById('fiscalArea');
      if (fiscalArea) {
        fiscalArea.classList.remove('hidden');
        fiscalArea.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    const modal = document.getElementById('modalFiscalLogin');
    const input = document.getElementById('inputSenhaFiscalModal');
    if (modal) {
      modal.style.display = 'flex';
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 150);
      }
    } else {
      const password = prompt('Terminal restrito LAIFT.\nDigite a senha fiscal:');
      if (password) {
        processarLoginFiscal(password);
      }
    }
  }

  function fecharModalLogin() {
    const modal = document.getElementById('modalFiscalLogin');
    if (modal) modal.style.display = 'none';
  }

  async function confirmarLoginModal() {
    const input = document.getElementById('inputSenhaFiscalModal');
    const senha = input ? input.value.trim() : '';
    if (!senha) return;
    fecharModalLogin();
    await processarLoginFiscal(senha);
  }

  async function processarLoginFiscal(password) {
    getStatusBanner('Validando acesso fiscal...', 'loading');
    try {
      let res;
      if (typeof ApiService.loginFiscal === 'function') {
        res = await ApiService.loginFiscal(password);
      } else if (typeof ApiService.autenticarFiscal === 'function') {
        res = await ApiService.autenticarFiscal(password);
      } else if (typeof ApiService.callAppsScript === 'function') {
        res = await ApiService.callAppsScript({
          acao: 'loginFiscal',
          senha: password
        });
      } else {
        throw new Error('Método de autenticação fiscal indisponível no ApiService.');
      }

      if (!res || !res.sucesso || !res.sessao) {
        getStatusBanner((res && res.mensagem) || 'Credenciais inválidas.', 'error');
        return;
      }

      fiscalSession = res.sessao;
      clearStatusBanner();

      ['identityForm', 'registrationForm', 'otpForm', 'credentialScreen'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });

      const fiscalArea = document.getElementById('fiscalArea');
      if (fiscalArea) {
        fiscalArea.classList.remove('hidden');
        fiscalArea.scrollIntoView({ behavior: 'smooth' });
      }

      const subtitle = document.getElementById('headerSubtitle');
      if (subtitle) subtitle.textContent = 'Terminal de Validação & Portaria';

      const eventInput = document.getElementById('eventName');
      if (eventInput) eventInput.value = res.evento || res.eventoAtivo || '';

      getStatusBanner('Acesso fiscal liberado com sucesso.', 'success');
    } catch (err) {
      console.error(err);
      getStatusBanner('Falha ao autenticar terminal fiscal.', 'error');
    }
  }

  async function saveActiveEvent() {
    const eventInput = document.getElementById('eventName');
    const eventName = eventInput ? eventInput.value.trim() : '';

    if (!eventName) {
      getStatusBanner('Digite o nome do evento ativo.', 'error');
      return;
    }

    getStatusBanner('Atualizando evento...', 'loading');
    try {
      let res;
      if (typeof ApiService.salvarEvento === 'function') {
        res = await ApiService.salvarEvento(eventName, fiscalSession);
      } else if (typeof ApiService.callAppsScript === 'function') {
        res = await ApiService.callAppsScript({
          acao: 'salvarEvento',
          novoNome: eventName,
          sessao: fiscalSession
        });
      }

      if (res && res.sucesso) {
        if (eventInput) eventInput.value = res.novoEvento || res.eventoAtivo || eventName;
        getStatusBanner('Evento ativo atualizado com sucesso.', 'success');
      } else {
        getStatusBanner((res && res.mensagem) || 'Não foi possível atualizar o evento.', 'error');
      }
    } catch (err) {
      console.error(err);
      getStatusBanner('Erro ao atualizar evento.', 'error');
    }
  }

  // =========================================================
  // 2. MONITOR DE SAÚDE DO CLUSTER GROQ (TELEMETRIA EM TEMPO REAL)
  // =========================================================

  async function verificarSaudeRedeIA() {
    const btn = document.getElementById('btnCheckAiHealth');
    const grid = document.getElementById('aiNodesGrid');
    const pctEl = document.getElementById('aiHealthOverallPct');

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Diagnosticando Groq LPUs...';
    }

    try {
      let res;
      if (typeof ApiService.obterStatusSaudeIA === 'function') {
        res = await ApiService.obterStatusSaudeIA(fiscalSession);
      } else if (typeof ApiService.callAppsScript === 'function') {
        res = await ApiService.callAppsScript({
          acao: 'obterStatusSaudeIA',
          sessao: fiscalSession
        }, 30000);
      }

      if (!res || !res.sucesso) {
        alert(res.mensagem || 'Falha ao auditar saúde das chaves Groq.');
        return;
      }

      if (pctEl) {
        pctEl.textContent = `${res.saudeGeralRede}%`;
        pctEl.style.color = res.saudeGeralRede >= 75 ? '#16a34a' : (res.saudeGeralRede >= 40 ? '#d97706' : '#dc2626');
      }

      if (grid && Array.isArray(res.provedores)) {
        grid.innerHTML = '';
        res.provedores.forEach(node => {
          const card = document.createElement('div');
          card.style.cssText = `
            padding: 8px 10px; 
            border-radius: 8px; 
            border: 1px solid ${node.operante ? '#bbf7d0' : '#fecaca'}; 
            background: ${node.operante ? '#f0fdf4' : '#fef2f2'}; 
            font-size: 0.75rem;
            text-align: left;
          `;
          
          card.innerHTML = `
            <div style="font-weight: 700; color: #1e293b;">${node.identificador}</div>
            <div style="color: #64748b; font-family: monospace; font-size: 0.7rem;">${node.chaveMascarada}</div>
            <div style="margin-top: 4px; display: flex; justify-content: space-between; font-weight: 600;">
              <span style="color: ${node.operante ? '#16a34a' : '#dc2626'};">${node.saude}%</span>
              <span style="color: #64748b;">${node.latenciaMs}ms</span>
            </div>
          `;
          grid.appendChild(card);
        });
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao consultar telemetria da IA.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔄 Auditar Chaves';
      }
    }
  }

  // =========================================================
  // 3. EXPORTAÇÃO CSV DE PRESENÇAS CONFIRMADAS
  // =========================================================

  async function baixarListaPresencaCsv() {
    try {
      getStatusBanner('Gerando arquivo CSV formatado...', 'loading');
      
      let res;
      if (typeof ApiService.exportarPresencasCsv === 'function') {
        res = await ApiService.exportarPresencasCsv(fiscalSession, null);
      } else if (typeof ApiService.callAppsScript === 'function') {
        res = await ApiService.callAppsScript({
          acao: 'exportarPresencasCsv',
          sessao: fiscalSession
        });
      }

      if (!res || !res.sucesso) {
        getStatusBanner(res.mensagem || 'Falha ao exportar presenças.', 'error');
        return;
      }

      const byteCharacters = atob(res.csvBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'text/csv;charset=utf-8;' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', res.nomeArquivo || 'presencas_laift.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      getStatusBanner('CSV baixado com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      getStatusBanner('Erro de conexão ao exportar presenças.', 'error');
    }
  }

  // =========================================================
  // 4. GERENCIADOR DE CRACHÁS EM LOTE (SELEÇÃO, EDIÇÃO E FOTO)
  // =========================================================

  function abrirModalLoteCrachas() {
    const modal = document.getElementById('modalLoteCrachas');
    if (!modal) return;

    const base = window.ultimosMembrosBuscados || [];
    if (base.length === 0) {
      alert('Pesquise participantes na "Lista Nominal" antes de abrir o gerenciador de crachás.');
      const searchInput = document.getElementById('memberSearch');
      if (searchInput) searchInput.focus();
      return;
    }

    dadosMembrosLote = base.map(m => ({
      identificador: m.identificador,
      nome: m.nomeExibicao || m.nome || 'Participante',
      tipo: m.tipo || 'Membro',
      tokenQr: m.tokenQr || '',
      fotoUrl: '',
      selecionado: true
    }));

    renderizarTabelaLote();
    modal.style.display = 'flex';
  }

  function fecharModalLoteCrachas() {
    const modal = document.getElementById('modalLoteCrachas');
    if (modal) modal.style.display = 'none';
  }

  function renderizarTabelaLote() {
    const tbody = document.getElementById('tabelaCrachasLoteBody');
    const filtroEl = document.getElementById('filtroCrachaLote');
    const filtro = (filtroEl ? filtroEl.value : '').toLowerCase();
    if (!tbody) return;

    tbody.innerHTML = '';
    let totalSel = 0;

    dadosMembrosLote.forEach((m, idx) => {
      const match = m.nome.toLowerCase().includes(filtro) || m.identificador.toLowerCase().includes(filtro);
      if (!match) return;

      if (m.selecionado) totalSel++;

      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #e2e8f0';

      tr.innerHTML = `
        <td style="text-align: center; padding: 6px;">
          <input type="checkbox" ${m.selecionado ? 'checked' : ''} onchange="FiscalEngine.toggleMembroLote(${idx}, this.checked)">
        </td>
        <td style="padding: 6px;">
          <input type="text" value="${m.nome}" style="width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-size: 0.8rem; box-sizing: border-box;" onchange="FiscalEngine.atualizarNomeLote(${idx}, this.value)">
          <small style="color: #64748b; font-family: monospace;">ID: ${m.identificador}</small>
        </td>
        <td style="padding: 6px;">
          <select style="width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-size: 0.8rem; box-sizing: border-box;" onchange="FiscalEngine.atualizarTipoLote(${idx}, this.value)">
            <option value="Membro" ${m.tipo === 'Membro' ? 'selected' : ''}>Membro</option>
            <option value="Diretoria" ${m.tipo === 'Diretoria' ? 'selected' : ''}>Diretoria</option>
            <option value="Visitante" ${m.tipo === 'Visitante' ? 'selected' : ''}>Visitante</option>
            <option value="Palestrante" ${m.tipo === 'Palestrante' ? 'selected' : ''}>Palestrante</option>
          </select>
        </td>
        <td style="padding: 6px;">
          <input type="file" accept="image/*" style="font-size: 0.75rem; width: 100%;" onchange="FiscalEngine.carregarFotoLote(${idx}, this)">
        </td>
      `;
      tbody.appendChild(tr);
    });

    const contador = document.getElementById('contadorCrachasSel');
    if (contador) {
      const folhas = Math.ceil(totalSel / 8);
      contador.textContent = `${totalSel} selecionado(s) (${folhas} folha(s) A4)`;
    }
  }

  function toggleMembroLote(index, checked) {
    if (dadosMembrosLote[index]) dadosMembrosLote[index].selecionado = checked;
    renderizarTabelaLote();
  }

  function atualizarNomeLote(index, val) {
    if (dadosMembrosLote[index]) dadosMembrosLote[index].nome = val.trim();
  }

  function atualizarTipoLote(index, val) {
    if (dadosMembrosLote[index]) dadosMembrosLote[index].tipo = val;
  }

  function carregarFotoLote(index, inputEl) {
    if (inputEl.files && inputEl.files[0]) {
      const reader = new FileReader();
      reader.onload = function(e) {
        if (dadosMembrosLote[index]) {
          dadosMembrosLote[index].fotoUrl = e.target.result;
          alert(`Foto anexada para ${dadosMembrosLote[index].nome}!`);
        }
      };
      reader.readAsDataURL(inputEl.files[0]);
    }
  }

  function marcarTodosLote(marcar) {
    dadosMembrosLote.forEach(m => m.selecionado = marcar);
    renderizarTabelaLote();
  }

  function filtrarTabelaLote() {
    renderizarTabelaLote();
  }

  /**
   * Renderiza a grade A4 contendo exatamente os participantes selecionados
   */
  function executarImpressaoLoteA4() {
    const selecionados = dadosMembrosLote.filter(m => m.selecionado);
    if (selecionados.length === 0) {
      alert('Selecione ao menos um participante na tabela.');
      return;
    }

    const janela = window.open('', '_blank');
    if (!janela) {
      alert('Libere a abertura de popups no navegador.');
      return;
    }

    let cardsHtml = '';
    selecionados.forEach(m => {
      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=svg&data=' + encodeURIComponent('LAIFT:v1:' + (m.tokenQr || m.identificador));
      
      const fotoHtml = m.fotoUrl 
        ? `<img src="${m.fotoUrl}" class="foto-perfil" alt="Foto"/>`
        : `<div class="avatar-placeholder">${m.nome.charAt(0).toUpperCase()}</div>`;

      cardsHtml += `
        <div class="cracha-card">
          <div class="header">
            <div class="instituicao">UNINASSAU SALVADOR</div>
            <div class="liga">LIGA ACADÊMICA LAIFT</div>
          </div>
          <div class="corpo">
            <div class="col-foto-qr">
              ${fotoHtml}
              <img src="${qrUrl}" class="qr-img" alt="QR Code"/>
            </div>
            <div class="col-dados">
              <div class="nome-participante">${m.nome}</div>
              <div class="tag-role ${String(m.tipo).toLowerCase() === 'diretoria' ? 'diretoria' : ''}">${m.tipo}</div>
              <div class="meta-id">Matrícula: ${m.identificador}</div>
            </div>
          </div>
          <div class="rodape">Farmacologia Clínica e Toxicologia</div>
        </div>
      `;
    });

    janela.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Impressão Oficial de Crachás — LAIFT</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 8mm;
          }
          * {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          body {
            margin: 0;
            padding: 0;
            background: #fff;
          }
          /* Grade 2 colunas x 4 linhas = 8 crachás padrão CR-80 por folha A4 */
          .grade-a4 {
            display: grid;
            grid-template-columns: 85.6mm 85.6mm;
            grid-auto-rows: 54mm;
            gap: 5mm 6mm;
            justify-content: center;
          }
          .cracha-card {
            width: 85.6mm;
            height: 54mm;
            border: 1px dashed #94a3b8;
            border-radius: 4mm;
            padding: 3.5mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            page-break-inside: avoid;
            background: #ffffff;
            position: relative;
          }
          .header {
            border-bottom: 1.5px solid #0f172a;
            padding-bottom: 1.5mm;
            text-align: center;
          }
          .instituicao {
            font-size: 6.5pt;
            font-weight: 700;
            color: #475569;
            letter-spacing: 0.5px;
          }
          .liga {
            font-size: 8.5pt;
            font-weight: 800;
            color: #0f172a;
          }
          .corpo {
            display: flex;
            align-items: center;
            gap: 3mm;
            margin: auto 0;
          }
          .col-foto-qr {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.5mm;
            width: 24mm;
          }
          .foto-perfil {
            width: 22mm;
            height: 22mm;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid #cbd5e1;
          }
          .avatar-placeholder {
            width: 22mm;
            height: 22mm;
            border-radius: 50%;
            background: #e2e8f0;
            color: #1e293b;
            font-size: 11pt;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .qr-img {
            width: 14mm;
            height: 14mm;
          }
          .col-dados {
            flex: 1;
            overflow: hidden;
          }
          .nome-participante {
            font-size: 9pt;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.2;
            max-height: 2.4em;
            overflow: hidden;
          }
          .tag-role {
            display: inline-block;
            background: #e2e8f0;
            color: #334155;
            font-size: 6.5pt;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 3px;
            margin: 2mm 0 1.5mm;
            text-transform: uppercase;
          }
          .tag-role.diretoria {
            background: #dbeafe;
            color: #1e40af;
          }
          .meta-id {
            font-size: 6.5pt;
            font-family: monospace;
            color: #64748b;
          }
          .rodape {
            border-top: 1px solid #e2e8f0;
            font-size: 5.5pt;
            color: #64748b;
            text-align: center;
            padding-top: 1mm;
          }
        </style>
      </head>
      <body>
        <div class="grade-a4">
          ${cardsHtml}
        </div>
        <script>
          window.onload = function() {
            window.print();
          };
        <\/script>
      </body>
      </html>
    `);
    janela.document.close();
  }

  // =========================================================
  // 5. STUDIO DE CRACHÁS INDIVIDUAL
  // =========================================================

  function abrirStudioCracha(membro) {
    if (!membro || !membro.identificador) {
      getStatusBanner('Identificador do participante não informado.', 'error');
      return;
    }

    const id = encodeURIComponent(membro.identificador);
    const nome = encodeURIComponent(membro.nome || membro.nomeExibicao || 'Participante LAIFT');
    const cargo = encodeURIComponent((membro.tipo || 'Membro').toUpperCase());
    const qr = encodeURIComponent(`LAIFT:ID:${membro.identificador}`);

    const url = `cracha/index.html?id=${id}&nome=${nome}&cargo=${cargo}&qr=${qr}`;
    window.open(url, '_blank');
  }

  function gerarCrachaDireto() {
    const idInput = document.getElementById('manualIdentifier');
    const identifier = idInput ? idInput.value.trim() : '';

    if (!identifier) {
      getStatusBanner('Digite a matrícula ou CPF no campo ao lado para emitir o crachá.', 'error');
      if (idInput) idInput.focus();
      return;
    }

    abrirStudioCracha({
      identificador: identifier,
      nome: 'Participante Credenciado',
      tipo: 'Membro Efetivo'
    });
  }

  // =========================================================
  // 6. SCANNER DE QR CODE
  // =========================================================

  function extractQrCredential(decodedText) {
    const cred = String(decodedText || '').trim();
    if (cred.startsWith(QR_PREFIX)) {
      const token = cred.substring(QR_PREFIX.length);
      return /^[a-f0-9]{64}$/i.test(token) ? cred : '';
    }
    if (cred.startsWith('LAIFT:ID:')) {
      return cred;
    }
    return '';
  }

  function startFiscalScanner() {
    if (scanInProgress || scannerInstance) return;

    const readerEl = document.getElementById('reader');
    const scannerBtn = document.getElementById('scannerButton');

    if (readerEl) readerEl.classList.remove('hidden');
    if (scannerBtn) scannerBtn.classList.add('hidden');
    clearStatusBanner();

    scannerInstance = new Html5QrcodeScanner(
      'reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scannerInstance.render(
      async (decodedText) => {
        if (scanInProgress) return;
        scanInProgress = true;

        const validCred = extractQrCredential(decodedText);
        if (!validCred) {
          getStatusBanner('QR Code não reconhecido como credencial LAIFT.', 'error');
          scanInProgress = false;
          return;
        }

        getStatusBanner('Credencial lida. Validando presença...', 'loading');
        await closeScanner();

        try {
          let res;
          if (typeof ApiService.carimbarPresenca === 'function') {
            res = await ApiService.carimbarPresenca(validCred, fiscalSession);
          } else if (typeof ApiService.callAppsScript === 'function') {
            res = await ApiService.callAppsScript({
              acao: 'carimbarPresenca',
              credencial: validCred,
              sessao: fiscalSession
            });
          }

          if (res && res.sucesso) {
            getStatusBanner(res.mensagem || 'Presença confirmada.', 'success');
          } else {
            getStatusBanner((res && res.mensagem) || 'Não foi possível registrar a presença.', 'error');
          }
        } catch (err) {
          console.error(err);
          getStatusBanner('Erro ao comunicar com o servidor.', 'error');
        } finally {
          scanInProgress = false;
        }
      },
      () => {}
    );
  }

  async function closeScanner() {
    if (!scannerInstance) return;
    try {
      await scannerInstance.clear();
    } catch (e) {
      console.warn('Aviso ao encerrar scanner:', e);
    }
    scannerInstance = null;

    const readerEl = document.getElementById('reader');
    const scannerBtn = document.getElementById('scannerButton');
    if (readerEl) readerEl.classList.add('hidden');
    if (scannerBtn) scannerBtn.classList.remove('hidden');
  }

  async function submitManualCheckin() {
    const idInput = document.getElementById('manualIdentifier');
    const identifier = idInput ? idInput.value.trim() : '';

    if (!identifier) {
      getStatusBanner('Digite a matrícula ou CPF do participante.', 'error');
      return;
    }

    getStatusBanner('Registrando presença...', 'loading');
    try {
      let res;
      if (typeof ApiService.carimbarPresencaManual === 'function') {
        res = await ApiService.carimbarPresencaManual(identifier, fiscalSession);
      } else if (typeof ApiService.callAppsScript === 'function') {
        res = await ApiService.callAppsScript({
          acao: 'carimbarPresencaManual',
          identificador: identifier,
          sessao: fiscalSession
        });
      }

      if (idInput) idInput.value = '';

      if (res && res.sucesso) {
        getStatusBanner(res.mensagem || 'Presença confirmada.', 'success');
      } else {
        getStatusBanner((res && res.mensagem) || 'Não foi possível registrar a presença.', 'error');
      }
    } catch (err) {
      console.error(err);
      getStatusBanner('Erro ao registrar presença.', 'error');
    }
  }

  // =========================================================
  // 7. PESQUISA NOMINAL & LISTAGEM DE MEMBROS
  // =========================================================

  function scheduleMemberSearch() {
    clearTimeout(memberSearchTimer);
    memberSearchTimer = setTimeout(searchMembers, 350);
  }

  async function searchMembers() {
    const searchInput = document.getElementById('memberSearch');
    const term = searchInput ? searchInput.value.trim() : '';
    const list = document.getElementById('memberList');
    if (!list) return;

    if (term.length < 2) {
      list.innerHTML = `
        <div class="member-list-empty">
          Digite ao menos dois caracteres para pesquisar participantes.
        </div>
      `;
      return;
    }

    list.innerHTML = `
      <div class="member-list-empty">
        Buscando participantes na base da LAIFT...
      </div>
    `;

    try {
      let res;
      if (typeof ApiService.listarMembros === 'function') {
        res = await ApiService.listarMembros(term, fiscalSession);
      } else if (typeof ApiService.callAppsScript === 'function') {
        res = await ApiService.callAppsScript({
          acao: 'listarMembros',
          termo: term,
          sessao: fiscalSession
        });
      } else {
        throw new Error('Método de listagem não disponível no ApiService.');
      }

      if (!res || !res.sucesso) {
        list.innerHTML = `
          <div class="member-list-empty">
            ${(res && res.mensagem) || 'Não foi possível consultar a lista.'}
          </div>
        `;
        return;
      }

      window.ultimosMembrosBuscados = res.membros || [];
      renderMemberList(window.ultimosMembrosBuscados);
    } catch (err) {
      console.error('Falha na consulta de membros:', err);
      list.innerHTML = `
        <div class="member-list-empty">
          Não foi possível consultar a lista no momento.
        </div>
      `;
    }
  }

  function renderMemberList(members) {
    const list = document.getElementById('memberList');
    if (!list) return;

    if (!members || !members.length) {
      list.innerHTML = `
        <div class="member-list-empty">
          Nenhum participante encontrado.
        </div>
      `;
      return;
    }

    list.innerHTML = '';
    members.forEach((member) => {
      const item = document.createElement('div');
      item.className = 'member-item';
      item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--line, #e2e8f0); gap: 10px;';

      const info = document.createElement('div');
      info.className = 'member-info';
      info.style.cssText = 'flex: 1; text-align: left;';

      const name = document.createElement('div');
      name.className = 'member-name';
      name.style.cssText = 'font-weight: 600; color: var(--text-ui, #0f172a);';
      name.textContent = member.nomeExibicao || member.nome || 'Participante';

      const meta = document.createElement('div');
      meta.className = 'member-meta';
      meta.style.cssText = 'font-size: 0.8rem; color: var(--muted, #64748b); margin-top: 2px;';
      meta.textContent = `${member.tipo || 'Participante'} · ${member.identificador || ''}`;

      info.appendChild(name);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'member-actions';
      actions.style.cssText = 'display: flex; gap: 6px; align-items: center;';

      const btnPresence = document.createElement('button');
      btnPresence.type = 'button';
      btnPresence.className = 'btn btn-secondary btn-sm';
      btnPresence.textContent = '✅ Presença';
      btnPresence.addEventListener('click', () => {
        markPresenceFromList(member.identificador);
      });

      const btnCracha = document.createElement('button');
      btnCracha.type = 'button';
      btnCracha.className = 'btn btn-outline btn-sm';
      btnCracha.textContent = '🏷️ Crachá';
      btnCracha.addEventListener('click', () => {
        abrirStudioCracha(member);
      });

      actions.appendChild(btnPresence);
      actions.appendChild(btnCracha);

      item.appendChild(info);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  async function markPresenceFromList(identifier) {
    if (!identifier) return;

    getStatusBanner('Registrando presença pela lista...', 'loading');
    try {
      let res;
      if (typeof ApiService.marcarPresencaLista === 'function') {
        res = await ApiService.marcarPresencaLista(identifier, fiscalSession);
      } else if (typeof ApiService.callAppsScript === 'function') {
        res = await ApiService.callAppsScript({
          acao: 'marcarPresencaLista',
          identificador: identifier,
          sessao: fiscalSession
        });
      } else {
        throw new Error('Método de presença não disponível no ApiService.');
      }

      if (res && res.sucesso) {
        getStatusBanner(res.mensagem || 'Presença confirmada.', 'success');
      } else {
        getStatusBanner((res && res.mensagem) || 'Não foi possível registrar a presença.', 'error');
      }
    } catch (err) {
      console.error(err);
      getStatusBanner('Erro ao registrar presença.', 'error');
    }
  }

  async function resendCredentialEmail() {
    const session = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '{}');
    if (!session.sessionToken) {
      getStatusBanner('Sessão expirada. Autentique-se novamente.', 'error');
      return;
    }

    getStatusBanner('Enviando QR Code para seu e-mail...', 'loading');
    try {
      let res;
      if (typeof ApiService.reenviarCredencialEmail === 'function') {
        res = await ApiService.reenviarCredencialEmail(session.sessionToken);
      } else if (typeof ApiService.callAppsScript === 'function') {
        res = await ApiService.callAppsScript({
          acao: 'reenviarCredencialEmail',
          tokenSessao: session.sessionToken
        });
      }

      if (res && res.sucesso) {
        getStatusBanner(res.mensagem || 'QR Code reenviado com sucesso.', 'success');
      } else {
        getStatusBanner((res && res.mensagem) || 'Não foi possível reenviar a credencial.', 'error');
      }
    } catch (err) {
      console.error(err);
      getStatusBanner('Erro de conexão ao reenviar e-mail.', 'error');
    }
  }

  // =========================================================
  // 8. ENCERRAMENTO DE SESSÃO FISCAL
  // =========================================================

  async function logoutFiscal() {
    try {
      if (fiscalSession && typeof ApiService.logoutFiscal === 'function') {
        await ApiService.logoutFiscal(fiscalSession);
      } else if (fiscalSession && typeof ApiService.callAppsScript === 'function') {
        await ApiService.callAppsScript({
          acao: 'logoutFiscal',
          sessao: fiscalSession
        });
      }
    } catch (e) {
      console.warn('Aviso de logout fiscal:', e);
    }

    await closeScanner();
    fiscalSession = '';
    scanInProgress = false;

    const fiscalArea = document.getElementById('fiscalArea');
    if (fiscalArea) fiscalArea.classList.add('hidden');

    const identityForm = document.getElementById('identityForm');
    if (identityForm) identityForm.classList.remove('hidden');

    const subtitle = document.getElementById('headerSubtitle');
    if (subtitle) subtitle.textContent = 'Autenticação Digital & Simulações Clínicas';

    const eventName = document.getElementById('eventName');
    if (eventName) eventName.value = '';

    const manualId = document.getElementById('manualIdentifier');
    if (manualId) manualId.value = '';

    const searchInput = document.getElementById('memberSearch');
    if (searchInput) searchInput.value = '';

    const memberList = document.getElementById('memberList');
    if (memberList) {
      memberList.innerHTML = `
        <div class="member-list-empty">
          Digite ao menos dois caracteres para pesquisar participantes.
        </div>
      `;
    }

    clearStatusBanner();
    if (typeof window.restartPublicFlow === 'function') {
      window.restartPublicFlow();
    }
  }

  // =========================================================
  // 9. INICIALIZAÇÃO DE GATILHOS (DUPLO CLIQUE, TOUCH E ATALHO)
  // =========================================================

  function initListeners() {
    const triggerElements = [
      document.getElementById('fiscalTriggerArea'),
      document.getElementById('laiftLogo'),
      document.getElementById('globalHeader')
    ].filter(Boolean);

    triggerElements.forEach(el => {
      // Duplo clique Desktop
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        abrirModalLogin();
      });

      // Toque duplo em dispositivos móveis
      let lastTap = 0;
      el.addEventListener('touchend', (e) => {
        const currentTime = Date.now();
        const tapLength = currentTime - lastTap;
        if (tapLength < 400 && tapLength > 0) {
          e.preventDefault();
          abrirModalLogin();
        }
        lastTap = currentTime;
      });
    });

    // Atalho de Teclado: Ctrl + Shift + F ou Cmd + Shift + F
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        abrirModalLogin();
      }
    });
  }

  return {
    initListeners,
    abrirModalLogin,
    fecharModalLogin,
    confirmarLoginModal,
    openFiscalLogin: abrirModalLogin,
    saveActiveEvent,
    startFiscalScanner,
    submitManualCheckin,
    scheduleMemberSearch,
    markPresenceFromList,
    logoutFiscal,
    resendCredentialEmail,
    abrirStudioCracha,
    gerarCrachaDireto,
    baixarListaPresencaCsv,
    verificarSaudeRedeIA,
    abrirModalLoteCrachas,
    fecharModalLoteCrachas,
    toggleMembroLote,
    atualizarNomeLote,
    atualizarTipoLote,
    carregarFotoLote,
    marcarTodosLote,
    filtrarTabelaLote,
    executarImpressaoLoteA4,
    imprimirCrachasSelecionados: abrirModalLoteCrachas
  };
})();

// Declarações globais para suportar chamadas inline no HTML
window.FiscalEngine = FiscalEngine;
window.resendCredentialEmail = FiscalEngine.resendCredentialEmail;
window.saveActiveEvent = FiscalEngine.saveActiveEvent;
window.startFiscalScanner = FiscalEngine.startFiscalScanner;
window.submitManualCheckin = FiscalEngine.submitManualCheckin;
window.scheduleMemberSearch = FiscalEngine.scheduleMemberSearch;
window.logoutFiscal = FiscalEngine.logoutFiscal;
window.gerarCrachaDireto = FiscalEngine.gerarCrachaDireto;
window.abrirStudioCracha = FiscalEngine.abrirStudioCracha;
window.verificarSaudeRedeIA = FiscalEngine.verificarSaudeRedeIA;
window.abrirModalLoteCrachas = FiscalEngine.abrirModalLoteCrachas;
window.fecharModalLoteCrachas = FiscalEngine.fecharModalLoteCrachas;

window.addEventListener('DOMContentLoaded', FiscalEngine.initListeners);
