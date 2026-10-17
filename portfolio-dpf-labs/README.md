# DPF Labs — Daniel P Francisco

**Portfólio, currículo e cartão de visita digital** de Daniel P Francisco, estudante de Farmácia (UNINASSAU Salvador) e Presidente da LAIFT, com foco em **plataformas de ensino em saúde com inteligência artificial**.

> 🇬🇧 **English:** Portfolio, resume and digital business card of Daniel P Francisco, a pharmacy student and President of LAIFT who builds **AI-powered health education platforms** (virtual clinic, pharmacology quiz, virtual laboratory, 3D anatomy atlas). Bilingual static site (PT-BR / EN). See [English summary](#english-summary).

- **Plataforma em produção:** <https://laift.com.br/> · **Código:** [Diretoria-DPF/plataforma-membros](https://github.com/Diretoria-DPF/plataforma-membros)
- **Contato:** dpires292@gmail.com · [LinkedIn](https://www.linkedin.com/in/daniel-pires-farmacia/) · [GitHub](https://github.com/Diretoria-DPF) · [Lattes](http://lattes.cnpq.br/5041510175000740)

## O que é

Site estático bilíngue gerado a partir de **uma única fonte de dados** (`data/dados.json`). Cada página sai como **HTML pré-renderizado** (indexável sem JavaScript), com `hreflang`, Open Graph, JSON-LD (`Person`, `ProfilePage`, `SoftwareSourceCode`, `FAQPage`, `TechArticle`), `sitemap.xml` e `robots.txt`.

| Página | PT-BR | EN |
|---|---|---|
| Portfólio | `/` | `/en/` |
| Currículo (imprimível + PDF) | `/curriculo/` | `/en/resume/` |
| Cartão de visita (QR + vCard) | `/cartao/` | `/en/card/` |
| Documentação (arquitetura + FAQ) | `/documentacao/` | `/en/documentation/` |

## Módulos de ensino em destaque

| Módulo | Repositório | IA |
|---|---|---|
| Clínica Virtual (paciente virtual e preceptor) | [`plataforma-membros`](https://github.com/Diretoria-DPF/plataforma-membros/tree/main/frontend/modulos/clinica) | Sim |
| Quiz de Farmacologia (modo estudo e modo prova) | [`Farmacologia-basica-quiz`](https://github.com/Diretoria-DPF/Farmacologia-basica-quiz) | — |
| Laboratório Virtual (reações toxicológicas, espectroscopia de chama) | [`laboratorio-virtual`](https://github.com/Diretoria-DPF/laboratorio-virtual) | Sim (na plataforma) |
| Simulador de Físico-Química e Toxicologia | [`laift-quimica-simulador`](https://github.com/Diretoria-DPF/laift-quimica-simulador) | — |
| Atlas 3D e Farmacocinética | [`plataforma-membros`](https://github.com/Diretoria-DPF/plataforma-membros/tree/main/frontend/modulos/anatomia-3d) | — |
| Check-in acadêmico por QR Code | [`sistema-checkin-academico`](https://github.com/Diretoria-DPF/sistema-checkin-academico) | — |

## Arquitetura da plataforma LAIFT (resumo)

```
Navegador (HTML/CSS/JS puro) ──fetch JSON──▶ Cloudflare Worker (API_REGISTRY, sessão, CSP)
                                                 ├──▶ Neon PostgreSQL (HTTP serverless, migrações)
                                                 └──▶ Groq (LLM): paciente virtual, preceptor, casos, assistente Lia
```

Detalhes (allowlist de ações, cotas de IA, segurança, testes) em `/documentacao/`.

## Como gerar o site

Requer Node.js ≥ 20. Sem dependências de runtime.

```bash
npm run build          # gera dist/ (HTML PT/EN, sitemap, robots, vCard)
npm run pdf            # gera os PDFs do currículo e a imagem social og.png (Chromium via Playwright)
npm run check          # valida SEO básico, links internos, JSON-LD e conteúdo proibido
npm run all            # os três, em ordem
npm run serve          # pré-visualiza dist/ em http://localhost:4173

SITE_URL=https://seu-dominio npm run all   # define o domínio canônico
```

`npm run pdf` usa o Playwright instalado globalmente: `NODE_PATH=$(npm root -g) npm run pdf`.

## Regras de conteúdo

- Nome público: **Daniel P Francisco** (nome completo nos dados: Daniel Pires Francisco).
- Contato público: **somente e-mail**. Sem telefone.
- **Repositórios privados nunca aparecem** no site, e o `check` falha se algum for citado.
- Afirmações vêm do LinkedIn e do Lattes. O que é interesse (ex.: farmacotécnica) não é apresentado como experiência.

## Pendências antes de publicar

1. Confirmar o **domínio** (hoje `https://dpflabs.dev`, provisório).
2. Adicionar **foto** (hoje há um monograma "DPF").
3. Conferir **emissor/ano** das certificações (só a ENAP tem emissor informado).
4. Decidir hospedagem (Cloudflare Pages/Workers ou GitHub Pages) e mover esta pasta para um repositório próprio.

## English summary

**DPF Labs** is the bilingual portfolio of **Daniel P Francisco** — pharmacy undergraduate at UNINASSAU Salvador (Brazil) and President of LAIFT (Interdisciplinary Academic League of Pharmacology and Toxicology). It showcases AI-powered health education platforms: a virtual clinic with an AI patient and preceptor, a pharmacology quiz, a virtual laboratory, a physical-chemistry/toxicology simulator, a 3D anatomy atlas and QR-code check-in, all running on a static front-end, Cloudflare Workers, Neon PostgreSQL and Groq-hosted LLMs. Pages: portfolio, resume (print/PDF), digital business card (QR + vCard) and documentation, in Portuguese and English.

**Keywords:** pharmacy education platform, AI in health education, pharmacology simulator, virtual clinic, virtual laboratory, 3D anatomy atlas, toxicology, HealthTech, Cloudflare Workers, Neon PostgreSQL.

## Licenças de terceiros

`vendor/qrcode-generator.cjs` — Kazuhiko Arase, licença MIT (cabeçalho do arquivo). O design foi inspirado na estrutura de portfólios de repositório de projetos, mas **todo o código, estilo e texto são próprios**.
