// DevMetrics — servidor: API de agregação + dashboard + badges dinâmicos.
import express from 'express';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarAgregador } from './src/agregador.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 3600;
const agg = criarAgregador(process.env.GITHUB_TOKEN || '');

const app = express();

// API
app.get('/api/:dono/resumo', async (req, res) => {
  try { res.json(await agg.resumo(req.params.dono)); }
  catch (e) { res.status(e.codigo === 'github' ? 502 : 500).json({ erro: e.message }); }
});
app.get('/api/:dono/linguagens', async (req, res) => {
  try { res.json(await agg.porLinguagem(req.params.dono)); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});
app.get('/api/:dono/top', async (req, res) => {
  try { res.json(await agg.topPorStars(req.params.dono, Number(req.query.n) || 5)); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// badges dinâmicos (SVG) — pra usar em READMEs!
app.get('/badge/:dono/:tipo', async (req, res) => {
  try {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=300' });
    if (req.params.tipo === 'repos') {
      const r = await agg.resumo(req.params.dono);
      res.end(agg.badge('repos', r.publicos));
    } else if (req.params.tipo === 'stars') {
      const r = await agg.resumo(req.params.dono);
      res.end(agg.badge('stars', r.stars, '#d29922'));
    } else {
      res.writeHead(400); res.end('tipo inválido');
    }
  } catch (e) {
    res.writeHead(502); res.end('badge indisponível');
  }
});

// painel
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/badge')) return next();
  try {
    let arquivo = normalize(join(ROOT, 'public', req.path));
    if (!arquivo.startsWith(ROOT)) throw new Error('fora');
    const dados = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': MIME[extname(arquivo)] || 'text/html; charset=utf-8' });
    res.end(dados);
  } catch {
    try {
      const indice = await readFile(join(ROOT, 'public/index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indice);
    } catch { res.writeHead(500); res.end('erro'); }
  }
});

const server = http.createServer(app);
export { server, agg };

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => console.log(`DevMetrics em http://localhost:${PORT} (badge: /badge/FrancosCorporation/repos)`));
}
