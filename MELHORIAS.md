# MELHORIAS — devmetrics

> **Gerado por análise de código em 2026-10-02** · Stack: Node 22 (Express), sem framework de front (vanilla JS)
> Branch `main` · 403 LOC · testes presentes · CI presente
>
> **Este arquivo é um plano de execução.** Cada item tem ID, `arquivo:linha`, mudança exata,
> critério de aceite e comando de verificação.

---

## 0. Como usar este documento

1. Execute na ordem **P0 → P1 → P2 → P3**, respeitando as ondas da §8.
2. Ao terminar um item: marque `- [x]`, rode o **Verificação**, comite `fix(<ID>): descrição`.
3. **Não reescreva a agregação nem o desenho SVG.** `porLinguagem`/`resumo`/`topPorStars`
   (`agregador.js:27-50`) e o SVG "puro" (zero dependência) são bons e testados.
4. **O `dono` é um parâmetro de usuário** — antes de chamar algo de SSRF, note que a URL é sempre
   `api.github.com` (host fixo, `agregador.js:19`). O item `BUG-03` é de **validação de entrada**, não
   de SSRF clássico; trate-o com essa precisão.
5. **Idioma:** português; commits em inglês com `fix:`/`feat:`/`docs:`.

---

## 1. Diagnóstico executivo

Dashboard de métricas do GitHub: agregação da API (com cache em memória), gráficos SVG gerados no
servidor e badges dinâmicos para READMEs. Front vanilla JS que injeta HTML.

**O que está bem (não reaça):**

| Item | Evidência |
|---|---|
| Cache em memória com TTL | `agregador.js:2` (5 min) |
| `fetchImpl` injetável (testável sem rede) | `agregador.js:2` (parâmetro) |
| URL do GitHub com **host fixo** | `agregador.js:19` (`https://api.github.com/users/${dono}/repos`) |
| Badge tem `Cache-Control: max-age=300` | `server.js:32` |
| `topPorStars` filtra fork | `agregador.js:44` |
| SVG sem dependência (zero deps) | `agregador.js:53-83` |
| Erro 502 mapeado quando a API do GitHub falha | `server.js:18` (`e.codigo === 'github'`) |
| Escopo de `n` limitado (top N) | `server.js:25` (`Number(req.query.n) || 5`) — **veja `BUG-02`** |
| Path traversal bloqueado no estático | `server.js:53` |

**O que está quebrado:**

1. **XSS no dashboard**: `r.nome`, `r.url` e `d.linguagem` (dados do GitHub, de repos que o usuário
  指定) entram em `innerHTML` (`public/index.html:61-62,77-79`) **sem escape**. Repo com nome malicioso
   = script executado no painel. O SVG do servidor (`agregador.js`) interpola o mesmo dado sem escape.
2. **`n` do top sem teto**: `Number(req.query.n) || 5` aceita `n=100000` (o GitHub devolve até 100,
   mas o server processa o slice pedido — e um `n` enorme aloca array). `BUG-02`.
3. **`dono` sem validação**: nenhum formato é checado antes de ir para a URL e para o `innerHTML`
   (`dono` também é injetado em `src=` de badge, linha 66).

---

## 2. Tabela de prioridades

| ID | Título | Sev | Arquivo | Depende de |
|---|---|---|---|---|
| SEC-01 | XSS no dashboard: `nome`/`url` de repo em `innerHTML` sem escape | **P0** | `public/index.html:61-62,77` | — |
| SEC-02 | XSS no SVG do servidor: dado de repo interpolado sem escape | **P0** | `src/agregador.js:61,77-81` | — |
| SEC-03 | `dono` não validado (vai para URL e para `src=` do badge) | **P1** | `server.js:16,66` | — |
| SEC-04 | Badge SVG interpola rótulo/valor sem escape (`dono` controlado) | **P1** | `agregador.js:55-64` | SEC-02 |
| BUG-01 | `n` do top sem teto (alocação) | **P2** | `server.js:25` | — |
| BUG-03 | Token do GitHub (opcional) — sem token, sem cache compartilhado | **P2** | `server.js:11` | — |
| BUG-04 | Erro 502 genérico semRetry/rate-limit do GitHub | **P2** | `agregador.js:11` | — |
| IMP-01 | Cache não invalida ao reavaliar (mesmo TTL fixo) | **P2** | `agregador.js:3-8` | — |
| IMP-02 | Sem `Content-Type` charset no SVG/badges | **P2** | `server.js:32` | — |
| TEST-01 | Sem teste de escape (regressão de XSS) | **P1** | `test/` | SEC-01, SEC-02 |
| DEVOPS-01 | Sem rate limit nas rotas do GitHub (consumo de cota) | **P1** | `server.js:16` | — |
| DOC-01 | README não documenta cota/rate limit do GitHub | **P3** | `README.md` | DEVOPS-01 |
| DOC-02 | Falta `SECURITY.md` | **P3** | *(ausente)* | SEC-01 |

