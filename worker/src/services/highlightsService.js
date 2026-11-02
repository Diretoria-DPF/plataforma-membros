/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * highlightsService.js — "Destaques da Liga", bloco "Na Liga" da tela Início (sql/048; docs/destaques.md).
 *
 * Itens MANUAIS gerenciados por quem tem a capacidade home.curate (admin ou cargo gestor). Os eventos e posts
 * automáticos não passam por aqui: o cliente os mescla a partir de apiListEvents, sem gravação no banco.
 *
 *  - apiListHighlights: exige sessão válida (a Início é do membro). Com a flag highlights_enabled desligada devolve
 *    lista vazia. Devolve só itens ativos e dentro da janela, no máximo VISIBLE_MAX, ordenados por position.
 *  - ações de gestão (home.curate): listar tudo, salvar (criar/editar), ligar/desligar, reordenar e remover. Toda
 *    escrita tem limite por pessoa e entra em audit_logs; a entrada é validada aqui (o banco repete as regras).
 *  - degrada com segurança: sem a migração 048 a leitura devolve lista vazia (sem 500) e a escrita recusa com
 *    mensagem clara. Mensagens nunca ecoam o texto recebido nem detalhes do banco.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { enforceWriteLimit } from '../writeLimits.js';
import { isEnabled } from './featureFlagService.js';

