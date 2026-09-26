/**
 * quality.js — lógica adaptativa de qualidade gráfica para visualizador 3D mobile-first
 *
 * Detecta tier de qualidade baseado em características do dispositivo,
 * monitora frame times para downgrade automático, e fornece limites
 * de renderização por tier.
 */

/**
 * Configurações de qualidade por tier.
 * Congelado para imutabilidade em tempo de execução.
 * @type {Object}
 */
const TIERS = Object.freeze({
  low: {
    antialias: false,
    maxPixelRatio: 1,
    triangleBudget: 600000,
    lod: 'lod1',
    shadows: false,
  },
  medium: {
    antialias: true,
    maxPixelRatio: 1.5,
    triangleBudget: 1500000,
    lod: 'lod1',
    shadows: false,
  },
  high: {
    antialias: true,
    maxPixelRatio: 2,
    triangleBudget: 4000000,
    lod: 'lod0',
    shadows: false,
  },
});

/**
 * Detecta o tier de qualidade apropriado baseado no ambiente do dispositivo.
 *
 * @param {Object} env - características do dispositivo
 * @param {number} [env.dpr] - razão de pixels do dispositivo
 * @param {number} [env.cores] - quantidade de núcleos de CPU
 * @param {number} [env.memoryGB] - memória RAM em gigabytes
 * @param {number} [env.width] - largura da viewport em pixels
 * @param {number} [env.height] - altura da viewport em pixels
 * @param {boolean} [env.isTouch] - true se é dispositivo touchscreen
 * @returns {string} 'high', 'medium' ou 'low'
 */
function detectTier(env = {}) {
  const { dpr, cores, memoryGB, width, height, isTouch } = env;

  // Tier alto: desktop com bom hardware
  const isHigh =
    !isTouch &&
    cores >= 8 &&
    (memoryGB ?? 8) >= 8 &&
    Math.min(width, height) >= 700;
  if (isHigh) return 'high';

  // Tier baixo: dispositivo fraco
  const isLow =
    (memoryGB !== undefined && memoryGB <= 3) ||
    (cores !== undefined && cores <= 4) ||
    (isTouch && dpr >= 3 && cores !== undefined && cores <= 6);
  if (isLow) return 'low';

  // Padrão: tier médio
  return 'medium';
}

/**
 * Calcula a razão de pixel efetiva para um tier, respeitando limites.
 *
 * @param {string} tier - 'high', 'medium' ou 'low'
 * @param {number} [dpr=1] - razão de pixel do dispositivo
 * @param {boolean} [isTouch=false] - true se é dispositivo touchscreen
 * @returns {number} razão de pixel capped
 */
function pixelRatioFor(tier, dpr, isTouch) {
  const deviceDpr = dpr || 1;
  const touchLimit = isTouch ? 1.5 : 2;
  return Math.min(deviceDpr, TIERS[tier].maxPixelRatio, touchLimit);
}

/**
 * Cria um monitor de frame time que dispara downgrade se frames estão lentos.
 *
 * @param {Object} opts - opções
 * @param {Function} opts.onDowngrade - callback chamado quando downgrade é acionado
 * @param {number} [opts.windowMs=2000] - janela de coleta de amostras em ms
 * @param {number} [opts.thresholdMs=33] - limiar de mediana de frame time em ms
 * @param {Function} [opts.now] - função para obter tempo atual (padrão: performance.now)
 * @returns {Object} monitor com métodos sample(), reset(), currentMedian()
 */
function createFrameMonitor({
  onDowngrade,
  windowMs = 2000,
  thresholdMs = 33,
  now = () => performance.now(),
} = {}) {
  let samples = [];
  let windowStartTime = null;
  let lastDowngradeTime = null;

  return {
    /**
     * Registra uma amostra de tempo de frame.
     * @param {number} frameMs - tempo do frame em ms
     */
    sample(frameMs) {
      const currentTime = now();

      // Inicia janela se vazia
      if (samples.length === 0) {
        windowStartTime = currentTime;
      }

      // Adiciona amostra
      samples.push({ time: currentTime, frameMs });

      // Remove amostras fora da janela de cálculo de mediana
      samples = samples.filter((s) => currentTime - s.time < windowMs);

      // Verificar se temos janela completa e mediana está acima do limiar
      const windowFilled = windowStartTime !== null && currentTime - windowStartTime >= windowMs;
      const inCooldown = lastDowngradeTime !== null && currentTime - lastDowngradeTime < windowMs;

      if (windowFilled && !inCooldown) {
        const median = this.currentMedian();
        if (median > thresholdMs) {
          onDowngrade();
          lastDowngradeTime = currentTime;
          samples = []; // Limpa amostras para iniciar novo cooldown
          windowStartTime = null; // Reset da janela
        }
      }
    },

    /**
     * Reseta o monitor e limpa cooldown.
     */
    reset() {
      samples = [];
      windowStartTime = null;
      lastDowngradeTime = null;
    },

    /**
     * Retorna a mediana do tempo de frame das amostras atuais.
     * @returns {number} mediana em ms
     */
    currentMedian() {
      if (samples.length === 0) return 0;

      const sorted = samples.map((s) => s.frameMs).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);

      if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
      }
      return sorted[mid];
    },
  };
}

/**
 * Retorna o próximo tier inferior.
 *
 * @param {string} tier - 'high', 'medium' ou 'low'
 * @returns {string} tier inferior ('high' -> 'medium', 'medium' -> 'low', 'low' -> 'low')
 */
function nextLowerTier(tier) {
  switch (tier) {
    case 'high':
      return 'medium';
    case 'medium':
      return 'low';
    case 'low':
    default:
      return 'low';
  }
}

export { TIERS, detectTier, pixelRatioFor, createFrameMonitor, nextLowerTier };
