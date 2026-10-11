# Segurança

## Reportar uma vulnerabilidade

Não publique detalhes de uma falha ainda não corrigida. Use o [formulário privado de vulnerabilidades do GitHub](https://github.com/FrancosCorporation/devmetrics/security/advisories/new), se estiver habilitado para o repositório. Se a opção não estiver disponível, abra uma issue pedindo um canal privado, sem incluir os detalhes da falha. No relato privado, inclua passos para reproduzir e o impacto observado; não envie tokens ou dados privados.

## Escopo

- Repositórios e perfis consultados são dados externos e não confiáveis. O nome, a linguagem e outras strings nunca devem ser montados em HTML executável.
- O gerador SVG escapa texto, restringe cores a hexadecimais e não inclui scripts ou referências externas.
- A API consulta somente `https://api.github.com`, valida o nome de usuário e limita o volume por endereço de origem. Não confie em `X-Forwarded-For` sem configurar conscientemente o proxy.
- `GITHUB_TOKEN` é usado somente no servidor. Configure permissões de leitura para metadados públicos, guarde o segredo em `.env` ou no gerenciador de segredos e nunca o registre no Git.
- As métricas são públicas e o painel não oferece autenticação. Não use este serviço para expor dados privados.