**Placar: 2 P0 · 4 P1 · 5 P2 · 3 P3 = 14 itens.**

---

## 3. Segurança
### SEC-01 · XSS no dashboard: `nome`/`url` de repo em `innerHTML` sem escape · [P0]

- **Arquivo:** `public/index.html:61-62` e `:77-79`
- **Evidência:**
  ```javascript
  document.getElementById('top').innerHTML = '<tr><th>Repo</th>...</tr>' +
    top.map((r) => `<tr><td><a href="${r.url}">${r.nome}</a></td><td>${r.stars}</td>...`).join('');
  ...
  return `<rect ...><title>${d.linguagem}: ${d.quantidade}</title></rect>  // linha 77
  ```
  `r.nome`, `r.url` e `d.linguagem` vêm da **API do GitHub** (via `/api/:dono/top` e `/linguagens`) e
  são interpolados direto em `innerHTML`/`<a href>`/`<title>` — **sem `escapeHtml` nem
  `textContent`**.
- **Impacto:** **XSS armazenado/refletido**: um repositório cujo nome contenha HTML/script (ou um dono
  cujo repo foi assim) executa JavaScript no painel de quem consulta. No dashboard, o JS pode ler o
  DOM, fazer `fetch` com as permissões do navegador de quem abriu — e o painel chama API com o
  `GITHUB_TOKEN` do servidor (indireto). Também `href="${r.url}"` permite `javascript:` URL. Note
  que isto é XSS **de dado externo** (repo do GitHub), não só self-XSS.
- **Mudança:** (1) **nunca interpolar dado em `innerHTML`**. Usar construção de DOM com
  `textContent` para texto e `setAttribute('href', ...)` para link (validando o scheme `https`); ou
  (2) aplicar `escapeHtml()` em **todo** valor interpolado (`<`, `>`, `&`, `"`, `'`); (3) para o SVG
  injetado, escapar também o conteúdo de `<title>`/`<text>`.
- **Aceite:** repo com nome `<img src=x onerror=alert(1)>` é renderizado como **texto**, sem executar.
- **Verificação:**
  ```bash
  # criar/usar um repo de teste com nome malicioso e carregar o painel; nenhum script executa
  # (teste automatizado em TEST-01)
  ```

### SEC-02 · XSS no SVG do servidor: dado de repo interpolado sem escape · [P0]

- **Arquivo:** `src/agregador.js:61` (`<title>${rotulo}: ${valor}</title>`) e `:77-81` (barras:
  `<title>${d[rotuloCampo]}` e `<text>${nome}`)
- **Evidência:** `badge()` e `barras()` montam SVG por template string com `rotulo`/`valor`/`nome`
  interpolados, sem escape. `rotulo` vem de literal interno, mas `nome`/`d.linguagem` em `barras`
  vêm do GitHub; e `badge` é chamado com dados que **dependem do `dono`** (via `server.js`).
- **Impacto:** SVG servido com `Content-Type: image/svg+xml` é **XML** — e SVG inline servido num
  navegador executa `<script>` e `on*` handlers. Servido via `<img src="/badge/...">` (como o painel
  faz, linha 66), o browser trata como imagem e não executa script — **mas** a rota pode ser aberta
  diretamente (o SVG servido como documento executa). Combinado com `SEC-04` (rótulo controlado),
  é XSS servível.
- **Mudança:** (1) escapar valores interpolados no SVG (`&`, `<`, `>`, `"`, `'`); (2) garantir que
  só literais internos (rotulos fixos como `repos`/`stars`) entrem como texto — dados numéricos
  continuam; (3) para dados que venham do GitHub, escapar sempre.
