# Migração para laift.com.br (GitHub Pages → Cloudflare)

Roteiro do corte. Estado de partida: front em `diretoria-dpf.github.io/plataforma-membros/`, API em
`plataforma-membros-api.diretoria-dpf.workers.dev`, domínio `laift.com.br` registrado no Registro.br com DNS
ainda no Registro.br (`a.auto.dns.br`).

**Princípio:** o GitHub Pages continua no ar durante toda a transição. Quem não for avisado segue usando o
endereço antigo sem perceber nada. O "corte" para os usuários é o anúncio, não o DNS.

## Arquitetura de destino
| Peça | Antes | Depois |
|---|---|---|
| Site | GitHub Pages (subcaminho) | Worker `laift-web` (static assets) em `https://laift.com.br` |
| API | `*.workers.dev` | O mesmo Worker `plataforma-membros-api`, também em `https://api.laift.com.br` |
| Cabeçalhos HTTP | impossível | `frontend/_headers` |
| Deploy do site | `deploy-frontend.yml` | `deploy-frontend-cloudflare.yml` |
| Banco, mensageria, R2, KV, IA | iguais | iguais |

O `app.js` escolhe a API pelo `hostname` (`laift.com.br` → `api.laift.com.br`; qualquer outro → `*.workers.dev`),
então a mesma build funciona nas duas origens.

## Etapas
Legenda: **[V]** você, **[C]** Claude, **[V+C]** juntos.

1. **[V] Colocar o domínio no Cloudflare.** Cloudflare → *Add a domain* → `laift.com.br` → plano **Free**. Anote os
   2 nameservers que ele mostrar.
2. **[V] Trocar os nameservers no Registro.br.** Painel → domínio → *Alterar servidores DNS* → substitua os dois
   `*.auto.dns.br` pelos da Cloudflare, copiados exatamente. Se o domínio tiver DNSSEC ativo no Registro.br,
   desative antes. Espere o e-mail "Active" da Cloudflare (minutos a 24 h).
   Conferir: `nslookup -type=NS laift.com.br` deve listar os nameservers da Cloudflare.
3. **[C] Preparar o código (já feito nesta branch, nada publicado):** origem `https://laift.com.br` no CORS,
   `app.js` por hostname, CSP com a API nova, `_headers`, `frontend/wrangler.toml`, workflow manual.
4. **[V+C] Token da Cloudflare.** O token do GitHub Actions precisa, além de *Edit Cloudflare Workers*, de
   **DNS: Edit** e **Workers Routes: Edit** na zona `laift.com.br`. Alternativa: anexar o domínio uma vez pelo
   painel (*Workers & Pages → laift-web → Domínios*).
5. **[C] API no domínio novo (zona "Active").** Em `worker/wrangler.toml`, descomentar `workers_dev = true` e o
   `[[routes]]` de `api.laift.com.br`; merge → o deploy do Worker é automático.
   Conferir: `curl -i -X OPTIONS https://api.laift.com.br/ -H "Origin: https://laift.com.br"` → 204 com
   `Access-Control-Allow-Origin: https://laift.com.br`.
6. **[C] Subir o site sem domínio.** *Actions → Publicar front-end na Cloudflare → Run workflow*. Valida o build, o
   `_headers` e o 404 numa URL `laift-web.<conta>.workers.dev` (login não funciona ali: a origem não está no CORS,
   e isso é proposital).
7. **[C] Ligar o domínio ao site.** Em `frontend/wrangler.toml`, descomentar `[[routes]]` de `laift.com.br`; rodar o
   workflow de novo.
8. **[V+C] Validar em `https://laift.com.br`** (checklist abaixo).
9. **[V+C] E-mail.** Brevo → *Senders & IP → Domains* → autenticar `laift.com.br` (SPF/DKIM/DMARC como registros DNS
   no Cloudflare) → criar remetente `noreply@laift.com.br` → ajustar `MAIL_FROM_ADDRESS`. Só depois de validar o
   site, trocar `APP_BASE_URL` para `https://laift.com.br/` (links de confirmação e de redefinição de senha).
   Opcional: *Email Routing* gratuito para `contato@laift.com.br` encaminhando ao Gmail da liga.
