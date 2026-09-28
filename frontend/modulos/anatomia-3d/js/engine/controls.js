/**
 * controls.js — Controles de câmera com OrbitControls + gestos + teclado
 * ---------------------------------------------------------------------------
 * Combina OrbitControls (arraste de mouse, zoom), gestos de toque (tap,
 * double-tap, long-press) e atalhos de teclado (presets, setas, +/-).
 * Injetar OrbitControls e THREE para testabilidade.
 */

import { createGestureRecognizer, attachGestures } from './gestures.js';
import { VIEW_PRESETS, clampDistance } from './camera-math.js';

/**
 * Converte coordenadas de cliente para NDC (normalized device coordinates).
 * NDC: x em [-1, 1] (esquerda/direita), y em [-1, 1] (cima/baixo).
 * @param {number} clientX
 * @param {number} clientY
 * @param {DOMRect} rect - de domElement.getBoundingClientRect()
 * @returns {{x: number, y: number}}
 */
export function toNdc(clientX, clientY, rect) {
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return { x, y };
}

/**
 * Rotação orbital pura: move a câmera ao redor do alvo num sistema esférico.
 * Preserva a distância, clampa o ângulo polar, rotaciona azimute e polar.
 * @param {number[]} position - [x, y, z] da câmera
 * @param {number[]} target - [x, y, z] do alvo
 * @param {number} dAzimuth - radianos, rotação em Y (mundo)
 * @param {number} dPolar - radianos, mudança do ângulo polar
 * @returns {number[]} nova posição
 */
export function orbitStep(position, target, dAzimuth, dPolar) {
  // Vetor câmera→alvo
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];

  // Distância preservada
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Coordenadas esféricas
  let azimuth = Math.atan2(dx, dz);
  let polar = Math.acos(dy / distance);

  // Aplica deltas
  azimuth += dAzimuth;
  polar += dPolar;

  // Clamp polar em [0.05, π-0.05]
  polar = Math.max(0.05, Math.min(Math.PI - 0.05, polar));

  // Volta para cartesiana
  const sinPolar = Math.sin(polar);
  const newX = target[0] + distance * sinPolar * Math.sin(azimuth);
  const newY = target[1] + distance * Math.cos(polar);
  const newZ = target[2] + distance * sinPolar * Math.cos(azimuth);

  return [newX, newY, newZ];
}

/**
 * Cria um controlador de câmera com OrbitControls + gestos + teclado.
 * @param {Object} opts
 * @param {THREE.PerspectiveCamera} opts.camera
 * @param {HTMLElement} opts.domElement
 * @param {Object} opts.bus - barramento de eventos (on, emit, EVENTS)
 * @param {Function} opts.requestRender
 * @param {Function} opts.OrbitControls - construtor injetado
 * @param {Object} opts.THREE - namespace THREE injetado
 * @returns {Object} { controls, target, setModelRadius, setPickHandler, setContextMenuHandler, update, dispose }
 */
