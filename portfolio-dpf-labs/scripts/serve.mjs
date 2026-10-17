// Servidor estático mínimo para pré-visualizar dist/ (porta 4173).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const PORT = Number(process.env.PORT || 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.vcf': 'text/vcard', '.xml': 'application/xml', '.txt': 'text/plain' };

http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.includes('..')) { res.writeHead(400).end(); return; }
  let file = path.join(DIST, p);
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch {}
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(await readFile(path.join(DIST, '404.html')).catch(() => '404'));
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
