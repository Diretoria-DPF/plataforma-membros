/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * import-course.mjs — converte uma pasta de curso (curso.md, aula-NN-*.md, banco-questoes.md) no formato das
 * tabelas da 056 e gera um arquivo SQL idempotente para aplicar À MÃO (nunca aplica nada).
 *
 *   node scripts/import-course.mjs <pasta-do-curso> [--versao N] [--saida arquivo.sql] [--json]
 *
 * Regras:
 *  - o curso SEMPRE entra (ou volta) em 'rascunho_interno', sem published_at: só a equipe com content.review
 *    publica, e a Worker recusa publicar enquanto houver conferência pendente;
 *  - marcador [VERIFICAR ...] nunca vai para o texto do aluno: sai do texto, e cada remoção vira uma nota interna
 *    em courses.review_notes; seção que fica vazia sem os marcadores sai inteira (também anotada);
 *  - "Notas ao dono" e o bloco de arquivos do curso.md não entram; a linha "Referências de apoio" vira source_refs;
 *  - questões: atualiza por ext_ref (Q1, Q2...) e desativa as que sumiram do banco (as tentativas guardam os ids).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARK_RE = /\s*\[\s*VERIFICAR\b[^\]]*\]/gi;
const HAS_MARK_RE = /\[\s*VERIFICAR\b/i;
const KIND_MAP = { diretriz: 'diretriz', pop: 'pop', modulo: 'modulo', minicurso: 'minicurso' };

/** Frontmatter simples (chave: valor) e o corpo. */
export function splitFrontmatter(text) {
  const src = text.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  m[1].split('\n').forEach((line) => {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return { meta, body: src.slice(m[0].length) };
}

/** Seções "## " do markdown: [{ heading, lines }]; o que vem antes do primeiro "## " fica com heading ''. */
export function sections(body) {
  const out = [{ heading: '', lines: [] }];
  body.split('\n').forEach((line) => {
    if (/^##\s/.test(line)) out.push({ heading: line, lines: [] });
    else out[out.length - 1].lines.push(line);
  });
  return out;
}

const isHollow = (line) => /^\s*$/.test(line) || /^\s*(?:[-*]|\d+\.)\s*(?:\*\*[^*]+:?\*\*\s*:?)?\s*$/.test(line);
const isAside = (line) => /^\s*\(.*\)\s*$/.test(line);

/** Tira os marcadores do texto de uma aula. Devolve { body, notes }. */
export function stripLesson(body, where) {
  const notes = [];
  const kept = [];
  sections(body).forEach((sec) => {
    let marked = 0;
    const lines = [];
    sec.lines.forEach((line) => {
      if (!HAS_MARK_RE.test(line)) { lines.push(line); return; }
      marked++;
      notes.push({ where, text: line.trim().slice(0, 300) });
      const clean = line.replace(MARK_RE, '');
      if (!isHollow(clean)) lines.push(clean);
    });
    const content = lines.filter((l) => !isHollow(l) && !isAside(l));
    if (marked && sec.heading && content.length === 0) {
      notes.push({ where, text: 'Seção retirada até a conferência: ' + sec.heading.replace(/^##\s*/, '') });
      return;
    }
    if (sec.heading) kept.push(sec.heading);
    kept.push(...lines);
  });
  return { body: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), notes };
}

/** Uma aula: título, minutos, texto limpo e fontes de apoio. */
export function parseLesson(text, file) {
  const { meta, body } = splitFrontmatter(text);
  const position = parseInt(meta.aula, 10);
  if (!Number.isInteger(position)) throw new Error(file + ': falta "aula" no cabeçalho');
  const title = String(meta.titulo || '').trim();
  let sources = [];
  const lines = body.split('\n').filter((line) => {
    if (/^#\s/.test(line)) return false; // o título vem do cabeçalho
    const ref = /^\*Refer[êe]ncias de apoio:.*\(([^)]+)\)\.?\*\s*$/.exec(line.trim());
    if (ref) { sources = ref[1].split(',').map((s) => s.trim()).filter(Boolean); return false; }
    return true;
  });
  const where = 'aula ' + position;
  const stripped = stripLesson(lines.join('\n'), where);
  return {
    position, title: title.replace(MARK_RE, ''), minMinutes: parseInt(meta.duracao_prevista_min, 10) || 5,
    body: stripped.body, sources: sources.map((s) => s.replace(MARK_RE, '')), notes: stripped.notes,
  };
}

/** Banco de questões: blocos **Qn (C).** + alternativas + **Gabarito: X.** + Fonte. */
export function parseQuestions(text) {
  const notes = [];
  const questions = [];
  text.replace(/\r\n/g, '\n').split(/\n---\n/).forEach((block) => {
    const head = /\*\*Q(\d+)(\s*\(C\))?\.\*\*\s*(.+)/.exec(block);
    if (!head) return;
    const ref = 'Q' + head[1];
    const options = [];
    block.split('\n').forEach((line) => {
      const opt = /^\s*-\s*([A-F])\)\s*(.+)$/.exec(line);
      if (opt) options.push({ letter: opt[1], text: opt[2].trim() });
    });
    const key = /\*\*Gabarito:\s*([A-F])\.\*\*\s*(.*)/.exec(block);
    const src = /^Fonte:\s*(.+)$/m.exec(block);
    if (!key || options.length < 2) throw new Error(ref + ': alternativas ou gabarito ausentes');
    const correct = options.findIndex((o) => o.letter === key[1]);
    if (correct < 0) throw new Error(ref + ': gabarito fora das alternativas');
    const clean = (s, field) => {
      if (HAS_MARK_RE.test(s)) notes.push({ where: ref + ' (' + field + ')', text: s.trim().slice(0, 300) });
      return s.replace(MARK_RE, '').replace(/\s+([.;,])/g, '$1').trim();
    };
    questions.push({
      ref, isCritical: Boolean(head[2]), stem: clean(head[3], 'enunciado'),
      options: options.map((o) => clean(o.text, 'alternativa')), correct,
      explanation: clean(key[2] || '', 'justificativa'), source: clean(src ? src[1] : 'Conteúdo do curso.', 'fonte'),
    });
  });
  return { questions, notes };
}

const num = (re, text, fallback) => { const m = re.exec(text); return m ? parseInt(m[1], 10) : fallback; };

/** curso.md: metadados, objetivo como resumo e as regras de prova, carga e validade. */
export function parseCourse(text) {
  const { meta, body } = splitFrontmatter(text);
  const slug = String(meta.id || '').trim();
  const objetivo = (/##\s*Objetivo\s*\n+([\s\S]*?)(?:\n##\s|$)/.exec(body) || [])[1] || '';
  const tipo = String(meta.tipo || '');
  const kind = Object.keys(KIND_MAP).find((k) => tipo.includes(k)) || 'minicurso';
  const avaliacao = (/##\s*Avalia[çc][ãa]o final\s*\n([\s\S]*?)(?:\n##\s|$)/.exec(body) || [])[1] || '';
  return {
    slug, title: String(meta.titulo || '').trim(), summary: objetivo.replace(MARK_RE, '').replace(/\s+/g, ' ').trim(), kind,
    riskClass: /laborat|pop|diretriz|seguran/i.test(tipo + ' ' + body.slice(0, 400)) ? 'A' : 'B',
    workloadMinutes: num(/Carga hor[áa]ria declarada:[^(\n]*\((\d+)\s*minutos?\)/i, body, null),
    passPct: num(/##\s*Nota m[íi]nima[^\n]*\n+\s*(\d+)\s*%/i, body, 70),
    examSize: num(/(\d+)\s+quest[õo]es[^\n]*sorteadas/i, avaliacao, 10),
    minCritical: num(/ao menos\s+(\d+)/i, avaliacao, 0),
    maxAttempts: num(/At[ée]\s+(\d+)\s+tentativas/i, avaliacao, 3),
    retryWaitHours: num(/espera de\s+(\d+)\s+horas/i, avaliacao, 24),
    validityMonths: num(/##\s*Validade\s*\n+\s*(\d+)\s*meses/i, body, null),
  };
}

/** Lê a pasta inteira e confere o que a Worker vai exigir. */
export function readCourseDir(dir) {
  const course = parseCourse(fs.readFileSync(path.join(dir, 'curso.md'), 'utf8'));
  const lessons = fs.readdirSync(dir).filter((f) => /^aula-\d+.*\.md$/.test(f)).sort()
    .map((f) => parseLesson(fs.readFileSync(path.join(dir, f), 'utf8'), f));
  const bank = parseQuestions(fs.readFileSync(path.join(dir, 'banco-questoes.md'), 'utf8'));
  const notes = lessons.flatMap((l) => l.notes).concat(bank.notes);
  const errors = [];
  const warnings = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(course.slug)) errors.push('id do curso inválido');
  if (!course.workloadMinutes || course.workloadMinutes < 15) errors.push('carga horária declarada ausente ou abaixo de 15 minutos');
  if (!lessons.length) errors.push('nenhuma aula');
  if (bank.questions.length < course.examSize) errors.push('banco menor que a prova');
  if (bank.questions.filter((q) => q.isCritical).length < course.minCritical) errors.push('críticas abaixo do mínimo');
  if (bank.questions.length < 3 * course.examSize) warnings.push('banco abaixo de 3 vezes a prova (' + bank.questions.length + ' para ' + course.examSize + ')');
  const visible = [course.title, course.summary].concat(lessons.flatMap((l) => [l.title, l.body, ...l.sources]))
    .concat(bank.questions.flatMap((q) => [q.stem, ...q.options, q.explanation, q.source]));
  if (visible.some((t) => HAS_MARK_RE.test(t))) errors.push('marcador de conferência sobrou no texto do aluno');
  return { course, lessons, questions: bank.questions, notes, errors, warnings };
}

const lit = (v) => (v === null || v === undefined ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'");
const jlit = (v) => lit(JSON.stringify(v)) + '::jsonb';

/** SQL idempotente numa transação. O curso volta a rascunho_interno a cada importação. */
export function toSql(data, version = 1) {
  const c = data.course;
  const cid = `(SELECT id FROM courses WHERE slug = ${lit(c.slug)})`;
  const out = [
    '-- Gerado por worker/scripts/import-course.mjs. Aplicar À MÃO, depois das migrações 056–058. Não publica o curso.',
    'BEGIN;',
    `INSERT INTO courses (slug, title, summary, kind, risk_class, workload_minutes, version, pass_pct, max_attempts, retry_wait_hours,
  exam_size, min_critical, validity_months, status, review_notes)
VALUES (${lit(c.slug)}, ${lit(c.title)}, ${lit(c.summary)}, ${lit(c.kind)}, ${lit(c.riskClass)}, ${c.workloadMinutes}, ${version}, ${c.passPct},
  ${c.maxAttempts}, ${c.retryWaitHours}, ${c.examSize}, ${c.minCritical}, ${c.validityMonths === null ? 'NULL' : c.validityMonths}, 'rascunho_interno', ${jlit(data.notes)})
ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary, kind = EXCLUDED.kind, risk_class = EXCLUDED.risk_class,
  workload_minutes = EXCLUDED.workload_minutes, version = GREATEST(courses.version, EXCLUDED.version), pass_pct = EXCLUDED.pass_pct, max_attempts = EXCLUDED.max_attempts,
  retry_wait_hours = EXCLUDED.retry_wait_hours, exam_size = EXCLUDED.exam_size, min_critical = EXCLUDED.min_critical,
  validity_months = EXCLUDED.validity_months, status = 'rascunho_interno', published_at = NULL, review_notes = EXCLUDED.review_notes, updated_at = now();`,
    `DELETE FROM course_lessons WHERE course_id = ${cid};`,
  ];
  data.lessons.forEach((l) => {
    out.push(`INSERT INTO course_lessons (course_id, position, title, body_md, min_minutes, source_refs) VALUES (${cid}, ${l.position}, ${lit(l.title)}, ${lit(l.body)}, ${l.minMinutes}, ${jlit(l.sources)});`);
  });
  data.questions.forEach((q) => {
    out.push(`INSERT INTO assessment_questions (course_id, ext_ref, stem, options, correct, explanation, source_ref, is_critical, active)
VALUES (${cid}, ${lit(q.ref)}, ${lit(q.stem)}, ${jlit(q.options)}, ${q.correct}, ${lit(q.explanation)}, ${lit(q.source)}, ${q.isCritical}, TRUE)
ON CONFLICT (course_id, ext_ref) DO UPDATE SET stem = EXCLUDED.stem, options = EXCLUDED.options, correct = EXCLUDED.correct,
  explanation = EXCLUDED.explanation, source_ref = EXCLUDED.source_ref, is_critical = EXCLUDED.is_critical, active = TRUE, updated_at = now();`);
  });
  const refs = data.questions.map((q) => lit(q.ref)).join(', ') || "''";
  out.push(`UPDATE assessment_questions SET active = FALSE, updated_at = now() WHERE course_id = ${cid} AND ext_ref NOT IN (${refs});`);
  out.push('COMMIT;', '');
  return out.join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) { console.error('Uso: node scripts/import-course.mjs <pasta> [--versao N] [--saida arquivo.sql] [--json]'); return 2; }
  const vIdx = args.indexOf('--versao');
  const version = vIdx >= 0 ? parseInt(args[vIdx + 1], 10) : 1;
  const data = readCourseDir(path.resolve(dir));
  data.warnings.forEach((w) => console.error('aviso: ' + w));
  if (data.errors.length) { data.errors.forEach((e) => console.error('erro: ' + e)); return 1; }
  const oIdx = args.indexOf('--saida');
  const output = args.includes('--json') ? JSON.stringify(data, null, 2) : toSql(data, version);
  if (oIdx >= 0) fs.writeFileSync(args[oIdx + 1], output, 'utf8');
  else process.stdout.write(output);
  console.error(`ok: ${data.lessons.length} aulas, ${data.questions.length} questões (${data.questions.filter((q) => q.isCritical).length} críticas), ${data.notes.length} conferências internas; estado rascunho_interno`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv);
