/**
 * xray-clip.js — raio-X e plano de corte (Motor 3D, WP04)
 * ---------------------------------------------------------------------------
 * Gerencia o raio-X (reduz opacidade de pele/músculos) e o plano de corte
 * (clipping plane global do THREE.WebGLRenderer). Subscrito aos eventos de
 * bus e reage às mudanças, sincronizando com o store.
 */

/**
 * Cria e retorna o gerenciador de raio-X e plano de corte.
 * @param {{
 *   bus: { on: Function, emit: Function, EVENTS: Object },
 *   store: { get: Function, set: Function },
 *   renderer: { clippingPlanes: Array },
 *   THREE: { Plane: Function, Vector3: Function },
 *   requestRender: Function
 * }} cfg
 * @returns {{
 *   setXray: Function,
 *   setClip: Function,
 *   setModelBox: Function,
 *   getClipPlane: Function,
 *   getPendingClip: Function,
 *   dispose: Function
 * }}
 */
export function createXrayClip({ bus, store, renderer, THREE, requestRender }) {
  // Estado local para evitar loops infinitos
  let isEmittingXray = false;
  let isEmittingClip = false;

  // Guarda opacidades anteriores para restauração
  let savedLayerOpacities = null;

  // Caixa delimitadora do modelo
  let modelBox = null;

  // Corte pendente agendado antes do carregamento da geometria
  let _pendingClip = null;

  // Plano de corte atual
  let currentClipPlane = null;

  /**
   * Ativa/desativa raio-X reduzindo opacidade de pele e músculos.
   * @param {boolean} enabled
   */
  function setXray(enabled) {
    const currentState = store.get();

    // Idempotente: se já está no estado desejado, não faz nada
    if (currentState.xray === enabled) return;

    // Salva antes de ativar
    if (enabled && !savedLayerOpacities) {
      savedLayerOpacities = {
        pele: currentState.layers.pele,
        musculos: currentState.layers.musculos,
      };

      // Reduz opacidade para efeito de raio-X
      const newLayers = { ...currentState.layers };
      newLayers.pele = { ...newLayers.pele, opacity: 0.15 };
      newLayers.musculos = { ...newLayers.musculos, opacity: 0.25 };

      store.set({ layers: newLayers, xray: enabled });

      // Emite eventos para cada camada modificada
      isEmittingXray = true;
      bus.emit(bus.EVENTS.LAYER_SET, {
        layer: 'pele',
        visible: newLayers.pele.visible,
        opacity: newLayers.pele.opacity,
      });
      bus.emit(bus.EVENTS.LAYER_SET, {
        layer: 'musculos',
        visible: newLayers.musculos.visible,
        opacity: newLayers.musculos.opacity,
      });
      isEmittingXray = false;
    } else if (!enabled && savedLayerOpacities) {
      // Restaura opacidades salvas
      const newLayers = { ...currentState.layers };
      newLayers.pele = { ...newLayers.pele, opacity: savedLayerOpacities.pele.opacity };
      newLayers.musculos = { ...newLayers.musculos, opacity: savedLayerOpacities.musculos.opacity };

      store.set({ layers: newLayers, xray: enabled });

      // Emite eventos para cada camada restaurada
      isEmittingXray = true;
      bus.emit(bus.EVENTS.LAYER_SET, {
        layer: 'pele',
        visible: newLayers.pele.visible,
        opacity: newLayers.pele.opacity,
      });
      bus.emit(bus.EVENTS.LAYER_SET, {
        layer: 'musculos',
        visible: newLayers.musculos.visible,
        opacity: newLayers.musculos.opacity,
      });
      isEmittingXray = false;

      savedLayerOpacities = null;
    }
  }

  /**
   * Define a caixa delimitadora do modelo (para cálculos de plano de corte).
   * Se houver um corte agendado antes da geometria carregar (_pendingClip), aplica-o imediatamente.
   * @param {{ min: [number, number, number], max: [number, number, number] } | null} box
   */
  function setModelBox(box) {
    modelBox = box;
    if (modelBox && _pendingClip) {
      const pending = _pendingClip;
      _pendingClip = null;
      setClip(pending.plane, pending.offset);
    }
  }

  /**
   * Define/limpa o plano de corte global.
   * @param {('sagital'|'coronal'|'transversal'|null)} plane
   * @param {number} offset Deslocamento normalizado
   */
  function setClip(plane, offset = 0) {
    if (!plane) {
      // Limpa o plano de corte e qualquer corte pendente
      currentClipPlane = null;
      _pendingClip = null;
      renderer.clippingPlanes = [];
      store.set({ clip: { plane: null, offset: null } });
      requestRender();
      return;
    }

    // Se o modelo ainda não carregou a geometria, guarda como pendente
    if (!modelBox) {
      _pendingClip = { plane, offset };
      store.set({ clip: { plane, offset } });
      return;
    }

    const { min, max } = modelBox;
    const center = new THREE.Vector3(
      (min[0] + max[0]) / 2,
      (min + max) / 2,
      (min + max) / 2
    );

    const halfExtent = new THREE.Vector3(
      (max[0] - min[0]) / 2,
      (max - min) / 2,
      (max - min) / 2
    );

    // Define normal e posição do plano conforme o eixo
    let normal;
    let coplanarPoint;

    if (plane === 'sagital') {
      // Normal apontando para a parte mantida (negativo em X)
      normal = new THREE.Vector3(-1, 0, 0);
      // Passa pelo centro + offset * halfExtent ao longo de X
      coplanarPoint = new THREE.Vector3(
        center.x + offset * halfExtent.x,
        center.y,
        center.z
      );
    } else if (plane === 'coronal') {
      // Normal apontando para a parte mantida (negativo em Z)
      normal = new THREE.Vector3(0, 0, -1);
      coplanarPoint = new THREE.Vector3(
        center.x,
        center.y,
        center.z + offset * halfExtent.z
      );
    } else if (plane === 'transversal') {
      // Normal apontando para a parte mantida (negativo em Y)
      normal = new THREE.Vector3(0, -1, 0);
      coplanarPoint = new THREE.Vector3(
        center.x,
        center.y + offset * halfExtent.y,
        center.z
      );
    } else {
      console.warn(`[xray-clip] plano desconhecido: ${plane}`);
      return;
    }

    currentClipPlane = new THREE.Plane();
    currentClipPlane.setFromNormalAndCoplanarPoint(normal, coplanarPoint);

    renderer.clippingPlanes = [currentClipPlane];
    store.set({ clip: { plane, offset } });
    requestRender();
  }

  /**
   * Retorna o plano de corte atual ou null.
   * @returns {(Object|null)}
   */
  function getClipPlane() {
    return currentClipPlane;
  }

  /**
   * Retorna o corte pendente ou null.
   * @returns {{ plane: string, offset: number }|null}
   */
  function getPendingClip() {
    return _pendingClip;
  }

  /**
   * Desinscreve dos eventos do bus e limpa estado.
   */
  function dispose() {
    _pendingClip = null;
    offXray();
    offClip();
  }

  // Inscreve-se no evento XRAY_SET do bus
  const offXray = bus.on(bus.EVENTS.XRAY_SET, (payload) => {
    if (isEmittingXray) return; // Evita loop infinito
    setXray(payload.enabled);
  });

  // Inscreve-se no evento CLIP_SET do bus
  const offClip = bus.on(bus.EVENTS.CLIP_SET, (payload) => {
    if (isEmittingClip) return; // Evita loop infinito
    setClip(payload.plane, payload.offset ?? 0);
  });

  return {
    setXray,
    setClip,
    setModelBox,
    getClipPlane,
    getPendingClip,
    dispose,
  };
}
