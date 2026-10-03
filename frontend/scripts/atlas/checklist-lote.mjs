#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * checklist-lote.mjs — checklist em markdown que o conselho preenche por lote
 * (Onda 3, plano v4.0). Gera o checklist em branco e lê o devolvido.
 *
 * Regra: o lote é aprovado com ≥ 90% das fichas aprovadas (com ou sem
 * ressalva), com revisor, registro e data preenchidos. Só as fichas
 * aprovadas entram em curated/: ficha reprovada ou não marcada nunca entra,
 * a não ser que o revisor marque "aprovação em bloco" (cobre as não marcadas).
 *
 * Uso: node scripts/atlas/checklist-lote.mjs <checklist.md>   (mostra o resultado)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOTES = Object.freeze({ 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9, 10] });
export const MIN_PCT = 90;
/** Lote de casos de quiz (Onda 3.5, B.1): mesmo checklist, itens por id de caso. */
export const QUIZ_LOTE = '4a';

const PERGUNTAS_QUIZ = [
  'O enunciado é claro e a resposta é uma estrutura anatômica tocável.',
  'A resposta marcada como correta está certa (anatomia e clínica).',
  'Os distratores são plausíveis, mas estão errados para esse caso.',
  'A explicação está correta e ajuda quem errou.',
  'A terminologia está na Terminologia Anatômica, sem dose nem conduta.',
];

const PERGUNTAS = [
  'O resumo condiz com a estrutura (não a confunde com outra).',
  "A anatomia bate com as obras de referência (Gray's, Moore, Netter; Machado no nervoso).",
  'A histologia bate com Junqueira (Histologia Básica).',
  'A clínica cita condição relevante e real (nada inventado).',
  'As fontes citadas existem na obra indicada.',
];

const OPCOES = '[ ] Aprovar · [ ] Aprovar com ressalva · [ ] Reprovar';

/**
 * @param {{lote: number, sistemas: string[], fichas: Array<{sid: string, nome: string}>, hash: string}} p
 * @returns {string} checklist em branco
 */
export function buildChecklist({ lote, sistemas, fichas, hash, tipo = 'fichas' }) {
  const perguntas = tipo === 'quiz' ? PERGUNTAS_QUIZ : PERGUNTAS;
  const out = [
    `# Checklist de revisão — Lote ${lote} (${sistemas.join(', ')})`,
    '',
    `<!-- Preencha o cabeçalho, marque [x] em uma opção por ${tipo === 'quiz' ? 'caso' : 'ficha'} e devolva este arquivo. Não mude os códigos entre crases. -->`,
    '',
    `- **Lote:** ${lote}`,
    `- **${tipo === 'quiz' ? 'Casos' : 'Fichas'}:** ${fichas.length}`,
    `- **Conteúdo revisado (SHA-256):** ${hash}`,
    '- **Revisor:** ___',
    '- **Registro profissional:** ___',
    '- **Data:** AAAA-MM-DD',
    '',
    '## Aprovação em bloco (opcional)',
    '',
    tipo === 'quiz' ? '- [ ] Li todos os casos e aprovo todos os que não marquei como ressalva ou reprovação.' : '- [ ] Li todas as fichas e aprovo todas as que não marquei como ressalva ou reprovação.',
    '',
    `## As 5 perguntas (valem para cada ${tipo === 'quiz' ? 'caso' : 'ficha'})`,
    '',
    ...perguntas.map((q, i) => `${i + 1}. ${q}`),
    '',
    `Resultado do lote: aprovado com ${MIN_PCT}% ou mais ${tipo === 'quiz' ? 'dos casos aprovados' : 'das fichas aprovadas'}. Só ${tipo === 'quiz' ? 'os casos aprovados vão' : 'as fichas aprovadas vão'} ao ar; ${tipo === 'quiz' ? 'os reprovados são refeitos' : 'as reprovadas são refeitas'}.`,
    '',
    '## Fichas',
    '',
  ];
  fichas.forEach((f, i) => {
    out.push(`### ${i + 1}. ${f.nome} — \`${f.sid}\``, '', `- Resultado: ${OPCOES}`, '- Ressalva ou motivo: ', '');
  });
  return out.join('\n');
}

function field(md, name) {
  const re = new RegExp(`^\\s*-\\s*\\*{0,2}${name}:\\*{0,2}\\s*(.*)$`, 'im');
  const m = md.match(re);
  return m ? m[1].trim() : '';
}

