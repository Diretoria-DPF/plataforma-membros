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
3. **Todos:** `{"enabled":true,"conditions":{}}`. Depois, atualize o catálogo público (seção 4).
4. **Sugestões:** `library_member_suggest` segue a mesma ordem, depois da etapa 2.

| Flag | O que liga | Vai ao navegador | Ao desligar |
|---|---|---|---|
| `library_enabled` | Menu "Estudo", painel do membro e catálogo público | sim | Menu e painel saem em até 60 s (quem tem a página aberta recarrega); a página pública sai no próximo build |
| `library_member_suggest` | Botão "Sugerir artigo" | sim | O botão some |
| `library_ai_summary` | Resumo sugerido por IA na curadoria (seção 7) | não | "Gerar resumo(s)" responde "desligado"; resumos já gravados ficam e continuam exigindo aprovação |
| `lia_library_enabled` | Lia cita artigos publicados (B4) | não | Sem efeito até o B4 |

## 3. Equipe: curadores e revisor clínico
- Só admin vê a aba "Equipe" (painel de administração, Biblioteca).
- Digite o e-mail de uma conta já cadastrada, escolha o papel e clique em "Dar acesso". "Tirar acesso" remove.
- **Curador:** cadastra, edita, aprova e publica.
- **Revisor clínico:** só aprova ou devolve artigos com conduta, dose ou interação. Admin não vira revisor sozinho.
- Curador que não é admin ainda não vê a aba de curadoria (a tela própria entra no B3 completo). Para curar e rodar lotes hoje, use uma conta admin.

## 4. Atualizar o catálogo público
- Não há atualização diária. O catálogo público só muda quando você dispara o workflow.
- Publicar no banco não atualiza o site. Depois de publicar um lote: GitHub → Actions → "Publicar front-end na Cloudflare (Workers static assets)" → Run workflow, na branch `main`.
- Se o ambiente `production` pedir aprovação (Settings → Environments), aprove quando a execução aparecer.
- Se a API não responder no build, o site usa a reserva e mostra aviso. O build não quebra.
- Atualizar a reserva: a partir de `frontend/`, rode `node scripts/fetch-biblioteca.mjs --out biblioteca/conteudo/reserva.json` e faça commit do arquivo.

## 5. Desligar e voltar atrás
Primeiro, desligue pela API. Ela grava quem desligou e a auditoria:
```json
{"action":"apiAdminSetFeatureFlag","args":["<token de sessão de admin>","library_enabled",{"enabled":false}]}
```
- Para só as sugestões, troque a chave por `library_member_suggest`.
- Página pública: depois de desligar, rode o workflow da seção 4 para tirar a página.
- Emergência, sem auditoria: `UPDATE feature_flags SET enabled = FALSE, updated_at = now() WHERE key = 'library_enabled';`
- O down (`sql/down/029_library.sql`) desfaz a migração e **apaga os dados**. Não use para desligar.
- O down recusa se houver artigo. Para rodar com artigos: exporte (branch do Neon) e, na mesma sessão, `SET laift.allow_library_drop = 'on';` antes do script. Ele apaga as tabelas `library_*`, as 4 flags e a entrada da 029 no ledger. Não remove `pg_trgm`.

## 6. A verificar antes de ligar para todos
- Limites das fontes ainda não confirmados: Crossref (polite pool), NCBI (3 req/s sem chave), Unpaywall (100 mil/dia), OpenAlex (429 acima de 100 req/s).
- NCBI: registrar `tool` e o e-mail de contato antes de ligar o fallback do PubMed.
- Chamadas externas por cadastro: até 6, em série. Limite de subrequisições do plano Cloudflare: a verificar.
- Licenças não comerciais (BY-NC e variantes): tratadas como fechadas até o parecer (P3).

## 7. Lote de artigos e resumo por IA (B3 enxuta)
Tudo pela tela (painel admin → Biblioteca → Artigos → "Trabalho em lote"), sem acesso ao banco. Antes: `wrangler deploy` do Worker desta versão e a flag `library_ai_summary` ligada só para admins (`{"enabled":true,"conditions":{"role":["admin"]}}`).
1. **Importar lista de DOIs:** cole até 150 linhas (DOI, PMID ou link; uma por linha) e clique "Importar". O painel importa uma por vez e mostra a contagem; "já existia" não é erro. Se o servidor atingir o limite (180/h por curador, 400/h no total), o lote pausa: espere e clique "Continuar". No fim, "Tentar de novo as que falharam" refaz só as falhas (o motivo de cada uma aparece na lista). "Cancelar" para o lote; o que já entrou fica.
2. **Gerar resumos:** clique "Gerar resumos". O painel lê toda a fila "Em triagem" e pede um resumo para cada artigo sem resumo; os sem resumo original ficam de fora, com o motivo. Na edição de um artigo há "Gerar resumo".
3. **Revisar:** abra cada artigo, leia o resumo (selo "Resumo gerado por IA"), corrija se precisar (vira "gerado por IA e editado") e confira a área. Texto com dose, conduta ou interação é marcado como clínico e só sai com o revisor clínico.
4. **Aprovar e publicar:** marque os artigos na fila "Em triagem" ("Marcar todos desta página" ajuda), escolha a área para os que estão sem área (opcional) e clique "Aprovar e publicar selecionados". Para cada um o painel faz o mesmo que o curador à mão: aprovar → registrar a sua aprovação do resumo de IA (seu nome e a data) → publicar. Clínicos e sem área ficam de fora, com o motivo. Cada artigo usa 2 a 4 ações de curadoria (limite `LIBRARY_CURATE` 300/h por curador): publicar ~114 de uma vez pausa perto do 80º; espere e clique "Continuar".
5. **Site público:** atualize o catálogo (seção 4).

**Modelo:** `LIBRARY_AI_MODEL = "@cf/google/gemma-4-26b-a4b-it"` em `worker/wrangler.toml` (produção e staging). Preço conferido em developers.cloudflare.com/workers-ai/platform/pricing em 2026-10-11: US$ 0,10 por milhão de tokens de entrada e US$ 0,30 por milhão de saída (9.091 e 27.273 neurons por milhão); nível gratuito de 10.000 neurons/dia (zera 00:00 UTC), depois US$ 0,011 por 1.000 neurons no plano pago. Qualidade do português: a página do modelo não lista idiomas; **a verificar** nos primeiros resumos.
**Custo estimado por resumo:** ~1.500 tokens de entrada (prompt + resumo original típico) e ~250 de saída ≈ 14 + 7 = **~21 neurons** (US$ ~0,0002); pior caso (resumo original de 10.000 caracteres, ~3.000 tokens, e 700 de saída) ≈ 46 neurons. 114 artigos ≈ 2.400 neurons: cabem num dia gratuito.
**Teto diário:** `LIBRARY_SUMMARY_DAY` = 250 chamadas por janela de 24 h (todas as pessoas) ≈ 5.300 neurons no típico e ~11.500 no pior caso; mais `LIBRARY_SUMMARY` 200/h por curador. Para trocar o modelo, mude só a variável e publique o Worker.
**Uso registrado:** `audit_logs` com `action = 'LIBRARY_SUMMARY_GENERATE'` (modelo, clínico, tamanho; sem texto) e `LIBRARY_SUMMARY_REVIEW`. Não usa `ai_usage_log`.
