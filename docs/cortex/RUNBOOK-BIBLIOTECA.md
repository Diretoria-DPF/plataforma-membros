# Runbook · Biblioteca LAIFT

Para operar a Biblioteca: implantar, ligar, desligar, atualizar o catálogo público e voltar atrás.
Telas: `CONTRATO-B2.md`. Dados e ações: `CONTRATO-B1.md`. Dúvidas do dono: `PERGUNTAS-ABERTAS.md`.

## 1. Antes de ligar (cada passo com OK do dono)
1. Branch de backup do Neon antes da 029 (`backup-pre-029-AAAA-MM-DD`). Não confie só no backup diário: ver O1 em `docs/riscos-residuais.md`.
2. Aplique a 029 numa branch de teste do Neon. Confira as tabelas `library_*` e as 4 flags, todas `FALSE`.
3. Aplique a 029 em produção. Registre nome e hash no `schema_migrations`.
4. O dono cadastra o segredo `LIBRARY_CONTACT_EMAIL` em staging e produção, com `wrangler secret put`. Nunca no repositório. Sem ele, PubMed e Unpaywall não são chamados.
5. Publique o Worker (`wrangler deploy`). Com as flags desligadas, as ações novas ficam inertes.
6. A curadoria carrega o acervo com `library_enabled` desligada.

## 2. Ligar por etapas
Use `apiAdminSetFeatureFlag` (formato na seção 5). Confira cada etapa antes da próxima.
1. **Só admins:** `library_enabled` com `{"enabled":true,"conditions":{"role":["admin"]}}`. Com condição de papel, a página pública continua fora: sem sessão, a condição não casa.
2. **Membros:** só depois que o texto sobre favoritos e sugestões estiver publicado na Política de Privacidade. Então `{"enabled":true,"conditions":{"role":["admin","member"]}}`.
3. **Todos:** `{"enabled":true,"conditions":{}}`. O catálogo público passa a aparecer em `/biblioteca` em até ~60 s, sem deploy (seção 4).
4. **Sugestões:** `library_member_suggest` segue a mesma ordem, depois da etapa 2.

| Flag | O que liga | Vai ao navegador | Ao desligar |
|---|---|---|---|
| `library_enabled` | Menu "Estudo", painel do membro e catálogo público | sim | Menu e painel saem em até 60 s (quem tem a página aberta recarrega); `/biblioteca` continua no ar e mostra "Nenhum artigo publicado ainda." na próxima visita (até 60 s) |
| `library_member_suggest` | Botão "Sugerir artigo" | sim | O botão some |
| `library_ai_summary` | Resumo por IA (B3) | não | Sem efeito até o B3 |
| `lia_library_enabled` | Lia cita artigos publicados (B4) | não | Sem efeito até o B4 |

## 3. Equipe: curadores e revisor clínico
- Só admin vê a aba "Equipe" (painel de administração, Biblioteca).
- Digite o e-mail de uma conta já cadastrada, escolha o papel e clique em "Dar acesso". "Tirar acesso" remove.
- **Curador:** cadastra, edita, aprova e publica.
- **Revisor clínico:** só aprova ou devolve artigos com conduta, dose ou interação. Admin não vira revisor sozinho.
- Até o B3, curador que não é admin não vê a aba de curadoria. Para curar hoje, use uma conta admin.

## 4. Catálogo público (ao vivo)
- Automático: publicar ou remover um artigo no painel aparece em `/biblioteca` em até ~60 s (cache da API). Não precisa rodar workflow nem aprovar deploy.
- Como funciona: a página nasce do instantâneo gravado no último deploy (rápida, boa para o Google, funciona sem JavaScript) e, ao abrir, busca o catálogo na API (uma chamada por visita) e troca a lista se mudou.
- Se a API falhar (rede, limite, erro), o visitante vê o instantâneo do último deploy, sem mensagem de erro.
- Google e sitemap usam o instantâneo. Enquanto ele não tiver artigos, a página sai com `noindex` e fica fora do sitemap; isso só muda no próximo deploy (qualquer push na `main`, ou Actions → "Publicar front-end na Cloudflare" → Run workflow). Não é urgente: o visitante já vê a lista ao vivo.
- Limites: com o cache do Worker funcionando, as visitas não tocam o banco. Sem cache, valem 30 chamadas/hora por IP e 300/hora no total; acima disso a página mostra o instantâneo.
- Atualizar a reserva (opcional): a partir de `frontend/`, rode `node scripts/fetch-biblioteca.mjs --out biblioteca/conteudo/reserva.json` e faça commit do arquivo.

## 5. Desligar e voltar atrás
Primeiro, desligue pela API. Ela grava quem desligou e a auditoria:
```json
{"action":"apiAdminSetFeatureFlag","args":["<token de sessão de admin>","library_enabled",{"enabled":false}]}
```
- Para só as sugestões, troque a chave por `library_member_suggest`.
- Página pública: em até 60 s ela passa a mostrar "Nenhum artigo publicado ainda." (a página fica no ar, vazia). Para tirar também o instantâneo e o sitemap, faça um deploy (seção 4).
- Emergência, sem auditoria: `UPDATE feature_flags SET enabled = FALSE, updated_at = now() WHERE key = 'library_enabled';`
- O down (`sql/down/029_library.sql`) desfaz a migração e **apaga os dados**. Não use para desligar.
- O down recusa se houver artigo. Para rodar com artigos: exporte (branch do Neon) e, na mesma sessão, `SET laift.allow_library_drop = 'on';` antes do script. Ele apaga as tabelas `library_*`, as 4 flags e a entrada da 029 no ledger. Não remove `pg_trgm`.

## 6. A verificar antes de ligar para todos
- Limites das fontes ainda não confirmados: Crossref (polite pool), NCBI (3 req/s sem chave), Unpaywall (100 mil/dia), OpenAlex (429 acima de 100 req/s).
- NCBI: registrar `tool` e o e-mail de contato antes de ligar o fallback do PubMed.
- Chamadas externas por cadastro: até 6, em série. Limite de subrequisições do plano Cloudflare: a verificar.
- Licenças não comerciais (BY-NC e variantes): tratadas como fechadas até o parecer (P3).
