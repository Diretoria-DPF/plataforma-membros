/**
 * @file renderer.js
 * @description Motor de renderização WebGL sob demanda Three.js do Atlas Anatômico 3D.
 * Elimina laço incondicional de animação, recupera perda de contexto e limita pixelRatio.
 */

import { AppBus } from '../core/bus.js';

class EngineRendererManager {
  // [INÍCIO MÉTODO: constructor]
  constructor() {
    /** @type {HTMLElement|null} */
    this.container = null;
    /** @type {THREE.WebGLRenderer|null} */
    this.renderer = null;
    /** @type {THREE.Scene|null} */
    this.scene = null;
    /** @type {THREE.PerspectiveCamera|null} */
    this.camera = null;
    /** @type {any|null} OrbitControls */
    this.controls = null;
    /** @type {boolean} Flag de agendamento de quadro único */
    this.frameScheduled = false;
    /** @type {boolean} Sinalizador de perda ativa de contexto de GPU */
    this.contextLost = false;
    /** @type {THREE.Mesh|null} */
    this.highlightMesh = null;
    /** @type {Map<string, THREE.Object3D>} sid -> Objeto tridimensional */
    this.structureMeshMap = new Map();
  }
  // [FIM MÉTODO: constructor]

  // [INÍCIO MÉTODO: init]
  /**
   * Constrói e inicializa a cena Three.js dentro do contêiner designado.
   * @param {HTMLElement} container
   * @returns {Promise<void>}
   */
  async init(container) {
    if (!container) {
      throw new Error('Contêiner para o renderizador WebGL não informado.');
    }
    this.container = container;

    // 1. Criação da Cena
    this.scene = new window.THREE.Scene();
    this.scene.background = new window.THREE.Color(0x0f172a); // Superfície escura da identidade LAIFT

    // 2. Configuração da Câmera Perspectiva
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera = new window.THREE.PerspectiveCamera(45, width / Math.max(height, 1), 0.1, 1000);
    this.camera.position.set(0, 1.2, 2.5);

    // 3. Configuração do Renderizador WebGL com orçamento móvel estrito
    const maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer = new window.THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(maxPixelRatio);
    this.renderer.outputEncoding = window.THREE.sRGBEncoding;

    // Vincula o elemento canvas ao documento
    this.container.appendChild(this.renderer.domElement);

    // 4. Configuração dos Controladores de Câmera (OrbitControls)
    if (window.THREE.OrbitControls) {
      this.controls = new window.THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.target.set(0, 1.0, 0);

      // Ouvinte para renderizar apenas quando houver rotação/zoom do usuário
      this.controls.addEventListener('change', () => {
        this.requestRender();
      });
    }

    // 5. Iluminação anatômica tridimensional balanceada
    this.setupLighting();

    // 6. Monitoramento de contexto gráfico WebGL
    this.bindContextEvents();

    // Primeiro disparo de renderização do quadro estático
    this.requestRender();
  }
  // [FIM MÉTODO: init]

  // [INÍCIO MÉTODO: setupLighting]
  /**
   * Instancia as luzes da cena para visualização médica volumétrica.
   */
  setupLighting() {
    if (!this.scene) return;

    // Luz hemisférica para iluminação global suave
    const hemiLight = new window.THREE.HemisphereLight(0xffffff, 0x334155, 0.75);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);

    // Luz direcional principal
    const dirLight1 = new window.THREE.DirectionalLight(0xffffff, 0.65);
    dirLight1.position.set(5, 10, 7.5);
    this.scene.add(dirLight1);

