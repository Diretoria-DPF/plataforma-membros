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
import { LOTES, MIN_PCT, buildChecklist, parseChecklist } from './checklist-lote.mjs';
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

export function leiaMe(lote, n) {
  return [
    `# Lote ${lote} — revisão das fichas do Atlas 3D (${n} fichas)`,
    '',
    '1. Abra os arquivos de `fichas/` num editor de texto (VS Code, Notepad++) ou no navegador.',
    '2. Para cada ficha do `checklist.md`, confira as 5 perguntas.',
    '3. Marque `[x]` em uma opção: Aprovar, Aprovar com ressalva ou Reprovar. Na ressalva ou reprovação, escreva o que muda.',
    '4. Se leu tudo e está tudo certo, marque "Aprovação em bloco": vale para as fichas que você não marcou.',
    '5. Preencha Revisor, Registro profissional e Data (AAAA-MM-DD) no topo do `checklist.md`.',
    '6. Devolva só o `checklist.md` preenchido. Prazo: 3 dias.',
    `7. Com ${MIN_PCT}% ou mais das fichas aprovadas, o lote é aprovado. Só as aprovadas vão ao ar; as reprovadas são refeitas.`,
    '8. `fontes.json` lista as obras citadas (`obraId` em cada ficha).',
    '9. Não altere os códigos entre crases (`za:...`): eles ligam a ficha à estrutura 3D.',
    '10. Dúvidas: responda à coordenação do atlas.',
    '',
  ].join('\n');
}

export async function writeLote(lote, outDir, { revisao = false } = {}) {
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
  const lote = Number(args[0]);
  const out = args.find((a, i) => i > 0 && !a.startsWith('--')) || process.cwd();
  if (!lote) { console.error('uso: node scripts/atlas/pacote-lote.mjs N [pasta] [--revisao]'); process.exit(1); }
  const r = await writeLote(lote, path.resolve(out), { revisao: args.includes('--revisao') });
  console.log(`[atlas] ${r.zip}: lote ${lote}, ${r.fichas.length} fichas (${r.sistemas.join(', ')}), SHA-256 ${r.hash.slice(0, 12)}…${r.faltando.length ? ` — ondas sem fichas: ${r.faltando.join(', ')}` : ''}`);
}
