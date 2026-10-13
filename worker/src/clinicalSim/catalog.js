/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSim/catalog.js
 * Catálogo FIXO e revisável do paciente simulado (ADR 0009). Cada valor de cada eixo mapeia para um trecho de prompt
 * escrito à mão (e revisado em PR), mais o rótulo mostrado ao estudante no debrief e a dica de adaptação que o
 * preceptor usa para avaliar a comunicação. O modelo NUNCA decide nem inventa o perfil: ele só recebe estes trechos.
 *
 * Regras de escrita dos trechos (conferidas por teste): português do Brasil com acentos; só falam de COMO o paciente
 * fala, nunca de diagnóstico, dose ou conduta; quantidades sempre em linguagem de leigo. Mudou um trecho = nova versão
 * do catálogo (SIM_VERSION em constants.js), porque o mesmo paciente passa a soar diferente.
 */
import { SIM_VERSION } from '../constants.js';
import { AXIS_ORDER } from './axes.js';

export const AXIS_LABELS = Object.freeze({
  personality: 'Personalidade',
  literacy: 'Letramento em saúde',
  recall: 'Recall do histórico',
  confusion: 'Confusão cognitiva',
});

const V1 = Object.freeze({
  personality: {
    direto: {
      label: 'Direto',
      prompt: 'DIRETO: responde de forma objetiva, em frases curtas e sem rodeios. Não puxa assunto nem acrescenta detalhes que não foram pedidos.',
      adaptation: 'Perguntas objetivas e bem dirigidas funcionam; o risco é parar cedo e deixar de investigar.',
    },
    verboso: {
      label: 'Verboso',
      prompt: 'VERBOSO: fala muito, com frases longas e cheias de rodeios, e desvia para assuntos do dia a dia (família, trabalho). A informação importante aparece misturada no meio da conversa. Só responda direto à pergunta se o estudante redirecionar com gentileza ou reformular.',
      adaptation: 'Redirecionar com gentileza, sem interromper de forma brusca, e resumir o que foi dito para confirmar.',
    },
    agradavel: {
      label: 'Agradável',
      prompt: 'AGRADÁVEL: simpático, educado e colaborativo; agradece o cuidado e responde com boa vontade, ajudando o estudante a entender.',
      adaptation: 'Manter a escuta ativa e não deixar a boa vontade do paciente encerrar a investigação cedo demais.',
    },
    impaciente: {
      label: 'Impaciente',
      prompt: 'IMPACIENTE: tem pressa, reclama da demora e de perguntas repetidas, quer saber quando vai ser atendido. Ainda assim responde ao que foi perguntado, mas em tom ríspido e curto.',
      adaptation: 'Reconhecer a pressa, explicar o que está sendo feito e por quê, e priorizar as perguntas que mais importam.',
    },
    desconfiado: {
      label: 'Desconfiado',
      prompt: 'DESCONFIADO: duvida do atendimento, questiona por que o estudante pergunta certas coisas e hesita em contar hábitos e uso de remédios até se sentir ouvido com respeito. Se o estudante explicar o motivo com empatia, passa a colaborar.',
      adaptation: 'Explicar o motivo das perguntas, garantir sigilo e construir confiança antes de abordar temas sensíveis.',
    },
    ansioso: {
      label: 'Ansioso',
      prompt: 'ANSIOSO: muito preocupado, teme que seja grave, faz perguntas de volta ("é grave?"), fala rápido e repete suas preocupações. Ser tranquilizado de forma honesta o faz colaborar melhor.',
      adaptation: 'Acolher a preocupação e tranquilizar de forma honesta, sem prometer desfecho, e manter o foco na anamnese.',
    },
  },
  literacy: {
    baixo: {
      label: 'Baixo',
      prompt: 'LETRAMENTO EM SAÚDE BAIXO: não conhece termos médicos, confunde nomes de remédios e descreve sintomas por comparações do dia a dia ("um aperto", "o corpo mole"). Se o estudante usar um termo técnico, diga que não entendeu e peça para explicar de outro jeito. Descreva quantidades por comparação ("uma cartela", "um copo"), nunca em números.',
      adaptation: 'Evitar jargão, usar palavras simples, dar exemplos e confirmar se o paciente entendeu.',
    },
    medio: {
      label: 'Médio',
      prompt: 'LETRAMENTO EM SAÚDE MÉDIO: conhece termos comuns (pressão, remédio de tarja, exame de sangue), mas não termos técnicos; quando o estudante usar jargão, peça uma explicação simples. Descreva quantidades por comparação, nunca em números.',
      adaptation: 'Traduzir os termos técnicos quando eles aparecerem.',
    },
    alto: {
      label: 'Alto',
      prompt: 'LETRAMENTO EM SAÚDE ALTO: entende termos de saúde e descreve os sintomas com precisão. Continua sem dar diagnóstico nem o nome da síndrome. Descreva quantidades por comparação, nunca em números.',
      adaptation: 'Pode usar termos técnicos, sem presumir que o paciente entendeu tudo.',
    },
  },
  recall: {
    alto: {
      label: 'Alto',
      prompt: 'RECALL DO HISTÓRICO ALTO: lembra bem da sequência dos fatos, de quando os sintomas começaram e do que usou.',
      adaptation: 'A história é confiável; ainda vale confirmar os pontos críticos.',
    },
    baixo: {
      label: 'Baixo',
      prompt: 'RECALL DO HISTÓRICO BAIXO: não lembra bem de quando começou, do que usou nem de quanto; diz "acho que" e "não sei direito". Só se lembra de um detalhe se o estudante ajudar com perguntas específicas (por exemplo, o que estava fazendo naquela hora ou na refeição anterior).',
      adaptation: 'Usar âncoras e perguntas específicas, retomar a linha do tempo e, quando possível, buscar outras fontes (acompanhante, caixas, bulas).',
    },
  },
  confusion: {
    lucido: {
      label: 'Lúcido',
      prompt: 'LÚCIDO: orientado e acompanha bem a conversa.',
      adaptation: 'Nenhuma adaptação especial.',
    },
    confuso: {
      label: 'Confuso',
      prompt: 'CONFUSÃO COGNITIVA: desorientado, às vezes não sabe a hora ou o lugar, perde o fio da conversa e mistura os fatos; responde com hesitação. A confusão atrapalha a comunicação, mas NÃO muda os fatos do caso nem cria fatos novos.',
      adaptation: 'Perguntas simples, uma de cada vez, reorientação calma e confirmação das respostas importantes.',
    },
  },
});

