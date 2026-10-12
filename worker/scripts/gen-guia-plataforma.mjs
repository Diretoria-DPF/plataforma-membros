/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * gen-guia-plataforma.mjs — gera worker/src/assistant/guiaPlataforma.js a partir de docs/lia/GUIA-PLATAFORMA.md
 * (a fonte única do guia da Lia). O Worker não lê arquivo em tempo de execução, então o markdown entra no
 * módulo como texto. Uso: `cd worker && node scripts/gen-guia-plataforma.mjs`. O teste guiaPlataforma.test.js
 * falha enquanto o módulo não for regerado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(here, '..', '..', 'docs', 'lia', 'GUIA-PLATAFORMA.md');
const TARGET = path.resolve(here, '..', 'src', 'assistant', 'guiaPlataforma.js');

const markdown = fs.readFileSync(SOURCE, 'utf8').replace(/\r\n?/g, '\n');
const module = `/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/guiaPlataforma.js — GERADO por worker/scripts/gen-guia-plataforma.mjs a partir de
 * docs/lia/GUIA-PLATAFORMA.md. Não edite à mão: edite o markdown e rode o gerador.
 * O guia vira trechos do acervo da Lia (fonte 'guia-plataforma', ver assistant/docs.js); as seções
 * de administração ficam fora do acervo, que é o mesmo para todos os papéis.
 */
export const GUIA_SOURCE = 'guia-plataforma';
const ADMIN_PREFIX = 'Administração';

/** Seção só para administradores (fica fora do acervo). */
export function isAdminSection(section) {
  return typeof section === 'string' && section.startsWith(ADMIN_PREFIX);
}

export const GUIA_PLATAFORMA_MARKDOWN = ${JSON.stringify(markdown)};
`;
fs.writeFileSync(TARGET, module);
process.stdout.write(`guiaPlataforma.js gerado (${markdown.length} caracteres)\n`);
