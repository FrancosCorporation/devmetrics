// DevMetrics M2 — heatmap de commits + comparativo entre repos (SVG).
import { criarAgregador } from './agregador.js';

export function criarAgregadorM2(token = '', ttl = 5 * 60 * 1000, fetchImpl = fetch) {
  const agg = criarAgregador(token, ttl, fetchImpl);

  return {
    ...agg,

    // heatmap de commits: 52 semanas x 7 dias (como o gráfico de contribuições do GitHub)
    async heatmap(dono, repositorio, ano = new Date().getFullYear()) {
      const commits = await agg.buscar(`https://api.github.com/repos/${dono}/${repositorio}/commits?per_page=100&since=${ano}-01-01T00:00:00Z`);
      // agrupa por data (YYYY-MM-DD)
      const porDia = {};
      for (const c of commits) {
        const data = (c.commit?.author?.date || '').slice(0, 10);
        if (data) porDia[data] = (porDia[data] || 0) + 1;
      }
      return { dono, repositorio, ano, porDia, totalCommits: Object.values(porDia).reduce((t, v) => t + v, 0) };
    },

    // heatmap SVG: 52 colunas x 7 linhas, cor pela intensidade (0-4 níveis)
    renderHeatmap(heatmap) {
      const CEL = 12, GAP = 3;
      const largura = 60 * (CEL + GAP) + 40;
      const altura = 7 * (CEL + GAP) + 40;
      const CORES = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']; // paleta GitHub
      const dataBase = new Date(heatmap.ano, 0, 1);
      const celulas = [];
      for (let semana = 0; semana < 53; semana++) {
        for (const dia of [0, 1, 2, 3, 4, 5, 6]) {
          const d = new Date(dataBase);
          d.setDate(dataBase.getDate() + semana * 7 + dia);
          if (d.getFullYear() > heatmap.ano) continue;
          const chave = d.toISOString().slice(0, 10);
          const n = heatmap.porDia[chave] || 0;
          const nivel = n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 10 ? 3 : 4;
          celulas.push(`<rect x="${40 + semana * (CEL + GAP)}" y="${20 + dia * (CEL + GAP)}" width="${CEL}" height="${CEL}" rx="2" fill="${CORES[nivel]}"><title>${chave}: ${n} commits</title></rect>`);
        }
      }
      return `<svg viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}">${celulas.join('')}</svg>`;
    },

    // comparativo: 2+ repos lado a lado (stars, forks, linguagem, issues)
    async comparar(dono, nomesRepos) {
      const linhas = [];
      for (const nome of nomesRepos) {
        try {
          const r = await agg.buscar(`https://api.github.com/repos/${dono}/${nome}`);
          linhas.push({ nome: r.name, stars: r.stargazers_count, forks: r.forks_count, linguagem: r.language || '—', issues: r.open_issues_count, atualizado: (r.pushed_at || '').slice(0, 10) });
        } catch {
          linhas.push({ nome, erro: 'indisponível' });
        }
      }
      return linhas;
    },

    // tabela de comparativo (markdown p/ README!)
    renderComparativo(linhas) {
      const cab = `| Repo | ⭐ | Forks | Linguagem | Issues | Atualizado |\n|---|---|---|---|---|---|`;
      const corpo = linhas.map((l) => l.erro
        ? `| ${l.nome} | — | — | — | — | ${l.erro} |`
        : `| ${l.nome} | ${l.stars} | ${l.forks} | ${l.linguagem} | ${l.issues} | ${l.atualizado} |`).join('\n');
      return cab + '\n' + corpo;
    }
  };
}
