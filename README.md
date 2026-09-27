# DevMetrics — GitHub Analytics Dashboard

![Status](https://img.shields.io/badge/M1%20%2B%20M2-funcionando%20(9%2F9%20testes)-brightgreen)
![CI](https://img.shields.io/badge/CI-test%20%2B%20license%20check-blue)
![Node](https://img.shields.io/badge/Node-%3E%3D18-green?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

A full-stack GitHub analytics dashboard: API that aggregates your repositories
(languages, stars, commits/week via GitHub API with cache) + a dashboard with
pure-SVG charts (bars/line/donut) + dynamic badges for READMEs.

> 🇧🇷 Dashboard de analytics do GitHub: API que agrega seus repos (linguagens, stars,
> commits/semana, com cache) + dashboard com charts SVG puro + badges dinâmicos.

## Features

- [x] **M1a** — Aggregation API (resumo/linguagens/top) com cache TTL + `fetchImpl` injetável (5/5 tests)
- [x] **M1b** — Dashboard SVG puro (barras de linguagem, top stars) + **badges dinâmicos**: `/badge/<user>/repos` e `/badge/<user>/stars`
- [x] **M2** — **Heatmap de commits** (52 semanas x 7 dias, paleta GitHub) + **comparativo entre
      repos** (tabela markdown gerada!) + tratamento de erro de repo inexistente — 9/9 testes

## Quick start

```bash
docker compose up   # painel em http://localhost:3600
```

## Badge dinâmico (cole no seu README!)

```markdown
![repos](https://seu-host:3600/badge/FrancosCorporation/repos)
![stars](https://seu-host:3600/badge/FrancosCorporation/stars)
```

Live agora contra a conta real: 72 repos / 66 públicos agregados com cache de 5 min.

## Built with

- SVG charts + parser proven in
  [projeto_integrador_analisador_csv](https://github.com/FrancosCorporation/projeto_integrador_analisador_csv) (18/18 tests)
- Concept reference: [anuraghazra/github-readme-stats](https://github.com/anuraghazra/github-readme-stats) (79.8k⭐)

## License

MIT — Rodolfo Franco ([FrancosCorporation](https://github.com/FrancosCorporation))