- **Aceite:** SVG com valor contendo `<` é servido escapado (`&lt;`), não executa.
- **Verificação:**
  ```bash
  curl -s 'http://localhost:3600/badge/<dono>/repos' | grep -q '<' && echo 'ver escapado, nao bruto'
  # nenhum '<script' / 'onload' cru no corpo do SVG
  ```

### SEC-03 / BUG-02 · `dono` não validado (URL e `src=` do badge) · [P1]

- **Arquivo:** `server.js:16,20,24,30` · `public/index.html:48,56,60,66`
- **Evidência:** `req.params.dono` vai direto para `agg.resumo(dono)` → URL da API do GitHub
  (`agregador.js:19`) e para `<img src="/badge/${dono}/repos">` (`public/index.html:66`). No front,
  `fetch(\`/api/${dono}/resumo\`)` sem `encodeURIComponent` (linha 48). Nenhum formato é validado
  (GitHub username = `[A-Za-z0-9-]`, máx 39).
- **Impacto:** (a) **não é SSRF clássico** — o host é fixo (`api.github.com`), então não há redirect
  para rede interna (corrigindo a intuição comum); (b) mas um `dono` com caracteres especiais
  quebra/manipula a URL (encoding) e, no front, `dono` não codificado pode injetar query extra;
  (c) no badge `src`, um `dono` com aspas/`>` (se não codificado na URL) pode quebrar o atributo
  HTML —Combining com `SEC-01`.
- **Mudança:** (1) validar `dono` contra `/^[A-Za-z0-9-]{1,39}$/` no servidor (400 se não casar);
  (2) `encodeURIComponent(dono)` em toda interpolação de URL (front e servidor); (3) para o `img src`,
  garantir que o valor já vem codificado.
- **Aceite:** `dono` inválido → `400`; nome com caractere especial nunca chega ao `src=` cru.
- **Verificação:**
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3600/api/%3Cscript%3E/resumo'   # 400
  ```

### SEC-04 · Badge SVG interpola rótulo/valor sem escape · [P1]

- **Arquivo:** `src/agregador.js:55-64` (`badge`) · `server.js:33-38`
- **Evidência:** `badge(rotulo, valor, cor)` interpola `rotulo` e `valor` no `<title>` e `<text>`.
  Hoje `rotulo` é literal (`'repos'`/`'stars'`, `server.js:35,38`) e `valor` é número — mas a função
  é genérica e **sem escape**, então qualquer chamada futura com dado externo reabre o XSS.
- **Impacto:** é a **função** vulnerável, mesmo que hoje seja chamada com dados seguros (ver `SEC-02`
  para o caso do SVG). Vulnerabilidade latente num helper de geração de SVG.
- **Mudança:** escapar `rotulo`/`valor`/`cor` dentro de `badge` (defesa em profundidade — mesmo que
  hoje sejam literais); validar `cor` contra `^#[0-9a-fA-F]{3,8}$`.
- **Aceite:** `badge('<x>', '1')` devolve SVG escapado.
- **Verificação:**
  ```bash
  node -e "import('./src/agregador.js').then(m=>{const a=m.criarAgregador();const s=a.badge('<script>','1');console.log(s.includes('<script>')?'FALHA':'OK')})"
  ```
---

## 4. Bugs e defeitos funcionais

### BUG-01 · `n` do top sem teto · [P2]

- **Arquivo:** `server.js:25` (`topPorStars(req.params.dono, Number(req.query.n) || 5)`)
- **Evidência:** `n` do query string vai direto, sem teto nem validação.
- **Impacto:** `?n=1000000` faz o servidor processar slice enorme; `?n=-1` ou `?n=abc` cai no `|| 5`
  mas `n` negativo quebra o `.slice(0, n)`. Alocação desnecessária com entrada não validada.
- **Mudança:** `const n = Math.min(Math.max(Number(req.query.n) || 5, 1), 50);` (ou teto 100).
- **Aceite:** `n=1000000` é limitado; `n=-1` cai no mínimo.
- **Verificação:**
  ```bash
  curl -s 'http://localhost:3600/api/FrancosCorporation/top?n=-1' | jq length   # >= 0, sem erro
  curl -s 'http://localhost:3600/api/FrancosCorporation/top?n=99999' | jq length   # <= 50
  ```

