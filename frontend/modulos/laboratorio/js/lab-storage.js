/**
 * LAIFT — GERENCIADOR DE BANCO DE DADOS LOCAL (IndexedDB) & MOTOR 3D (3Dmol.js)
 * Cobre cache offline, conformações 3D e persistência local resiliente.
 */

const LabStorageEngine = {
  DB_NAME: 'LAIFT_ChemRepository_v1',
  DB_VERSION: 1,
  dbInstance: null,
  viewer3DInstance: null,
  modoAtual: '2D', // '2D' ou '3D'

  /**
   * Inicializa o banco IndexedDB de forma segura sem quebrar abas anônimas
   */
  async initDB() {
    if (this.dbInstance) return this.dbInstance;
    return new Promise((resolve) => {
      try {
        if (!window.indexedDB) {
          console.warn('[LabStorageEngine] IndexedDB não suportado neste navegador.');
          return resolve(null);
        }

        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('compostos')) {
            const compStore = db.createObjectStore('compostos', { keyPath: 'termoChave' });
            compStore.createIndex('cid', 'cid', { unique: false });
          }
          if (!db.objectStoreNames.contains('rotas_sintese')) {
            db.createObjectStore('rotas_sintese', { keyPath: 'compostoAlvo' });
          }
        };

        request.onsuccess = (e) => {
          this.dbInstance = e.target.result;
          resolve(this.dbInstance);
        };

        request.onerror = (err) => {
          console.warn('[LabStorageEngine] Erro ao abrir IndexedDB:', err);
          resolve(null);
        };
      } catch (e) {
        console.warn('[LabStorageEngine] Exceção crítica no IndexedDB:', e);
        resolve(null);
      }
    });
  },

  /**
   * Recupera composto armazenado localmente
   */
  async obterCompostoLocal(termo) {
    if (!termo) return null;
    const db = await this.initDB();
    if (!db) return null;

    const chave = String(termo).trim().toLowerCase();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('compostos', 'readonly');
        const store = tx.objectStore('compostos');
        const req = store.get(chave);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  },

  /**
   * Salva composto e suas propriedades físicas no banco local
   */
  async salvarCompostoLocal(termo, dados) {
    if (!termo || !dados || typeof dados !== 'object') return false;
    const db = await this.initDB();
    if (!db) return false;

    const chave = String(termo).trim().toLowerCase();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('compostos', 'readwrite');
        const store = tx.objectStore('compostos');
        const registro = { ...dados, termoChave: chave, timestamp: Date.now() };
        store.put(registro);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  },

  /**
   * Armazena rotas geradas pelo Preceptor para economizar chamadas de rede
   */
  async obterRotaSinteseLocal(termo) {
    if (!termo) return null;
    const db = await this.initDB();
    if (!db) return null;

    const chave = String(termo).trim().toLowerCase();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('rotas_sintese', 'readonly');
        const store = tx.objectStore('rotas_sintese');
        const req = store.get(chave);
        req.onsuccess = () => resolve(req.result ? req.result.conteudo : null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  },

  async salvarRotaSinteseLocal(termo, textoResposta) {
    if (!termo || !textoResposta) return false;
    const db = await this.initDB();
    if (!db) return false;

    const chave = String(termo).trim().toLowerCase();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('rotas_sintese', 'readwrite');
        const store = tx.objectStore('rotas_sintese');
        store.put({
          compostoAlvo: chave,
          conteudo: textoResposta,
          timestamp: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  },

  /**
   * Baixa a estrutura tridimensional real (3D Conformer SDF) da PubChem
   */
  async baixarEstrutura3D_SDF(cidOuNome) {
    if (!cidOuNome) return null;
    try {
      let url = "";
      if (typeof cidOuNome === 'number' || /^\d+$/.test(String(cidOuNome).trim())) {
        url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cidOuNome}/SDF?record_type=3d`;
      } else {
        url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(String(cidOuNome).trim())}/SDF?record_type=3d`;
      }

      const res = await fetch(url);
      if (!res.ok) return null;
      const sdfText = await res.text();
      return (sdfText && sdfText.includes("$$$$")) ? sdfText : null;
    } catch (e) {
      console.warn('[3D Engine] Falha ao baixar conformação 3D:', e);
      return null;
    }
  },

  /**
   * Renderiza a molécula tridimensional interativa com WebGL via 3Dmol.js
   */
  renderizar3DMol(sdfData, containerId = 'viewer3D') {
    const container = document.getElementById(containerId);
    if (!container || !window.$3Dmol) return;

    container.innerHTML = '';
    container.style.display = 'block';

    const config = { backgroundColor: '#020617' };
    this.viewer3DInstance = $3Dmol.createViewer(container, config);
    this.viewer3DInstance.addModel(sdfData, "sdf");

    this.viewer3DInstance.setStyle({}, {
      stick: { radius: 0.14, colorscheme: 'Jmol' },
      sphere: { scale: 0.26, colorscheme: 'Jmol' }
    });

    this.viewer3DInstance.zoomTo();
    this.viewer3DInstance.render();
    this.viewer3DInstance.animate({ loop: "backAndForth", step: 0.4 });
  },

  /**
   * Alterna a visualização entre Projeção 2D e Conformer 3D sem sobrepor o renderizador híbrido
   */
  alternarModo(modo) {
    this.modoAtual = modo;
    const canvas2D = document.getElementById('moleculeCanvas');
    const img2D = document.getElementById('moleculeImg');
    const div3D = document.getElementById('viewer3D');
    const btn2D = document.getElementById('btnModo2D');
    const btn3D = document.getElementById('btnModo3D');

    if (btn2D) btn2D.classList.toggle('active-btn', modo === '2D');
    if (btn3D) btn3D.classList.toggle('active-btn', modo === '3D');

    if (modo === '2D') {
      if (div3D) div3D.style.display = 'none';
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
        if (this.viewer3DInstance) {
          this.viewer3DInstance.resize();
          this.viewer3DInstance.render();
        }
      }
    }
  }
};

// Vincula a alternância global mantendo compatibilidade
if (typeof window.setModoVisualizacao !== 'function') {
  window.setModoVisualizacao = function(modo) {
    LabStorageEngine.alternarModo(modo);
  };
}

// Exportação global
if (typeof window !== "undefined") {
  window.LabStorageEngine = LabStorageEngine;
}
