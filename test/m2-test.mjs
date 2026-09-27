// Testes M2 do DevMetrics — heatmap real, render SVG, comparativo entre repos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAgregadorM2 } from '../src/m2.js';

const DONO = 'FrancosCorporation';

test('M2: heatmap real do repo (commits agrupados por dia)', async () => {
  const agg = criarAgregadorM2();
  const h = await agg.heatmap(DONO, 'kanbanex', 2026);
  assert.equal(h.repositorio, 'kanbanex');
  assert.ok(h.totalCommits >= 5, `kanbanex tem commits: ${h.totalCommits}`);
  assert.ok(Object.keys(h.porDia).length >= 1);
});

test('M2: renderHeatmap gera SVG com células coloridas', async () => {
  const agg = criarAgregadorM2();
  const h = await agg.heatmap(DONO, 'kanbanex', 2026);
  const svg = agg.renderHeatmap(h);
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('#39d353') || svg.includes('#006d32') || svg.includes('#161b22'), 'paleta GitHub');
  assert.ok(svg.length > 2000, '52 semanas x 7 dias de células');
});

test('M2: comparativo entre 2+ repos reais', async () => {
  const agg = criarAgregadorM2();
  const linhas = await agg.comparar(DONO, ['kanbanex', 'code-review-bot', 'inexistente-xyz']);
  assert.equal(linhas.length, 3);
  const kanbanex = linhas.find((l) => l.nome === 'kanbanex');
  assert.ok(kanbanex && !kanbanex.erro);
  const fantasma = linhas.find((l) => l.nome === 'inexistente-xyz');
  assert.equal(fantasma.erro, 'indisponível', 'repo inexistente tratado');
});

test('M2: renderComparativo gera tabela markdown', async () => {
  const agg = criarAgregadorM2();
  const linhas = await agg.comparar(DONO, ['kanbanex', 'featureflags']);
  const md = agg.renderComparativo(linhas);
  assert.ok(md.startsWith('| Repo |'));
  assert.ok(md.includes('kanbanex'));
  assert.ok(md.includes('featureflags'));
});
