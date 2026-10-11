// DevMetrics — agregação da API GitHub com cache + gráficos SVG (port do analisador CSV).
export function criarAgregador(token = '', cacheTtlMs = 5 * 60 * 1000, fetchImpl = fetch) {
  const cache = new Map(); // chave normalizada -> { dados, em, etag }
  const pendentes = new Map();

  async function buscar(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.github.com') {
      throw Object.assign(new Error('A consulta precisa usar api.github.com por HTTPS.'), { codigo: 'url_invalida', status: 400 });
    }
    const chave = `${parsed.origin}${parsed.pathname.toLowerCase()}${parsed.search}`;
    const em = Date.now();
    const c = cache.get(chave);
    if (c && em - c.em < cacheTtlMs) return c.dados;
    if (pendentes.has(chave)) return pendentes.get(chave);
    const consulta = consultarGitHub(parsed, chave, c, em);
    pendentes.set(chave, consulta);
    try { return await consulta; }
    finally { if (pendentes.get(chave) === consulta) pendentes.delete(chave); }
  }

  async function consultarGitHub(parsed, chave, c, em) {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'devmetrics' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (c?.etag) headers['If-None-Match'] = c.etag;
    let r;
    try {
      r = await fetchImpl(parsed.toString(), { headers });
    } catch {
      throw Object.assign(new Error('Não foi possível conectar à API do GitHub.'), { codigo: 'github', status: 502 });
    }
    if (r.status === 304 && c) {
      c.em = em;
      return c.dados;
    }
    if (!r.ok) {
      if (r.status === 404) throw Object.assign(new Error('Usuário ou repositório não encontrado no GitHub.'), { codigo: 'not_found', status: 404 });
      const restante = r.headers?.get?.('x-ratelimit-remaining');
      const temRetryAfter = Boolean(r.headers?.get?.('retry-after'));
      if (r.status === 429 || (r.status === 403 && (restante === '0' || temRetryAfter))) {
        throw Object.assign(new Error('A cota da API do GitHub foi atingida. Tente novamente mais tarde.'), {
          codigo: 'github_rate_limit',
          status: 429,
          retryAfter: segundosParaRetry(r.headers) || 60
        });
      }
      if (r.status === 403) throw Object.assign(new Error('O GitHub recusou a consulta. Confira a permissão do token.'), { codigo: 'github_forbidden', status: 403 });
      throw Object.assign(new Error('A API do GitHub está indisponível.'), { codigo: 'github', status: 502 });
    }
    let dados;
    try { dados = await r.json(); }
    catch { throw Object.assign(new Error('A API do GitHub devolveu uma resposta inválida.'), { codigo: 'github', status: 502 }); }
    if (!c && cache.size >= 2_000) cache.delete(cache.keys().next().value);
    cache.set(chave, { dados, em, etag: r.headers?.get?.('etag') || '' });
    return dados;
  }

  async function repos(dono) {
    return buscar(`https://api.github.com/users/${encodeURIComponent(dono)}/repos?per_page=100&sort=updated`);
  }

  // agregações
  async function porLinguagem(dono) {
    const lista = await repos(dono);
    const contagem = Object.create(null);
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
    n = Number.isInteger(n) ? Math.min(Math.max(n, 1), 50) : 5;
    const lista = await repos(dono);
    return lista
      .filter((r) => !r.fork)
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, n)
      .map((r) => ({ nome: r.name, stars: r.stargazers_count, forks: r.forks_count, url: r.html_url }));
  }

  // badge dinâmico (SVG) — estilo shields, zero deps
  function badge(rotulo, valor, cor = '#2ea043') {
    const label = String(rotulo).slice(0, 120);
    const value = String(valor).slice(0, 80);
    const color = /^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(String(cor)) ? String(cor) : '#2ea043';
    const larguraR = label.length * 7 + 12;
    const larguraV = value.length * 8 + 12;
    const total = larguraR + larguraV;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img">
      <title>${escapeXml(label)}: ${escapeXml(value)}</title>
      <rect width="${larguraR}" height="20" fill="#2c3540"/>
      <rect x="${larguraR}" width="${larguraV}" height="20" fill="${color}"/>
      <text x="${larguraR / 2}" y="14" text-anchor="middle" fill="#e8edf2" font-size="11" font-family="Verdana">${escapeXml(label)}</text>
      <text x="${larguraR + larguraV / 2}" y="14" text-anchor="middle" fill="#fff" font-size="11" font-weight="bold" font-family="Verdana">${escapeXml(value)}</text>
    </svg>`;
  }

  // barras SVG (mesma técnica do analisador CSV)
  function barras(dados, rotuloCampo, valorCampo) {
    const linhas = (Array.isArray(dados) ? dados : [])
      .map((d) => ({ ...d, [rotuloCampo]: String(d?.[rotuloCampo] ?? '').slice(0, 200), [valorCampo]: Number(d?.[valorCampo]) }))
      .filter((d) => Number.isFinite(d[valorCampo]) && d[valorCampo] >= 0);
    const max = Math.max(...linhas.map((d) => d[valorCampo]), 1);
    const n = linhas.length;
    const largura = Math.max(320, n * 90);
    const altura = 240;
    const margemB = 70, areaH = altura - margemB - 16;
    if (!n) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}"></svg>`;
    const passo = largura / n;
    const rets = linhas.map((d, i) => {
      const h = (d[valorCampo] / max) * areaH;
      const x = 40 + i * passo + 8;
      const y = altura - margemB - h;
      const nome = String(d[rotuloCampo]).length > 14 ? String(d[rotuloCampo]).slice(0, 13) + '…' : d[rotuloCampo];
      return `<rect class="barra" x="${x}" y="${y}" width="${passo - 16}" height="${h}" rx="4"><title>${escapeXml(d[rotuloCampo])}: ${d[valorCampo]}</title></rect>
        <text class="rotulo-valor" x="${x + (passo - 16) / 2}" y="${y - 6}" text-anchor="middle">${d[valorCampo]}</text>
        <text class="rotulo" x="${x + (passo - 16) / 2}" y="${altura - margemB + 16}" text-anchor="middle" transform="rotate(35 ${x + (passo - 16) / 2} ${altura - margemB + 16})">${escapeXml(nome)}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}">${rets}</svg>`;
  }

  return { buscar, repos, porLinguagem, resumo, topPorStars, badge, barras, cacheTtlMs };
}

function segundosParaRetry(headers) {
  const retry = headers?.get?.('retry-after');
  if (retry) {
    const numero = Number(retry);
    if (Number.isFinite(numero) && numero > 0) return Math.ceil(numero);
    const data = Date.parse(retry);
    if (Number.isFinite(data)) return Math.max(1, Math.ceil((data - Date.now()) / 1000));
  }
  const reset = Number(headers?.get?.('x-ratelimit-reset'));
  return Number.isFinite(reset) && reset > 0 ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : 0;
}

function escapeXml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
