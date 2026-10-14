# Plan — devmetrics

## 1. Visão geral

- **Nome:** devmetrics — métricas e badges de perfis GitHub
- **Descrição:** serviço Node/Express que gera métricas agregadas de repositórios públicos de um usuário, em JSON e badge SVG, com cache TTL de 5 min (ETag), rate limit por origem e validação estrita de entrada.
- **Estado atual:** SEC-01..04, BUG-01..04, IMP-01..03, DEVOPS-01, DOC-01/02 concluídos em 2026-10-11; CI modernizada nesta sessão.

## 2. Arquitetura e tecnologias

- Node 22+, Express 4; frontend estático em `public/` com DOM seguro; geração SVG própria com escaping XML.
- Produção exige `GITHUB_TOKEN`; imagem Docker não-root; Compose validado.
- CI: suíte + scan de licenças; **modernizada nesta sessão**.

## 3. Funcionalidades existentes

- [x] API JSON e badge SVG com cache compartilhado/ETag — implementado.
- [x] Validação de usuário, erros 404/429 corretos sem cachear falhas — implementado.
- [x] Interface sem HTML dinâmico — implementado.
- [x] CI — **modernizada nesta sessão** (Ubuntu 24.04, Actions v7, Node 22/24, `npm ci`, gate audit).

## 4. Objetivos futuros

- **OBJ-01 (P2, concluído nesta sessão):** CI previsível com gates.
- **OBJ-02 (P3, recomendação):** cache compartilhável (Redis) se houver várias réplicas.
- **OBJ-03 (P3, recomendação):** badges adicionais (linguagens mais usadas) apenas quando solicitado.

## 5–7. Melhorias / Roadmap / Backlog

- Fases 1–3 concluídas; backlog: OBJ-02 (P3), OBJ-03 (P3).

## 8. Riscos e pendências

- Dependência de cota da API GitHub (mitigada por token + cache); validação comportamental da UI segue fora da esteira (TEST-01).

## 9. Ideias adicionais

- Modo "org" (métricas agregadas de organização) se houver demanda.

---
*(Gerado em 2026-10-14 pelo agente orquestrador)*
