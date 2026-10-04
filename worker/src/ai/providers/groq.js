/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/providers/groq.js
 * Descritor do Groq (API compatível com OpenAI). Só dados e duas funções
 * puras; quem fala com a rede é providers/poolClient.js.
 */
import { GROQ_CHAT_URL, GROQ_MODELS_URL, resolveModel, modelSpecificParams } from '../config.js';

export const groqProvider = Object.freeze({
  name: 'groq',
  // Secret com uma ou várias chaves (vírgula, espaço ou ';').
  keysEnvName: 'GROQ_API_KEYS',
  chatUrl: GROQ_CHAT_URL,
  // Endpoint barato (não gera tokens), usado só no teste de saúde das chaves.
  modelsUrl: GROQ_MODELS_URL,
  // Prefixo antigo, mantido: o KV de produção já tem cooldowns com ele.
  cooldownPrefix: 'ai:key-cooldown:',
  resolveModel,
  modelParams: modelSpecificParams,
});
