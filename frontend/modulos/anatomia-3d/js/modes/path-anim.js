/**
 * path-anim.js — animação de trajetórias com interpolação de Catmull-Rom
 * à velocidade constante pelo comprimento de arco.
 *
 * Fornece:
 * - resolvePath(anchors, getBBoxCenter) → [{sid, point, label}]
 * - samplePath(points, t) → ponto interpolado (Catmull-Rom)
 * - createPathAnimator({scene, THREE, addTicker, requestRender, color})
 *   → {play, pause, resume, stepTo, stop, isPlaying}
 */

/**
 * Resolve uma lista de âncoras em pontos [x,y,z] usando o bbox center.
 * Se o bbox center não existir, tenta usar o fallback point da âncora.
 * Se ambos falharem, pula a âncora.
 *
 * @param {Array<{sid: string, label_pt?: string, fallbackPoint?: [number,number,number]}>} anchors
 * @param {(sid: string) => ([number,number,number]|null)} getBBoxCenter
 * @returns {Array<{sid: string, point: [number,number,number], label: string}>}
 */
export function resolvePath(anchors, getBBoxCenter) {
  const resolved = [];
  for (const anchor of anchors) {
    let point = getBBoxCenter(anchor.sid);
    if (!point && anchor.fallbackPoint) {
      point = anchor.fallbackPoint;
    }
    if (point) {
      resolved.push({
        sid: anchor.sid,
        point,
        label: anchor.label_pt || anchor.sid,
      });
    }
  }
  return resolved;
}

/**
 * Interpolação de Catmull-Rom com velocidade constante por comprimento de arco.
 * t em [0, 1], onde 0 é o primeiro ponto e 1 é o último.
 *
 * @param {Array<[number,number,number]>} points
 * @param {number} t
 * @returns {[number,number,number]} ponto interpolado
 */
export function samplePath(points, t) {
  if (points.length < 2) {
    return points[0] || [0, 0, 0];
  }
  if (t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];

  // Calcula comprimento de arco cumulativo
  const arcLengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const dz = points[i][2] - points[i - 1][2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    arcLengths.push(arcLengths[arcLengths.length - 1] + dist);
  }

  const totalLength = arcLengths[arcLengths.length - 1];
  const targetLength = t * totalLength;

  // Localiza o segmento de reta
  let segmentIndex = 0;
  for (let i = 0; i < arcLengths.length - 1; i++) {
    if (arcLengths[i] <= targetLength && targetLength <= arcLengths[i + 1]) {
      segmentIndex = i;
      break;
    }
  }

  // Parâmetro local no segmento (0 a 1)
  const segmentLength = arcLengths[segmentIndex + 1] - arcLengths[segmentIndex];
  const u = segmentLength > 0 ? (targetLength - arcLengths[segmentIndex]) / segmentLength : 0;

  // Pontos de controle para Catmull-Rom
  const p0 = segmentIndex === 0 ? points[0] : points[segmentIndex - 1];
  const p1 = points[segmentIndex];
  const p2 = points[segmentIndex + 1];
  const p3 = segmentIndex + 2 < points.length ? points[segmentIndex + 2] : points[segmentIndex + 1];

  // Catmull-Rom cubic interpolation
  const t0 = 0;
  const t1 = 1;
  const t2 = 2;
  const t3 = 3;

  const v0 = (p2[0] - p0[0]) / 2;
  const v1 = (p3[0] - p1[0]) / 2;
  const x = catmullRomInterpolate(p1[0], p2[0], v0, v1, u);

  const v0y = (p2[1] - p0[1]) / 2;
  const v1y = (p3[1] - p1[1]) / 2;
  const y = catmullRomInterpolate(p1[1], p2[1], v0y, v1y, u);

  const v0z = (p2[2] - p0[2]) / 2;
  const v1z = (p3[2] - p1[2]) / 2;
  const z = catmullRomInterpolate(p1[2], p2[2], v0z, v1z, u);

  return [x, y, z];
}

/**
 * Interpola um valor usando Catmull-Rom cubic.
 * @private
 */
function catmullRomInterpolate(p1, p2, v1, v2, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * p1 - 2 * p2 + v1 + v2) * t3 + (-3 * p1 + 3 * p2 - 2 * v1 - v2) * t2 + v1 * t + p1;
}

/**
 * Cria um animador de trajetória com 24 esferas fluindo ao longo de um caminho.
 *
 * @param {{
 *   scene: Object,
 *   THREE: Object,
 *   addTicker: (callback: () => void) => () => void,
 *   requestRender: () => void,
 *   color?: string|number
 * }} opts
 * @returns {{
 *   play: (points: Array<[number,number,number]>, opts?: {durationMs?: number, loop?: boolean}) => void,
 *   pause: () => void,
 *   resume: () => void,
 *   stepTo: (i: number) => void,
 *   stop: () => void,
 *   isPlaying: () => boolean
 * }}
 */
