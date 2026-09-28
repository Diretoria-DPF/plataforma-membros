#!/usr/bin/env node
/**
 * vendor-three.js
 * Baixa e vê três.js ES modules para frontend/modulos/anatomia-3d/vendor/three/.
 * Reescreve imports de 'three' para caminhos relativos, mantém cabeçalhos de licença.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Versão pinned do three.js
const THREE_VERSION = '0.186.1';

// Diretórios
const FRONTEND_ROOT = path.join(__dirname, '../..');
const VENDOR_DIR = path.join(FRONTEND_ROOT, 'modulos/anatomia-3d/vendor/three');
const TEMP_DIR = path.join('/tmp', `three-vendor-${Date.now()}`);

/**
 * Downloads and extracts the three.js tarball.
 */
function downloadAndExtract() {
  console.log(`Baixando three@${THREE_VERSION}...`);

  fs.mkdirSync(TEMP_DIR, { recursive: true });

  try {
    execSync(`cd ${TEMP_DIR} && npm pack three@${THREE_VERSION}`, {
      stdio: 'pipe',
    });
  } catch (err) {
    console.error('Erro ao baixar tarball:', err.message);
    process.exit(1);
  }

  const tarball = path.join(TEMP_DIR, `three-${THREE_VERSION}.tgz`);
  if (!fs.existsSync(tarball)) {
    console.error(`Tarball não encontrado: ${tarball}`);
    process.exit(1);
  }

  try {
    execSync(`cd ${TEMP_DIR} && tar -xzf three-${THREE_VERSION}.tgz`, {
      stdio: 'pipe',
    });
  } catch (err) {
    console.error('Erro ao extrair tarball:', err.message);
    process.exit(1);
  }

  const packageDir = path.join(TEMP_DIR, 'package');
  if (!fs.existsSync(packageDir)) {
    console.error(`Diretório package não encontrado: ${packageDir}`);
    process.exit(1);
  }

  return packageDir;
}

/**
 * Rewrites imports in a JavaScript file.
 * - 'three' → relative path to three.module.js
 * - 'three/addons/...' → relative path based on location
 */
function rewriteImports(content, filePath) {
  // Determine depth from vendor/three root to rewrite paths correctly
  const relativeToVendor = path.relative(VENDOR_DIR, filePath);
  const depth = relativeToVendor.split(path.sep).length - 1;
  const upPath = depth > 0 ? '../'.repeat(depth) : './';

  // Rewrite 'three' imports
  content = content.replace(
    /from\s+['"]three['"]/g,
    `from '${upPath}three.module.js'`
  );

  // Rewrite 'three/addons/...' imports to relative paths
  content = content.replace(
    /from\s+['"]three\/addons\/([^'"]+)['"]/g,
    (_match, p1) => {
      return `from '${upPath}${p1}'`;
    }
  );

  return content;
}

/**
 * Copies a file and rewrites imports if it's JavaScript.
 */
function copyFile(src, dest, isJsFile = false) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (isJsFile) {
    let content = fs.readFileSync(src, 'utf8');
    content = rewriteImports(content, dest);
    fs.writeFileSync(dest, content);
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Parses a JavaScript file to extract its import dependencies.
 */
function getImportedFiles(content) {
  const imports = [];

  // Match import statements
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    // Only track relative imports to local files
    if (importPath.startsWith('../')) {
      imports.push(importPath);
    }
  }

  return imports;
}

/**
 * Gathers all files transitively imported by a given file.
 */
function gatherDependencies(filePath, packageDir, visited = new Set()) {
  const absPath = path.resolve(filePath);

  if (visited.has(absPath)) {
    return [];
  }
  visited.add(absPath);

  const files = [absPath];

  // Read the file to find imports
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    return files; // File doesn't exist, skip
  }

  // Extract relative imports
  const imports = getImportedFiles(content);

  for (const imp of imports) {
    const resolvedPath = path.resolve(path.dirname(absPath), imp);
    // Only include files that exist within the package
    if (resolvedPath.startsWith(packageDir)) {
      files.push(...gatherDependencies(resolvedPath, packageDir, visited));
    }
  }

  return [...new Set(files)]; // Remove duplicates
}

