/**
 * LAIFT — LABORATÓRIO VIRTUAL DE BANCADA & SÍNTESE FARMACÊUTICA
 * Motor Quimiométrico, Cinemática Reacional, Visualizador 2D/3D Híbrido (3Dmol.js),
 * Cache Local IndexedDB com Aprendizado Contínuo e Preceptor Conectado ao Groq 120B.
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
      alert("=== LAIFT: DIAGNÓSTICO DE BANCADA ===\n\n" + (relatorioErros.length ? relatorioErros.join('\n') : "✅ Sistema estável. Nenhum erro crítico registrado."));
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
  const APPS_SCRIPT_GATEWAY = window.APPS_SCRIPT_GATEWAY || 'https://script.google.com/macros/s/AKfycbxbIrLKrfWjia_K-05aywbo9sou__8RW3MzIjeD3WoNc6CNJILXutTl93NfiBVwbDSM/exec';
  window.APPS_SCRIPT_GATEWAY = APPS_SCRIPT_GATEWAY;

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
    'Dipirona_s': { label: 'Dipirona Sódica (Metamizol)', formula: 'C13H16N3NaO4S', molarMass: 333.34, density: 1.35, bp: null, fp: 220, smiles: 'CN(CS(=O)(=O)[O-])C1=C(C)N(N1C)C2=CC=CC=C2.[Na+]', iupac: 'sodium;[(1,5-dimethyl-3-oxo-2-phenylpyrazol-4-yl)-methylamino]methanesulfonate', pubchemQuery: 'Metamizole sodium' },
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

  const CONC_AQ = {
    H2O2_aq:3.0, PbNO3_aq:1.0, AgNO3_aq:1.0, CdNO3_aq:1.0, CuSO4_aq:1.0, FeCl3_aq:1.0, ZnSO4_aq:1.0,
    NiCl2_aq:1.0, SbCl3_aq:1.0, CaCl2_aq:1.0, BaCl2_aq:1.0, CoCl2_aq:1.0, SCN_aq:1.0, HCl_aq:6.0,
    H2SO4_aq:9.0, AcidoAcetico_aq:1.0, KI_aq:1.0, NH42S_aq:1.0, NaOH_aq:6.0, NH3_aq:5.0, Na2CO3_aq:1.0,
    NaClO_aq:2.0, NaHCO3_aq:1.0, K2CO3_aq:1.0, KOH_aq:6.0, LiOH_aq:5.0, CaOH2_aq:0.5, HNO3_aq:6.0,
    HClO4_aq:6.0, H3PO4_aq:4.0
  };

  const BP = {
    H2O_l:100, Etanol_l:78.4, Acetona_l:56, Hexano_l:68.7, Benzeno_l:80.1, Tolueno_l:110.6,
    Metanol_l:64.7, Cloroformio_l:61.2, AnidridoAcetico_l:139.8, AlcoolIsopentilico_l:131.1, Anilina_l:184.1
  };

  const FP = {
    H2O_l:0, Etanol_l:-114, Acetona_l:-95, Hexano_l:-95, Benzeno_l:5.5, Tolueno_l:-95,
    Metanol_l:-98, Cloroformio_l:-63.5, AnidridoAcetico_l:-73, AlcoolIsopentilico_l:-117, Anilina_l:-6
  };

  const PRECIP_TABLE = [
    { cat:'Ag+', an:'Cl-', cC:1, cA:1, prod:'AgCl_s', cor:'#f5f5f5', nomePubChem:'Silver chloride' },
    { cat:'Pb2+', an:'Cl-', cC:1, cA:2, prod:'PbCl2_s', cor:'#eceff1', nomePubChem:'Lead(II) chloride' },
    { cat:'Pb2+', an:'I-', cC:1, cA:2, prod:'PbI2_s', cor:'#ffeb3b', nomePubChem:'Lead(II) iodide' },
    { cat:'Ag+', an:'I-', cC:1, cA:1, prod:'AgI_s', cor:'#fff9c4', nomePubChem:'Silver iodide' },
    { cat:'Cu2+', an:'OH-', cC:1, cA:2, prod:'Cu(OH)2_s', cor:'#4dd0e1', nomePubChem:'Copper(II) hydroxide' },
    { cat:'Fe3+', an:'OH-', cC:1, cA:3, prod:'Fe(OH)3_s', cor:'#8d6e63', nomePubChem:'Iron(III) hydroxide' },
    { cat:'Ni2+', an:'OH-', cC:1, cA:2, prod:'Ni(OH)2_s', cor:'#a5d6a7', nomePubChem:'Nickel(II) hydroxide' },
    { cat:'Ca2+', an:'CO3_2-', cC:1, cA:1, prod:'CaCO3_s', cor:'#fafafa', nomePubChem:'Calcium carbonate' },
    { cat:'Ba2+', an:'CO3_2-', cC:1, cA:1, prod:'BaCO3_s', cor:'#f5f5f5', nomePubChem:'Barium carbonate' },
    { cat:'Pb2+', an:'S_2-', cC:1, cA:1, prod:'PbS_s', cor:'#212121', nomePubChem:'Lead(II) sulfide' },
    { cat:'Ag+', an:'S_2-', cC:2, cA:1, prod:'Ag2S_s', cor:'#1a1a1a', nomePubChem:'Silver sulfide' },
    { cat:'Cu2+', an:'S_2-', cC:1, cA:1, prod:'CuS_s', cor:'#1b1b1b', nomePubChem:'Copper(II) sulfide' },
    { cat:'Cd2+', an:'S_2-', cC:1, cA:1, prod:'CdS_s', cor:'#fdd835', nomePubChem:'Cadmium sulfide' },
    { cat:'Zn2+', an:'S_2-', cC:1, cA:1, prod:'ZnS_s', cor:'#e8eaf6', nomePubChem:'Zinc sulfide' },
    { cat:'Sb3+', an:'S_2-', cC:2, cA:3, prod:'Sb2S3_s', cor:'#ff7043', nomePubChem:'Antimony trisulfide' },
    { cat:'Ca2+', an:'SO4_2-', cC:1, cA:1, prod:'CaSO4_s', cor:'#f5f5f5', nomePubChem:'Calcium sulfate' },
    { cat:'Ba2+', an:'SO4_2-', cC:1, cA:1, prod:'BaCO4_s', cor:'#ffffff', nomePubChem:'Barium sulfate' },
    { cat:'Pb2+', an:'SO4_2-', cC:1, cA:1, prod:'PbSO4_s', cor:'#eceff1', nomePubChem:'Lead(II) sulfate' }
  ];

  // =========================================================================
  // 4. MOTOR DE BANCO DE DADOS LOCAL (IndexedDB)
  // =========================================================================
  const DB_CACHE = {
    db: null,
    async init() {
      if (this.db) return this.db;
      return new Promise((resolve) => {
        try {
          if (!window.indexedDB) return resolve(null);
          const req = indexedDB.open('LAIFT_LocalChem_v2', 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('moleculas')) db.createObjectStore('moleculas', { keyPath: 'chave' });
            if (!db.objectStoreNames.contains('respostasIA')) db.createObjectStore('respostasIA', { keyPath: 'pergunta' });
          };
          req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
          req.onerror = () => resolve(null);
        } catch (err) {
          resolve(null);
        }
      });
    },
    async get(storeName, key) {
      if (!key) return null;
      const db = await this.init();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).get(String(key).toLowerCase().trim());
          req.onsuccess = () => resolve(req.result ? req.result.dados : null);
          req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      });
    },
    async set(storeName, key, dados) {
      if (!key || !dados) return;
      const db = await this.init();
      if (!db) return;
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put({
          chave: String(key).toLowerCase().trim(),
          pergunta: String(key).toLowerCase().trim(),
          dados: dados,
          ts: Date.now()
        });
      } catch (e) {}
    }
  };

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
  let timerLoop = null;
  let qtdRestante = 0;
  let incrAdd = 1;
  let phDataPoints = [];
  let velocidadeTempo = 1;
  let agitadorAtivo = false;
  let focoAtivo = false;
  const reagentesAdicionados = new Set();
  const reacoesCatalogadas = new Set();
  let smilesDrawerInstance = null;
  let viewer3D = null;
  let modoVisualizacao = '2D';
  let compostoAtualParaDossie = null;
  let sdfCachePendente = null;

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
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${ts}]</span><span class="${cls}">${msg}</span>`;
    logEl.prepend(entry);
    if (logEl.children.length > 70) logEl.removeChild(logEl.lastChild);
  }

  function limparRegistro() {
    if (logEl) logEl.innerHTML = '<span style="color:#546e7a;">[Sistema] Registro limpo.</span>';
  }

  function qtd(chave) { return sys.especies.get(chave) || 0; }
  function adicionarEspecie(chave, mmol) { if (mmol <= 0) return; sys.especies.set(chave, (sys.especies.get(chave) || 0) + mmol); }
  function removerEspecie(chave, mmol) {
    const atual = sys.especies.get(chave) || 0;
    const novo = Math.max(0, atual - mmol);
    if (novo < 1e-12) sys.especies.delete(chave);
    else sys.especies.set(chave, novo);
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
      div3D.innerHTML = '';
      if (viewer3D) {
        try { viewer3D.stopAnimate(); } catch(e) {}
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
        viewer3D.animate({ loop: "backAndForth", step: 0.4 });
      }
    } catch (err3D) {
      console.warn('[3Dmol Bancada] Erro ao renderizar modelo:', err3D);
    }
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
        try { viewer3D.stopAnimate(); } catch(e) {}
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
        setTimeout(() => {
          if (div3D.offsetWidth > 0 && div3D.offsetHeight > 0) {
            if (sdfCachePendente) {
              renderizarCena3DBancada(sdfCachePendente);
            } else if (viewer3D) {
              viewer3D.resize();
              viewer3D.render();
              viewer3D.animate({ loop: "backAndForth", step: 0.4 });
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
    ctx.font = '11px "Fira Code", monospace';
    ctx.fillText(peso ? `Massa: ${peso} g/mol` : 'Ficha Molecular Indexada', canvas.width / 2, 105);

    ctx.fillStyle = '#475569';
    ctx.font = '9px "Fira Code", monospace';
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

    carregarConformacao3D(pubchemQuery || nomeExibicao || smiles, smiles);
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
    container.innerHTML = `<div style="text-align: center; padding: 20px;">Consultando bases científicas para <strong>${nome || 'o composto'}</strong>...</div>`;

    if (!nome) {
      container.innerHTML = '<p>Nenhum produto em foco no momento.</p>';
      return;
    }

    let dados = null;
    if (typeof ChemicalAPIEngine !== 'undefined' && typeof ChemicalAPIEngine.resolveCompleteCompound === 'function') {
      dados = await ChemicalAPIEngine.resolveCompleteCompound(nome);
    } else {
      dados = await consultarDadosPubChem(nome);
    }

    if (dados) {
      container.innerHTML = `
        <div style="margin-bottom: 8px;"><strong style="color:#38bdf8; font-size:1.05rem;">${nome}</strong></div>
        <div style="margin-bottom: 4px;"><strong>Origem dos Dados:</strong> ${dados.origem || 'PubChem PUG-REST'}</div>
        <div style="margin-bottom: 4px;"><strong>IUPAC Oficial:</strong> <span style="font-family:monospace; color:#94a3b8;">${dados.iupac || '--'}</span></div>
        <div style="margin-bottom: 4px;"><strong>Fórmula Molecular:</strong> ${dados.formula || '--'}</div>
        <div style="margin-bottom: 4px;"><strong>Massa Molar:</strong> ${dados.molarMass || dados.pesoMolecular || '--'} g/mol</div>
        <div style="margin-bottom: 4px;"><strong>SMILES Canônico:</strong> <code style="color:#38bdf8; font-size:0.72rem; word-break:break-all;">${dados.smiles || '--'}</code></div>
        <div style="margin-bottom: 4px;"><strong>Número CAS:</strong> <code>${dados.cas || '--'}</code></div>
        <div style="margin-bottom: 4px;"><strong>ChEBI ID:</strong> <code>${dados.chebiId || '--'}</code></div>
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #1e3a5f;">
          <strong>Papel Biológico / Farmacológico:</strong><br>
          <span style="color: #cbd5e1; line-height: 1.5;">${dados.papelBiologico || dados.definicao || 'Propriedades descritas na Farmacopeia Brasileira e compêndios terapêuticos.'}</span>
        </div>
      `;
    } else {
      container.innerHTML = `<p style="color:#ef4444;">Não foi possível consultar os dados externos de <strong>${nome}</strong>. Os dados locais continuam ativos.</p>`;
    }
  };

  async function consultarDadosPubChem(termo) {
    try {
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(termo.trim())}/property/MolecularWeight,MolecularFormula,CanonicalSMILES,IUPACName/JSON`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json();
      const p = data?.PropertyTable?.Properties?.[0];
      if (p) {
        return { cid: p.CID, formula: p.MolecularFormula, molarMass: p.MolecularWeight, smiles: p.CanonicalSMILES, iupac: p.IUPACName };
      }
    } catch (e) {
      console.warn('[PubChem] Falha na consulta:', e);
    }
    return null;
  }

  async function catalogarFormulacaoNoBanco(nomeProduto, reagentesArray, tempAtual, agitacaoLigada, observacaoReacao) {
    let identificador = 'Visitante';
    try {
      const sessao = JSON.parse(localStorage.getItem('laift_student_session') || '{}');
      if (sessao.identifier) identificador = sessao.identifier;
    } catch (e) {}

    let dadosQuimicos = null;
    if (typeof ChemicalAPIEngine !== 'undefined' && typeof ChemicalAPIEngine.resolveCompleteCompound === 'function') {
      dadosQuimicos = await ChemicalAPIEngine.resolveCompleteCompound(nomeProduto);
    } else {
      dadosQuimicos = await consultarDadosPubChem(nomeProduto);
    }

    const payload = {
      acao: 'registrarFormulacaoLab',
      identificador: identificador,
      produto: nomeProduto,
      reagentes: reagentesArray || Array.from(reagentesAdicionados),
      temperatura: tempAtual !== undefined ? tempAtual : sys.temp,
      agitacao: agitacaoLigada !== undefined ? agitacaoLigada : agitadorAtivo,
      sistema: sys.isClosed ? 'Fechado' : 'Aberto',
      observacoes: observacaoReacao || 'Síntese executada na bancada virtual LAIFT.',
      dadosPubChem: dadosQuimicos || { formula: 'Indeterminada', pesoMolecular: '--', smiles: '--', iupac: nomeProduto, cid: '--' }
    };

    try {
      await fetch(APPS_SCRIPT_GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      log(`🧪 Composto [${nomeProduto}] catalogado na nuvem!`, 'log-info');
    } catch (err) {
      console.warn('[Laboratório] Falha na persistência remota:', err);
    }
  }

  // =========================================================================
  // 8. VERIFICAÇÃO UNIFICADA DE SÍNTESE E REAÇÕES
  // =========================================================================
  async function verificarSinteseFarmaceutica() {
    let reacoesParaVerificar = [];

    if (typeof LAB_DATABASE !== 'undefined' && Array.isArray(LAB_DATABASE.reactions)) {
      reacoesParaVerificar = reacoesParaVerificar.concat(LAB_DATABASE.reactions);
    }

    if (typeof window.BANCO_SINTESES_LAIFT !== 'undefined' && Array.isArray(window.BANCO_SINTESES_LAIFT)) {
      const idsExistentes = new Set(reacoesParaVerificar.map(r => r.id));
      window.BANCO_SINTESES_LAIFT.forEach(rx => {
        if (!idsExistentes.has(rx.id)) {
          reacoesParaVerificar.push(rx);
        }
      });
    }

    if (reacoesParaVerificar.length === 0) return;

    for (const rx of reacoesParaVerificar) {
      if (!rx.reagentesObrigatorios) continue;
      const todosPresentes = rx.reagentesObrigatorios.every(r => reagentesAdicionados.has(r));
      const catalisadorOk = !rx.catalisador || reagentesAdicionados.has(rx.catalisador);
      const tempOk = sys.temp >= (rx.tempMinima || rx.tempMin || 20);
      const agitacaoOk = !rx.precisaAgitador || agitadorAtivo;

      if (todosPresentes && catalisadorOk && tempOk && agitacaoOk) {
        if (!reacoesCatalogadas.has(rx.id)) {
          reacoesCatalogadas.add(rx.id);
          sys.ultimoProdutoFormado = rx.produtoId || rx.id;

          tocarSom('sucesso');
          log(`✨ SÍNTESE CONCLUÍDA: ${rx.nomeComposto}!`, 'log-info');

          if (rx.corPrecipitado) {
            adicionarEspecie(rx.produtoId || rx.id, 8);
          }

          atualizarInspecaoMolecular(rx.produtoId || rx.id);

          catalogarFormulacaoNoBanco(
            rx.nomeComposto,
            Array.from(reagentesAdicionados),
            sys.temp,
            agitadorAtivo,
            rx.descricao || 'Síntese farmacêutica concluída com sucesso.'
          );
        }
      }
    }
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

  window.enviarDuvidaLab = async function() {
    const input = document.getElementById('labChatInput');
    const msg = input ? input.value.trim() : '';
    if (!msg) return;

    const chatBox = document.getElementById('labChatMessages');
    const badge = document.getElementById('preceptorStatusBadge');

    if (chatBox) {
      chatBox.innerHTML += `<div class="lab-chat-msg msg-aluno">${msg}</div>`;
      input.value = '';
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    const idTemp = 'lab_typing_' + Date.now();
    if (chatBox) {
      chatBox.innerHTML += `<div class="lab-chat-msg msg-preceptor" id="${idTemp}">Consultando base farmacotécnica e parâmetros da vidraria...</div>`;
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    if (badge) {
      badge.innerText = 'Processando...';
      badge.style.borderColor = '#38bdf8';
      badge.style.color = '#38bdf8';
    }

    try {
      if (typeof LabPreceptorEngine === 'undefined' || typeof LabPreceptorEngine.processarMensagem !== 'function') {
        throw new Error('Módulo LabPreceptorEngine não encontrado no escopo global.');
      }

      const respostaTexto = await LabPreceptorEngine.processarMensagem(msg, sys, calcularpH, agitadorAtivo);

      const elTyping = document.getElementById(idTemp);
      if (elTyping) elTyping.remove();

      const htmlFormatado = (respostaTexto || "").replace(/\n/g, '<br>');
      if (chatBox) {
        chatBox.innerHTML += `<div class="lab-chat-msg msg-preceptor">${htmlFormatado}</div>`;
      }

      if (badge) {
        badge.innerText = 'Online';
        badge.style.borderColor = '#00ff88';
        badge.style.color = '#4ade80';
      }
    } catch (e) {
      const elTyping = document.getElementById(idTemp);
      if (elTyping) elTyping.remove();

      console.error('[Preceptor Error]:', e);
      if (chatBox) {
        chatBox.innerHTML += `
          <div class="lab-chat-msg msg-preceptor" style="border-left-color: #ef4444;">
            ⚠️ <strong>Falha na comunicação:</strong><br>
            <code style="font-size: 0.72rem; color: #f87171;">${e.message || e}</code>
          </div>
        `;
      }

      if (badge) {
        badge.innerText = 'Erro';
        badge.style.borderColor = '#ef4444';
        badge.style.color = '#f87171';
      }
    }

    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
  };

  let alertaPressaoEmitido = false;
  let alertaSinteseQuasePronta = false;

  function verificarAlertasProativosPreceptor() {
    const chatBox = document.getElementById('labChatMessages');
    if (!chatBox) return;

    if (sys.isClosed && sys.pressao > 3.0 && !alertaPressaoEmitido) {
      alertaPressaoEmitido = true;
      chatBox.innerHTML += `
        <div class="lab-chat-msg msg-preceptor" style="border-left-color: #ef4444;">
          ⚠️ <strong>Atenção Imediata:</strong> A pressão interna atingiu <strong>${sys.pressao.toFixed(2)} atm</strong>. Reduza o aquecimento ou remova a rolha para evitar estilhaçamento da vidraria!
        </div>
      `;
      chatBox.scrollTop = chatBox.scrollHeight;
    } else if (sys.pressao <= 1.5) {
      alertaPressaoEmitido = false;
    }

    const temSalicilico = (sys.especies.get('AcidoSalicilico_s') || 0) > 0 || (sys.especies.get('C7H6O3_s') || 0) > 0;
    const temAnidrido = (sys.especies.get('AnidridoAcetico_l') || 0) > 0 || (sys.especies.get('C4H6O3_l') || 0) > 0;
    if (temSalicilico && temAnidrido && sys.temp < 50 && !alertaSinteseQuasePronta) {
      alertaSinteseQuasePronta = true;
      chatBox.innerHTML += `
        <div class="lab-chat-msg msg-preceptor">
          💡 <strong>Dica Farmacotécnica:</strong> Você reuniu os precursores da Aspirina no vaso, mas a temperatura (${sys.temp.toFixed(1)}°C) está abaixo da energia de ativação necessária. Ligue o aquecedor para atingir <strong>60°C</strong> e ative o agitador.
        </div>
      `;
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }

  // =========================================================================
  // 10. SISTEMA DE MISSÕES E ROTEIROS PRÁTICOS
  // =========================================================================
  const missoes = [
    { titulo: "Missão 1: Neutralização Básica", desc: "Atinge um pH entre 7.0 e 7.5 usando ácido e base. (Volume > 20mL).", check: () => calcularpH() >= 7.0 && calcularpH() <= 7.5 && sys.vol >= 20 },
    { titulo: "Missão 2: Chuva de Ouro", desc: "Forma um precipitado amarelo intenso de Iodeto de Chumbo (PbI₂).", check: () => qtd('PbI2_s') > 0.1 },
    { titulo: "Missão 3: Libertação de Gás H₂", desc: "Faz um metal sólido reagir com ácido para gerar gás Hidrogénio.", check: () => qtd('H2_g') > 1 },
    { titulo: "Missão 4: Ponto de Ebulição", desc: "Aquece a água no laboratório até que comece a evaporar ativamente (100°C).", check: () => sys.temp >= 100 && qtd('H2O_l') > 0 },
    { titulo: "Missão 5: Síntese da Aspirina", desc: "Mistura Ácido Salicílico + Anidrido Acético com H₂SO₄ sob aquecimento (>60°C).", check: () => reacoesCatalogadas.has('sintese_aspirina') },
    { titulo: "Missão 6: Chuva de Prata", desc: "Mistura Nitrato de Prata (AgNO₃) com Cloreto (Ex: NaCl ou HCl) para formar AgCl.", check: () => qtd('AgCl_s') > 0.1 },
    { titulo: "Missão 7: Síntese de Paracetamol", desc: "Mistura 4-Aminofenol + Anidrido Acético sob aquecimento e agitação (>55°C).", check: () => reacoesCatalogadas.has('sintese_paracetamol') },
    { titulo: "Missão 8: Ambiente Super Ácido", desc: "Cria uma solução altamente corrosiva com pH menor ou igual a 2.0.", check: () => calcularpH() <= 2.0 && sys.vol > 10 },
    { titulo: "Missão 9: Aroma de Banana (Éster)", desc: "Mistura Ácido Acético com Álcool Isopentílico catalisado por H₂SO₄ sob calor.", check: () => reacoesCatalogadas.has('sintese_aroma_banana') },
    { titulo: "Missão 10: Efervescência de Carbonato", desc: "Mistura um carbonato (como NaHCO₃ ou CaCO₃) com ácido para liberar CO₂.", check: () => qtd('CO2_g') > 0.5 }
  ];
  let missaoAtual = 0;

  function atualizarUI_Missao() {
    const elTitle = document.getElementById('missionTitle');
    const elDesc = document.getElementById('missionDesc');
    const elStatus = document.getElementById('missionStatus');
    const btnNext = document.getElementById('btnNextMission');

    if (!elTitle || !elDesc || !elStatus) return;

    if (missaoAtual >= missoes.length) {
      elTitle.innerText = "🎉 Mestre Laboratorial!";
      elDesc.innerText = "Concluiu todas as 10 missões com sucesso.";
      elStatus.style.display = 'none';
      if (btnNext) btnNext.style.display = 'none';
      return;
    }

    const m = missoes[missaoAtual];
    elTitle.innerText = m.titulo;
    elDesc.innerText = m.desc;
    elStatus.innerText = "Pendente";
    elStatus.style.display = 'inline-block';
    elStatus.style.borderColor = "#ff9800";
    elStatus.style.color = "#ff9800";
    if (btnNext) btnNext.style.display = 'none';
  }

  function verificarMissoes() {
    if (missaoAtual >= missoes.length) return;
    if (missoes[missaoAtual].check()) {
      const badge = document.getElementById('missionStatus');
      if (badge && badge.innerText !== 'Concluída ✅') {
        badge.innerText = 'Concluída ✅';
        badge.style.borderColor = 'var(--neon-green)';
        badge.style.color = 'var(--neon-green)';
        const btnNext = document.getElementById('btnNextMission');
        if (btnNext) btnNext.style.display = 'block';
        tocarSom('sucesso');
        log('🏆 ' + missoes[missaoAtual].titulo + ' Concluída!', 'log-info');
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

    const ticketHTML = `<div class="incident-ticket"><h3>🚨 RELATÓRIO DE INCIDENTE</h3><p><strong>FALHA:</strong> ${titulo}</p><p><strong>CAUSA:</strong> ${msg}</p><p><strong>STATUS TÉRMICO:</strong> ${sys.temp.toFixed(1)} °C</p><p><strong>PRESSÃO:</strong> ${sys.pressao.toFixed(2)} atm</p></div>`;
    const elTitle = document.getElementById('alertTitle');
    const elMsg = document.getElementById('alertMsg');
    const elOverlay = document.getElementById('alertOverlay');

    if (elTitle) elTitle.innerText = "Sistema de Segurança Ativado";
    if (elMsg) elMsg.innerHTML = ticketHTML;
    if (elOverlay) elOverlay.style.display = 'flex';
    log(`🚨 INCIDENTE: ${titulo}`, 'log-danger');
  }

  function resetarLaboratorio() {
    if (timerAdd) { clearInterval(timerAdd); timerAdd = null; }
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
    reacoesCatalogadas.clear();
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

  function trocarVidraria() {
    if (sys.vol > 0 || sys.especies.size > 0) {
      if (!confirm('Trocar de vidraria descarta a mistura atual. Deseja prosseguir?')) return;
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
      log(`Adicionado ${qtdRestante.toFixed(1)} de ${reag}.`);
    } else {
      incrAdd = (modo === 'jato') ? 10 : 1;
      const btn = document.getElementById('btnStartAdd');
      if (btn) btn.innerText = '⚡ Adicionando...';
      if (modo === 'jato') animarDespejo('jato');
      if (timerAdd) clearInterval(timerAdd);

      timerAdd = setInterval(() => {
        if (qtdRestante <= 0 || sys.shattered) { window.pararAdicao(); return; }
        if (modo === 'gota') animarDespejo('gota');
        let add = Math.min(incrAdd, qtdRestante);
        qtdRestante -= add;
        processarCarga(reag, add);
      }, 280 / velocidadeTempo);
    }

    atualizarInspecaoMolecular(reag);
  }

  function pararAdicao() {
    if (timerAdd) { clearInterval(timerAdd); timerAdd = null; }
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

    const info = (typeof LAB_DATABASE !== 'undefined' && LAB_DATABASE.species && LAB_DATABASE.species[reag])
      ? LAB_DATABASE.species[reag]
      : (DICIONARIO_MOLECULAR[reag] || null);

    const fase = info ? info.phase : (reag.slice(-1) === 'q' ? 'aq' : reag.slice(-1));
    const massa = info ? info.molarMass : (MM[reag.replace(/_s|_l|_aq|_g/g, '')] || 100);

    if (fase === 'l') {
      adicionarEspecie(reag, qtdAdd * 10);
      sys.vol += qtdAdd;
    } else if (fase === 'aq') {
      const conc = CONC_AQ[reag] || 1.0;
      const mmol = conc * qtdAdd;
      adicionarEspecie('H2O_l', qtdAdd * 10);
      sys.vol += qtdAdd;

      if (info && Array.isArray(info.dissociation)) {
        info.dissociation.forEach(([ion, fator]) => {
          adicionarEspecie(ion, mmol * fator);
        });
      } else {
        const dissocMap = {
          'HCl_aq': [['H+', 1], ['Cl-', 1]],
          'H2SO4_aq': [['H+', 2], ['SO4_2-', 1]],
          'HNO3_aq': [['H+', 1], ['NO3-', 1]],
          'HClO4_aq': [['H+', 1], ['ClO4-', 1]],
          'H3PO4_aq': [['H+', 3], ['PO4_3-', 1]],
          'AcidoAcetico_aq': [['H+', 0.1], ['CH3COO-', 0.1]],
          'NaOH_aq': [['Na+', 1], ['OH-', 1]],
          'NH3_aq': [['NH3', 1], ['OH-', 0.1]],
          'NaClO_aq': [['Na+', 1], ['ClO-', 1]],
          'KI_aq': [['K+', 1], ['I-', 1]],
          'NH42S_aq': [['NH4+', 2], ['S_2-', 1]],
          'Na2CO3_aq': [['Na+', 2], ['CO3_2-', 1]],
          'PbNO3_aq': [['Pb2+', 1], ['NO3-', 2]],
          'AgNO3_aq': [['Ag+', 1], ['NO3-', 1]],
          'CdNO3_aq': [['Cd2+', 1], ['NO3-', 2]],
          'CuSO4_aq': [['Cu2+', 1], ['SO4_2-', 1]],
          'FeCl3_aq': [['Fe3+', 1], ['Cl-', 3]],
          'ZnSO4_aq': [['Zn2+', 1], ['SO4_2-', 1]],
          'NiCl2_aq': [['Ni2+', 1], ['Cl-', 2]],
          'SbCl3_aq': [['Sb3+', 1], ['Cl-', 3]],
          'CaCl2_aq': [['Ca2+', 1], ['Cl-', 2]],
          'BaCl2_aq': [['Ba2+', 1], ['Cl-', 2]],
          'CoCl2_aq': [['Co2+', 1], ['Cl-', 2]],
          'SCN_aq': [['K+', 1], ['SCN-', 1]],
          'H2O2_aq': [['H2O2', 1]],
          'NaHCO3_aq': [['Na+', 1], ['HCO3-', 1]],
          'K2CO3_aq': [['K+', 2], ['CO3_2-', 1]],
          'KOH_aq': [['K+', 1], ['OH-', 1]],
          'LiOH_aq': [['Li+', 1], ['OH-', 1]],
          'CaOH2_aq': [['Ca2+', 1], ['OH-', 2]]
        };
        if (dissocMap[reag]) {
          dissocMap[reag].forEach(([sp, f]) => adicionarEspecie(sp, mmol * f));
        }
      }
    } else if (fase === 's') {
      const mmol = (qtdAdd * 1000) / massa;
      adicionarEspecie(reag, mmol);
    } else if (reag === 'fenolftaleina') {
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
  }

  function atualizarEquilibrio() {
    const volL = sys.vol / 1000;

    if (volL > 0 && qtd('H2O_l') > 0) {
      const txDissolucao = agitadorAtivo ? 1.0 : 0.25;
      const sNaCl = qtd('NaCl_s');
      if (sNaCl > 0) { const r = sNaCl * txDissolucao; removerEspecie('NaCl_s', r); adicionarEspecie('Na+', r); adicionarEspecie('Cl-', r); }

      const sCuSO4 = qtd('CuSO4_s');
      if (sCuSO4 > 0) { const r = sCuSO4 * txDissolucao; removerEspecie('CuSO4_s', r); adicionarEspecie('Cu2+', r); adicionarEspecie('SO4_2-', r); }

      const sNaHCO3 = qtd('NaHCO3_s');
      if (sNaHCO3 > 0) { const r = sNaHCO3 * txDissolucao; removerEspecie('NaHCO3_s', r); adicionarEspecie('Na+', r); adicionarEspecie('HCO3-', r); }
    }

    // Neutralização H+ + OH- -> H2O
    const h = qtd('H+'), oh = qtd('OH-');
    if (h > 0 && oh > 0) {
      const r = Math.min(h, oh);
      removerEspecie('H+', r);
      removerEspecie('OH-', r);
      adicionarEspecie('H2O_l', r);
      sys.temp += r * 0.05;
    }

    // Reações de Ácidos com Metais e Carbonatos
    const hNow = qtd('H+');
    if (hNow > 0) {
      const metais = ['Zn_s','Mg_s','Al_s','Na_s','Li_s','K_s','Ca_s','Fe_s','Ni_s','Cu_s','Sn_s','Pb_s'];
      for (const m of metais) {
        const qm = qtd(m);
        if (qm <= 0) continue;

        let valencia = 1;
        if (['Mg_s','Ca_s','Zn_s','Fe_s','Ni_s','Cu_s','Sn_s','Pb_s'].includes(m)) valencia = 2;
        else if (['Al_s'].includes(m)) valencia = 3;

        let ion = m.replace('_s', '') + (valencia > 1 ? valencia + '+' : '+');
        if (m === 'Na_s') ion = 'Na+'; else if (m === 'Li_s') ion = 'Li+'; else if (m === 'K_s') ion = 'K+';
        else if (m === 'Ca_s') ion = 'Ca2+'; else if (m === 'Fe_s') ion = 'Fe2+';

        if (hNow >= valencia) {
          let r = Math.min(qm, hNow / valencia);
          if (!agitadorAtivo) r *= 0.5;
          removerEspecie(m, r);
          removerEspecie('H+', valencia * r);
          adicionarEspecie(ion, r);
          adicionarEspecie('H2_g', r * (valencia === 2 ? 1 : valencia === 3 ? 1.5 : 0.5));
          sys.temp += r * 2;
        }
      }

      const co3 = qtd('CO3_2-');
      if (co3 > 0 && hNow >= 2) {
        const r = Math.min(co3, hNow / 2);
        removerEspecie('CO3_2-', r);
        removerEspecie('H+', 2 * r);
        adicionarEspecie('H2O_l', r);
        adicionarEspecie('CO2_g', r);
      }

      const caco3 = qtd('CaCO3_s');
      if (caco3 > 0 && hNow >= 2) {
        const r = Math.min(caco3, hNow / 2);
        removerEspecie('CaCO3_s', r);
        removerEspecie('H+', 2 * r);
        adicionarEspecie('Ca2+', r);
        adicionarEspecie('H2O_l', r);
        adicionarEspecie('CO2_g', r);
      }

      const clo = qtd('ClO-'), cl = qtd('Cl-');
      if (clo > 0 && cl > 0 && hNow >= 2) {
        const r = Math.min(clo, cl, hNow / 2);
        removerEspecie('ClO-', r);
        removerEspecie('Cl-', r);
        removerEspecie('H+', 2 * r);
        adicionarEspecie('H2O_l', r);
        adicionarEspecie('Cl2_g', r);
        log('⚠ Gás cloro (Cl₂) desprendido da solução!', 'log-danger');
      }
    }

    // Reatividade Violenta de Metais Alcalinos com Água
    const alcalinos = ['Na_s', 'Li_s', 'K_s'];
    for (const m of alcalinos) {
      const qm = qtd(m);
      const agua = qtd('H2O_l');
      if (qm > 0 && agua > 0) {
        const ion = m === 'Na_s' ? 'Na+' : m === 'Li_s' ? 'Li+' : 'K+';
        const r = Math.min(qm, agua);
        removerEspecie(m, r);
        removerEspecie('H2O_l', r);
        adicionarEspecie(ion, r);
        adicionarEspecie('OH-', r);
        adicionarEspecie('H2_g', r / 2);
        sys.temp += r * 5.5;
        if (r > 12) dispararAlerta('Ignição Alcalina!', `Reação violenta de ${m.replace('_s', '')} com água gerou calor e hidrogênio!`);
      }
    }

    // Tabela de Precipitação Quimiométrica
    PRECIP_TABLE.forEach(p => {
      const cq = qtd(p.cat), aq = qtd(p.an);
      if (cq > 0 && aq > 0) {
        const fc = cq / p.cC, fa = aq / p.cA;
        const m = Math.min(fc, fa);
        removerEspecie(p.cat, m * p.cC);
        removerEspecie(p.an, m * p.cA);
        adicionarEspecie(p.prod, m);
        if (m > 0.1 && !reacoesCatalogadas.has(p.prod)) {
          reacoesCatalogadas.add(p.prod);
          sys.ultimoProdutoFormado = p.prod;
          atualizarInspecaoMolecular(p.prod);
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
    const volL = sys.vol / 1000;
    if (volL <= 0) return 7;
    const h = qtd('H+'), oh = qtd('OH-');
    if (h > 1e-12) {
      const conc = h / volL;
      return Math.max(0, Math.min(14, -Math.log10(Math.max(conc, 1e-14))));
    }
    if (oh > 1e-12) {
      const conc = oh / volL;
      return Math.max(0, Math.min(14, 14 + Math.log10(Math.max(conc, 1e-14))));
    }
    return 7;
  }

  window.calcularpH = calcularpH;

  function atualizarUI() {
    const volDisplay = document.getElementById('volDisplay');
    if (volDisplay) volDisplay.innerText = `${sys.vol.toFixed(1)} / ${sys.maxVol} mL`;

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
    if (hudTemp) hudTemp.innerText = sys.temp.toFixed(1) + ' °C';
    if (hudPress) hudPress.innerText = sys.pressao.toFixed(2) + ' atm';
    if (hudPH) hudPH.innerText = calcularpH().toFixed(2);

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
      let tagsHtml = '';
      for (const [esp, q] of sys.especies) {
        if (q < 0.05) continue;
        let cls = 'tag-aq';
        if (esp.endsWith('_s')) cls = 'tag-s';
        else if (esp.endsWith('_g')) cls = 'tag-g';
        else if (esp.endsWith('_l')) cls = 'tag-l';
        const nome = esp.replace(/_s|_g|_l|_aq/g,'').replace(/_2-/g,'²⁻').replace(/3\+/g,'³⁺').replace(/2\+/g,'²⁺').replace(/\+/g,'⁺').replace(/-/g,'⁻');
        tagsHtml += `<span class="tag ${cls}" title="${q.toFixed(2)} mmol">${nome} ${q.toFixed(1)}</span>`;
      }
      speciesTags.innerHTML = tagsHtml || '<span style="color:#546e7a;">vazio</span>';
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
      phCtx.font = '9px Fira Code';
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
    timerLoop = setInterval(loopTermico, 200 / velocidadeTempo);
  };

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

    if (alterou) {
      atualizarEquilibrio();
      verificarSinteseFarmaceutica();
      atualizarEstadoFisico();
      atualizarUI();
      registrarPontoPH();
    }

    verificarAlertasProativosPreceptor();
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
        ['C11H17N3O8_s', 'Tetrodotoxina (TTX)'],
        ['C4H10FO2P_l', 'Sarin (GB)'],
        ['C11H26NO2PS_l', 'Agente VX'],
        ['C4H8Cl2S_l', 'Gás Mostarda (HD)']
      ]],
      ['🔬 Vitaminas & Indicadores', [
        ['C6H8O6_s', 'Ácido Ascórbico (Vitamina C)'],
        ['fenolftaleina', 'Fenolftaleína (Indicador pH)']
      ]]
    ];

    let html = '';
    grupos.forEach(([titulo, itens], idx) => {
      html += `<details ${idx === 0 ? 'open' : ''}><summary>${titulo}</summary><div class="reagent-list">`;
      itens.forEach(([val, label], i) => {
        html += `<label><input type="radio" name="reagenteSel" value="${val}" ${idx === 0 && i === 0 ? 'checked' : ''}> ${label}</label>`;
      });
      html += '</div></details>';
    });

    const catContainer = document.getElementById('catalogContainer');
    if (catContainer) {
      catContainer.innerHTML = html;
      catContainer.querySelectorAll('input[name="reagenteSel"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          atualizarInspecaoMolecular(e.target.value);
        });
      });
    }
  }

  // =========================================================================
  // 17. CONTROLES DE INTERFACE, MODAIS E EXPORTAÇÃO GLOBAL
  // =========================================================================
  window.proximaMissao = function() { missaoAtual++; resetarLaboratorio(); atualizarUI_Missao(); };
  window.abrirLivroMissoes = function() {
    let html = '<ul style="list-style:none; padding:0;">';
    missoes.forEach((m, i) => {
      const status = i < missaoAtual ? "✅ Concluída" : i === missaoAtual ? "▶ Em Progresso" : "🔒 Bloqueada";
      const color = i < missaoAtual ? "var(--neon-green)" : i === missaoAtual ? "#ff9800" : "#546e7a";
      html += `<li style="color:${color}; margin-bottom:12px; border-bottom:1px dashed #1e3a5f; padding-bottom:8px;"><strong>${m.titulo}</strong> <span style="font-size:0.6rem;">(${status})</span><br><span style="color:#b0bec5; font-size:0.75rem;">${m.desc}</span></li>`;
    });
    html += '</ul>';
    const listEl = document.getElementById('missionsList');
    const modal = document.getElementById('missionsModal');
    if (listEl) listEl.innerHTML = html;
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
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({ acao: 'studioAberto' }, '*');
          }
        } catch (e) {}
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

    const radio = document.querySelector(`input[name="reagenteSel"][value="${chave}"]`);
    if (radio) {
      radio.checked = true;
      const detailsPai = radio.closest('details');
      if (detailsPai) detailsPai.open = true;
      radio.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      const catContainer = document.querySelector('#catalogContainer .reagent-list');
      if (catContainer) {
        const novoLabel = document.createElement('label');
        novoLabel.innerHTML = `<input type="radio" name="reagenteSel" value="${chave}" checked> 🧬 ${nome} (Estúdio 3D)`;
        novoLabel.querySelector('input').addEventListener('change', () => {
          atualizarInspecaoMolecular(chave);
        });
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
  // 19. INICIALIZAÇÃO SEQUENCIAL
  // =========================================================================
  construirCatalogo();
  resetarLaboratorio();
  atualizarUI_Missao();
  initSmilesDrawer();

  setTimeout(() => {
    const sel = getSelectedReagent();
    if (sel) atualizarInspecaoMolecular(sel);
  }, 150);

  timerLoop = setInterval(loopTermico, 200);
  log('🚀 LAIFT Engine Uninassau iniciado com Sucesso!', 'log-info');

})();
