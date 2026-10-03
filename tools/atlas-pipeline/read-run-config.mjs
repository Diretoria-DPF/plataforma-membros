#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * read-run-config.mjs
 *
 * Lê run-config.json e imprime `chave=valor` para o workflow (usado só nas
 * execuções por `push`, onde não há inputs de workflow_dispatch — ver
 * comentário em run-config.json e no workflow atlas-assets.yml).
 *
 * Uso: node read-run-config.mjs >> "$GITHUB_OUTPUT"
 */
import * as fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('run-config.json', 'utf8'));
const systems = Array.isArray(config.systems) ? config.systems.join(',') : String(config.systems || 'all');

console.log(`mode=${config.mode || 'discover'}`);
console.log(`systems=${systems}`);
console.log(`hra=${config.hra ? 'true' : 'false'}`);
console.log(`commit=${config.commit ? 'true' : 'false'}`);
