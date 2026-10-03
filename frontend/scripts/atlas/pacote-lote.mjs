#!/usr/bin/env node
/**
 * pacote-lote.mjs — monta o .zip de um lote para o conselho (plano v4.0):
 * LEIA-ME.md, checklist.md, fichas/<sistema>.json e fontes.json.
 * O zip NÃO vai para o repositório nem para o site: é enviado ao conselho.
 *
 * Uso: node scripts/atlas/pacote-lote.mjs N [pasta-de-saída] [--revisao]
 *   --revisao  grava também docs/atlas-conteudo/revisao-lote-N.md em branco
 *              (só se o arquivo não existe ou ainda não tem revisor).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPacote } from './pacote-onda.mjs';
import { LOTES, QUIZ_LOTE, MIN_PCT, buildChecklist, parseChecklist } from './checklist-lote.mjs';
import { ONDAS, SISTEMA_LABEL, contentHash } from '../../modulos/anatomia-3d/js/revisao/review-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');
const DOCS = path.join(ROOT, 'docs/atlas-conteudo');

/** Nome PT de cada sid principal, pelo manifesto da onda. */
function namesOf(onda) {
  const p = path.join(DOCS, `fichas/onda-${String(onda).padStart(2, '0')}.json`);
  const m = new Map();
  if (!fs.existsSync(p)) return m;
  for (const l of JSON.parse(fs.readFileSync(p, 'utf8')).lotes || []) for (const it of l.itens || []) m.set(it.sid, it.nome_pt || it.sid);
  return m;
}

/**
 * @returns {Promise<{lote: number, sistemas: string[], porSistema: Record<string, object>, fichas: Array<{sid, nome, data}>, hash: string, faltando: number[]}>}
 */
export async function buildLote(lote, { pendente = path.join(DOCS, 'fichas/pendente') } = {}) {
  const ondas = LOTES[lote];
  if (!ondas) throw new Error(`lote inválido: ${lote} (1, 2 ou 3)`);
  const porSistema = {};
  const fichas = [];
  const faltando = [];
  for (const onda of ondas) {
    const sistema = ONDAS[onda - 1];
    let pac;
    try { pac = buildPacote(onda, pendente); } catch (e) { faltando.push(onda); continue; }
    const names = namesOf(onda);
    const obj = {};
    for (const l of Object.values(pac.lotes)) {
      for (const [sid, data] of Object.entries(l)) {
        obj[sid] = data;
        fichas.push({ sid, nome: names.get(sid) || sid, data });
      }
    }
    if (Object.keys(obj).length) porSistema[sistema] = obj;
    else faltando.push(onda);
  }
  const hash = await contentHash(fichas.map((f) => ({ sid: f.sid, data: f.data })));
  return { lote, sistemas: ondas.filter((o) => !faltando.includes(o)).map((o) => SISTEMA_LABEL[ONDAS[o - 1]]), porSistema, fichas, hash, faltando };
}

/** Casos do lote de quiz (pendente), na ordem dos arquivos. */
export async function buildQuizLote(dir = path.join(DOCS, 'quiz/pendente')) {
  if (!fs.existsSync(dir)) throw new Error(`não existe ${dir}`);
  const casos = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^lote-4a-\d+\.json$/.test(x)).sort()) casos.push(...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const fichas = casos.map((c) => ({ sid: c.id, nome: String(c.prompt_pt || c.id).slice(0, 90), data: c }));
  const hash = await contentHash(fichas.map((f) => ({ sid: f.sid, data: f.data })));
  return { casos, fichas, hash };
}

export function leiaMe(lote, n) {
  const quiz = lote === QUIZ_LOTE;
  return [
    `# Lote ${lote} — revisão ${quiz ? 'dos casos de quiz' : 'das fichas'} do Atlas 3D (${n} ${quiz ? 'casos' : 'fichas'})`,
    '',
    quiz ? '1. Abra `casos.json` num editor de texto (VS Code, Notepad++). Cada caso traz o enunciado, a resposta, os distratores e a explicação.' : '1. Abra os arquivos de `fichas/` num editor de texto (VS Code, Notepad++) ou no navegador.',
    `2. Para cada ${quiz ? 'caso' : 'ficha'} do \`checklist.md\`, confira as 5 perguntas.`,
    '3. Marque `[x]` em uma opção: Aprovar, Aprovar com ressalva ou Reprovar. Na ressalva ou reprovação, escreva o que muda.',
    `4. Se leu tudo e está tudo certo, marque "Aprovação em bloco": vale para ${quiz ? 'os casos' : 'as fichas'} que você não marcou.`,
    '5. Preencha Revisor, Registro profissional e Data (AAAA-MM-DD) no topo do `checklist.md`.',
    '6. Devolva só o `checklist.md` preenchido. Prazo: 3 dias.',
    `7. Com ${MIN_PCT}% ou mais ${quiz ? 'dos casos aprovados' : 'das fichas aprovadas'}, o lote é aprovado. Só os aprovados vão ao ar; os reprovados são refeitos.`,
    quiz ? '8. As respostas são estruturas do corpo 3D (`za:...`); a ordem e o sorteio são do aplicativo.' : '8. `fontes.json` lista as obras citadas (`obraId` em cada ficha).',
    quiz ? '9. Não altere os códigos entre crases (`q4a-...`): eles identificam cada caso.' : '9. Não altere os códigos entre crases (`za:...`): eles ligam a ficha à estrutura 3D.',
    '10. Dúvidas: responda à coordenação do atlas.',
    '',
  ].join('\n');
}

