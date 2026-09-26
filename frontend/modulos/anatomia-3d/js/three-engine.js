/* ========================================================================= */
/* ARQUIVO: anatomia-3d/js/three-engine.js                                   */
/* VERSÃO:  2.6.0 — COMPLETA: 14 SISTEMAS, 18 VIAS & EXPOSIÇÃO GLOBAL       */
/* ========================================================================= */

/**
 * MOTOR GRÁFICO 3D MASTER — LAIFT BIO-TWIN
 * - Renderização imediata via manequim procedural com 14 sistemas anatômicos
 * - Amarração global defensiva em window.ThreeEngine
 * - Suporte a padrões regex / wildcard para seleção e filtragem de malhas
 * - Emissores de partículas e curvas spline 3D para as 18 vias farmacológicas
 * - Sistema dinâmico de fisiopatologia / simulação de crises toxicológicas
 * - Avaliação espacial via raycasting para o Quiz 3D Gamificado
 */

(function (root) {
  "use strict";

  // -------------------------------------------------------------------------
  // 1. ESTADO E VARIÁVEIS GLOBAIS DO THREE.JS
  // -------------------------------------------------------------------------
  let scene = null;
  let camera = null;
  let renderer = null;
  let controls = null;
  let bodyModel = null;
  let hoveredMesh = null;
  let raycaster = null;
  let mouse = null;

  // Coleção de sistemas carregados dinamicamente
  const loadedSystems = {};

  // -------------------------------------------------------------------------
  // MODELO REAL (models/body.glb, Draco) — ver classifyRealMesh() abaixo.
  // -------------------------------------------------------------------------
  // `usingRealModel` liga quando o GLB real (826 malhas, nomes anatômicos em
  // inglês) substitui o manequim procedural. Enquanto falso, todo o código de
  // camadas/sistemas abaixo usa os `mesh_*` fictícios do manequim (compat.).
  let usingRealModel = false;
  // Lista plana das malhas reais + sua classificação, montada uma única vez
  // no carregamento (evita `bodyModel.traverse` repetido a cada interação e,
  // principalmente, qualquer travessia por frame de animação).
  let realMeshEntries = [];
  let loadingBadge = null;

  // O body.glb (Z-Anatomy, CC BY-SA) traz só esqueleto + músculos + estruturas
  // articulares (bursas, bainhas sinoviais/fibrosas) — sem vísceras, vasos,
  // nervos ou pele. `extras.type` do glTF só marca 'bone'/'muscle'; o resto
  // (bursas e bainhas, sem type) é reconhecido pelo nome. Ver docs/FASE_4_QUALIDADE.md.
  const REAL_LAYER_BY_SYSTEM = { esqueletico: 3, muscular: 2, articular: 3 };
  const MAX_REAL_LAYER = 3; // camada mais profunda com malha de verdade neste GLB

  function classifyRealMesh(displayName, extrasType) {
    const n = (displayName || "").toLowerCase();
    if (extrasType === "bone") return { systemId: "esqueletico", layer: 3 };
    if (extrasType === "muscle") return { systemId: "muscular", layer: 2 };
    if (/bursa|sheath/.test(n)) return { systemId: "articular", layer: 3 };
    // Não deveria ocorrer no body.glb atual (todas as 826 malhas caem nos
    // casos acima), mas fica um retorno seguro para um GLB futuro diferente.
    return { systemId: null, layer: MAX_REAL_LAYER };
  }

  // Pins / Hotspots de referência anatômica
  let pinsGroup = null;
  let pinsPulseTime = 0;
  let arePinsVisible = true;

  // Sistema de partículas para trajetórias farmacológicas
  let routeCurve = null;
  let routeParticles = null;
  let routeParticlePositions = null;
  let routeParticleProgress = [];
  let isRouteActive = false;
  let activeRouteId = null;
  const ROUTE_PARTICLE_COUNT = 150;

  // Sistema de partículas de trânsito fisiológico
  let physioParticles = null;
  let physioPositions = null;
  let physioVelocities = null;
  let activePhysioAction = null;
  const PHYSIO_PARTICLE_COUNT = 120;

  // Controle de interpolação de câmera (Tween suave)
  let isCameraTweening = false;
  let cameraStartPos = null;
  let cameraEndPos = null;
  let targetStartLook = null;
  let targetEndLook = null;
  let tweenStartTime = 0;
  let tweenDuration = 800;

  // Nível de dissecção atual (1: Pele até 5: Vísceras)
  let currentDissectionLevel = 5;
  const organStates = {};

  // Estado fisiopatológico e simulação de crises clínicas
  let isCrisisActive = false;
  let crisisType = null;
  let cardiacCycleTime = 0;
  let heartRateBpm = 75;
  const originalColors = new Map();

  // Referências aos elementos da interface
  let container = null;
  let loadingOverlay = null;
  let organHud = null;
  let organNameEl = null;

  // Paleta de cores padronizada
  const COLOR_HIGHLIGHT = 0x38bdf8;
  const COLOR_SUCCESS = 0x10b981;
  const COLOR_ERROR = 0xef4444;
  const COLOR_PIN_CORE = 0xffffff;
  const COLOR_PIN_GLOW = 0x00e5ff;
  const DEFAULT_EMISSIVE = 0x000000;

  // -------------------------------------------------------------------------
  // 2. TAXONOMIA DAS 5 CAMADAS DE DISSECÇÃO
  // -------------------------------------------------------------------------
  const DISSECTION_LAYERS = {
    1: { id: "pele", nome: "Pele & Tegumento", keywords: ["*skin*", "*integum*", "*derma*", "*epiderm*", "*pele*"] },
    2: { id: "musculo", nome: "Musculatura & Fáscias", keywords: ["*muscl*", "*tendon*", "*fascia*", "*myo*", "*bicep*", "*pectoral*", "*quadriceps*", "*diafrag*"] },
    3: { id: "esqueleto", nome: "Esqueleto & Articulações", keywords: ["*bone*", "*skelet*", "*cartilage*", "*joint*", "*ligament*", "*skull*", "*spine*", "*femur*", "*rib*", "*pelvis*", "*tibia*"] },
    4: { id: "vasos", nome: "Vasos & Sistema Linfático", keywords: ["*vessel*", "*arter*", "*vein*", "*aort*", "*cava*", "*vascular*", "*lymph*", "*capillar*", "*jugular*"] },
    5: { id: "visceras", nome: "Vísceras & Órgãos", keywords: ["*lung*", "*heart*", "*brain*", "*stomach*", "*liver*", "*kidney*", "*intestin*", "*pancrea*", "*spleen*", "*bladder*", "*ovary*", "*testis*", "*thyroid*", "*adrenal*", "*uterus*"] }
  };

  // Coordenadas espaciais tridimensionais das 18 vias de administração
  const DEFAULT_ROUTE_WAYPOINTS = {
    ORAL: {
      cor: "#f59e0b",
      waypoints: [
        { x: 0.0, y: 1.74, z: 0.12 },
        { x: 0.0, y: 1.54, z: 0.06 },
        { x: -0.06, y: 1.05, z: 0.08 },
        { x: 0.02, y: 0.88, z: 0.07 },
        { x: 0.05, y: 0.98, z: 0.04 },
        { x: 0.09, y: 1.06, z: 0.06 },
        { x: 0.04, y: 1.25, z: 0.08 }
      ]
    },
    SUBLINGUAL: {
      cor: "#f59e0b",
      waypoints: [
        { x: 0.0, y: 1.68, z: 0.08 },
        { x: 0.03, y: 1.66, z: 0.05 },
        { x: 0.08, y: 1.58, z: 0.04 },
        { x: 0.09, y: 1.42, z: 0.04 },
        { x: 0.05, y: 1.30, z: 0.06 }
      ]
    },
    RETAL: {
      cor: "#f59e0b",
      waypoints: [
        { x: 0.0, y: 0.72, z: -0.10 },
        { x: 0.03, y: 0.74, z: -0.07 },
        { x: 0.05, y: 0.82, z: -0.05 },
        { x: 0.04, y: 1.00, z: -0.02 },
        { x: 0.04, y: 1.25, z: 0.06 }
      ]
    },
    INTRAGASTRICA: {
      cor: "#f59e0b",
      waypoints: [
        { x: 0.02, y: 1.76, z: 0.14 },
        { x: 0.01, y: 1.52, z: 0.06 },
        { x: -0.06, y: 1.05, z: 0.08 },
        { x: 0.02, y: 0.88, z: 0.07 },
        { x: 0.04, y: 1.25, z: 0.08 }
      ]
    },
    INTRAVENOSA: {
      cor: "#ef4444",
      waypoints: [
        { x: 0.32, y: 1.12, z: 0.05 },
        { x: 0.22, y: 1.22, z: 0.04 },
        { x: 0.08, y: 1.30, z: 0.05 },
        { x: 0.05, y: 1.25, z: 0.07 },
        { x: 0.0, y: 1.28, z: 0.04 },
        { x: 0.04, y: 1.24, z: 0.08 },
        { x: 0.02, y: 1.35, z: 0.05 }
      ]
    },
    INTRAMUSCULAR: {
      cor: "#a855f7",
      waypoints: [
        { x: 0.38, y: 1.35, z: 0.03 },
        { x: 0.28, y: 1.32, z: 0.04 },
        { x: 0.15, y: 1.30, z: 0.05 },
        { x: 0.05, y: 1.25, z: 0.07 },
        { x: 0.03, y: 1.32, z: 0.06 }
      ]
    },
    SUBCUTANEA: {
      cor: "#a855f7",
      waypoints: [
        { x: 0.08, y: 0.95, z: 0.11 },
        { x: 0.07, y: 0.97, z: 0.09 },
        { x: 0.06, y: 1.08, z: 0.05 },
        { x: 0.04, y: 1.25, z: 0.06 }
      ]
    },
    INTRADERMICA: {
      cor: "#a855f7",
      waypoints: [
        { x: 0.30, y: 1.15, z: 0.10 },
        { x: 0.28, y: 1.16, z: 0.08 },
        { x: 0.20, y: 1.22, z: 0.06 }
      ]
    },
    INTRAARTERIAL: {
      cor: "#ef4444",
      waypoints: [
        { x: 0.02, y: 1.35, z: 0.05 },
        { x: 0.05, y: 1.10, z: 0.04 },
        { x: 0.09, y: 1.05, z: 0.06 }
      ]
    },
    INTRACARDIACA: {
      cor: "#ef4444",
      waypoints: [
        { x: 0.04, y: 1.25, z: 0.15 },
        { x: 0.04, y: 1.25, z: 0.09 },
        { x: 0.02, y: 1.35, z: 0.05 }
      ]
    },
    INTRAOSSEA: {
      cor: "#a855f7",
      waypoints: [
        { x: -0.10, y: 0.60, z: 0.08 },
        { x: -0.08, y: 0.65, z: 0.05 },
        { x: 0.03, y: 0.95, z: 0.04 },
        { x: 0.04, y: 1.25, z: 0.06 }
      ]
    },
    INTRATECAL: {
      cor: "#38bdf8",
      waypoints: [
        { x: 0.0, y: 0.85, z: -0.10 },
        { x: 0.0, y: 1.15, z: -0.06 },
        { x: 0.0, y: 1.50, z: -0.03 },
        { x: 0.0, y: 1.74, z: 0.02 }
      ]
    },
    EPIDURAL: {
      cor: "#38bdf8",
      waypoints: [
        { x: 0.0, y: 0.88, z: -0.11 },
        { x: 0.0, y: 1.10, z: -0.07 },
        { x: 0.0, y: 1.30, z: -0.04 }
      ]
    },
    TOPICA: {
      cor: "#fbbf24",
      waypoints: [
        { x: 0.35, y: 0.95, z: 0.08 },
        { x: 0.33, y: 0.96, z: 0.05 },
        { x: 0.22, y: 1.08, z: 0.04 },
        { x: 0.05, y: 1.25, z: 0.07 }
      ]
    },
    NASAL: {
      cor: "#06b6d4",
      waypoints: [
        { x: 0.0, y: 1.76, z: 0.15 },
        { x: 0.0, y: 1.75, z: 0.10 },
        { x: 0.0, y: 1.78, z: 0.07 },
        { x: 0.0, y: 1.82, z: 0.05 },
        { x: 0.03, y: 1.55, z: 0.04 }
      ]
    },
    PULMONAR_INALATORIA: {
      cor: "#06b6d4",
      waypoints: [
        { x: 0.0, y: 1.72, z: 0.12 },
        { x: 0.01, y: 1.55, z: 0.06 },
        { x: -0.04, y: 1.40, z: 0.03 },
        { x: -0.10, y: 1.35, z: 0.05 },
        { x: 0.04, y: 1.25, z: 0.07 }
      ]
    },
    OCULAR: {
      cor: "#38bdf8",
      waypoints: [
        { x: -0.04, y: 1.78, z: 0.16 },
        { x: -0.035, y: 1.78, z: 0.14 },
        { x: -0.02, y: 1.75, z: 0.12 },
        { x: 0.0, y: 1.70, z: 0.10 }
      ]
    },
    OTOLOGICA: {
      cor: "#e2e8f0",
      waypoints: [
        { x: 0.16, y: 1.76, z: 0.02 },
        { x: 0.13, y: 1.75, z: 0.01 },
        { x: 0.10, y: 1.74, z: 0.00 }
      ]
    },
    VAGINAL: {
      cor: "#fd79a8",
      waypoints: [
        { x: 0.0, y: 0.72, z: 0.02 },
        { x: 0.0, y: 0.76, z: 0.03 },
        { x: 0.03, y: 0.88, z: 0.04 },
        { x: 0.04, y: 1.15, z: 0.05 }
      ]
    }
  };

  // Marcadores de referência anatômica
  const PIN_DEFINITIONS = [
    { id: "pin_brain", organKey: "*brain*", label: "Encéfalo (SNC)", pos: { x: 0, y: 1.76, z: 0.08 }, cam: { x: 0, y: 1.8, z: 1.1 }, look: { x: 0, y: 1.75, z: 0 }, desc: "Centro integrador neuroendócrino e Barreira Hematoencefálica." },
    { id: "pin_heart", organKey: "*heart*", label: "Coração & Miocárdio", pos: { x: 0.045, y: 1.26, z: 0.11 }, cam: { x: 0.15, y: 1.28, z: 1.0 }, look: { x: 0.04, y: 1.25, z: 0 }, desc: "Bomba mecânica quadricameral e receptores adrenérgicos/muscarínicos." },
    { id: "pin_lungs", organKey: "*lung*", label: "Pulmões & Vias Aéreas", pos: { x: -0.11, y: 1.32, z: 0.09 }, cam: { x: -0.2, y: 1.35, z: 1.1 }, look: { x: -0.1, y: 1.3, z: 0 }, desc: "Superfície alveolar de troca gasosa e receptores β2." },
    { id: "pin_stomach", organKey: "*stomach*", label: "Estômago", pos: { x: -0.065, y: 1.05, z: 0.1 }, cam: { x: -0.18, y: 1.08, z: 1.0 }, look: { x: -0.06, y: 1.02, z: 0 }, desc: "Digestão cloridropéptica (pH 1.5-2.0) e bomba H+/K+-ATPase." },
    { id: "pin_liver", organKey: "*liver*", label: "Fígado & Eixo Portal", pos: { x: 0.095, y: 1.06, z: 0.1 }, cam: { x: 0.22, y: 1.1, z: 1.05 }, look: { x: 0.09, y: 1.04, z: 0 }, desc: "Biotransformação pré-sistêmica de 1ª passagem e citocromo P450." },
    { id: "pin_kidneys", organKey: "*kidney*", label: "Rins & Néfrons", pos: { x: 0.12, y: 0.94, z: -0.07 }, cam: { x: 0.25, y: 0.98, z: -0.85 }, look: { x: 0.11, y: 0.93, z: 0 }, desc: "Filtração glomerular e depuração plasmática de fármacos." }
  ];

  // -------------------------------------------------------------------------
  // 3. COMPARADOR DE WILDCARDS (SUPORTE A GLOBS mesh_*)
  // -------------------------------------------------------------------------
  function matchesWildcard(meshName, pattern) {
    if (!meshName || !pattern) return false;
    const cleanPattern = pattern.trim().toLowerCase().replace(/\*/g, ".*");
    const regex = new RegExp(`^${cleanPattern}$`, "i");
    return regex.test(meshName.toLowerCase().trim()) || meshName.toLowerCase().includes(pattern.replace(/\*/g, "").toLowerCase());
  }

  // -------------------------------------------------------------------------
  // 4. INICIALIZAÇÃO DO MOTOR WEBGL & CONSTRUÇÃO NATIVA DO CORPO
  // -------------------------------------------------------------------------
  function init() {
    container = document.getElementById("canvas-3d-container");
    loadingOverlay = document.getElementById("loading-3d-overlay");
    organHud = document.getElementById("organ-hud");
    organNameEl = document.getElementById("organ-name");

    if (!container || typeof THREE === "undefined") {
      console.warn("[ThreeEngine] Contêiner canvas ou Three.js ainda não disponível.");
      return;
    }

    const width = container.clientWidth || 380;
    const height = container.clientHeight || 280;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.25, 3.2);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    if (THREE.sRGBEncoding) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }

    // `insertBefore` (não `replaceChildren`+`appendChild`): o contêiner já
    // tem, no HTML, o overlay de carregamento e o HUD da estrutura
    // selecionada (#loading-3d-overlay, #organ-hud) — substituir todos os
    // filhos os removeria da árvore (as referências em `loadingOverlay`/
    // `organHud`/`organNameEl` continuariam válidas, mas apontando para nós
    // órfãos, nunca visíveis e nunca encontrados por um getElementById
    // depois). O canvas entra como primeiro filho; overlay/HUD (com
    // position:absolute) ficam por cima dele.
    container.insertBefore(renderer.domElement, container.firstChild);

    // Sistema de iluminação tripla
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirFront = new THREE.DirectionalLight(0xffffff, 0.95);
    dirFront.position.set(5, 10, 7);
    scene.add(dirFront);

    const dirBack = new THREE.DirectionalLight(0x38bdf8, 0.5);
    dirBack.position.set(-5, 5, -5);
    scene.add(dirBack);

    // Controles orbitais
    if (typeof THREE.OrbitControls === "function") {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 0.5;
      controls.maxDistance = 5.5;
      controls.target.set(0, 1.1, 0);
    }

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    setupRouteParticleSystem();
    setupPhysioParticleSystem();
    setupPinsGroup();

    // Constrói o corpo anatômico imediatamente: o manequim procedural fica
    // interativo (quiz, dissecção, seleção) sem esperar o GLB real — que só o
    // substitui quando (e se) terminar de carregar. Isso é o que permite o
    // quiz e o layout funcionarem normalmente enquanto o modelo real carrega.
    buildComprehensiveMannequin();

    if (loadingOverlay) {
      loadingOverlay.classList.add("hidden");
    }

    if (location.protocol.startsWith("http")) {
      attemptLoadExternalGLB();
    }

    window.addEventListener("resize", onWindowResize);
    renderer.domElement.addEventListener("click", onSceneClick);
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });

    injectDissectionSliderUI();
    animate();

    console.log("[ThreeEngine] Motor 3D Ativo com Suporte a 14 Sistemas e 18 Vias.");
  }

  // -------------------------------------------------------------------------
  // 5. CONSTRUÇÃO DO MANEQUIM PROCEDURAL (14 SISTEMAS)
  // -------------------------------------------------------------------------
  function buildComprehensiveMannequin() {
    if (bodyModel) {
      scene.remove(bodyModel);
    }

    const group = new THREE.Group();
    group.name = "Comprehensive_Human_Anatomy";

    function addPart(name, geom, color, pos, opt = {}) {
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        transparent: true,
        opacity: opt.opacity !== undefined ? opt.opacity : 1.0,
        wireframe: opt.wireframe || false,
        emissive: opt.emissive || 0x000000,
        roughness: 0.4,
        metalness: 0.1,
        depthWrite: true
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = name;
      mesh.position.set(pos.x, pos.y, pos.z);
      if (opt.rot) {
        mesh.rotation.set(opt.rot.x, opt.rot.y, opt.rot.z);
      }
      group.add(mesh);

      organStates[name] = { visible: true, opacity: opt.opacity !== undefined ? opt.opacity : 1.0 };
      originalColors.set(name, color);
      return mesh;
    }

    // 1. Tegumentar: Pele & Silhueta
    addPart("mesh_skin_trunk", new THREE.CylinderGeometry(0.3, 0.24, 1.15, 16), 0x475569, { x: 0, y: 1.05, z: 0 }, { opacity: 0.25, wireframe: true });
    addPart("mesh_skin_head", new THREE.SphereGeometry(0.2, 16, 16), 0x475569, { x: 0, y: 1.75, z: 0 }, { opacity: 0.2, wireframe: true });

    // 2. Muscular & Fascial
    addPart("mesh_muscle_pectoral", new THREE.CylinderGeometry(0.27, 0.22, 1.05, 16), 0x991b1b, { x: 0, y: 1.05, z: 0 }, { opacity: 0.85 });
    addPart("mesh_fascia_lata", new THREE.CylinderGeometry(0.12, 0.09, 0.8, 12), 0xdbeafe, { x: -0.15, y: 0.45, z: 0 }, { opacity: 0.4 });

    // 3. Esquelético & Articular
    addPart("mesh_skull_bone", new THREE.SphereGeometry(0.18, 16, 16), 0xe2e8f0, { x: 0, y: 1.75, z: 0 }, { opacity: 0.95 });
    addPart("mesh_rib_cage", new THREE.CylinderGeometry(0.24, 0.19, 0.6, 12, 1, true), 0xe2e8f0, { x: 0, y: 1.25, z: 0 }, { opacity: 0.9 });
    addPart("mesh_spine_vertebrae", new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), 0xe2e8f0, { x: 0, y: 1.1, z: -0.12 }, { opacity: 0.95 });
    addPart("mesh_pelvis_bone", new THREE.CylinderGeometry(0.22, 0.18, 0.25, 12), 0xe2e8f0, { x: 0, y: 0.65, z: 0 }, { opacity: 0.95 });
    addPart("mesh_femur_bone", new THREE.CylinderGeometry(0.04, 0.035, 0.75, 8), 0xe2e8f0, { x: 0.15, y: 0.38, z: 0 }, { opacity: 0.95 });

    // 4. Cardiovascular
    addPart("mesh_heart_organ", new THREE.SphereGeometry(0.09, 14, 14), 0xef4444, { x: 0.045, y: 1.26, z: 0.08 }, { emissive: 0x450a0a });
    addPart("mesh_aorta_vessel", new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), 0xdc2626, { x: 0.01, y: 1.15, z: 0.02 }, { emissive: 0x7f1d1d });
    addPart("mesh_vein_cava", new THREE.CylinderGeometry(0.02, 0.02, 0.65, 8), 0x2563eb, { x: 0.05, y: 1.15, z: 0.02 }, { emissive: 0x1e3a8a });

    // 5. Linfático & Imunológico
    addPart("mesh_spleen_organ", new THREE.SphereGeometry(0.06, 12, 12), 0x10b981, { x: 0.12, y: 1.12, z: -0.04 }, { emissive: 0x064e3b });
    addPart("mesh_thymus_organ", new THREE.BoxGeometry(0.05, 0.08, 0.03), 0x34d399, { x: 0, y: 1.40, z: 0.07 });

    // 6. Nervoso & Sentidos
    addPart("mesh_brain_organ", new THREE.SphereGeometry(0.14, 14, 14), 0x38bdf8, { x: 0, y: 1.76, z: 0.02 }, { emissive: 0x075985 });
    addPart("mesh_spinal_cord", new THREE.CylinderGeometry(0.015, 0.015, 0.85, 8), 0x7dd3fc, { x: 0, y: 1.12, z: -0.10 });
    addPart("mesh_eye_orbit", new THREE.SphereGeometry(0.03, 10, 10), 0xf8fafc, { x: -0.05, y: 1.78, z: 0.16 });

    // 7. Respiratório
    addPart("mesh_lung_organ", new THREE.SphereGeometry(0.085, 12, 12), 0x06b6d4, { x: -0.11, y: 1.3, z: 0.05 }, { opacity: 0.8 });
    addPart("mesh_trachea_organ", new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8), 0x22d3ee, { x: 0, y: 1.52, z: 0.05 });

    // 8. Digestório
    addPart("mesh_stomach_organ", new THREE.SphereGeometry(0.11, 14, 14), 0xf97316, { x: -0.065, y: 1.05, z: 0.08 }, { emissive: 0x431407 });
    addPart("mesh_liver_organ", new THREE.BoxGeometry(0.15, 0.1, 0.12), 0x854d0e, { x: 0.095, y: 1.06, z: 0.07 }, { emissive: 0x422006 });
    addPart("mesh_pancreas_organ", new THREE.BoxGeometry(0.12, 0.03, 0.04), 0xfbbf24, { x: -0.02, y: 0.98, z: 0.04 });
    addPart("mesh_intestine_small", new THREE.TorusGeometry(0.1, 0.04, 8, 16), 0xd97706, { x: 0, y: 0.85, z: 0.06 });
    addPart("mesh_colon_organ", new THREE.CylinderGeometry(0.15, 0.15, 0.22, 12, 1, true), 0xb45309, { x: 0, y: 0.85, z: 0.04 });

    // 9. Urinário / Renal
    addPart("mesh_kidney_organ", new THREE.SphereGeometry(0.055, 12, 12), 0xeab308, { x: 0.11, y: 0.94, z: -0.06 }, { emissive: 0x422006 });
    addPart("mesh_bladder_organ", new THREE.SphereGeometry(0.06, 12, 12), 0xfacc15, { x: 0, y: 0.60, z: 0.05 });

    // 10. Endócrino & Reprodutor
    addPart("mesh_thyroid_organ", new THREE.BoxGeometry(0.06, 0.04, 0.02), 0xec4899, { x: 0, y: 1.58, z: 0.07 });
    addPart("mesh_adrenal_organ", new THREE.ConeGeometry(0.025, 0.03, 6), 0xf472b6, { x: 0.11, y: 1.01, z: -0.06 });
    addPart("mesh_prostate_organ", new THREE.SphereGeometry(0.03, 8, 8), 0x6366f1, { x: 0, y: 0.54, z: 0.04 });

    bodyModel = group;
    scene.add(bodyModel);
    setDissectionDepth(currentDissectionLevel);
  }

  /** Indicador não bloqueante: fica visível durante o carregamento do GLB
   * real, mas nunca cobre o canvas nem intercepta cliques — o manequim
   * procedural (já na cena) continua clicável e o quiz pode começar. */
  function showLoadingBadge(texto) {
    if (!container) return;
    if (!loadingBadge) {
      loadingBadge = document.createElement("div");
      loadingBadge.id = "atlasRealModelBadge";
      loadingBadge.setAttribute("role", "status");
      loadingBadge.setAttribute("aria-live", "polite");
      loadingBadge.style.cssText = "position:absolute; top:10px; right:10px; max-width:46%; z-index:40; background:rgba(2,6,23,0.85); border:1px solid #334155; color:#38bdf8; font-size:0.66rem; font-weight:700; padding:4px 8px; border-radius:6px; pointer-events:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
      container.appendChild(loadingBadge);
    }
    loadingBadge.textContent = texto;
    loadingBadge.classList.remove("hidden");
  }

  function hideLoadingBadge() {
    if (loadingBadge) loadingBadge.classList.add("hidden");
  }

  /**
   * Classifica e indexa cada malha do GLB real numa única travessia (usada
   * pelos sistemas/camadas/isolamento depois — nunca refeita por frame).
   * Também escreve em `child.userData.laift` para consulta O(1) no clique.
   */
  function indexRealModel(root) {
    realMeshEntries = [];
    root.traverse((child) => {
      if (!child.isMesh) return;
      const extras = child.userData || {};
      const displayName = extras.name || child.name || "Estrutura";
      const info = classifyRealMesh(displayName, extras.type);
      child.userData.laift = {
        systemId: info.systemId,
        layer: info.layer,
        displayName: displayName,
        description: typeof extras.description === "string" ? extras.description.trim() : "",
        wikiLink: typeof extras.wikiLink === "string" ? extras.wikiLink : "",
        // Material de origem (glTF), preservado para as variantes de
        // opacidade compartilhadas — getMaterialVariant() nunca clona a
        // partir de uma variante já trocada, sempre a partir deste original.
        baseMaterial: child.material
      };
      organStates[child.name] = { visible: true, opacity: 1.0 };
      realMeshEntries.push(child);
    });
  }

  /** Centraliza a câmera e o alvo do OrbitControls na caixa delimitadora do
   * modelo carregado — o manequim procedural já nasce nessas coordenadas,
   * mas o GLB real (outra fonte, outra escala/origem) precisa ser enquadrado. */
  function frameCameraToModel(object3d) {
    if (!camera) return;
    const box = new THREE.Box3().setFromObject(object3d);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fitDistance = (maxDim / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.35;

    if (controls) controls.target.copy(center);
    camera.position.set(center.x, center.y, center.z + fitDistance);
    camera.near = Math.max(0.01, fitDistance / 100);
    camera.far = fitDistance * 100;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.minDistance = fitDistance / 20;
      controls.maxDistance = fitDistance * 4;
      controls.update();
    }
  }

  function attemptLoadExternalGLB() {
    if (typeof THREE.GLTFLoader !== "function") return;
    const loader = new THREE.GLTFLoader();

    // Draco: o body.glb é exportado com KHR_draco_mesh_compression
    // (extensionsRequired) — sem o decodificador o GLTFLoader falha a malha
    // inteira. Decodificador vendorizado (frontend/modulos/anatomia-3d/vendor/
    // draco/, do pacote npm three@0.128.0) — nada de CDN externo.
    if (typeof THREE.DRACOLoader === "function") {
      const dracoLoader = new THREE.DRACOLoader();
      dracoLoader.setDecoderPath("vendor/draco/");
      // Padrão da lib é 4 workers, cada um compilando o próprio módulo wasm
      // (826 malhas comprimidas) — sob CPU disputada (várias sessões de
      // navegador do E2E ao mesmo tempo) isso já produziu falha intermitente
      // na compilação. 2 workers é suficiente para decodificar em segundos e
      // reduz o pico de WebAssembly.instantiate() simultâneos.
      dracoLoader.setWorkerLimit(2);
      loader.setDRACOLoader(dracoLoader);
    } else {
      console.warn("[ThreeEngine] DRACOLoader ausente — GLB comprimido com Draco não vai carregar.");
    }

    showLoadingBadge("Carregando atlas anatômico real…");

    loader.load(
      "models/body.glb",
      (gltf) => {
        if (bodyModel) scene.remove(bodyModel);
        bodyModel = gltf.scene;
        bodyModel.position.set(0, 0, 0);
        usingRealModel = true;

        indexRealModel(bodyModel);
        scene.add(bodyModel);
        frameCameraToModel(bodyModel);
        setDissectionDepth(currentDissectionLevel);
        hideLoadingBadge();

        window.__atlasModelState = { ready: true, real: true, meshCount: realMeshEntries.length, error: null };
        window.dispatchEvent(new CustomEvent("laift:atlas-model-ready", { detail: window.__atlasModelState }));
        console.log(`[ThreeEngine] Modelo GLB real carregado: ${realMeshEntries.length} malhas anatômicas.`);
      },
      (progress) => {
        if (progress && progress.total) {
          showLoadingBadge(`Carregando atlas anatômico real… ${Math.min(99, Math.round((progress.loaded / progress.total) * 100))}%`);
        }
      },
      (err) => {
        hideLoadingBadge();
        usingRealModel = false;
        window.__atlasModelState = { ready: true, real: false, meshCount: 0, error: err && err.message };
        window.dispatchEvent(new CustomEvent("laift:atlas-model-ready", { detail: window.__atlasModelState }));
        console.log("[ThreeEngine] Operando com manequim procedural (GLB real indisponível):", err && err.message);
      }
    );
  }

  // -------------------------------------------------------------------------
  // 6. CONTROLES DE VISIBILIDADE, OPACIDADE E DISSECÇÃO
  // -------------------------------------------------------------------------
  // O GLB real só tem 2 materiais de origem (osso/músculo) para 826 malhas.
  // Em vez de clonar o material de cada malha (826 clones desnecessários),
  // as variantes de opacidade abaixo são compartilhadas por (material
  // original × opacidade) — no máximo umas poucas instâncias no total.
  const materialVariantCache = new Map();
  function getMaterialVariant(baseMaterial, opacity) {
    const key = baseMaterial.uuid + "|" + opacity;
    let variant = materialVariantCache.get(key);
    if (!variant) {
      variant = baseMaterial.clone();
      variant.transparent = opacity < 1.0;
      variant.opacity = opacity;
      variant.depthWrite = opacity > 0.2;
      materialVariantCache.set(key, variant);
    }
    return variant;
  }

  function applyRealMeshOpacity(child, opacity) {
    const laift = child.userData.laift;
    child.material = getMaterialVariant(laift.baseMaterial, opacity);
    child.visible = opacity > 0.005;
    organStates[child.name] = { visible: child.visible, opacity: opacity };
  }

  /** Malhas do manequim procedural continuam usando o matching por
   * wildcard/nome (`mesh_*`) — o GLB real usa `matchesRealMesh` (nome do nó
   * OU nome de exibição do glTF), já que os padrões antigos (`*heart*` etc.)
   * não têm correspondência nos nomes anatômicos reais. */
  function matchesRealMesh(child, key) {
    const laift = child.userData.laift;
    return matchesWildcard(child.name, key) || (laift && matchesWildcard(laift.displayName, key));
  }

  function setOrganVisibility(organKey, isVisible) {
    if (!bodyModel) return;
    if (usingRealModel) {
      realMeshEntries.forEach((child) => {
        if (matchesRealMesh(child, organKey)) {
          child.visible = isVisible;
          organStates[child.name] = Object.assign({}, organStates[child.name], { visible: isVisible });
        }
      });
      return;
    }
    bodyModel.traverse((child) => {
      if (child.isMesh && matchesWildcard(child.name, organKey)) {
        child.visible = isVisible;
        if (!organStates[child.name]) organStates[child.name] = {};
        organStates[child.name].visible = isVisible;
      }
    });
  }

  function setOrganOpacity(organKey, opacityValue) {
    if (!bodyModel) return;
    const alpha = Math.max(0, Math.min(1, parseFloat(opacityValue)));

    if (usingRealModel) {
      realMeshEntries.forEach((child) => {
        if (matchesRealMesh(child, organKey)) applyRealMeshOpacity(child, alpha);
      });
      return;
    }

    bodyModel.traverse((child) => {
      if (child.isMesh && child.material && matchesWildcard(child.name, organKey)) {
        child.material.transparent = alpha < 1.0;
        child.material.opacity = alpha;
        child.material.depthWrite = alpha > 0.2;
        child.visible = alpha > 0.005;

        if (!organStates[child.name]) organStates[child.name] = {};
        organStates[child.name].opacity = alpha;
      }
    });
  }

  function isolateOrgan(organKey) {
    if (!bodyModel) return;

    if (usingRealModel) {
      // Por sistema (esqueletico/muscular/articular) OU por nome — sem malha
      // correspondente, mantém o corpo inteiro visível em vez de esvaziar o
      // viewport (o GLB real não tem vísceras/vasos/pele/nervos p/ isolar).
      const bySystem = realMeshEntries.filter((c) => c.userData.laift.systemId === organKey);
      const matches = bySystem.length ? bySystem : realMeshEntries.filter((c) => matchesRealMesh(c, organKey));
      if (!matches.length) {
        realMeshEntries.forEach((child) => applyRealMeshOpacity(child, 1.0));
        return;
      }
      const matchSet = new Set(matches);
      realMeshEntries.forEach((child) => applyRealMeshOpacity(child, matchSet.has(child) ? 1.0 : 0.06));
      return;
    }

    bodyModel.traverse((child) => {
      if (child.isMesh && child.material) {
        if (matchesWildcard(child.name, organKey)) {
          child.visible = true;
          child.material.transparent = false;
          child.material.opacity = 1.0;
          child.material.depthWrite = true;
        } else {
          child.material.transparent = true;
          child.material.opacity = 0.06;
          child.material.depthWrite = false;
        }
      }
    });
  }

  function resetOrganTree() {
    if (!bodyModel) return;
    if (usingRealModel) {
      realMeshEntries.forEach((child) => applyRealMeshOpacity(child, 1.0));
      setDissectionDepth(currentDissectionLevel);
      return;
    }
    bodyModel.traverse((child) => {
      if (child.isMesh && child.material) {
        child.visible = true;
        child.material.transparent = true;
        child.material.opacity = 1.0;
        child.material.depthWrite = true;
        organStates[child.name] = { visible: true, opacity: 1.0 };
      }
    });
    setDissectionDepth(currentDissectionLevel);
  }

  function setDissectionDepth(depth) {
    currentDissectionLevel = Math.max(1, Math.min(5, parseInt(depth, 10)));
    if (!bodyModel) return;

    if (usingRealModel) {
      // O body.glb só tem malha real nas camadas 2 (músculo) e 3 (osso/
      // articular) — ver REAL_LAYER_BY_SYSTEM. Camadas 4/5 (vasos/vísceras)
      // são fixadas na camada 3: não há malha real mais profunda para
      // mostrar, e assim o viewport nunca fica vazio.
      const effectiveLevel = Math.min(currentDissectionLevel, MAX_REAL_LAYER);
      realMeshEntries.forEach((child) => {
        const layer = child.userData.laift.layer;
        if (layer < effectiveLevel) {
          child.visible = false;
        } else if (layer === effectiveLevel) {
          applyRealMeshOpacity(child, 1.0);
        } else {
          applyRealMeshOpacity(child, effectiveLevel >= MAX_REAL_LAYER ? 1.0 : 0.4);
        }
      });
    } else {
      bodyModel.traverse((child) => {
        if (child.isMesh && child.material) {
          let meshLayer = 5;

          for (let l = 1; l <= 5; l++) {
            if (DISSECTION_LAYERS[l].keywords.some((k) => matchesWildcard(child.name, k))) {
              meshLayer = l;
              break;
            }
          }

          if (meshLayer < currentDissectionLevel) {
            child.visible = false;
          } else if (meshLayer === currentDissectionLevel) {
            child.visible = true;
            child.material.transparent = false;
            child.material.opacity = 1.0;
          } else {
            child.visible = true;
            child.material.transparent = true;
            child.material.opacity = currentDissectionLevel === 5 ? 1.0 : 0.4;
          }
        }
      });
    }

    const badge = document.getElementById("dissectionLevelBadge");
    if (badge && DISSECTION_LAYERS[currentDissectionLevel]) {
      badge.textContent = `Camada ${currentDissectionLevel}/5: ${DISSECTION_LAYERS[currentDissectionLevel].nome}`;
    }
  }

  function selectSystem(systemId) {
    if (typeof ATLAS_DATABASE === "undefined" || !Array.isArray(ATLAS_DATABASE.sistemas)) return;
    const sys = ATLAS_DATABASE.sistemas.find((s) => s.id === systemId);
    if (!sys) return;

    tweenCamera(sys.focoCamera, sys.targetLook);

    if (!bodyModel) return;

    if (usingRealModel) {
      // Só esqueletico/muscular/articular têm malha real (ver comentário no
      // topo do arquivo); os demais sistemas (cardiovascular, nervoso...)
      // não têm estrutura visível neste GLB — o corpo fica inteiro visível
      // em vez de esvaziar o viewport.
      const hasMatch = realMeshEntries.some((c) => c.userData.laift.systemId === systemId);
      realMeshEntries.forEach((child) => {
        const match = !hasMatch || child.userData.laift.systemId === systemId;
        child.visible = match;
        if (match) applyRealMeshOpacity(child, 1.0);
      });
      return;
    }

    bodyModel.traverse((child) => {
      if (child.isMesh && child.material) {
        const match = (sys.meshKeywords || []).some((k) => matchesWildcard(child.name, k));
        child.material.transparent = !match;
        child.material.opacity = match ? 1.0 : 0.08;
      }
    });
  }

  // -------------------------------------------------------------------------
  // 7. PARTICULAS DAS 18 VIAS DE ADMINISTRAÇÃO
  // -------------------------------------------------------------------------
  function setupRouteParticleSystem() {
    const geom = new THREE.BufferGeometry();
    routeParticlePositions = new Float32Array(ROUTE_PARTICLE_COUNT * 3);
    routeParticleProgress = new Float32Array(ROUTE_PARTICLE_COUNT);

    for (let i = 0; i < ROUTE_PARTICLE_COUNT; i++) {
      routeParticlePositions[i * 3 + 1] = -30;
      routeParticleProgress[i] = i / ROUTE_PARTICLE_COUNT;
    }

    geom.setAttribute("position", new THREE.BufferAttribute(routeParticlePositions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 0.038,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending
    });
    routeParticles = new THREE.Points(geom, mat);
    scene.add(routeParticles);
  }

  function simulateAdministrationRoute(routeId) {
    const rId = String(routeId || "ORAL").toUpperCase();
    let waypointsData = null;
    let corFluxo = "#38bdf8";

    if (typeof ATLAS_DATABASE !== "undefined" && ATLAS_DATABASE.viasAdministracao && ATLAS_DATABASE.viasAdministracao[rId]) {
      waypointsData = ATLAS_DATABASE.viasAdministracao[rId].waypoints3D;
      corFluxo = ATLAS_DATABASE.viasAdministracao[rId].corFluxo || corFluxo;
    }

    if (!waypointsData && DEFAULT_ROUTE_WAYPOINTS[rId]) {
      waypointsData = DEFAULT_ROUTE_WAYPOINTS[rId].waypoints;
      corFluxo = DEFAULT_ROUTE_WAYPOINTS[rId].cor;
    }

    if (!waypointsData || waypointsData.length < 2) return;

    activeRouteId = rId;
    isRouteActive = true;

    const vectors = waypointsData.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    routeCurve = new THREE.CatmullRomCurve3(vectors, false, "catmullrom", 0.35);

    routeParticles.material.color.set(corFluxo);
    routeParticles.material.opacity = 0.95;

    const start = waypointsData[0];
    tweenCamera({ x: start.x * 1.5, y: start.y + 0.08, z: start.z + 1.15 }, { x: start.x, y: start.y, z: start.z });
  }

  function updateRouteParticles() {
    if (!isRouteActive || !routeCurve || !routeParticles) return;
    const pos = routeParticlePositions;

    for (let i = 0; i < ROUTE_PARTICLE_COUNT; i++) {
      routeParticleProgress[i] += 0.0035;
      if (routeParticleProgress[i] > 1.0) routeParticleProgress[i] -= 1.0;

      const pt = routeCurve.getPointAt(routeParticleProgress[i]);
      pos[i * 3 + 0] = pt.x + (Math.sin(i * 9) * 0.005);
      pos[i * 3 + 1] = pt.y + (Math.cos(i * 7) * 0.005);
      pos[i * 3 + 2] = pt.z;
    }
    routeParticles.geometry.attributes.position.needsUpdate = true;
  }

  function stopRouteSimulation() {
    isRouteActive = false;
    activeRouteId = null;
    if (routeParticles) routeParticles.material.opacity = 0.0;
  }

  // -------------------------------------------------------------------------
  // 8. PARTICULAS FISIOLÓGICAS
  // -------------------------------------------------------------------------
  function setupPhysioParticleSystem() {
    const geom = new THREE.BufferGeometry();
    physioPositions = new Float32Array(PHYSIO_PARTICLE_COUNT * 3);
    physioVelocities = new Float32Array(PHYSIO_PARTICLE_COUNT * 3);

    for (let i = 0; i < PHYSIO_PARTICLE_COUNT; i++) {
      physioPositions[i * 3 + 1] = -20;
      physioVelocities[i * 3 + 1] = -0.005;
    }

    geom.setAttribute("position", new THREE.BufferAttribute(physioPositions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfacc15,
      size: 0.032,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending
    });
    physioParticles = new THREE.Points(geom, mat);
    scene.add(physioParticles);
  }

  function triggerParticleFlow(actionType) {
    if (!physioParticles) return;
    activePhysioAction = actionType;
    physioParticles.material.opacity = 0.95;

    let baseY = 1.74;
    let colorHex = 0xfacc15;

    if (actionType === "pharynx_transit") { baseY = 1.54; colorHex = 0xfb923c; }
    else if (actionType === "esophagus_wave") { baseY = 1.38; colorHex = 0xf97316; }
    else if (actionType === "stomach_entry") { baseY = 1.05; colorHex = 0x34d399; }
    else if (actionType === "aorta_flow") { baseY = 1.25; colorHex = 0xef4444; }

    physioParticles.material.color.setHex(colorHex);

    const pos = physioPositions;
    for (let i = 0; i < PHYSIO_PARTICLE_COUNT; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 0.05;
      pos[i * 3 + 1] = baseY + (Math.random() - 0.5) * 0.06;
      pos[i * 3 + 2] = 0.08;
    }
    physioParticles.geometry.attributes.position.needsUpdate = true;
  }

  function stopParticles() {
    activePhysioAction = null;
    if (physioParticles) physioParticles.material.opacity = 0.0;
  }

  function updatePhysioParticles() {
    if (!physioParticles || !activePhysioAction) return;
    const pos = physioPositions;

    for (let i = 0; i < PHYSIO_PARTICLE_COUNT; i++) {
      pos[i * 3 + 1] += physioVelocities[i * 3 + 1];
      if (pos[i * 3 + 1] < 0.85) pos[i * 3 + 1] = 1.72;
    }
    physioParticles.geometry.attributes.position.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // 9. PINS & SIMULAÇÃO DE CRISES
  // -------------------------------------------------------------------------
  function setupPinsGroup() {
    pinsGroup = new THREE.Group();

    PIN_DEFINITIONS.forEach((p) => {
      const pinAnchor = new THREE.Group();
      pinAnchor.position.set(p.pos.x, p.pos.y, p.pos.z);

      const core = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 12), new THREE.MeshBasicMaterial({ color: COLOR_PIN_CORE }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), new THREE.MeshBasicMaterial({ color: COLOR_PIN_GLOW, transparent: true, opacity: 0.6, wireframe: true }));

      pinAnchor.add(core);
      pinAnchor.add(halo);
      pinAnchor.userData = { isPin: true, data: p };
      pinsGroup.add(pinAnchor);
    });

    scene.add(pinsGroup);
  }

  function updatePinsPulse() {
    if (!pinsGroup || !arePinsVisible) return;
    pinsPulseTime += 0.04;
    const scale = 1.0 + Math.sin(pinsPulseTime) * 0.25;

    pinsGroup.children.forEach((a) => {
      const halo = a.children[1];
      if (halo) halo.scale.set(scale, scale, scale);
    });
  }

  function togglePinsVisibility(forceState) {
    arePinsVisible = typeof forceState !== "undefined" ? forceState : !arePinsVisible;
    if (pinsGroup) pinsGroup.visible = arePinsVisible;
  }

  function setCrisisMode(active, type = "colinergica") {
    isCrisisActive = !!active;
    crisisType = type;

    if (isCrisisActive) {
      if (type === "colinergica") {
        heartRateBpm = 38;
        triggerParticleFlow("pharynx_transit");
        if (physioParticles) physioParticles.material.color.setHex(0x38bdf8);
      }
    } else {
      heartRateBpm = 75;
      stopParticles();
      if (bodyModel) {
        bodyModel.traverse((child) => {
          if (child.isMesh && matchesWildcard(child.name, "*skin*")) {
            const original = originalColors.get(child.name);
            if (original && child.material && child.material.color) child.material.color.setHex(original);
          }
        });
      }
    }
  }

  function updatePhysiopathologyAnimation() {
    // O GLB real (esqueleto + músculos) não tem coração nem pele — percorrer
    // as 826 malhas a cada frame só para não achar nada seria o "per-frame
    // traversal" que a Fase 4 pede para evitar. Essa animação (pulso cardíaco
    // e cianose de pele na crise) fica só para o manequim procedural.
    if (usingRealModel || !bodyModel) return;

    cardiacCycleTime += (heartRateBpm / 60) * 0.08;
    const pulseScale = 1.0 + Math.sin(cardiacCycleTime) * (isCrisisActive ? 0.03 : 0.06);

    bodyModel.traverse((child) => {
      if (child.isMesh && matchesWildcard(child.name, "*heart*")) {
        child.scale.set(pulseScale, pulseScale, pulseScale);
      }
      if (isCrisisActive && matchesWildcard(child.name, "*skin*")) {
        if (child.material && child.material.color) child.material.color.setHex(0x1e293b);
      }
    });
  }

  // -------------------------------------------------------------------------
  // 10. INTERAÇÃO, CÂMERA & HIGHLIGHT
  // -------------------------------------------------------------------------
  function tweenCamera(targetPos, targetLook, durationMs = 800) {
    if (!camera || !controls) return;
    cameraStartPos = camera.position.clone();
    cameraEndPos = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
    targetStartLook = controls.target.clone();
    targetEndLook = new THREE.Vector3(targetLook.x, targetLook.y, targetLook.z);
    tweenStartTime = performance.now();
    tweenDuration = durationMs;
    isCameraTweening = true;
  }

  function updateCameraTween(now) {
    if (!isCameraTweening) return;
    const progress = Math.min((now - tweenStartTime) / tweenDuration, 1.0);
    const ease = 1 - Math.pow(1 - progress, 3);

    camera.position.lerpVectors(cameraStartPos, cameraEndPos, ease);
    controls.target.lerpVectors(targetStartLook, targetEndLook, ease);
    controls.update();

    if (progress >= 1.0) isCameraTweening = false;
  }

  // Destaque no GLB real: como o material é compartilhado (getMaterialVariant),
  // mudar o emissive dele destacaria TODAS as malhas daquele grupo. Em vez
  // disso troca-se a referência do material por uma única instância
  // compartilhada por cor (no máx. 3: seleção/acerto/erro) e restaura-se o
  // material anterior (o que a malha já tinha) depois do timeout — sem
  // clonar nada por malha.
  const highlightMaterialCache = new Map();
  function getHighlightMaterial(colorHex) {
    let mat = highlightMaterialCache.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.85, roughness: 0.4, metalness: 0.1 });
      highlightMaterialCache.set(colorHex, mat);
    }
    return mat;
  }
  let highlightedRealMesh = null;
  let highlightRestoreTimer = null;
  function highlightRealMesh(mesh, colorHex, durationMs) {
    const laift = mesh.userData.laift;
    if (!laift) return;
    if (highlightedRealMesh && highlightedRealMesh !== mesh) restoreRealHighlight();
    if (highlightedRealMesh !== mesh) {
      laift.preHighlightMaterial = mesh.material;
      highlightedRealMesh = mesh;
    }
    mesh.material = getHighlightMaterial(colorHex);
    clearTimeout(highlightRestoreTimer);
    highlightRestoreTimer = setTimeout(restoreRealHighlight, durationMs);
  }
  function restoreRealHighlight() {
    if (highlightedRealMesh && highlightedRealMesh.userData.laift) {
      const laift = highlightedRealMesh.userData.laift;
      highlightedRealMesh.material = laift.preHighlightMaterial || highlightedRealMesh.material;
      laift.preHighlightMaterial = null;
    }
    highlightedRealMesh = null;
  }
  /** Primeira malha real cujo nome (ou nome de exibição) bate com `key` —
   * varredura linear feita só em resposta a um clique/acerto (nunca por
   * frame), igual ao `bodyModel.traverse` que ela substitui aqui. */
  function findRealMeshByKey(key) {
    for (let i = 0; i < realMeshEntries.length; i++) {
      if (matchesRealMesh(realMeshEntries[i], key)) return realMeshEntries[i];
    }
    return null;
  }

  function highlightOrgan(organKey, colorHex = COLOR_HIGHLIGHT, durationMs = 2500) {
    if (!bodyModel) return false;

    if (usingRealModel) {
      const mesh = findRealMeshByKey(organKey);
      if (!mesh) return false;
      highlightRealMesh(mesh, colorHex, durationMs);
      return true;
    }

    let found = false;
    bodyModel.traverse((child) => {
      if (child.isMesh && matchesWildcard(child.name, organKey)) {
        if (hoveredMesh && hoveredMesh.material && hoveredMesh.material.emissive) {
          hoveredMesh.material.emissive.setHex(DEFAULT_EMISSIVE);
        }
        hoveredMesh = child;
        if (hoveredMesh.material && hoveredMesh.material.emissive) {
          hoveredMesh.material.emissive.setHex(colorHex);
          hoveredMesh.material.emissiveIntensity = 0.85;

          setTimeout(() => {
            if (hoveredMesh && hoveredMesh.material && hoveredMesh.material.emissive) {
              hoveredMesh.material.emissive.setHex(DEFAULT_EMISSIVE);
            }
          }, durationMs);
        }
        found = true;
      }
    });
    return found;
  }

  function flashOrganFeedback(organKey, isCorrect) {
    highlightOrgan(organKey, isCorrect ? COLOR_SUCCESS : COLOR_ERROR, 2000);
  }

  /** Mostra o nome da estrutura clicada e sua descrição (texto puro,
   * `extras.description` do glTF) no HUD — só via `LaiftDom.html`/`setHtml`
   * (o único innerHTML permitido pela CSP dos módulos, ver safe-dom.js). */
  function showRealStructureHud(mesh) {
    if (!organHud || !organNameEl) return;
    const laift = mesh.userData.laift || {};
    const descricao = (laift.description || "").slice(0, 480).trim();
    const link = LaiftDom.safeUrl(laift.wikiLink || "");
    LaiftDom.setHtml(
      organNameEl,
      LaiftDom.html`${laift.displayName || mesh.name}${descricao ? LaiftDom.html`<div style="font-size:0.68rem; color:#94a3b8; font-weight:normal; margin-top:2px; max-height:5.2em; overflow:auto;">${descricao}${laift.description && laift.description.length > 480 ? "…" : ""}</div>` : ""}${link ? LaiftDom.html`<div style="margin-top:2px;"><a href="${link}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8; font-size:0.65rem;">Wikipédia ↗</a></div>` : ""}`
    );
    organHud.classList.remove("hidden");
  }

  function processInteraction(clientX, clientY) {
    if (!container || !camera || !bodyModel) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    if (typeof QuizEngine !== "undefined" && typeof QuizEngine.isQuizActive === "function" && QuizEngine.isQuizActive()) {
      const hits = raycaster.intersectObjects(bodyModel.children, true);
      if (hits.length > 0) {
        QuizEngine.evaluateUserAnswer(hits[0].object.name);
        return;
      }
    }

    if (pinsGroup && arePinsVisible) {
      const pinHits = raycaster.intersectObjects(pinsGroup.children, true);
      if (pinHits.length > 0) {
        let root = pinHits[0].object;
        while (root.parent && root.parent !== pinsGroup) root = root.parent;
        if (root.userData && root.userData.isPin) {
          const p = root.userData.data;
          tweenCamera(p.cam, p.look || p.pos);
          highlightOrgan(p.organKey || p.id);
          if (organHud && organNameEl) {
            LaiftDom.setHtml(organNameEl, LaiftDom.html`<span style="color:#38bdf8;">📍 ${p.label}</span><div style="font-size:0.68rem; color:#94a3b8; font-weight:normal;">${p.desc || ""}</div>`);
            organHud.classList.remove("hidden");
          }
          return;
        }
      }
    }

    const hits = raycaster.intersectObjects(bodyModel.children, true);
    if (hits.length > 0) {
      const obj = hits[0].object;

      if (usingRealModel && obj.userData && obj.userData.laift) {
        highlightRealMesh(obj, COLOR_HIGHLIGHT, 2500);
        showRealStructureHud(obj);
        return;
      }

      if (hoveredMesh && hoveredMesh !== obj && hoveredMesh.material && hoveredMesh.material.emissive) {
        hoveredMesh.material.emissive.setHex(DEFAULT_EMISSIVE);
      }
      hoveredMesh = obj;
      if (hoveredMesh.material && hoveredMesh.material.emissive) {
        hoveredMesh.material.emissive.setHex(COLOR_HIGHLIGHT);
        hoveredMesh.material.emissiveIntensity = 0.6;
      }
      if (organHud && organNameEl) {
        const cleanName = obj.name.replace(/mesh_/g, "").replace(/_/g, " ").replace(/[0-9]/g, "").trim();
        organNameEl.innerText = cleanName.toUpperCase() || "ESTRUTURA SELECIONADA";
        organHud.classList.remove("hidden");
      }
    }
  }

  function onSceneClick(e) { processInteraction(e.clientX, e.clientY); }
  function onTouchStart(e) { if (e.touches && e.touches.length > 0) processInteraction(e.touches[0].clientX, e.touches[0].clientY); }

  function onWindowResize() {
    if (!container || !renderer || !camera) return;
    const width = container.clientWidth || 380;
    const height = container.clientHeight || 280;
    if (width > 0 && height > 0) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
  }

  function injectDissectionSliderUI() {
    if (document.getElementById("dissectionControlWidget")) return;
    const widget = document.createElement("div");
    widget.id = "dissectionControlWidget";
    widget.style.cssText = "position:absolute; bottom:12px; left:12px; background:rgba(2,6,23,0.92); border:1px solid #334155; padding:8px 12px; border-radius:8px; display:flex; flex-direction:column; gap:4px; z-index:30; backdrop-filter:blur(6px);";

    // Marcação constante (sem dado dinâmico).
    LaiftDom.setHtml(widget, LaiftDom.trusted(`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <span id="dissectionLevelBadge" style="font-size:0.7rem; font-weight:700; color:#38bdf8;">Camada 5/5: Vísceras</span>
        <button type="button" id="btnTogglePins" aria-pressed="true" style="background:transparent; border:1px solid #334155; color:#94a3b8; font-size:0.65rem; padding:2px 6px; border-radius:4px; cursor:pointer;" title="Alternar Marcadores">📍 Pins</button>
      </div>
      <input type="range" id="dissectionSlider" aria-label="Camada de dissecção" min="1" max="5" value="5" step="1" style="width:160px; accent-color:#0284c7; cursor:pointer; margin:4px 0;">
      <div style="display:flex; justify-content:space-between; font-size:0.6rem; color:#64748b; font-family:monospace;">
        <span>Pele</span><span>Músculo</span><span>Osso</span><span>Vasos</span><span>Vísceras</span>
      </div>
    `));

    if (container) {
      container.appendChild(widget);
      const slider = widget.querySelector("#dissectionSlider");
      if (slider) slider.addEventListener("input", (e) => setDissectionDepth(e.target.value));

      const btnPins = widget.querySelector("#btnTogglePins");
      if (btnPins) {
        btnPins.addEventListener("click", () => {
          togglePinsVisibility();
          btnPins.style.color = arePinsVisible ? "#38bdf8" : "#64748b";
          btnPins.setAttribute("aria-pressed", arePinsVisible ? "true" : "false");
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 11. LOOP DE RENDERIZAÇÃO
  // -------------------------------------------------------------------------
  function animate(now) {
    requestAnimationFrame(animate);

    updateCameraTween(now);
    updateRouteParticles();
    updatePhysioParticles();
    updatePinsPulse();
    updatePhysiopathologyAnimation();

    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  // -------------------------------------------------------------------------
  // 12. EXPORTAÇÃO GLOBAL DEFINITIVA
  // -------------------------------------------------------------------------
  const ThreeEngineAPI = {
    init: init,
    selectSystem: selectSystem,
    highlightOrgan: highlightOrgan,
    flashOrganFeedback: flashOrganFeedback,
    setOrganVisibility: setOrganVisibility,
    setOrganOpacity: setOrganOpacity,
    isolateOrgan: isolateOrgan,
    resetOrganTree: resetOrganTree,
    simulateAdministrationRoute: simulateAdministrationRoute,
    stopRouteSimulation: stopRouteSimulation,
    setCrisisMode: setCrisisMode,
    setDissectionDepth: setDissectionDepth,
    togglePinsVisibility: togglePinsVisibility,
    triggerParticleFlow: triggerParticleFlow,
    stopParticles: stopParticles,
    tweenCamera: tweenCamera,
    onWindowResize: onWindowResize,
    // Gancho de teste (fase4.e2e.js / atlas.e2e.js): permite esperar o GLB
    // real terminar de carregar e inspecionar o que foi indexado, sem expor
    // o array inteiro de malhas (826 objetos THREE.Mesh).
    isRealModelActive: () => usingRealModel,
    getRealMeshCount: () => realMeshEntries.length,
    // Estatística por sistema (visível/oculto) — só para os testes E2E
    // conferirem um toggle de sistema/camada sem expor as 826 malhas.
    getVisibilityStats: () => {
      const stats = {};
      realMeshEntries.forEach((child) => {
        const sid = (child.userData.laift && child.userData.laift.systemId) || "desconhecido";
        if (!stats[sid]) stats[sid] = { visible: 0, hidden: 0 };
        stats[sid][child.visible ? "visible" : "hidden"]++;
      });
      return stats;
    },
    // Seleciona programaticamente a 1ª malha real de um sistema, exatamente
    // como um clique faria (HUD com nome + descrição) — usado pelos testes
    // E2E para não depender de acertar a geometria certa por raycast.
    debugSelectFirstOfSystem: (systemId) => {
      if (!usingRealModel) return null;
      const mesh = realMeshEntries.find((c) => c.userData.laift.systemId === systemId);
      if (!mesh) return null;
      showRealStructureHud(mesh);
      return mesh.userData.laift.displayName;
    }
  };

  root.ThreeEngine = ThreeEngineAPI;

})(typeof window !== "undefined" ? window : this);

// Inicialização imediata com verificação defensiva
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    if (window.ThreeEngine) {
      window.ThreeEngine.init();
    }
  });
} else {
  if (window.ThreeEngine) {
    window.ThreeEngine.init();
  }
}

/* ========================================================================= */
/* FIM DO ARQUIVO: anatomia-3d/js/three-engine.js                            */
/* ========================================================================= */
