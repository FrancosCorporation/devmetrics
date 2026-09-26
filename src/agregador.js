// DevMetrics — agregação da API GitHub com cache + gráficos SVG (port do analisador CSV).
export function criarAgregador(token = '', cacheTtlMs = 5 * 60 * 1000, fetchImpl = fetch) {
  const cache = new Map(); // chave -> { dados, em }

  async function buscar(url) {
    const em = Date.now();
    const c = cache.get(url);
    if (c && em - c.em < cacheTtlMs) return c.dados;
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'devmetrics' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetchImpl(url, { headers });
    if (!r.ok) throw Object.assign(new Error(`GitHub API ${r.status}`), { codigo: 'github' });
    const dados = await r.json();
    cache.set(url, { dados, em });
    return dados;
  }

  async function repos(dono) {
    return buscar(`https://api.github.com/users/${dono}/repos?per_page=100&sort=updated`);
  }

  // agregações
  async function porLinguagem(dono) {
    const lista = await repos(dono);
    const contagem = {};
    for (const r of lista) {
      const l = r.language || 'Sem linguagem';
      contagem[l] = (contagem[l] || 0) + 1;
    }
    return Object.entries(contagem)
      .map(([linguagem, quantidade]) => ({ linguagem, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }

  async function resumo(dono) {
    const lista = await repos(dono);
    const stars = lista.reduce((t, r) => t + r.stargazers_count, 0);
    const forks = lista.reduce((t, r) => t + r.forks_count, 0);
    const publicos = lista.filter((r) => !r.fork).length;
    return { dono, totalRepos: lista.length, publicos, forks, stars };
  }

  async function topPorStars(dono, n = 5) {
    const lista = await repos(dono);
    return lista
      .filter((r) => !r.fork)
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, n)
      .map((r) => ({ nome: r.name, stars: r.stargazers_count, forks: r.forks_count, url: r.html_url }));
  }

  // badge dinâmico (SVG) — estilo shields, zero deps
  function badge(rotulo, valor, cor = '#2ea043') {
    const larguraR = rotulo.length * 7 + 12;
    const larguraV = String(valor).length * 8 + 12;
    const total = larguraR + larguraV;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img">
      <title>${rotulo}: ${valor}</title>
      <rect width="${larguraR}" height="20" fill="#2c3540"/>
      <rect x="${larguraR}" width="${larguraV}" height="20" fill="${cor}"/>
      <text x="${larguraR / 2}" y="14" text-anchor="middle" fill="#e8edf2" font-size="11" font-family="Verdana">${rotulo}</text>
      <text x="${larguraR + larguraV / 2}" y="14" text-anchor="middle" fill="#fff" font-size="11" font-weight="bold" font-family="Verdana">${valor}</text>
    </svg>`;
  }

  // barras SVG (mesma técnica do analisador CSV)
  function barras(dados, rotuloCampo, valorCampo) {
    const max = Math.max(...dados.map((d) => d[valorCampo]), 1);
    const n = dados.length;
    const largura = Math.max(320, n * 90);
    const altura = 240;
    const margemB = 70, areaH = altura - margemB - 16;
    const passo = largura / n;
    const rets = dados.map((d, i) => {
      const h = (d[valorCampo] / max) * areaH;
      const x = 40 + i * passo + 8;
      const y = altura - margemB - h;
      const nome = String(d[rotuloCampo]).length > 14 ? String(d[rotuloCampo]).slice(0, 13) + '…' : d[rotuloCampo];
      return `<rect class="barra" x="${x}" y="${y}" width="${passo - 16}" height="${h}" rx="4"><title>${d[rotuloCampo]}: ${d[valorCampo]}</title></rect>
        <text class="rotulo-valor" x="${x + (passo - 16) / 2}" y="${y - 6}" text-anchor="middle">${d[valorCampo]}</text>
        <text class="rotulo" x="${x + (passo - 16) / 2}" y="${altura - margemB + 16}" text-anchor="middle" transform="rotate(35 ${x + (passo - 16) / 2} ${altura - margemB + 16})">${nome}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}">${rets}</svg>`;
  }

  return { buscar, repos, porLinguagem, resumo, topPorStars, badge, barras };
}
