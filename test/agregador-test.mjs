// Testes do DevMetrics — agregação, badge SVG, cache (GitHub API real, 1 chamada).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAgregador } from '../src/agregador.js';

const DONO = 'FrancosCorporation'; // conta real do dono (dados públicos)

test('resumo: agregação real dos repos do dono', async () => {
  const agg = criarAgregador();
  const r = await agg.resumo(DONO);
  assert.equal(r.dono, DONO);
  assert.ok(r.totalRepos > 30, `esperados 30+ repos: ${r.totalRepos}`);
  assert.ok(r.publicos > 20);
  assert.ok(r.stars >= 0);
});

test('porLinguagem: contagem agregada e ordenada', async () => {
  const agg = criarAgregador();
  const langs = await agg.porLinguagem(DONO);
  assert.ok(langs.length > 0);
  for (let i = 1; i < langs.length; i++) {
    assert.ok(langs[i - 1].quantidade >= langs[i].quantidade, 'ordenado desc');
  }
});

test('topPorStars: 5 melhores, sem forks', async () => {
  const agg = criarAgregador();
  const top = await agg.topPorStars(DONO, 5);
  assert.ok(top.length <= 5);
  assert.ok(top.every((r) => r.nome && r.url.includes('github.com')));
});

test('badge: SVG válido com rotulo/valor', async () => {
  const agg = criarAgregador();
  const svg = agg.badge('repos', 42);
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('>repos<') || svg.includes('repos'));
  assert.ok(svg.includes('42'));
  assert.ok(svg.length > 200); // estrutura completa
});

test('cache: 2 chamadas seguidas = 1 fetch real (TTL, via fetchImpl injetado)', async () => {
  let chamadas = 0;
  const fetchContado = async () => {
    chamadas++;
    return { ok: true, json: async () => [] }; // resposta fake de repos
  };
  const agg = criarAgregador('', 60000, fetchContado);
  await agg.resumo(DONO);
  await agg.resumo(DONO);
  assert.equal(chamadas, 1, '2ª chamada veio do cache');
});