const H = C.HIGHLIGHTS;
const CAPABILITY = 'home.curate';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Controles C0/C1, marcas de direção, separadores de linha/parágrafo e BOM viram espaço.
const UNSAFE_CHARS_RE = new RegExp('[\u0000-\u001f\u007f-\u009f​-‏ -‮⁦-⁩﻿]', 'g');
/** Domínios https aceitos no link (hostname exato). Reexporta C.HIGHLIGHTS.LINK_HOSTS. */
export const HIGHLIGHT_LINK_HOSTS = H.LINK_HOSTS;
const INTERNAL_PATH_RE = /^\/(?!\/)[A-Za-z0-9._~\-/?#=&%+@:,;!$'()*]*$/;
const UNAVAILABLE_MESSAGE = 'Os destaques ainda não estão disponíveis. A atualização do banco está pendente.';
const MIN_DATE_MS = Date.UTC(2020, 0, 1);

function isMissingTable(err) {
  const msg = String((err && err.message) || '');
  return Boolean(err && (err.code === '42P01' || (/home_highlights/.test(msg) && /does not exist/.test(msg))));
}

/** Texto de uma linha: sem caracteres de controle, espaços colapsados, sem pontas em branco. */
export function cleanText(raw) {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(UNSAFE_CHARS_RE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Link do destaque: vazio vira null; aceita só caminho interno ("/blog/") ou https de um domínio da lista
 * HIGHLIGHT_LINK_HOSTS (hostname exato, porta padrão, sem usuário/senha; punycode só passa se estiver na lista).
 * Devolve { ok: true, value } ou { ok: false }.
 */
export function parseLink(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const link = raw.trim();
  if (!link) return { ok: true, value: null };
  if (link.length > H.LINK_MAX || /[\s\\\u0000-\u001f\u007f-\u009f]/.test(link)) return { ok: false };
  if (link.startsWith('/')) return INTERNAL_PATH_RE.test(link) ? { ok: true, value: link } : { ok: false };
  if (!/^https:\/\//i.test(link)) return { ok: false };
  let url;
  try { url = new URL(link); } catch (e) { return { ok: false }; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname) return { ok: false };
  if (!HIGHLIGHT_LINK_HOSTS.includes(url.hostname)) return { ok: false };
  return { ok: true, value: link };
}

function parseDate(raw, label) {
  const date = new Date(raw);
  const ms = date.getTime();
  if (typeof raw !== 'string' && typeof raw !== 'number') throw E.ValidationError(label + ' inválida.');
  if (!Number.isFinite(ms) || ms < MIN_DATE_MS) throw E.ValidationError(label + ' inválida.');
  return date;
}

/** Entrada validada de "salvar destaque" (sem tocar no banco). Lança ValidationError esperado. */
export function normalizeSaveInput(input, now = Date.now()) {
  const id = input.id === undefined || input.id === null || input.id === '' ? null : input.id;
  if (id !== null && (typeof id !== 'string' || !UUID_RE.test(id))) throw E.ValidationError('Destaque inválido.');
  if (!H.KINDS.includes(input.kind)) throw E.ValidationError('Tipo de destaque inválido.');
  const title = cleanText(input.title);
  if (title.length < 1 || title.length > H.TITLE_MAX) throw E.ValidationError('O título precisa ter de 1 a ' + H.TITLE_MAX + ' caracteres.');
  const subtitle = input.subtitle === undefined || input.subtitle === null ? '' : cleanText(input.subtitle);
  if (typeof (input.subtitle ?? '') !== 'string' || subtitle.length > H.SUBTITLE_MAX) {
    throw E.ValidationError('O texto de apoio pode ter no máximo ' + H.SUBTITLE_MAX + ' caracteres.');
  }
  const link = parseLink(input.linkPath);
  if (!link.ok) throw E.ValidationError('O link precisa ser um caminho interno (começa com /) ou um endereço https de um site aceito: ' + HIGHLIGHT_LINK_HOSTS.join(', ') + '.');
  const startsAt = input.startsAt === undefined || input.startsAt === null || input.startsAt === '' ? null : parseDate(input.startsAt, 'Data de início');
  let endsAt = null;
  if (input.endsAt !== undefined && input.endsAt !== null && input.endsAt !== '') {
    endsAt = parseDate(input.endsAt, 'Data de saída');
    if (endsAt.getTime() <= now) throw E.ValidationError('A data de saída precisa ser futura.');
    if (endsAt.getTime() > now + H.FAR_FUTURE_YEARS * 366 * 86400000) throw E.ValidationError('A data de saída está longe demais.');
    if (startsAt && endsAt.getTime() <= startsAt.getTime()) throw E.ValidationError('A data de saída precisa ser depois da data de início.');
  }
  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') throw E.ValidationError('Valor inválido para exibir.');
  return {
    id, kind: input.kind, title, subtitle, linkPath: link.value,
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
    isActive: input.isActive,
  };
}

function requireUuid(value) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw E.ValidationError('Destaque inválido.');
  return value.toLowerCase();
}

const iso = (value) => (value instanceof Date ? value.toISOString() : value || null);

function publicDto(row) {
  return { id: row.id, kind: row.kind, title: row.title, subtitle: row.subtitle || '', linkPath: row.link_path || null };
}

function adminDto(row, visible) {
  return {
    id: row.id, kind: row.kind, title: row.title, subtitle: row.subtitle || '', linkPath: row.link_path || null,
    position: Number(row.position) || 0, isActive: row.is_active === true,
    startsAt: iso(row.starts_at), endsAt: iso(row.ends_at), createdAt: iso(row.created_at),
    inWindow: row.in_window === true, visible,
  };
}

// apiListHighlights (sessão válida; flag highlights_enabled)
export async function listHighlights(sql, identity) {
  if (!identity) throw E.AuthError('Sessão inválida.');
  if (!(await isEnabled(sql, H.FLAG, identity))) return { success: true, enabled: false, highlights: [] };
  try {
    const rows = await sql`
      SELECT id, kind, title, subtitle, link_path
      FROM home_highlights
      WHERE is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
      ORDER BY position ASC, created_at DESC
      LIMIT ${H.VISIBLE_MAX}`;
    return { success: true, enabled: true, highlights: rows.map(publicDto) };
  } catch (err) {
    if (isMissingTable(err)) return { success: true, enabled: true, highlights: [], tableMissing: true };
    throw err;
  }
}

// apiAdminListHighlights (home.curate): tudo, inclusive ocultos e vencidos
export async function adminList(sql, identity) {
  S.requireCapability(identity, CAPABILITY);
  try {
    const rows = await sql`
      SELECT id, kind, title, subtitle, link_path, position, is_active, starts_at, ends_at, created_at,
             (is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())) AS in_window
      FROM home_highlights
      ORDER BY position ASC, created_at DESC
      LIMIT ${H.TOTAL_MAX}`;
    let shown = 0;
    const highlights = rows.map((row) => {
      const visible = row.in_window === true && shown < H.VISIBLE_MAX;
      if (visible) shown += 1;
      return adminDto(row, visible);
    });
    return { success: true, highlights, visibleMax: H.VISIBLE_MAX, visibleCount: shown, totalMax: H.TOTAL_MAX };
  } catch (err) {
    if (isMissingTable(err)) {
      return { success: true, highlights: [], visibleMax: H.VISIBLE_MAX, visibleCount: 0, totalMax: H.TOTAL_MAX, tableMissing: true };
    }
    throw err;
  }
}

async function guardWrite(sql, identity) {
  S.requireCapability(identity, CAPABILITY);
  await enforceWriteLimit(sql, 'HIGHLIGHT_WRITE', identity.profileId, H.WRITE_RATE_LIMIT, 'de alterações nos destaques');
}

/** Roda a escrita; tabela ausente (048 pendente) vira erro esperado e claro, sem vazar detalhe do banco. */
async function writing(fn) {
  try {
    return await fn();
  } catch (err) {
    if (isMissingTable(err)) throw E.ConflictError(UNAVAILABLE_MESSAGE);
    throw err;
  }
}

async function visibleCount(sql) {
  const rows = await sql`
    SELECT count(*)::int AS n FROM (
      SELECT 1 FROM home_highlights
      WHERE is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
      ORDER BY position ASC LIMIT ${H.VISIBLE_MAX + 1}) t`;
  return rows.length ? Number(rows[0].n) || 0 : 0;
}

function capWarning(count) {
  return count > H.VISIBLE_MAX
    ? 'Há mais de ' + H.VISIBLE_MAX + ' destaques ativos: só os ' + H.VISIBLE_MAX + ' primeiros da ordem aparecem na Início.'
    : null;
}

// apiAdminSaveHighlight (home.curate): cria (sem id) ou edita (com id)
export async function save(sql, identity, input, correlationId) {
  await guardWrite(sql, identity);
  const data = normalizeSaveInput(input);
  return writing(async () => {
    let id = data.id;
    if (id) {
      const rows = await sql`
        UPDATE home_highlights SET kind = ${data.kind}, title = ${data.title}, subtitle = ${data.subtitle},
          link_path = ${data.linkPath}, ends_at = ${data.endsAt}::timestamptz,
          starts_at = COALESCE(${data.startsAt}::timestamptz, starts_at),
          is_active = COALESCE(${data.isActive ?? null}::boolean, is_active), updated_at = now()
        WHERE id = ${id}::uuid RETURNING id`;
      if (!rows.length) throw E.NotFoundError('Destaque não encontrado.');
    } else {
      const total = await sql`SELECT count(*)::int AS n FROM home_highlights`;
      if ((total.length ? Number(total[0].n) : 0) >= H.TOTAL_MAX) {
        throw E.ConflictError('Limite de ' + H.TOTAL_MAX + ' destaques atingido. Remova algum antes de adicionar.');
      }
      const rows = await sql`
        INSERT INTO home_highlights (kind, title, subtitle, link_path, position, is_active, starts_at, ends_at, created_by)
        VALUES (${data.kind}, ${data.title}, ${data.subtitle}, ${data.linkPath},
          COALESCE((SELECT min(position) FROM home_highlights), 0) - 1, ${data.isActive ?? true},
          COALESCE(${data.startsAt}::timestamptz, now()), ${data.endsAt}::timestamptz, ${identity.profileId}::uuid)
        RETURNING id`;
      id = rows[0].id;
    }
    await Logging.logAudit(sql, correlationId, identity.profileId, data.id ? 'UPDATE_HIGHLIGHT' : 'CREATE_HIGHLIGHT', 'home_highlight', id, 'success',
      { kind: data.kind, hasLink: Boolean(data.linkPath), hasEnd: Boolean(data.endsAt) });
    return { success: true, message: data.id ? 'Destaque atualizado.' : 'Destaque adicionado.', id, warning: capWarning(await visibleCount(sql)) };
  });
}

// apiAdminSetHighlightActive (home.curate): { id, isActive }
export async function setActive(sql, identity, input, correlationId) {
  await guardWrite(sql, identity);
  const id = requireUuid(input.id);
  if (typeof input.isActive !== 'boolean') throw E.ValidationError('Valor inválido para exibir.');
  return writing(async () => {
    const rows = await sql`UPDATE home_highlights SET is_active = ${input.isActive}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    if (!rows.length) throw E.NotFoundError('Destaque não encontrado.');
    await Logging.logAudit(sql, correlationId, identity.profileId, input.isActive ? 'SHOW_HIGHLIGHT' : 'HIDE_HIGHLIGHT', 'home_highlight', id, 'success', null);
    return {
      success: true, message: input.isActive ? 'Destaque ligado.' : 'Destaque desligado.',
      warning: input.isActive ? capWarning(await visibleCount(sql)) : null,
    };
  });
}

// apiAdminReorderHighlights (home.curate): { ids: [uuid, ...] } na ordem desejada (a lista inteira)
export async function reorder(sql, identity, input, correlationId) {
  await guardWrite(sql, identity);
  const ids = input.ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > H.TOTAL_MAX) throw E.ValidationError('Ordem inválida.');
  const clean = ids.map(requireUuid);
  if (new Set(clean).size !== clean.length) throw E.ValidationError('Ordem inválida.');
  return writing(async () => {
    const positions = clean.map((_, index) => index);
    const rows = await sql`
      UPDATE home_highlights h SET position = v.pos, updated_at = now()
      FROM unnest(${clean}::uuid[], ${positions}::int[]) AS v(id, pos)
      WHERE h.id = v.id RETURNING h.id`;
    if (rows.length !== clean.length) throw E.NotFoundError('Algum destaque da lista não existe mais. Atualize a tela.');
    await Logging.logAudit(sql, correlationId, identity.profileId, 'REORDER_HIGHLIGHTS', 'home_highlight', null, 'success', { count: clean.length });
    return { success: true, message: 'Ordem atualizada.' };
  });
}

// apiAdminDeleteHighlight (home.curate): { id }
export async function remove(sql, identity, input, correlationId) {
  await guardWrite(sql, identity);
  const id = requireUuid(input.id);
  return writing(async () => {
    const rows = await sql`DELETE FROM home_highlights WHERE id = ${id}::uuid RETURNING id`;
    if (!rows.length) throw E.NotFoundError('Destaque não encontrado.');
    await Logging.logAudit(sql, correlationId, identity.profileId, 'DELETE_HIGHLIGHT', 'home_highlight', id, 'success', null);
    return { success: true, message: 'Destaque removido.' };
  });
}
