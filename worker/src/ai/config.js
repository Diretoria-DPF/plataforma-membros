/**
 * ai/config.js
 * Parâmetros de cada recurso de IA. A Worker só fala com o Groq (decisão do
 * responsável), mas nada fora deste diretório sabe disso: os services pedem
 * um RECURSO ('chat', 'evaluate'...) e esta tabela decide modelo, limite de
 * tokens e timeouts. Reduzir para um único modelo no futuro = definir
 * GROQ_MODEL_FAST e GROQ_MODEL_SMART com o mesmo valor (wrangler.toml), sem
 * tocar em código.
 */
export const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Endpoint barato (não gera tokens) usado só no teste de saúde das chaves.
export const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

export const DEFAULT_MODEL_FAST = 'openai/gpt-oss-20b';
export const DEFAULT_MODEL_SMART = 'openai/gpt-oss-120b';

// Cooldown de uma chave que falhou (401/403/429/5xx/timeout). 60 s é também
// o TTL mínimo do Workers KV; um Retry-After maior é respeitado até 1 h.
export const KEY_COOLDOWN_DEFAULT_SECONDS = 60;
export const KEY_COOLDOWN_MAX_SECONDS = 3600;
export const HEALTH_TIMEOUT_MS = 8000;

/**
 * Por recurso:
 * - tier: 'fast' (20B, barato, para conversa) ou 'smart' (120B, para
 *   avaliar e gerar conteúdo estruturado);
 * - maxTokens: teto de saída. Os modelos gpt-oss "pensam" antes de
 *   responder e esse raciocínio conta no teto, por isso os valores são
 *   maiores do que o tamanho da resposta visível;
 * - attemptTimeoutMs: timeout de CADA tentativa (uma chave);
 * - totalBudgetMs: orçamento somando o failover entre chaves. Fica abaixo
 *   dos 60 s da ponte do front-end (Contrato 3), para a pessoa receber a
 *   mensagem de indisponibilidade da Worker, não um timeout genérico;
 * - json: exige response_format json_object (saída validada por esquema).
 */
export const FEATURE_CONFIG = {
  chat: { tier: 'fast', maxTokens: 700, temperature: 0.7, reasoningEffort: 'low', attemptTimeoutMs: 20000, totalBudgetMs: 25000, json: false },
  evaluate: { tier: 'smart', maxTokens: 2500, temperature: 0.2, reasoningEffort: 'medium', attemptTimeoutMs: 45000, totalBudgetMs: 55000, json: true },
  generate_case: { tier: 'smart', maxTokens: 6000, temperature: 0.8, reasoningEffort: 'low', attemptTimeoutMs: 45000, totalBudgetMs: 55000, json: true },
  lab_preceptor: { tier: 'smart', maxTokens: 1500, temperature: 0.4, reasoningEffort: 'low', attemptTimeoutMs: 25000, totalBudgetMs: 40000, json: false },
};

export function resolveModel(env, tier) {
  const fast = (env && String(env.GROQ_MODEL_FAST || '').trim()) || DEFAULT_MODEL_FAST;
  const smart = (env && String(env.GROQ_MODEL_SMART || '').trim()) || DEFAULT_MODEL_SMART;
  return tier === 'smart' ? smart : fast;
}

/**
 * Parâmetros específicos da família gpt-oss (esforço de raciocínio e não
 * devolver o raciocínio na resposta). Outro modelo configurado no futuro
 * não recebe esses campos — evita um 400 por parâmetro desconhecido.
 */
export function modelSpecificParams(model, cfg) {
  if (/gpt-oss/i.test(model)) {
    return { reasoning_effort: cfg.reasoningEffort || 'low', include_reasoning: false };
  }
  return {};
}