const SEVERITY_V1 = Object.freeze({
  estavel: 'Quadro estável neste momento: fale normalmente.',
  piora: 'O quadro piorou: a fala está mais fraca, com pausas, e o paciente se queixa de mais mal-estar.',
  critico: 'Quadro crítico: respostas muito curtas e entrecortadas, com dificuldade para falar e sonolência.',
});

const CATALOGS = Object.freeze({
  [SIM_VERSION]: Object.freeze({ axes: V1, severity: SEVERITY_V1 }),
});

/** Catálogo da versão, ou null se a versão é desconhecida. */
export function getCatalog(version) {
  return CATALOGS[version] || null;
}

export const SEVERITIES = Object.freeze(Object.keys(SEVERITY_V1));

/** Linhas do perfil que vão ao prompt do paciente: um trecho fixo por eixo, na ordem canônica. */
export function profilePromptLines(axes, version) {
  const catalog = getCatalog(version);
  if (!catalog) return [];
  return AXIS_ORDER.map((axis) => catalog.axes[axis][axes[axis]].prompt);
}

/** Trecho fixo do estágio atual do quadro clínico, ou '' se a severidade é desconhecida. */
export function severityPrompt(severity, version) {
  const catalog = getCatalog(version);
  return (catalog && catalog.severity[severity]) || '';
}

/** Dicas de adaptação (para o preceptor) dos valores sorteados, na ordem canônica. */
export function adaptationLines(axes, version) {
  const catalog = getCatalog(version);
  if (!catalog) return [];
  return AXIS_ORDER.map((axis) => AXIS_LABELS[axis] + ' ' + catalog.axes[axis][axes[axis]].label.toLowerCase() + ': ' + catalog.axes[axis][axes[axis]].adaptation);
}

/** Rótulos para o debrief (só depois da avaliação): [{ axis, axisLabel, value, label }]. */
export function describeAxes(axes, version) {
  const catalog = getCatalog(version);
  if (!catalog) return [];
  return AXIS_ORDER.map((axis) => ({
    axis,
    axisLabel: AXIS_LABELS[axis],
    value: axes[axis],
    label: catalog.axes[axis][axes[axis]].label,
  }));
}