export async function writeQuizLote(outDir, { revisao = false } = {}) {
  const b = await buildQuizLote();
  if (!b.casos.length) throw new Error('lote 4a sem casos em quiz/pendente');
  const dir = path.join(outDir, `lote-${QUIZ_LOTE}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const checklist = buildChecklist({ lote: QUIZ_LOTE, sistemas: ['Quiz'], fichas: b.fichas, hash: b.hash, tipo: 'quiz' });
  fs.writeFileSync(path.join(dir, 'LEIA-ME.md'), leiaMe(QUIZ_LOTE, b.casos.length));
  fs.writeFileSync(path.join(dir, 'checklist.md'), checklist);
  fs.writeFileSync(path.join(dir, 'casos.json'), `${JSON.stringify(b.casos, null, 2)}\n`);
  const zip = path.join(outDir, `lote-${QUIZ_LOTE}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, `lote-${QUIZ_LOTE}`], { cwd: outDir });
  if (revisao) {
    const rp = path.join(DOCS, `revisao-lote-${QUIZ_LOTE}.md`);
    const cur = fs.existsSync(rp) ? parseChecklist(fs.readFileSync(rp, 'utf8')) : null;
    if (!cur || !/[a-zà-ú]{3}/i.test(cur.revisor.replace(/_/g, ''))) fs.writeFileSync(rp, checklist);
  }
  return { ...b, zip, sistemas: ['Quiz'], faltando: [], fichas: b.fichas };
}

export async function writeLote(lote, outDir, { revisao = false } = {}) {
  if (lote === QUIZ_LOTE) return writeQuizLote(outDir, { revisao });
  const b = await buildLote(lote);
  if (!b.fichas.length) throw new Error(`lote ${lote} sem fichas em pendente`);
  const dir = path.join(outDir, `lote-${lote}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'fichas'), { recursive: true });
  const checklist = buildChecklist({ lote, sistemas: b.sistemas, fichas: b.fichas, hash: b.hash });
  fs.writeFileSync(path.join(dir, 'LEIA-ME.md'), leiaMe(lote, b.fichas.length));
  fs.writeFileSync(path.join(dir, 'checklist.md'), checklist);
  for (const [s, obj] of Object.entries(b.porSistema)) fs.writeFileSync(path.join(dir, 'fichas', `${s}.json`), `${JSON.stringify(obj, null, 2)}\n`);
  fs.copyFileSync(path.join(ROOT, 'frontend/modulos/anatomia-3d/data/atlas/fontes.json'), path.join(dir, 'fontes.json'));
  const atencao = path.join(DOCS, `fichas/pontos-de-atencao-lote-${lote}.md`);
  if (fs.existsSync(atencao)) fs.copyFileSync(atencao, path.join(dir, 'PONTOS-DE-ATENCAO.md'));
  // Revisão técnica prévia (correções já aplicadas; a aprovação segue sendo do conselho)
  const previas = fs.readdirSync(path.join(DOCS, 'fichas')).filter((f) => /^revisao-previa-onda/.test(f) && (f.match(/\d{2}/g) || []).some((n) => LOTES[lote].includes(Number(n)))).sort();
  if (previas.length) fs.writeFileSync(path.join(dir, 'REVISAO-TECNICA-PREVIA.md'), previas.map((f) => fs.readFileSync(path.join(DOCS, 'fichas', f), 'utf8')).join('\n\n---\n\n'));
  const zip = path.join(outDir, `lote-${lote}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, `lote-${lote}`], { cwd: outDir });
  if (revisao) {
    const rp = path.join(DOCS, `revisao-lote-${lote}.md`);
    const cur = fs.existsSync(rp) ? parseChecklist(fs.readFileSync(rp, 'utf8')) : null;
    if (!cur || !/[a-zà-ú]{3}/i.test(cur.revisor.replace(/_/g, ''))) fs.writeFileSync(rp, `${checklist}`);
  }
  return { ...b, zip };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const lote = args[0] === QUIZ_LOTE ? QUIZ_LOTE : Number(args[0]);
  const out = args.find((a, i) => i > 0 && !a.startsWith('--')) || process.cwd();
  if (!lote) { console.error('uso: node scripts/atlas/pacote-lote.mjs N [pasta] [--revisao]'); process.exit(1); }
  const r = await writeLote(lote, path.resolve(out), { revisao: args.includes('--revisao') });
  console.log(`[atlas] ${r.zip}: lote ${lote}, ${r.fichas.length} fichas (${r.sistemas.join(', ')}), SHA-256 ${r.hash.slice(0, 12)}…${r.faltando.length ? ` — ondas sem fichas: ${r.faltando.join(', ')}` : ''}`);
}
