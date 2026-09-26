/**
 * dev-server.js
 * Servidor estático mínimo (sem dependências) só para pré-visualizar
 * localmente frontend/index.html+app.js+styles.css exatamente como o
 * GitHub Pages vai servir — arquivos estáticos puros, sem nenhum template
 * de servidor. Não faz parte do deploy; é só para verificação local.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 4174;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  // Recursos dos módulos de aprendizagem (frontend/modulos/).
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
};

http
  .createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log('frontend dev server on http://localhost:' + PORT);
  });
