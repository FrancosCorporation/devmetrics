const $ = (selector) => document.querySelector(selector);
const SVG_NS = 'http://www.w3.org/2000/svg';
const USERNAME_PATTERN = /^[A-Za-z0-9-]{1,39}$/;

function status(text, kind = '') {
  const element = $('#estado');
  element.textContent = text;
  element.className = `status${kind ? ` ${kind}` : ''}`;
}

async function getJson(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    let message = body?.erro || `A consulta falhou (${response.status}).`;
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) message += ` Tente novamente em ${Math.ceil(retryAfter)} s.`;
    }
    throw new Error(message);
  }
  return body;
}

function elementoSvg(nome, atributos = {}, texto) {
  const elemento = document.createElementNS(SVG_NS, nome);
  for (const [chave, valor] of Object.entries(atributos)) elemento.setAttribute(chave, String(valor));
  if (texto !== undefined) elemento.textContent = String(texto);
  return elemento;
}

function renderMetricas(resumo) {
  const conteiner = $('#metricas');
  conteiner.replaceChildren();
  const metricas = [
    ['Repositórios', resumo.totalRepos],
    ['Públicos', resumo.publicos],
    ['Estrelas', resumo.stars],
    ['Forks', resumo.forks]
  ];
  for (const [label, value] of metricas) {
    const card = document.createElement('article');
    card.className = 'metric';
    const labelElement = document.createElement('span');
    labelElement.className = 'metric-label';
    labelElement.textContent = label;
    const valueElement = document.createElement('strong');
    valueElement.className = 'metric-value';
    valueElement.textContent = Number(value || 0).toLocaleString('pt-BR');
    card.append(labelElement, valueElement);
    conteiner.append(card);
  }
}

function renderLinguagens(linguagens) {
  const conteiner = $('#chart-lang');
  conteiner.replaceChildren();
  const dados = Array.isArray(linguagens) ? linguagens.slice(0, 8)
    .map((item) => ({ linguagem: String(item.linguagem ?? ''), quantidade: Number(item.quantidade) }))
    .filter((item) => Number.isFinite(item.quantidade) && item.quantidade >= 0) : [];
  if (!dados.length) {
    const vazio = document.createElement('p');
    vazio.className = 'empty-chart';
    vazio.textContent = 'Não há linguagens para exibir.';
    conteiner.append(vazio);
    return;
  }

  const largura = Math.max(320, dados.length * 90);
  const altura = 220;
  const margemB = 60;
  const areaH = altura - margemB - 18;
  const passo = largura / dados.length;
  const max = Math.max(...dados.map((item) => item.quantidade), 1);
  const svg = elementoSvg('svg', { viewBox: `0 0 ${largura} ${altura}`, width: largura, height: altura, role: 'img', 'aria-label': 'Repositórios por linguagem' });
  for (const [index, item] of dados.entries()) {
    const h = (item.quantidade / max) * areaH;
    const x = 40 + index * passo + 8;
    const y = altura - margemB - h;
    const barWidth = passo - 16;
    const center = x + barWidth / 2;
    const labelY = altura - margemB + 18;
    const nome = item.linguagem.length > 14 ? `${item.linguagem.slice(0, 13)}…` : item.linguagem;
    const barra = elementoSvg('rect', { class: 'barra', x, y, width: barWidth, height: h, rx: 4 });
    barra.append(elementoSvg('title', {}, `${item.linguagem}: ${item.quantidade}`));
    svg.append(
      barra,
      elementoSvg('text', { class: 'rotulo-valor', x: center, y: y - 6, 'text-anchor': 'middle' }, item.quantidade),
      elementoSvg('text', { class: 'rotulo', x: center, y: labelY, 'text-anchor': 'middle', transform: `rotate(35 ${center} ${labelY})` }, nome)
    );
  }
  conteiner.append(svg);
}

function renderTop(repositorios) {
  const table = $('#top');
  table.replaceChildren();
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['Repositório', 'Estrelas', 'Forks']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headerRow.append(cell);
  }
  head.append(headerRow);
  const body = document.createElement('tbody');
  for (const repo of Array.isArray(repositorios) ? repositorios : []) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const url = urlGithubSegura(repo.url);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = String(repo.nome ?? 'Repositório');
      nameCell.append(link);
    } else {
      nameCell.textContent = String(repo.nome ?? 'Repositório');
    }
    const stars = document.createElement('td');
    stars.className = 'stars';
    stars.textContent = `★ ${Number(repo.stars || 0).toLocaleString('pt-BR')}`;
    const forks = document.createElement('td');
    forks.textContent = Number(repo.forks || 0).toLocaleString('pt-BR');
    row.append(nameCell, stars, forks);
    body.append(row);
  }
  table.append(head, body);
}

function urlGithubSegura(valor) {
  try {
    const url = new URL(valor);
    return url.origin === 'https://github.com' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function renderBadges(dono) {
  const lista = $('#badge-lista');
  lista.replaceChildren();
  for (const [tipo, texto] of [['repos', 'Repositórios públicos'], ['stars', 'Estrelas']]) {
    const item = document.createElement('article');
    item.className = 'badge-item';
    const image = document.createElement('img');
    image.alt = `Badge de ${texto.toLowerCase()} para ${dono}`;
    image.src = `/badge/${encodeURIComponent(dono)}/${tipo}`;
    const code = document.createElement('code');
    code.textContent = `![${tipo}](${location.origin}/badge/${encodeURIComponent(dono)}/${tipo})`;
    item.append(image, code);
    lista.append(item);
  }
}

$('#form-usuario').addEventListener('submit', async (event) => {
  event.preventDefault();
  const dono = $('#dono').value.trim();
  if (!USERNAME_PATTERN.test(dono)) {
    $('#dashboard').hidden = true;
    $('#empty').hidden = false;
    status('Use o nome público do GitHub: até 39 letras, números ou hífens.', 'error');
    return;
  }

  const button = $('#analisar');
  button.disabled = true;
  button.textContent = 'Carregando…';
  $('#dashboard').hidden = true;
  $('#empty').hidden = true;
  status(`Buscando dados públicos de ${dono}…`);
  const ownerPath = encodeURIComponent(dono);
  try {
    const [resumo, linguagens, top] = await Promise.all([
      getJson(`/api/${ownerPath}/resumo`),
      getJson(`/api/${ownerPath}/linguagens`),
      getJson(`/api/${ownerPath}/top?n=5`)
    ]);
    renderMetricas(resumo);
    renderLinguagens(linguagens);
    renderTop(top);
    renderBadges(dono);
    $('#perfil').textContent = `@${dono}`;
    $('#dashboard').hidden = false;
    status('Métricas atualizadas a partir dos repositórios públicos.', 'success');
  } catch (error) {
    $('#empty').hidden = false;
    status(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = '⌕ Analisar';
  }
});
