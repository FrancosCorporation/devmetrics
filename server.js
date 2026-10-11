// DevMetrics — API pública limitada, painel e badges SVG seguros.
import express from 'express';
import http from 'node:http';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { criarAgregador } from './src/agregador.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_ROOT = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3600);
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim();
if (process.env.NODE_ENV === 'production' && !GITHUB_TOKEN) {
  throw new Error('Configure GITHUB_TOKEN antes de iniciar o DevMetrics em produção.');
}

const agg = criarAgregador(GITHUB_TOKEN);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  next();
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validarDono(req, res, next) {
  const dono = req.params.dono;
  if (typeof dono !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(dono)) {
    return res.status(400).json({ erro: 'O usuário deve ter até 39 letras, números ou hífens.' });
  }
  next();
}

function criarRateLimit({ limite = 60, janelaMs = 60_000, maxChaves = 10_000 } = {}) {
  const janelas = new Map();
  return (req, res, next) => {
    const agora = Date.now();
    const chave = req.ip || req.socket.remoteAddress || 'unknown';
    let janela = janelas.get(chave);
    if (!janela || janela.expiraEm <= agora) {
      if (janelas.size >= maxChaves) {
        for (const [ip, estado] of janelas) if (estado.expiraEm <= agora) janelas.delete(ip);
        if (janelas.size >= maxChaves) {
          res.setHeader('Retry-After', '60');
          return res.status(429).json({ erro: 'Muitas origens ativas. Tente novamente em alguns minutos.' });
        }
      }
      janela = { total: 0, expiraEm: agora + janelaMs };
      janelas.set(chave, janela);
    }
    janela.total += 1;
    if (janela.total > limite) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((janela.expiraEm - agora) / 1000))));
      return res.status(429).json({ erro: 'Limite de consultas atingido. Tente novamente mais tarde.' });
    }
    next();
  };
}

const limiteGithub = criarRateLimit();
app.use('/api/:dono', validarDono, limiteGithub);
app.use('/badge/:dono', validarDono, limiteGithub);

function enviarErroApi(res, error) {
  const status = Number.isInteger(error.status) ? error.status : 502;
  if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
  res.status(status).json({ erro: error.message || 'Não foi possível consultar o GitHub.' });
}

function cacheJson(res) {
  res.setHeader('Cache-Control', `public, max-age=${Math.floor(agg.cacheTtlMs / 1000)}`);
}

app.get('/api/:dono/resumo', asyncRoute(async (req, res) => {
  try {
    const dados = await agg.resumo(req.params.dono);
    cacheJson(res);
    res.json(dados);
  } catch (error) { enviarErroApi(res, error); }
}));

app.get('/api/:dono/linguagens', asyncRoute(async (req, res) => {
  try {
    const dados = await agg.porLinguagem(req.params.dono);
    cacheJson(res);
    res.json(dados);
  } catch (error) { enviarErroApi(res, error); }
}));

app.get('/api/:dono/top', asyncRoute(async (req, res) => {
  try {
    const valor = req.query.n === undefined ? 5 : Number(req.query.n);
    const quantidade = Number.isNaN(valor) ? 5 : Math.min(Math.max(Math.trunc(valor), 1), 50);
    const dados = await agg.topPorStars(req.params.dono, quantidade);
    cacheJson(res);
    res.json(dados);
  } catch (error) { enviarErroApi(res, error); }
}));

app.get('/badge/:dono/:tipo', asyncRoute(async (req, res) => {
  if (!['repos', 'stars'].includes(req.params.tipo)) {
    return res.status(400).type('text/plain').send('Tipo de badge inválido.');
  }
  try {
    const resumo = await agg.resumo(req.params.dono);
    const svg = req.params.tipo === 'repos'
      ? agg.badge('repos', resumo.publicos)
      : agg.badge('stars', resumo.stars, '#d29922');
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'none'; sandbox");
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(agg.cacheTtlMs / 1000)}`);
    res.send(svg);
  } catch (error) {
    if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
    res.status(Number.isInteger(error.status) ? error.status : 502).type('text/plain').send('Badge indisponível.');
  }
}));

app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota da API não encontrada.' }));
app.use('/badge', (_req, res) => res.status(404).type('text/plain').send('Badge não encontrada.'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};
app.use(asyncRoute(async (req, res) => {
  const caminho = resolve(PUBLIC_ROOT, `.${req.path === '/' ? '/index.html' : req.path}`);
  const relativo = relative(PUBLIC_ROOT, caminho);
  if (relativo.startsWith('..') || isAbsolute(relativo)) {
    return res.status(404).type('text/plain').send('Arquivo não encontrado.');
  }
  try {
    const dados = await readFile(caminho);
    res.setHeader('Content-Type', MIME[extname(caminho)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(dados);
  } catch {
    res.status(404).type('text/plain').send('Arquivo não encontrado.');
  }
}));

const server = http.createServer(app);
export { server, agg };

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => console.log(`DevMetrics em http://localhost:${PORT} (badge: /badge/FrancosCorporation/repos)`));
}
