/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — falas contextuais por passo (O8), puras e determinísticas (texto do processo/tutor; sem IA, sem cota).
 * A Guia (assistente geral) diz o próximo passo; o Preceptor (tutor) diz o porquê técnico da etapa atual e só o
 * abre uma vez por etapa (a lista `vistos` é de quem chama; nada aqui muda estado).
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;

  /** Linha da Guia durante a missão (vista do tutor) ou ao fim dela (vista terminada + situação da trilha). */
  function falaGuia(vista, situacao) {
    if (!vista) return '';
    if (vista.terminado) return `A Guia: missão concluída. ${proximo(situacao)}`;
    if (vista.alvo) return `A Guia, próximo passo: use o controle "${vista.rotuloAlvo}", marcado com "!".`;
    return vista.rotuloAlvo ? `A Guia: você está em "${vista.etapaTitulo}". Se travar, peça uma dica.` : '';
  }

  function proximo(situacao) {
    const livre = (situacao || []).find((s) => s.estado === 'disponivel');
    return livre ? `Próximo passo: ${livre.missao.titulo}.` : 'Próximo passo: veja o boletim e o certificado.';
  }

  /** Sugestão da Guia na tela da trilha. */
  function sugestaoTrilha(situacao) {
    const livre = (situacao || []).find((s) => s.estado === 'disponivel');
    if (livre) return `A Guia sugere: ${livre.missao.titulo}.`;
    const repete = (situacao || []).find((s) => s.estado === 'concluida');
    return repete ? 'A Guia sugere: repetir uma missão para melhorar o boletim.' : 'A Guia: as missões desta trilha estão em preparação.';
  }

  /** { texto, novo, vistos }: `novo` é verdadeiro só na primeira vez que a etapa aparece. */
  function falaPreceptor(vista, vistos) {
    const antes = Array.isArray(vistos) ? vistos : [];
    if (!vista || vista.terminado || !vista.porque) return { texto: '', novo: false, vistos: antes };
    const novo = !antes.includes(vista.etapaId);
    return { texto: `Preceptor: ${vista.porque}`, novo, vistos: novo ? antes.concat([vista.etapaId]) : antes };
  }

  const API = { falaGuia, sugestaoTrilha, falaPreceptor };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabContexto = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
