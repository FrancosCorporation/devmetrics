# DevMetrics

Painel para consultar métricas de repositórios públicos do GitHub: quantidade de repositórios, estrelas, forks, linguagens e projetos mais estrelados. Também gera badges SVG que podem ser usados em READMEs.

## Iniciar com Docker Compose

Use um token fine-grained do GitHub com acesso somente de leitura a metadados de repositórios públicos. Copie o exemplo e informe o token:

```bash
cp .env.example .env
```

```dotenv
GITHUB_TOKEN=cole_o_token_aqui
```

Depois inicie o serviço:

```bash
docker compose up --build
```

Abra `http://localhost:3600`. A porta publicada fica acessível apenas em `127.0.0.1`; use um proxy reverso com TLS para expor o serviço remotamente.

## Iniciar localmente

```bash
npm install
GITHUB_TOKEN="seu-token" npm start
```

Em desenvolvimento, o token é opcional, mas a API pública do GitHub aplica uma cota menor. Em produção (`NODE_ENV=production`), a aplicação não inicia sem `GITHUB_TOKEN`.

## Rotas

- `GET /api/:dono/resumo` — total de repositórios, públicos, estrelas e forks.
- `GET /api/:dono/linguagens` — contagem de repositórios por linguagem.
- `GET /api/:dono/top?n=5` — até 50 repositórios públicos mais estrelados.
- `GET /badge/:dono/repos` e `GET /badge/:dono/stars` — imagens SVG para READMEs.

O nome do usuário aceita letras, números e hífens, até 39 caracteres. A API limita consultas a 60 por minuto por endereço de origem. Respostas positivas usam cache de cinco minutos e revalidação por ETag; respostas de erro não entram no cache. Erros de cota do GitHub retornam `429` e `Retry-After` quando disponível; usuários ou repositórios ausentes retornam `404`.

Exemplo de badge:

```markdown
![repositórios](https://seu-host/badge/FrancosCorporation/repos)
![estrelas](https://seu-host/badge/FrancosCorporation/stars)
```

## Privacidade e segurança

- O dashboard consulta apenas dados públicos e não exige login. O token do GitHub permanece no servidor e é usado apenas para chamadas à API.
- Valores vindos do GitHub são inseridos na interface com APIs de texto do DOM. Os SVGs escapam texto e restringem cores; as respostas têm cabeçalhos de segurança.
- Não configure permissões de escrita no token. Mantenha `.env` fora do Git e não compartilhe o segredo.

## Desenvolvimento

O adaptador de dados e os gráficos SVG sem dependências ficam em `src/agregador.js`; as funções M2 ficam em `src/m2.js`; o painel em `public/`.

## Licença

MIT — Rodolfo Franco ([FrancosCorporation](https://github.com/FrancosCorporation)).
