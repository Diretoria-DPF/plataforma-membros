/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/providers/nvidia.js
 * Descritor da NVIDIA NIM (build.nvidia.com), API compatível com OpenAI.
 *
 * ESTADO: construído e testado, mas NÃO LIGADO — nenhum service o chama. O
 * uso ativo (fallback do Groq, validação clínica assíncrona) depende de
 * feature flag e de gatilhos em docs/backlog-futuro.md, e de confirmar os
 * termos do nível gratuito para produção.
 *
 * Os IDs de modelo variam no catálogo e por isso NÃO ficam no código: vêm
 * de NVIDIA_MODEL_FAST e NVIDIA_MODEL_SMART ([vars] do wrangler.toml; ler os
 * valores válidos em GET /v1/models). Sem eles, resolveModel devolve '' e o
 * cliente se declara "não configurado" em vez de chutar um ID.
 */
export const nvidiaProvider = Object.freeze({
  name: 'nvidia',
  keysEnvName: 'NVIDIA_API_KEY',
  chatUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
  modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
  cooldownPrefix: 'ai:key-cooldown:nvidia:',
  resolveModel(env, tier) {
    const fast = (env && String(env.NVIDIA_MODEL_FAST || '').trim()) || '';
    const smart = (env && String(env.NVIDIA_MODEL_SMART || '').trim()) || '';
    return tier === 'smart' ? smart : fast;
  },
  // reasoning_effort/include_reasoning são da família gpt-oss (Groq); outros
  // modelos podem responder 400 a parâmetros que não conhecem.
  modelParams() {
    return {};
  },
});
