/**
 * LAIFT — LABORATÓRIO VIRTUAL DE BANCADA & SÍNTESE FARMACÊUTICA
 * Motor Quimiométrico, Cinemática Reacional, Visualizador 2D/3D Híbrido (3Dmol.js),
 * Cache local em IndexedDB e Preceptor de bancada com IA (via Worker, apiLearnLabPreceptor).
 */
(function() {
  'use strict';

  // =========================================================================
  // 1. SISTEMA DE TELEMETRIA E DIAGNÓSTICO
  // =========================================================================
  const relatorioErros = [];
  window.addEventListener('error', function(e) {
    relatorioErros.push(`[ERRO] ${e.message} (Linha: ${e.lineno})`);
    console.warn("[LAIFT Telemetria]", e.message);
  });

  window.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      window.LaiftDialog.alert("=== LAIFT: DIAGNÓSTICO DE BANCADA ===\n\n" + (relatorioErros.length ? relatorioErros.join('\n') : "✅ Sistema estável. Nenhum erro crítico registrado."), { title: 'Diagnóstico de bancada' });
    }
  });

  // =========================================================================
  // 2. SISTEMA DE ÁUDIO SINTÉTICO (Web Audio API)
  // =========================================================================
  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
  }

  function tocarSom(tipo) {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      if (tipo === 'gota') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(650, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(850, audioCtx.currentTime + 0.08);
        gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
      } else if (tipo === 'erro') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } else if (tipo === 'sucesso') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      }
    } catch (e) {
      console.warn('Áudio não disponível:', e);
    }
  }

  // =========================================================================
  // 3. TABELAS FÍSICO-QUÍMICAS E GATEWAYS
  // =========================================================================
  // Registro de formulações: agora pela ponte da plataforma
  // (window.LaiftApi → apiLearnRecordLabFormulation), não mais pelo Apps Script.
  const h = LaiftDom.h;

  const DICIONARIO_MOLECULAR = {
    'AcidoSalicilico_s': { label: 'Ácido Salicílico', formula: 'C7H6O3', molarMass: 138.12, density: 1.44, bp: 211, fp: 159, smiles: 'O=C(O)C1=CC=CC=C1O', iupac: '2-hydroxybenzoic acid', pubchemQuery: 'Salicylic acid' },
    'C7H6O3_s': { label: 'Ácido Salicílico', formula: 'C7H6O3', molarMass: 138.12, density: 1.44, bp: 211, fp: 159, smiles: 'O=C(O)C1=CC=CC=C1O', iupac: '2-hydroxybenzoic acid', pubchemQuery: 'Salicylic acid' },
    'AnidridoAcetico_l': { label: 'Anidrido Acético', formula: 'C4H6O3', molarMass: 102.09, density: 1.08, bp: 139.8, fp: -73, smiles: 'CC(=O)OC(=O)C', iupac: 'acetic anhydride', pubchemQuery: 'Acetic anhydride' },
    'pAminofenol_s': { label: '4-Aminofenol', formula: 'C6H7NO', molarMass: 109.13, density: 1.29, bp: 284, fp: 188, smiles: 'NC1=CC=C(O)C=C1', iupac: '4-aminophenol', pubchemQuery: '4-Aminophenol' },
    'AlcoolIsopentilico_l': { label: 'Álcool Isopentílico', formula: 'C5H12O', molarMass: 88.15, density: 0.81, bp: 131.1, fp: -117, smiles: 'CC(C)CCO', iupac: '3-methylbutan-1-ol', pubchemQuery: 'Isoamyl alcohol' },
    'Anilina_l': { label: 'Anilina', formula: 'C6H7N', molarMass: 93.13, density: 1.022, bp: 184, fp: -6.3, smiles: 'Nc1ccccc1', iupac: 'aniline', pubchemQuery: 'Aniline' },
    'AcidoBenzoico_s': { label: 'Ácido Benzóico', formula: 'C7H6O2', molarMass: 122.12, density: 1.27, bp: 249, fp: 122, smiles: 'O=C(O)c1ccccc1', iupac: 'benzoic acid', pubchemQuery: 'Benzoic acid' },
    'Etanol_l': { label: 'Etanol Absoluto', formula: 'C2H6O', molarMass: 46.07, density: 0.789, bp: 78.3, fp: -114.1, smiles: 'CCO', iupac: 'ethanol', pubchemQuery: 'Ethanol' },
    'Metanol_l': { label: 'Metanol', formula: 'CH4O', molarMass: 32.04, density: 0.792, bp: 64.7, fp: -97.6, smiles: 'CO', iupac: 'methanol', pubchemQuery: 'Methanol' },
    'Acetona_l': { label: 'Acetona Pura', formula: 'C3H6O', molarMass: 58.08, density: 0.784, bp: 56.1, fp: -94.7, smiles: 'CC(=O)C', iupac: 'propan-2-one', pubchemQuery: 'Acetone' },
    'Hexano_l': { label: 'Hexano', formula: 'C6H14', molarMass: 86.18, density: 0.659, bp: 68.7, fp: -95.3, smiles: 'CCCCCC', iupac: 'hexane', pubchemQuery: 'Hexane' },
    'Benzeno_l': { label: 'Benzeno', formula: 'C6H6', molarMass: 78.11, density: 0.879, bp: 80.1, fp: 5.5, smiles: 'c1ccccc1', iupac: 'benzene', pubchemQuery: 'Benzene' },
    'Tolueno_l': { label: 'Tolueno', formula: 'C7H8', molarMass: 92.14, density: 0.867, bp: 110.6, fp: -95.0, smiles: 'Cc1ccccc1', iupac: 'methylbenzene', pubchemQuery: 'Toluene' },
    'Cloroformio_l': { label: 'Clorofórmio', formula: 'CHCl3', molarMass: 119.38, density: 1.489, bp: 61.2, fp: -63.5, smiles: 'ClC(Cl)Cl', iupac: 'trichloromethane', pubchemQuery: 'Chloroform' },
    'AcidoAcetico_aq': { label: 'Ácido Acético', formula: 'C2H4O2', molarMass: 60.05, density: 1.05, bp: 118, fp: 16.6, smiles: 'CC(=O)O', iupac: 'acetic acid', pubchemQuery: 'Acetic acid' },
    
    // Fármacos e Produtos Estruturados
    'AAS_s': { label: 'Ácido Acetilsalicílico (Aspirina)', formula: 'C9H8O4', molarMass: 180.16, density: 1.4, bp: 140, fp: 135, smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O', iupac: '2-acetyloxybenzoic acid', pubchemQuery: 'Aspirin' },
    'C9H8O4_s': { label: 'Ácido Acetilsalicílico (Aspirina)', formula: 'C9H8O4', molarMass: 180.16, density: 1.4, bp: 140, fp: 135, smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O', iupac: '2-acetyloxybenzoic acid', pubchemQuery: 'Aspirin' },
    'Paracetamol_s': { label: 'Paracetamol (Acetaminofeno)', formula: 'C8H9NO2', molarMass: 151.16, density: 1.29, bp: 420, fp: 169, smiles: 'CC(=O)NC1=CC=C(O)C=C1', iupac: 'N-(4-hydroxyphenyl)acetamide', pubchemQuery: 'Acetaminophen' },
    'C8H9NO2_s': { label: 'Paracetamol (Acetaminofeno)', formula: 'C8H9NO2', molarMass: 151.16, density: 1.29, bp: 420, fp: 169, smiles: 'CC(=O)NC1=CC=C(O)C=C1', iupac: 'N-(4-hydroxyphenyl)acetamide', pubchemQuery: 'Acetaminophen' },
    'Dipirona_s': { label: 'Dipirona Sódica (Metamizol)', formula: 'C13H16N3NaO4S', molarMass: 333.34, density: 1.35, bp: null, fp: 220, smiles: 'CC1=C(C(=O)N(N1C)C2=CC=CC=C2)N(C)CS(=O)(=O)[O-].[Na+]', iupac: 'sodium;[(1,5-dimethyl-3-oxo-2-phenylpyrazol-4-yl)-methylamino]methanesulfonate', pubchemQuery: 'Metamizole sodium' },
    'SalicilatoMetila_l': { label: 'Salicilato de Metila', formula: 'C8H8O3', molarMass: 152.15, density: 1.17, bp: 222, fp: -8.6, smiles: 'COC(=O)C1=CC=CC=C1O', iupac: 'methyl 2-hydroxybenzoate', pubchemQuery: 'Methyl salicylate' },
    'Acetanilida_s': { label: 'Acetanilida', formula: 'C8H9NO', molarMass: 135.17, density: 1.21, bp: 304, fp: 114.3, smiles: 'CC(=O)Nc1ccccc1', iupac: 'N-phenylacetamide', pubchemQuery: 'Acetanilide' },
    'AcetatoIsopentila_l': { label: 'Acetato de Isopentila', formula: 'C7H14O2', molarMass: 130.18, density: 0.876, bp: 142, fp: -78.5, smiles: 'CC(=O)OCCC(C)C', iupac: '3-methylbutyl acetate', pubchemQuery: 'Isoamyl acetate' },

    // Sais e Precipitados Inorgânicos
    'PbI2_s': { label: 'Iodeto de Chumbo II', formula: 'PbI2', molarMass: 461.01, density: 6.16, bp: 954, fp: 402, smiles: 'I[Pb]I', iupac: 'lead(2+) diiodide', pubchemQuery: 'Lead(II) iodide' },
    'AgCl_s': { label: 'Cloreto de Prata', formula: 'AgCl', molarMass: 143.32, density: 5.56, bp: 1550, fp: 455, smiles: '[Cl-].[Ag+]', iupac: 'silver(1+) chloride', pubchemQuery: 'Silver chloride' },
    'BaSO4_s': { label: 'Sulfato de Bário', formula: 'BaSO4', molarMass: 233.39, density: 4.5, bp: null, fp: 1580, smiles: '[Ba+2].[O-]S(=O)(=O)[O-]', iupac: 'barium sulfate', pubchemQuery: 'Barium sulfate' },
    'CaCO3_s': { label: 'Carbonato de Cálcio', formula: 'CaCO3', molarMass: 100.09, density: 2.71, bp: 825, fp: 1339, smiles: '[Ca+2].[O-]C(=O)[O-]', iupac: 'calcium carbonate', pubchemQuery: 'Calcium carbonate' }
  };

  const MM = {
    Na:23, Al:27, Zn:65.4, Mg:24.3, CuSO4:159.6, NaCl:58.4, CaCO3:100, KI:166, AgNO3:169.9,
    PbNO3:331, NaOH:40, HCl:36.5, Li:6.94, K:39.1, Ca:40.08, NaHCO3:84.0, K2CO3:138.2, KOH:56.1,
    LiOH:23.95, CaOH2:74.09, I2:253.8, S:32.06, P:30.97, Fe:55.8, Ni:58.7, Cu:63.5, Sn:118.7,
    Pb:207.2, HNO3:63.0, HClO4:100.5, H3PO4:98.0, AcidoSalicilico:138.12, pAminofenol:109.13, AcidoBenzoico:122.12
  };

  const LQ = window.LabQuimica;
  const CONC_AQ = LQ.CONC_AQ;

  const BP = {
    H2O_l:100, Etanol_l:78.4, Acetona_l:56, Hexano_l:68.7, Benzeno_l:80.1, Tolueno_l:110.6,
    Metanol_l:64.7, Cloroformio_l:61.2, AnidridoAcetico_l:139.8, AlcoolIsopentilico_l:131.1, Anilina_l:184.1
  };

  const FP = {
    H2O_l:0, Etanol_l:-114, Acetona_l:-95, Hexano_l:-95, Benzeno_l:5.5, Tolueno_l:-95,
    Metanol_l:-98, Cloroformio_l:-63.5, AnidridoAcetico_l:-73, AlcoolIsopentilico_l:-117, Anilina_l:-6
  };

  const PRECIP_TABLE = LQ.PRECIP_TABLE;

  // =========================================================================
  // 4. MOTOR DE BANCO DE DADOS LOCAL (IndexedDB)
  // =========================================================================
  // Cache local em IndexedDB: js/lab-cache-local.js (extraído na O3, mesmo comportamento).
  const DB_CACHE = window.LabCacheLocal.criarCacheLocal(window.indexedDB || null);

  // =========================================================================
  // 5. ESTADO GLOBAL DO LABORATÓRIO
  // =========================================================================
  const sys = {
    maxVol: 250,
    vol: 0,
    temp: 25,
    pressao: 1,
    isClosed: false,
    modoTermico: 'ambiente',
    especies: new Map(),
    shattered: false,
    fenolftaleina: false,
    ultimoProdutoFormado: null
  };

  window.sys = sys;

  let historico = [];
  let timerAdd = null;
  let passoAdicaoFn = null;
  let pausadoPorAba = false;
  let adicaoPausadaPorAba = false;
  let timerLoop = null;
  let qtdRestante = 0;
  let incrAdd = 1;
  let phDataPoints = [];
  let velocidadeTempo = 1;
  let agitadorAtivo = false;
  let focoAtivo = false;
  const reagentesAdicionados = new Set();
  const reacoesCatalogadas = new Set();
  const adicionadoPorReagente = new Map();
  let missaoConcluida = false;
  let smilesDrawerInstance = null;
  let viewer3D = null;
  let modoVisualizacao = '2D';
  let compostoAtualParaDossie = null;
  let sdfCachePendente = null;
  let conformacaoPedida = null;

  const logEl = document.getElementById('logStream');
  const phCanvas = document.getElementById('phCanvas');
  const phCtx = phCanvas ? phCanvas.getContext('2d') : null;
  if (phCanvas) { phCanvas.width = 280; phCanvas.height = 140; }

  function salvarEstado() {
    historico.push(JSON.stringify({ vol: sys.vol, temp: sys.temp, especies: Array.from(sys.especies.entries()) }));
    if (historico.length > 5) historico.shift();
  }

  function desfazerAcao() {
    if (historico.length === 0) { log('Nada para desfazer.', 'log-warn'); return; }
    const estadoAntigo = JSON.parse(historico.pop());
    sys.vol = estadoAntigo.vol;
    sys.temp = estadoAntigo.temp;
    sys.especies = new Map(estadoAntigo.especies);
    atualizarEquilibrio();
    atualizarEstadoFisico();
    atualizarUI();
    atualizarInspecaoMolecular();
    log('↩ Última ação desfeita.', 'log-info');
  }

  function log(msg, cls='') {
    if (!logEl) return;
    const ts = new Date().toTimeString().slice(0, 8);
    // Mensagens podem trazer nomes vindos do Estúdio (moléculas criadas
    // pelo usuário) ou de APIs: sempre como texto.
    const entry = h('div', { className: 'log-entry' }, [
      h('span', { className: 'log-time', text: `[${ts}]` }),
      h('span', { className: cls || null, text: String(msg) })
    ]);
    logEl.prepend(entry);
    if (logEl.children.length > 70) logEl.removeChild(logEl.lastChild);
  }

  function limparRegistro() {
    if (!logEl) return;
    LaiftDom.clear(logEl);
    logEl.appendChild(h('span', { className: 'log-muted', text: '[Sistema] Registro limpo.' }));
  }

  const avisosSemReacao = new Set();

  // Nome legível e unidade: js/lab-rotulos.js (extraído na O3, mesmo comportamento).
  const especiesDaBase = () => (typeof LAB_DATABASE !== 'undefined' && LAB_DATABASE.species) || null;
  function rotulo(id) { return window.LabRotulos.rotulo(id, especiesDaBase(), DICIONARIO_MOLECULAR); }
  function unidadeDe(id) { return window.LabRotulos.unidadeDe(id, especiesDaBase()); }

  function qtd(chave) { return sys.especies.get(chave) || 0; }
  function adicionarEspecie(chave, mmol) { if (mmol <= 0) return; sys.especies.set(chave, (sys.especies.get(chave) || 0) + mmol); }
  function removerEspecie(chave, mmol) {
    const atual = sys.especies.get(chave) || 0;
    const novo = Math.max(0, atual - mmol);
    if (novo < 1e-12) sys.especies.delete(chave);
    else sys.especies.set(chave, novo);
  }

  // Bibliotecas pesadas (SmilesDrawer 61 KB e 3Dmol 155 KB, comprimidas) saem do caminho crítico: baixam sob demanda, com o
  // mesmo SRI de antes (conferido por vendor-sri.test.mjs). Resolve true/false; nunca rejeita.
  const VENDOR = {
    smiles: { src: 'vendor/smiles-drawer-2.1.7/smiles-drawer.min.js', sri: 'sha384-7qaH3wakC2tfDmCIw89VkGQ+G9iEvHeVV+GFGveOo/NLBcwW3TtGNHrL7HLDCbCm' },
    '3dmol': { src: 'vendor/3dmol/3Dmol-min.js', sri: 'sha384-OsczYbldvrHgslr9fFp/i4GiLSeuw9l+QIlv99ITw8soOwXcoGeflFMLg+CU/X1d' }
  };
  const vendorCarga = {};
  const vendorFim = {};
  function carregarVendor(nome) {
    if (vendorCarga[nome]) return vendorCarga[nome];
    vendorCarga[nome] = new Promise((ok) => {
      const s = document.createElement('script');
      s.src = VENDOR[nome].src;
      s.integrity = VENDOR[nome].sri;
      s.crossOrigin = 'anonymous';
      s.onload = () => { vendorFim[nome] = true; ok(true); };
      s.onerror = () => { vendorFim[nome] = true; ok(false); };
      document.head.appendChild(s);
    });
    return vendorCarga[nome];
  }

  // =========================================================================
  // 6. VISUALIZADOR 2D HÍBRIDO & 3D (BLINDADO CONTRA ERRO NO 3DMOL)
  // =========================================================================
  function initSmilesDrawer() {
    try {
      if (typeof SmilesDrawer !== 'undefined' && !smilesDrawerInstance) {
        smilesDrawerInstance = new SmilesDrawer.Drawer({
          width: 280,
          height: 150,
          bondThickness: 1.4,
          bondLength: 16,
          shortBondLength: 0.85,
          bondSpacing: 3.5,
          atomVisualization: 'default',
          isomeric: true,
          compactDrawing: false
        });
      }
    } catch (e) {
      console.warn('[SmilesDrawer] Falha na inicialização:', e);
    }
  }

  function validarConteudoSDF(sdfText) {
    if (!sdfText || typeof sdfText !== 'string') return false;
    return sdfText.includes('$$$$') || sdfText.includes('M  END');
  }

  function renderizarCena3DBancada(sdfText) {
    const div3D = document.getElementById('viewer3D');
    if (!div3D || !window.$3Dmol || !validarConteudoSDF(sdfText)) return;

    if (div3D.offsetWidth === 0 || div3D.offsetHeight === 0) return;

    try {
      LaiftDom.clear(div3D);
      if (viewer3D) {
        pararRotacao3D(viewer3D);
      }

      viewer3D = $3Dmol.createViewer(div3D, { backgroundColor: '#020617' });
      const model = viewer3D.addModel(sdfText, "sdf");

      if (model && typeof model.selectedAtoms === 'function') {
        viewer3D.setStyle({}, {
          stick: { radius: 0.14, colorscheme: 'Jmol' },
          sphere: { scale: 0.25, colorscheme: 'Jmol' }
        });
        viewer3D.zoomTo();
        viewer3D.render();
        viewer3D.resize();
        iniciarRotacao3D(viewer3D);
      }
    } catch (err3D) {
      console.warn('[3Dmol Bancada] Erro ao renderizar modelo:', err3D);
    }
  }

  // O animate() do 3Dmol percorre quadros (frames) com passo fracionado: em modelo de um quadro só (SDF/PDB único),
  // setFrame(0.4) faz model.atoms = frames[0.4] = undefined e o render seguinte lança "reading 'length'" em
  // GLModel.selectedAtoms. A rotação contínua usa spin(), que só gira a câmera; para parar, spin(false) + stopAnimate().
  function iniciarRotacao3D(v) {
    if (!v) return;
    try { v.spin('y', 0.4); } catch (e) {}
  }
  function pararRotacao3D(v) {
    if (!v) return;
    try { v.spin(false); } catch (e) {}
    try { v.stopAnimate(); } catch (e) {}
  }

  window.setModoVisualizacao = function(modo) {
    modoVisualizacao = modo;
    const canvas2D = document.getElementById('moleculeCanvas');
    const img2D = document.getElementById('moleculeImg');
    const div3D = document.getElementById('viewer3D');
    const btn2D = document.getElementById('btnModo2D');
    const btn3D = document.getElementById('btnModo3D');

    if (btn2D) btn2D.classList.toggle('active-btn', modo === '2D');
    if (btn3D) btn3D.classList.toggle('active-btn', modo === '3D');

    if (modo === '2D') {
      if (div3D) div3D.style.display = 'none';
      if (viewer3D) {
        pararRotacao3D(viewer3D);
      }

      if (img2D && img2D.getAttribute('data-active') === 'true') {
        img2D.style.display = 'block';
        if (canvas2D) canvas2D.style.display = 'none';
      } else if (canvas2D) {
        canvas2D.style.display = 'block';
        if (img2D) img2D.style.display = 'none';
      }
    } else {
      if (canvas2D) canvas2D.style.display = 'none';
      if (img2D) img2D.style.display = 'none';
      if (div3D) {
        div3D.style.display = 'block';
        iniciarConformacao3D();
        setTimeout(() => {
          if (div3D.offsetWidth > 0 && div3D.offsetHeight > 0) {
            if (sdfCachePendente) {
              renderizarCena3DBancada(sdfCachePendente);
            } else if (viewer3D) {
              viewer3D.resize();
              viewer3D.render();
              iniciarRotacao3D(viewer3D);
            }
          }
        }, 60);
      }
    }
  };

  function desenharFallbackCartao(canvas, smiles, nomeExibicao, formula, peso) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px "Urbanist", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(nomeExibicao || 'Composto Químico', canvas.width / 2, 42);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 18px "Fira Code", monospace';
    ctx.fillText(formula || '--', canvas.width / 2, 75);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px "Fira Code", monospace';
    ctx.fillText(peso ? `Massa: ${peso} g/mol` : 'Ficha Molecular Indexada', canvas.width / 2, 105);

    ctx.fillStyle = '#475569';
    ctx.font = '12px "Fira Code", monospace';
    const sTrunc = (smiles || '--').substring(0, 32) + ((smiles && smiles.length > 32) ? '...' : '');
    ctx.fillText(sTrunc, canvas.width / 2, 128);
  }

  function carregarImagemExterna(smiles, nomeExibicao, pubchemQuery, formula, peso) {
    const canvas = document.getElementById('moleculeCanvas');
    const imgEl = document.getElementById('moleculeImg');
    const termo = pubchemQuery || nomeExibicao || smiles;

    if (imgEl && canvas) {
      if (modoVisualizacao === '2D') {
        canvas.style.display = 'none';
        imgEl.style.display = 'block';
      }
      imgEl.setAttribute('data-active', 'true');

      const urlPubChem = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(termo)}/PNG?image_size=280x150`;

      imgEl.onerror = function() {
        imgEl.onerror = function() {
          imgEl.style.display = 'none';
          imgEl.removeAttribute('data-active');
          if (canvas && modoVisualizacao === '2D') canvas.style.display = 'block';
          desenharFallbackCartao(canvas, smiles, nomeExibicao, formula, peso);
        };
        imgEl.src = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/image?format=png&width=280&height=150`;
      };

      imgEl.src = urlPubChem;
    } else if (canvas) {
      desenharFallbackCartao(canvas, smiles, nomeExibicao, formula, peso);
    }
  }

  async function carregarConformacao3D(termo, smiles) {
    const div3D = document.getElementById('viewer3D');
    if (!div3D || !window.$3Dmol) return;

    let sdf = await DB_CACHE.get('moleculas', termo);

    // 1. PubChem via SMILES Canônico (Mais estável que nomes em português)
    if (!sdf && smiles && smiles !== '--' && !smiles.includes('.')) {
      try {
        const urlSmiles = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/SDF?record_type=3d`;
        const res = await fetch(urlSmiles);
        if (res.ok) {
          const txt = await res.text();
          if (validarConteudoSDF(txt)) {
            sdf = txt;
            await DB_CACHE.set('moleculas', termo, sdf);
          }
        }
      } catch (e) {}
    }

    // 2. PubChem via Nome/Query
    if (!sdf) {
      try {
        const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(termo)}/SDF?record_type=3d`;
        const res = await fetch(url);
        if (res.ok) {
          const txt = await res.text();
          if (validarConteudoSDF(txt)) {
            sdf = txt;
            await DB_CACHE.set('moleculas', termo, sdf);
          }
        }
      } catch (e) {
        console.warn('[3D Conformer] Falha de download PubChem:', e);
      }
    }

    // 3. Fallback CACTUS NIH
    if (!sdf && smiles && smiles !== '--') {
      try {
        const resC = await fetch(`https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/file?format=sdf`);
        if (resC.ok) {
          const txtC = await resC.text();
          if (validarConteudoSDF(txtC)) {
            sdf = txtC;
            await DB_CACHE.set('moleculas', termo, sdf);
          }
        }
      } catch (e) {}
    }

    if (sdf && validarConteudoSDF(sdf)) {
      sdfCachePendente = sdf;
      if (modoVisualizacao === '3D' && div3D.offsetWidth > 0 && div3D.offsetHeight > 0) {
        renderizarCena3DBancada(sdf);
      }
    }
  }

  function desenharEstruturaSmiles(smiles, nomeExibicao, pubchemQuery, formula, peso) {
    if (smiles && smiles !== '--' && typeof SmilesDrawer === 'undefined' && !vendorFim.smiles) {
      carregarVendor('smiles').then(() => desenharEstruturaSmiles(smiles, nomeExibicao, pubchemQuery, formula, peso));
      return;
    }
    const canvas = document.getElementById('moleculeCanvas');
    const imgEl = document.getElementById('moleculeImg');
    const placeholder = document.getElementById('molPlaceholder');

    if (!canvas) return;

    if (!smiles || smiles === '--') {
      canvas.style.display = 'none';
      if (imgEl) {
        imgEl.style.display = 'none';
        imgEl.removeAttribute('data-active');
      }
      if (placeholder) {
        placeholder.style.display = 'block';
        placeholder.textContent = 'Selecione ou sintetize uma molécula para exibir sua estrutura.';
      }
      return;
    }

    if (placeholder) placeholder.style.display = 'none';

    let desenhouComSucesso = false;

    if (typeof SmilesDrawer !== 'undefined' && !smiles.includes('.')) {
      try {
        initSmilesDrawer();
        SmilesDrawer.parse(smiles, function(tree) {
          if (modoVisualizacao === '2D') {
            canvas.style.display = 'block';
            if (imgEl) {
              imgEl.style.display = 'none';
              imgEl.removeAttribute('data-active');
            }
          }
          smilesDrawerInstance.draw(tree, 'moleculeCanvas', 'dark', false);
          desenhouComSucesso = true;
        }, function() {
          carregarImagemExterna(smiles, nomeExibicao, pubchemQuery, formula, peso);
        });
      } catch (err) {
        console.warn('[SmilesDrawer] Erro:', err);
      }
    }

    if (!desenhouComSucesso) {
      carregarImagemExterna(smiles, nomeExibicao, pubchemQuery, formula, peso);
    }

    // O conformador 3D (3 consultas ao PubChem/CACTUS e o 3Dmol) só é buscado quando a pessoa está na visão 3D.
    conformacaoPedida = [pubchemQuery || nomeExibicao || smiles, smiles];
    if (modoVisualizacao === '3D') iniciarConformacao3D();
  }

  function iniciarConformacao3D() {
    if (!conformacaoPedida) return;
    const pedido = conformacaoPedida;
    carregarVendor('3dmol').then((ok) => { if (ok && pedido === conformacaoPedida) carregarConformacao3D(pedido[0], pedido[1]); });
  }

  window.desenharEstruturaSmiles = desenharEstruturaSmiles;

  function atualizarInspecaoMolecular(compostoForcado) {
    let alvoId = compostoForcado || null;

    if (!alvoId && sys.ultimoProdutoFormado) {
      alvoId = sys.ultimoProdutoFormado;
    }

    if (!alvoId) {
      const radioSel = document.querySelector('input[name="reagenteSel"]:checked');
      if (radioSel) alvoId = radioSel.value;
    }

    if (!alvoId) {
      const especies = Array.from(sys.especies.entries())
        .filter(([esp, q]) => q > 0.05 && !['H2O_l', 'H+', 'OH-'].includes(esp))
        .sort((a, b) => b[1] - a[1]);
      if (especies.length > 0) alvoId = especies[0][0];
    }

    const elNome = document.getElementById('molName');
    const elIupac = document.getElementById('molIupac');
    const elFormula = document.getElementById('molFormula');
    const elWeight = document.getElementById('molWeight');
    const elDensity = document.getElementById('molDensity');
    const elThermic = document.getElementById('molThermic');
    const btnDossie = document.getElementById('btnDossieLab');

    if (!alvoId) {
      if (elNome) elNome.textContent = 'Aguardando seleção';
      if (elIupac) elIupac.textContent = '--';
      if (elFormula) elFormula.textContent = '--';
      if (elWeight) elWeight.textContent = '-- g/mol';
      if (elDensity) elDensity.textContent = '--';
      if (elThermic) elThermic.textContent = '--';
      if (btnDossie) btnDossie.style.display = 'none';
      desenharEstruturaSmiles('');
      return;
    }

    let info = (typeof LAB_DATABASE !== 'undefined' && LAB_DATABASE.species && LAB_DATABASE.species[alvoId])
      ? LAB_DATABASE.species[alvoId]
      : (DICIONARIO_MOLECULAR[alvoId] || null);

    if (!info && typeof window.BANCO_SINTESES_LAIFT !== 'undefined' && Array.isArray(window.BANCO_SINTESES_LAIFT)) {
      const synth = window.BANCO_SINTESES_LAIFT.find(s => s.produtoId === alvoId || s.id === alvoId);
      if (synth) {
        info = {
          label: synth.nomeComposto,
          formula: synth.formula || '--',
          molarMass: synth.molarMass || '--',
          density: synth.density || '--',
          bp: synth.tempMaxima || null,
          fp: synth.tempMinima || null,
          smiles: synth.smiles || '--',
          iupac: synth.iupac || synth.nomeComposto,
          pubchemQuery: synth.nomeComposto
        };
      }
    }

    const nomeDisplay = info?.label || alvoId.replace(/_s|_g|_l|_aq/g, '');
    const smiles = info?.smiles || '--';
    const iupac = info?.iupac || '--';
    const formula = info?.formula || '--';
    const molarMass = info?.molarMass || '--';
    const density = info?.density ? `${info.density} g/cm³` : '--';
    const bpFp = (info?.bp !== null || info?.fp !== null) ? `PE: ${info?.bp ?? '--'}°C / PF: ${info?.fp ?? '--'}°C` : '--';
    const pubchemQuery = info?.pubchemQuery || nomeDisplay;

    compostoAtualParaDossie = pubchemQuery;

    if (elNome) elNome.textContent = nomeDisplay;
    if (elIupac) elIupac.textContent = iupac;
    if (elFormula) elFormula.textContent = formula;
    if (elWeight) elWeight.textContent = molarMass !== '--' ? `${molarMass} g/mol` : '--';
    if (elDensity) elDensity.textContent = density;
    if (elThermic) elThermic.textContent = bpFp;

    if (btnDossie) {
      btnDossie.style.display = 'block';
      btnDossie.setAttribute('data-composto', pubchemQuery);
    }

    desenharEstruturaSmiles(smiles, nomeDisplay, pubchemQuery, formula, molarMass);
  }

  window.atualizarInspecaoMolecular = atualizarInspecaoMolecular;

  // =========================================================================
  // 7. DOSSIÊ TÉCNICO MULTIBASES (PUBCHEM / CHEBI / WIKIDATA)
  // =========================================================================
  window.abrirDossieCompostoAtual = async function() {
    const btn = document.getElementById('btnDossieLab');
    const nome = (btn ? btn.getAttribute('data-composto') : null) || compostoAtualParaDossie;
    const modal = document.getElementById('dossieLabModal');
    const container = document.getElementById('dossieLabContent');
    if (!modal || !container) return;

    modal.style.display = 'flex';
    LaiftDom.clear(container);
    container.appendChild(h('div', { className: 'dossie-loading' }, [
      'Consultando bases científicas para ', h('strong', { text: nome || 'o composto' }), '...'
    ]));

    if (!nome) {
      LaiftDom.clear(container);
      container.appendChild(h('p', { text: 'Nenhum produto em foco no momento.' }));
      return;
    }

    let dados = null;
    if (typeof ChemicalAPIEngine !== 'undefined' && typeof ChemicalAPIEngine.resolveCompleteCompound === 'function') {
      dados = await ChemicalAPIEngine.resolveCompleteCompound(nome);
    } else {
      dados = await consultarDadosPubChem(nome);
    }

    // Tudo aqui vem de PubChem/ChEBI/Wikidata (dado externo): só textContent.
    LaiftDom.clear(container);
    if (dados) {
      const linha = (rotulo, valor, cls) => h('div', { className: 'dossie-row' }, [
        h('strong', { text: rotulo + ' ' }), h(cls ? 'code' : 'span', { className: cls || null, text: String(valor) })
      ]);
      container.appendChild(h('div', { className: 'dossie-title' }, [h('strong', { text: nome })]));
      container.appendChild(linha('Origem dos Dados:', dados.origem || 'PubChem PUG-REST'));
      container.appendChild(linha('IUPAC Oficial:', dados.iupac || '--', 'dossie-mono'));
      container.appendChild(linha('Fórmula Molecular:', dados.formula || '--'));
      container.appendChild(linha('Massa Molar:', (dados.molarMass || dados.pesoMolecular || '--') + ' g/mol'));
      container.appendChild(linha('SMILES Canônico:', dados.smiles || '--', 'dossie-smiles'));
      container.appendChild(linha('Número CAS:', dados.cas || '--', 'dossie-mono'));
      container.appendChild(linha('ChEBI ID:', dados.chebiId || '--', 'dossie-mono'));
      container.appendChild(h('div', { className: 'dossie-bio' }, [
        h('strong', { text: 'Papel Biológico / Farmacológico:' }), h('br'),
        h('span', { text: dados.papelBiologico || dados.definicao || 'Propriedades descritas na Farmacopeia Brasileira e compêndios terapêuticos.' })
      ]));
    } else {
      container.appendChild(h('p', { className: 'dossie-erro' }, [
        'Não foi possível consultar os dados externos de ', h('strong', { text: nome }), '. Os dados locais continuam ativos.'
      ]));
    }
  };

  async function consultarDadosPubChem(termo) {
    try {
      // CanonicalSMILES segue aceito como alias no pedido, mas desde 2025 o
      // PubChem devolve a propriedade como ConnectivitySMILES (ou SMILES).
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(termo.trim())}/property/MolecularWeight,MolecularFormula,CanonicalSMILES,IUPACName/JSON`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json();
      const p = data?.PropertyTable?.Properties?.[0];
      if (p) {
        return {
          cid: p.CID,
          formula: p.MolecularFormula,
          molarMass: p.MolecularWeight, // pode vir como string; só é exibido, nunca usado em cálculo aqui
          smiles: p.CanonicalSMILES || p.ConnectivitySMILES || p.SMILES || p.IsomericSMILES || null,
          iupac: p.IUPACName
        };
      }
    } catch (e) {
      console.warn('[PubChem] Falha na consulta:', e);
    }
    return null;
  }

  /**
   * Registra a formulação concluída no desempenho da pessoa na plataforma
   * (Contrato 4: apiLearnRecordLabFormulation pela ponte window.LaiftApi).
   * A identidade vem da sessão da plataforma, nunca daqui. Antes ia ao Apps
   * Script com o e-mail no corpo e uma consulta extra ao PubChem só para
   * anexar fórmula/SMILES — o servidor não precisa disso.
   */
  async function catalogarFormulacaoNoBanco(nomeProduto, reagentesArray, tempAtual, agitacaoLigada, observacaoReacao) {
    if (!window.LaiftApi || typeof window.LaiftApi.call !== 'function') return null;
    const temperatura = Number(tempAtual !== undefined ? tempAtual : sys.temp);
    const payload = {
      product: String(nomeProduto || '').slice(0, 120),
      reagents: (reagentesArray || Array.from(reagentesAdicionados)).map(String).slice(0, 30),
      temperature: Number.isFinite(temperatura) ? Math.round(temperatura * 10) / 10 : null,
      stirring: !!(agitacaoLigada !== undefined ? agitacaoLigada : agitadorAtivo),
      observation: String(observacaoReacao || 'Síntese executada na bancada virtual LAIFT.').slice(0, 500)
    };

    try {
      const res = await window.LaiftApi.call('apiLearnRecordLabFormulation', payload);
      if (res && res.success) log(`🧪 Composto [${payload.product}] registrado no seu desempenho!`, 'log-info');
      return res;
    } catch (err) {
      console.warn('[Laboratório] Falha ao registrar a formulação:', err);
      return null;
    }
  }

  // =========================================================================
  // 8. VERIFICAÇÃO UNIFICADA DE SÍNTESE E REAÇÕES
  // =========================================================================
  // Andamento por reação (reagente limitante, tempo simulado e faixa de temperatura: ver lab-quimica.js).
  const sinteseEstado = new Map();
  const sinteseAviso = new Map();
  const MIN_SIMULADOS_POR_CICLO = 0.5; // cada ciclo do laço térmico representa 30 s de reação

  function infoDaEspecie(id) {
    return (typeof LAB_DATABASE !== 'undefined' && LAB_DATABASE.species && LAB_DATABASE.species[id]) || DICIONARIO_MOLECULAR[id] || null;
  }

  function descreverSintese(rx, r) {
    const pct = Math.round(r.progresso * 100);
    if (r.faltando.length) return `Síntese de ${rx.nomeComposto}: ${pct} %. Falta: ${r.faltando.join(', ')}.`;
    const lim = r.limitante ? ` Reagente limitante: ${rotulo(r.limitante)}.` : '';
    return `Síntese de ${rx.nomeComposto}: ${pct} %.${lim}`;
  }

  function concluirSintese(rx, est) {
    const e = rx.estequiometria;
    const teoricoMmol = e.produto.coef * est.xiConsumido;
    const realMmol = est.produtoMmol;
    const massaMolar = (infoDaEspecie(rx.produtoId) || {}).molarMass || 0;
    const gramas = massaMolar ? (realMmol * massaMolar) / 1000 : 0;
    const resumo = `rendimento real ${realMmol.toFixed(2)} mmol${gramas ? ` (${gramas.toFixed(2)} g)` : ''} de ${teoricoMmol.toFixed(2)} mmol teóricos (${rx.rendimentoPercentual} %)`;
    reacoesCatalogadas.add(rx.id);
    sys.ultimoProdutoFormado = rx.produtoId;
    tocarSom('sucesso');
    log(`✨ SÍNTESE CONCLUÍDA: ${rx.nomeComposto}, ${resumo}.`, 'log-info');
    atualizarInspecaoMolecular(rx.produtoId);
    catalogarFormulacaoNoBanco(
      rx.nomeComposto,
      Array.from(reagentesAdicionados),
      sys.temp,
      agitadorAtivo,
      `${rx.descricao || 'Síntese concluída na bancada.'} Reagente limitante consumido; ${resumo}.`
    );
  }

  /**
   * Avança as sínteses com estequiometria. `minutos` = tempo simulado desde a última chamada
   * (0 quando só há mudança de reagente/agitador). Devolve true se alguma quantidade mudou.
   */
  function verificarSinteseFarmaceutica(minutos) {
    const lista = (typeof LAB_DATABASE !== 'undefined' && Array.isArray(LAB_DATABASE.reactions)) ? LAB_DATABASE.reactions : [];
    let mudou = false;
    for (const rx of lista) {
      if (reacoesCatalogadas.has(rx.id)) continue;
      if (rx.precipitacaoIonica) {
        // Dupla troca: a quantidade formada vem da precipitação (equilibrar); aqui só se reconhece a conclusão.
        if (qtd(rx.produtoId) > 0.1) {
          reacoesCatalogadas.add(rx.id);
          log(`✨ REAÇÃO CONCLUÍDA: ${rx.nomeComposto}.`, 'log-info');
        }
        continue;
      }
      if (!rx.estequiometria || !rx.reagentesObrigatorios.every((r) => reagentesAdicionados.has(r))) continue;
      const r = LQ.avancarSintese(sys, rx, sinteseEstado.get(rx.id), minutos || 0, { agitadorAtivo, catalisadores: reagentesAdicionados });
      sinteseEstado.set(rx.id, r.est);
      if (r.est.xiConsumido > 0 && minutos) mudou = true;
      if (r.concluiu) { concluirSintese(rx, r.est); mudou = true; continue; }
      const chave = `${r.faltando.join('|')}#${Math.floor(r.progresso * 4)}`;
      if (sinteseAviso.get(rx.id) !== chave) {
        sinteseAviso.set(rx.id, chave);
        log(descreverSintese(rx, r), 'log-info');
      }
    }
    return mudou;
  }

  // =========================================================================
  // 9. CHAT DO PRECEPTOR COM IA
  // =========================================================================
  window.toggleLabChat = function() {
    const drawer = document.getElementById('labChatDrawer');
    if (drawer) {
      const visivel = drawer.style.display === 'flex';
      drawer.style.display = visivel ? 'none' : 'flex';
      if (!visivel) {
        const input = document.getElementById('labChatInput');
        if (input) setTimeout(() => input.focus(), 100);
      }
    }
  };

  window.enviarDuvidaRapida = function(pergunta) {
    const input = document.getElementById('labChatInput');
    if (input) {
      input.value = pergunta;
      window.enviarDuvidaLab();
    }
  };

  // Bolhas do chat: a resposta do preceptor e a pergunta do aluno são texto
  // puro (Contrato 2: "o cliente renderiza com textContent"); as quebras de
  // linha aparecem via CSS (white-space: pre-wrap em .lab-chat-msg).
  function bolhaChat(tipo, conteudo, extraClass) {
    const chatBox = document.getElementById('labChatMessages');
    if (!chatBox) return null;
    const bolha = h('div', { className: `lab-chat-msg ${tipo}${extraClass ? ' ' + extraClass : ''}` }, conteudo);
    chatBox.appendChild(bolha);
    chatBox.scrollTop = chatBox.scrollHeight;
    return bolha;
  }

  function statusPreceptor(texto, estado) {
    const badge = document.getElementById('preceptorStatusBadge');
    if (!badge) return;
    badge.textContent = texto;
    badge.dataset.state = estado;
  }

  window.enviarDuvidaLab = async function() {
    const input = document.getElementById('labChatInput');
    const msg = input ? input.value.trim() : '';
    if (!msg) return;

    bolhaChat('msg-aluno', [msg]);
    if (input) input.value = '';

    const digitando = bolhaChat('msg-preceptor', ['Consultando base farmacotécnica e parâmetros da vidraria...'], 'is-typing');
    statusPreceptor('Processando...', 'busy');

    try {
      if (typeof LabPreceptorEngine === 'undefined' || typeof LabPreceptorEngine.processarMensagem !== 'function') {
        throw new Error('Módulo LabPreceptorEngine não encontrado no escopo global.');
      }

      const respostaTexto = await LabPreceptorEngine.processarMensagem(msg, sys, calcularpH, agitadorAtivo);
      if (digitando) digitando.remove();
      const conteudo = [String(respostaTexto || '')];
      if (LabPreceptorEngine.ultimaRespostaDegradada === true) {
        conteudo.push(h('div', { className: 'lab-chat-aviso', role: 'status', text: LabPreceptorEngine.AVISO_DEGRADADO }));
      }
      bolhaChat('msg-preceptor', conteudo);
      statusPreceptor('Online', 'online');
    } catch (e) {
      if (digitando) digitando.remove();
      console.error('[Preceptor Error]:', e);
      bolhaChat('msg-preceptor', [
        '⚠️ ', h('strong', { text: 'Falha na comunicação:' }), h('br'),
        h('code', { className: 'chat-error-detail', text: String((e && e.message) || e) })
      ], 'is-error');
      statusPreceptor('Erro', 'error');
    }
  };

  let alertaPressaoEmitido = false;
  let alertaSinteseQuasePronta = false;
  let dicaAquecerEl = null;
  let avisoPressaoEl = null;

  function verificarAlertasProativosPreceptor() {
    const chatBox = document.getElementById('labChatMessages');
    if (!chatBox) return;

    if (dicaAquecerEl && dicaAquecerEl.isConnected) {
      const aindaValeA = (sys.especies.get('AcidoSalicilico_s') || 0) > 0 && (sys.especies.get('AnidridoAcetico_l') || 0) > 0 && sys.temp < 50;
      const num = dicaAquecerEl.querySelector('.dica-temp');
      if (!aindaValeA) { dicaAquecerEl.remove(); dicaAquecerEl = null; alertaSinteseQuasePronta = false; }
      else if (num) num.textContent = sys.temp.toFixed(1).replace('.', ',');
    }
    if (alertaPressaoEmitido && sys.pressao <= 1.5 && avisoPressaoEl) { avisoPressaoEl.remove(); avisoPressaoEl = null; }
    if (sys.isClosed && sys.pressao > 3.0 && !alertaPressaoEmitido) {
      alertaPressaoEmitido = true;
      avisoPressaoEl = bolhaChat('msg-preceptor', [
        '⚠️ ', h('strong', { text: 'Atenção Imediata:' }), ' A pressão interna atingiu ',
        h('strong', { text: `${sys.pressao.toFixed(2)} atm` }),
        '. Reduza o aquecimento ou remova a rolha para evitar estilhaçamento da vidraria!'
      ], 'is-error');
    } else if (sys.pressao <= 1.5) {
      alertaPressaoEmitido = false;
    }

    const temSalicilico = (sys.especies.get('AcidoSalicilico_s') || 0) > 0 || (sys.especies.get('C7H6O3_s') || 0) > 0;
    const temAnidrido = (sys.especies.get('AnidridoAcetico_l') || 0) > 0 || (sys.especies.get('C4H6O3_l') || 0) > 0;
    if (temSalicilico && temAnidrido && sys.temp < 50 && !alertaSinteseQuasePronta) {
      alertaSinteseQuasePronta = true;
      dicaAquecerEl = bolhaChat('msg-preceptor', [
        '💡 ', h('strong', { text: 'Dica Farmacotécnica:' }),
        ' Você reuniu os precursores da aspirina no vaso, mas a temperatura (',
        h('span', { className: 'dica-temp', text: sys.temp.toFixed(1).replace('.', ',') }),
        ' °C) está abaixo da energia de ativação necessária. Ligue o aquecedor para atingir ',
        h('strong', { text: '60 °C' }), ' e ative o agitador.'
      ]);
    }
  }

  // =========================================================================
  // 10. SISTEMA DE MISSÕES E ROTEIROS PRÁTICOS
  // =========================================================================
  // Missões e progresso: js/lab-missoes.js (extraído na O3, mesmo comportamento).
  const missoes = window.LabMissoes.MISSOES;
  const leituraMissao = () => window.LabMissoes.leituraDaBancada(sys, calcularpH, reacoesCatalogadas);
  function armazenamentoLocal() { try { return window.localStorage; } catch (e) { return null; } }
  function lerMissaoSalva() { return window.LabMissoes.lerProgresso(armazenamentoLocal()); }
  function salvarMissao() { window.LabMissoes.salvarProgresso(armazenamentoLocal(), missaoAtual); }
  let missaoAtual = lerMissaoSalva();

  function atualizarUI_Missao() {
    const elTitle = document.getElementById('missionTitle');
    const elDesc = document.getElementById('missionDesc');
    const elStatus = document.getElementById('missionStatus');
    const btnNext = document.getElementById('btnNextMission');

    if (!elTitle || !elDesc || !elStatus) return;

    missaoConcluida = false;
    if (missaoAtual >= missoes.length) {
      elTitle.innerText = "🎉 Mestre Laboratorial!";
      elDesc.innerText = "Concluiu todas as 10 missões com sucesso.";
      elStatus.style.display = 'none';
      if (btnNext) btnNext.style.display = 'none';
      return;
    }

    const m = missoes[missaoAtual];
    elTitle.innerText = `${m.titulo} (${missaoAtual + 1} de ${missoes.length})`;
    elDesc.innerText = m.desc;
    elStatus.innerText = "Pendente";
    elStatus.style.display = 'inline-block';
    elStatus.style.borderColor = "#ff9800";
    elStatus.style.color = "#ff9800";
    if (btnNext) btnNext.style.display = 'none';
    guiaAtualizar();
  }

  function verificarMissoes() {
    if (missaoAtual >= missoes.length) return;
    if (missoes[missaoAtual].check(leituraMissao())) {
      const badge = document.getElementById('missionStatus');
      if (badge && badge.innerText !== 'Concluída ✅') {
        badge.innerText = 'Concluída ✅';
        missaoConcluida = true;
        badge.style.borderColor = 'var(--neon-green)';
        badge.style.color = 'var(--neon-green)';
        const btnNext = document.getElementById('btnNextMission');
        if (btnNext) btnNext.style.display = 'block';
        tocarSom('sucesso');
        log('🏆 ' + missoes[missaoAtual].titulo + ' Concluída!', 'log-info');
        guiaAtualizar();
      }
    }
  }

  // =========================================================================
  // 11. SEGURANÇA, RESET E CONTROLE DE VIDRARIA
  // =========================================================================
  function dispararAlerta(titulo, msg) {
    if (window.pararAdicao) window.pararAdicao();
    window.setModoTermico('ambiente');
    tocarSom('erro');

    const campo = (rotulo, valor) => h('p', null, [h('strong', { text: rotulo + ' ' }), String(valor)]);
    const ticket = h('div', { className: 'incident-ticket' }, [
      h('h3', { text: '🚨 RELATÓRIO DE INCIDENTE' }),
      campo('FALHA:', titulo),
      campo('CAUSA:', msg),
      campo('STATUS TÉRMICO:', `${sys.temp.toFixed(1)} °C`),
      campo('PRESSÃO:', `${sys.pressao.toFixed(2)} atm`)
    ]);
    const elTitle = document.getElementById('alertTitle');
    const elMsg = document.getElementById('alertMsg');
    const elOverlay = document.getElementById('alertOverlay');

    if (elTitle) elTitle.innerText = "Sistema de Segurança Ativado";
    if (elMsg) { LaiftDom.clear(elMsg); elMsg.appendChild(ticket); }
    if (elOverlay) {
      elOverlay.style.display = 'flex';
      const btnRestaurar = elOverlay.querySelector('button');
      if (btnRestaurar) btnRestaurar.focus();
    }
    log(`🚨 INCIDENTE: ${titulo}`, 'log-danger');
  }

  function resetarLaboratorio() {
    if (timerAdd) { clearInterval(timerAdd); timerAdd = null; }
    passoAdicaoFn = null;
    adicaoPausadaPorAba = false;
    const btnAdd = document.getElementById('btnStartAdd');
    if (btnAdd) btnAdd.innerText = '▶ Adicionar';
    window.setModoTermico('ambiente');

    const tempAlvo = document.getElementById('tempAlvo');
    if (tempAlvo) tempAlvo.value = 25;

    sys.especies.clear();
    sys.vol = 0;
    sys.temp = 25;
    sys.pressao = 1;
    sys.shattered = false;
    sys.fenolftaleina = false;
    sys.ultimoProdutoFormado = null;

    historico = [];
    phDataPoints = [];
    reagentesAdicionados.clear();
    adicionadoPorReagente.clear();
    reacoesCatalogadas.clear();
    sinteseEstado.clear();
    sinteseAviso.clear();
    avisosSemReacao.clear();
    compostoAtualParaDossie = null;
    sdfCachePendente = null;

    const overlay = document.getElementById('alertOverlay');
    if (overlay) overlay.style.display = 'none';

    const qtdInput = document.getElementById('qtdInput');
    if (qtdInput) qtdInput.value = '10';

    const bubble = document.getElementById('bubbleOverlay');
    if (bubble) bubble.style.opacity = '0';

    const pressWarn = document.getElementById('pressWarn');
    if (pressWarn) pressWarn.style.display = 'none';

    const freeze = document.getElementById('freezeOverlay');
    if (freeze) freeze.style.opacity = '0';

    const btnDossie = document.getElementById('btnDossieLab');
    if (btnDossie) btnDossie.style.display = 'none';

    atualizarInspecaoMolecular();
    atualizarUI_Missao();
    atualizarUI();
    window.limparCurvaPH();
    log('Bancada resetada e higienizada.', 'log-info');
  }

  async function trocarVidraria() {
    if (sys.vol > 0 || sys.especies.size > 0) {
      const prosseguir = await window.LaiftDialog.confirm('Trocar de vidraria descarta a mistura atual. Deseja prosseguir?', { title: 'Trocar de vidraria', okLabel: 'Prosseguir' });
      if (!prosseguir) return;
    }
    const sel = document.getElementById('vidrariaSelect');
    const vessel = document.getElementById('vessel');
    if (!sel || !vessel) return;

    const v = sel.value;
    vessel.className = 'glass-vessel';
    sys.isClosed = false;

    if (v === 'tubo_20') {
      sys.maxVol = 20;
      vessel.classList.add('vessel-beaker');
      vessel.style.width = '55px';
      vessel.style.height = '180px';
    } else if (v === 'becker_250') {
      sys.maxVol = 250;
      vessel.classList.add('vessel-beaker');
      vessel.style.width = '190px';
      vessel.style.height = '230px';
    } else if (v === 'becker_1000') {
      sys.maxVol = 1000;
      vessel.classList.add('vessel-beaker');
      vessel.style.width = '230px';
      vessel.style.height = '260px';
    } else if (v === 'erlen_250') {
      sys.maxVol = 250;
      vessel.classList.add('vessel-flask');
      vessel.style.width = '190px';
      vessel.style.height = '230px';
      sys.isClosed = true;
    }

    const zone = document.getElementById('glasswareZone');
    if (zone) zone.classList.toggle('closed-system', sys.isClosed);
    resetarLaboratorio();
    log(`Vidraria em uso: ${v.replace(/_/g,' ')} (${sys.maxVol} mL)`, 'log-info');
  }

  // =========================================================================
  // 12. ANIMAÇÃO DE ADIÇÃO E DESPEJO
  // =========================================================================
  function animarDespejo(modo) {
    const zone = document.getElementById('glasswareZone');
    if (!zone) return;
    const animEl = document.createElement('div');

    if (modo === 'gota') {
      animEl.className = 'anim-drop';
      zone.appendChild(animEl);
      tocarSom('gota');
      setTimeout(() => animEl.remove(), 300);
    } else if (modo === 'jato') {
      if (document.querySelector('.anim-stream')) return;
      animEl.className = 'anim-stream';
      zone.appendChild(animEl);
    } else if (modo === 'tudo') {
      animEl.className = 'anim-splash';
      zone.appendChild(animEl);
      setTimeout(() => animEl.remove(), 400);
    }
  }

  function pararAnimacaoJato() {
    const stream = document.querySelector('.anim-stream');
    if (stream) stream.remove();
  }

  function getSelectedReagent() {
    const sel = document.querySelector('input[name="reagenteSel"]:checked');
    return sel ? sel.value : null;
  }

  function iniciarAdicao() {
    initAudio();
    if (sys.shattered) return;
    const reag = getSelectedReagent();
    if (!reag) { log('Selecione um reagente no catálogo.', 'log-warn'); return; }

    const raw = parseFloat(document.getElementById('qtdInput').value);
    if (isNaN(raw) || raw <= 0) return;

    salvarEstado();
    qtdRestante = raw;
    const modo = document.getElementById('modoAdd').value;

    if (modo === 'tudo') {
      animarDespejo('tudo');
      processarCarga(reag, qtdRestante);
      log(`Adicionado ${qtdRestante.toFixed(1)} ${unidadeDe(reag)} de ${rotulo(reag)}.`.replace('  ', ' '));
    } else {
      incrAdd = (modo === 'jato') ? 10 : 1;
      const btn = document.getElementById('btnStartAdd');
      if (btn) btn.innerText = '⚡ Adicionando...';
      if (modo === 'jato') animarDespejo('jato');
      if (timerAdd) clearInterval(timerAdd);

      passoAdicaoFn = () => {
        if (qtdRestante <= 0 || sys.shattered) { window.pararAdicao(); return; }
        if (modo === 'gota') animarDespejo('gota');
        let add = Math.min(incrAdd, qtdRestante);
        qtdRestante -= add;
        processarCarga(reag, add);
      };
      if (!pausadoPorAba) timerAdd = setInterval(passoAdicaoFn, 280 / velocidadeTempo);
      else adicaoPausadaPorAba = true;
    }

    atualizarInspecaoMolecular(reag);
  }

  function pararAdicao() {
    if (timerAdd) { clearInterval(timerAdd); timerAdd = null; }
    passoAdicaoFn = null;
    adicaoPausadaPorAba = false;
    const btn = document.getElementById('btnStartAdd');
    if (btn) btn.innerText = '▶ Adicionar';
    pararAnimacaoJato();
  }

  // =========================================================================
  // 13. CINÉTICA REACIONAL, EQUILÍBRIO E FENÔMENOS DE BANCADA
  // =========================================================================
  function processarCarga(reag, qtdAdd) {
    if (qtdAdd <= 0 || sys.shattered) return;
    reagentesAdicionados.add(reag);
    adicionadoPorReagente.set(reag, (adicionadoPorReagente.get(reag) || 0) + qtdAdd);

    const info = (typeof LAB_DATABASE !== 'undefined' && LAB_DATABASE.species && LAB_DATABASE.species[reag])
      ? LAB_DATABASE.species[reag]
      : (DICIONARIO_MOLECULAR[reag] || null);

    const massaPadrao = MM[reag.replace(/_s|_l|_aq|_g/g, '')] || 100;
    const efeito = LQ.efeitoDaAdicao(reag, qtdAdd, info, massaPadrao);
    efeito.especies.forEach(([sp, mmol]) => adicionarEspecie(sp, mmol));
    sys.vol += efeito.volumeMl;
    if (reag === 'fenolftaleina') {
      sys.fenolftaleina = true;
      log('Indicador Fenolftaleína adicionado.');
    }

    if (sys.vol > sys.maxVol) {
      dispararAlerta('Transbordamento de Reação', 'O volume da solução excedeu a capacidade física da vidraria.');
      sys.vol = sys.maxVol;
    }

    atualizarEquilibrio();
    verificarSinteseFarmaceutica();
    atualizarEstadoFisico();
    atualizarUI();
    verificarMissoes();
    registrarPontoPH();
    guiaAtualizar();
  }

  function guiaAtualizar() {
    if (window.LabGuiaUI) window.LabGuiaUI.atualizar();
  }

  function atualizarEquilibrio() {
    const eventos = LQ.equilibrar(sys, { agitadorAtivo });
    eventos.forEach((ev) => {
      if (ev.tipo === 'cloro') {
        log('⚠ Gás cloro (Cl₂) desprendido da solução!', 'log-danger');
      } else if (ev.tipo === 'sem_reacao') {
        if (!avisosSemReacao.has(ev.metal)) {
          avisosSemReacao.add(ev.metal);
          log(`${rotulo(ev.metal)} não desloca H₂ de ácido diluído (fica abaixo do hidrogênio na série de reatividade, ou passiva): sem reação.`, 'log-info');
        }
      } else if (ev.tipo === 'ignicao') {
        dispararAlerta('Ignição Alcalina!', `Reação violenta de ${rotulo(ev.metal)} com água gerou calor e hidrogênio!`);
      } else if (ev.tipo === 'precipitado') {
        const p = ev.regra;
        if (!reacoesCatalogadas.has(p.prod)) {
          reacoesCatalogadas.add(p.prod);
          sys.ultimoProdutoFormado = p.prod;
          atualizarInspecaoMolecular(p.prod);
          log(`Precipitado formado: ${rotulo(p.prod)}.`, 'log-info');
          catalogarFormulacaoNoBanco(p.nomePubChem || p.prod.replace('_s', ''), Array.from(reagentesAdicionados), sys.temp, agitadorAtivo, `Precipitado formado (${p.cor}).`);
        }
      }
    });
  }

  function atualizarEstadoFisico() {
    if (sys.shattered) return;
    let congelando = false;

    for (const [solv, q] of sys.especies) {
      if (q <= 0) continue;
      const info = (typeof LAB_DATABASE !== 'undefined' && LAB_DATABASE.species) ? LAB_DATABASE.species[solv] : null;
      const pe = info?.bp || BP[solv];
      const pf = info?.fp !== undefined ? info.fp : FP[solv];

      if (!sys.isClosed && pe && sys.temp >= pe) {
        const ex = sys.temp - pe;
        const tx = (0.5 + ex * 0.05) * velocidadeTempo;
        const ev = Math.min(q, tx);
        removerEspecie(solv, ev);
        sys.vol -= ev * (info?.density ? (1 / info.density) * 0.018 : 0.018);
        if (ev > 0.05) log(`${info?.label || solv.replace('_l', '')} em ebulição/evaporação a ${sys.temp.toFixed(1)}°C.`);
      }

      if (pf !== undefined && sys.temp <= pf) {
        congelando = true;
      }
    }

    const freezeOverlay = document.getElementById('freezeOverlay');
    if (freezeOverlay) freezeOverlay.style.opacity = congelando ? '0.75' : '0';

    if (sys.vol < 0.05) sys.vol = 0;
    if (sys.vol > sys.maxVol) sys.vol = sys.maxVol;

    if (sys.temp > 550) {
      dispararAlerta('Fusão da Vidraria!', 'A temperatura ultrapassou 550°C rompendo o borossilicato.');
      sys.shattered = true;
      return;
    }

    if (sys.isClosed) {
      const nGas = (qtd('H2_g') + qtd('CO2_g') + qtd('Cl2_g') + qtd('O2_g')) / 1000;
      const volLivre = (sys.maxVol - sys.vol) / 1000;
      sys.pressao = (volLivre > 0 && nGas > 0) ? 1 + (nGas * 0.082 * (sys.temp + 273.15)) / volLivre : 1;

      const warnEl = document.getElementById('pressWarn');
      if (warnEl) {
        if (sys.pressao > 5.5) { warnEl.style.display = 'inline'; warnEl.className = 'press-critical'; warnEl.innerText = '⚠ CRÍTICO'; }
        else if (sys.pressao > 3.0) { warnEl.style.display = 'inline'; warnEl.className = 'press-warning'; warnEl.innerText = '⚠ Alta pressão'; }
        else if (sys.pressao > 1.5) { warnEl.style.display = 'inline'; warnEl.className = 'press-warning'; warnEl.innerText = '⚠ Pressão elevada'; }
        else { warnEl.style.display = 'none'; }
      }

      if (sys.pressao > 6.0) {
        dispararAlerta('Explosão por Sobretensão!', 'A pressão do gás gerado excedeu o limite do frasco (6 atm).');
        sys.shattered = true;
      }
    } else {
      sys.pressao = 1;
      const warnEl = document.getElementById('pressWarn');
      if (warnEl) warnEl.style.display = 'none';

      const nGas = qtd('H2_g') + qtd('CO2_g') + qtd('O2_g');
      if (nGas > 50 && sys.vol > sys.maxVol * 0.8) {
        dispararAlerta('Erupção Espumosa!', 'Geração rápida de gás causou transbordamento da solução.');
        sys.shattered = true;
      }
    }
  }

  // =========================================================================
  // 14. pH, RENDERIZAÇÃO DA BANCADA E HUD ANALÍTICO
  // =========================================================================
  function calcularpH() {
    return LQ.calcularPH(sys.especies, sys.vol);
  }

  window.calcularpH = calcularpH;

  function atualizarUI() {
    const volDisplay = document.getElementById('volDisplay');
    if (volDisplay) volDisplay.innerText = `${sys.vol.toFixed(1).replace('.', ',')} / ${sys.maxVol} mL`;

    const liq = document.getElementById('liquidLayer');
    if (liq) {
      liq.style.height = Math.min((sys.vol / sys.maxVol) * 100, 100) + '%';
      let corLiq = 'rgba(255,255,255,0.06)';
      if (sys.vol > 0) {
        if (qtd('Cu2+') > 0) corLiq = 'rgba(0,200,255,0.55)';
        else if (qtd('Ni2+') > 0) corLiq = 'rgba(100,220,140,0.55)';
        else if (qtd('Fe3+') > 0 || qtd('Fe2+') > 0) corLiq = 'rgba(255,160,100,0.5)';
        else if (qtd('Pb2+') > 0 || qtd('Ag+') > 0) corLiq = 'rgba(220,220,240,0.25)';
        else if (qtd('Cd2+') > 0) corLiq = 'rgba(255,230,150,0.4)';
        else if (qtd('I2_aq') > 0) corLiq = 'rgba(180,120,180,0.4)';
        if (sys.fenolftaleina) {
          const ph = calcularpH();
          if (ph > 10) corLiq = '#e91e63';
          else if (ph > 8.5) corLiq = '#f06292';
        }
      }
      liq.style.backgroundColor = corLiq;
    }

    let pptH = 0, best = { q: 0, c: 'transparent' };
    PRECIP_TABLE.forEach(p => {
      const q = qtd(p.prod);
      if (q > 0.05) { pptH += 4; if (q > best.q) best = { q: q, c: p.cor }; }
    });

    const precipitadosSolidos = ['Al_s','Zn_s','Mg_s','Ca_s','S_s','I2_s','Fe_s','Ni_s','Cu_s','Sn_s','Pb_s','AcidoSalicilico_s','pAminofenol_s','AAS_s','Paracetamol_s','PbI2_s','AgCl_s','BaSO4_s','CaCO3_s','Dipirona_s'];
    if (precipitadosSolidos.some(sp => qtd(sp) > 0)) {
      pptH += 4;
      if (best.q === 0) best.c = '#b0bec5';
    }

    const precipLayer = document.getElementById('precipLayer');
    if (precipLayer) {
      precipLayer.style.height = Math.min(pptH, 45) + '%';
      precipLayer.style.backgroundColor = best.c;
    }

    const gasEl = document.getElementById('gasHalo');
    if (gasEl) {
      if (qtd('Cl2_g') > 0) {
        gasEl.style.opacity = '0.85';
        gasEl.style.background = 'radial-gradient(circle, rgba(180,220,80,0.5) 0%, transparent 80%)';
      } else if (qtd('H2_g') > 0 || qtd('CO2_g') > 0 || qtd('O2_g') > 0) {
        gasEl.style.opacity = '0.5';
        gasEl.style.background = 'radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 70%)';
      } else {
        gasEl.style.opacity = '0';
      }
    }

    const bubbleOverlay = document.getElementById('bubbleOverlay');
    if (bubbleOverlay) bubbleOverlay.style.opacity = (sys.temp > 60 || qtd('H2_g') > 5 || qtd('CO2_g') > 5) ? '1' : '0';

    const hudTemp = document.getElementById('hudTemp');
    const hudPress = document.getElementById('hudPress');
    const hudPH = document.getElementById('hudPH');
    if (hudTemp) hudTemp.innerText = sys.temp.toFixed(1).replace('.', ',') + ' °C';
    if (hudPress) hudPress.innerText = sys.pressao.toFixed(2).replace('.', ',') + ' atm';
    if (hudPH) hudPH.innerText = calcularpH().toFixed(2).replace('.', ',');

    const thermoFill = document.getElementById('thermoFill');
    const thermoBulb = document.getElementById('thermoBulb');
    if (thermoFill && thermoBulb) {
      const tPct = ((sys.temp + 10) / 560) * 100;
      thermoFill.style.height = Math.min(100, Math.max(0, tPct)) + '%';
      const tCol = sys.temp > 50 ? '#ff1744' : sys.temp <= 0 ? '#4fc3f7' : '#00ff88';
      thermoFill.style.backgroundColor = tCol;
      thermoBulb.style.backgroundColor = tCol;
    }

    const speciesTags = document.getElementById('speciesTags');
    if (speciesTags) {
      // As chaves podem vir do Estúdio (moléculas criadas pelo usuário):
      // montadas como texto, nunca como HTML.
      const tags = [];
      for (const [esp, q] of sys.especies) {
        if (q < 0.05) continue;
        let cls = 'tag-aq';
        if (esp.endsWith('_s')) cls = 'tag-s';
        else if (esp.endsWith('_g')) cls = 'tag-g';
        else if (esp.endsWith('_l')) cls = 'tag-l';
        const nome = rotulo(esp);
        tags.push(h('span', { className: `tag ${cls}`, title: `${q.toFixed(2)} mmol`, text: `${nome} ${q.toFixed(1)}` }));
      }
      LaiftDom.clear(speciesTags);
      if (tags.length) tags.forEach(t => speciesTags.appendChild(t));
      else speciesTags.appendChild(h('span', { className: 'log-muted', text: 'Nenhuma espécie no vaso ainda. Adicione um reagente para começar.' }));
    }
  }

  function registrarPontoPH() {
    const ph = calcularpH();
    const volPct = sys.maxVol > 0 ? (sys.vol / sys.maxVol) * 100 : 0;
    phDataPoints.push({ vol: volPct, ph: ph });
    if (phDataPoints.length > 200) phDataPoints.shift();
    desenharCurvaPH();
  }

  function desenharCurvaPH() {
    if (!phCtx || !phCanvas) return;
    const w = phCanvas.width, h = phCanvas.height;
    phCtx.clearRect(0, 0, w, h);
    phCtx.fillStyle = '#020617';
    phCtx.fillRect(0, 0, w, h);
    phCtx.strokeStyle = '#1e3a5f';
    phCtx.lineWidth = 1;

    for (let i = 0; i <= 14; i += 2) {
      const y = h - (i / 14) * h;
      phCtx.beginPath();
      phCtx.moveTo(0, y);
      phCtx.lineTo(w, y);
      phCtx.stroke();
      phCtx.fillStyle = '#546e7a';
      phCtx.font = '12px Fira Code';
      phCtx.fillText(i, 2, y - 2);
    }

    if (phDataPoints.length < 2) return;
    phCtx.strokeStyle = '#00ff88';
    phCtx.lineWidth = 2;
    phCtx.shadowColor = 'rgba(0,255,136,0.5)';
    phCtx.shadowBlur = 6;
    phCtx.beginPath();

    for (let i = 0; i < phDataPoints.length; i++) {
      const x = (phDataPoints[i].vol / 100) * w;
      const y = h - (phDataPoints[i].ph / 14) * h;
      if (i === 0) phCtx.moveTo(x, y);
      else phCtx.lineTo(x, y);
    }
    phCtx.stroke();
    phCtx.shadowBlur = 0;
  }

  window.desenharCurvaPH = desenharCurvaPH;

  function limparCurvaPH() {
    phDataPoints = [];
    desenharCurvaPH();
    log('Curva de titulação/pH resetada.');
  }

  // =========================================================================
  // 15. LOOP TÉRMICO E CONTROLES FÍSICOS
  // =========================================================================
  window.setVelocidade = function(v) {
    velocidadeTempo = v;
    document.querySelectorAll('.btn-time').forEach(b => b.classList.remove('active-btn'));
    const btnV = document.getElementById('btnT' + v);
    if (btnV) btnV.classList.add('active-btn');
    clearInterval(timerLoop);
    timerLoop = pausadoPorAba ? null : setInterval(loopTermico, 200 / velocidadeTempo);
  };

  // Relógio da bancada: com a aba oculta (outra aba, tela bloqueada) a física e a adição
  // gradual param; ao voltar, retomam de onde estavam, sem acumular tempo.
  function pausarRelogioBancada() {
    if (pausadoPorAba) return;
    pausadoPorAba = true;
    if (timerLoop) { clearInterval(timerLoop); timerLoop = null; }
    if (timerAdd) { clearInterval(timerAdd); timerAdd = null; adicaoPausadaPorAba = true; }
  }

  function retomarRelogioBancada() {
    if (!pausadoPorAba) return;
    pausadoPorAba = false;
    timerLoop = setInterval(loopTermico, 200 / velocidadeTempo);
    if (adicaoPausadaPorAba && passoAdicaoFn) timerAdd = setInterval(passoAdicaoFn, 280 / velocidadeTempo);
    adicaoPausadaPorAba = false;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pausarRelogioBancada();
    else retomarRelogioBancada();
  });

  window.toggleAgitador = function() {
    agitadorAtivo = !agitadorAtivo;
    const btn = document.getElementById('btnAgitador');
    const agFisico = document.getElementById('agitadorFisico');
    if (btn) btn.classList.toggle('active-btn', agitadorAtivo);
    if (agFisico) agFisico.classList.toggle('ativo', agitadorAtivo);
    verificarSinteseFarmaceutica();
  };

  window.toggleFoco = function() {
    focoAtivo = !focoAtivo;
    const stage = document.getElementById('viewBancada');
    if (!stage) return;
    stage.classList.toggle('focus-active', focoAtivo);
  };

  window.setModoTermico = function(modo) {
    if (sys.modoTermico === modo) modo = 'ambiente';
    sys.modoTermico = modo;

    const btnHeat = document.getElementById('btnHeat');
    const btnThermostat = document.getElementById('btnThermostat');
    const btnCool = document.getElementById('btnCool');
    const flameFX = document.getElementById('flameFX');
    const iceFX = document.getElementById('iceFX');

    if (btnHeat) btnHeat.classList.toggle('active-btn', modo === 'aquecendo');
    if (btnThermostat) btnThermostat.classList.toggle('active-btn', modo === 'termostato');
    if (btnCool) btnCool.classList.toggle('active-btn', modo === 'resfriando');
    if (flameFX) flameFX.style.opacity = modo === 'aquecendo' ? '1' : '0';
    if (iceFX) iceFX.style.opacity = modo === 'resfriando' ? '1' : '0';
  };

  window.ajustarPotenciaChama = function(val) {
    document.documentElement.style.setProperty('--flame-scale', 0.5 + val * 0.07);
  };

  function loopTermico() {
    if (sys.shattered) return;
    const heatSlider = document.getElementById('heatSlider');
    const pot = heatSlider ? parseInt(heatSlider.value) || 5 : 5;
    const incr = (0.4 + Math.pow(pot, 1.7) * 0.18) * velocidadeTempo;
    let alterou = false;

    if (sys.modoTermico === 'aquecendo') {
      sys.temp += incr;
      alterou = true;
    } else if (sys.modoTermico === 'resfriando') {
      sys.temp -= 1.8 * velocidadeTempo;
      if (sys.temp < -120) sys.temp = -120;
      alterou = true;
    } else if (sys.modoTermico === 'termostato') {
      const tempAlvoEl = document.getElementById('tempAlvo');
      const alvo = tempAlvoEl ? parseFloat(tempAlvoEl.value) || 25 : 25;
      if (sys.temp < alvo - 0.3) { sys.temp += incr * 0.4; alterou = true; }
      else if (sys.temp > alvo + 0.3) { sys.temp -= 0.8 * velocidadeTempo; alterou = true; }
    } else if (sys.modoTermico === 'ambiente') {
      if (sys.temp > 25.3) { sys.temp -= 0.4 * velocidadeTempo; alterou = true; }
      else if (sys.temp < 24.7) { sys.temp += 0.4 * velocidadeTempo; alterou = true; }
      else sys.temp = 25;
    }

    const sinteseMudou = verificarSinteseFarmaceutica(MIN_SIMULADOS_POR_CICLO);
    if (alterou || sinteseMudou) {
      atualizarEquilibrio();
      atualizarEstadoFisico();
      atualizarUI();
      registrarPontoPH();
      verificarMissoes();
    }

    verificarAlertasProativosPreceptor();
    guiaAtualizar();
  }

  // =========================================================================
  // 16. CATÁLOGO DE REAGENTES DINÂMICO
  // =========================================================================
  function construirCatalogo() {
    const grupos = [
      ['💊 Precursores & Síntese Farmacêutica', [
        ['AcidoSalicilico_s', 'Ácido Salicílico (Precursor AAS)'],
        ['AnidridoAcetico_l', 'Anidrido Acético (Agente Acetilante)'],
        ['pAminofenol_s', '4-Aminofenol (Precursor Paracetamol)'],
        ['AlcoolIsopentilico_l', 'Álcool Isopentílico (Síntese Éster)'],
        ['Anilina_l', 'Anilina Pura (Precursor Acetanilida)'],
        ['AcidoBenzoico_s', 'Ácido Benzóico (Síntese Benzoatos)'],
        ['Dipirona_s', 'Dipirona Sódica (Metamizol)'],
        ['AAS_s', 'Aspirina Cristalizada (AAS)'],
        ['Paracetamol_s', 'Paracetamol Cristalizado'],
        ['C13H18O2_s', 'Ibuprofeno']
      ]],
      ['💧 Solventes Polares & Aquosos', [
        ['H2O_l', 'Água Destilada (H₂O)'],
        ['D2O_l', 'Água Pesada (D₂O)'],
        ['Etanol_l', 'Etanol Absoluto (C₂H₆O)'],
        ['Metanol_l', 'Metanol (CH₃OH)'],
        ['C3H7OH_l', 'Isopropanol (C₃H₈O)'],
        ['HOCH2CH2OH_l', 'Etilenoglicol'],
        ['C3H5(OH)3_l', 'Glicerol']
      ]],
      ['🛢️ Solventes Orgânicos & Apolares', [
        ['Acetona_l', 'Acetona Pura (C₃H₆O)'],
        ['Hexano_l', 'Hexano (C₆H₁₄)'],
        ['Benzeno_l', 'Benzeno (C₆H₆)'],
        ['Tolueno_l', 'Tolueno (C₇H₈)'],
        ['Cloroformio_l', 'Clorofórmio (CHCl₃)'],
        ['(C2H5)2O_l', 'Éter Etílico'],
        ['C4H8O_l', 'Tetraidrofurano (THF)'],
        ['(CH3)2SO_l', 'Dimetilsulfóxido (DMSO)'],
        ['CH3CN_l', 'Acetonitrila']
      ]],
      ['🔥 Ácidos', [
        ['HCl_aq', 'Ácido Clorídrico (HCl 6M)'],
        ['H2SO4_aq', 'Ácido Sulfúrico Concentrado (H₂SO₄)'],
        ['HNO3_aq', 'Ácido Nítrico (HNO₃)'],
        ['H3PO4_aq', 'Ácido Fosfórico (H₃PO₄)'],
        ['HClO4_aq', 'Ácido Perclórico (HClO₄)'],
        ['HF_aq', 'Ácido Fluorídrico (HF)'],
        ['AcidoAcetico_aq', 'Ácido Acético (CH₃COOH)'],
        ['HCOOH_l', 'Ácido Fórmico'],
        ['HOOCCOOH_s', 'Ácido Oxálico'],
        ['C6H8O7_s', 'Ácido Cítrico']
      ]],
      ['🧼 Bases', [
        ['NaOH_aq', 'Hidróxido de Sódio (NaOH 6M)'],
        ['KOH_aq', 'Hidróxido de Potássio (KOH)'],
        ['NH3_aq', 'Amônia / Hidróxido de Amônio'],
        ['Na2CO3_aq', 'Carbonato de Sódio (Na₂CO₃)'],
        ['NaHCO3_aq', 'Bicarbonato de Sódio (NaHCO₃)'],
        ['K2CO3_aq', 'Carbonato de Potássio (K₂CO₃)'],
        ['CaOH2_aq', 'Água de Cal (Ca(OH)₂)'],
        ['NaClO_aq', 'Hipoclorito de Sódio (NaClO)']
      ]],
      ['⚠️ Metais & Alto Risco', [
        ['Na_s', 'Sódio Metálico (Na)'],
        ['Li_s', 'Lítio Metálico (Li)'],
        ['K_s', 'Potássio Metálico (K)'],
        ['Mg_s', 'Magnésio (Mg)'],
        ['Zn_s', 'Zinco (Zn)'],
        ['Al_s', 'Alumínio (Al)'],
        ['Ca_s', 'Cálcio (Ca)'],
        ['Fe_s', 'Ferro (Fe)'],
        ['Cu_s', 'Cobre (Cu)'],
        ['H2O2_aq', 'Peróxido de Hidrogênio (H₂O₂ 30%)']
      ]],
      ['🧪 Sais & Metais em Solução', [
        ['PbNO3_aq', 'Nitrato de Chumbo (Pb(NO₃)₂)'],
        ['AgNO3_aq', 'Nitrato de Prata (AgNO₃)'],
        ['KI_aq', 'Iodeto de Potássio (KI)'],
        ['CuSO4_aq', 'Sulfato de Cobre (CuSO₄)'],
        ['FeCl3_aq', 'Cloreto de Ferro III (FeCl₃)'],
        ['ZnSO4_aq', 'Sulfato de Zinco (ZnSO₄)'],
        ['NiCl2_aq', 'Cloreto de Níquel (NiCl₂)'],
        ['CaCl2_aq', 'Cloreto de Cálcio (CaCl₂)'],
        ['BaCl2_aq', 'Cloreto de Bário (BaCl₂)'],
        ['NaCl_s', 'Cloreto de Sódio (NaCl)'],
        ['CaCO3_s', 'Carbonato de Cálcio (CaCO₃)']
      ]],
      ['🌿 Alcaloides & Toxicologia Forense', [
        ['C14H14N2O3_s', 'Fenobarbital'],
        ['C17H19NO3_s', 'Morfina'],
        ['C20H22N2O2_s', 'Estricnina'],
        ['C11H17N3O8_s', 'Tetrodotoxina (TTX)']
      ]],
      ['🔬 Vitaminas & Indicadores', [
        ['C6H8O6_s', 'Ácido Ascórbico (Vitamina C)'],
        ['fenolftaleina', 'Fenolftaleína (Indicador pH)']
      ]]
    ];

    const catContainer = document.getElementById('catalogContainer');
    if (catContainer) {
      LaiftDom.clear(catContainer);
      catContainer.removeAttribute('aria-busy');
      grupos.forEach(([titulo, itens], idx) => {
        const lista = h('div', { className: 'reagent-list', role: 'radiogroup', 'aria-label': titulo });
        itens.forEach(([val, label], i) => {
          lista.appendChild(h('label', null, [
            h('input', { type: 'radio', name: 'reagenteSel', value: val, checked: idx === 0 && i === 0 }),
            ' ' + label
          ]));
        });
        catContainer.appendChild(h('details', { open: idx === 0 }, [h('summary', { text: titulo }), lista]));
      });
      catContainer.querySelectorAll('input[name="reagenteSel"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          atualizarUnidadeQuantidade();
          atualizarInspecaoMolecular(e.target.value);
        });
      });
    }
  }

  // =========================================================================
  // 17. CONTROLES DE INTERFACE, MODAIS E EXPORTAÇÃO GLOBAL
  // =========================================================================
  // Unidade da quantidade conforme o reagente selecionado (g, mL).
  function atualizarUnidadeQuantidade() {
    const el = document.getElementById('qtdUnidade');
    if (!el) return;
    const reag = getSelectedReagent();
    const u = reag ? unidadeDe(reag) : '';
    el.textContent = u === 'g' ? 'em gramas (g)' : u === 'mL' ? 'em mililitros (mL)' : 'g para sólidos, mL para líquidos';
  }

  // "Comece aqui": abre a introdução; o roteiro guiado (a pessoa faz, a Guia aponta) mora em lab-guia-ui.js.
  window.comecarAqui = function() {
    const modal = document.getElementById('comeceModal');
    if (modal) modal.style.display = 'flex';
  };
  window.fecharComece = function() {
    const modal = document.getElementById('comeceModal');
    if (modal) modal.style.display = 'none';
  };

  window.proximaMissao = function() { missaoAtual++; salvarMissao(); resetarLaboratorio(); atualizarUI_Missao(); };
  window.abrirLivroMissoes = function() {
    const lista = h('ul', { className: 'missions-list' }, missoes.map((m, i) => {
      const estado = i < missaoAtual ? 'done' : i === missaoAtual ? 'current' : 'locked';
      const status = i < missaoAtual ? "✅ Concluída" : i === missaoAtual ? "▶ Em Progresso" : "🔒 Bloqueada";
      return h('li', { className: `mission-item mission-${estado}` }, [
        h('strong', { text: m.titulo }), ' ', h('span', { className: 'mission-status', text: `(${status})` }), h('br'),
        h('span', { className: 'mission-desc', text: m.desc })
      ]);
    }));
    const listEl = document.getElementById('missionsList');
    const modal = document.getElementById('missionsModal');
    if (listEl) { LaiftDom.clear(listEl); listEl.appendChild(lista); }
    if (modal) modal.style.display = 'flex';
  };

  window.fecharLivroMissoes = function() {
    const modal = document.getElementById('missionsModal');
    if (modal) modal.style.display = 'none';
  };

  window.abrirManual = () => {
    const modal = document.getElementById('manualModal');
    if (modal) modal.style.display = 'flex';
  };

  window.fecharManual = () => {
    const modal = document.getElementById('manualModal');
    if (modal) modal.style.display = 'none';
  };

  window.toggleLabFullscreen = function() {
    const doc = document;
    const docEl = doc.documentElement;
    const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
    const isFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

    if (!isFs) {
      if (requestFs) requestFs.call(docEl).catch(err => console.warn('[LAIFT Fullscreen]', err));
    } else {
      if (exitFs) exitFs.call(doc).catch(err => console.warn('[LAIFT Fullscreen]', err));
    }
  };

  window.switchRightTab = function(tabId) {
    document.querySelectorAll('.rtab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    document.querySelectorAll('.rtab-pane').forEach(pane => pane.classList.toggle('active', pane.id === tabId));
    if (tabId === 'tabPH') desenharCurvaPH();
    if (tabId === 'tabMol') atualizarInspecaoMolecular();
  };

  window.setMobileView = function(viewName) {
    const grid = document.getElementById('mainGrid');
    if (grid) grid.setAttribute('data-mobile-view', viewName);
    document.querySelectorAll('.m-nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.target === viewName));
    if (viewName === 'analise') {
      setTimeout(atualizarInspecaoMolecular, 60);
      setTimeout(desenharCurvaPH, 90);
    }
  };

  window.resetarLaboratorio = resetarLaboratorio;
  window.trocarVidraria = trocarVidraria;
  window.iniciarAdicao = iniciarAdicao;
  window.pararAdicao = pararAdicao;
  window.limparCurvaPH = limparCurvaPH;
  window.limparRegistro = limparRegistro;
  window.desfazerAcao = desfazerAcao;
  window.consultarDadosPubChem = consultarDadosPubChem;
  window.catalogarFormulacaoNoBanco = catalogarFormulacaoNoBanco;

  // =========================================================================
  // 18. INTEGRAÇÃO BIDIRECIONAL COM O ESTÚDIO 3D (BROADCASTCHANNEL, IFRAME & LOCALSTORAGE)
  // =========================================================================

  window.abrirStudio = function() {
    const modal = document.getElementById('studioIframeModal');
    const iframe = document.getElementById('studioIframe');

    if (modal && iframe) {
      if (!iframe.src || !iframe.src.includes('studio/index.html')) {
        iframe.src = 'studio/index.html';
      }
      modal.style.display = 'flex';

      setTimeout(() => {
        // Origem fixa: o Estúdio é da mesma origem; nunca '*'.
        try { LaiftDom.postTo(iframe.contentWindow, { acao: 'studioAberto' }); } catch (e) {}
      }, 150);
    } else {
      window.open('studio/index.html', '_blank');
    }
  };

  window.fecharStudio = function() {
    const modal = document.getElementById('studioIframeModal');
    if (modal) modal.style.display = 'none';
  };

  function processarCompostoDoStudio(dados) {
    if (!dados || !dados.chave) return;

    const chave = dados.chave;
    const nome = dados.nome || chave;

    const seletorChave = window.CSS && CSS.escape ? CSS.escape(chave) : String(chave).replace(/["\\]/g, '\\$&');
    const radio = document.querySelector(`input[name="reagenteSel"][value="${seletorChave}"]`);
    if (radio) {
      radio.checked = true;
      const detailsPai = radio.closest('details');
      if (detailsPai) detailsPai.open = true;
      radio.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      const catContainer = document.querySelector('#catalogContainer .reagent-list');
      if (catContainer) {
        // `nome` é o nome dado pelo usuário no Estúdio: só como texto.
        const radioNovo = h('input', { type: 'radio', name: 'reagenteSel', value: String(chave), checked: true });
        radioNovo.addEventListener('change', () => atualizarInspecaoMolecular(chave));
        const novoLabel = h('label', null, [radioNovo, ` 🧬 ${nome} (Estúdio 3D)`]);
        catContainer.prepend(novoLabel);
      }
    }

    atualizarInspecaoMolecular(chave);
    tocarSom('sucesso');
    log(`🧬 Molécula [${nome}] carregada do Estúdio 3D para a bancada.`, 'log-info');
    window.fecharStudio();
  }

  // 1. Ouvinte BroadcastChannel de alta velocidade
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const labChannel = new BroadcastChannel('laift_molecular_bus');
      labChannel.onmessage = function(event) {
        if (event.data && (event.data.tipo === 'CARREGAR_COMPOSTO_BANCADA' || event.data.acao === 'carregarCompostoNaBancada')) {
          processarCompostoDoStudio(event.data.composto);
        }
      };
    } catch (e) {
      console.warn('[script.js] BroadcastChannel não disponível:', e);
    }
  }

  // 2. Ouvinte postMessage (Modal Iframe)
  window.addEventListener('message', function(event) {
    // Só o Estúdio (mesma origem) pode carregar compostos na bancada.
    if (!LaiftDom.isTrustedMessage(event)) return;
    if (event.data) {
      if (event.data.acao === 'carregarCompostoNaBancada') {
        processarCompostoDoStudio(event.data.composto);
      } else if (event.data.acao === 'fecharModalStudio') {
        window.fecharStudio();
      }
    }
  });

  // 3. Ouvinte LocalStorage (Abas Externas)
  window.addEventListener('storage', function(event) {
    if (event.key === 'laift_composto_transferido' && event.newValue) {
      try {
        const payload = JSON.parse(event.newValue);
        processarCompostoDoStudio(payload);
        localStorage.removeItem('laift_composto_transferido');
      } catch (e) {}
    }
  });

  // =========================================================================
  // 19. LIGAÇÕES DE INTERFACE (sem handlers inline — preparo da CSP)
  // =========================================================================
  window.fecharDossieLab = function() {
    const modal = document.getElementById('dossieLabModal');
    if (modal) modal.style.display = 'none';
  };

  // Só estas funções podem ser chamadas por data-action/-change/-input
  // (ver ../shared/safe-dom.js). O chat do preceptor (lab-preceptor.js)
  // entra com enviarDuvidaRapida/limparChatPreceptor.
  LaiftDom.delegateActions(document, [
    'toggleLabFullscreen', 'abrirStudio', 'fecharStudio', 'abrirManual', 'fecharManual',
    'iniciarAdicao', 'pararAdicao', 'desfazerAcao', 'setModoTermico', 'toggleAgitador',
    'resetarLaboratorio', 'toggleLabChat', 'toggleFoco', 'switchRightTab', 'setModoVisualizacao',
    'abrirDossieCompostoAtual', 'fecharDossieLab', 'limparCurvaPH', 'limparRegistro',
    'abrirLivroMissoes', 'fecharLivroMissoes', 'proximaMissao', 'setMobileView',
    'limparChatPreceptor', 'enviarDuvidaLab', 'enviarDuvidaRapida', 'trocarVidraria', 'ajustarPotenciaChama',
    'comecarAqui', 'fecharComece'
  ]);

  // Atalhos do chat: sugestões com data-pergunta (sem onclick) e Enter no campo.
  const chatMensagens = document.getElementById('labChatMessages');
  if (chatMensagens) {
    chatMensagens.addEventListener('click', (evt) => {
      const chip = evt.target.closest && evt.target.closest('[data-pergunta]');
      if (chip && typeof window.enviarDuvidaRapida === 'function') window.enviarDuvidaRapida(chip.getAttribute('data-pergunta'));
    });
  }
  const chatInput = document.getElementById('labChatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') { evt.preventDefault(); window.enviarDuvidaLab(); }
    });
  }

  // Abas do painel direito: estado anunciado a leitores de tela.
  document.querySelectorAll('.rtab-btn').forEach(btn => {
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rtab-btn').forEach(b => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
    });
  });

  document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('btnLabFullscreen');
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (btn) btn.textContent = isFs ? '⛶ Restaurar' : '⛶ Tela Cheia';
  });

  // Esc fecha o que estiver aberto por cima da bancada.
  document.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Escape') return;
    ['manualModal', 'comeceModal', 'missionsModal', 'dossieLabModal', 'studioIframeModal'].forEach(id => {
      const m = document.getElementById(id);
      if (m && m.style.display !== 'none') m.style.display = 'none';
    });
    const drawer = document.getElementById('labChatDrawer');
    if (drawer && drawer.style.display === 'flex') drawer.style.display = 'none';
  });

  // =========================================================================
  // 20. INICIALIZAÇÃO SEQUENCIAL
  // =========================================================================
  construirCatalogo();
  atualizarUnidadeQuantidade();
  resetarLaboratorio();
  atualizarUI_Missao();

  // Dentro da plataforma o botão "Tela cheia" já existe no cabeçalho dela: aqui seria duplicado.
  try {
    if (window.self !== window.top) { const fs = document.getElementById('btnLabFullscreen'); if (fs) fs.hidden = true; }
  } catch (e) { /* outra origem: mantém o botão */ }

  if (window.LabGuiaUI) {
    window.LabGuiaUI.iniciar({
      estado() {
        const alvo = parseFloat(document.getElementById('tempAlvo').value);
        const adicionado = {};
        adicionadoPorReagente.forEach((v, k) => { adicionado[k] = v; });
        return {
          selecionado: getSelectedReagent(),
          qtd: parseFloat(String(document.getElementById('qtdInput').value).replace(',', '.')),
          adicionado,
          agitador: agitadorAtivo,
          modoTermico: sys.modoTermico,
          tempAlvo: alvo
        };
      },
      missao() {
        const m = missoes[missaoAtual];
        return {
          indice: missaoAtual,
          total: missoes.length,
          tituloCurto: m ? m.titulo.replace(/^Missão \d+:\s*/, '') : 'Mestre Laboratorial',
          descricao: m ? m.desc : 'Você concluiu todas as missões.',
          concluida: missaoConcluida
        };
      },
      resetar: resetarLaboratorio,
      avancarMissao() { window.proximaMissao(); },
      verAndamento() {
        window.switchRightTab('tabLog');
        if (window.innerWidth < 640) window.setMobileView('analise');
      }
    });
  }
  initSmilesDrawer();

  setTimeout(() => {
    const sel = getSelectedReagent();
    if (sel) atualizarInspecaoMolecular(sel);
  }, 150);

  if (!document.hidden) timerLoop = setInterval(loopTermico, 200);
  else pausadoPorAba = true;
  log('Bancada pronta. Escolha um reagente, informe a quantidade e toque em Adicionar.', 'log-info');
  const faixaBoot = document.getElementById('faixaBoot');
  if (faixaBoot) faixaBoot.remove();

})();
