// Gera os PDFs do currículo (PT e EN) e a imagem social og.png a partir de dist/, com Chromium (Playwright).
// Requer: npm run build antes. Playwright global: NODE_PATH=$(npm root -g) node scripts/pdf.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(process.env.NODE_PATH || '', 'playwright'))); }

const PORT = 4179;
const server = spawn('node', [path.join(ROOT, 'scripts/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage();
  for (const [url, out] of [['/curriculo/', 'Daniel-P-Francisco-Curriculo-PT.pdf'], ['/en/resume/', 'Daniel-P-Francisco-Resume-EN.pdf']]) {
    await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'networkidle' });
    await page.pdf({ path: path.join(ROOT, 'dist', out), format: 'A4', printBackground: true, preferCSSPageSize: true });
    console.log('pdf →', out);
  }
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await og.goto(`http://localhost:${PORT}/assets/og.svg`);
  await og.screenshot({ path: path.join(ROOT, 'dist/assets/og.png') });
  console.log('png → assets/og.png');
} finally {
  await browser.close();
  server.kill();
}
