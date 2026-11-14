/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * csp-ambiente.js — enxuga a CSP das páginas publicadas conforme o ambiente (F-048).
 *
 * O mesmo HTML serve produção, homologação e a pré-visualização local, por isso a CSP da fonte lista
 * as três APIs. No deploy, a variável LAIFT_DEPLOY_ENV diz qual é o destino e o build tira da
 * `connect-src` os hosts que aquele ambiente nunca chama:
 *   - production: sai o endereço antigo *.workers.dev (desligado) e a API de homologação;
 *   - staging:    sai o endereço antigo *.workers.dev.
 * Sem a variável (build local e e2e) nada muda: o e2e simula a API no endereço antigo.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HOST_ANTIGO = 'https://plataforma-membros-api.diretoria-dpf.workers.dev';
const HOST_HOMOLOGACAO = 'https://staging-api.laift.com.br';
const REMOVER = {
  production: [HOST_ANTIGO, HOST_HOMOLOGACAO],
  staging: [HOST_ANTIGO],
};
const CSP_META = /(<meta\s+http-equiv="Content-Security-Policy"[^>]*\scontent=")([^"]+)(")/gi;

/** Devolve o HTML com a CSP (meta) sem os hosts que o ambiente não usa. Ambiente desconhecido: sem mudança. */
function enxugarCsp(html, ambiente) {
  const remover = REMOVER[ambiente];
  if (!remover) return html;
  return String(html).replace(CSP_META, (_m, inicio, csp, fim) => {
    const limpa = csp.split(';').map((diretiva) => {
      const partes = diretiva.trim().split(/\s+/);
      return partes.filter((p, i) => i === 0 || !remover.includes(p)).join(' ');
    }).filter(Boolean).join('; ');
    return inicio + limpa + fim;
  });
}

/** Aplica a todos os .html de `dir` (recursivo), menos as pastas em `pular`. Devolve quantos mudaram. */
function enxugarDist(dir, ambiente, pular = ['modulos']) {
  if (!REMOVER[ambiente]) return 0;
  let alterados = 0;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!pular.includes(item.name)) alterados += enxugarDist(alvo, ambiente, []);
    } else if (item.name.endsWith('.html')) {
      const antes = fs.readFileSync(alvo, 'utf8');
      const depois = enxugarCsp(antes, ambiente);
      if (depois !== antes) { fs.writeFileSync(alvo, depois); alterados++; }
    }
  }
  return alterados;
}

module.exports = { enxugarCsp, enxugarDist, HOST_ANTIGO, HOST_HOMOLOGACAO };