10. **[V] `www`.** Registro DNS `www` (proxied) e *Rules → Redirect Rules*: `www.laift.com.br` → `https://laift.com.br`
    (301, preservando caminho e query).
11. **[V+C] Anúncio aos membros** (ver "Impacto para os usuários") e banner no site antigo.
12. **Encerramento, 1–2 semanas depois, sem incidentes:**
    - gatilho do workflow do Cloudflare passa a `push` na `main`; remover `deploy-frontend.yml`;
    - desativar o GitHub Pages e **só então** tornar o repositório privado (Pages em repositório privado exige
      plano pago; ver nota abaixo);
    - remover `https://diretoria-dpf.github.io` do `ALLOWED_ORIGINS`;
    - subir o HSTS de `max-age=300` para `31536000` em `frontend/_headers` e ativar o DNSSEC no Cloudflare
      (registro DS no Registro.br);
    - atualizar `README`, `docs/DEPLOYMENT.md`, `atlas-prod-check.yml` e as URLs dos testes.

## Impacto para os usuários (inevitável)
`localStorage` e IndexedDB são por origem. Em `laift.com.br`:
- todos precisam **entrar de novo**;
- a **mensageria gera uma identidade nova**: a chave privada é não extraível (`msg-crypto.js`) e não pode ser
  transportada; as conversas antigas ficam ilegíveis no novo endereço;
- o histórico, fixados e notas do **Atlas** (guardados no navegador) não vêm junto.
Quanto antes a troca, menos histórico se perde. Avisar com antecedência.

## Checklist de validação em `https://laift.com.br`
- [ ] Cadeado/HTTPS válido; `http://` redireciona para `https://`.
- [ ] `curl -I https://laift.com.br` mostra `Strict-Transport-Security`, `X-Content-Type-Options`,
      `Referrer-Policy`, `Permissions-Policy` e `Content-Security-Policy: frame-ancestors 'self'`.
- [ ] Cadastro → e-mail de confirmação chega → link funciona.
- [ ] Login, logout, "esqueci minha senha".
- [ ] Painéis: início, aprender, eventos, propostas, tarefas, equipe, perfil.
- [ ] Módulos em iframe: quiz, toxicologia, clínica, laboratório (estúdio 3D), Atlas 3D (modelos `.glb.gz`).
- [ ] Credencial/QR e leitor de QR com a câmera (terminal fiscal, perfil admin).
- [ ] Mensageria: nova chave criada, envio e recebimento entre dois usuários.
- [ ] Console do navegador sem erros de CORS ou de CSP.
- [ ] Celular (Android e iOS) e tema escuro.
- [ ] Um site de terceiros **não** consegue embutir `laift.com.br` em iframe.

## Reversão
| Etapa | Como desfazer |
|---|---|
| 5 (API) | Recomentar o bloco de `routes`; a URL `*.workers.dev` nunca deixou de funcionar |
| 7 (site) | Recomentar o `[[routes]]` do front e rodar o workflow; ou remover o domínio no painel |
| 9 (e-mail) | Voltar `APP_BASE_URL` e `MAIL_FROM_ADDRESS` aos valores anteriores |
| 2 (DNS) | Devolver os nameservers `*.auto.dns.br` no Registro.br |
Enquanto o GitHub Pages existir, ele é o plano B completo.

## Notas
- **Repositório privado:** no plano gratuito do GitHub, repositório privado perde Pages, proteção de branch,
  CodeQL e secret scanning, e limita as Actions a 2.000 min/mês (confira em github.com/pricing). Ao privar,
  trocar CodeQL/secret scanning por Dependabot, `gitleaks` e `npm audit` no CI.
- **Desvio deliberado das regras web genéricas:** `X-Frame-Options: DENY` e `camera=()` quebrariam os módulos
  em iframe e o leitor de QR; por isso `frame-ancestors 'self'` e `camera=(self)`.
- **CSP completo não vai em `_headers`:** cada módulo tem a sua em `<meta>`, e o navegador aplica a interseção
  das duas. Só `frame-ancestors` (que o `<meta>` não suporta) vai no cabeçalho.
