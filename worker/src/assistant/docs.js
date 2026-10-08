/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/docs.js
 * Documentos da base de conhecimento da Lia (RAG). Três fontes, todas SEM dado
 * de pessoa alguma:
 *   - 'kb'        as intenções de assistant/kb.js (uma seção por intenção);
 *   - 'destinos'  as telas e módulos da lista branca de assistant/targets.js;
 *   - 'guia'      documentos markdown embutidos abaixo, divididos por "## ".
 * `buildDocuments()` devolve a lista de trechos {source, section, content} que
 * `ragService.reindex` grava em kb_chunks (idempotente: source + section).
 */
import { INTENTS } from './kb.js';
import { TARGETS } from './targets.js';
import { AI_QUOTAS } from '../constants.js';

const SECTION_MAX = 200;
const CONTENT_MAX = 1200;

const GUIDE_MARKDOWN = [
  {
    source: 'guia',
    markdown: [
      '# Guia da Lia',
      '## O que a Lia faz',
      'A Lia é a guia da plataforma de membros da LAIFT. Ela explica onde fica cada tela e cada módulo de estudo e leva você até lá com um botão. A Lia nunca altera dados: não inscreve em eventos, não vota e não envia mensagens por você.',
      '## Quem pode usar a IA da Lia',
      'Perguntas de rotina (eventos, crachá, módulos) são respondidas sem IA e sem limite diário. Perguntas abertas usam IA e exigem estar logado como membro ou administrador. Membros têm ' + AI_QUOTAS.assistant.member + ' perguntas com IA por dia e administradores ' + AI_QUOTAS.assistant.admin + '. Quando a Lia está em modo limitado, a resposta não gasta essa cota.',
      '## Modo limitado e avisos',
      'Se a busca na base ou a IA estiverem indisponíveis, a Lia avisa que está com acesso limitado e responde só com o que já sabe. Ela nunca finge operar normalmente.',
    ].join('\n'),
  },
  {
    source: 'privacidade',
    markdown: [
      '# Privacidade da Lia',
      '## O que a Lia guarda',
      'Para quem está logado, a Lia guarda a resposta dada, o tema e um código irreversível da pergunta, nunca o texto da pergunta. O prompt enviado à IA não leva nome, e-mail nem outros dados pessoais.',
      '## Feedback sobre as respostas',
      'Você pode marcar uma resposta como útil ou não útil e deixar um comentário. Após 90 dias o comentário é anonimizado (o texto é apagado) e, após 12 meses, o registro é removido. Ao excluir a conta, o feedback e o histórico de respostas saem junto.',
    ].join('\n'),
  },
  {
    source: 'convivencia',
    markdown: [
      '# Convivência com a Lia',
      '## Respeito nas conversas',
      'Mensagens ofensivas à Lia geram um aviso. Reincidências aumentam o nível: alerta, aviso sério e suspensão de 24 horas do chat. Cada 30 dias sem novo incidente reduz um nível.',
      '## Redenção',
      'Quem está com nível acima de zero pode explicar com sinceridade o que houve e pedir redenção. Se aceita, o nível volta a zero na hora; se recusada, é possível tentar de novo após 1 hora.',
    ].join('\n'),
  },
];

/** Divide um markdown em trechos por "## "; o título do "# " vira prefixo do conteúdo. */
export function chunkMarkdown(source, markdown) {
  const lines = String(markdown).split(/\r?\n/);
  let title = '';
  const out = [];
  let section = null;
  let body = [];
  const flush = () => {
    if (section && body.join(' ').trim()) {
      out.push({ source, section: section.slice(0, SECTION_MAX), content: ((title ? title + ' — ' : '') + section + '. ' + body.join(' ').trim()).slice(0, CONTENT_MAX) });
    }
    body = [];
  };
  lines.forEach((line) => {
    if (/^#\s+/.test(line)) title = line.replace(/^#\s+/, '').trim();
    else if (/^##\s+/.test(line)) { flush(); section = line.replace(/^##\s+/, '').trim(); } else if (line.trim()) body.push(line.trim());
  });
  flush();
  return out;
}

function kbChunks() {
  return INTENTS.map((intent) => ({
    source: 'kb',
    section: String(intent.title).slice(0, SECTION_MAX),
    content: (intent.title + '. ' + intent.reply).slice(0, CONTENT_MAX),
  }));
}

function targetChunks() {
  const items = TARGETS.map((t) => '- ' + t.label + (t.type === 'open_module' ? ' (módulo de estudo)' : t.type === 'open_credential' ? ' (crachá virtual)' : ' (tela)'));
  return [{ source: 'destinos', section: 'Telas e módulos que a Lia pode abrir', content: ('Telas e módulos que a Lia pode abrir:\n' + items.join('\n')).slice(0, CONTENT_MAX * 2) }];
}

/** Todos os trechos da base, com (source, section) únicos. */
export function buildDocuments() {
  const all = kbChunks().concat(targetChunks());
  GUIDE_MARKDOWN.forEach((doc) => { chunkMarkdown(doc.source, doc.markdown).forEach((c) => all.push(c)); });
  const seen = new Set();
  return all.filter((c) => {
    const key = c.source + '|' + c.section;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
