import http from 'node:http';
import {readFile} from 'node:fs/promises';
const file = new URL('../dist/index.html', import.meta.url);
const port = Number(process.env.PORT || 18740);
const host = '127.0.0.1';
http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method) || !['/', '/index.html'].includes(req.url.split('?')[0])) {
    res.writeHead(404).end();
    return;
  }
  try {
    const page = await readFile(file);
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : page);
  } catch {
    res.writeHead(503, {'Content-Type':'text/plain; charset=utf-8'}).end('Сначала выполните npm run build.');
  }
}).listen(port,host, () => console.log('Трамвайное бюро · http://' + host + ':' + port + '/'));
