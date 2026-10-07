/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/targets.js
 * Lista branca dos destinos que a Lia pode oferecer como botão. É a ÚNICA fonte
 * de ações: nada que venha da IA ou do cliente vira ação sem passar por aqui, e
 * o rótulo que o cliente exibe é sempre o desta lista.
 *
 * Tipos de ação (o front executa só estes três):
 *   navigate         → App.showPanel(target)          (target = id do painel)
 *   open_module      → abre o módulo de estudo         (target = id do módulo)
 *   open_credential  → abre o crachá virtual           (target = 'credential')
 *
 * A Lia nunca altera dados: nenhuma ação aqui inscreve, vota, envia ou apaga.
 * Os ids de painel e de módulo são os do front (frontend/app.js PANEL_LOADERS e
 * frontend/learning.js MODULES); frontend/scripts/assistant.test.mjs confere que
 * a lista do front é igual a ACTION_KEYS.
 */
const LOGGED = ['visitor', 'member', 'admin'];
const MEMBERS = ['member', 'admin'];
const ADMINS = ['admin'];

// [tipo, destino, rótulo, papéis que podem receber]
const TARGET_LIST = [
  ['navigate', 'panel-home', 'Início', LOGGED],
  ['navigate', 'panel-learn', 'Aprender', LOGGED],
  ['navigate', 'panel-events', 'Eventos', LOGGED],
  ['navigate', 'panel-proposals', 'Propostas', LOGGED],
  ['navigate', 'panel-tasks', 'Tarefas', MEMBERS],
  ['navigate', 'panel-orgchart', 'Equipe', MEMBERS],
  ['navigate', 'panel-messages', 'Mensagens', MEMBERS],
  ['navigate', 'panel-profile', 'Meu perfil', LOGGED],
  ['navigate', 'panel-admin-dashboard', 'Painel do administrador', ADMINS],
  ['navigate', 'panel-admin-users', 'Usuários', ADMINS],
  ['navigate', 'panel-admin-events', 'Gerir eventos', ADMINS],
  ['navigate', 'panel-admin-proposals', 'Gerir propostas', ADMINS],
  ['navigate', 'panel-admin-tasks', 'Gerir tarefas', ADMINS],
  ['navigate', 'panel-admin-feedback', 'Feedback', ADMINS],
  ['navigate', 'panel-admin-audit', 'Auditoria', ADMINS],
  ['navigate', 'panel-admin-reports', 'Relatórios', ADMINS],
  ['navigate', 'panel-admin-fiscal', 'Terminal fiscal', ADMINS],
  ['navigate', 'panel-admin-ai', 'Painel de IA', ADMINS],
  ['open_module', 'farmaco', 'Farmacologia Básica', LOGGED],
  ['open_module', 'toxico', 'Toxicologia', LOGGED],
  ['open_module', 'clinica', 'Clínica Virtual', LOGGED],
  ['open_module', 'lab', 'Laboratório Virtual', LOGGED],
  ['open_module', 'anatomia', 'Atlas 3D', LOGGED],
  ['open_credential', 'credential', 'Meu crachá', LOGGED],
];

// Map (não objeto): chaves como "__proto__" ou "constructor" nunca colidem.
const BY_KEY = new Map(TARGET_LIST.map(([type, target, label, roles]) => [type + ':' + target, { type, target, label, roles }]));

export const MAX_ACTIONS = 4;
export const ACTION_KEYS = Array.from(BY_KEY.keys()).sort();

/**
 * Monta uma ação válida para o papel, ou null. Aceita só texto simples: um
 * objeto com toString() esperto não passa. Quem não está logado (papel
 * ausente) não recebe destino nenhum.
 */
export function buildAction(type, target, role) {
  if (typeof type !== 'string' || typeof target !== 'string' || typeof role !== 'string') return null;
  const entry = BY_KEY.get(type + ':' + target);
  if (!entry || !entry.roles.includes(role)) return null;
  return { type: entry.type, target: entry.target, label: entry.label };
}

/** Filtra uma lista de ações candidatas: só as válidas para o papel, sem repetir, no máximo MAX_ACTIONS. */
export function filterActions(candidates, role) {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set();
  const out = [];
  for (const item of candidates) {
    if (out.length >= MAX_ACTIONS) break;
    const action = item && typeof item === 'object' ? buildAction(item.type, item.target, role) : null;
    if (!action) continue;
    const key = action.type + ':' + action.target;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}
