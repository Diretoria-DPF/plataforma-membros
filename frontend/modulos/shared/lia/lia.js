/*
 * Lia - montagem do personagem (ADR 0003). API pública: window.Lia.
 * Monta o SVG a partir de LiaArt (árvore de dados) com createElementNS; nunca innerHTML (CSP).
 * Quem chama: a UI do chat e dos módulos. Depende de lia-art.js e lia-states.js.
 * Animações opcionais: window.LiaAnim (lia-anim.js). Sob prefers-reduced-motion, nada roda.
 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var States = typeof window !== 'undefined' ? window.LiaStates : require('./lia-states.js');
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_TAGS = ['defs', 'g', 'path', 'rect', 'circle', 'ellipse', 'use'];
  var HOLD_MS = 2500;
  var SIZE_RANGE = [16, 480];
  var TONES = ['admin'];
  var MOTION_FOR = Object.freeze({ thinking: 'thinkingDots', celebrating: 'heartBurst' });
  var GLOBAL_METHODS = ['setState', 'react', 'think', 'say', 'celebrate', 'setEmotion', 'suspend', 'redeem'];
  var live = []; // instâncias montadas; a última recebe os atalhos globais

  function warn(message, detail) {
    console.warn('[Lia] ' + message, detail === undefined ? '' : detail);
  }

  /** true quando o usuário pede movimento reduzido (ou quando não dá para saber: fica conservador). */
  function reducedMotion() {
    try {
      return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) {
      warn('prefers-reduced-motion indisponível; animações desligadas', err);
      return true;
    }
  }

  /** data-* e aria-label do host, a partir dos atributos resolvidos. Valor null = remover o atributo. */
  function hostAttributes(attrs) {
    return Object.freeze({
      'data-state': attrs.state,
      'data-emotion': attrs.emotion,
      'data-mouth': attrs.mouth,
      'data-arm-left': attrs.armLeft,
      'data-arm-right': attrs.armRight,
      'data-prop': attrs.prop,
      'data-scene': attrs.scene,
      'aria-label': attrs.ariaLabel,
    });
  }

  function applyAttributes(el, map) {
    Object.keys(map).forEach(function (name) {
      var value = map[name];
      if (value === null || value === undefined) el.removeAttribute(name);
      else el.setAttribute(name, String(value));
    });
    return el;
  }

  /** Tamanho em px (inteiro entre 16 e 480) ou null. Valores fora disso são ignorados. */
  function sizeCss(size) {
    if (typeof size !== 'number' || !isFinite(size)) return null;
    var px = Math.round(size);
    return px >= SIZE_RANGE[0] && px <= SIZE_RANGE[1] ? px + 'px' : null;
  }

  function toneAttr(tone) {
    return TONES.indexOf(tone) >= 0 ? tone : null;
  }

  function renderNode(doc, node) {
    if (SVG_TAGS.indexOf(node.tag) < 0) throw new Error('Lia: elemento SVG não permitido: ' + node.tag);
    var el = doc.createElementNS(SVG_NS, node.tag);
    Object.keys(node.attrs).forEach(function (name) { el.setAttribute(name, node.attrs[name]); });
    node.children.forEach(function (child) { el.appendChild(renderNode(doc, child)); });
    return el;
  }

  /**
   * Recorte da cabeça para a bolha fechada (ADR 0003, bolha de 48 px). Medido com o bbox real de
   * #lia-head sob lia.css (padrão: --lia-head-scale .631, --lia-top 52,5, --lia-lock-y 10):
   * x 68,45..131,55 e y 52,50..128,22. Quadrado de 84 unidades centrado na cabeça, com ~4 de margem.
   * Se a geometria de lia.css mudar, meça de novo e atualize esta constante.
   */
  var HEAD_VIEWBOX = '58 48.4 84 84';

  function viewBoxOf(art, opts) {
    return opts.crop === 'head' ? HEAD_VIEWBOX : art.viewBox;
  }

  function buildSvg(doc, art, opts) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    applyAttributes(svg, { class: 'lia-svg', viewBox: viewBoxOf(art, opts), 'aria-hidden': 'true', focusable: 'false' });
    art.tree.forEach(function (node) { svg.appendChild(renderNode(doc, node)); });
    return svg;
  }

  function createHost(doc, opts) {
    var host = doc.createElement('div');
    applyAttributes(host, { class: 'lia', role: 'img' });
    var size = sizeCss(opts.size);
    if (size) host.style.setProperty('--lia-size', size);
    var tone = toneAttr(opts.tone);
    if (tone) host.setAttribute('data-tone', tone);
    if (opts.crop === 'head') host.setAttribute('data-crop', 'head');
    return host;
  }

  /** Snapshot imutável: contexto normalizado, overrides recebidos e atributos resolvidos. */
  function snapshotOf(context, overrides) {
    var over = overrides && typeof overrides === 'object' ? overrides : {};
    var attrs = States.resolve(context, over);
    return Object.freeze({ context: attrs.context, overrides: Object.freeze(Object.assign({}, over)), attrs: attrs });
  }

  function motionFor(context) {
    return Object.prototype.hasOwnProperty.call(MOTION_FOR, context) ? MOTION_FOR[context] : null;
  }

  function stopOne(stop) {
    if (!stop) return;
    try { stop(); } catch (err) { warn('parada de animação falhou', err); }
  }

  /**
   * Animações opcionais (LiaAnim). Todas recebem o host e o documento dele: o olhar precisa do
   * documento para ouvir o mousemove. Loops devolvem função de parada; pontuais devolvem Promise.
   */
  function createMotion(host) {
    var doc = host.ownerDocument;
    var loops = [];
    var transient = null; // { stop } da animação em curso
    var sceneStop = null; // parada da cena das ondas 2-4 (a pose final dura até o próximo estado)
    var alive = true;
    function call(name) {
      var anim = root.LiaAnim;
      if (reducedMotion() || !anim || typeof anim[name] !== 'function') return null;
      try {
        return anim[name](host, doc);
      } catch (err) {
        warn('animação ' + name + ' falhou', err);
        return null;
      }
    }
    /** Inicia uma animação e guarda a parada (loop) ou a Promise (pontual), sem perdê-la. */
    function startTransient(name) {
      var slot = { stop: null };
      var result = call(name);
      if (typeof result === 'function') {
        slot.stop = result;
      } else if (result && typeof result.then === 'function') {
        var release = function () {
          // Roda depois da Promise: se a Lia foi destruída ou outra animação tomou o lugar, não mexe em nada.
          if (alive && transient === slot) transient = null;
        };
        result.then(release, release);
      }
      return slot;
    }
    return {
      startLoops: function () {
        loops = [call('startBlinkLoop'), call('startEyeTracking')].filter(function (stop) { return typeof stop === 'function'; });
      },
      play: function (name) {
        stopOne(transient && transient.stop);
        transient = startTransient(name);
      },
      /** Cena de lia-scenes.js (WAAPI + passos). Ela decide sozinha o movimento reduzido: termina na pose final. */
      scene: function (name, env) {
        stopOne(sceneStop);
        sceneStop = null;
        var scenes = root.LiaScenes;
        if (!alive || !scenes || typeof scenes.play !== 'function') return false;
        try {
          var handle = scenes.play(name, env);
          sceneStop = handle ? handle.stop : null;
          return !!handle;
        } catch (err) {
          warn('cena ' + name + ' falhou', err);
          return false;
        }
      },
      stopTransient: function () {
        stopOne(transient && transient.stop);
        transient = null;
        stopOne(sceneStop);
        sceneStop = null;
      },
      destroy: function () {
        alive = false;
        loops.forEach(stopOne);
        loops = [];
        stopOne(transient && transient.stop);
        transient = null;
        stopOne(sceneStop);
        sceneStop = null;
        var anim = root.LiaAnim;
        if (anim && typeof anim.destroy === 'function') {
          try { anim.destroy(host); } catch (err) { warn('cancelamento de animações falhou', err); }
        }
      },
    };
  }

  /**
   * Peças extras (LiaProps, sob demanda) e cena (LiaScenes) do contexto, ondas 2-4. A Lia de recorte (bolha de 48 px)
   * nunca as recebe. Sem LiaProps/LiaScenes, ou com a arte ainda carregando, a Lia base segue como está.
   * O atributo data-extras do host lista as peças que estão na tela: é o gancho do lia.css (costas, braços cruzados).
   */
  function createStage(host, svg, cropped, motion) {
    var set = null;
    function reflect() {
      var names = set ? set.names() : [];
      if (names.length) host.setAttribute('data-extras', names.join(' '));
      else host.removeAttribute('data-extras');
    }
    var stage = {
      cropped: cropped,
      propsReady: function () { return !cropped && !!root.LiaProps && root.LiaProps.ready(); },
      canPlay: function (plan) { return !cropped && !!root.LiaScenes && (!plan.sceneExtras.length || stage.propsReady()); },
      sync: function (wanted) {
        if (!set) set = root.LiaProps.createSet(svg, host.ownerDocument);
        set.remove(set.names().filter(function (name) { return wanted.indexOf(name) < 0; }));
        set.add(wanted);
        reflect();
      },
      remove: function (names) {
        if (set) set.remove(names);
        reflect();
      },
      clear: function () {
        if (set) set.clear();
        reflect();
      },
      play: function (plan, reduced) {
        if (cropped || !plan.scene) return false;
        return motion.scene(plan.scene, { host: host, svg: svg, reduced: reduced, detach: function (names) { stage.remove(names); } });
      },
    };
    return stage;
  }

  /** Núcleo de uma instância: guarda o snapshot atual e aplica cada mudança como um objeto novo. */
  function createCore(host, svg, cropped) {
    var motion = createMotion(host);
    var stage = createStage(host, svg, cropped, motion);
    var core = { current: null, version: 0, holdTimer: null, destroyed: false, motion: motion, stage: stage };
    core.clearHold = function () {
      if (core.holdTimer !== null) root.clearTimeout(core.holdTimer);
      core.holdTimer = null;
    };
    /** Mostra as peças do plano e toca a cena. O aria-label já é o do contexto (um por estado). */
    function showPlan(plan, wanted, reduced) {
      stage.sync(wanted);
      return stage.play(plan, reduced);
    }
    /** Peças e cena do contexto atual. Devolve true se uma cena começou agora. */
    function stageContext(plan) {
      if (cropped) return false;
      var reduced = reducedMotion();
      var wanted = plan.extras.concat(reduced ? [] : plan.sceneExtras);
      if (!wanted.length) {
        stage.clear();
        return stage.play(plan, reduced);
      }
      if (!root.LiaProps) {
        stage.clear();
        return false;
      }
      if (stage.propsReady()) return showPlan(plan, wanted, reduced);
      stage.clear(); // até a arte chegar, vale a Lia base
      if (plan.late) loadThen(plan, wanted, reduced, core.version);
      return false;
    }
    function loadThen(plan, wanted, reduced, version) {
      root.LiaProps.load(host.ownerDocument).then(function () {
        if (core.destroyed || core.version !== version || !stage.propsReady()) return;
        showPlan(plan, wanted, reduced);
      });
    }
    core.commit = function (context, overrides) {
      if (core.destroyed) return false;
      core.version += 1;
      core.clearHold();
      core.current = snapshotOf(context, overrides);
      applyAttributes(host, hostAttributes(core.current.attrs));
      motion.stopTransient();
      var name = motionFor(core.current.context);
      if (name) motion.play(name);
      return stageContext(States.planFor(core.current.context));
    };
    core.destroy = function () {
      core.destroyed = true;
      core.clearHold();
      motion.destroy();
      if (host.parentNode) host.parentNode.removeChild(host);
    };
    return core;
  }

  /** Volta ao idle depois de HOLD_MS, a menos que outra mudança de estado tenha ocorrido. */
  function holdThenIdle(core) {
    var mine = core.version;
    core.holdTimer = root.setTimeout(function () {
      core.holdTimer = null;
      if (mine === core.version) core.commit('idle');
    }, HOLD_MS);
  }

  /**
   * Redenção aceita (cena 6): de costas -> gira -> de frente, sorri e ganha corações. Sem arte das costas ou
   * sem cenas, o que valia antes: acena. Com movimento reduzido, a pose final parada.
   */
  function redeemOf(core) {
    var reduced = reducedMotion();
    var scene = !reduced && core.stage.canPlay(States.planFor('redeem'));
    core.commit('redeem', scene || reduced ? {} : { armRight: 'wave' });
    if (!scene && !reduced && !core.destroyed) core.motion.play('wave');
  }

  function createInstance(host, svg, cropped, onDestroy) {
    var core = createCore(host, svg, cropped);
    var instance = {
      element: host,
      setState: function (context, overrides) { core.commit(context, overrides); return instance; },
      react: function (modulo) { core.commit(States.isModule(modulo) ? modulo : 'idle'); return instance; },
      think: function () { core.commit('thinking'); return instance; },
      say: function () { core.commit('speaking'); return instance; }, // o texto fica por conta da UI do chat
      celebrate: function () {
        core.commit('celebrating');
        if (!core.destroyed) holdThenIdle(core);
        return instance;
      },
      setEmotion: function (emotion) {
        if (States.ALLOWED.emotion.indexOf(emotion) < 0) return instance; // emoção desconhecida: nada muda
        core.commit(core.current.context, Object.assign({}, core.current.overrides, { emotion: emotion }));
        return instance;
      },
      suspend: function () { core.commit('suspended'); return instance; },
      redeem: function () { redeemOf(core); return instance; },
      destroy: function () {
        if (core.destroyed) return;
        core.destroy();
        onDestroy(instance);
      },
    };
    core.motion.startLoops();
    core.commit('idle');
    return instance;
  }

  function forget(instance) {
    live = live.filter(function (item) { return item !== instance; });
  }

  /** Monta a Lia dentro de `target` (elemento ou seletor). Devolve a instância, ou null se não der. */
  function mount(target, options) {
    var doc = root.document;
    var art = root.LiaArt;
    var parent = typeof target === 'string' && doc ? doc.querySelector(target) : target;
    if (!States || !art || !doc || !parent || typeof parent.appendChild !== 'function') {
      warn('Lia não montada: arte, estados ou alvo ausente');
      return null;
    }
    var opts = options && typeof options === 'object' ? options : {};
    var host = createHost(doc, opts);
    var svg = buildSvg(doc, art, opts);
    host.appendChild(svg);
    parent.appendChild(host);
    var instance = createInstance(host, svg, opts.crop === 'head', forget);
    live = live.concat([instance]);
    return instance;
  }

  var api = {
    mount: mount,
    hostAttributes: hostAttributes,
    sizeCss: sizeCss,
    toneAttr: toneAttr,
    reducedMotion: reducedMotion,
  };
  GLOBAL_METHODS.forEach(function (name) {
    api[name] = function () {
      var target = live.length ? live[live.length - 1] : null;
      return target ? target[name].apply(target, arguments) : null;
    };
  });

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Lia = api;
})();
