/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * gen-openapi.mjs — regenera worker/openapi.yaml a partir do API_REGISTRY.
 * Uso: cd worker && npm run openapi
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_REGISTRY } from '../src/handlers.js';
import { buildOpenApi, toYaml } from '../src/openapi.js';

const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.yaml');
fs.writeFileSync(target, toYaml(buildOpenApi(API_REGISTRY)));
console.log(`openapi.yaml atualizado (${Object.keys(API_REGISTRY).length} actions).`);
