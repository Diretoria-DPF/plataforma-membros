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

export function createDb(databaseUrl) {
  return neon(databaseUrl);
}