    // Luz de preenchimento posterior
    const dirLight2 = new window.THREE.DirectionalLight(0x94a3b8, 0.4);
    dirLight2.position.set(-5, -5, -5);
    this.scene.add(dirLight2);
  }
  // [FIM MÉTODO: setupLighting]

  // [INÍCIO MÉTODO: bindContextEvents]
  /**
   * Captura eventos de perda e recuperação do contexto gráfico da GPU.
   */
  bindContextEvents() {
    if (!this.renderer?.domElement) return;

    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.contextLost = true;
      console.warn('[Atlas WebGL] Contexto gráfico WebGL perdido. Congelando ciclo de render.');
      AppBus.emit('engine:context-lost');
    }, false);

    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      console.log('[Atlas WebGL] Contexto gráfico WebGL restaurado com sucesso.');
      this.requestRender();
      AppBus.emit('engine:context-restored');
    }, false);
  }
  // [FIM MÉTODO: bindContextEvents]

  // [INÍCIO MÉTODO: requestRender]
  /**
   * Ponto de entrada unificado para solicitar um novo quadro de desenho (On-Demand).
   * Consolida chamadas múltiplas dentro de um único requestAnimationFrame.
   */
  requestRender() {
    if (this.contextLost || this.frameScheduled) {
      return;
    }

    this.frameScheduled = true;
    requestAnimationFrame(() => {
      this.renderPass();
    });
  }
  // [FIM MÉTODO: requestRender]

  // [INÍCIO MÉTODO: renderPass]
  /**
   * Executa a passagem de renderização gráfica na GPU.
   */
  renderPass() {
    this.frameScheduled = false;

    if (this.contextLost || !this.renderer || !this.scene || !this.camera) {
      return;
    }

    // Atualiza amortecimento dos controladores se ativos
    if (this.controls && this.controls.enableDamping) {
      this.controls.update();
    }

    // Efetua o desenho do quadro
    this.renderer.render(this.scene, this.camera);
  }
  // [FIM MÉTODO: renderPass]

  // [INÍCIO MÉTODO: onWindowResize]
  /**
   * Trata o redimensionamento do contêiner gráfico recalculando a razão de aspecto.
   */
  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) {
      return;
    }

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.requestRender();
  }
  // [FIM MÉTODO: onWindowResize]

  // [INÍCIO MÉTODO: highlightStructure]
  /**
   * Destaca visualmente a estrutura anatômica selecionada na cena.
   * @param {string} sid
   */
  highlightStructure(sid) {
    if (!sid) {
      this.resetHighlight();
      return;
    }

    // Localiza a malha associada ao SID no mapa de objetos
    const targetMesh = this.structureMeshMap.get(sid);
    if (!targetMesh) {
      this.requestRender();
      return;
    }

    // Aplica pulso visual ou realce de emissão no material
    if (targetMesh.material && targetMesh.material.emissive) {
      targetMesh.material.emissive.setHex(0x38bdf8); // Tom de destaque ciano LAIFT
    }

    this.requestRender();
  }
  // [FIM MÉTODO: highlightStructure]

  // [INÍCIO MÉTODO: resetHighlight]
  /**
   * Restaura o material original das malhas desmarcando o realce ativo.
   */
  resetHighlight() {
    this.structureMeshMap.forEach(mesh => {
      if (mesh.material && mesh.material.emissive) {
        mesh.material.emissive.setHex(0x000000);
      }
    });
    this.requestRender();
  }
  // [FIM MÉTODO: resetHighlight]

  // [INÍCIO MÉTODO: registerMesh]
  /**
   * Registra uma malha tridimensional associando-a ao seu SID canônico.
   * @param {string} sid
   * @param {THREE.Object3D} mesh
   */
  registerMesh(sid, mesh) {
    if (sid && mesh) {
      this.structureMeshMap.set(sid, mesh);
    }
  }
  // [FIM MÉTODO: registerMesh]

  // [INÍCIO MÉTODO: getCamera]
  /**
   * Retorna a câmera ativa da cena.
   * @returns {THREE.PerspectiveCamera|null}
   */
  getCamera() {
    return this.camera;
  }
  // [FIM MÉTODO: getCamera]

  // [INÍCIO MÉTODO: getScene]
  /**
   * Retorna a cena tridimensional ativa.
   * @returns {THREE.Scene|null}
   */
  getScene() {
    return this.scene;
  }
  // [FIM MÉTODO: getScene]

  // [INÍCIO MÉTODO: getRenderer]
  /**
   * Retorna a instância do WebGLRenderer.
   * @returns {THREE.WebGLRenderer|null}
   */
  getRenderer() {
    return this.renderer;
  }
  // [FIM MÉTODO: getRenderer]

  // [INÍCIO MÉTODO: getControls]
  /**
   * Retorna a instância de controles orbitais.
   * @returns {any|null}
   */
  getControls() {
    return this.controls;
  }
  // [FIM MÉTODO: getControls]

  // [INÍCIO MÉTODO: dispose]
  /**
   * Libera buffers de memória da GPU e descarta recursos na desmontagem.
   */
  dispose() {
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
    this.structureMeshMap.clear();
  }
  // [FIM MÉTODO: dispose]
}

export const EngineRenderer = new EngineRendererManager();
