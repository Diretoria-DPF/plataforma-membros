/**
 * flags.js — chaves para ligar/desligar as novidades sem reverter tudo.
 * ---------------------------------------------------------------------------
 * Rollback de uma novidade (docs/atlas-rollback.md §2): trocar o padrão para
 * `false` aqui num PR de 1 linha. Para TESTAR sem publicar, a URL aceita
 * `?flags=-onboarding,-hints` (o sinal de menos desliga; sem sinal liga) e
 * os testes podem definir `window.__atlasFlags = { hints: false }` antes do
 * atlas carregar.
 */

export const FLAG_DEFAULTS = Object.freeze({
  onboarding: true,   // apresentação de 3 telas (js/ui/onboarding.js)
  hints: true,        // dicas contextuais (js/ui/hints.js)
  progressBar: true,  // barra de carregamento (js/ui/progress-bar.js)
  slowDevice: true,   // avisos de demora/offline (js/ui/slow-device.js)
  pulse: true,        // pulso no destaque ao selecionar (js/engine/selection.js)
  confetti: true,     // confetes no acerto do quiz (js/modes/quiz.js)
  peek: true,         // peek com selos e "Ver mais" (js/ui/infocard.js)
  tts: true,          // "Ouvir" a ficha com speechSynthesis pt-BR (js/ui/infocard.js)
});

/**
 * @param {string} [search] location.search
 * @param {Object} [overrides] window.__atlasFlags
 * @returns {Readonly<typeof FLAG_DEFAULTS>}
 */
export function parseFlags(search = '', overrides = null) {
  const flags = { ...FLAG_DEFAULTS };
  if (overrides && typeof overrides === 'object') {
    for (const [k, v] of Object.entries(overrides)) if (k in flags) flags[k] = !!v;
  }
  const raw = new URLSearchParams(search || '').get('flags');
  if (raw) {
    for (const part of raw.split(',')) {
      const name = part.trim().replace(/^[-+]/, '');
      if (name in flags) flags[name] = !part.trim().startsWith('-');
    }
  }
  return Object.freeze(flags);
}

export const ATLAS_FLAGS = parseFlags(
  typeof location !== 'undefined' ? location.search : '',
  typeof window !== 'undefined' ? window.__atlasFlags : null,
);