/**
 * Main vendoring logic.
 */
function main() {
  console.log(`Preparando three.js v${THREE_VERSION}...`);

  // Clean and recreate vendor directory
  if (fs.existsSync(VENDOR_DIR)) {
    fs.rmSync(VENDOR_DIR, { recursive: true });
  }
  fs.mkdirSync(VENDOR_DIR, { recursive: true });

  const packageDir = downloadAndExtract();

  const filesToCopy = [
    // Build files (at root of vendor/three)
    { src: 'build/three.module.js', dest: 'three.module.js', isJs: true },
    { src: 'build/three.core.js', dest: 'three.core.js', isJs: true },

    // Controls
    { src: 'examples/jsm/controls/OrbitControls.js', dest: 'controls/OrbitControls.js', isJs: true },

    // Loaders
    { src: 'examples/jsm/loaders/GLTFLoader.js', dest: 'loaders/GLTFLoader.js', isJs: true },
    { src: 'examples/jsm/loaders/DRACOLoader.js', dest: 'loaders/DRACOLoader.js', isJs: true },

    // Utils
    { src: 'examples/jsm/utils/BufferGeometryUtils.js', dest: 'utils/BufferGeometryUtils.js', isJs: true },
    { src: 'examples/jsm/utils/SkeletonUtils.js', dest: 'utils/SkeletonUtils.js', isJs: true },

    // Renderers
    { src: 'examples/jsm/renderers/CSS2DRenderer.js', dest: 'renderers/CSS2DRenderer.js', isJs: true },

    // Libs
    { src: 'examples/jsm/libs/meshopt_decoder.module.js', dest: 'libs/meshopt_decoder.module.js', isJs: true },

    // Draco files (GLTF variant)
    { src: 'examples/jsm/libs/draco/gltf/draco_decoder.js', dest: 'libs/draco/draco_decoder.js', isJs: false },
    { src: 'examples/jsm/libs/draco/gltf/draco_decoder.wasm', dest: 'libs/draco/draco_decoder.wasm', isJs: false },
    { src: 'examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js', dest: 'libs/draco/draco_wasm_wrapper.js', isJs: false },
  ];

  const filesInfo = [];
  let totalSize = 0;

  for (const file of filesToCopy) {
    const srcPath = path.join(packageDir, file.src);
    const destPath = path.join(VENDOR_DIR, file.dest);

    if (!fs.existsSync(srcPath)) {
      console.warn(`⚠️  Arquivo não encontrado: ${file.src}`);
      continue;
    }

    copyFile(srcPath, destPath, file.isJs);

    const stats = fs.statSync(destPath);
    const size = stats.size;
    totalSize += size;

    filesInfo.push({
      file: file.dest,
      size: size,
    });

    console.log(`  ✓ ${file.dest} (${(size / 1024).toFixed(1)} KB)`);
  }

  // Write VERSION file
  fs.writeFileSync(path.join(VENDOR_DIR, 'VERSION'), THREE_VERSION);

  // Write LICENSE file
  const licenseFile = path.join(packageDir, 'LICENSE');
  if (fs.existsSync(licenseFile)) {
    fs.copyFileSync(licenseFile, path.join(VENDOR_DIR, 'LICENSE'));
  }

  // Print summary
  console.log('\n✓ Vendoring concluído!');
  console.log(`\nArquivos vendorizados:`);
  filesInfo.forEach(f => {
    console.log(`  - ${f.file}: ${(f.size / 1024).toFixed(1)} KB`);
  });
  console.log(`\nTamanho total: ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`Versão: ${THREE_VERSION}`);

  // Cleanup
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

main();
