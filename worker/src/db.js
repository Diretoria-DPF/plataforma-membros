/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * db.js
 * Camada de banco usando o driver HTTP serverless do próprio Neon
 * (@neondatabase/serverless): cada `sql\`...\`` é UMA requisição HTTP,
 * sem handshake TCP/TLS de conexão a abrir e fechar por chamada — é
 * exatamente esse "abrir conexão nova a cada query" do driver JDBC do Apps
 * Script que causava os 3-5s por interação (ver docs/SECURITY.md e
 * docs/DEPLOYMENT.md, seção sobre a migração).
 *
 * Operações que no Apps Script eram uma transação multi-instrução
 * (register, confirmEmail, confirmPasswordReset) viraram um ÚNICO
 * statement SQL usando CTEs encadeadas (WITH ... INSERT/UPDATE ...
 * RETURNING) nos próprios services — um único statement em Postgres é
 * sempre atômico por definição, então isso preserva a mesma garantia
 * transacional sem precisar de uma conexão com estado (BEGIN/COMMIT) via
 * WebSocket. Ver cada service para o SQL exato.
 */
import { neon } from '@neondatabase/serverless';

/**
 * O driver do Neon, ao recusar uma URL malformada, escreve a URL INTEIRA (com a senha) na mensagem do erro. Por isso o erro
 * original nunca sai daqui: quem chama recebe uma mensagem genérica (o comportamento normal, URL válida, não muda).
 */
export function createDb(databaseUrl) {
  try {
    return neon(databaseUrl);
  } catch (err) {
    throw new Error('DATABASE_URL ausente ou malformada.');
  }
}

/**
 * Cliente do SEGUNDO banco (memória de estudo, projeto Neon laift-memory; ADR 0007). Mesmo driver HTTP: cada consulta
 * é uma requisição, e várias consultas na MESMA transação vão numa só requisição via `sql.transaction(...)`.
 *   - `env.memorySql` (injeção, só para testes) tem prioridade;
 *   - sem `DATABASE_URL_MEMORY` devolve null: o chamador trata como "memória indisponível" e nada mais muda;
 *   - o cliente é memoizado por URL na memória do isolate (não há conexão a abrir; evita recriar o objeto a cada chamada).
 * O driver não tem tempo limite próprio: quem lê no caminho do tutor limita o tempo (Promise.race em memoryProvider.js).
 */
const memoryClients = new Map();

/** A URL tem cara de URL? (não a ecoa: o formato inválido vira só um `false`). */
function isParsableUrl(url) {
  try {
    return !!new URL(url).hostname;
  } catch (err) {
    return false;
  }
}

/**
 * NUNCA lança. URL malformada vira `null` (memória indisponível), sem repetir a URL em lugar nenhum: o driver do Neon coloca
 * a string de conexão, com a senha, na mensagem do erro, e essa mensagem iria para o log e derrubaria o cron.
 */
export function createMemoryDb(env) {
  if (env && env.memorySql) return env.memorySql;
  const url = env && typeof env.DATABASE_URL_MEMORY === 'string' ? env.DATABASE_URL_MEMORY.trim() : '';
  if (!url || !isParsableUrl(url)) return null;
  if (!memoryClients.has(url)) {
    try {
      memoryClients.set(url, neon(url));
    } catch (err) {
      return null;
    }
  }
  return memoryClients.get(url);
}