### BUG-03 · Token do GitHub opcional — sem token, cota baixa · [P2]

- **Arquivo:** `server.js:11` (`criarAgregador(process.env.GITHUB_TOKEN || '')`) · `agregador.js:10`
- **Evidência:** se `GITHUB_TOKEN` não estiver setado, o `Authorization` não é enviado
  (`agregador.js:9-10`), e a API do GitHub sem token cai no limite de 60 req/h por IP.
- **Impacto:** sem token, o dashboard quebra (`502`) com pouco uso — e como não há rate limit
  próprio (`DEVOPS-01`), um laço de consultas不同的 `dono` estoura a cota por IP **rápido**,avençando
  o GitHub.
- **Mudança:** (1) documentar/exigir `GITHUB_TOKEN` (com scopes mínimos: `public_repo` de leitura);
  (2) fail-fast no boot se ausente em produção (não degradar silenciosamente); (3) `DEVOPS-01`.
- **Aceite:** sem token em produção, a API falha alto com mensagem clara.
- **Verificação:** `unset GITHUB_TOKEN; node server.js 2>&1 | grep -qi 'GITHUB_TOKEN' && echo OK`.

### BUG-04 · Erro 502 sem tratar rate limit do GitHub · [P2]

- **Arquivo:** `src/agregador.js:10-12`
- **Evidência:** `if (!r.ok) throw Object.assign(new Error(\`GitHub API ${r.status}\`), {codigo:'github'})`
  — trata 403/404/500 igual; o `X-RateLimit-Remaining` do GitHub é ignorado.
- **Impacto:** quando a cota acaba, todas as consultas começam a devolver `502` genérico, sem
  distinguir "dono não existe" (404) de "cota estourada" (403) — diagnóstico ruim em produção, e o
  cache (5 min) faz o erro persistir mesmo depois de liberar cota.
- **Mudança:** (1) mapear 404 → `404` (dono não encontrado), 403/429 → `429`/`503` com `Retry-After`
  do GitHub; (2) reduzir TTL do cache quando `X-RateLimit-Remaining` está baixo; (3) não cachear
  resposta de erro.
- **Aceite:** 404 → `404`; rate limit → `429` com Retry-After; erro não entra no cache.
- **Verificação:**
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3600/api/naoexiste-xyz/resumo   # 404
  ```

---

## 5. Qualidade: testes, arquitetura e observabilidade

### TEST-01 · Sem teste de escape (regressão de XSS) · [P1]

- **Arquivo:** `test/` (existente; cobre agregação, não escape)
- **Evidência:** nenhum teste verifica que dado malicioso é escapado em `badge`/`barras` nem no front.
- **Impacto:** os 2 P0 de XSS podem voltar sem teste que pegue — especialmente no front, que não tem
  teste nenhum hoje.
- **Mudança:** (1) testar `badge`/`barras` com valor contendo `<script>`/`&` → escapado;
  (2) testar `avaliar`... (n/a aqui) — no front, asserts de que `nome` malicioso vira texto (via
  jsdom ou um teste de integração leve).
- **Aceite:** `npm test` inclui casos de escape e falha se as funções voltarem a interpolar cru.
- **Verificação:**
  ```bash
  npm test 2>&1 | tail -2
  ```

### IMP-01 · Cache não invalida ao reavaliar · [P2]

- **Arquivo:** `src/agregador.js:3-8`
- **Evidência:** TTL fixo de 5 min; sem invalidação por mudança (GitHub é eventual, então é OK, mas
  não há `max-age` coerente entre server e cache).
- **Impacto:** menor. O dado do GitHub muda devagar; 5 min é razoável. O item é mais "alinhar TTL de
  resposta HTTP com o TTL do cache".
- **Mudança:** (1) definir uma constante `TTL` e reutilizá-la; (2) expor `Cache-Control` na API JSON
  também (hoje só o badge tem, `server.js:32`).
- **Aceite:** API JSON traz `Cache-Control` coerente com o TTL interno.
- **Verificação:** `curl -sI http://localhost:3600/api/x/resumo | grep -i cache-control`.