const filled = (v) => v.length >= 3 && !/^_+/.test(v);

/**
 * Lê o checklist devolvido.
 * @param {string} md
 * @returns {{ lote: number|null, hash: string, revisor: string, registro: string, data: string, bloco: boolean,
 *   total: number, aprovadas: string[], ressalvas: Array<{sid: string, texto: string}>, reprovadas: Array<{sid: string, texto: string}>,
 *   naoMarcadas: string[], problemas: string[], pct: number, signed: boolean, resultado: string, approvedSids: string[] }}
 */
export function parseChecklist(md) {
  const text = String(md || '');
  const loteRaw = field(text, 'Lote');
  const lote = loteRaw === QUIZ_LOTE ? QUIZ_LOTE : (Number(loteRaw) || null);
  const revisor = field(text, 'Revisor');
  const registro = field(text, 'Registro profissional');
  const data = field(text, 'Data');
  const hash = field(text, 'Conteúdo revisado \\(SHA-256\\)');
  const bloco = /^\s*-\s*\[[xX]\]\s*Li tod[ao]s (as|os) (fichas|casos) e aprovo/m.test(text);
  const aprovadas = [];
  const ressalvas = [];
  const reprovadas = [];
  const naoMarcadas = [];
  const problemas = [];
  const blocks = text.split(/^###\s+/m).slice(1);
  for (const b of blocks) {
    const sid = (b.split('\n')[0].match(/`([^`]+)`/) || [])[1];
    if (!sid) continue;
    const res = (b.match(/^\s*-\s*Resultado:(.*)$/m) || [])[1] || '';
    const motivo = ((b.match(/^\s*-\s*Ressalva ou motivo:(.*)$/m) || [])[1] || '').trim();
    const marked = [
      ['aprovar', /\[[xX]\]\s*Aprovar(?!\s*com)/.test(res)],
      ['ressalva', /\[[xX]\]\s*Aprovar com ressalva/.test(res)],
      ['reprovar', /\[[xX]\]\s*Reprovar/.test(res)],
    ].filter(([, on]) => on).map(([k]) => k);
    if (marked.length > 1) { problemas.push(`${sid}: mais de uma opção marcada`); naoMarcadas.push(sid); continue; }
    const d = marked[0];
    if (d === 'reprovar') reprovadas.push({ sid, texto: motivo });
    else if (d === 'ressalva') {
      if (!motivo) { problemas.push(`${sid}: ressalva sem texto`); naoMarcadas.push(sid); } else ressalvas.push({ sid, texto: motivo });
    } else if (d === 'aprovar') aprovadas.push(sid);
    else if (bloco) aprovadas.push(sid);
    else naoMarcadas.push(sid);
  }
  const total = blocks.length;
  const ok = aprovadas.length + ressalvas.length;
  const pct = total ? Math.floor((1000 * ok) / total) / 10 : 0;
  const header = filled(revisor) && filled(registro) && /^\d{4}-\d{2}-\d{2}$/.test(data);
  if (!header) problemas.push('cabeçalho incompleto (revisor, registro profissional e data AAAA-MM-DD)');
  const signed = Boolean(lote && (LOTES[lote] || lote === QUIZ_LOTE) && header && total && pct >= MIN_PCT);
  const resultado = !signed ? (header && total && pct < MIN_PCT ? 'reprovado' : 'não assinado') : ressalvas.length || reprovadas.length ? 'aprovado com ressalvas' : 'aprovado';
  return {
    lote, hash, revisor, registro, data, bloco, total, aprovadas, ressalvas, reprovadas, naoMarcadas, problemas, pct, signed, resultado,
    approvedSids: signed ? [...aprovadas, ...ressalvas.map((r) => r.sid)] : [],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('uso: node scripts/atlas/checklist-lote.mjs <checklist.md>'); process.exit(1); }
  const r = parseChecklist(fs.readFileSync(file, 'utf8'));
  console.log(`[atlas] lote ${r.lote}: ${r.resultado} — ${r.pct}% aprovadas (${r.aprovadas.length} + ${r.ressalvas.length} com ressalva de ${r.total}; ${r.reprovadas.length} reprovadas; ${r.naoMarcadas.length} sem marca)`);
  for (const p of r.problemas) console.log(`  - ${p}`);
}
