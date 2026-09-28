#!/usr/bin/env node
/**
 * lint-pt.mjs — Linter for Portuguese anatomical text
 *
 * Detects anglicisms and mistranslations in pt-BR atlas content.
 * Exports loadGlossary(), buildMatchers(), lintText(), lintContent(), and CLI.
 *
 * Usage: node frontend/scripts/atlas/lint-pt.mjs [files...]
 *        Default files: *.json in frontend/modulos/anatomia-3d/data/atlas/legacy/content/
 *                       plus data/atlas/{routes,processes,quiz-cases,compounds}.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import glob from 'node:fs';

/**
 * Load glossary from JSON file
 * @param {string} path - Path to glossário-pt.json
 * @returns {Array} Glossary entries
 */
export function loadGlossary(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Glossário não encontrado: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Build matchers from glossary entries
 * @param {Array} glossary - Array of glossary entries
 * @returns {Array} Array of {id, avoid, term_pt, re} objects
 */
export function buildMatchers(glossary) {
  const matchers = [];

  for (const entry of glossary) {
    if (!entry.avoid || !Array.isArray(entry.avoid)) {
      continue;
    }

    for (const avoidPhrase of entry.avoid) {
      // Escape special regex characters
      const escaped = avoidPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Create pattern with Unicode-aware word boundaries
      // Use negative lookbehind/lookahead to match whole words/phrases
      const pattern = `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`;

      try {
        const re = new RegExp(pattern, 'gui');
        matchers.push({
          id: entry.id,
          avoid: avoidPhrase,
          term_pt: entry.term_pt,
          re
        });
      } catch (e) {
        console.error(`Erro ao compilar regex para "${avoidPhrase}":`, e.message);
      }
    }
  }

  return matchers;
}

/**
 * Lint a text string against matchers
 * @param {string} text - Text to lint
 * @param {Array} matchers - Matchers from buildMatchers()
 * @returns {Array} Array of {avoid, suggest: term_pt, index} objects
 */
export function lintText(text, matchers) {
  const findings = [];

  if (typeof text !== 'string') {
    return findings;
  }

  for (const matcher of matchers) {
    let match;
    // Reset lastIndex for global regex
    matcher.re.lastIndex = 0;

    while ((match = matcher.re.exec(text)) !== null) {
      findings.push({
        avoid: matcher.avoid,
        suggest: matcher.term_pt,
        index: match.index
      });
    }
  }

  // Sort by index to report in order
  findings.sort((a, b) => a.index - b.index);

  return findings;
}

/**
 * Keys where English text is allowed (should not be linted)
 */
const SKIP_KEYS = new Set([
  'sources',
  'ids',
  'name_en',
  'term_en',
  'names_en',
  'en',
  'synonyms_en',
  'url',
  'ref',
  'license'
]);

/**
 * Recursively lint all strings in a JSON object
 * @param {any} obj - Object to lint
 * @param {Array} matchers - Matchers from buildMatchers()
 * @param {string} path - Current path in the object (for reporting)
 * @returns {Array} Array of {path, avoid, suggest} objects
 */
export function lintContent(obj, matchers, path = '') {
  const findings = [];

  // Handle primitives
  if (obj === null || obj === undefined) {
    return findings;
  }

  if (typeof obj === 'string') {
    const results = lintText(obj, matchers);
    for (const result of results) {
      findings.push({
        path: path || '(raiz)',
        avoid: result.avoid,
        suggest: result.suggest
      });
    }
    return findings;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const newPath = path ? `${path}[${i}]` : `[${i}]`;
      findings.push(...lintContent(obj[i], matchers, newPath));
    }
    return findings;
  }

  // Handle objects
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      // Skip English-only keys
      // Identificadores (sid, sids, distractorSids, id…) não são texto de leitura.
      if (SKIP_KEYS.has(key) || key === 'id' || /sids?$/i.test(key)) {
        continue;
      }

      const newPath = path ? `${path}.${key}` : key;
      findings.push(...lintContent(value, matchers, newPath));
    }
    return findings;
  }

  return findings;
}

/**
 * CLI: Lint files and report findings
 */
async function main() {
  const isStrict = process.argv.includes('--strict');
  const providedFiles = process.argv.slice(2).filter(f => f !== '--strict');

  let filesToLint = [];

  if (providedFiles.length === 0) {
    // Default files: legacy content + main data files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const frontendDir = path.resolve(__dirname, '..', '..');
    const atlasDataDir = path.join(frontendDir, 'modulos', 'anatomia-3d', 'data', 'atlas');

    // Legacy content files
    const legacyDir = path.join(atlasDataDir, 'legacy', 'content');
    if (fs.existsSync(legacyDir)) {
      const legacyFiles = fs
        .readdirSync(legacyDir)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(legacyDir, f));
      filesToLint.push(...legacyFiles);
    }

    // Main data files
    const mainFiles = [
      'routes.json',
      'processes.json',
      'quiz-cases.json',
      'compounds.json'
    ];
    for (const file of mainFiles) {
      const filePath = path.join(atlasDataDir, file);
      if (fs.existsSync(filePath)) {
        filesToLint.push(filePath);
      }
    }
  } else {
    filesToLint = providedFiles;
  }

  // Load glossary
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(__dirname, '..', '..');
  const glossaryPath = path.join(frontendDir, 'modulos', 'anatomia-3d', 'data', 'atlas', 'glossario-pt.json');

  let glossary;
  try {
    glossary = loadGlossary(glossaryPath);
  } catch (e) {
    console.error(`Erro ao carregar glossário: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const matchers = buildMatchers(glossary);

  if (matchers.length === 0) {
    console.log('Nenhum termo "avoid" encontrado no glossário.');
    return;
  }

  let totalFindings = 0;

  // Lint each file
  for (const filePath of filesToLint) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    let data;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data = JSON.parse(raw);
    } catch (e) {
      console.error(`Erro ao ler/parsear ${filePath}: ${e.message}`);
      continue;
    }

    const findings = lintContent(data, matchers);

    for (const finding of findings) {
      const shortPath = path.relative(
        path.dirname(__dirname),
        filePath
      );
      console.log(`${shortPath}: ${finding.path} — "${finding.avoid}" → use "${finding.suggest}"`);
      totalFindings++;
    }
  }

  // Summary
  console.log(`\nTotal: ${totalFindings} achados.`);

  // Exit code
  if (isStrict && totalFindings > 0) {
    process.exitCode = 1;
  }
}

// Run CLI if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Erro fatal:', err);
    process.exitCode = 1;
  });
}