export function createPathAnimator({ scene, THREE, addTicker, requestRender, color = 0x00ffff }) {
  const NUM_SPHERES = 24;
  const TUBE_RADIUS = 0.05;
  const TUBE_SEGMENTS = 32;
  const SPHERE_RADIUS = 0.15;

  let spheres = [];
  let tubeGroup = null;
  let isPlaying_ = false;
  let isPaused_ = false;
  let currentPath = [];
  let startTime = 0;
  let pauseTime = 0;
  let durationMs = 3000;
  let loop_ = false;
  let removeTickerFn = null;

  // Detecta se prefers-reduced-motion está ativo
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Cria material compartilhado para as esferas
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
  });

  // Cria geometria de esfera compartilhada
  const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, 8, 8);

  function createTube(points) {
    if (tubeGroup) {
      scene.remove(tubeGroup);
    }

    tubeGroup = new THREE.Group();

    // Cria uma curva com os pontos
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));

    // Gera geometria do tubo
    const tubeGeometry = new THREE.TubeGeometry(curve, 20, TUBE_RADIUS, TUBE_SEGMENTS, false);
    const tubeMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
    });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tubeGroup.add(tube);
    scene.add(tubeGroup);
  }

  function createSpheres() {
    // Remove esferas antigas
    for (const sphere of spheres) {
      scene.remove(sphere);
    }
    spheres = [];

    // Cria novas esferas
    for (let i = 0; i < NUM_SPHERES; i++) {
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      scene.add(sphere);
      spheres.push(sphere);
    }
  }

  function updateSpherePositions(t) {
    // t em [0, 1]
    const spacing = 1 / NUM_SPHERES;
    for (let i = 0; i < NUM_SPHERES; i++) {
      const sphereT = (t + i * spacing) % 1;
      const pos = samplePath(currentPath, sphereT);
      spheres[i].position.set(...pos);
    }
    requestRender();
  }

  function cleanup() {
    // Remove esferas
    for (const sphere of spheres) {
      scene.remove(sphere);
      sphere.geometry.dispose();
    }
    spheres = [];

    // Remove tubo
    if (tubeGroup) {
      scene.remove(tubeGroup);
      tubeGroup = null;
    }

    if (removeTickerFn) {
      removeTickerFn();
      removeTickerFn = null;
    }

    requestRender();
  }

  // Devolve se ainda precisa de quadros (contrato de addTicker) — antes não
  // devolvia nada e o renderer parava após o 1º quadro: a via ficava parada.
  function tick() {
    if (!isPlaying_ || isPaused_ || currentPath.length < 2) return false;

    const now = Date.now();
    const elapsed = now - startTime;
    let t = (elapsed % durationMs) / durationMs;

    if (!loop_ && elapsed > durationMs) {
      t = 1;
      isPlaying_ = false;
    }

    if (prefersReducedMotion()) {
      // Modo reduzido: mostra caminho estático
      updateSpherePositions(0);
      return false;
    }
    updateSpherePositions(t);
    return isPlaying_;
  }

  return {
    /**
     * Inicia a animação.
     * @param {Array<[number,number,number]>} points
     * @param {{durationMs?: number, loop?: boolean}} opts
     */
    play(points, opts = {}) {
      durationMs = opts.durationMs ?? 3000;
      loop_ = opts.loop ?? false;

      currentPath = points;
      if (points.length < 2) return;

      isPlaying_ = true;
      isPaused_ = false;
      startTime = Date.now();

      createSpheres();
      createTube(points);

      if (removeTickerFn) {
        removeTickerFn();
      }
      removeTickerFn = addTicker(tick);

      if (prefersReducedMotion()) {
        updateSpherePositions(0);
      }
    },

    /**
     * Pausa a animação.
     */
    pause() {
      if (isPlaying_ && !isPaused_) {
        isPaused_ = true;
        pauseTime = Date.now();
      }
    },

    /**
     * Retoma a animação.
     */
    resume() {
      if (isPlaying_ && isPaused_) {
        isPaused_ = false;
        startTime += Date.now() - pauseTime;
        requestRender();
      }
    },

    /**
     * Move para um índice de esfera específico.
     * @param {number} i
     */
    stepTo(i) {
      if (currentPath.length < 2) return;
      const spacing = 1 / NUM_SPHERES;
      const t = (i * spacing) % 1;
      updateSpherePositions(t);
    },

    /**
     * Para e limpa a animação.
     */
    stop() {
      isPlaying_ = false;
      isPaused_ = false;
      cleanup();
    },

    /**
     * Retorna se está tocando.
     * @returns {boolean}
     */
    isPlaying() {
      return isPlaying_;
    },
  };
}
