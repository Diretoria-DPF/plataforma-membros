// Verificações do build: arquivos, SEO básico, links internos e vazamentos proibidos.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const errors = [];
const fail = (m) => errors.push(m);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}

const files = await walk(DIST);
const htmls = files.filter((f) => f.endsWith('.html') && !f.endsWith('404.html'));
const exists = async (p) => stat(p).then(() => true, () => false);

const FORBIDDEN = [/hpfrei/i, /hpfreilabs/i, /Hans-Peter/i, /G-T7QJGPV655/, /googletagmanager/i, /run_hook/, /simtox/i, /o-bala-vip/i, /anato\b/i, /novo-teste/i];
const PHONE = /(\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})/;

for (const f of htmls) {
  const rel = path.relative(DIST, f);
  const h = await readFile(f, 'utf8');
  for (const [tag, re] of [['title', /<title>[^<]+<\/title>/], ['description', /<meta name="description" content="[^"]{40,}"/], ['canonical', /<link rel="canonical"/], ['hreflang', /hreflang="pt-BR"/], ['og:title', /property="og:title"/], ['h1', /<h1[ >]/], ['json-ld', /application\/ld\+json/], ['lang', /<html lang="(pt-BR|en)"/]]) {
    if (!re.test(h)) fail(`${rel}: falta ${tag}`);
  }
  if ((h.match(/<h1[ >]/g) || []).length !== 1) fail(`${rel}: deve ter exatamente um <h1>`);
  for (const re of FORBIDDEN) if (re.test(h)) fail(`${rel}: conteúdo proibido ${re}`);
  if (PHONE.test(h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/https?:\/\/\S+/g, '').replace(/lattes\.cnpq\.br\/\d+/g, ''))) fail(`${rel}: possível telefone no HTML`);
  for (const m of h.matchAll(/ (?:href|src)="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
    const target = m[1];
    if (target === '/') continue;
    const p = path.join(DIST, target);
    const ok = (await exists(p)) && ((await stat(p)).isFile() || (await exists(path.join(p, 'index.html'))));
    if (!ok) fail(`${rel}: link interno quebrado ${target}`);
  }
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { fail(`${rel}: JSON-LD inválido`); }
  }
}
for (const f of ['sitemap.xml', 'robots.txt', 'daniel-p-francisco.vcf', 'assets/style.css', 'assets/main.js']) {
  if (!(await exists(path.join(DIST, f)))) fail(`falta ${f}`);
}
const data = await readFile(path.join(ROOT, 'data/dados.json'), 'utf8');
for (const re of [/simtox/i, /o-bala-vip/i, /"anato"/i, /novo-teste/i]) if (re.test(data)) fail(`dados.json cita repositório privado ${re}`);

if (errors.length) { console.error(errors.map((e) => `✗ ${e}`).join('\n')); process.exit(1); }
console.log(`check ok: ${htmls.length} páginas, sem links quebrados nem conteúdo proibido`);