export function createControls({
  camera,
  domElement,
  bus,
  requestRender,
  OrbitControls,
  THREE,
}) {
  // Garante foco no teclado
  if (domElement.tabIndex < 0) {
    domElement.tabIndex = 0;
  }

  // ========== OrbitControls ==========
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.screenSpacePanning = true;
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 0.9;

  controls.addEventListener('change', requestRender);

  // ========== Estado ==========
  let modelRadius = 1;
  let pickHandler = () => {};
  let contextMenuHandler = () => {};
  let gestureDetach = null;

  // ========== Gestos ==========
  const recognizer = createGestureRecognizer({
    onTap: (pos) => {
      const rect = domElement.getBoundingClientRect();
      const ndc = toNdc(pos.x, pos.y, rect);
      pickHandler({ ndc, client: { x: pos.x, y: pos.y }, kind: 'tap' });
    },
    onDoubleTap: (pos) => {
      const rect = domElement.getBoundingClientRect();
      const ndc = toNdc(pos.x, pos.y, rect);
      pickHandler({ ndc, client: { x: pos.x, y: pos.y }, kind: 'focus' });
    },
    onLongPress: (pos) => {
      const rect = domElement.getBoundingClientRect();
      const ndc = toNdc(pos.x, pos.y, rect);
      contextMenuHandler({ client: { x: pos.x, y: pos.y }, ndc });
    },
  });

  gestureDetach = attachGestures(domElement, recognizer);

  // ========== Teclado ==========
  function handleKeyDown(event) {
    // Ignora se há modifiers
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const key = event.key;

    // Presets '1'-'6'
    const presetMap = {
      '1': 'anterior',
      '2': 'posterior',
      '3': 'esquerda',
      '4': 'direita',
      '5': 'superior',
      '6': 'inferior',
    };

    if (presetMap[key]) {
      bus.emit(bus.EVENTS.VIEW_PRESET, { name: presetMap[key] });
      return;
    }

    // Reset '0'
    if (key === '0') {
      bus.emit(bus.EVENTS.VIEW_RESET, {});
      return;
    }

    // Dolly +/= e -
    if (key === '+' || key === '=') {
      const dir = camera.position.clone().sub(controls.target);
      const newDist = dir.length() * 0.9; // Dolly in 10%
      const clampedDist = clampDistance(newDist, modelRadius);
      dir.normalize().multiplyScalar(clampedDist);
      camera.position.copy(controls.target).add(dir);
      controls.update();
      requestRender();
      return;
    }

    if (key === '-') {
      const dir = camera.position.clone().sub(controls.target);
      const newDist = dir.length() * (1 / 0.9); // Dolly out 10%
      const clampedDist = clampDistance(newDist, modelRadius);
      dir.normalize().multiplyScalar(clampedDist);
      camera.position.copy(controls.target).add(dir);
      controls.update();
      requestRender();
      return;
    }

    // Setas: rotação 10°
    const rotStep = (10 * Math.PI) / 180;

    if (key === 'ArrowLeft') {
      // Rotação em Y (esquerda)
      const newPos = orbitStep(
        camera.position.toArray(),
        controls.target.toArray(),
        rotStep,
        0
      );
      camera.position.fromArray(newPos);
      controls.update();
      requestRender();
      return;
    }

    if (key === 'ArrowRight') {
      // Rotação em Y (direita)
      const newPos = orbitStep(
        camera.position.toArray(),
        controls.target.toArray(),
        -rotStep,
        0
      );
      camera.position.fromArray(newPos);
      controls.update();
      requestRender();
      return;
    }

    if (key === 'ArrowUp') {
      // Rotação polar (cima)
      const newPos = orbitStep(
        camera.position.toArray(),
        controls.target.toArray(),
        0,
        -rotStep
      );
      camera.position.fromArray(newPos);
      controls.update();
      requestRender();
      return;
    }

    if (key === 'ArrowDown') {
      // Rotação polar (baixo)
      const newPos = orbitStep(
        camera.position.toArray(),
        controls.target.toArray(),
        0,
        rotStep
      );
      camera.position.fromArray(newPos);
      controls.update();
      requestRender();
      return;
    }
  }

  domElement.addEventListener('keydown', handleKeyDown);

  // ========== Interface pública ==========
  return {
    // OrbitControls e target
    controls,
    get target() {
      return controls.target;
    },

    // Define o raio do modelo para calcular min/max distance
    setModelRadius(r) {
      modelRadius = r;
      controls.minDistance = r * 0.25;
      controls.maxDistance = r * 6;
    },

    // Handlers para gestos
    setPickHandler(fn) {
      pickHandler = fn;
    },

    setContextMenuHandler(fn) {
      contextMenuHandler = fn;
    },

    // Atualiza damping
    update() {
      return controls.update();
    },

    // Limpa tudo
    dispose() {
      controls.removeEventListener('change', requestRender);
      domElement.removeEventListener('keydown', handleKeyDown);
      if (gestureDetach) gestureDetach();
      recognizer.dispose();
      controls.dispose();
    },
  };
}
