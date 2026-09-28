/**
 * camera-math.js — Funções puras de matemática para a câmera 3D do Atlas
 * Exporta funções e constantes para posicionamento, interpolação e cálculo
 * de viewport sem nenhuma dependência de DOM ou three.js.
 */

// Presets de visualização: direção unitária [x,y,z] apontando FROM target TO camera
const VIEW_PRESETS = Object.freeze({
  anterior: [0, 0, 1],
  posterior: [0, 0, -1],
  esquerda: [1, 0, 0],      // Lado esquerdo do paciente (visto do lado esquerdo)
  direita: [-1, 0, 0],
  superior: [0, 1, 0.0001],
  inferior: [0, -1, 0.0001],
  default: (() => {
    // Normaliza [0.35, 0.15, 1]
    const v = [0.35, 0.15, 1];
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return [v[0]/len, v[1]/len, v[2]/len];
  })()
});

/**
 * Calcula a distância da câmera para que uma esfera de radius caiba
 * tanto no FOV vertical quanto no FOV horizontal, com margem.
 * FOV horizontal = 2*atan(tan(vfov/2)*aspect)
 * Resultado: radius*margin / sin(minFov/2)
 */
function fitDistance(radius, fovDeg, aspect, margin = 1.15) {
  const vfovRad = fovDeg * Math.PI / 180;
  const hfovRad = 2 * Math.atan(Math.tan(vfovRad / 2) * aspect);
  const minFov = Math.min(vfovRad, hfovRad);
  return (radius * margin) / Math.sin(minFov / 2);
}

/**
 * Retorna {position:[x,y,z], target:[x,y,z]} para um preset de câmera.
 * position = center + dir * fitDistance(...)
 * Nomes inválidos caem para 'default'.
 */
function presetPose(name, center, radius, fovDeg, aspect) {
  const dir = VIEW_PRESETS[name] || VIEW_PRESETS.default;
  const dist = fitDistance(radius, fovDeg, aspect);
  return {
    position: [
      center[0] + dir[0] * dist,
      center[1] + dir[1] * dist,
      center[2] + dir[2] * dist
    ],
    target: [center[0], center[1], center[2]]
  };
}

/**
 * Easing In-Out-Cubic padrão, com t clamped em [0,1].
 * Formula: t < 0.5 ? 4*t^3 : 1 - (-2*t + 2)^3/2
 */
function easeInOutCubic(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/**
 * Interpolação linear entre duas poses.
 * Interpola position e target componente a componente.
 */
function lerpPose(a, b, t) {
  return {
    position: [
      a.position[0] + (b.position[0] - a.position[0]) * t,
      a.position[1] + (b.position[1] - a.position[1]) * t,
      a.position[2] + (b.position[2] - a.position[2]) * t
    ],
    target: [
      a.target[0] + (b.target[0] - a.target[0]) * t,
      a.target[1] + (b.target[1] - a.target[1]) * t,
      a.target[2] + (b.target[2] - a.target[2]) * t
    ]
  };
}

/**
 * Calcula o retângulo {x, y, width, height} do canvas NÃO coberto por sheet.
 * viewport: {width, height}
 * sheet: {state:'peek'|'half'|'full', heightPx, side:'bottom'|'right'|'none', widthPx}
 */
function freeRect(viewport, sheet) {
  let rect;
  if (sheet.side === 'bottom') {
    rect = {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height - sheet.heightPx
    };
  } else if (sheet.side === 'right') {
    rect = {
      x: 0,
      y: 0,
      width: viewport.width - sheet.widthPx,
      height: viewport.height
    };
  } else {
    // side === 'none'
    rect = {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height
    };
  }
  // Garante que width e height são >= 1
  rect.width = Math.max(1, rect.width);
  rect.height = Math.max(1, rect.height);
  return rect;
}

/**
 * Retorna argumentos para camera.setViewOffset() de forma que o centro
 * da cena apareça no centro do rect, mantendo o tamanho do canvas.
 * Formula: fullWidth = viewport.width, fullHeight = viewport.height
 *          x = (viewport.width/2) - (rect.x + rect.width/2)
 *          y = (viewport.height/2) - (rect.y + rect.height/2)
 * Retorna null se rect === viewport (sem view offset).
 */
function viewOffsetFor(viewport, rect) {
  // Se rect cobre o viewport inteiro, retorna null
  if (rect.x === 0 && rect.y === 0 &&
      rect.width === viewport.width && rect.height === viewport.height) {
    return null;
  }

  const x = (viewport.width / 2) - (rect.x + rect.width / 2);
  const y = (viewport.height / 2) - (rect.y + rect.height / 2);

  return {
    fullWidth: viewport.width,
    fullHeight: viewport.height,
    x,
    y,
    width: viewport.width,
    height: viewport.height
  };
}

/**
 * Clamp da distância da câmera em [radius*0.25, radius*6]
 */
function clampDistance(d, radius) {
  const min = radius * 0.25;
  const max = radius * 6;
  return Math.max(min, Math.min(max, d));
}

export {
  VIEW_PRESETS,
  fitDistance,
  presetPose,
  easeInOutCubic,
  lerpPose,
  freeRect,
  viewOffsetFor,
  clampDistance
};
