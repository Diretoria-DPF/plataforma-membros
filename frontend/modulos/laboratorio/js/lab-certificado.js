/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — certificado de conclusão por nível da trilha (O8), puro. Montado no aparelho e impresso ou salvo em PDF
 * pelo navegador; nada é enviado. DECISÃO D-5 (valor do certificado, carga horária, validade para horas
 * complementares) É DO DONO: o texto é neutro e não promete horas nem validade. A flag `labCertificado` fica
 * desligada até essa decisão. O nome vem só da identidade local da plataforma.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const MAX_NOME = 80;

  /** Níveis cujas missões jogáveis foram todas concluídas com lote conforme (há ao menos uma). */
  function elegiveis(trilha, progresso) {
    const m = (progresso && progresso.missoes) || {};
    const niveis = [...new Set(trilha.missoes.map((x) => x.nivel))].sort((a, b) => a - b);
    const saida = [];
    for (const nivel of niveis) {
      const jogaveis = trilha.missoes.filter((x) => x.nivel === nivel && x.processoRef);
      if (!jogaveis.length || !jogaveis.every((x) => m[x.id] && m[x.id].vezes > 0 && m[x.id].conforme)) continue;
      saida.push({ nivel, nome: (trilha.niveis && trilha.niveis[nivel]) || `Nível ${nivel}`, missoes: jogaveis.map((x) => x.titulo) });
    }
    return saida;
  }

  function dataBr(d) {
    const dois = (n) => String(n).padStart(2, '0');
    return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  /** { titulo, corpo, linhas[], data } ou null quando falta o nome (não há emissão sem identidade). */
  function montar({ nome, nivel, data }) {
    const n = String(nome || '').trim().slice(0, MAX_NOME);
    if (!n || !nivel) return null;
    const quando = dataBr(data instanceof Date ? data : new Date());
    return {
      titulo: 'Certificado de conclusão',
      corpo: `Certificamos que ${n} concluiu, no Laboratório Virtual da LAIFT, o Nível ${nivel.nivel}: ${nivel.nome}, com lote conforme em todas as missões abaixo.`,
      linhas: nivel.missoes.concat([`Emitido em ${quando}. Atividade de treino em ambiente simulado.`]),
      data: quando
    };
  }

  /** Nome da pessoa na identidade local da plataforma; vazio se não houver. */
  function nomeDaIdentidade(janela) {
    try {
      const i = janela && janela.LaiftIdentity && janela.LaiftIdentity.get();
      return i && typeof i.name === 'string' ? i.name.trim().slice(0, MAX_NOME) : '';
    } catch (e) { return ''; }
  }

  const API = { elegiveis, montar, nomeDaIdentidade };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabCertificado = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