### IMP-02 · Sem `charset` no Content-Type do SVG · [P2]

- **Arquivo:** `server.js:32` (`'Content-Type': 'image/svg+xml'`)
- **Evidência:** sem `; charset=utf-8`.
- **Impacto:** o SVG contém texto (rótulos, languages). Sem charset explícito, o browser pode
  interpretar em latin-1 e **quebrar caracteres** — e, em alguns casos, permitirEscape de byte
 簧 especial.
- **Mudança:** `'Content-Type': 'image/svg+xml; charset=utf-8'` (e `utf-8` no JSON).
- **Aceite:** Content-Type declara charset.
- **Verificação:** `curl -sI http://localhost:3600/badge/x/repos | grep -i content-type`.

---

### IMP-03 · Sem ETag/ revalidação condicional no GitHub · [P3]

- **Arquivo:** `src/agregador.js:6-13`
- **Evidência:** toda busca faz `fetch` sem `If-None-Match`; a resposta 304 do GitHub cairia em
  `!r.ok` e lançaria erro.
- **Impacto:** baixo. O cache de 5 min já evita a maioria das chamadas. Com ETag, uma chamada a
  menos por janela — otimização, não correção.
- **Mudança:** (opcional) guardar o `ETag` por URL e reenviar `If-None-Match`; tratar `304` como
  "use o cache" em vez de erro.
- **Aceite:** (se implementado) chamada repetida devolve `304` tratada como cache, não erro.
- **Verificação:**
  ```bash
  # duas chamadas seguidas; a segunda deve reusar cache sem consumir cota
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3600/api/FrancosCorporation/resumo
  ```

---

## 6. DevOps / Infra

### DEVOPS-01 · Sem rate limit (consumo de cota do GitHub) · [P1]

- **Arquivo:** `server.js:16,20,24,30` (as 3 rotas de API + badge chamam o GitHub)
- **Evidência:** nenhuma das rotas tem rate limit; cada uma pode disparar 1+ chamada ao GitHub.
- **Impacto:** (a) **cota**: sem token, 60 req/h por IP (ver `BUG-03`) — um laço de badges consome
  tudo em minutos e derruba o serviço de todo mundo no mesmo IP; (b) um `dono` diferente por request
  evita o cache (URL diferente → `cache.get(url)` falha, `agregador.js:5`) e maximiza o consumo.
- **Mudança:** (1) rate limit por IP nas 3 APIs (ex.: 60/min — bem acima do uso legítimo);
  (2) normalizar `dono` para o cache (minúsculas); (3) exigir `GITHUB_TOKEN` (`BUG-03`) para evitar
  a cota de 60/h.
- **Aceite:** laço acima do teto → `429`; `/api/x/resumo` e `/api/X/resumo` compartilham cache.
- **Verificação:**
  ```bash
  for i in $(seq 1 100); do curl -s -o /dev/null -w "%{http_code} " "http://localhost:3600/api/d$i/resumo"; done; echo
  ```

---

## 7. Documentação

### DOC-01 · README não documenta cota/rate limit do GitHub · [P3]

- **Arquivo:** `README.md`
- **Evidência:** o README explica o dashboard; não menciona `GITHUB_TOKEN` nem a cota da API do GitHub.
- **Impacto:**Deploy sem token quebra com `502` sem explicação.
- **Mudança:** seção "Requisitos": `GITHUB_TOKEN` (scopes mínimos) + nota de cota/rate limit.
- **Aceite:** README lista `GITHUB_TOKEN` como requisito.
- **Verificação:** `grep -ni 'github_token\|cota\|rate' README.md`.

### DOC-02 · Falta `SECURITY.md` · [P3]

- **Arquivo:** *(ausente)* `SECURITY.md`
- **Evidência:** tem `LICENSE`/README, sem guia de reporte.
- **Impacto:** quem encontra um XSS no badge/dashboard não tem canal.
- **Mudança:** criar com canal + a ameaça "dado externo (GitHub) renderizado sem escape".
- **Aceite:** arquivo existe.
- **Verificação:** `ls SECURITY.md`.

---

## 8. Ordem de execução (waves)

### Wave 1 — Fechar XSS (P0)
1. **`SEC-01`** — escapar/construir DOM no dashboard (front).
2. **`SEC-02`** — escapar no SVG do servidor.
3. **`SEC-04`** — escapar dentro de `badge` (defesa em profundidade).

