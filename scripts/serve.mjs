import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'out');
const port = Number(process.env.PORT || 3000);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error('No production export found. Run `npm run build` first.');
  process.exit(1);
}

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  const requested = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, requested === '/' ? 'index.html' : requested);

  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(root, 'index.html');

  response.setHeader('Content-Type', contentTypes[extname(file)] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store');
  createReadStream(file).pipe(response);
});

let activePort = port;
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && activePort < port + 10) {
    activePort += 1;
    server.listen(activePort, '127.0.0.1');
    return;
  }
  throw error;
});
server.on('listening', () => console.log(`x402 workshop ready at http://127.0.0.1:${activePort}`));
server.listen(activePort, '127.0.0.1');
