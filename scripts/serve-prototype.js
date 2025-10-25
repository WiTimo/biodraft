#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5500;
const distDir = path.join(__dirname, '..', 'dist');
const clothDir = path.join(__dirname, '..', 'cloth-ammo');

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.js')) return 'application/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.wasm')) return 'application/wasm';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.map')) return 'application/octet-stream';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  try {
    const url = decodeURI(req.url.split('?')[0]);

    // Serve cloth-ammo files under /cloth-ammo
    if (url.startsWith('/cloth-ammo')) {
      const relPath = url === '/cloth-ammo' || url === '/cloth-ammo/' ? '/index.html' : url.replace('/cloth-ammo', '');
      const filePath = path.join(clothDir, relPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(data);
        return;
      }
    }

    // Otherwise serve from dist (built editor)
    const safePath = url === '/' ? '/index.html' : url;
    const filePath = path.join(distDir, safePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType(filePath) });
      res.end(data);
      return;
    }

    // Fallback: if file not found, try serving cloth-ammo index for convenience
    const fallback = path.join(clothDir, 'index.html');
    if (fs.existsSync(fallback)) {
      const data = fs.readFileSync(fallback);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  }
});

server.listen(port, () => {
  console.log(`Prototype server running at http://localhost:${port}/`);
  console.log(`Editor served from ./dist, simulation served from ./cloth-ammo`);
});