> Depois da Wave 1, dado do GitHub não executa script nem no dashboard nem no badge.

### Wave 2 — Entrada validada e cota (P1)
4. **`SEC-03`/`BUG-02`** — validar `dono` + `encodeURIComponent`.
5. **`DEVOPS-01`** — rate limit + cache normalizado.
6. **`TEST-01`** — testes de escape.

### Wave 3 — Robustez (P2)
7. **`BUG-01`** — teto no `n`.
8. **`BUG-04`** — mapear 404/429 do GitHub.
9. **`BUG-03`** — exigir `GITHUB_TOKEN`.
10. **`IMP-01`**, **`IMP-02`** — TTL coerente + charset.

### Wave 4 — Registro (P3)
11. **`DOC-01`**, **`DOC-02`**.

**Dependências que não podem ser invertidas:**
`SEC-02` antes de `SEC-04` (escapar a função antes de confiar nela) · `SEC-03` junto com `BUG-02` ·
`TEST-01` depois das 3 correções de escape · `DEVOPS-01` depois de `BUG-03` (rate limit + token).

---

## 9. Fora de escopo / riscos

| Item | Decisão | Motivo |
|---|---|---|
| Migrar o front para React/Vue | **Não** | XSS se corrige escapando/texto, não trocando framework. O front vanilla é leve e funcional. |
| Usar `encodeURIComponent` como "escape de HTML" | **Nunca** | Codificar URL **não** escapa HTML (`<` continua perigoso em atributo/contexto). Manter os dois separados. |
| SSRF via dono | **Não é o caso** | O host é fixo (`api.github.com`). Sem allowlist de host a mudar. |
| Cache Redis (compartilhado) | **Não** | O cache em memória basta no volume; `IMP-01` alinha TTL. |
| Autenticação do painel | **Não, ainda** | O dashboard é público por design (métricas públicas). Itens P0 são XSS, não auth. |

**Riscos desta execução:**

- **`SEC-01` exige reescrever partes do front.** Construir DOM com `textContent` é mais verboso que
  template string — fazer no mesmo commit do escape, e revisar que o layout não quebra.
- **`SEC-03` (validar `dono`) rejeita nomes legítimos?** GitHub username é `[A-Za-z0-9-]` — a regex
  casa tudo que é válido; só rejeita entrada inválida de propósito.
- **`BUG-04` muda status codes** que o front pode estar tratando como 502 genérico — revisar `catch`
  do front (`public/index.html`).
- **`DEVOPS-01` rate limit por IP** pode afetar uso legítimo em rede NAT (vários usuários, um IP) —
  escolher teto folgado (60/min) e/or mudar a chave.

---

## 10. Definição de pronto (DoD)

**Segurança**
- [ ] `SEC-01` — repo com nome malicioso renderiza como texto (sem script)
- [ ] `SEC-02` — SVG do servidor escapa dado externo
- [ ] `SEC-03`/`BUG-02` — `dono` inválido → 400; URL sempre codificada
- [ ] `SEC-04` — `badge`/`barras` escapam internamente

**Funcional**
- [ ] `BUG-01` — `n` com teto (1..50)
- [ ] `BUG-03` — sem `GITHUB_TOKEN` em produção, falha alto
- [ ] `BUG-04` — 404→404, rate limit→429, erro não cacheado

**Testes e qualidade**
- [ ] `TEST-01` — casos de escape no `npm test`
- [ ] `IMP-01` — `Cache-Control` coerente na API
- [ ] `IMP-02` — `charset=utf-8` no SVG

**Infra e documentação**
- [ ] `DEVOPS-01` — rate limit; cache normalizado (`x`/`X` compartilham)
- [ ] `DOC-01` — README com `GITHUB_TOKEN` e cota
- [ ] `DOC-02` — `SECURITY.md`

**Validação final:**
```bash
npm test 2>&1 | tail -2
node --check server.js src/agregador.js
# badge com valor malicioso -> escapado (sem '<script>' cru)
```

---

*Fim do plano. Gerado por leitura direta do código em 2026-10-02. Nenhum item já estava corrigido*
*— todos apontam para defeitos ainda presentes.*
